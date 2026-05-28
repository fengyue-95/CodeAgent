# Agent 模式实现说明

本文档说明了 CodeAgent 中五种 Agent 模式的技术实现细节。

## 架构概览

所有 Agent 模式共享相同的运行时基础设施（`AgentRuntime`），但通过以下三个维度进行差异化：

1. **系统提示词（System Prompt）**：定义 Agent 的行为和目标
2. **权限规则集（Permission Ruleset）**：控制工具访问权限
3. **最大步骤数（Max Steps）**：限制执行长度

## 代码结构

```
src/agent/
├── agent.ts          # Agent 定义和权限配置
├── prompts.ts        # 系统提示词
├── permission.ts     # 权限系统
└── index.ts          # 导出接口

src/runtime/
├── agent-runtime.ts  # Agent 执行引擎
└── session-processor.ts  # 会话处理
```

## Agent 定义

### 类型定义

```typescript
export type AgentName = 'build' | 'plan' | 'general' | 'explore' | 'scout';

export interface AgentInfo {
  name: AgentName;
  mode: AgentMode;
  description: string;
  systemPrompt: string;
  maxSteps: number;
  permission: AgentPermissionRuleset;
}
```

### 权限系统

权限规则采用三级决策：

```typescript
type PermissionAction = 'allow' | 'deny' | 'ask';

interface PermissionRule {
  permission: string;    // 如 'workspace.edit'
  action: PermissionAction;
  pattern?: string;      // 可选的匹配模式
}
```

权限评估顺序：
1. 检查是否有精确匹配的规则（包含 pattern）
2. 检查是否有通配符匹配的规则（如 `workspace.*`）
3. 使用默认规则（通常是 `ask`）

## 各模式实现细节

### 1. build - 默认开发模式

**系统提示词重点：**
- 强调使用 edit 工具而非 write 工具
- 大文件分步骤创建的指导
- 验证和总结要求

**权限配置：**
```typescript
permission: mergeAgentPermissions(basePermissions, [
  permissionRule('workspace.apply_patch', 'allow'),
  permissionRule('workspace.edit', 'allow'),
  permissionRule('workspace.write', 'allow'),
  permissionRule('workspace.shell', 'allow'),
  // 危险命令拒绝
  permissionRule('workspace.shell', 'deny', 'rm *'),
  permissionRule('workspace.shell', 'deny', 'rm -rf *'),
  permissionRule('workspace.shell', 'deny', 'git reset --hard*'),
  // ...
])
```

**特点：**
- 最大步骤：100
- 完整的文件操作权限
- 自动拒绝危险 shell 命令
- 不包含 web 访问

### 2. plan - 只读规划模式

**系统提示词重点：**
- 明确禁止修改文件
- 强调使用只读工具收集上下文
- 输出实现计划的格式要求

**权限配置：**
```typescript
permission: mergeAgentPermissions(basePermissions, [
  permissionRule('workspace.glob', 'allow'),
  permissionRule('workspace.grep', 'allow'),
  permissionRule('workspace.read', 'allow'),
  permissionRule('workspace.git_diff', 'allow'),
  // 拒绝所有修改操作
  permissionRule('workspace.apply_patch', 'deny'),
  permissionRule('workspace.edit', 'deny'),
  permissionRule('workspace.write', 'deny'),
  permissionRule('workspace.shell', 'deny'),
  permissionRule('task.run', 'deny'),
])
```

**特点：**
- 最大步骤：100
- 只读访问
- 可选的浏览器访问（需确认）

### 3. general - 通用多步骤任务

**系统提示词重点：**
- 强调多步骤工作流协调
- 鼓励使用代码图谱工具
- 增量执行和验证的方法论

**权限配置：**
```typescript
permission: mergeAgentPermissions(basePermissions, [
  // 完整的工作区权限
  permissionRule('workspace.apply_patch', 'allow'),
  permissionRule('workspace.edit', 'allow'),
  permissionRule('workspace.write', 'allow'),
  permissionRule('workspace.shell', 'allow'),
  // Web 访问权限
  permissionRule('web.fetch', 'allow'),
  permissionRule('web.search', 'allow'),
  permissionRule('browser.navigate', 'allow'),
  permissionRule('browser.screenshot', 'allow'),
  // 危险命令拒绝
  permissionRule('workspace.shell', 'deny', 'rm *'),
  // ...
])
```

**特点：**
- 最大步骤：100
- 最全面的权限
- 支持 web 搜索和文档获取
- 适合复杂工作流

### 4. explore - 快速代码库探索

**系统提示词重点：**
- 强调速度和广度
- 提供文件路径和行号
- 简洁的输出格式
- 识别架构模式

**权限配置：**
```typescript
permission: mergeAgentPermissions(basePermissions, [
  // 只读工作区访问
  permissionRule('workspace.glob', 'allow'),
  permissionRule('workspace.grep', 'allow'),
  permissionRule('workspace.read', 'allow'),
  permissionRule('workspace.git_diff', 'allow'),
  // 拒绝所有修改和外部访问
  permissionRule('workspace.apply_patch', 'deny'),
  permissionRule('workspace.edit', 'deny'),
  permissionRule('workspace.write', 'deny'),
  permissionRule('workspace.shell', 'deny'),
  permissionRule('task.run', 'deny'),
  permissionRule('web.fetch', 'deny'),
  permissionRule('web.search', 'deny'),
  permissionRule('browser.navigate', 'deny'),
])
```

