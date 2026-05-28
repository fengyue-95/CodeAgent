# Agent 模式快速参考

## 一句话总结

| 模式 | 一句话描述 |
|------|-----------|
| **build** | 默认开发模式，可以读写代码和运行命令 |
| **plan** | 只读规划模式，分析代码并输出实现方案 |
| **general** | 全能模式，支持代码、命令和 web 搜索 |
| **explore** | 快速探索模式，专注理解代码结构 |
| **scout** | 外部研究模式，调研文档和最佳实践 |

## 权限对比

| 能力 | build | plan | general | explore | scout |
|------|-------|------|---------|---------|-------|
| 读取文件 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 搜索代码 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 代码图谱 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 编辑文件 | ✓ | ✗ | ✓ | ✗ | ✗ |
| 创建文件 | ✓ | ✗ | ✓ | ✗ | ✗ |
| Shell 命令 | ✓ | ✗ | ✓ | ✗ | ✗ |
| Web 搜索 | ✗ | ✗ | ✓ | ✗ | ✓ |
| 浏览器 | ✗ | 询问 | ✓ | ✗ | ✓ |
| 最大步骤 | 100 | 100 | 100 | 50 | 50 |

## 使用场景速查

### 我想...

- **修复一个 bug** → `build`
  ```bash
  code-agent run "修复用户登录失败的问题" --agent build
  ```

- **添加新功能** → `build` 或 `general`
  ```bash
  # 简单功能
  code-agent run "添加用户头像上传功能" --agent build
  
  # 需要调研的功能
  code-agent run "集成第三方支付 API" --agent general
  ```

- **理解代码是怎么工作的** → `explore`
  ```bash
  code-agent run "分析订单处理流程" --agent explore
  ```

- **制定实现方案** → `plan`
  ```bash
  code-agent run "设计用户权限系统的重构方案" --agent plan
  ```

- **调研技术或库** → `scout`
  ```bash
  code-agent run "调研 GraphQL 的最佳实践" --agent scout
  ```

- **复杂的端到端任务** → `general`
  ```bash
  code-agent run "实现、测试并部署新的 API 端点" --agent general
  ```

## 典型工作流

### 场景 1：新功能开发

```bash
# 1. 调研技术方案
code-agent run "调研实现实时通知的方案（WebSocket vs SSE）" --agent scout

# 2. 探索现有代码
code-agent run "分析现有的消息系统架构" --agent explore --continue

# 3. 制定实现计划
code-agent run "制定实时通知功能的实现计划" --agent plan --continue

# 4. 实现功能
code-agent run "按计划实现实时通知功能" --agent build --continue
```

### 场景 2：Bug 修复

```bash
# 1. 快速定位问题
code-agent run "找出支付失败的原因" --agent explore

# 2. 修复问题
code-agent run "修复支付流程中的并发问题" --agent build --continue
```

### 场景 3：代码重构

```bash
# 1. 分析现状
code-agent run "分析认证模块的技术债务" --agent plan

# 2. 制定方案
code-agent run "设计认证模块的重构方案" --agent plan --continue

# 3. 执行重构
code-agent run "执行认证模块重构" --agent build --continue
```

### 场景 4：技术调研

```bash
# 1. 外部调研
code-agent run "调研 Kubernetes 部署的最佳实践" --agent scout

# 2. 内部分析
code-agent run "分析当前部署配置" --agent explore --continue

# 3. 制定迁移计划
code-agent run "制定迁移到 Kubernetes 的计划" --agent plan --continue
```

## 命令行示例

### 基本用法

```bash
# 使用默认 build 模式
code-agent run "修复测试失败"

# 指定模式
code-agent run "探索项目结构" --agent explore

# 继续上一个 session
code-agent run "继续实现" --agent build --continue

# 指定项目路径
code-agent run "分析代码" --agent explore --project /path/to/project
```

### TUI 交互模式

```bash
# 启动时指定模式
code-agent tui --agent explore

# 在 TUI 中切换模式
/agent build
/agent plan
/agent general
/agent explore
/agent scout

# 使用 Tab 键在 build 和 plan 之间快速切换
# （在空输入行按 Tab）
```

### 工具集控制

```bash
# 使用核心只读工具集（默认）
code-agent run "分析代码" --tools core

# 使用完整工具集（包括编辑、shell、web）
code-agent run "修复并测试" --tools full --agent build
```

## 选择决策树

```
开始
│
├─ 需要修改代码？
│  ├─ 是 → 需要外部信息（文档、API）？
│  │      ├─ 是 → general
│  │      └─ 否 → build
│  │
│  └─ 否 → 需要外部信息？
│         ├─ 是 → scout
│         └─ 否 → 需要制定计划？
│                ├─ 是 → plan
│                └─ 否 → explore
```

## 常见问题

### Q: build 和 general 有什么区别？

A: `build` 专注本地开发，不能访问 web。`general` 可以搜索文档、调研技术，适合需要外部信息的任务。

### Q: explore 和 plan 有什么区别？

A: `explore` 快速探索代码结构（50 步），输出简洁。`plan` 深入分析并制定实现方案（100 步），输出详细。

### Q: 什么时候用 scout？

A: 当你需要调研外部技术、查找文档、了解最佳实践时。例如："这个库怎么用？"、"有什么替代方案？"

### Q: 可以在一个 session 中切换模式吗？

A: 可以！在 TUI 中使用 `/agent <mode>` 命令，或在 CLI 中使用 `--continue` 参数继续 session。

### Q: 哪个模式最快？

A: `explore` 和 `scout` 限制 50 步，专注快速响应。但实际速度还取决于任务复杂度。

## 最佳实践

1. **从只读开始**：不确定时，先用 `explore` 或 `plan` 了解情况
2. **选择最小权限**：能用 `build` 就不用 `general`
3. **分阶段执行**：`scout`（调研）→ `plan`（规划）→ `build`（实现）
4. **利用 session**：使用 `--continue` 在同一上下文中切换模式
5. **查看历史**：`code-agent session list` 查看之前的工作

## 性能提示

- `explore` 和 `scout` 步骤少，响应快
- `general` 的 web 搜索可能增加延迟
- 使用 `--max-steps` 限制长时间运行
- 只读模式（`explore`、`scout`、`plan`）无需权限确认，更流畅

## 更多信息

- [详细文档](agent-modes.md) - 完整的模式说明和示例
- [实现细节](agent-implementation.md) - 技术实现和扩展指南
- [README](../README.md) - 项目总览和快速开始
