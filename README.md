# CodeAgent

> 智能代码分析和自动化开发工具

CodeAgent 是一个基于 AI 的代码助手，提供代码图谱分析、智能代码审查、自动化重构、测试生成、文档生成和问题诊断等功能。

## ✨ 核心特性

- 🔍 **代码图谱** - 基于 Tree-sitter 的深度代码分析
- 🤖 **2 个主模式 + 8 个 subagent** - 主会话保持简单，专项任务由模型自动分派
- 📊 **依赖分析** - 可视化依赖关系和影响分析
- 🔧 **MCP 插拔系统** - 动态加载/卸载 MCP 服务，扩展工具能力
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

默认情况下，模型输出语言会跟随本次任务输入语言；例如你用中文提问就默认中文回复，用英文提问就默认英文回复，除非任务里明确指定其它语言。

## 🤖 Agent 模式

CodeAgent 采用 **2 个主模式 + 多个 subagent** 的结构：

- **主模式（primary）**：用户直接驾驶的长期会话模式，目前只有 `build` 和 `plan`
- **subagent**：由主模型通过 `task` 工具按需调度的专项 agent，例如探索代码、审查风险、诊断问题、生成测试等

这种设计让 TUI 保持简单：你只需要在 `build` 和 `plan` 之间切换；复杂任务由模型自行拆分并调用合适的 subagent。

### 主模式 Agent

| Agent | 用途 | 权限 | 步骤 |
|-------|------|------|------|
| **build** | 默认开发模式，执行修改并进行验证闭环 | 读写执行 | 200 |
| **plan** | 只读规划 | 只读 | 200 |

### Subagent

| Agent | 用途 | 权限 | 步骤 |
|-------|------|------|------|
| **general** | 通用多步骤调查 | 全权限 | 200 |
| **explore** | 快速代码库探索 | 只读 | 200 |
| **scout** | 外部文档和依赖研究 | 只读+Web | 200 |
| **review** | 代码审查、风险分析 | 只读+诊断 shell 需确认 | 200 |
| **refactor** | 重构分析和执行 | 读写需确认 | 200 |
| **test** | 测试规划/生成 | 可写测试 | 200 |
| **doc** | 文档生成和整理 | 可写文档 | 200 |
| **debug** | 问题诊断和根因分析 | 读+诊断 shell | 200 |

### Subagent 调度

subagent 不是 TUI 主模式，不通过 `/tab` 手动切换。主 agent 会在需要时调用 `task` 工具调度它们：

- `explore`：找文件、搜符号、理解模块结构
- `scout`：查外部文档、依赖源码、官方示例
- `review`：审查 diff/模块，输出 bug、风险和缺失测试
- `debug`：复现问题、运行诊断命令、定位根因
- `test`：规划或生成测试
- `doc`：生成 README、接口文档、设计说明
- `refactor`：分析和执行局部重构
- `general`：宽泛的多步骤调查

示例：

```bash
# 实现功能时，build 可自行调用 review/test/doc/debug 等 subagent
code-agent run "实现用户认证" --agent build --tools full

# 规划方案时，plan 可进行只读分析
code-agent run "规划认证功能实现" --agent plan
```

build 模式在修改代码后会尽量运行最相关的编译、类型检查或测试命令；如果验证失败，会根据错误输出继续做最小修复并再次验证。若无法验证或验证仍未通过，它会明确说明剩余风险，而不是直接宣称完成。

### 完整工作流示例

#### 新功能开发

```bash
# 1. 规划
code-agent run "规划用户认证功能" --agent plan

# 2. 实现；模型可按需调用 review/test/doc/debug subagent
code-agent run "实现用户认证" --agent build --tools full
```

#### Bug 修复

```bash
# build 会先诊断，再修复；需要时可调用 debug/test/review subagent
code-agent run "修复空指针问题" --agent build --tools full
```

#### 代码质量提升

```bash
# build 可调度 review/refactor/test/doc subagent 完成分工
code-agent run "提升 src/user/ 代码质量，包含审查、重构建议、测试和文档更新" --agent build --tools full
```

## 💬 TUI 交互模式

直接运行 `code-agent` 进入交互式终端 UI：

