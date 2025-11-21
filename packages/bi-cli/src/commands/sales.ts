import { Command } from 'commander';
import axios from 'axios';
import { getConfig } from '../config';
import { outputJson, outputPretty, error, OutputFormat } from '../utils/output';

interface SalesSummary {
  total_revenue: number;
  total_orders: number;
  avg_order_value: number;
  unique_customers: number;
}

interface DailySales {
  merchant_id: string;
  date: string;
  total_revenue: number;
  order_count: number;
  avg_order_value: number;
  unique_customers: number;
}

interface SalesResponse {
  success: boolean;
  data: {
    summary: SalesSummary;
    daily: DailySales[];
  };
  meta: {
    cached: boolean;
    days: number;
    query_time_ms?: number;
  };
}

export function createSalesCommand(): Command {
  const sales = new Command('sales').description('Sales analytics');

  // sales get
  sales
    .command('get')
    .description('Get sales data')
    .option('--days <number>', 'Number of days to fetch', '7')
    .option('--pretty', 'Output in pretty table format (default: JSON)')
    .action(async (options) => {
      const cfg = getConfig();

      if (!cfg.accessToken) {
        error('Not logged in. Run: bi-cli auth login');
        process.exit(1);
      }

      const days = parseInt(options.days, 10);
      if (isNaN(days) || days < 1 || days > 365) {
        error('Days must be a number between 1 and 365');
        process.exit(1);
      }

      const format = options.pretty ? OutputFormat.PRETTY : OutputFormat.JSON;

      try {
        const response = await axios.get<SalesResponse>(`${cfg.backendUrl}/api/v1/sales`, {
          params: { days },
          headers: {
            Authorization: `Bearer ${cfg.accessToken}`,
          },
        });

        if (!response.data.success) {
          error('Failed to fetch sales data');
          process.exit(1);
        }

        const { summary, daily } = response.data.data;

        if (format === OutputFormat.JSON) {
          outputJson(response.data.data);
        } else {
          // Pretty format with tables
          console.log('\n📊 Sales Summary\n');
          outputPretty({
            'Total Revenue': `¥${summary.total_revenue.toFixed(2)}`,
            'Total Orders': summary.total_orders,
            'Average Order Value': `¥${summary.avg_order_value.toFixed(2)}`,
            'Unique Customers': summary.unique_customers,
          });

          if (daily.length > 0) {
            console.log('\n📅 Daily Breakdown\n');
            outputPretty(
              daily.map((d) => ({
                Date: d.date,
                Revenue: `¥${Number(d.total_revenue).toFixed(2)}`,
                Orders: d.order_count,
                AOV: `¥${Number(d.avg_order_value).toFixed(2)}`,
                Customers: d.unique_customers,
              })),
              ['Date', 'Revenue', 'Orders', 'AOV', 'Customers']
            );
          }

          // Show metadata
          if (response.data.meta.cached) {
            console.log('ℹ️  Data from cache');
          } else if (response.data.meta.query_time_ms) {
            console.log(`⏱️  Query time: ${response.data.meta.query_time_ms}ms`);
          }
        }
      } catch (err: unknown) {
        const axiosError = err as {
          response?: { status?: number; data?: { error?: { message?: string } } };
        };
        const errorObj = err as Error;
        if (axiosError.response?.status === 401) {
          error('Authentication failed. Please login again: bi-cli auth login');
        } else if (axiosError.response?.data?.error) {
          error(`Error: ${axiosError.response.data.error.message}`);
        } else {
          error(`Failed to fetch sales data: ${errorObj.message || 'Unknown error'}`);
        }
        process.exit(1);
      }
    });

  return sales;
}
