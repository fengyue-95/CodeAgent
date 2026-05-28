# 工具开发指南

本文档介绍如何为 CodeAgent 开发自定义工具。

## 目录

- [概述](#概述)
- [工具接口](#工具接口)
- [开发步骤](#开发步骤)
- [示例](#示例)
- [最佳实践](#最佳实践)
- [测试](#测试)

## 概述

工具是 Agent 与外部世界交互的方式。CodeAgent 支持两类工具：

- **Core Tools** - 只读工具，默认启用
- **Full Tools** - 读写工具，需要显式启用

### 工具的作用

工具让 Agent 能够：
- 读取和编辑文件
- 执行 shell 命令
- 查询代码图谱
- 访问网页
- 操作浏览器
- 管理 TODO 列表

## 工具接口

### LocalToolDefinition

```typescript
interface LocalToolDefinition {
  name: string;                    // 工具名称（唯一标识符）
  permission: string;              // 权限标识符
  description: string;             // 工具描述（给 LLM 看）
  parameters: Record<string, unknown>;  // JSON Schema 参数定义
  pattern(args: Record<string, unknown>): string;  // 生成权限模式
  execute(args: Record<string, unknown>): Promise<unknown>;  // 执行逻辑
}
```

### 参数定义（JSON Schema）

```typescript
parameters: {
  type: 'object',
  properties: {
    param1: {
      type: 'string',
      description: '参数1的描述',
    },
    param2: {
      type: 'number',
      description: '参数2的描述',
      minimum: 0,
    },
  },
  required: ['param1'],  // 必需参数
}
```

## 开发步骤

### 1. 定义工具

在 `src/tool/registry.ts` 中添加工具定义：

```typescript
const myTool: LocalToolDefinition = {
  name: 'myTool',
  permission: 'my.tool',
  description: '我的自定义工具，用于...',
  
  parameters: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: '输入参数',
      },
      options: {
        type: 'object',
        description: '可选配置',
        properties: {
          verbose: {
            type: 'boolean',
            description: '是否输出详细信息',
          },
        },
      },
    },
    required: ['input'],
  },
  
  pattern(args) {
    return `myTool ${args.input}`;
  },
  
  async execute(args) {
    // 实现工具逻辑
    const { input, options } = args;
    
    // 执行操作
    const result = await doSomething(input, options);
    
    // 返回结果
    return result;
  },
};
```

### 2. 注册工具

将工具添加到工具注册表：

```typescript
export function createLocalToolRegistry(
  projectRoot: string,
  store: GraphStore
): ToolRegistry {
  const tools: LocalToolDefinition[] = [
    // ... 现有工具
    myTool,  // 添加你的工具
  ];
  
  // ...
}
```

### 3. 配置权限

在 `src/agent/agent.ts` 中配置工具权限：

```typescript
const basePermissions: AgentPermissionRuleset = [
  // ... 现有权限
  permissionRule('my.tool', 'ask'),  // 需要用户确认
  // 或
  permissionRule('my.tool', 'allow'),  // 自动允许
  // 或
  permissionRule('my.tool', 'deny'),  // 拒绝
];
```

### 4. 测试工具

创建测试文件 `tests/unit/my-tool.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { myTool } from '../../src/tool/my-tool';

describe('myTool', () => {
  it('should execute correctly', async () => {
    const result = await myTool.execute({
      input: 'test',
    });
    
    expect(result).toBeDefined();
  });
  
  it('should validate parameters', async () => {
    await expect(
      myTool.execute({})
    ).rejects.toThrow();
  });
});
```

## 示例

### 示例 1: 简单的文本处理工具

```typescript
const textTransform: LocalToolDefinition = {
  name: 'textTransform',
  permission: 'text.transform',
  description: 'Transform text using various operations (uppercase, lowercase, reverse)',
  
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text to transform',
      },
      operation: {
        type: 'string',
        enum: ['uppercase', 'lowercase', 'reverse'],
        description: 'The transformation operation',
      },
    },
    required: ['text', 'operation'],
  },
  
  pattern(args) {
    return `textTransform ${args.operation} "${args.text}"`;
  },
  
  async execute(args) {
    const { text, operation } = args as { text: string; operation: string };
    
    switch (operation) {
      case 'uppercase':
        return text.toUpperCase();
      case 'lowercase':
        return text.toLowerCase();
      case 'reverse':
        return text.split('').reverse().join('');
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  },
};
```

### 示例 2: 文件统计工具

```typescript
import fs from 'fs/promises';
import path from 'path';

const fileStats: LocalToolDefinition = {
  name: 'fileStats',
  permission: 'workspace.file_stats',
  description: 'Get statistics about a file (size, lines, words)',
  
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the file',
      },
    },
    required: ['filePath'],
  },
  
  pattern(args) {
    return `fileStats ${args.filePath}`;
  },
  
  async execute(args) {
    const { filePath } = args as { filePath: string };
    
    // 读取文件
    const content = await fs.readFile(filePath, 'utf-8');
    const stats = await fs.stat(filePath);
    
    // 计算统计信息
    const lines = content.split('\n').length;
    const words = content.split(/\s+/).filter(w => w.length > 0).length;
    const chars = content.length;
    
    return {
      path: filePath,
      size: stats.size,
      lines,
      words,
      chars,
      modified: stats.mtime,
    };
  },
};
```

### 示例 3: 代码图谱查询工具

```typescript
const findDependencies: LocalToolDefinition = {
  name: 'findDependencies',
  permission: 'code_graph.find_dependencies',
  description: 'Find all dependencies of a given symbol',
  
  parameters: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'The symbol name to analyze',
      },
      depth: {
        type: 'number',
        description: 'Maximum depth to traverse',
        minimum: 1,
        maximum: 10,
        default: 3,
      },
    },
    required: ['symbol'],
  },
  
  pattern(args) {
    return `findDependencies ${args.symbol} depth=${args.depth || 3}`;
  },
  
  async execute(args) {
    const { symbol, depth = 3 } = args as { symbol: string; depth?: number };
    
    // 使用 GraphQueryService
    const queryService = new GraphQueryService(store);
    
    // 递归查找依赖
    const dependencies = new Set<string>();
    const visited = new Set<string>();
    
    async function traverse(sym: string, currentDepth: number) {
      if (currentDepth > depth || visited.has(sym)) {
        return;
      }
      
      visited.add(sym);
      
      const callees = queryService.findCallees(sym);
      for (const callee of callees) {
        dependencies.add(callee.node.qualifiedName || callee.node.name);
        await traverse(callee.node.name, currentDepth + 1);
      }
    }
    
    await traverse(symbol, 1);
    
    return {
      symbol,
      dependencies: Array.from(dependencies),
      count: dependencies.size,
    };
  },
};
```

### 示例 4: HTTP 请求工具

```typescript
const httpRequest: LocalToolDefinition = {
  name: 'httpRequest',
  permission: 'web.http_request',
  description: 'Make HTTP requests to external APIs',
  
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to request',
      },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'HTTP method',
        default: 'GET',
      },
      headers: {
        type: 'object',
        description: 'Request headers',
      },
      body: {
        type: 'string',
        description: 'Request body (for POST/PUT)',
      },
    },
    required: ['url'],
  },
  
  pattern(args) {
    return `httpRequest ${args.method || 'GET'} ${args.url}`;
  },
  
  async execute(args) {
    const { url, method = 'GET', headers = {}, body } = args as {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    };
    
    const response = await fetch(url, {
      method,
      headers,
      body: body ? body : undefined,
    });
    
    const contentType = response.headers.get('content-type');
    const data = contentType?.includes('application/json')
      ? await response.json()
      : await response.text();
    
    return {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data,
    };
  },
};
```

## 最佳实践

### 1. 参数验证

始终验证输入参数：

```typescript
async execute(args) {
  const { param1, param2 } = args as { param1: string; param2?: number };
  
  if (!param1 || param1.trim().length === 0) {
    throw new Error('param1 is required and cannot be empty');
  }
  
  if (param2 !== undefined && param2 < 0) {
    throw new Error('param2 must be non-negative');
  }
  
  // 继续执行
}
```

### 2. 错误处理

提供清晰的错误信息：

```typescript
async execute(args) {
  try {
    const result = await riskyOperation(args);
    return result;
  } catch (error) {
    if (error instanceof FileNotFoundError) {
      throw new Error(`File not found: ${args.filePath}`);
    }
    
    if (error instanceof PermissionError) {
      throw new Error(`Permission denied: ${error.message}`);
    }
    
    // 重新抛出未知错误
    throw error;
  }
}
```

### 3. 返回结构化数据

返回易于解析的结构化数据：

```typescript
// ✅ 好
return {
  success: true,
  data: {
    files: ['a.ts', 'b.ts'],
    count: 2,
  },
};

// ❌ 不好
return 'Found 2 files: a.ts, b.ts';
```

### 4. 权限模式

提供清晰的权限模式：

```typescript
pattern(args) {
  // ✅ 好 - 清晰描述操作
  return `editFile ${args.filePath}`;
  
  // ❌ 不好 - 不够具体
  return 'edit';
}
```

### 5. 文档字符串

提供详细的描述：

```typescript
description: `
  Search for files matching a glob pattern.
  
  Examples:
  - "**/*.ts" - All TypeScript files
  - "src/**/*.test.ts" - All test files in src
  - "*.{js,ts}" - All JS and TS files in current directory
  
  Returns an array of file paths relative to the project root.
`.trim(),
```

### 6. 性能考虑

- 避免阻塞操作
- 使用流式处理大文件
- 设置超时
- 限制结果数量

```typescript
async execute(args) {
  const { query, limit = 100 } = args;
  
  // 设置超时
  const timeout = setTimeout(() => {
    throw new Error('Operation timed out');
  }, 30000);
  
  try {
    const results = await search(query);
    return results.slice(0, limit);  // 限制结果
  } finally {
    clearTimeout(timeout);
  }
}
```

### 7. 安全考虑

- 验证文件路径（防止路径遍历）
- 清理用户输入
- 避免执行任意代码
- 限制资源使用

```typescript
async execute(args) {
  const { filePath } = args;
  
  // 验证路径
  const resolvedPath = path.resolve(projectRoot, filePath);
  if (!resolvedPath.startsWith(projectRoot)) {
    throw new Error('Path traversal detected');
  }
  
  // 继续执行
}
```

## 测试

### 单元测试

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { myTool } from '../../src/tool/my-tool';
import { createTempDir, cleanupTempDir } from '../helpers/test-utils';

describe('myTool', () => {
  let tempDir: string;
  
  beforeEach(() => {
    tempDir = createTempDir('my-tool-test');
  });
  
  afterEach(() => {
    cleanupTempDir(tempDir);
  });
  
  it('should execute successfully with valid input', async () => {
    const result = await myTool.execute({
      input: 'test',
    });
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });
  
  it('should throw error with invalid input', async () => {
    await expect(
      myTool.execute({ input: '' })
    ).rejects.toThrow('input cannot be empty');
  });
  
  it('should handle edge cases', async () => {
    const result = await myTool.execute({
      input: 'edge-case',
    });
    
    expect(result).toMatchObject({
      success: true,
      data: expect.any(Object),
    });
  });
});
```

### 集成测试

```typescript
describe('myTool integration', () => {
  it('should work with real files', async () => {
    const projectDir = createTestProject('test', {
      'test.txt': 'Hello, World!',
    });
    
    const result = await myTool.execute({
      filePath: path.join(projectDir, 'test.txt'),
    });
    
    expect(result.content).toBe('Hello, World!');
    
    cleanupTempDir(projectDir);
  });
});
```

## 调试

### 添加日志

```typescript
async execute(args) {
  console.log('[myTool] Executing with args:', args);
  
  try {
    const result = await doSomething(args);
    console.log('[myTool] Result:', result);
    return result;
  } catch (error) {
    console.error('[myTool] Error:', error);
    throw error;
  }
}
```

### 使用调试器

在 VS Code 中添加断点，然后运行：

```bash
node --inspect-brk dist/bin/code-agent.js run "test"
```

## 发布工具

### 1. 文档

在 `docs/tools/` 创建工具文档：

```markdown
# myTool

## 描述
我的自定义工具的详细说明。

## 参数
- `input` (string, required) - 输入参数
- `options` (object, optional) - 可选配置

## 示例
\`\`\`typescript
await myTool.execute({
  input: 'test',
  options: { verbose: true },
});
\`\`\`

## 返回值
返回一个包含结果的对象。
```

### 2. 更新 README

在 README 中添加工具说明。

### 3. 添加测试

确保有完整的测试覆盖。

### 4. 提交 PR

提交 Pull Request 并等待审核。

## 参考资料

- [工具注册表源码](../src/tool/registry.ts)
- [现有工具示例](../src/tool/)
- [测试示例](../tests/unit/)
