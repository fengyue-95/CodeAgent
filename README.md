# CodeAgent

CodeAgent 是一个本地代码智能索引底座，用来支撑后续的 code agent 能力。它会扫描代码仓库，用 tree-sitter 解析源码，把符号、文件、调用关系、引用关系等信息写入本地 SQLite 图数据库，然后通过 CLI 提供索引和查询能力。

当前 MVP 主要面向 Java 项目。底层图模型是通用的，后续可以继续扩展 TypeScript、Python、Go、Rust 等语言解析器，而不需要推翻现有 schema。

## 当前能力

- 扫描项目目录中的源码文件。
- 使用 `web-tree-sitter` 和 `tree-sitter-wasms` 解析 Java 文件。
- 提取 Java 的 package、import、class、interface、enum、field、method、constructor。
- 提取方法调用候选，并基于字段、参数、局部变量类型解析常见调用，例如 `service.execute()`。
- 将文件、符号节点、关系边、未解析引用写入本地 SQLite。
- 提供 CLI 命令：`index`、`sync`、`stats`、`unresolved`、`search`、`node`、`context`、`callers`、`callees`、`refs`、`references`、`serve`。
- 提供第一版 MCP stdio server，方便模型通过工具调用访问索引能力。

## 当前状态

这是一个早期 MVP，已经可以为 Java 项目建立本地代码图谱，并进行基础符号查询和调用关系查询，但还不是完整的 code agent。

已实现：

- 通用图类型定义
- SQLite 图存储
- Java parser
- 简单 resolver
- 基于 receiver 类型的 Java 调用解析
- 项目文件扫描
- CLI 索引与查询命令
- MCP stdio server

暂未实现：

- 自动代码编辑
- 测试执行与失败修复循环
- LSP 集成

## 环境要求

- Node.js 20 或更高版本
- npm
- macOS 或 Linux shell 环境

## 安装依赖

进入 CodeAgent 项目目录：

```bash
cd /Users/fengyue/PycharmProjects/CodeAgent
npm install --cache .npm-cache
```

这里使用 `--cache .npm-cache` 是为了绕开部分机器上 `~/.npm` 缓存目录权限异常的问题。

## 构建项目

```bash
npm run build
```

该命令会：

- 编译 TypeScript 到 `dist/`
- 复制 `schema.sql` 到构建产物目录
- 给 CLI 入口文件增加可执行权限

## 全局命令安装

推荐使用用户级软链接，让 `code-agent` 可以在任意工程目录下执行：

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

验证命令是否可用：

```bash
which code-agent
code-agent --help
```

验证通过后，就可以切换到任意 Java 工程目录运行：

```bash
cd /path/to/your/java-project
code-agent index
code-agent stats
```

## 不安装全局命令的运行方式

也可以直接通过 Node 执行构建后的 CLI 文件。

在 Java 项目目录中运行：

```bash
cd /path/to/your/java-project
node /Users/fengyue/PycharmProjects/CodeAgent/dist/bin/code-agent.js index
node /Users/fengyue/PycharmProjects/CodeAgent/dist/bin/code-agent.js stats
```

或者在 CodeAgent 项目目录中传入 Java 项目路径：

```bash
cd /Users/fengyue/PycharmProjects/CodeAgent
node dist/bin/code-agent.js index /path/to/your/java-project
node dist/bin/code-agent.js stats /path/to/your/java-project
```

## 常用命令

以下命令通常在 Java 项目根目录下执行。

```bash
code-agent index
```

全量扫描当前项目，解析支持的源码文件，并从头构建本地代码图谱索引。首次接入一个项目时使用该命令；如果索引状态不确定，也可以重新执行它进行全量重建。

```bash
code-agent stats
```

查看当前索引状态，包括项目路径、数据库路径、文件数量、节点数量、边数量、未解析引用数量、最近索引时间。通常用于确认 `index` 是否执行成功。

