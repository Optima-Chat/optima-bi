#!/bin/bash

# Debezium Connector 注册脚本
# 等待 Debezium Connect 启动后注册 PostgreSQL CDC 连接器

set -e

echo "等待 Debezium Connect 启动..."

# 健康检查：循环等待直到 Debezium Connect 就绪
MAX_RETRIES=30
RETRY_INTERVAL=5
retry_count=0

while [ $retry_count -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:7287/ > /dev/null 2>&1; then
        echo "✅ Debezium Connect 已就绪"
        break
    fi

    retry_count=$((retry_count + 1))
    echo "⏳ 等待 Debezium Connect 启动... ($retry_count/$MAX_RETRIES)"
    sleep $RETRY_INTERVAL
done

if [ $retry_count -eq $MAX_RETRIES ]; then
    echo "❌ Debezium Connect 启动超时"
    exit 1
fi

echo ""
echo "注册 PostgreSQL CDC 连接器..."

curl -i -X POST \
  http://localhost:7287/connectors/ \
  -H "Content-Type: application/json" \
  -d '{
  "name": "postgres-commerce-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "plugin.name": "pgoutput",
    "database.hostname": "postgres",
    "database.port": "5432",
    "database.user": "debezium_user",
    "database.password": "debezium_password",
    "database.dbname": "commerce",
    "database.server.name": "postgres",
    "table.include.list": "public.merchants,public.products,public.customers,public.orders,public.order_items",
    "publication.name": "dbz_publication",
    "slot.name": "debezium_slot",
    "publication.autocreate.mode": "filtered",
    "topic.prefix": "postgres",
    "key.converter": "org.apache.kafka.connect.json.JsonConverter",
    "value.converter": "org.apache.kafka.connect.json.JsonConverter",
    "key.converter.schemas.enable": "false",
    "value.converter.schemas.enable": "false",
    "transforms": "unwrap",
    "transforms.unwrap.type": "io.debezium.transforms.ExtractNewRecordState",
    "transforms.unwrap.drop.tombstones": "false",
    "transforms.unwrap.delete.handling.mode": "rewrite",
    "transforms.unwrap.add.fields": "op,source.ts_ms",
    "snapshot.mode": "initial",
    "decimal.handling.mode": "string",
    "time.precision.mode": "adaptive"
  }
}'

echo ""
echo "连接器注册完成！"
echo ""
echo "查看连接器状态："
echo "curl http://localhost:7287/connectors/postgres-commerce-connector/status | jq"
