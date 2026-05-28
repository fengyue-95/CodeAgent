# 代码图谱模型

本文档详细说明 CodeAgent 的代码图谱数据模型、节点类型、边类型和查询方式。

## 目录

- [概述](#概述)
- [数据模型](#数据模型)
- [节点类型](#节点类型)
- [边类型](#边类型)
- [查询示例](#查询示例)
- [最佳实践](#最佳实践)

## 概述

CodeAgent 使用**有向图**来表示代码结构和关系：

- **节点 (Node)**: 代码符号（类、函数、变量等）
- **边 (Edge)**: 符号之间的关系（调用、导入、继承等）

图谱存储在 SQLite 数据库中，支持高效查询和分析。

### 核心概念

```
┌─────────────┐         calls         ┌─────────────┐
│  Function   │ ───────────────────> │  Function   │
│   main()    │                       │   helper()  │
└─────────────┘                       └─────────────┘
      │                                      ▲
      │ contains                             │
      ▼                                      │ imports
┌─────────────┐                       ┌─────────────┐
│    File     │ ───────────────────> │    File     │
│  main.ts    │                       │  utils.ts   │
└─────────────┘                       └─────────────┘
```

## 数据模型

### 核心表结构

#### 1. files 表

存储文件元数据。

```sql
CREATE TABLE files (
  path TEXT PRIMARY KEY,           -- 文件路径（相对于项目根目录）
  language TEXT NOT NULL,          -- 编程语言
  content_hash TEXT NOT NULL,      -- 内容哈希（用于检测变更）
  size INTEGER NOT NULL,           -- 文件大小（字节）
  modified_at INTEGER NOT NULL,    -- 修改时间（Unix 时间戳）
  indexed_at INTEGER NOT NULL,     -- 索引时间（Unix 时间戳）
  metadata TEXT                    -- 额外元数据（JSON）
);
```

**索引**:
```sql
CREATE INDEX idx_files_language ON files(language);
CREATE INDEX idx_files_modified_at ON files(modified_at);
```

#### 2. nodes 表

存储代码节点（符号）。

```sql
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,             -- 节点 ID（唯一标识符）
  kind TEXT NOT NULL,              -- 节点类型（见节点类型章节）
  name TEXT NOT NULL,              -- 符号名称
  qualified_name TEXT,             -- 完全限定名（如 MyClass.myMethod）
  file_path TEXT NOT NULL,         -- 所属文件路径
  language TEXT NOT NULL,          -- 编程语言
  start_line INTEGER NOT NULL,     -- 起始行号
  end_line INTEGER NOT NULL,       -- 结束行号
  start_column INTEGER NOT NULL,   -- 起始列号
  end_column INTEGER NOT NULL,     -- 结束列号
  signature TEXT,                  -- 签名（如函数签名）
  docstring TEXT,                  -- 文档字符串
  is_exported INTEGER DEFAULT 0,   -- 是否导出（0=否, 1=是）
  metadata TEXT                    -- 额外元数据（JSON）
);
```

**索引**:
```sql
CREATE INDEX idx_nodes_name ON nodes(name);
CREATE INDEX idx_nodes_qualified_name ON nodes(qualified_name);
CREATE INDEX idx_nodes_file_path ON nodes(file_path);
CREATE INDEX idx_nodes_kind ON nodes(kind);
CREATE INDEX idx_nodes_language ON nodes(language);
```

#### 3. edges 表

存储节点之间的关系。

```sql
CREATE TABLE edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,            -- 源节点 ID
  target TEXT NOT NULL,            -- 目标节点 ID
  kind TEXT NOT NULL,              -- 边类型（见边类型章节）
  line INTEGER,                    -- 关系发生的行号
  column INTEGER,                  -- 关系发生的列号
  metadata TEXT,                   -- 额外元数据（JSON）
  FOREIGN KEY (source) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target) REFERENCES nodes(id) ON DELETE CASCADE
);
```

**索引**:
```sql
CREATE INDEX idx_edges_source ON edges(source);
CREATE INDEX idx_edges_target ON edges(target);
CREATE INDEX idx_edges_kind ON edges(kind);
CREATE INDEX idx_edges_source_kind ON edges(source, kind);
CREATE INDEX idx_edges_target_kind ON edges(target, kind);
```

#### 4. unresolved_refs 表

存储未解析的引用（用于后续解析）。

```sql
CREATE TABLE unresolved_refs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_node_id TEXT NOT NULL,      -- 引用来源节点 ID
  ref_name TEXT NOT NULL,          -- 引用名称
  ref_kind TEXT NOT NULL,          -- 引用类型
  file_path TEXT NOT NULL,         -- 所属文件
  language TEXT NOT NULL,          -- 编程语言
  line INTEGER,                    -- 行号
  column INTEGER,                  -- 列号
  candidates TEXT,                 -- 候选目标（JSON 数组）
  metadata TEXT                    -- 额外元数据（JSON）
);
```

## 节点类型

### NodeKind 枚举

```typescript
type NodeKind =
  | 'file'          // 文件
  | 'module'        // 模块
  | 'namespace'     // 命名空间
  | 'class'         // 类
  | 'interface'     // 接口
  | 'enum'          // 枚举
  | 'function'      // 函数
  | 'method'        // 方法
  | 'constructor'   // 构造函数
  | 'field'         // 字段
  | 'property'      // 属性
  | 'variable'      // 变量
  | 'constant'      // 常量
  | 'parameter'     // 参数
  | 'type_alias'    // 类型别名
  | 'unknown';      // 未知类型
```

### 节点示例

#### TypeScript 类

```typescript
export class UserService {
  private users: Map<string, User> = new Map();

  constructor(private db: Database) {}

  async getUser(id: string): Promise<User> {
    return this.users.get(id);
  }
}
```

**生成的节点**:

```json
[
  {
    "id": "node_1",
    "kind": "class",
    "name": "UserService",
    "qualified_name": "UserService",
    "file_path": "src/services/UserService.ts",
    "language": "typescript",
    "start_line": 1,
    "end_line": 9,
    "signature": "class UserService",
    "is_exported": 1
  },
  {
    "id": "node_2",
    "kind": "field",
    "name": "users",
    "qualified_name": "UserService.users",
    "file_path": "src/services/UserService.ts",
    "language": "typescript",
    "start_line": 2,
    "end_line": 2,
    "signature": "private users: Map<string, User>"
  },
  {
    "id": "node_3",
    "kind": "constructor",
    "name": "constructor",
    "qualified_name": "UserService.constructor",
    "file_path": "src/services/UserService.ts",
    "language": "typescript",
    "start_line": 4,
    "end_line": 4,
    "signature": "constructor(private db: Database)"
  },
  {
    "id": "node_4",
    "kind": "method",
    "name": "getUser",
    "qualified_name": "UserService.getUser",
    "file_path": "src/services/UserService.ts",
    "language": "typescript",
    "start_line": 6,
    "end_line": 8,
    "signature": "async getUser(id: string): Promise<User>"
  }
]
```

#### Python 函数

```python
def calculate_score(base: int, multiplier: int) -> int:
    """Calculate score with multiplier."""
    return base * multiplier
```

**生成的节点**:

```json
{
  "id": "node_5",
  "kind": "function",
  "name": "calculate_score",
  "qualified_name": "calculate_score",
  "file_path": "utils/math.py",
  "language": "python",
  "start_line": 1,
  "end_line": 3,
  "signature": "def calculate_score(base: int, multiplier: int) -> int",
  "docstring": "Calculate score with multiplier."
}
```

## 边类型

### EdgeKind 枚举

```typescript
type EdgeKind =
  | 'contains'      // 包含关系（文件包含类，类包含方法）
  | 'imports'       // 导入关系
  | 'exports'       // 导出关系
  | 'calls'         // 调用关系
  | 'references'    // 引用关系
  | 'extends'       // 继承关系
  | 'implements'    // 实现关系
  | 'type_of'       // 类型关系
  | 'returns'       // 返回类型关系
  | 'annotates';    // 注解关系
```

### 边示例

#### 包含关系 (contains)

```
File: src/UserService.ts
  └─ contains ─> Class: UserService
       ├─ contains ─> Field: users
       ├─ contains ─> Constructor: constructor
       └─ contains ─> Method: getUser
```

```json
[
  {
    "source": "file_node_id",
    "target": "node_1",
    "kind": "contains"
  },
  {
    "source": "node_1",
    "target": "node_2",
    "kind": "contains"
  },
  {
    "source": "node_1",
    "target": "node_3",
    "kind": "contains"
  },
  {
    "source": "node_1",
    "target": "node_4",
    "kind": "contains"
  }
]
```

#### 调用关系 (calls)

```typescript
function main() {
  const result = helper();  // main calls helper
}

function helper() {
  return 42;
}
```

```json
{
  "source": "main_node_id",
  "target": "helper_node_id",
  "kind": "calls",
  "line": 2,
  "column": 18
}
```

#### 导入关系 (imports)

```typescript
import { UserService } from './services/UserService';
```

```json
{
  "source": "current_file_node_id",
  "target": "UserService_node_id",
  "kind": "imports",
  "line": 1,
  "column": 10
}
```

#### 继承关系 (extends)

```typescript
class AdminService extends UserService {
  // ...
}
```

```json
{
  "source": "AdminService_node_id",
  "target": "UserService_node_id",
  "kind": "extends",
  "line": 1,
  "column": 24
}
```

## 查询示例

### 1. 查找所有类

```sql
SELECT * FROM nodes WHERE kind = 'class';
```

### 2. 查找特定文件中的所有函数

```sql
SELECT * FROM nodes 
WHERE file_path = 'src/utils.ts' 
  AND kind IN ('function', 'method');
```

### 3. 查找调用特定函数的所有位置

```sql
SELECT n.* 
FROM nodes n
JOIN edges e ON e.source = n.id
WHERE e.target = 'target_function_id'
  AND e.kind = 'calls';
```

### 4. 查找函数的所有调用者（反向查询）

```sql
SELECT n.* 
FROM nodes n
JOIN edges e ON e.target = n.id
WHERE e.source = 'source_function_id'
  AND e.kind = 'calls';
```

### 5. 查找类的所有方法

```sql
SELECT n.* 
FROM nodes n
JOIN edges e ON e.source = 'class_node_id' AND e.target = n.id
WHERE e.kind = 'contains'
  AND n.kind = 'method';
```

### 6. 查找导入特定模块的所有文件

```sql
SELECT DISTINCT n.file_path
FROM nodes n
JOIN edges e ON e.source = n.id
WHERE e.target = 'module_node_id'
  AND e.kind = 'imports';
```

### 7. 构建调用链（递归查询）

```sql
WITH RECURSIVE call_chain AS (
  -- 起点
  SELECT id, name, 0 as depth
  FROM nodes
  WHERE id = 'start_function_id'
  
  UNION ALL
  
  -- 递归查找被调用的函数
  SELECT n.id, n.name, cc.depth + 1
  FROM nodes n
  JOIN edges e ON e.target = n.id
  JOIN call_chain cc ON e.source = cc.id
  WHERE e.kind = 'calls'
    AND cc.depth < 5  -- 限制深度
)
SELECT * FROM call_chain;
```

### 8. 查找未解析的引用

```sql
SELECT * FROM unresolved_refs
WHERE file_path = 'src/main.ts';
```

## TypeScript 类型定义

### CodeNode

```typescript
interface CodeNode {
  id: string;                    // 节点 ID
  kind: NodeKind;                // 节点类型
  name: string;                  // 名称
  qualifiedName?: string;        // 完全限定名
  filePath: string;              // 文件路径
  language: Language;            // 编程语言
  startLine: number;             // 起始行
  endLine: number;               // 结束行
  startColumn: number;           // 起始列
  endColumn: number;             // 结束列
  signature?: string;            // 签名
  docstring?: string;            // 文档
  isExported?: boolean;          // 是否导出
  metadata?: Record<string, any>; // 元数据
}
```

### CodeEdge

```typescript
interface CodeEdge {
  source: string;                // 源节点 ID
  target: string;                // 目标节点 ID
  kind: EdgeKind;                // 边类型
  line?: number;                 // 行号
  column?: number;               // 列号
  metadata?: Record<string, any>; // 元数据
}
```

### UnresolvedRef

```typescript
interface UnresolvedRef {
  fromNodeId: string;            // 来源节点
  refName: string;               // 引用名称
  refKind: string;               // 引用类型
  filePath: string;              // 文件路径
  language: Language;            // 编程语言
  line?: number;                 // 行号
  column?: number;               // 列号
  candidates?: string[];         // 候选目标
  metadata?: Record<string, any>; // 元数据
}
```

## 最佳实践

### 1. 节点 ID 生成

使用确定性 ID 生成策略：

```typescript
function generateNodeId(node: CodeNode): string {
  return `${node.filePath}:${node.kind}:${node.qualifiedName || node.name}:${node.startLine}`;
}
```

### 2. 查询优化

- 使用索引字段进行查询
- 限制结果数量（LIMIT）
- 避免全表扫描
- 使用 EXPLAIN QUERY PLAN 分析查询

### 3. 增量更新

只更新变更的文件：

```typescript
async function syncFile(filePath: string) {
  // 1. 删除旧数据
  await store.deleteNodesByFile(filePath);
  await store.deleteEdgesByFile(filePath);
  
  // 2. 重新解析
  const result = await parser.parse(filePath, content);
  
  // 3. 插入新数据
  await store.insertNodes(result.nodes);
  await store.insertEdges(result.edges);
}
```

### 4. 处理未解析引用

定期运行解析器：

```typescript
async function resolveReferences() {
  const unresolved = await store.getUnresolvedRefs();
  
  for (const ref of unresolved) {
    const candidates = await resolver.resolve(ref);
    
    if (candidates.length === 1) {
      // 创建边
      await store.insertEdge({
        source: ref.fromNodeId,
        target: candidates[0].id,
        kind: 'references',
      });
      
      // 删除未解析引用
      await store.deleteUnresolvedRef(ref.id);
    }
  }
}
```

### 5. 元数据使用

存储额外信息：

```json
{
  "metadata": {
    "complexity": 5,
    "testCoverage": 0.85,
    "lastModified": "2026-05-28",
    "author": "developer@example.com"
  }
}
```

## 图谱可视化

### 示例：类关系图

```
┌─────────────────┐
│   BaseService   │
└────────┬────────┘
         │ extends
         ▼
┌─────────────────┐      imports      ┌─────────────────┐
│   UserService   │ ─────────────────>│    Database     │
└────────┬────────┘                   └─────────────────┘
         │ contains
         ▼
┌─────────────────┐
│     getUser     │
│    (method)     │
└────────┬────────┘
         │ calls
         ▼
┌─────────────────┐
│   validateId    │
│   (function)    │
└─────────────────┘
```

## 参考资料

- [SQLite 文档](https://www.sqlite.org/docs.html)
- [Tree-sitter 文档](https://tree-sitter.github.io/tree-sitter/)
- [图数据库概念](https://en.wikipedia.org/wiki/Graph_database)
