# MCP 插拔系统使用指南

## 概述

CodeAgent 的 MCP 插拔系统允许你动态加载和管理 MCP (Model Context Protocol) 服务，扩展 Agent 的工具能力。

## 快速开始

### 1. 创建配置文件

配置文件位置：`~/.code-agent/mcp-config.json`

首次运行 MCP 命令时会自动创建默认配置。你也可以手动创建：

```bash
mkdir -p ~/.code-agent
cp examples/mcp-config.example.json ~/.code-agent/mcp-config.json
```

### 2. 配置 MCP 服务

编辑 `~/.code-agent/mcp-config.json`：

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      },
      "enabled": true
    }
  }
}
```

### 3. 设置环境变量

```bash
export GITHUB_TOKEN="your_github_token"
```

### 4. 测试连接

```bash
code-agent mcp test github
```

### 5. 使用 MCP 工具

```bash
# 启用 MCP 后，工具会自动注册
code-agent run "在 myrepo 创建一个 issue" --tools full

# 或在 TUI 中使用
code-agent tui
> 搜索 anthropics/claude-code 仓库的 issues
```

## 管理命令

### 列出所有服务

```bash
code-agent mcp list
```

输出示例：
```
MCP Servers:

  filesystem           ✗ disabled
    command: npx -y @modelcontextprotocol/server-filesystem /tmp

  github               ✓ enabled
    command: npx -y @modelcontextprotocol/server-github
    env: GITHUB_TOKEN
```

### 查看状态

```bash
# 查看所有服务状态
code-agent mcp status

# 查看特定服务状态
code-agent mcp status github
```

输出示例：
```
MCP Server: github
  Status: running
  Enabled: true
  Command: npx -y @modelcontextprotocol/server-github
  Tools: 15
    - github.create_issue
    - github.search_repositories
    - github.get_file_contents
    ...
```

### 启用/禁用服务

```bash
# 启用服务
code-agent mcp enable github

# 禁用服务
code-agent mcp disable github
```

### 测试连接

```bash
code-agent mcp test github
```

输出示例：
```
Testing MCP server: github
  Command: npx -y @modelcontextprotocol/server-github

  Status: starting
  Status: running
✓ Connection successful
  Tools available: 15

  Available tools:
    - github.create_issue: Create a new issue in a repository
    - github.search_repositories: Search for repositories
    - github.get_file_contents: Get contents of a file
    ...
```

## 常用 MCP 服务

### Filesystem

访问本地文件系统：

```json
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/path"],
    "enabled": true
  }
}
```

使用示例：
```bash
code-agent run "读取 /data/config.json" --tools full
```

### GitHub

访问 GitHub API：

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    },
    "enabled": true
  }
}
```

使用示例：
```bash
code-agent run "搜索 anthropics 组织的仓库" --tools full
code-agent run "在 myrepo 创建 issue: 修复登录 bug" --tools full
```

### PostgreSQL

访问 PostgreSQL 数据库：

```json
{
  "postgres": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://user:pass@localhost/db"],
    "enabled": true
  }
}
```

使用示例：
```bash
code-agent run "查询 users 表中的活跃用户" --tools full
```

### SQLite

访问 SQLite 数据库：

```json
{
  "sqlite": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-sqlite", "/path/to/db.sqlite"],
    "enabled": true
  }
}
```

### Puppeteer

浏览器自动化：

```json
{
  "puppeteer": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-puppeteer"],
    "enabled": true
  }
}
```

## 权限控制

MCP 工具遵循 Agent 的权限规则：

- 默认：`mcp.*` → `ask`（需要用户确认）
- 可在 Agent 配置中自定义

示例：允许特定工具自动执行

```typescript
// src/agent/agent.ts
permissionRule('mcp.github.search_*', 'allow')
permissionRule('mcp.filesystem.read_file', 'allow')
permissionRule('mcp.postgres.query', 'ask')
```

## 环境变量

配置中的环境变量会自动替换：

```json
{
  "env": {
    "GITHUB_TOKEN": "${GITHUB_TOKEN}",
    "API_KEY": "${MY_API_KEY}"
  }
}
```

运行时从系统环境变量读取。

## 故障排查

### 服务无法启动

1. 检查命令是否正确：
```bash
npx -y @modelcontextprotocol/server-github
```

2. 检查环境变量：
```bash
echo $GITHUB_TOKEN
```

3. 查看详细错误：
```bash
code-agent mcp test github
```

### 工具未显示

1. 确认服务已启用：
```bash
code-agent mcp status
```

2. 确认使用 `--tools full` 模式：
```bash
code-agent run "task" --tools full
```

3. 检查权限规则是否阻止了工具

### 连接超时

- 检查网络连接
- 增加超时时间（在 client.ts 中修改）
- 使用本地安装的 MCP 服务器

## 开发自定义 MCP 服务

参考 MCP 官方文档：https://modelcontextprotocol.io/

基本步骤：

1. 实现 MCP 协议（stdio 通信）
2. 实现 `tools/list` 和 `tools/call` 方法
3. 添加到配置文件
4. 测试连接

## 最佳实践

1. **安全性**：只启用需要的服务
2. **环境变量**：敏感信息使用环境变量
3. **权限控制**：为 MCP 工具配置合适的权限
4. **测试**：启用前先测试连接
5. **监控**：定期检查服务状态

## 示例工作流

### 使用 GitHub MCP 管理 Issues

```bash
# 1. 配置 GitHub MCP
code-agent mcp enable github

# 2. 测试连接
code-agent mcp test github

# 3. 搜索 issues
code-agent run "搜索 anthropics/claude-code 中标记为 bug 的 issues" --tools full

# 4. 创建 issue
code-agent run "在 myrepo 创建 issue: 添加 MCP 插拔功能" --tools full

# 5. 更新 issue
code-agent run "更新 issue #123，添加实现细节" --tools full
```

### 使用 Postgres MCP 查询数据

```bash
# 1. 配置 Postgres MCP
code-agent mcp enable postgres

# 2. 查询数据
code-agent run "查询最近 7 天注册的用户数量" --tools full

# 3. 分析数据
code-agent run "分析用户活跃度趋势" --tools full --agent explore
```

## 更多资源

- [MCP 官方文档](https://modelcontextprotocol.io/)
- [MCP 服务器列表](https://github.com/modelcontextprotocol/servers)
- [CodeAgent 文档](../README.md)
