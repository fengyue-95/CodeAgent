#!/bin/bash

# 示例 4: 使用 Agent

echo "========================================="
echo "示例 4: 使用 Agent"
echo "========================================="
echo ""

PROJECT_DIR="${1:-./sample-project}"

echo "1. 代码理解 (只读模式)"
echo "---"
code-agent run "解释一下 UserService 的设计和职责" \
  --project "$PROJECT_DIR" \
  --agent build \
  --tools core

echo ""
echo "2. 代码分析 (plan 模式)"
echo "---"
code-agent run "分析 UserService 和 OrderService 的公共代码" \
  --project "$PROJECT_DIR" \
  --agent plan

echo ""
echo "3. 代码修改 (完整工具集)"
echo "---"
echo "注意: 这会修改代码，请在测试项目中运行"
echo ""
# code-agent run "将 getUserById 重命名为 findUserById" \
#   --project "$PROJECT_DIR" \
#   --tools full

echo ""
echo "✓ Agent 示例完成！"
echo ""
echo "提示："
echo "  - 使用 --tools core 进行只读分析"
echo "  - 使用 --tools full 允许修改代码"
echo "  - 使用 --agent plan 进行规划和分析"
echo "  - 使用 --agent build 进行实际开发"
