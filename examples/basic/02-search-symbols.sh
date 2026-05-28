#!/bin/bash

# 示例 2: 搜索符号

echo "========================================="
echo "示例 2: 搜索符号"
echo "========================================="
echo ""

PROJECT_DIR="${1:-./sample-project}"

echo "1. 搜索类"
echo "---"
code-agent search "UserService" --project "$PROJECT_DIR"

echo ""
echo "2. 搜索函数"
echo "---"
code-agent search "calculateScore" --project "$PROJECT_DIR"

echo ""
echo "3. 查看符号详情"
echo "---"
code-agent node "UserService" --project "$PROJECT_DIR"

echo ""
echo "✓ 搜索完成！"
