#!/bin/bash

# 示例 3: 查询关系

echo "========================================="
echo "示例 3: 查询关系"
echo "========================================="
echo ""

PROJECT_DIR="${1:-./sample-project}"

echo "1. 查找调用者 (谁调用了这个函数)"
echo "---"
code-agent callers "calculateScore" --project "$PROJECT_DIR"

echo ""
echo "2. 查找被调用者 (这个函数调用了谁)"
echo "---"
code-agent callees "UserService.getUser" --project "$PROJECT_DIR"

echo ""
echo "3. 查找引用"
echo "---"
code-agent refs "UserService" --project "$PROJECT_DIR"

echo ""
echo "4. 构建上下文"
echo "---"
code-agent context "UserService" --project "$PROJECT_DIR"

echo ""
echo "✓ 查询完成！"