```bash
code-agent
# 或
code-agent tui
code-agent tui --continue
code-agent tui --agent plan
```

### 在 TUI 中切换主模式

#### 方式 1: 使用命令

```bash
/agent build       # 切换到 build 主模式
/agent plan        # 切换到 plan 主模式
/agent             # 查看当前 agent
```

#### 方式 2: Tab 键循环

在空提示符下按 **Tab** 键循环切换：
```
build → plan → build ...
```

### TUI 常用命令

```text
/help                    查看帮助
/agent <name>            切换主模式（build/plan）
/tab                     在 build/plan 间循环切换
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
Tab (空提示符)           在 build/plan 间循环切换
```

### TUI 使用示例

```bash
# 启动 TUI
code-agent

# 在 TUI 中：
code-agent build/core > 实现用户认证，并在完成后审查风险、补充测试和文档
code-agent build/core > /agent plan
code-agent plan/core > 分析支付模块结构并给出实施计划
code-agent plan/core > /exit
```

## 🛠️ run 命令

执行单次任务：

```bash
code-agent run "查看礼品卡的设计"
code-agent run "修复测试失败" --agent build --tools full
```

## 🔌 MCP 插拔系统

CodeAgent 支持动态加载和管理 MCP (Model Context Protocol) 服务，让 Agent 可以访问外部工具和数据源。

### 配置 MCP 服务

编辑 `~/.code-agent/mcp-config.json`：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed"],
      "enabled": true
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      },
      "enabled": false
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"],
      "enabled": true
    }
  }
}
```

### MCP 管理命令

```bash
# 列出所有 MCP 服务
code-agent mcp list

# 查看服务状态
code-agent mcp status
code-agent mcp status github

# 启用/禁用服务
code-agent mcp enable github
code-agent mcp disable github

# 测试连接
code-agent mcp test github
```

### 使用 MCP 工具

MCP 服务启用后，其工具会自动注册到 Agent 中：

```bash
# 使用 GitHub MCP 创建 issue
code-agent run "在 myrepo 创建一个 bug issue" --tools full

# 使用 Postgres MCP 查询数据库
code-agent run "查询 users 表中的活跃用户" --tools full

# 使用 Filesystem MCP 读取文件
code-agent run "读取 /data/config.json 的内容" --tools full
```

### 常用 MCP 服务

| 服务 | 功能 | 安装命令 |
|------|------|----------|
| **filesystem** | 文件系统访问 | `npx @modelcontextprotocol/server-filesystem` |
| **github** | GitHub API | `npx @modelcontextprotocol/server-github` |
| **postgres** | PostgreSQL 数据库 | `npx @modelcontextprotocol/server-postgres` |
| **sqlite** | SQLite 数据库 | `npx @modelcontextprotocol/server-sqlite` |
| **puppeteer** | 浏览器自动化 | `npx @modelcontextprotocol/server-puppeteer` |

### MCP 权限控制

MCP 工具遵循 Agent 的权限规则：

- 默认需要用户确认（`mcp.*` → `ask`）
- 可在 Agent 配置中自定义权限
- 支持按服务和工具细粒度控制

```typescript
// 示例：允许特定 MCP 工具自动执行
permissionRule('mcp.filesystem.read_file', 'allow')
permissionRule('mcp.github.search_*', 'allow')
permissionRule('mcp.postgres.query', 'ask')
```

### 环境变量替换

配置中的环境变量会自动替换：

```json
{
  "env": {
    "GITHUB_TOKEN": "${GITHUB_TOKEN}",
    "API_KEY": "${MY_API_KEY}"
  }
}
```

运行时会从系统环境变量中读取 `GITHUB_TOKEN` 和 `MY_API_KEY`。



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
- **MCP 插件工具**（如果已启用）

### 常用参数

```bash
--agent <name>              Agent 名称，主会话推荐 build 或 plan
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
# 只读规划（core 模式）
code-agent run "分析礼品卡设计" --agent plan

# 修改代码（需要 full 模式）
code-agent run "修复 bug" --agent build --tools full

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
- [Agent 设计](docs/AGENT_DESIGN.md) - 主模式和 subagent 的完整设计
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
