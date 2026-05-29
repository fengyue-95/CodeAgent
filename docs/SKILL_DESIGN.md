# SKILL 插拔功能设计方案

## 📋 设计概览

### 核心思路
参考 Claude Code 的 `~/.claude/skills/` 目录结构和 Plugin 系统，在 CodeAgent 中实现一个类似的 Skill 动态加载系统。

### 架构设计

```
┌─────────────────────────────────────────────────┐
│           Agent Runtime                          │
│  ┌───────────────────────────────────────────┐  │
│  │      Skill Registry                       │  │
│  │  - 扫描 skills 目录                        │  │
│  │  - 解析 SKILL.md frontmatter              │  │
│  │  - 注册 skill 到 Agent                    │  │
│  │  - 处理 skill 调用                         │  │
│  └───────────────────────────────────────────┘  │
│                    ↓                             │
│  ┌───────────────────────────────────────────┐  │
│  │   Skill Executor                          │  │
│  │  - 加载 skill 指令                         │  │
│  │  - 注入 references                         │  │
│  │  - 执行 skill 逻辑                         │  │
│  └───────────────────────────────────────────┘  │
│                    ↓                             │
│  ┌───────────────────────────────────────────┐  │
│  │   Skill Installer                         │  │
│  │  - Git clone/pull                         │  │
│  │  - 依赖检查                                │  │
│  │  - 版本管理                                │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## 🎯 核心功能

### 1. Skill 目录结构

```
~/.code-agent/skills/
├── my-skill/
│   ├── SKILL.md              # Skill 定义（必需）
│   ├── skill.json            # Skill 元数据（可选）
│   └── references/           # 参考文档（可选）
│       ├── guide.md
│       └── examples.md
├── code-review/
│   ├── SKILL.md
│   └── references/
│       └── checklist.md
└── deploy/
    └── SKILL.md
```

### 2. SKILL.md 格式

```markdown
---
name: code-review
description: 执行深度代码审查，检查代码质量、安全性和最佳实践
trigger: user-invocable
tools: Read, Grep, Glob
agent: review
model: opus
---

# Code Review Skill

执行全面的代码审查，包括：
- 代码质量检查
- 安全漏洞扫描
- 性能问题识别
- 最佳实践验证

## Instructions

当此 skill 被调用时：

1. 从 args 参数中提取文件路径或目录
2. 使用 Glob 工具列出所有相关文件
3. 使用 Read 工具读取文件内容
4. 执行以下检查：
   - 代码风格一致性
   - 潜在的安全问题
   - 性能瓶颈
   - 错误处理
5. 生成详细的审查报告

## Usage Examples

- `/code-review src/user/service.ts`
- `/code-review src/`

## References

参考 [references/checklist.md](references/checklist.md) 获取完整的审查清单。
```

### 3. skill.json 元数据

```json
{
  "name": "code-review",
  "version": "1.0.0",
  "description": "深度代码审查工具",
  "author": {
    "name": "Your Name",
    "email": "you@example.com",
    "url": "https://github.com/yourname"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/yourname/skill-code-review"
  },
  "keywords": ["review", "quality", "security"],
  "license": "MIT",
  "dependencies": {
    "skills": [],
    "mcpServers": ["github"],
    "tools": ["Read", "Grep", "Glob"]
  },
  "minCodeAgentVersion": "0.1.0"
}
```

## 🔧 核心模块

### 1. Skill Definition

```typescript
export interface SkillFrontmatter {
  name: string;
  description: string;
  trigger?: 'user-invocable' | 'auto';
  tools?: string[];
  agent?: string;
  model?: string;
}

export interface SkillDefinition {
  name: string;
  path: string;
  frontmatter: SkillFrontmatter;
  content: string;
  references: Map<string, string>;
}

export interface SkillMetadata {
  name: string;
  version: string;
  description: string;
  author?: {
    name: string;
    email?: string;
    url?: string;
  };
  repository?: {
    type: string;
    url: string;
  };
  dependencies?: {
    skills?: string[];
    mcpServers?: string[];
    tools?: string[];
  };
  minCodeAgentVersion?: string;
}
```

### 2. Skill Loader

```typescript
export class SkillLoader {
  private skillsDir: string;

  constructor(skillsDir?: string);

  // 扫描并加载所有 skills
  async loadAllSkills(): Promise<SkillDefinition[]>;

  // 加载单个 skill
  async loadSkill(name: string): Promise<SkillDefinition | null>;

  // 解析 SKILL.md
  private parseSkillFile(content: string): {
    frontmatter: SkillFrontmatter;
    content: string;
  };

