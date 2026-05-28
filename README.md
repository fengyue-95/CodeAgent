# CodeAgent

> 智能代码分析和自动化开发工具

CodeAgent 是一个基于 AI 的代码助手，提供代码图谱分析、智能代码审查、自动化重构、测试生成、文档生成和问题诊断等功能。

## ✨ 核心特性

- 🔍 **代码图谱** - 基于 Tree-sitter 的深度代码分析
- 🤖 **10 个专业 Agent** - 针对不同任务优化的 AI 助手
- 📊 **依赖分析** - 可视化依赖关系和影响分析
- 🔧 **MCP 集成** - 支持 Model Context Protocol
- 💬 **交互式 TUI** - 强大的终端用户界面
- 🛠️ **工具模式** - 灵活的权限控制（core/full）

## 🚀 快速开始

### 安装

```bash
cd /Users/fengyue/PycharmProjects/CodeAgent
npm install --cache .npm-cache
npm run build
```

### 配置 API Key

```bash
mkdir -p ~/.code-agent
printf 'DEEPSEEK_API_KEY=你的key\n' > ~/.code-agent/.env
```

### 基本使用

```bash
# 索引项目
code-agent index

# 查看统计
code-agent stats

# 运行任务
code-agent run "查看礼品卡的设计"

# 进入交互模式
code-agent
```

## 🤖 Agent 模式

CodeAgent 提供 **10 个专业化 Agent**，每个针对特定任务优化：

### 核心 Agent (5个)

| Agent | 用途 | 权限 | 步骤 |
|-------|------|------|------|
| **build** | 默认开发模式 | 读写执行 | 100 |
| **plan** | 只读规划 | 只读 | 100 |
| **general** | 通用多步骤任务 | 全权限 | 100 |
| **explore** | 快速代码库探索 | 只读 | 50 |
| **scout** | 外部文档研究 | 只读+Web | 50 |

### 专业 Agent (5个) ⭐

| Agent | 用途 | 权限 | 步骤 |
|-------|------|------|------|
| **review** 🔍 | 代码审查专家 | 只读+图谱 | 50 |
| **refactor** ♻️ | 代码重构专家 | 读写需确认 | 100 |
| **test** 🧪 | 测试生成专家 | 可写测试 | 80 |
| **doc** 📚 | 文档生成专家 | 可写文档 | 60 |
| **debug** 🐛 | 问题诊断专家 | 读+修复需确认 | 70 |

### 快速选择指南

```bash
# 代码审查
code-agent run "审查 src/user/service.ts" --agent review

# 代码重构
code-agent run "重构 UserService.authenticate" --agent refactor

# 生成测试
code-agent run "为 AuthService 生成测试" --agent test

# 生成文档
code-agent run "为 AuthService 生成 API 文档" --agent doc

# 问题诊断
code-agent run "诊断登录失败错误" --agent debug

# 实现功能
code-agent run "实现用户认证" --agent build --tools full

# 规划方案
code-agent run "规划认证功能实现" --agent plan

# 理解代码
code-agent run "探索支付模块实现" --agent explore

# 调研技术
code-agent run "调研 Redis 缓存方案" --agent scout
```

### 完整工作流示例

#### 新功能开发

```bash
# 1. 规划
code-agent run "规划用户认证功能" --agent plan

# 2. 实现
code-agent run "实现用户认证" --agent build --tools full

# 3. 审查
code-agent run "审查认证代码" --agent review

# 4. 生成测试
code-agent run "为 AuthService 生成测试" --agent test

# 5. 生成文档
code-agent run "为 AuthService 生成文档" --agent doc
```

#### Bug 修复

```bash
# 1. 诊断
code-agent run "诊断登录失败错误" --agent debug

# 2. 修复
code-agent run "修复空指针问题" --agent build --tools full

# 3. 添加测试
code-agent run "添加回归测试" --agent test

# 4. 审查
code-agent run "审查修复代码" --agent review
```

#### 代码质量提升

```bash
# 1. 审查
code-agent run "审查 src/user/ 代码质量" --agent review

# 2. 重构
code-agent run "重构复杂方法" --agent refactor

# 3. 提高覆盖率
code-agent run "提高测试覆盖率" --agent test

# 4. 更新文档
code-agent run "更新文档" --agent doc
```

## 💬 TUI 交互模式

直接运行 `code-agent` 进入交互式终端 UI：

```bash
code-agent
# 或
code-agent tui
code-agent tui --continue
code-agent tui --agent review
```

