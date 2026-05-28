# Test Agent 实现文档

## 概述

Test Agent 是一个测试生成专家，专注于分析代码并生成高覆盖率的综合测试用例。

## 实现状态

✅ **已完成**

- [x] 创建 Test Agent system prompt (`src/agent/prompts/test.txt`)
- [x] 更新 `src/agent/prompts.ts` 导出 TEST_SYSTEM_PROMPT
- [x] 更新 `src/agent/agent.ts` 添加 testAgent 定义
- [x] 配置权限系统（可写测试文件 + 代码图谱分析）
- [x] 更新 AgentName 类型定义
- [x] 构建验证通过
- [x] 创建测试目标文件 `test-target.ts`

## 特性

### 1. 测试文件生成
- ✅ 读取源代码 (`workspace.read`)
- ✅ 搜索现有测试 (`workspace.grep`, `workspace.glob`)
- ✅ 查看 Git 变更 (`workspace.git_diff`)
- ✅ 代码图谱分析 (`code_graph.*`)
- ✅ 编辑测试文件 (`workspace.edit: allow`)
- ✅ 创建测试文件 (`workspace.write: allow`)
- 🔶 运行测试需确认 (`workspace.shell: ask`)
- ❌ 禁止危险命令

### 2. 五阶段测试生成流程

#### Phase 1: 分析目标代码
1. **读取目标代码**
   - 理解函数/类实现
   - 识别输入、输出、副作用

2. **代码图谱分析**
   ```typescript
   code_graph.find_callees(target)    // 找依赖（需要 mock）
   code_graph.find_callers(target)    // 找调用者（实际用法）
   code_graph.analyze_complexity()    // 分析复杂度
   workspace.grep('describe.*target') // 检查现有测试
   ```

3. **理解上下文**
   - 代码做什么？
   - 输入输出是什么？
   - 有哪些依赖？
   - 可能出什么问题？

#### Phase 2: 检测测试框架
- 检查 `package.json`
- 查看现有测试文件
- 识别框架：Jest、Vitest、Mocha、Node test runner
- **匹配现有风格**

#### Phase 3: 规划测试策略
```markdown
## Test Plan

### Function Signature
function calculateTotal(price, quantity, taxRate): number

### Dependencies
- None (pure function)

### Test Categories
1. **Happy Path**: Valid inputs → expected output
2. **Edge Cases**: Zero, negative, boundary values
3. **Error Handling**: Invalid inputs, exceptions

### Mock Strategy
- No mocks needed (pure function)

### Coverage Target
- Statements: >90%
- Branches: >85%
- Functions: 100%
```

#### Phase 4: 生成测试代码
- 使用 **AAA 模式**（Arrange, Act, Assert）
- 匹配项目测试风格
- 生成 describe/it 结构
- 创建必要的 mocks
- 添加清晰的断言

#### Phase 5: 运行和验证
- 运行测试
- 检查覆盖率
- 分析结果
- 生成报告

### 3. 支持的测试场景

| 场景 | 说明 | 示例 |
|------|------|------|
| **纯函数** | 无副作用 | calculateTotal |
| **异步函数** | Promise/async-await | fetchUserProfile |
| **类方法** | 带依赖注入 | UserService.createUser |
| **复杂条件** | 多分支逻辑 | calculateShippingCost |
| **数组处理** | filter/map/reduce | filterActiveUsers |
| **超时处理** | AbortController | fetchWithTimeout |
| **事件发射** | EventEmitter 模式 | OrderProcessor |

### 4. 代码图谱集成

Test Agent 利用代码图谱理解代码：

```typescript
// 找到依赖（需要 mock）
const dependencies = await code_graph.find_callees('UserService.createUser');
// 返回: [userRepository.findByEmail, userRepository.save, emailService.sendWelcomeEmail]

// 找到调用者（了解实际用法）
const callers = await code_graph.find_callers('calculateTotal');
// 返回: [OrderService.processOrder, CartService.getTotal]

// 分析复杂度（决定测试深度）
const complexity = await code_graph.analyze_complexity();
// 返回: { complexity: 8, branches: 12 }
```

## 使用方法

### 方式 1: CLI 命令