  // 加载 references
  private async loadReferences(skillPath: string): Promise<Map<string, string>>;
}
```

### 3. Skill Registry

```typescript
export class SkillRegistry {
  private skills = new Map<string, SkillDefinition>();
  private loader: SkillLoader;

  constructor(loader: SkillLoader);

  // 注册所有 skills
  async registerAll(): Promise<void>;

  // 注册单个 skill
  async register(name: string): Promise<void>;

  // 注销 skill
  unregister(name: string): void;

  // 获取 skill
  get(name: string): SkillDefinition | undefined;

  // 列出所有 skills
  list(): SkillDefinition[];

  // 搜索 skills
  search(query: string): SkillDefinition[];

  // 热重载
  async reload(): Promise<void>;
}
```

### 4. Skill Executor

```typescript
export class SkillExecutor {
  // 执行 skill
  async execute(
    skill: SkillDefinition,
    args: string,
    context: {
      agent: AgentInfo;
      runtime: AgentRuntime;
      projectPath: string;
    }
  ): Promise<string>;

  // 构建 skill prompt
  private buildSkillPrompt(
    skill: SkillDefinition,
    args: string
  ): string;

  // 注入 references
  private injectReferences(
    content: string,
    references: Map<string, string>
  ): string;
}
```

### 5. Skill Installer

```typescript
export interface InstallOptions {
  source: string;
  version?: string;
  force?: boolean;
  dev?: boolean;
  registry?: string;
}

export class SkillInstaller {
  private skillsDir: string;
  private cacheDir: string;

  constructor();

  // 安装 skill
  async install(source: string, options?: InstallOptions): Promise<void>;

  // 卸载 skill
  async uninstall(name: string): Promise<void>;

  // 更新 skill
  async update(name: string): Promise<void>;

  // 列出已安装的 skills
  async list(): Promise<Array<{
    name: string;
    version: string;
    source: string;
    installedAt: string;
    dev: boolean;
  }>>;

  // 从 Git 安装
  private async installFromGit(parsed: ParsedSource, options: InstallOptions): Promise<void>;

  // 从本地安装
  private async installFromLocal(parsed: ParsedSource, options: InstallOptions): Promise<void>;

  // 从 Marketplace 安装
  private async installFromMarketplace(parsed: ParsedSource, options: InstallOptions): Promise<void>;
}
```

## 📦 安装机制

### 安装来源

#### A. 从 Git 仓库安装

```bash
# 从 GitHub 安装
code-agent skill install github:username/skill-repo

# 从 GitLab 安装
code-agent skill install gitlab:username/skill-repo

# 从完整 URL 安装
code-agent skill install https://github.com/username/skill-repo.git

# 指定分支/标签
code-agent skill install github:username/skill-repo@v1.0.0
code-agent skill install github:username/skill-repo@main
```

#### B. 从本地路径安装

```bash
# 从本地目录安装（开发模式）
code-agent skill install ./my-skill

# 创建符号链接（开发模式）
code-agent skill link ./my-skill
```

#### C. 从 Marketplace 安装

```bash
# 从官方市场安装
code-agent skill install code-review

# 从指定市场安装
code-agent skill install code-review --registry https://skills.codeagent.dev
```

### 安装流程

1. **解析安装源**
   - Git: `github:user/repo` → `https://github.com/user/repo.git`
   - Local: `./path` → 绝对路径
   - Marketplace: `skill-name` → 查询 API 获取 Git URL

2. **下载/复制 Skill**
   - Git: Clone 到 `~/.code-agent/cache/skills/`
   - Local: 复制或创建符号链接

3. **验证 Skill**
   - 检查 `SKILL.md` 是否存在
   - 解析 frontmatter
   - 验证必需字段

4. **检查依赖**
   - 检查 CodeAgent 版本
   - 检查依赖的 skills
   - 检查依赖的 MCP servers

5. **安装到目标目录**
   - 复制到 `~/.code-agent/skills/`
   - 保存安装信息 `.install-info.json`

6. **注册 Skill**
   - 加载到 SkillRegistry
   - 可立即使用

## 🎨 CLI 命令

### 基础命令

```bash
# 列出所有 skills
code-agent skill list

# 搜索 skills
code-agent skill search "review"

# 查看 skill 详情
code-agent skill show code-review

# 执行 skill
code-agent skill run code-review "src/user/service.ts"
```

### 安装管理

