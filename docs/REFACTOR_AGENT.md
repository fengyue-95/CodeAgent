# Refactor Agent 实现文档

## 概述

Refactor Agent 是一个安全的代码重构专家，专注于通过影响分析进行智能、渐进式的代码重构。

## 实现状态

✅ **已完成**

- [x] 创建 Refactor Agent system prompt (`src/agent/prompts/refactor.txt`)
- [x] 更新 `src/agent/prompts.ts` 导出 REFACTOR_SYSTEM_PROMPT
- [x] 更新 `src/agent/agent.ts` 添加 refactorAgent 定义
- [x] 配置权限系统（读写需确认 + 代码图谱分析）
- [x] 更新 AgentName 类型定义
- [x] 构建验证通过
- [x] 创建测试文件 `test-refactor.ts`

## 特性

### 1. 安全重构
- ✅ 读取文件 (`workspace.read`)
- ✅ 搜索代码 (`workspace.grep`, `workspace.glob`)
- ✅ 查看 Git 变更 (`workspace.git_diff`)
- ✅ 代码图谱分析 (`code_graph.*`)
- 🔶 编辑文件需确认 (`workspace.edit: ask`)
- 🔶 创建文件需确认 (`workspace.write: ask`)
- 🔶 运行测试需确认 (`workspace.shell: ask`)
- ❌ 禁止危险命令（rm, git reset --hard 等）

### 2. 三阶段重构流程

#### Phase 1: 分析阶段（只读）
1. **理解目标代码**
   - 读取要重构的代码
   - 理解当前实现
   - 识别重构机会

2. **影响分析**
   ```typescript
   // 使用代码图谱工具
   code_graph.analyze_impact(symbol)  // 找到所有引用
   code_graph.find_callers(symbol)    // 找到调用者
   code_graph.find_callees(symbol)    // 找到依赖
   code_graph.find_circular_deps()    // 检测循环依赖
   ```

3. **风险评估**
   - 影响的文件数量
   - 测试覆盖率
   - 变更复杂度
   - 是否可以增量进行

4. **生成重构计划**
   - 明确的步骤
   - 风险等级
   - 回滚方案

#### Phase 2: 执行阶段（渐进式）
- 一次一个变更
- 每步后验证语法
- 关键点运行测试
- 使用正确的工具（edit vs write）

#### Phase 3: 验证阶段
- 运行测试
- 检查类型错误
- 审查变更
- 生成总结

### 3. 支持的重构类型

| 重构类型 | 说明 | 使用场景 |
|---------|------|---------|
| **Extract Function** | 提取函数 | 代码块做特定任务 |
| **Extract Variable** | 提取变量 | 复杂表达式需要命名 |
| **Rename** | 重命名符号 | 名称不清晰或误导 |
| **Move** | 移动代码 | 代码在错误的模块 |
| **Inline** | 内联函数/变量 | 抽象无价值 |
| **Simplify Conditional** | 简化条件 | 复杂嵌套 if/else |
| **Remove Duplication** | 消除重复 | 相同代码多次出现 |

### 4. 代码图谱集成

Refactor Agent 深度依赖代码图谱：

```typescript
// 重命名前必须使用
const impact = await code_graph.analyze_impact('functionName');
// 返回所有引用位置

// 查找调用者
const callers = await code_graph.find_callers('functionName');

// 查找被调用者
const callees = await code_graph.find_callees('functionName');

// 检测循环依赖
const cycles = await code_graph.find_circular_deps();
```

## 使用方法

### 方式 1: CLI 命令

```bash
# 提取函数
npm run cli run "Extract the validation logic from processUserRegistration in test-refactor.ts" --agent refactor

# 重命名符号
npm run cli run "Rename the function 'calc' to something more descriptive in test-refactor.ts" --agent refactor

# 简化条件
npm run cli run "Simplify the nested conditionals in getShippingCost function" --agent refactor

# 消除重复
npm run cli run "Remove the duplicated validation logic in test-refactor.ts" --agent refactor

# 移动代码
npm run cli run "Move the validation functions to a separate validator.ts file" --agent refactor
```

### 方式 2: 编程方式

```typescript
import { AgentRuntime } from './runtime';
import { createDeepSeekProvider } from './provider';

const runtime = new AgentRuntime();
const provider = createDeepSeekProvider();

const result = await runtime.run({
  task: 'Extract validation logic from processUserRegistration',
  projectPath: '/path/to/project',
  provider,
  agent: 'refactor',
  onEvent: (event) => console.log(event),
  onPermissionRequest: (request) => {
    // 用户确认修改
    return true;
  },
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
  
  // 修改需要确认
  permissionRule('workspace.edit', 'ask'),
  permissionRule('workspace.write', 'ask'),
  permissionRule('workspace.apply_patch', 'ask'),
  
  // 运行测试需要确认
  permissionRule('workspace.shell', 'ask'),
  
  // 禁止危险操作
  permissionRule('workspace.shell', 'deny', 'rm *'),
  permissionRule('workspace.shell', 'deny', 'rm -rf *'),
  permissionRule('workspace.shell', 'deny', 'git reset --hard*'),
  permissionRule('workspace.shell', 'deny', 'git clean *'),
  permissionRule('workspace.shell', 'deny', 'git push --force*'),
]
```

## 输出格式

### 阶段 1: 重构计划

