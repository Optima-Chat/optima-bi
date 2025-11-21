#!/bin/bash

# 检查 Debezium 连接器状态

echo "=== Debezium Connector 列表 ==="
curl -s http://localhost:8083/connectors | jq

echo ""
echo "=== postgres-commerce-connector 状态 ==="
curl -s http://localhost:8083/connectors/postgres-commerce-connector/status | jq

echo ""
echo "=== Kafka Topics ==="
docker exec optima-bi-kafka kafka-topics --list --bootstrap-server localhost:9092