```bash
# 安装 skill
code-agent skill install github:username/skill-repo
code-agent skill install ./my-skill
code-agent skill install code-review

# 卸载 skill
code-agent skill uninstall code-review

# 更新 skill
code-agent skill update code-review
code-agent skill update  # 更新所有

# 开发模式
code-agent skill link ./my-skill
```

### 创建 Skill

```bash
# 创建新 skill
code-agent skill create my-skill

# 交互式创建
code-agent skill init
```

## 🔄 集成到 Runtime

### Agent Runtime 集成

```typescript
export interface AgentRuntimeInput {
  task: string;
  projectPath: string;
  provider: ProviderClient;
  sessionId?: string;
  agent?: AgentName | string;
  model?: string;
  title?: string;
  maxSteps?: number;
  temperature?: number;
  toolMode?: LocalToolMode;
  mcpEnabled?: boolean;
  skillName?: string;  // 新增：skill 名称
  skillArgs?: string;  // 新增：skill 参数
  // ... 其他字段
}

export class AgentRuntime {
  private mcpPluginManager?: McpPluginManager;
  private skillRegistry?: SkillRegistry;  // 新增

  async run(input: AgentRuntimeInput): Promise<AgentRuntimeResult> {
    // 初始化 Skill Registry
    const skillLoader = new SkillLoader();
    this.skillRegistry = new SkillRegistry(skillLoader);
    await this.skillRegistry.registerAll();

    // 如果指定了 skill，执行 skill
    if (input.skillName) {
      const skill = this.skillRegistry.get(input.skillName);
      if (!skill) {
        throw new Error(`Skill not found: ${input.skillName}`);
      }

      // 使用 skill 指定的 agent（如果有）
      const skillAgent = skill.frontmatter.agent 
        ? resolveAgent(skill.frontmatter.agent) 
        : agent;

      // 构建 skill prompt
      const executor = new SkillExecutor();
      const skillPrompt = await executor.execute(skill, input.skillArgs ?? '', {
        agent: skillAgent,
        runtime: this,
        projectPath: paths.root,
      });

      // 将 skill prompt 作为任务执行
      input.task = skillPrompt;
      agent = skillAgent;
    }

    // ... 继续现有逻辑
  }
}
```

### TUI 集成

```typescript
// 在 TUI 中支持 /skill 命令
if (input.startsWith('/skill ')) {
  const [, skillName, ...args] = input.split(' ');
  return this.executeSkill(skillName, args.join(' '));
}

// 或使用快捷方式
if (input.startsWith('/code-review ')) {
  const args = input.substring('/code-review '.length);
  return this.executeSkill('code-review', args);
}
```

## 📚 使用示例

### 创建自定义 Skill

```bash
# 1. 创建 skill 目录
mkdir -p ~/.code-agent/skills/api-doc

# 2. 创建 SKILL.md
cat > ~/.code-agent/skills/api-doc/SKILL.md <<'EOF'
---
name: api-doc
description: 为 API 端点生成 OpenAPI 文档
trigger: user-invocable
tools: Read, Grep, Glob
agent: doc
---

# API Documentation Generator

自动为 API 端点生成 OpenAPI 3.0 文档。

## Instructions

1. 扫描项目中的 API 路由文件
2. 提取端点定义、参数、响应
3. 生成 OpenAPI 规范
4. 保存到 docs/openapi.yaml

## Usage

- `/api-doc` - 扫描整个项目
- `/api-doc src/api/` - 扫描指定目录
EOF

# 3. 使用 skill
code-agent skill run api-doc
```

### 从 GitHub 安装

```bash
# 安装官方 skill
code-agent skill install github:codeagent/skill-code-review

# 安装指定版本
code-agent skill install github:codeagent/skill-code-review@v1.0.0

# 强制重新安装
code-agent skill install github:codeagent/skill-code-review --force
```

### 开发模式

```bash
# 创建 skill
mkdir -p ~/my-skills/custom-review
cat > ~/my-skills/custom-review/SKILL.md <<'EOF'
---
name: custom-review
description: 自定义代码审查
---
# Custom Review
...
EOF

# 开发模式安装（符号链接）
code-agent skill install ~/my-skills/custom-review --dev

# 修改 skill 后立即生效，无需重新安装
vim ~/my-skills/custom-review/SKILL.md
code-agent skill run custom-review src/
```

## 📁 文件结构

