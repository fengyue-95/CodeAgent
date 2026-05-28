# 基础使用示例

本目录包含 CodeAgent 的基础使用示例。

## 示例列表

### 1. 索引项目 (`01-index-project.sh`)

演示如何索引一个项目并查看统计信息。

```bash
./01-index-project.sh
```

### 2. 搜索符号 (`02-search-symbols.sh`)

演示如何搜索类、函数和变量。

```bash
./02-search-symbols.sh
```

### 3. 查询关系 (`03-query-relationships.sh`)

演示如何查询调用关系、引用关系等。

```bash
./03-query-relationships.sh
```

### 4. 使用 Agent (`04-use-agent.sh`)

演示如何使用 Agent 进行代码理解。

```bash
./04-use-agent.sh
```

### 5. TUI 模式 (`05-tui-mode.sh`)

演示如何使用交互式 TUI 模式。

```bash
./05-tui-mode.sh
```

## 运行所有示例

```bash
./run-all.sh
```

## 前置要求

- 已安装 CodeAgent
- 已配置 DeepSeek API Key
- 有一个示例项目可供索引

## 示例项目

`sample-project/` 目录包含一个简单的 TypeScript 项目，用于演示。
