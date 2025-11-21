#!/bin/bash

# Optima BI 基础设施启动脚本

set -e

echo "🚀 启动 Optima BI 基础设施..."
echo ""

# 1. 启动所有服务
echo "📦 启动 Docker Compose 服务..."
docker compose up -d

echo ""
echo "⏳ 等待服务启动（60秒）..."
sleep 60

# 2. 检查服务状态
echo ""
echo "✅ 检查服务状态..."
docker compose ps

# 3. 注册 Debezium 连接器
echo ""
echo "📡 注册 Debezium CDC 连接器..."
bash ./infrastructure/debezium/register-connector.sh

# 4. 等待数据同步
echo ""
echo "⏳ 等待 CDC 初始快照完成（30秒）..."
sleep 30

# 5. 验证数据同步
echo ""
echo "🔍 验证数据同步..."
bash ./scripts/verify.sh

echo ""
echo "✅ Optima BI 基础设施启动完成！"
echo ""
echo "📊 访问地址："
echo "  - Kafka UI:        http://localhost:7286"
echo "  - ClickHouse:      http://localhost:7281"
echo "  - Debezium API:    http://localhost:7287"
echo "  - PostgreSQL:      localhost:7280"
echo "  - Redis:           localhost:7288"
echo ""
echo "📚 查看日志："
echo "  docker compose logs -f"