```
src/skill/
├── index.ts                # 导出接口
├── skill-definition.ts     # Skill 定义
├── skill-loader.ts         # Skill 加载器
├── skill-registry.ts       # Skill 注册表
├── skill-executor.ts       # Skill 执行器
├── skill-installer.ts      # Skill 安装器
└── skill-config.ts         # 配置管理

src/runtime/
└── agent-runtime.ts        # 集成 Skill Registry

src/bin/
└── code-agent.ts           # 添加 Skill CLI 命令

~/.code-agent/
├── skills/                 # Skills 目录
│   ├── code-review/
│   ├── deploy/
│   └── test-gen/
├── cache/                  # 缓存目录
│   └── skills/
└── skills-config.json      # Skills 配置
```

## ✅ 优势

1. **灵活扩展** - 用户可以轻松创建自定义 skill
2. **标准化** - 统一的 SKILL.md 格式
3. **可组合** - skill 可以调用其他 skill
4. **版本控制** - skill 可以通过 git 管理和分享
5. **热重载** - 修改 skill 无需重启
6. **权限控制** - skill 可以指定允许的工具
7. **Agent 绑定** - skill 可以指定最佳 agent
8. **参考文档** - 支持 references 目录
9. **依赖管理** - 检查依赖的 skills 和 MCP servers
10. **开发模式** - 符号链接支持快速开发

## 🚀 实施步骤

### Phase 1: 核心功能（必需）
1. ✅ 实现 SkillDefinition 和 SkillLoader
2. ✅ 实现 SkillRegistry
3. ✅ 实现 SkillExecutor
4. ✅ 集成到 AgentRuntime
5. ✅ 添加 CLI 命令（list, show, run）

### Phase 2: 安装功能（推荐）
6. ✅ 实现 SkillInstaller
7. ✅ 支持从 Git 安装
8. ✅ 支持从本地安装
9. ✅ 支持卸载和更新
10. ✅ 支持开发模式

### Phase 3: 增强功能（可选）
11. ⭐ 支持 references 加载
12. ⭐ 支持 skill 配置文件
13. ⭐ 支持 skill 别名
14. ⭐ 支持热重载
15. ⭐ TUI 集成

### Phase 4: Marketplace（未来）
16. ⭐ Marketplace API
17. ⭐ 搜索功能
18. ⭐ 发布功能
19. ⭐ 评分和评论

## 🔄 与 Claude Code 的对比

| 特性 | CodeAgent | Claude Code |
|------|-----------|-------------|
| Skill 目录 | `~/.code-agent/skills/` | `~/.claude/skills/` |
| Skill 格式 | `SKILL.md` with frontmatter | 同样 |
| 触发方式 | `/skill-name` 或 CLI | `/skill-name` |
| References | 支持 | 支持 |
| 热重载 | ✅ 支持 | ✅ 支持 |
| CLI 管理 | `code-agent skill` 命令 | 无独立命令 |
| 安装机制 | Git + Local + Marketplace | Plugin 系统 |
| Agent 绑定 | ✅ 支持 | ✅ 支持 |
| 依赖管理 | ✅ 支持 | 部分支持 |
| 开发模式 | ✅ 符号链接 | 无 |

## 📝 注意事项

1. **安全性**
   - 从 Git 安装时验证来源
   - 执行 skill 前检查权限
   - 不自动执行未知代码

2. **性能**
   - 启动时只加载 frontmatter
   - 执行时才加载完整内容
   - 缓存已解析的 skill

3. **兼容性**
   - 检查 CodeAgent 版本
   - 检查依赖的工具
   - 提供降级方案

4. **用户体验**
   - 清晰的错误提示
   - 详细的安装日志
   - 友好的命令行界面

## 🎯 关键设计决策

### 1. Skill vs Agent
- **Agent**: 长期运行的对话模式，有状态
- **Skill**: 一次性任务，无状态，可以指定使用哪个 Agent

### 2. Skill vs MCP
- **MCP**: 外部工具集成，提供新的工具能力
- **Skill**: 打包的专业知识和工作流，使用现有工具

### 3. Skill 加载时机
- **启动时加载**: 快速响应，但占用内存
- **按需加载**: 节省内存，但首次调用慢
- **推荐**: 启动时加载 frontmatter，执行时加载 content

### 4. 安装机制选择
- **Git Clone**: 灵活、支持版本控制、易于分享
- **符号链接**: 开发模式，修改立即生效
- **Marketplace**: 中心化管理，便于发现和安装

## 📚 参考资料

- [Claude Code Skills 文档](https://docs.anthropic.com/claude-code/skills)
- [MCP 协议规范](https://modelcontextprotocol.io/)
- [npm 包管理机制](https://docs.npmjs.com/)
- [Git Submodules](https://git-scm.com/book/en/v2/Git-Tools-Submodules)