```bash
# 为单个函数生成测试
npm run cli run "Generate tests for calculateTotal function in test-target.ts" --agent test

# 为整个类生成测试
npm run cli run "Generate tests for UserService class" --agent test

# 为文件生成测试
npm run cli run "Generate tests for all functions in test-target.ts" --agent test

# 提高覆盖率
npm run cli run "Add tests to improve coverage for calculateShippingCost" --agent test

# 生成特定类型的测试
npm run cli run "Generate edge case tests for filterActiveUsers" --agent test
```

### 方式 2: 编程方式

```typescript
import { AgentRuntime } from './runtime';
import { createDeepSeekProvider } from './provider';

const runtime = new AgentRuntime();
const provider = createDeepSeekProvider();

const result = await runtime.run({
  task: 'Generate comprehensive tests for UserService.createUser',
  projectPath: '/path/to/project',
  provider,
  agent: 'test',
  onEvent: (event) => console.log(event),
});
```

## 权限配置

```typescript
permission: [
  // 只读权限
  permissionRule('workspace.glob', 'allow'),
  permissionRule('workspace.grep', 'allow'),
  permissionRule('workspace.read', 'allow'),
  permissionRule('workspace.git_diff', 'allow'),
  
  // 代码图谱分析
  permissionRule('code_graph.*', 'allow'),
  
  // 可以写测试文件
  permissionRule('workspace.edit', 'allow'),
  permissionRule('workspace.write', 'allow'),
  permissionRule('workspace.apply_patch', 'allow'),
  
  // 运行测试需要确认
  permissionRule('workspace.shell', 'ask'),
  
  // 禁止危险操作
  permissionRule('workspace.shell', 'deny', 'rm *'),
  permissionRule('workspace.shell', 'deny', 'git reset --hard*'),
]
```

## 输出格式

### 阶段 1: 测试计划

```markdown
## Test Plan for `calculateTotal`

### Function Signature
\`\`\`typescript
function calculateTotal(price: number, quantity: number, taxRate: number = 0.1): number
\`\`\`

### Dependencies Analysis
- None (pure function)

### Test Categories

#### 1. Happy Path
- Valid positive numbers → correct total with tax
- Default tax rate → 10% tax applied

#### 2. Edge Cases
- Zero price → 0 total
- Zero quantity → 0 total
- Very large numbers → correct calculation
- Custom tax rate → correct tax applied

#### 3. Error Handling
- Negative price → throws Error
- Negative quantity → throws Error

### Mock Strategy
- No mocks needed

### Coverage Target
- Statements: >90%
- Branches: >85%
- Functions: 100%
```

### 阶段 2: 生成的测试代码

```typescript
import { describe, it, expect } from 'vitest';
import { calculateTotal } from './test-target';

describe('calculateTotal', () => {
  describe('Happy Path', () => {
    it('should calculate total with default tax rate', () => {
      // Arrange
      const price = 100;
      const quantity = 2;

      // Act
      const result = calculateTotal(price, quantity);

      // Assert
      expect(result).toBe(220); // 200 + 20 (10% tax)
    });

    it('should calculate total with custom tax rate', () => {
      // Arrange
      const price = 100;
      const quantity = 2;
      const taxRate = 0.2;

      // Act
      const result = calculateTotal(price, quantity, taxRate);

      // Assert
      expect(result).toBe(240); // 200 + 40 (20% tax)
    });
  });

  describe('Edge Cases', () => {
    it('should return 0 when price is 0', () => {
      const result = calculateTotal(0, 5);
      expect(result).toBe(0);
    });

    it('should return 0 when quantity is 0', () => {
      const result = calculateTotal(100, 0);
      expect(result).toBe(0);
    });

    it('should handle very large numbers', () => {
      const result = calculateTotal(1000000, 1000);
      expect(result).toBe(1100000000); // 1B + 100M tax
    });
  });

  describe('Error Handling', () => {
    it('should throw error when price is negative', () => {
      expect(() => calculateTotal(-10, 5)).toThrow('Price and quantity must be non-negative');
    });

    it('should throw error when quantity is negative', () => {
      expect(() => calculateTotal(100, -5)).toThrow('Price and quantity must be non-negative');
    });
  });
});
```

### 阶段 3: 验证报告

