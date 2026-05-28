# Review Agent 实现文档

## 概述

Review Agent 是一个专业的代码审查代理，专注于分析代码质量、安全漏洞、性能问题和架构设计。

## 实现状态

✅ **已完成**

- [x] 创建 Review Agent system prompt (`src/agent/prompts/review.txt`)
- [x] 更新 `src/agent/prompts.ts` 导出 REVIEW_SYSTEM_PROMPT
- [x] 更新 `src/agent/agent.ts` 添加 reviewAgent 定义
- [x] 配置权限系统（只读 + 代码图谱分析）
- [x] 更新 AgentName 类型定义
- [x] 构建验证通过
- [x] 创建测试文件 `test-review.ts`

## 特性

### 1. 只读分析
- ✅ 读取文件 (`workspace.read`)
- ✅ 搜索代码 (`workspace.grep`, `workspace.glob`)
- ✅ 查看 Git 变更 (`workspace.git_diff`)
- ✅ 代码图谱分析 (`code_graph.*`)
- ❌ 禁止修改文件
- ❌ 禁止执行命令

### 2. 多维度审查

#### 🔴 安全性（最高优先级）
- SQL 注入
- 命令注入
- XSS 攻击
- 认证/授权漏洞
- 敏感数据泄露
- 不安全的依赖

#### 🟡 性能
- N+1 查询问题
- 不必要的循环
- 内存泄漏
- 低效算法
- 阻塞操作

#### 🟢 代码质量
- 命名规范
- 函数复杂度
- 代码重复
- 错误处理
- Magic Numbers

#### 🔵 架构
- 循环依赖
- 紧耦合
- 单一职责原则
- 抽象层次

### 3. 代码图谱集成

Review Agent 充分利用代码图谱能力：

```typescript
// 分析复杂度
code_graph.analyze_complexity()

// 查找循环依赖
code_graph.find_circular_deps()

// 分析依赖关系
code_graph.analyze_dependencies()

// 影响分析
code_graph.analyze_impact(symbol)

// 查找死代码
code_graph.find_dead_code()
```

## 使用方法

### 方式 1: CLI 命令

```bash
# 审查单个文件
npm run cli run "Review test-review.ts" --agent review

# 审查整个目录
npm run cli run "Review all files in src/auth/" --agent review

# 审查 Git 变更
npm run cli run "Review my recent changes" --agent review

# 专注安全审查
npm run cli run "Review test-review.ts focusing on security issues" --agent review
```

### 方式 2: 编程方式

```typescript
import { AgentRuntime } from './runtime';
import { createDeepSeekProvider } from './provider';

const runtime = new AgentRuntime();
const provider = createDeepSeekProvider();

const result = await runtime.run({
  task: 'Review the authentication code in src/auth/',
  projectPath: '/path/to/project',
  provider,
  agent: 'review',
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
  
  // 可选的外部查询（需要用户确认）
  permissionRule('web.fetch', 'ask'),
  permissionRule('web.search', 'ask'),
  
  // 禁止修改
  permissionRule('workspace.apply_patch', 'deny'),
  permissionRule('workspace.edit', 'deny'),
  permissionRule('workspace.write', 'deny'),
  permissionRule('workspace.shell', 'deny'),
]
```

## 输出格式

Review Agent 生成结构化的审查报告：

```markdown
## Code Review Report

### 📊 Overview
- Files Reviewed: 3
- Lines of Code: 450
- Issues Found: 5 (Critical: 2, Warning: 2, Info: 1)

### 🔴 Critical Issues

1. **SQL Injection Vulnerability** `src/db/query.ts:45`
   - **Problem**: User input directly concatenated into SQL query
   - **Impact**: Attacker could execute arbitrary SQL commands
   - **Fix**: Use parameterized queries
   ```typescript
   // Fixed:
   const query = 'SELECT * FROM users WHERE email = ?';
   const result = await db.query(query, [email]);
   ```

### 🟡 Warnings

2. **N+1 Query Problem** `src/api/users.ts:67-72`
   - **Problem**: Database query inside loop
   - **Impact**: Slow response time with many users
   - **Fix**: Fetch all posts in a single query

### 💡 Suggestions

3. **Function Complexity** `src/user/service.ts:120-185`
   - **Problem**: Function is 65 lines with complexity of 12
   - **Impact**: Hard to understand and maintain
   - **Fix**: Extract into smaller functions

### ✅ Good Practices Found
- Excellent error handling in auth module
- Clear function naming
- Good test coverage (87%)

### 🎯 Recommendations
1. **Immediate**: Fix SQL injection (Critical)
2. **Short-term**: Optimize N+1 queries (Performance)
3. **Medium-term**: Refactor complex functions (Maintainability)
```

## 测试

### 测试文件

`test-review.ts` 包含多种常见代码问题：

- ❌ SQL 注入漏洞
- ❌ N+1 查询问题
- ❌ 缺少错误处理
- ❌ 内存泄漏（事件监听器）
- ❌ 函数过于复杂
- ❌ Magic Numbers
- ❌ 命名不清晰
- ✅ 良好的错误处理示例

### 运行测试

```bash
# 使用测试脚本
./test-review-agent.sh

# 或手动运行
npm run cli index
npm run cli run "Review test-review.ts" --agent review
```

## 技术细节

### 文件结构

```
src/agent/
├── agent.ts                    # Agent 定义（已更新）
├── prompts.ts                  # Prompt 导出（已更新）
└── prompts/
    └── review.txt              # Review Agent system prompt（新增）
```

### 关键代码

**agent.ts**:
```typescript
export const reviewAgent: AgentInfo = {
  name: 'review',
  mode: 'primary',
  description: 'Code review specialist...',
  systemPrompt: REVIEW_SYSTEM_PROMPT,
  maxSteps: 50,
  permission: mergeAgentPermissions(basePermissions, [...]),
};
```

**prompts.ts**:
```typescript
import * as fs from 'fs';
import * as path from 'path';

const REVIEW_PROMPT_PATH = path.join(__dirname, 'prompts', 'review.txt');
export const REVIEW_SYSTEM_PROMPT = fs.existsSync(REVIEW_PROMPT_PATH)
  ? fs.readFileSync(REVIEW_PROMPT_PATH, 'utf-8')
  : 'You are CodeAgent review mode...';
```

## 下一步

Review Agent 已经完全实现并可以使用。接下来可以实现其他 Agent：

1. ♻️ **Refactor Agent** - 代码重构专家
2. 🧪 **Test Agent** - 测试生成专家
3. 📚 **Doc Agent** - 文档生成专家
4. 🐛 **Debug Agent** - 问题诊断专家

## 相关文档

- [Agent 系统设计文档](./AGENT_DESIGN.md)
- [代码图谱 API](../src/graph/README.md)
- [权限系统](../src/agent/permission.ts)
