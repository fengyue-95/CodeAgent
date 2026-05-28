# CodeAgent

CodeAgent 现在先定位成一个能在本机跑起来的代码 Agent CLI。当前优先级是：索引项目、查询代码图谱、用 `code-agent run` 做代码理解和简单开发辅助。桌面端和完整 opencode 级能力先不作为主线。

## 当前目标

先把 CLI 做稳：

- 能给目标项目建立本地代码图谱索引。
- 能用命令查询符号、调用、引用和上下文。
- 能用 DeepSeek 执行 `code-agent run "任务"`。
- 能用 `code-agent` 或 `code-agent tui` 进入交互式终端对话。
- 默认工具集尽量简单，只允许读代码和查图谱。
- 需要编辑、shell、web、todo、subagent 时，再显式开启完整工具集。

## 环境要求

- Node.js 20 或更高版本
- npm
- DeepSeek API Key

## 安装和构建

在 CodeAgent 仓库执行：

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

## 配置 DeepSeek

推荐放到用户目录：

```bash
mkdir -p ~/.code-agent
printf 'DEEPSEEK_API_KEY=你的 key\n' > ~/.code-agent/.env
```

也可以临时用环境变量：

```bash
export DEEPSEEK_API_KEY=你的 key
```

CodeAgent 会读取这些位置：

- `~/.code-agent/.env`
- `~/.config/code-agent/.env`
- 目标项目 `.env`
- 当前执行目录 `.env`

## 配置全局命令

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

## 最小使用流程

进入你要分析的项目：

```bash
cd /path/to/your/project
code-agent index
code-agent stats
code-agent run "查看下礼品卡的设计"
```

进入交互式 TUI：

```bash
code-agent
# 或
code-agent tui
```

如果没有配置全局命令，也可以直接用：

```bash
node /Users/fengyue/PycharmProjects/CodeAgent/dist/bin/code-agent.js run "查看下礼品卡的设计"
```

## run 命令

默认执行：

```bash
code-agent run "查看下礼品卡的设计"
```

默认 `--tools core`，只暴露较稳的只读工具：

- `glob`
- `grep`
- `read`
- `gitDiff`
- `codeGraphSearch`
- `codeGraphNode`
- `codeGraphCallers`
- `codeGraphCallees`
- `codeGraphRefs`
- `codeGraphContext`
- `codeGraphStatus`

需要让 Agent 改代码、执行 shell、使用 web/browser、todo 或 subagent 时，显式开启完整工具集：

```bash
code-agent run "修复这个测试失败" --tools full
```

常用参数：

```text
--agent <build|plan>       Agent 模式，默认 build
--model <model>            模型覆盖
--max-steps <n>            最大步骤数，默认 50
--temperature <n>          采样温度
--tools <core|full>        工具集，默认 core
--session <sessionId>      继续指定 session
--continue                 继续当前项目最近的 session
--cwd, --project <path>    指定项目根目录
```

## TUI 交互模式

直接运行 `code-agent` 会进入交互式终端 UI；也可以显式执行：

```bash
code-agent tui
code-agent tui --continue
code-agent tui --agent plan --tools core
```

TUI 支持连续对话，同一个 session 会一直保留上下文。常用操作：

```text
/help                    查看命令
/new [title]             新建 session
/sessions                查看并切换 session
/agent build             切到 build
/agent plan              切到 plan
/tab                     在 build/plan 之间切换
/tools core              使用简化只读工具集
/tools full              开启完整工具集
/init                    创建 AGENTS.md
/undo                    撤销最近一轮对话
/redo                    重新执行最近撤销的问题
/share                   导出当前 session 到 .code-agent/share/*.md
/exit                    退出
```

输入辅助：

```text
@file                    弹出文件搜索并选择要附加的文件
@file:GiftCard           模糊查找匹配文件并附加内容
@src/path/file.ts        把文件内容附加到当前问题
@GiftCard                模糊查找匹配文件并附加内容
!npm test                执行 shell 命令，并把输出作为上下文发给 Agent
```

在空输入行按 Tab，也可以在 `build` 和 `plan` 之间切换。

## build 和 plan

`build` 是默认模式，适合执行任务。默认 core 工具集下它也只会读代码和查图谱；加 `--tools full` 后才适合改代码、跑命令。

```bash
code-agent run "修复礼品卡查询接口问题" --agent build --tools full
```

`plan` 是只读规划模式，适合分析设计、梳理调用链、输出方案。

```bash
code-agent run "分析礼品卡是怎么设计的" --agent plan
```

简单理解：

```text
plan  = 只看代码，给分析和方案
build = 可以执行任务；是否能写文件取决于 --tools 和权限审批
```

## 会话

默认每次 `run` 会创建一个新 session。连续提问时，先手动创建 session：

```bash
code-agent session new --title "gift card investigation"
code-agent run "查看下礼品卡的设计" --continue
code-agent run "继续看扣减和退款链路" --continue
```

也可以继续指定 session：

```bash
code-agent session list
code-agent run "继续这个会话" --session ses_xxx
```

## 索引和查询命令

构建索引：

```bash
code-agent index
code-agent index /path/to/project
```

增量同步：

```bash
code-agent sync
```

查看统计：

```bash
code-agent stats
```

搜索符号：

```bash
code-agent search GiftCard
```

查看符号详情：

```bash
code-agent node GiftCardService
```

构建上下文：

```bash
code-agent context GiftCardService
```

查看调用方、被调用方、引用：

```bash
code-agent callers GiftCardService
code-agent callees createGiftCard
code-agent refs GiftCardService
```

查看未解析引用：

```bash
code-agent unresolved --limit 10
```

## watch 和 git hook

开发时可以监听文件变化并自动同步索引：

```bash
code-agent watch
code-agent watch --verbose
```

也可以安装 git hooks：

```bash
code-agent git hook install
code-agent git hook status
code-agent git hook remove
```

## 权限审批

`--tools core` 基本是只读工具，通常不需要确认。

`--tools full` 会打开编辑、写入、shell、web/browser、subagent 等能力。遇到需要确认的工具时，CLI 会暂停询问：

```text
Permission required:
  Tool: shell
  Permission: workspace.shell
  Pattern: npm test
Approve? [y/N]
```

输入 `y` 或 `yes` 批准，其它输入默认拒绝。

## 帮助

```bash
code-agent --help
code-agent run --help
```

## 开发验证

在 CodeAgent 仓库内：

```bash
npm run check
npm run build
node dist/bin/code-agent.js --help
```