```markdown
## Test Generation Complete ✅

### Tests Created
- **File**: `test-target.test.ts`
- **Test suites**: 3
- **Test cases**: 7

### Coverage
- ✅ Statements: 100%
- ✅ Branches: 100%
- ✅ Functions: 100%
- ✅ Lines: 100%

### Test Categories
- Happy path: 2 tests
- Edge cases: 3 tests
- Error handling: 2 tests

### Verification
- ✅ All 7 tests passing
- ✅ No flaky tests
- ✅ Fast execution (45ms)

### Next Steps
- Tests are ready to commit
- Consider adding integration tests for UserService
```

## 测试场景

`test-target.ts` 包含 7 种测试场景：

1. **纯函数** - `calculateTotal` (简单计算)
2. **异步函数** - `fetchUserProfile` (外部 API)
3. **类与依赖** - `UserService` (多个依赖注入)
4. **复杂条件** - `calculateShippingCost` (多分支逻辑)
5. **数组处理** - `filterActiveUsers` (数组过滤)
6. **超时处理** - `fetchWithTimeout` (AbortController)
7. **事件模式** - `OrderProcessor` (EventEmitter)

## 测试质量指南

### ✅ DO

1. **描述性测试名称**
   ```typescript
   it('should throw AuthenticationError when user not found', () => {})
   ```

2. **一个测试一个断言**
   ```typescript
   it('should return user when credentials are valid', () => {
     expect(user).toEqual(expectedUser);
   });
   ```

3. **使用真实测试数据**
   ```typescript
   const testUser = {
     email: 'john.doe@example.com',
     name: 'John Doe',
   };
   ```

4. **测试错误消息**
   ```typescript
   await expect(fn()).rejects.toThrow('Email is required');
   ```

5. **Mock 外部依赖**
   ```typescript
   mockUserRepo.findByEmail.mockResolvedValue(mockUser);
   ```

### ❌ DON'T

1. 不要测试私有方法
2. 不要在测试中复制生产逻辑
3. 不要创建相互依赖的测试
4. 不要使用 Magic Numbers
5. 不要跳过错误用例

## 覆盖率目标

- **Statement coverage**: >90%
- **Branch coverage**: >85%
- **Function coverage**: 100%
- **Line coverage**: >90%

## 技术细节

### 文件结构

```
src/agent/
├── agent.ts                    # Agent 定义（已更新）
├── prompts.ts                  # Prompt 导出（已更新）
└── prompts/
    ├── review.txt              # Review Agent prompt
    ├── refactor.txt            # Refactor Agent prompt
    └── test.txt                # Test Agent prompt（新增）
```

### 关键代码

**agent.ts**:
```typescript
export const testAgent: AgentInfo = {
  name: 'test',
  mode: 'primary',
  description: 'Test generation specialist...',
  systemPrompt: TEST_SYSTEM_PROMPT,
  maxSteps: 80,
  permission: mergeAgentPermissions(basePermissions, [...]),
};
```

## 与其他 Agent 的协作

Test Agent 可以与其他 Agent 很好地配合：

```bash
# 完整开发流程
# 1. 实现功能
npm run cli run "Implement user authentication" --agent build

# 2. 生成测试
npm run cli run "Generate tests for authentication" --agent test

# 3. 审查代码
npm run cli run "Review authentication code and tests" --agent review

# 4. 重构（如需要）
npm run cli run "Refactor authentication logic" --agent refactor

# 5. 更新测试（如需要）
npm run cli run "Update tests after refactoring" --agent test
```

## 最佳实践

1. **先写测试计划**：理解要测试什么
2. **匹配项目风格**：使用相同的测试框架和模式
3. **全面覆盖**：Happy path + Edge cases + Error handling
4. **Mock 外部依赖**：避免真实数据库/API 调用
5. **快速可靠**：测试应该快速且一致
6. **可维护性**：清晰的测试名称和结构

## 下一步

Test Agent 已经完全实现。接下来可以实现：

1. 📚 **Doc Agent** - 文档生成专家
2. 🐛 **Debug Agent** - 问题诊断专家

## 相关文档

- [Agent 系统设计文档](./AGENT_DESIGN.md)
- [Review Agent 文档](./REVIEW_AGENT.md)
- [Refactor Agent 文档](./REFACTOR_AGENT.md)