**特点：**
- 最大步骤：50（优化快速探索）
- 纯本地只读访问
- 无 web 访问
- 专注代码理解

### 5. scout - 外部文档研究

**系统提示词重点：**
- 优先官方文档
- 版本特定信息
- 包含链接和示例
- 最佳实践推荐

**权限配置：**
```typescript
permission: mergeAgentPermissions(basePermissions, [
  // 只读工作区访问
  permissionRule('workspace.glob', 'allow'),
  permissionRule('workspace.grep', 'allow'),
  permissionRule('workspace.read', 'allow'),
  permissionRule('workspace.git_diff', 'allow'),
  // 拒绝修改
  permissionRule('workspace.apply_patch', 'deny'),
  permissionRule('workspace.edit', 'deny'),
  permissionRule('workspace.write', 'deny'),
  permissionRule('workspace.shell', 'deny'),
  permissionRule('task.run', 'deny'),
  // 允许 web 访问
  permissionRule('web.fetch', 'allow'),
  permissionRule('web.search', 'allow'),
  permissionRule('browser.navigate', 'allow'),
  permissionRule('browser.screenshot', 'allow'),
])
```

**特点：**
- 最大步骤：50（专注研究）
- 只读本地访问
- 完整 web 访问
- 外部信息收集

## 运行时集成

### Agent 解析

```typescript
export function resolveAgent(name: string | undefined): AgentInfo | undefined {
  if (!name) {
    return buildAgent;  // 默认
  }
  return isAgentName(name) ? agents[name] : undefined;
}

export function isAgentName(value: string): value is AgentName {
  return value === 'build' || value === 'plan' || value === 'general' 
    || value === 'explore' || value === 'scout';
}
```

### 权限评估

在 `AgentRuntime.loop()` 中，每个工具调用都会经过权限检查：

```typescript
const permission = evaluateAgentPermission(
  agent.permission,
  tool.permission,
  tool.pattern(args)
);

if (permission.action === 'deny') {
  // 拒绝执行
} else if (permission.action === 'ask') {
  // 请求用户确认
} else {
  // 自动允许
}
```

### 系统提示词注入

系统提示词在构建 provider messages 时注入：

```typescript
private providerMessages(agent: AgentInfo, timeline: SessionMessageWithParts[]): ProviderMessage[] {
  const messages: ProviderMessage[] = [
    {
      role: 'system',
      content: agent.systemPrompt,  // 注入 Agent 特定的系统提示词
    },
  ];
  // ... 添加历史消息
  return messages;
}
```

## 扩展新的 Agent 模式

要添加新的 Agent 模式，需要：

1. **更新类型定义**：
   ```typescript
   export type AgentName = 'build' | 'plan' | 'general' | 'explore' | 'scout' | 'new-mode';
   ```

2. **创建系统提示词**（`prompts.ts`）：
   ```typescript
   export const NEW_MODE_SYSTEM_PROMPT = [
     'You are CodeAgent new-mode...',
     // ...
   ].join('\n');
   ```

3. **定义 Agent**（`agent.ts`）：
   ```typescript
   export const newModeAgent: AgentInfo = {
     name: 'new-mode',
     mode: 'primary',
     description: '...',
     systemPrompt: NEW_MODE_SYSTEM_PROMPT,
     maxSteps: 50,
     permission: mergeAgentPermissions(basePermissions, [
       // 自定义权限规则
     ]),
   };
   ```

4. **注册 Agent**：
   ```typescript
   const agents: Record<AgentName, AgentInfo> = {
     // ...
     'new-mode': newModeAgent,
   };
   ```

5. **更新类型守卫**：
   ```typescript
   export function isAgentName(value: string): value is AgentName {
     return value === 'build' || value === 'plan' || ... || value === 'new-mode';
   }
   ```

## 测试建议

### 单元测试

- 测试权限规则评估
- 测试 Agent 解析逻辑
- 测试系统提示词格式

### 集成测试

- 验证每个模式的工具访问权限
- 测试权限拒绝场景
- 验证步骤限制

### 端到端测试

```bash
# 测试 explore 模式
code-agent run "探索项目结构" --agent explore

# 测试 scout 模式
code-agent run "调研 React 18 新特性" --agent scout

# 测试 general 模式
code-agent run "实现并测试新功能" --agent general
```

## 性能考虑

1. **步骤限制**：
   - `explore` 和 `scout` 使用 50 步，优化快速响应
   - `build`、`plan`、`general` 使用 100 步，支持复杂任务

2. **工具调用**：
   - 只读模式（`explore`、`scout`、`plan`）避免了权限确认开销
   - `general` 模式的 web 访问可能增加延迟

3. **上下文管理**：
   - 所有模式共享相同的 session 存储
   - 系统提示词长度影响 token 使用

## 安全考虑

1. **危险命令防护**：
   - `build` 和 `general` 模式明确拒绝危险 shell 命令
   - 使用模式匹配防止变体（如 `rm -rf *`）

2. **权限最小化**：
   - 只读模式完全禁止修改操作
   - Web 访问仅在需要时启用

3. **用户确认**：
   - 敏感操作使用 `ask` 权限
   - 用户可以在运行时拒绝任何操作

## 未来改进

1. **动态权限**：支持运行时调整权限规则
2. **Agent 组合**：允许在一个 session 中切换多个 Agent
3. **自定义 Agent**：支持用户定义的 Agent 配置文件
4. **权限审计**：记录和分析权限使用情况
5. **智能模式选择**：根据任务自动推荐合适的 Agent 模式
