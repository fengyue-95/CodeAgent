#!/bin/bash

# 运行所有基础示例

echo "========================================="
echo "CodeAgent 基础示例"
echo "========================================="
echo ""

# 检查 code-agent 是否安装
if ! command -v code-agent &> /dev/null; then
    echo "错误: code-agent 未安装或不在 PATH 中"
    echo ""
    echo "请先安装 CodeAgent:"
    echo "  cd /path/to/CodeAgent"
    echo "  npm install"
    echo "  npm run build"
    echo "  npm link"
    exit 1
fi

# 检查示例项目
if [ ! -d "./sample-project" ]; then
    echo "警告: 示例项目不存在"
    echo "将使用当前目录作为示例项目"
    echo ""
fi

PROJECT_DIR="${1:-./sample-project}"

echo "使用项目: $PROJECT_DIR"
echo ""

# 运行示例
./01-index-project.sh "$PROJECT_DIR"
echo ""

./02-search-symbols.sh "$PROJECT_DIR"
echo ""

./03-query-relationships.sh "$PROJECT_DIR"
echo ""

./04-use-agent.sh "$PROJECT_DIR"
echo ""

echo "========================================="
echo "所有示例运行完成！"
echo "========================================="
echo ""
echo "下一步:"
echo "  - 运行 ./05-tui-mode.sh 体验交互模式"
echo "  - 查看 ../README.md 了解更多示例"
echo "  - 阅读 ../../docs/ 了解详细文档"