```markdown
## Refactoring Plan

### Target
`test-refactor.ts:5-30` - processUserRegistration function

### Type
Extract Function

### Motivation
The function is 65 lines long and does multiple things:
validation, transformation, database operations, and notifications.
This violates Single Responsibility Principle.

### Impact Analysis
- **Files to modify**: 1 (test-refactor.ts)
- **References found**: 3 (via code_graph.analyze_impact)
- **Callers**: 2 functions (registerUser, adminCreateUser)
- **Test coverage**: 75%
- **Circular dependencies**: No

### Refactoring Steps
1. Extract validation logic to `validateUserRegistrationData()`
2. Extract data transformation to `transformUserData()`
3. Extract database operation to `saveUser()`
4. Extract notification to `sendWelcomeNotification()`
5. Update processUserRegistration to call these functions
6. Run tests to verify

### Risk Assessment
- **Risk Level**: Low
- **Reversible**: Yes (git revert)
- **Tests Required**: Yes
- **Breaking Changes**: No (internal refactoring only)

### Rollback Plan
If tests fail: `git checkout test-refactor.ts`
```

### 阶段 2: 执行过程

```markdown
## Executing Refactoring

### Step 1: Extract validation function ✅
Created `validateUserRegistrationData()` function

### Step 2: Update processUserRegistration ✅
Replaced inline validation with function call

### Step 3: Run tests 🔄
Running: npm test -- test-refactor.test.ts
```

### 阶段 3: 完成总结

```markdown
## Refactoring Complete ✅

### Changes Made
- **Modified**: test-refactor.ts
- **Added**: None
- **Removed**: None

### Verification
- ✅ Tests: 12 passed, 0 failed
- ✅ Type check: No errors
- ✅ Linting: Clean

### Impact
- 1 file changed
- 4 new functions extracted
- 65 lines → 4 functions of ~15 lines each
- Complexity reduced from 15 to 3-4 per function

### Improvements
- Better separation of concerns
- Each function has single responsibility
- Easier to test individual pieces
- More reusable validation logic

### Next Steps
- Consider extracting similar validation in updateUserProfile
- Add unit tests for new validation function
```

## 测试场景

`test-refactor.ts` 包含 7 种常见重构场景：

1. ❌ **长函数** - `processUserRegistration` (65 行，做太多事)
2. ❌ **代码重复** - 验证逻辑在多处重复
3. ❌ **命名不清** - `calc` 函数名不明确
4. ❌ **Magic Numbers** - `calculatePrice` 中的硬编码数字
5. ❌ **复杂条件** - `getShippingCost` 嵌套 if/else
6. ❌ **重复模式** - 多个格式化函数做相同的事
7. ❌ **长参数列表** - `createOrder` 有 10 个参数
8. ✅ **良好示例** - `authenticateUser` 结构清晰

## 安全规则

### ❌ 绝对不要

- 跳过影响分析
- 同时进行多个不相关的变更
- 在没有测试的情况下重构
- 不使用 code_graph 就重命名
- 假设你知道所有调用者
- 未经批准进行破坏性变更

### ✅ 始终要

- 重命名或移动前使用 `code_graph.analyze_impact`
- 每步后验证
- 保持变更可逆
- 结构变更后运行测试
- 破坏性变更前请求批准
- 记录重构原因

## 技术细节

### 文件结构

```
src/agent/
├── agent.ts                    # Agent 定义（已更新）
├── prompts.ts                  # Prompt 导出（已更新）
└── prompts/
    ├── review.txt              # Review Agent prompt
    └── refactor.txt            # Refactor Agent prompt（新增）
```

### 关键代码

**agent.ts**:
```typescript
export const refactorAgent: AgentInfo = {
  name: 'refactor',
  mode: 'primary',
  description: 'Safe refactoring specialist...',
  systemPrompt: REFACTOR_SYSTEM_PROMPT,
  maxSteps: 100,
  permission: mergeAgentPermissions(basePermissions, [...]),
};
```

**prompts.ts**:
```typescript
const REFACTOR_PROMPT_PATH = path.join(__dirname, 'prompts', 'refactor.txt');
export const REFACTOR_SYSTEM_PROMPT = fs.existsSync(REFACTOR_PROMPT_PATH)
  ? fs.readFileSync(REFACTOR_PROMPT_PATH, 'utf-8')
  : 'You are CodeAgent refactor mode...';
```

## 与 Review Agent 的协作

Refactor Agent 和 Review Agent 可以很好地配合：

```bash
# 1. 先审查代码
npm run cli run "Review test-refactor.ts" --agent review

# 2. 根据审查结果重构
npm run cli run "Refactor the issues found in test-refactor.ts" --agent refactor

# 3. 再次审查验证
npm run cli run "Review the refactored code" --agent review
```

## 最佳实践

1. **小步快跑**：每次只做一个重构
2. **先分析后行动**：始终使用 code_graph 分析影响
3. **频繁验证**：每步后检查语法和运行测试
4. **保持可逆**：确保可以轻松回滚
5. **文档化原因**：记录为什么要重构
6. **寻找模式**：重构一处后，查找类似问题

## 下一步

Refactor Agent 已经完全实现。接下来可以实现：

1. 🧪 **Test Agent** - 测试生成专家
2. 📚 **Doc Agent** - 文档生成专家
3. 🐛 **Debug Agent** - 问题诊断专家

## 相关文档

- [Agent 系统设计文档](./AGENT_DESIGN.md)
- [Review Agent 文档](./REVIEW_AGENT.md)
- [代码图谱 API](../src/graph/README.md)
