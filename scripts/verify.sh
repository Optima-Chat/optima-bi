#!/bin/bash

# 验证数据同步脚本

set -e

echo "🔍 验证 PostgreSQL → ClickHouse 数据同步..."
echo ""

# 1. 检查 PostgreSQL 数据
echo "=== PostgreSQL 数据统计 ==="
docker exec optima-bi-postgres psql -U commerce_user -d commerce -c "
SELECT
    'merchants' as table_name, COUNT(*) as count FROM merchants
UNION ALL
SELECT 'products', COUNT(*) FROM products
UNION ALL
SELECT 'customers', COUNT(*) FROM customers
UNION ALL
SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'order_items', COUNT(*) FROM order_items;
"

echo ""
echo "=== ClickHouse 数据统计 ==="

# 2. 检查 ClickHouse 数据
docker exec optima-bi-clickhouse clickhouse-client --user bi_user --password bi_password --query "
SELECT 'merchants' as table_name, count() as count FROM bi.merchants
UNION ALL
SELECT 'products', count() FROM bi.products
UNION ALL
SELECT 'customers', count() FROM bi.customers
UNION ALL
SELECT 'orders', count() FROM bi.orders
UNION ALL
SELECT 'order_items', count() FROM bi.order_items
FORMAT PrettyCompact;
"

echo ""
echo "=== 物化视图数据统计 ==="

docker exec optima-bi-clickhouse clickhouse-client --user bi_user --password bi_password --query "
SELECT
    merchant_id,
    date,
    sumMerge(total_revenue) as revenue,
    countMerge(order_count) as orders,
    avgMerge(avg_order_value) as aov,
    uniqMerge(unique_customers) as customers
FROM bi.daily_sales_mv
GROUP BY merchant_id, date
ORDER BY merchant_id, date DESC
LIMIT 10
FORMAT PrettyCompact;
"

echo ""
echo "=== Debezium 连接器状态 ==="
curl -s http://localhost:8083/connectors/postgres-commerce-connector/status | jq '.connector.state, .tasks[0].state'

echo ""
echo "=== Kafka Topics 消息数量 ==="
docker exec optima-bi-kafka kafka-run-class kafka.tools.GetOffsetShell \
  --broker-list localhost:9092 \
  --topic postgres.public.orders \
  --time -1 | awk -F ":" '{sum += $3} END {print "orders: " sum}'

docker exec optima-bi-kafka kafka-run-class kafka.tools.GetOffsetShell \
  --broker-list localhost:9092 \
  --topic postgres.public.order_items \
  --time -1 | awk -F ":" '{sum += $3} END {print "order_items: " sum}'

echo ""
echo "✅ 数据同步验证完成！"
echo ""
echo "💡 如果 ClickHouse 数据为 0，请等待几分钟后重新运行此脚本"
echo "   Kafka 消费和物化视图更新需要一些时间"
