# 测试指南

本文档介绍 CodeAgent 项目的测试基础设施和最佳实践。

## 测试框架

我们使用 [Vitest](https://vitest.dev/) 作为测试框架，原因如下：

- 🚀 快速 - 基于 Vite，启动和运行速度极快
- 📦 开箱即用 - 原生支持 TypeScript、ESM
- 🔄 兼容 Jest - API 与 Jest 兼容，易于迁移
- 📊 覆盖率 - 内置 v8 覆盖率支持

## 快速开始

### 安装依赖

```bash
npm install
```

### 运行测试

```bash
# 运行所有测试
npm test

# 监听模式（开发时使用）
npm run test:watch

# 生成覆盖率报告
npm run test:coverage

# 打开测试 UI
npm run test:ui
```

## 测试结构

```
tests/
├── setup.ts                    # 全局测试设置
├── helpers/                    # 测试辅助工具
│   ├── test-utils.ts          # 通用工具函数
│   └── mock-db.ts             # 数据库 Mock
├── fixtures/                   # 测试数据
│   ├── mock-data.ts           # Mock 数据
│   └── sample-projects.ts     # 示例项目
├── unit/                       # 单元测试
│   ├── parser.test.ts         # 解析器测试
│   ├── graph.test.ts          # 图谱查询测试
│   ├── session.test.ts        # 会话管理测试
│   └── tool-registry.test.ts  # 工具注册表测试
└── integration/                # 集成测试
    └── index-query.test.ts    # 索引和查询集成测试
```

## 测试类型

### 单元测试 (Unit Tests)

测试单个模块或函数的功能。

**位置**: `tests/unit/`

**示例**:

```typescript
import { describe, it, expect } from 'vitest';
import { extractNodes } from '../../src/parser';

describe('Parser', () => {
  it('should extract functions from TypeScript file', async () => {
    const nodes = await extractNodes('test.ts', 'typescript');
    expect(nodes.length).toBeGreaterThan(0);
  });
});
```

### 集成测试 (Integration Tests)

测试多个模块协同工作的场景。

**位置**: `tests/integration/`

**示例**:

```typescript
import { describe, it, expect } from 'vitest';
import { CodeIndexService } from '../../src/service/indexer';
import { GraphQueryService } from '../../src/graph';

describe('Integration: Index and Query', () => {
  it('should index and query project', async () => {
    await indexService.indexAll(projectDir);
    const results = queryService.searchSymbol('MyClass');
    expect(results.length).toBeGreaterThan(0);
  });
});
```

## 测试工具

### 测试数据库

使用 `createTestDatabase` 创建临时测试数据库：

```typescript
import { createTestDatabase, cleanupTestDatabase } from '../helpers/mock-db';

let db: Database.Database;

beforeEach(() => {
  db = createTestDatabase('my-test');
});

afterEach(() => {
  cleanupTestDatabase(db);
});
```

### 测试项目

使用 `createTestProject` 创建临时测试项目：

```typescript
import { createTestProject, cleanupTempDir } from '../helpers/test-utils';

let projectDir: string;

beforeEach(() => {
  projectDir = createTestProject('test-project', {
    'src/index.ts': 'export function hello() {}',
    'src/utils.ts': 'export function add(a, b) { return a + b; }',
  });
});

afterEach(() => {
  cleanupTempDir(projectDir);
});
```

### Mock 数据

使用预定义的 mock 数据：

```typescript
import { mockCodeNodes, mockCodeEdges } from '../fixtures/mock-data';
import { insertTestData } from '../helpers/mock-db';

insertTestData(db, 'nodes', mockCodeNodes);
insertTestData(db, 'edges', mockCodeEdges);
```

### 示例项目

使用预定义的示例项目：

```typescript
import { SIMPLE_TYPESCRIPT_PROJECT } from '../fixtures/sample-projects';

const projectDir = createTestProject('ts-project', SIMPLE_TYPESCRIPT_PROJECT);
```

## 编写测试的最佳实践

### 1. 测试命名

使用描述性的测试名称：

```typescript
// ✅ 好
it('should extract functions from TypeScript file', () => {});
it('should return null for non-existent symbol', () => {});

// ❌ 不好
it('test1', () => {});
it('works', () => {});
```

### 2. 测试结构

使用 AAA 模式（Arrange-Act-Assert）：

```typescript
it('should create a new session', () => {
  // Arrange - 准备测试数据
  const store = new SessionStore(db);
  
  // Act - 执行操作
  const session = store.createSession({
    projectRoot: '/test',
    agentName: 'build',
  });
  
  // Assert - 验证结果
  expect(session.id).toBeDefined();
  expect(session.project_root).toBe('/test');
});
```

### 3. 清理资源

始终清理测试创建的资源：

```typescript
afterEach(() => {
  if (db) cleanupTestDatabase(db);
  if (projectDir) cleanupTempDir(projectDir);
});
```

### 4. 独立测试

每个测试应该独立运行，不依赖其他测试：

```typescript
// ✅ 好 - 每个测试独立
describe('SessionStore', () => {
  beforeEach(() => {
    db = createTestDatabase();
  });
  
  it('test 1', () => { /* ... */ });
  it('test 2', () => { /* ... */ });
});

// ❌ 不好 - 测试之间有依赖
let sharedSession;
it('creates session', () => {
  sharedSession = store.createSession();
});
it('uses session', () => {
  store.getSession(sharedSession.id); // 依赖上一个测试
});
```

### 5. 测试边界情况

不仅测试正常情况，也要测试边界和错误情况：

```typescript
describe('divide', () => {
  it('should divide two numbers', () => {
    expect(divide(10, 2)).toBe(5);
  });
  
  it('should handle division by zero', () => {
    expect(() => divide(10, 0)).toThrow('Division by zero');
  });
  
  it('should handle negative numbers', () => {
    expect(divide(-10, 2)).toBe(-5);
  });
});
```

## 覆盖率目标

我们的覆盖率目标：

- **Lines**: 60%
- **Functions**: 60%
- **Branches**: 60%
- **Statements**: 60%

查看覆盖率报告：

```bash
npm run test:coverage
open coverage/index.html
```

## CI/CD 集成

测试在以下情况自动运行：

- 推送到 `main` 或 `dev` 分支
- 创建 Pull Request
- 在多个 Node.js 版本（20.x, 22.x）和操作系统（Ubuntu, macOS, Windows）上运行

## 调试测试

### 使用 VS Code

在 `.vscode/launch.json` 中添加配置：

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Vitest Tests",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "test:watch"],
  "console": "integratedTerminal"
}
```

### 使用 Vitest UI

```bash
npm run test:ui
```

在浏览器中打开 http://localhost:51204/__vitest__/

### 只运行特定测试

```bash
# 运行特定文件
npx vitest tests/unit/parser.test.ts

# 运行匹配的测试
npx vitest -t "should extract functions"
```

## 常见问题

### Q: 测试运行很慢怎么办？

A: 使用 `test:watch` 模式，Vitest 会智能地只运行相关测试。

### Q: 如何 mock 外部依赖？

A: 使用 Vitest 的 `vi.mock()`:

```typescript
import { vi } from 'vitest';

vi.mock('../../src/external-service', () => ({
  fetchData: vi.fn(() => Promise.resolve({ data: 'mocked' })),
}));
```

### Q: 如何测试异步代码？

A: 使用 `async/await`:

```typescript
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBe('expected');
});
```

## 贡献测试

添加新功能时，请同时添加测试：

1. 为新模块创建对应的测试文件
2. 确保测试覆盖主要功能和边界情况
3. 运行 `npm run test:coverage` 检查覆盖率
4. 确保所有测试通过后再提交

## 参考资源

- [Vitest 文档](https://vitest.dev/)
- [测试最佳实践](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Jest API 参考](https://jestjs.io/docs/api)（Vitest 兼容）
