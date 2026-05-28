# CodeAgent

CodeAgent 是一个本地优先的代码 Agent CLI。它会为项目建立本地代码图谱索引，并让 Agent 通过代码图谱、文件搜索、文件读取、编辑工具、Todo、子任务和浏览器/网页工具来完成代码理解、方案分析和开发任务。

当前重点是 CLI，不包含桌面端交付。

## 核心能力

- 本地代码图谱索引：扫描项目源码，解析符号、调用、引用、继承、文件关系。
- 支持语言：Java、JavaScript、TypeScript、Python。
- 增量同步：支持 `sync`、`watch`、git hook 自动同步索引。
- 图谱查询：支持 `search`、`node`、`context`、`callers`、`callees`、`refs`。
- Agent Runtime：支持 `code-agent run "<task>"` 执行任务。
- 流式输出：执行时按步骤、文本、工具调用、工具结果逐步打印。
- 权限审批：需要 ask 权限的工具会暂停并询问用户批准或拒绝。
- 会话管理：支持手动创建 session，并通过 `--session` 或 `--continue` 继续上下文。
- 本地工具：文件读写、grep/glob、patch/edit/write、shell、todo、task/subagent、web/browser 工具。
- MCP server：支持通过 stdio 暴露代码图谱工具。

## 环境要求

- Node.js 20 或更高版本
- npm
- macOS 或 Linux shell
- DeepSeek API Key

## 安装

进入 CodeAgent 项目目录：

```bash
cd /Users/fengyue/PycharmProjects/CodeAgent
npm install --cache .npm-cache
npm run build
```

如果曾经因为 Electron 或其他 native rebuild 导致 `better-sqlite3` ABI 不匹配，可以在 CodeAgent 根目录修复：

```bash
npm rebuild better-sqlite3 --cache .npm-cache
npm run build
```

## 配置 DeepSeek

推荐放到本机用户配置：

```bash
mkdir -p ~/.code-agent
printf 'DEEPSEEK_API_KEY=你的 key\n' > ~/.code-agent/.env
```

也可以使用环境变量：

```bash
export DEEPSEEK_API_KEY=你的 key
```

CodeAgent 会按顺序读取：

- `~/.code-agent/.env`
- `~/.config/code-agent/.env`
- 当前项目 `.env`
- 当前执行目录 `.env`

## 全局命令

推荐创建用户级软链接：

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

## 快速开始

在目标项目根目录执行：

```bash
cd /path/to/your/project
code-agent index
code-agent stats
code-agent run "查看下礼品卡的设计"
```

如果不想安装全局命令：

```bash
node /Users/fengyue/PycharmProjects/CodeAgent/dist/bin/code-agent.js index
node /Users/fengyue/PycharmProjects/CodeAgent/dist/bin/code-agent.js run "查看下礼品卡的设计"
```

## Agent 模式

### build

默认模式。适合真正执行开发任务。

能力特点：

- 可以读取代码、搜索代码、查询代码图谱。
- 可以申请编辑、写入、patch、shell 等权限。
- 适合修 bug、补功能、改代码、执行验证。

示例：

```bash
code-agent run "修复这个测试失败"
code-agent run "新增一个礼品卡查询接口"
```

### plan

只读规划模式。适合调研、分析和制定方案。

能力特点：

- 可以读取代码、搜索代码、查询代码图谱。
- 不修改文件。
- 不执行会改变项目状态的命令。
- 适合理解模块设计、梳理调用链、评估改造方案。

示例：

```bash
code-agent run "分析礼品卡是怎么设计的" --agent plan
code-agent run "给我一个储值卡改造方案" --agent plan
```

简单理解：

```text
plan  = 先看、先想、给方案
build = 看完之后直接干活
```

## 最大步数

默认最大步数是 25。

可以通过命令临时修改：

```bash
code-agent run "查看下礼品卡的设计" --max-steps 25
code-agent run "快速看一下入口" --max-steps 8
```

## 会话管理

默认 `run` 会创建一个新 session。对于连续提问，推荐先手动创建 session，然后继续同一个 session。

创建 session：

```bash
code-agent session new --title "gift card investigation"
```

查看 session：

```bash
code-agent session list
code-agent session list --limit 5
```

继续最近的 session：

```bash
code-agent run "继续分析礼品卡设计" --continue
```

继续指定 session：

```bash
code-agent run "检查礼品卡扣减边界场景" --session ses_xxx
```

## 常用命令

### run

运行 Agent 任务。

```bash
code-agent run "查看下礼品卡的设计"
code-agent run "分析礼品卡模块，不要改代码" --agent plan
code-agent run "修复礼品卡查询接口问题" --agent build --max-steps 25
code-agent run "继续刚才的分析" --continue
code-agent run "继续这个会话" --session ses_xxx
```

