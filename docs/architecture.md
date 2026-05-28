# CodeAgent 架构设计

本文档描述 CodeAgent 的整体架构、核心模块设计和数据流。

## 目录

- [概述](#概述)
- [架构图](#架构图)
- [核心模块](#核心模块)
- [数据流](#数据流)
- [扩展点](#扩展点)

## 概述

CodeAgent 是一个本地运行的代码 Agent CLI 工具，核心功能是：

1. **代码图谱索引** - 解析代码并构建符号关系图
2. **智能查询** - 基于图谱的代码搜索和分析
3. **AI 辅助** - 使用 LLM 进行代码理解和开发辅助

### 设计原则

- **本地优先** - 所有数据存储在本地，保护隐私
- **语言无关** - 支持多种编程语言
- **可扩展** - 模块化设计，易于添加新功能
- **高性能** - 增量索引，快速查询

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ code-agent   │  │  TUI Mode    │  │  MCP Server  │     │
│  │   Commands   │  │  Interactive │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                      Runtime Layer                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Agent Runtime                           │  │
│  │  - Permission Management                             │  │
│  │  - Tool Execution                                    │  │
│  │  - Session Management                                │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                      Service Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Indexer    │  │    Query     │  │   Resolver   │     │
│  │   Service    │  │   Service    │  │   Service    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                       Core Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Parser     │  │    Graph     │  │    Store     │     │
│  │   (Tree-     │  │   (Query)    │  │  (SQLite)    │     │
│  │   Sitter)    │  │              │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                      Tool Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Workspace   │  │   Code Graph │  │     Web      │     │
│  │   Tools      │  │    Tools     │  │    Tools     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                    Provider Layer                           │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │   DeepSeek   │  │   OpenAI     │                        │
│  │   Provider   │  │  Compatible  │                        │
│  └──────────────┘  └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

## 核心模块

### 1. Parser 模块 (`src/parser/`)

**职责**: 解析源代码，提取符号和关系

**组件**:
- `JavaParser` - Java 代码解析器
- `ScriptParser` - JavaScript/TypeScript 解析器
- `PythonParser` - Python 代码解析器
- `grammars.ts` - Tree-sitter 语法管理

**输入**: 源代码文件路径和内容
**输出**: `ParseResult` (节点和边)

```typescript
interface ParseResult {
  nodes: CodeNode[];      // 符号节点（类、函数、变量等）
  edges: CodeEdge[];      // 关系边（调用、导入、继承等）
  unresolved: UnresolvedRef[];  // 未解析的引用
}
```

**技术栈**: Tree-sitter (增量解析、容错性强)

### 2. Store 模块 (`src/store/`)

**职责**: 持久化代码图谱和会话数据

**组件**:
- `GraphStore` - 图谱存储（节点、边、文件）
- `SessionStore` - 会话存储（消息、权限、运行记录）

**数据模型**:

```sql
-- 核心表
files          -- 文件记录
nodes          -- 代码节点（符号）
edges          -- 节点关系
unresolved_refs -- 未解析引用

-- 会话表
sessions       -- 会话信息
messages       -- 消息历史
parts          -- 消息部分（文本、工具调用等）
runs           -- Agent 运行记录
permissions    -- 权限审批记录
```

**技术栈**: SQLite (轻量、快速、无需服务器)

### 3. Graph 模块 (`src/graph/`)

**职责**: 提供图谱查询能力

**核心类**: `GraphQueryService`

**主要方法**:
- `searchSymbol(query)` - 搜索符号
- `resolveSymbol(query)` - 解析符号
- `findCallers(symbol)` - 查找调用者
- `findCallees(symbol)` - 查找被调用者
- `findReferences(symbol)` - 查找引用
- `buildContext(symbol)` - 构建上下文

**查询策略**:
1. 精确匹配（ID、qualified name）
2. 名称匹配
3. 模糊搜索
4. 评分排序

### 4. Service 模块 (`src/service/`)

**职责**: 提供高层业务逻辑

**组件**:

#### IndexService (`indexer.ts`)
- `indexAll(root)` - 全量索引
- `sync(root)` - 增量同步

**索引流程**:
```
1. 扫描文件 (Scanner)
2. 检测语言 (Language Detector)
3. 解析代码 (Parser)
4. 解析引用 (Resolver)
5. 存储图谱 (Store)
```

#### DefaultService (`default-service.ts`)
- 整合所有服务
- 提供统一接口

### 5. Scanner 模块 (`src/scanner/`)

**职责**: 扫描文件系统，检测变更

**组件**:
- `FileSystemScanner` - 文件系统扫描
- `GitChangesScanner` - Git 变更检测

**扫描策略**:
- 忽略 node_modules、.git 等
- 只扫描代码文件
- 支持 .gitignore 规则

### 6. Resolver 模块 (`src/resolver/`)

**职责**: 解析未解析的引用

**组件**:
- `SimpleResolver` - 简单引用解析器

**解析策略**:
1. 同文件查找
2. 同目录查找
3. 导入路径查找
4. 全局符号查找

### 7. Runtime 模块 (`src/runtime/`)

**职责**: Agent 运行时环境

**组件**:
- `AgentRuntime` - Agent 执行引擎
- `SessionProcessor` - 会话处理器

**功能**:
- 工具调用管理
- 权限审批
- 流式输出
- 错误处理

### 8. Tool 模块 (`src/tool/`)

**职责**: 提供 Agent 可用的工具

**工具分类**:

#### Core Tools (只读)
- `glob` - 文件搜索
- `grep` - 内容搜索
- `read` - 读取文件
- `gitDiff` - Git 差异
- `codeGraphSearch` - 符号搜索
- `codeGraphNode` - 节点查询
- `codeGraphCallers` - 调用者查询
- `codeGraphCallees` - 被调用者查询
- `codeGraphRefs` - 引用查询
- `codeGraphContext` - 上下文构建

#### Full Tools (读写)
- `edit` - 编辑文件
- `write` - 写入文件
- `applyPatch` - 应用补丁
- `shell` - 执行命令
- `webFetch` - 获取网页
- `webSearch` - 搜索网页
- `browserNavigate` - 浏览器导航
- `browserContent` - 获取页面内容
- `browserScreenshot` - 截图
- `todoWrite` - 写入 TODO

### 9. Session 模块 (`src/session/`)

**职责**: 会话管理

**功能**:
- 创建/查询/更新会话
- 消息历史管理
- 权限记录
- 运行记录

### 10. Provider 模块 (`src/provider/`)

**职责**: LLM 提供商集成

**组件**:
- `DeepSeekProvider` - DeepSeek API
- `OpenAICompatibleProvider` - OpenAI 兼容接口

**接口**:
```typescript
interface LLMProvider {
  chat(messages, tools, options): AsyncIterator<ChatChunk>
}
```

## 数据流

### 索引流程

```
用户执行: code-agent index

1. CLI 解析命令
   ↓
2. Scanner 扫描文件
   ↓
3. 对每个文件:
   a. 检测语言
   b. 选择 Parser
   c. 解析代码 → ParseResult
   d. 存储到 Store
   ↓
4. Resolver 解析未解析引用
   ↓
5. 完成，输出统计
```

### 查询流程

```
用户执行: code-agent search MyClass

1. CLI 解析命令
   ↓
2. GraphQueryService.searchSymbol("MyClass")
   ↓
3. GraphStore 查询数据库
   ↓
4. 返回结果并评分排序
   ↓
5. CLI 格式化输出
```

### Agent 运行流程

```
用户执行: code-agent run "查看礼品卡设计"

1. CLI 创建 Session
   ↓
2. 构建系统提示词
   ↓
3. AgentRuntime 启动
   ↓
4. 循环执行 (最多 maxSteps 次):
   a. 调用 LLM
   b. 解析响应
   c. 如果有工具调用:
      - 检查权限
      - 执行工具
      - 收集结果
   d. 如果是最终回复:
      - 输出给用户
      - 结束
   ↓
5. 保存会话历史
```

### 工具执行流程

```
Agent 调用工具: codeGraphSearch

1. Runtime 接收工具调用
   ↓
2. 权限检查
   - 查询权限规则
   - 如果需要审批 → 询问用户
   ↓
3. 执行工具
   - ToolRegistry.execute("codeGraphSearch", args)
   - 调用 GraphQueryService
   ↓
4. 返回结果给 Agent
   ↓
5. 记录权限决策
```

## 扩展点

### 1. 添加新语言支持

实现 `LanguageParser` 接口：

```typescript
export class MyLanguageParser implements LanguageParser {
  supports(language: Language): boolean {
    return language === 'mylang';
  }

  async parse(filePath: string, content: string): Promise<ParseResult> {
    // 解析逻辑
  }
}
```

注册到 `grammars.ts`。

### 2. 添加新工具

在 `src/tool/registry.ts` 中注册：

```typescript
{
  name: 'myTool',
  permission: 'my.tool',
  description: '我的工具',
  parameters: { /* JSON Schema */ },
  pattern: (args) => `myTool ${args.param}`,
  execute: async (args) => {
    // 工具逻辑
  }
}
```

### 3. 添加新 LLM 提供商

实现 `LLMProvider` 接口：

```typescript
export class MyProvider implements LLMProvider {
  async *chat(messages, tools, options) {
    // 调用 API
    // yield 流式响应
  }
}
```

### 4. 自定义 Agent

在 `src/agent/agent.ts` 中定义：

```typescript
export const myAgent: AgentInfo = {
  name: 'my-agent',
  mode: 'primary',
  description: '我的 Agent',
  systemPrompt: MY_SYSTEM_PROMPT,
  maxSteps: 50,
  permission: [ /* 权限规则 */ ],
};
```

## 性能考虑

### 索引性能

- **增量索引**: 只重新索引变更的文件
- **并行解析**: 多文件并行处理
- **缓存**: 文件哈希避免重复解析

### 查询性能

- **索引**: 数据库索引（qualified_name, name, file_path）
- **限制结果**: 默认限制返回数量
- **评分优化**: 快速评分算法

### 内存管理

- **流式处理**: 大文件流式读取
- **连接池**: 数据库连接复用
- **及时清理**: 临时数据及时释放

## 安全考虑

### 权限系统

- **默认拒绝**: 未明确允许的操作需要审批
- **模式匹配**: 支持通配符和正则
- **审计日志**: 记录所有权限决策

### 数据隔离

- **项目隔离**: 每个项目独立数据库
- **会话隔离**: 会话数据独立存储
- **本地存储**: 所有数据本地，不上传

### 代码执行

- **Shell 限制**: 危险命令需要审批
- **路径验证**: 防止路径遍历
- **超时控制**: 防止无限执行

## 未来规划

### 短期
- [ ] 更多语言支持（Go、Rust、C++）
- [ ] 性能优化（大型项目）
- [ ] 更丰富的图谱分析

### 中期
- [ ] VS Code 扩展
- [ ] 插件系统
- [ ] 远程索引

### 长期
- [ ] 多项目关联分析
- [ ] 代码度量和质量分析
- [ ] 团队协作功能

## 参考资料

- [Tree-sitter 文档](https://tree-sitter.github.io/tree-sitter/)
- [SQLite 文档](https://www.sqlite.org/docs.html)
- [Vitest 文档](https://vitest.dev/)