### 在 TUI 中切换 Agent

#### 方式 1: 使用命令

```bash
/agent review      # 切换到 review agent
/agent refactor    # 切换到 refactor agent
/agent test        # 切换到 test agent
/agent doc         # 切换到 doc agent
/agent debug       # 切换到 debug agent
/agent             # 查看当前 agent
```

#### 方式 2: Tab 键循环

在空提示符下按 **Tab** 键循环切换：
```
build → plan → general → explore → scout → review → refactor → test → doc → debug → build ...
```

### TUI 常用命令

```text
/help                    查看帮助
/agent <name>            切换 agent
/tab                     循环切换 agent
/tools core|full         切换工具集
/model <name>            切换模型
/max-steps <n>           设置最大步骤
/details                 切换详细输出
/new [title]             新建会话
/sessions                查看并切换会话
/undo                    撤销最近一轮
/redo                    重做撤销的对话
/share                   导出会话到 markdown
/init                    创建 AGENTS.md
/exit                    退出
```

### 输入辅助

```text
@file                    弹出文件搜索
@file:GiftCard           模糊查找文件
@src/path/file.ts        附加文件内容
!npm test                执行 shell 命令并附加输出
Tab (空提示符)           循环切换 agent
```

### TUI 使用示例

```bash
# 启动 TUI
code-agent

# 在 TUI 中：
code-agent build/core > /agent review
code-agent review/core > 审查 src/user/service.ts

code-agent review/core > /agent refactor
code-agent refactor/core > 重构 UserService.authenticate

code-agent refactor/core > /agent test
code-agent test/core > 为 AuthService 生成测试

code-agent test/core > /agent doc
code-agent doc/core > 为 AuthService 生成文档

code-agent doc/core > /exit
```

## 🛠️ run 命令

执行单次任务：

```bash
code-agent run "查看礼品卡的设计"
code-agent run "审查 src/user/service.ts" --agent review
code-agent run "修复测试失败" --agent build --tools full
```

### 工具模式

**core 模式**（默认）- 只读工具集：
- `glob`, `grep`, `read`, `gitDiff`
- 代码图谱查询（search, node, callers, callees, refs, context）

**full 模式** - 完整工具集：
- 包含 core 所有工具
- 编辑和写入（edit, write, applyPatch）
- Shell 执行（shell）
- Web 访问（webFetch, webSearch, browser）
- 子任务（todo, subagent）

### 常用参数

```bash
--agent <name>              Agent 模式（10 个可选）
--tools <core|full>         工具集，默认 core
--model <model>             模型覆盖
--max-steps <n>             最大步骤数
--temperature <n>           采样温度
--session <id>              继续指定会话
--continue                  继续最近的会话
--cwd, --project <path>     指定项目目录
```

### 使用示例

```bash
# 只读分析（core 模式）
code-agent run "分析礼品卡设计" --agent explore

# 代码审查（只读）
code-agent run "审查 src/user/" --agent review

# 修改代码（需要 full 模式）
code-agent run "修复 bug" --agent build --tools full

# 生成测试（可写测试文件）
code-agent run "为 AuthService 生成测试" --agent test

# 继续会话
code-agent run "继续分析" --continue
```

## 📋 索引和查询

### 构建索引

```bash
code-agent index                    # 索引当前项目
code-agent index /path/to/project   # 索引指定项目
code-agent sync                     # 增量同步
code-agent stats                    # 查看统计
```

### 查询命令

```bash
# 搜索符号
code-agent search GiftCard

# 查看符号详情
code-agent node GiftCardService

# 构建上下文
code-agent context GiftCardService

# 查看关系
code-agent callers GiftCardService      # 谁调用了它
code-agent callees createGiftCard       # 它调用了谁
code-agent refs GiftCardService         # 所有引用

# 查看未解析引用
code-agent unresolved --limit 10
```

### 自动同步

```bash
# 监听文件变化
code-agent watch
code-agent watch --verbose

# Git hooks
code-agent git hook install         # 安装 hooks
code-agent git hook status          # 查看状态
code-agent git hook remove          # 移除 hooks
```

## 🔒 权限审批

### 工具模式对比

**core 模式**（默认）：
- 只读工具，通常不需要确认
- 适合代码分析、审查、探索

**full 模式**：
- 包含编辑、写入、shell、web 等能力
- 危险操作会暂停询问用户

### 权限确认示例

使用 `--tools full` 时，遇到需要确认的操作：

