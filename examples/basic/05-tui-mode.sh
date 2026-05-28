#!/bin/bash

# 示例 5: TUI 模式

echo "========================================="
echo "示例 5: TUI 交互模式"
echo "========================================="
echo ""

PROJECT_DIR="${1:-./sample-project}"

echo "启动交互式 TUI 模式..."
echo ""
echo "在 TUI 中你可以："
echo "  - 连续对话，保持上下文"
echo "  - 使用 @file 附加文件"
echo "  - 使用 !command 执行命令"
echo "  - 使用 /tab 切换 agent"
echo "  - 使用 /tools 切换工具集"
echo ""
echo "按 Ctrl+C 退出"
echo ""

# 启动 TUI
code-agent tui --project "$PROJECT_DIR"