其中 `Unresolved refs` 表示当前仍未解析成功的引用。已经成功解析成边的引用会从未解析表中清理掉。

```bash
code-agent unresolved
```

查看当前剩余未解析引用的分布，包括总数、按引用类型分组的数量，以及出现次数最多的未解析引用名称。这个命令主要用于诊断 resolver 下一步应该优先优化什么。

示例：

```bash
code-agent unresolved
code-agent unresolved 50
code-agent unresolved --limit 50
```

```bash
code-agent sync
```

同步当前项目中的代码变更。如果项目是 git 仓库，会优先通过 `git status` 找出新增、修改、删除的源码文件，然后只更新这些文件对应的索引。适合在改完代码后让索引追上最新状态。

```bash
code-agent search UserService
```

按符号名、限定名、签名搜索索引中的节点。可以用来查找某个类、方法、字段或文件在哪里被索引。

示例：

```bash
code-agent search UserService
code-agent search createUser
code-agent search com.example.UserService.createUser
```

```bash
code-agent node UserService
```

查看某个符号或 node id 的详细信息，包括 id、kind、限定名、文件位置、签名、docstring、metadata 等。它适合和 `search` 配合使用：先搜索符号，再查看具体节点详情。

示例：

```bash
code-agent node UserService
code-agent node com.example.UserService.createUser
code-agent node "method:com.example.UserService.createUser:42:2"
```

```bash
code-agent context UserService
```

围绕一个查询词构建简要上下文，输出入口符号、引用方、调用方、被调用方和相关文件。它是后续 MCP `build_context` 的 CLI 雏形。

示例：

```bash
code-agent context UserService
code-agent context createUser
code-agent context com.example.UserService.createUser
```

```bash
code-agent callers execute
```

查找调用某个符号的方法或构造器。参数可以是简单名称、完整限定名，或者搜索结果中的 node id。

示例：

```bash
code-agent callers execute
code-agent callers com.example.Service.execute
```

```bash
code-agent callees run
```

查找某个方法或构造器内部调用了哪些符号，用来查看一个方法的向外调用流。

示例：

```bash
code-agent callees run
code-agent callees com.example.App.run
```

```bash
code-agent refs UserService
```

查找某个符号的所有引用关系，包括调用、类型引用、返回值引用、import、继承、实现等。`references` 是同一个命令的完整别名。

示例：

```bash
code-agent refs UserService
code-agent references com.example.Service.execute
```

```bash
code-agent serve
```

启动 MCP stdio server。这个命令通常配置给支持 MCP 的模型客户端使用，由客户端通过 stdio 发送 JSON-RPC 请求。

示例：

```bash
code-agent serve
code-agent serve /path/to/your/java-project
```

## 命令格式

所有命令都支持显式传入项目路径。如果不传 `projectPath`，默认使用当前所在目录。

```bash
code-agent index [projectPath]
```

构建或重建指定项目的本地代码图谱索引。

```bash
code-agent sync [projectPath]
```

同步指定项目中的变更文件到现有索引。

```bash
code-agent stats [projectPath]
```

查看指定项目的索引统计信息。

```bash
code-agent unresolved [limit] [projectPath]
code-agent unresolved --limit <limit> [projectPath]
```

查看指定项目中未解析引用的统计摘要。`limit` 用来控制输出的热门未解析引用数量，默认是 `20`。

```bash
code-agent search <query> [projectPath]
```

搜索指定项目中的符号。

```bash
code-agent node <symbol-or-node-id> [projectPath]
```

查看指定符号或 node id 的详细信息。

```bash
code-agent context <query> [projectPath]
```

围绕查询词构建简要代码上下文。

```bash
code-agent callers <symbol> [projectPath]
```

查找指定符号的调用方。

```bash
code-agent callees <symbol> [projectPath]
```

查找指定符号调用了哪些其他符号。

```bash
code-agent refs <symbol> [projectPath]
code-agent references <symbol> [projectPath]
```

查找指定符号的引用方。

