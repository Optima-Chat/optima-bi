#!/bin/bash

# 停止所有服务

echo "🛑 停止 Optima BI 基础设施..."

docker compose down

echo "✅ 服务已停止"
echo ""
echo "💡 如需删除所有数据，运行："
echo "   docker compose down -v"