常用参数：

```text
--agent <build|plan>       Agent 模式，默认 build
--model <model>            模型覆盖
--max-steps <n>            最大步骤数，默认 25
--temperature <n>          采样温度
--session <sessionId>      继续指定 session
--continue                 继续当前项目最近的 session
--cwd, --project <path>    指定项目根目录
```

### index

全量构建索引。

```bash
code-agent index
code-agent index /path/to/project
```

### sync

增量同步索引。

```bash
code-agent sync
code-agent sync /path/to/project
```

### watch

监听文件变化并自动同步索引。

```bash
code-agent watch
code-agent watch --verbose
code-agent watch --debounce 2000
```

### git

基于 git 变更同步索引，或安装 git hooks。

```bash
code-agent git sync
code-agent git hook install
code-agent git hook status
code-agent git hook remove
```

### stats

查看索引统计。

```bash
code-agent stats
```

输出包括：

- 项目路径
- 数据库路径
- 文件数量
- 节点数量
- 边数量
- 未解析引用数量
- 最近索引时间

### unresolved

查看未解析引用摘要。

```bash
code-agent unresolved
code-agent unresolved --limit 10
```

### search

按符号名搜索。

```bash
code-agent search GiftCard
code-agent search GiftcardAccountRechargeFacade
```

### node

查看符号或 node id 的详情。

```bash
code-agent node GiftcardAccountRechargeFacade
code-agent node "method:com.example.Service.execute:42:2"
```

### context

围绕查询构建小型上下文。

```bash
code-agent context GiftcardAccountRechargeFacade
code-agent context "礼品卡"
```

输出包括：

- Entry points
- References
- Callers
- Callees
- Related files

### callers

查找谁调用了某个符号。

```bash
code-agent callers GiftcardAccountRechargeFacade
code-agent callers createRechargeOrder
```

### callees

查找某个方法调用了哪些符号。

```bash
code-agent callees GiftcardAccountRechargeFacade
code-agent callees createRechargeOrder
```

### refs

查找某个符号的引用。

```bash
code-agent refs GiftcardAccountRechargeFacade
code-agent references GiftcardAccountRechargeFacade
```

### serve

启动 MCP stdio server。

```bash
code-agent serve
code-agent serve --watch
code-agent serve --no-auto-sync
```

## CLI 帮助

查看全部命令：

```bash
code-agent --help
```

查看 run 相关帮助：

```bash
code-agent run --help
```

## 工具权限

Agent 工具按权限策略执行。

常见行为：

- 只读工具通常直接允许，例如 code graph、glob、grep、read。
- 编辑、写入、shell、web/browser 导航和截图等工具可能需要用户确认。
- 被拒绝的危险命令会直接失败。

出现确认时，CLI 会暂停并询问：

```text
Permission required:
  Tool: workspace.shell
  Permission: workspace.shell
  Pattern: mvn test
Approve? [y/N]
```

输入 `y` 或 `yes` 批准，其它输入默认拒绝。

## 数据目录

每个目标项目会生成自己的本地状态目录：

```text
<project>/.code-agent/index.db
```

其中包含：

- 文件索引
- 符号节点
- 关系边
- 未解析引用
- agent sessions
- messages / tool parts / runs / permissions

## 开发命令

在 CodeAgent 仓库内：

```bash
npm run check
npm run build
npm run cli -- --help
```

常见本地验证：

```bash
npm run check
npm run build
node dist/bin/code-agent.js --help
node dist/bin/code-agent.js stats /path/to/project
```

## 当前限制

- 代码图谱解析仍是静态分析，动态调用、反射、框架注入不一定能完全解析。
- Java/Spring、MyBatis、复杂泛型、跨模块构建等高级语义仍需要继续增强。
- Agent 可以使用工具辅助分析，但最终输出仍需要人工 review。
- Web/browser 工具依赖本地浏览器/Playwright 环境，复杂登录站点需要额外配置。

## 推荐工作流

首次接入项目：

```bash
cd /path/to/project
code-agent index
code-agent stats
```

调研设计：

```bash
code-agent session new --title "gift card investigation"
code-agent run "分析礼品卡账户模型和核心入口" --agent plan --continue
code-agent run "继续梳理充值、扣减、冻结、退款流程" --agent plan --continue
```

执行开发：

```bash
code-agent run "根据刚才方案实现礼品卡查询接口" --agent build --continue
code-agent sync
code-agent stats
```

长期开发：

```bash
code-agent watch --verbose
```