```bash
code-agent serve [projectPath]
```

启动 MCP stdio server。

## MCP 工具

`code-agent serve` 当前暴露以下 MCP tools：

- `code_agent_status`：查看索引统计信息。
- `code_agent_search`：搜索符号。
- `code_agent_node`：查看符号或 node id 的详情。
- `code_agent_callers`：查找调用方。
- `code_agent_callees`：查找被调用方。
- `code_agent_refs`：查找引用方。
- `code_agent_context`：构建简要图上下文。

每个 tool 都支持可选参数 `projectPath`。如果不传，默认使用 MCP server 启动时所在的项目目录。

## MCP 客户端配置示例

配置 MCP 前，先确保 Java 项目已经建立索引：

```bash
cd /path/to/your/java-project
code-agent index
```

### 通用配置

大多数支持 stdio MCP 的客户端都可以使用类似配置：

```json
{
  "mcpServers": {
    "code-agent": {
      "command": "code-agent",
      "args": ["serve", "/path/to/your/java-project"]
    }
  }
}
```

如果不想依赖全局 `code-agent` 命令，可以直接使用绝对路径：

```json
{
  "mcpServers": {
    "code-agent": {
      "command": "node",
      "args": [
        "/Users/fengyue/PycharmProjects/CodeAgent/dist/bin/code-agent.js",
        "serve",
        "/path/to/your/java-project"
      ]
    }
  }
}
```

### Codex 配置

如果你的 Codex 配置文件支持 `mcpServers`，可以加入：

```json
{
  "mcpServers": {
    "code-agent": {
      "command": "code-agent",
      "args": ["serve", "/path/to/your/java-project"]
    }
  }
}
```

如果 Codex 启动时工作目录就是目标 Java 项目，也可以省略项目路径：

```json
{
  "mcpServers": {
    "code-agent": {
      "command": "code-agent",
      "args": ["serve"]
    }
  }
}
```

### Claude / Cursor 配置

Claude、Cursor 等支持 MCP 的客户端通常也是 stdio server 配置，写法与通用配置一致：

```json
{
  "mcpServers": {
    "code-agent": {
      "command": "code-agent",
      "args": ["serve", "/path/to/your/java-project"]
    }
  }
}
```

配置完成后，客户端应能看到这些工具：

- `code_agent_status`
- `code_agent_search`
- `code_agent_node`
- `code_agent_callers`
- `code_agent_callees`
- `code_agent_refs`
- `code_agent_context`

## 索引文件位置

CodeAgent 会把索引数据库写到目标 Java 项目目录中：

```text
<java-project>/.code-agent/index.db
```

该数据库只保存在本地，可以随时删除。删除后重新执行：

```bash
code-agent index
```

即可重建索引。

## npm link 权限问题

部分机器上执行 `npm link` 时，npm 会尝试写入 `/usr/local/lib/node_modules`，可能出现：

```text
EACCES: permission denied, symlink ... -> /usr/local/lib/node_modules/code-agent
```

推荐使用上面的用户级软链接方式，不需要 `sudo`，也能达到“在任意目录执行 `code-agent`”的效果。

## 开发命令

类型检查：

```bash
npm run check
```

构建：

```bash
npm run build
```

通过 npm 运行 CLI：

```bash
npm run cli -- index /path/to/your/java-project
```

## 项目结构

```text
src/
  bin/          CLI 入口
  parser/       tree-sitter grammar 加载与 Java 抽取器
  resolver/     未解析引用解析
  scanner/      文件扫描与 git 变更检测
  service/      索引流程编排
  store/        SQLite schema 与查询
  graph/        图查询服务
  mcp/          MCP stdio server 与 tools
  utils/        通用工具函数
  types.ts      语言无关的图类型定义
```

## Roadmap

近期计划：

- 增强 Java import、继承、重载方法解析。
- 增强 context builder，加入源码片段和更好的排序策略。
- 增强 MCP 协议兼容性。
