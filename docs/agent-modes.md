# Agent Modes

CodeAgent 提供五种不同的 Agent 模式，每种模式针对特定的任务类型进行了优化。

## 模式概览

| 模式 | 用途 | 读取 | 写入 | Shell | Web | 最大步骤 |
|------|------|------|------|-------|-----|----------|
| **build** | 默认开发模式 | ✓ | ✓ | ✓ | ✗ | 100 |
| **plan** | 只读规划模式 | ✓ | ✗ | ✗ | ✗ | 100 |
| **general** | 通用多步骤任务 | ✓ | ✓ | ✓ | ✓ | 100 |
| **explore** | 快速代码库探索 | ✓ | ✗ | ✗ | ✗ | 50 |
| **scout** | 外部文档研究 | ✓ | ✗ | ✗ | ✓ | 50 |

## 详细说明

### build - 默认开发模式

**适用场景：**
- 日常开发任务
- 修复 bug
- 添加新功能
- 重构代码

**能力：**
- 读取和搜索代码
- 编辑和创建文件
- 运行 shell 命令（测试、构建等）
- 查询代码图谱
- 自动拒绝危险命令（rm -rf、git reset --hard 等）

**使用示例：**
```bash
code-agent run "修复登录接口的空指针异常" --agent build
code-agent tui --agent build
```

### plan - 只读规划模式

**适用场景：**
- 分析代码架构
- 制定实现方案
- 评估技术债务
- 理解复杂逻辑

**能力：**
- 读取和搜索代码
- 查询代码图谱
- 分析依赖关系
- 输出实现计划

**限制：**
- 不能修改文件
- 不能运行命令
- 不能访问外部网络

**使用示例：**
```bash
code-agent run "分析礼品卡模块的设计" --agent plan
code-agent run "评估重构用户认证系统的工作量" --agent plan
```

### general - 通用多步骤任务

**适用场景：**
- 复杂的多步骤工作流
- 需要协调多个操作的任务
- 需要外部信息的开发任务
- 端到端的功能实现

**能力：**
- 完整的文件读写权限
- 运行 shell 命令
- Web 搜索和文档获取
- 查询代码图谱
- 协调复杂工作流

**特点：**
- 最全面的工具访问权限
- 适合需要多种能力配合的任务
- 自动拒绝危险操作

**使用示例：**
```bash
code-agent run "实现用户注册功能，包括邮件验证和数据库迁移" --agent general
code-agent run "调研并集成 Redis 缓存到现有系统" --agent general
```

### explore - 快速代码库探索

**适用场景：**
- 快速了解新项目
- 追踪调用链
- 理解代码结构
- 查找特定模式

**能力：**
- 高效的文件搜索（glob/grep）
- 代码图谱查询（符号、调用关系、引用）
- 追踪执行流程
- 识别架构模式

**限制：**
- 只读模式，不能修改
- 不能运行命令
- 不能访问外部网络
- 步骤限制较短（50 步），专注快速探索

**特点：**
- 优化了速度和广度
- 提供文件路径和行号
- 简洁的输出格式

**使用示例：**
```bash
code-agent run "探索支付模块的实现方式" --agent explore
code-agent run "找出所有使用了 Redis 的地方" --agent explore
code-agent run "分析订单处理的完整流程" --agent explore
```

### scout - 外部文档和依赖研究

**适用场景：**
- 调研第三方库
- 查找 API 文档
- 学习最佳实践
- 版本兼容性检查

**能力：**
- 读取本地依赖文件（package.json、requirements.txt 等）
- Web 搜索和文档获取
- 查询代码图谱了解依赖使用情况
- 总结文档和示例

**限制：**
- 只读模式，不能修改
- 不能运行命令
- 步骤限制较短（50 步），专注研究

**特点：**
- 优先官方文档
- 提供版本特定信息
- 包含链接和代码示例
- 推荐最佳实践

**使用示例：**
```bash
code-agent run "调研 TypeScript 5.0 的新特性" --agent scout
code-agent run "查找 React Query 的最佳实践" --agent scout
code-agent run "检查我们使用的 Express 版本是否有安全漏洞" --agent scout
```

## 选择合适的模式

### 决策流程图

```
需要修改代码？
├─ 是 → 需要外部信息（文档、API）？
│      ├─ 是 → general
│      └─ 否 → build
└─ 否 → 需要外部信息？
       ├─ 是 → scout
       └─ 否 → 需要制定计划？
              ├─ 是 → plan
              └─ 否 → explore
```

### 快速参考

- **修复 bug** → `build`
- **添加功能** → `build` 或 `general`（如果需要调研）
- **理解代码** → `explore`
- **制定方案** → `plan`
- **调研技术** → `scout`
- **复杂工作流** → `general`

## 在 TUI 中切换模式

交互式终端支持动态切换 Agent 模式：

```bash
# 启动时指定
code-agent tui --agent explore

# 运行时切换
/agent build
/agent plan
/agent general
/agent explore
/agent scout
```

## 权限系统

每个 Agent 模式都有预定义的权限规则集：

- **allow**: 自动允许，无需确认
- **ask**: 需要用户确认
- **deny**: 自动拒绝

可以通过 `--tools core|full` 参数进一步控制工具集：

```bash
# 使用核心只读工具集
code-agent run "分析代码" --agent build --tools core

# 使用完整工具集
code-agent run "修复并测试" --agent build --tools full
```

## 最佳实践

1. **从只读模式开始**：不确定时，先用 `explore` 或 `plan` 了解情况
2. **选择最小权限**：能用 `build` 就不用 `general`
3. **分阶段执行**：复杂任务可以分成 `scout`（调研）→ `plan`（规划）→ `build`（实现）
4. **利用 session**：在同一个 session 中可以切换不同模式
5. **查看历史**：使用 `code-agent session list` 查看之前的探索结果

## 示例工作流

### 场景：集成新的支付网关

```bash
# 1. 调研支付网关 API
code-agent run "调研 Stripe API 的最新版本和集成方式" --agent scout

# 2. 探索现有支付代码
code-agent run "分析现有的支付模块结构" --agent explore --continue

# 3. 制定实现计划
code-agent run "制定集成 Stripe 的实现方案" --agent plan --continue

# 4. 实现功能
code-agent run "按照计划实现 Stripe 集成" --agent general --continue
```

### 场景：修复生产 bug

```bash
# 1. 快速定位问题
code-agent run "找出订单状态更新失败的原因" --agent explore

# 2. 修复问题
code-agent run "修复订单状态更新的 bug" --agent build --continue

# 3. 验证修复
code-agent run "运行相关测试验证修复" --agent build --continue
```