```text
Permission required:
  Tool: shell
  Permission: workspace.shell
  Pattern: npm test
  Input: {"command": "npm test"}
Approve? [y/N]
```

输入 `y` 或 `yes` 批准，其它输入默认拒绝。

## 🔧 会话管理

默认每次 `run` 创建新会话。连续提问时：

```bash
# 创建会话
code-agent session new --title "gift card investigation"

# 继续会话
code-agent run "查看礼品卡设计" --continue
code-agent run "继续看扣减和退款链路" --continue

# 或指定会话 ID
code-agent session list
code-agent run "继续这个会话" --session ses_xxx
```

## ⚙️ 环境要求

- Node.js 20 或更高版本
- npm
- DeepSeek API Key

## 📦 安装和构建

```bash
cd /Users/fengyue/PycharmProjects/CodeAgent
npm install --cache .npm-cache
npm run build
```

如果遇到 `better-sqlite3` 的 Node 版本 ABI 不匹配：

```bash
npm rebuild better-sqlite3 --cache .npm-cache
npm run build
```

## 🔑 配置 API Key

推荐放到用户目录：

```bash
mkdir -p ~/.code-agent
printf 'DEEPSEEK_API_KEY=你的key\n' > ~/.code-agent/.env
```

也可以临时用环境变量：

```bash
export DEEPSEEK_API_KEY=你的key
```

CodeAgent 会按顺序读取：
1. `~/.code-agent/.env`
2. `~/.config/code-agent/.env`
3. 目标项目 `.env`
4. 当前执行目录 `.env`

## 🌐 配置全局命令

```bash
mkdir -p ~/.local/bin
ln -sf /Users/fengyue/PycharmProjects/CodeAgent/dist/bin/code-agent.js ~/.local/bin/code-agent
chmod +x /Users/fengyue/PycharmProjects/CodeAgent/dist/bin/code-agent.js
```

确保 `~/.local/bin` 在 `PATH` 中：

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
rehash
```

验证：

```bash
which code-agent
code-agent --help
```

## 🎯 全局选项

所有命令都支持以下选项：

```bash
--verbose       # 启用详细输出
--debug         # 启用调试输出
--quiet         # 静默模式，只显示错误
--no-color      # 禁用彩色输出
--log-file PATH # 将日志写入文件
```

示例：

```bash
code-agent index --verbose
code-agent run "任务" --debug
code-agent sync --quiet
code-agent index --log-file index.log
```

## 🧪 测试

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch

# 生成覆盖率报告
npm run test:coverage

# 打开测试 UI
npm run test:ui
```

## 📚 文档

### 核心文档

- [架构设计](docs/architecture.md) - 系统架构、模块设计、数据流
- [Agent 设计](docs/AGENT_DESIGN.md) - 10 个 Agent 的完整设计
- [图谱模型](docs/graph-schema.md) - 代码图谱数据模型和查询
- [工具开发](docs/tool-development.md) - 自定义工具开发指南
- [贡献指南](CONTRIBUTING.md) - 如何为项目做贡献

### Agent 文档

- [Review Agent](docs/REVIEW_AGENT.md) - 代码审查专家使用指南
- [Refactor Agent](docs/REFACTOR_AGENT.md) - 代码重构专家使用指南
- [Test Agent](docs/TEST_AGENT.md) - 测试生成专家使用指南
- [最终总结](docs/FINAL_SUMMARY.md) - 所有 Agent 实现总结

### 测试文档

- [测试指南](docs/testing.md) - 完整的测试文档和最佳实践
- [测试状态](docs/testing-status.md) - 当前测试状态和计划
- [完成报告](docs/testing-complete.md) - 测试基础设施完成报告

### 示例和教程

- [使用示例](examples/README.md) - 11 个详细使用场景
- [基础示例](examples/basic/README.md) - 可执行的基础示例脚本

### 快速开始

```bash
# 运行基础示例
cd examples/basic
./run-all.sh

# 或单独运行
./01-index-project.sh
./02-search-symbols.sh
./03-query-relationships.sh
./04-use-agent.sh
./05-tui-mode.sh
```

## 🛠️ 开发验证

```bash
npm run check
npm run build
node dist/bin/code-agent.js --help
```

## 📖 帮助

```bash
code-agent --help
code-agent run --help
code-agent tui --help
```

## 🙏 致谢

感谢 [OpenCode](https://github.com/anomalyco/opencode) 项目提供的优秀架构设计和实现参考。

## 📄 许可证

MIT
