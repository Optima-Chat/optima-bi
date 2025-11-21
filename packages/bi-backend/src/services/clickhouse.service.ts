import { createClient, ClickHouseClient } from '@clickhouse/client';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('clickhouse');

let client: ClickHouseClient | null = null;

export function getClickHouseClient(): ClickHouseClient {
  if (!client) {
    // Parse URL to extract host and port
    const url = new URL(config.clickhouse.url);
    const host = url.hostname;
    const port = Number(url.port) || 8123;

    logger.info(
      {
        url: config.clickhouse.url,
        host,
        port,
        username: config.clickhouse.username,
        database: config.clickhouse.database,
      },
      'Creating ClickHouse client with config'
    );

    client = createClient({
      host: `${url.protocol}//${host}:${port}`,
      username: config.clickhouse.username,
      password: config.clickhouse.password,
      database: config.clickhouse.database,
      clickhouse_settings: {
        // Enable more detailed error messages
        send_logs_level: 'trace',
      },
    });

    logger.info('ClickHouse client initialized');
  }

  return client;
}

export interface DailySalesRow {
  merchant_id: string;
  date: string;
  total_revenue: number;
  order_count: number;
  avg_order_value: number;
  unique_customers: number;
}

export async function getDailySales(merchantId: string, days: number): Promise<DailySalesRow[]> {
  const client = getClickHouseClient();

  const query = `
    SELECT
      merchant_id,
      date,
      sumMerge(total_revenue) as total_revenue,
      countMerge(order_count) as order_count,
      avgMerge(avg_order_value) as avg_order_value,
      uniqMerge(unique_customers) as unique_customers
    FROM bi.daily_sales_mv
    WHERE merchant_id = {merchantId:UUID}
      AND date >= today() - {days:UInt32}
    GROUP BY merchant_id, date
    ORDER BY date DESC
  `;

  const result = await client.query({
    query,
    query_params: {
      merchantId,
      days,
    },
    format: 'JSONEachRow',
  });

  const data = await result.json<DailySalesRow>();

  logger.info({
    msg: 'Query executed',
    merchantId,
    days,
    rowCount: data.length,
  });

  return data;
}

export async function testConnection(): Promise<boolean> {
  try {
    const client = getClickHouseClient();
    const result = await client.query({
      query: 'SELECT 1 as ping',
      format: 'JSONEachRow',
    });

    const data = await result.json();
    return data.length > 0;
  } catch (err) {
    logger.error({ err }, 'ClickHouse connection test failed');
    return false;
  }
}
