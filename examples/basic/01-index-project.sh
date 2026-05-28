#!/bin/bash

# 示例 1: 索引项目

echo "========================================="
echo "示例 1: 索引项目"
echo "========================================="
echo ""

# 假设我们在一个项目目录中
PROJECT_DIR="${1:-./sample-project}"

echo "索引项目: $PROJECT_DIR"
echo ""

# 执行索引
code-agent index "$PROJECT_DIR"

echo ""
echo "查看索引统计:"
code-agent stats --project "$PROJECT_DIR"

echo ""
echo "✓ 索引完成！"
echo ""
echo "提示："
echo "  - 使用 'code-agent stats' 查看统计信息"
echo "  - 使用 'code-agent search <query>' 搜索符号"
echo "  - 使用 'code-agent sync' 增量同步变更"
