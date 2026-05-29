# SKILL 安装机制详细设计

## 📦 安装机制概述

SKILL 安装机制支持三种安装来源：
1. **Git 仓库** - 从 GitHub/GitLab 等 Git 仓库安装
2. **本地路径** - 从本地目录安装（支持开发模式）
3. **Marketplace** - 从官方或第三方市场安装

## 🔧 安装流程

### 1. 源解析

```typescript
interface ParsedSource {
  type: 'git' | 'local' | 'marketplace';
  url?: string;      // Git URL
  path?: string;     // 本地路径
  name: string;      // Skill 名称
  version?: string;  // 版本号
}
```

#### 解析规则

| 输入格式 | 解析结果 | 示例 |
|---------|---------|------|
| `github:user/repo` | Git (GitHub) | `https://github.com/user/repo.git` |
| `github:user/repo@v1.0.0` | Git + 版本 | Clone 指定 tag |
| `gitlab:user/repo` | Git (GitLab) | `https://gitlab.com/user/repo.git` |
| `https://...git` | Git (完整URL) | 直接使用 |
| `./path` 或 `/path` | Local | 绝对路径 |
| `skill-name` | Marketplace | 查询 API |

### 2. Git 安装流程

```
┌─────────────────────────────────────────────┐
│ 1. 解析 Git URL                              │
│    github:user/repo → https://github.com/... │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 2. Clone 到缓存目录                          │
│    ~/.code-agent/cache/skills/skill-name    │
│    - 首次: git clone                         │
│    - 更新: git pull                          │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 3. 验证 Skill                                │
│    - 检查 SKILL.md 存在                      │
│    - 解析 frontmatter                        │
│    - 验证必需字段                            │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 4. 读取元数据                                │
│    - 优先读取 skill.json                     │
│    - 否则从 SKILL.md frontmatter 提取        │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 5. 检查依赖                                  │
│    - CodeAgent 版本                          │
│    - 依赖的 skills                           │
│    - 依赖的 MCP servers                      │
│    - 依赖的 tools                            │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 6. 复制到目标目录                            │
│    ~/.code-agent/skills/skill-name          │
│    - 覆盖检查（--force）                     │
│    - 保留 .git 目录（可选）                  │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 7. 保存安装信息                              │
│    .install-info.json                        │
│    - source: Git URL                         │
│    - version: commit hash/tag                │
│    - installedAt: timestamp                  │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 8. 注册到 SkillRegistry                      │
│    立即可用                                  │
└─────────────────────────────────────────────┘
```

### 3. 本地安装流程

#### 生产模式（复制）

```
┌─────────────────────────────────────────────┐
│ 1. 解析本地路径                              │
│    ./my-skill → /absolute/path/my-skill     │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 2. 验证路径存在                              │
│    检查目录和 SKILL.md                       │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 3. 验证 Skill                                │
│    同 Git 安装流程                           │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 4. 复制到目标目录                            │
│    ~/.code-agent/skills/skill-name          │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 5. 保存安装信息                              │
│    source: local path                        │
└─────────────────────────────────────────────┘
```

#### 开发模式（符号链接）

```
┌─────────────────────────────────────────────┐
│ 1. 解析本地路径                              │
│    ./my-skill → /absolute/path/my-skill     │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 2. 验证 Skill                                │
│    检查 SKILL.md 和 frontmatter              │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 3. 创建符号链接                              │
│    ~/.code-agent/skills/skill-name          │
│    → /absolute/path/my-skill                │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 4. 保存安装信息                              │
│    source: local path                        │
│    dev: true                                 │
└─────────────────────────────────────────────┘
```

**开发模式优势**：
- 修改源文件立即生效
- 无需重新安装
- 适合 skill 开发和调试

### 4. Marketplace 安装流程

```
┌─────────────────────────────────────────────┐
│ 1. 查询 Marketplace API                      │
│    GET /api/skills/skill-name                │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 2. 获取 Skill 信息                           │
│    - repository.url                          │
│    - version                                 │
│    - metadata                                │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 3. 转换为 Git 安装                           │
│    使用获取的 repository.url                 │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 4. 执行 Git 安装流程                         │
│    同上述 Git 安装流程                       │
└─────────────────────────────────────────────┘
```

## 📋 依赖检查

### 1. CodeAgent 版本检查

```typescript
function checkCodeAgentVersion(required: string): boolean {
  const current = getCurrentVersion(); // 从 package.json 读取
  return semver.gte(current, required);
}
```

### 2. Skill 依赖检查

```typescript
async function checkSkillDependencies(deps: string[]): Promise<void> {
  for (const dep of deps) {
    const skillDir = join(skillsDir, dep);
    if (!existsSync(skillDir)) {
      console.warn(`Warning: Required skill not found: ${dep}`);
      console.log(`  Install it with: code-agent skill install ${dep}`);
    }
  }
}
```

### 3. MCP Server 依赖检查

```typescript
async function checkMcpDependencies(deps: string[]): Promise<void> {
  const mcpConfig = loadMcpConfig();
  for (const dep of deps) {
    if (!mcpConfig.mcpServers[dep]) {
      console.warn(`Warning: Required MCP server not configured: ${dep}`);
      console.log(`  Configure it in: ~/.code-agent/mcp-config.json`);
    }
  }
}
```

### 4. Tool 依赖检查

```typescript
function checkToolDependencies(deps: string[]): void {
  const availableTools = [
    'Read', 'Write', 'Edit', 'Glob', 'Grep',
    'Shell', 'GitDiff', 'ApplyPatch',
    'WebFetch', 'WebSearch', 'Browser',
    // ... MCP tools
  ];

  for (const dep of deps) {
    if (!availableTools.includes(dep)) {
      console.warn(`Warning: Tool may not be available: ${dep}`);
    }
  }
}
```

## 🔄 更新机制

### 1. 单个 Skill 更新

```bash
code-agent skill update skill-name
```

流程：
1. 读取 `.install-info.json` 获取安装源
2. 如果是 Git 源：
   - 进入缓存目录
   - 执行 `git pull`
   - 复制到目标目录
3. 如果是本地源：
   - 提示用户手动更新
4. 更新安装信息

### 2. 批量更新

```bash
code-agent skill update
```

流程：
1. 列出所有已安装的 skills
2. 过滤出非开发模式的 skills
3. 逐个执行更新
4. 显示更新结果

### 3. 版本锁定

在 `skill.json` 中指定版本：

```json
{
  "dependencies": {
    "skills": [
      "code-review@1.0.0",
      "deploy@^2.0.0"
    ]
  }
}
```

支持语义化版本：
- `1.0.0` - 精确版本
- `^1.0.0` - 兼容版本（1.x.x）
- `~1.0.0` - 补丁版本（1.0.x）
- `latest` - 最新版本

## 🗑️ 卸载机制

### 卸载流程

```bash
code-agent skill uninstall skill-name
```

```
┌─────────────────────────────────────────────┐
│ 1. 检查 Skill 是否存在                       │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 2. 检查是否被其他 Skill 依赖                 │
│    - 扫描所有 skills                         │
│    - 检查 dependencies.skills                │
│    - 提示用户确认                            │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 3. 删除 Skill 目录                           │
│    - 符号链接: unlink                        │
│    - 普通目录: rm -rf                        │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 4. 删除安装信息                              │
│    .install-info.json                        │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 5. 从 SkillRegistry 注销                     │
└─────────────────────────────────────────────┘
```

### 安全检查

```typescript
async function checkDependents(skillName: string): Promise<string[]> {
  const dependents: string[] = [];
  const allSkills = await loader.loadAllSkills();

  for (const skill of allSkills) {
    const metadata = await readMetadata(skill.path);
    if (metadata.dependencies?.skills?.includes(skillName)) {
      dependents.push(skill.name);
    }
  }

  return dependents;
}
```

## 📊 安装信息管理

### .install-info.json 格式

```json
{
  "source": "https://github.com/user/skill-repo.git",
  "type": "git",
  "version": "v1.0.0",
  "commit": "abc123def456",
  "installedAt": "2026-05-29T10:00:00Z",
  "updatedAt": "2026-05-29T12:00:00Z",
  "dev": false
}
```

### 安装信息用途

1. **更新检查** - 知道从哪里更新
2. **版本管理** - 记录当前版本
3. **依赖追踪** - 了解安装来源
4. **开发模式标记** - 区分生产/开发模式

## 🔍 Skill 发现

### 1. 本地搜索

```bash
code-agent skill search "review"
```

搜索范围：
- Skill 名称
- 描述
- 关键词
- 作者

### 2. Marketplace 搜索

```bash
code-agent skill search "review" --marketplace
```

API 请求：
```
GET /api/skills/search?q=review&limit=20
```

响应：
```json
{
  "results": [
    {
      "name": "code-review",
      "version": "1.0.0",
      "description": "深度代码审查工具",
      "author": "CodeAgent Team",
      "downloads": 1234,
      "stars": 56,
      "repository": "https://github.com/codeagent/skill-code-review"
    }
  ],
  "total": 1
}
```

## 🏪 Marketplace 设计（可选）

### API 端点

```
GET  /api/skills              # 列出所有 skills
GET  /api/skills/:name        # 获取 skill 详情
GET  /api/skills/search?q=    # 搜索 skills
POST /api/skills              # 发布 skill（需要认证）
PUT  /api/skills/:name        # 更新 skill
GET  /api/skills/:name/stats  # 获取统计信息
```

### 发布流程

```bash
# 1. 登录
code-agent skill login

# 2. 发布
code-agent skill publish

# 3. 更新
code-agent skill publish --update
```

发布检查：
- 验证 SKILL.md 格式
- 验证 skill.json 元数据
- 检查 Git 仓库可访问性
- 运行基本测试
- 生成文档

### Marketplace 数据库

```sql
CREATE TABLE skills (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  version VARCHAR(50) NOT NULL,
  description TEXT,
  author_id INTEGER REFERENCES users(id),
  repository_url TEXT NOT NULL,
  keywords TEXT[],
  downloads INTEGER DEFAULT 0,
  stars INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE skill_versions (
  id SERIAL PRIMARY KEY,
  skill_id INTEGER REFERENCES skills(id),
  version VARCHAR(50) NOT NULL,
  commit_hash VARCHAR(40),
  changelog TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 🔐 安全考虑

### 1. 源验证

- Git 仓库：验证 HTTPS URL
- 本地路径：检查路径遍历攻击
- Marketplace：使用 HTTPS API

### 2. 代码审查

- 不自动执行未知代码
- Skill 只是 Markdown 文档
- 实际执行由 Agent 控制

### 3. 权限控制

- Skill 指定允许的 tools
- Agent 权限系统控制实际执行
- 用户可以审查 Skill 内容

### 4. 依赖安全

- 检查依赖的 skills 来源
- 警告未知的 MCP servers
- 提示用户确认安装

## 📈 性能优化

### 1. 缓存机制

```
~/.code-agent/cache/
├── skills/              # Git clone 缓存
│   ├── skill-1/
│   └── skill-2/
└── metadata/            # 元数据缓存
    ├── skill-1.json
    └── skill-2.json
```

### 2. 增量更新

- 使用 `git pull` 而不是重新 clone
- 只复制变更的文件
- 保留缓存目录

### 3. 并行安装

```bash
# 并行安装多个 skills
code-agent skill install skill-1 skill-2 skill-3
```

使用 Promise.all 并行执行。

### 4. 懒加载

- 启动时只加载 frontmatter
- 执行时才加载完整内容
- 缓存已解析的 skill

## 🧪 测试策略

### 1. 单元测试

```typescript
describe('SkillInstaller', () => {
  it('should parse GitHub source', () => {
    const parsed = installer.parseSource('github:user/repo');
    expect(parsed.type).toBe('git');
    expect(parsed.url).toBe('https://github.com/user/repo.git');
  });

  it('should install from local path', async () => {
    await installer.install('./test-skill', { dev: true });
    expect(existsSync('~/.code-agent/skills/test-skill')).toBe(true);
  });
});
```

### 2. 集成测试

```typescript
describe('Skill Installation', () => {
  it('should install, use, and uninstall skill', async () => {
    // 安装
    await installer.install('github:test/skill');
    
    // 使用
    const skill = registry.get('skill');
    expect(skill).toBeDefined();
    
    // 卸载
    await installer.uninstall('skill');
    expect(registry.get('skill')).toBeUndefined();
  });
});
```

### 3. E2E 测试

```bash
# 测试完整流程
./test-skill-install.sh
```

## 📚 最佳实践

### 1. Skill 开发

- 使用开发模式（--dev）
- 频繁测试
- 编写清晰的文档
- 提供使用示例

### 2. Skill 发布

- 使用语义化版本
- 编写 CHANGELOG
- 添加 README
- 提供示例和测试

### 3. Skill 使用

- 先查看 skill 内容
- 了解依赖要求
- 定期更新 skills
- 报告问题和建议

### 4. Skill 维护

- 及时响应 issues
- 保持向后兼容
- 更新文档
- 添加测试

## 🎯 实施优先级

### P0 - 必需功能
- ✅ 从 Git 安装
- ✅ 从本地安装
- ✅ 卸载功能
- ✅ 列出已安装 skills

### P1 - 重要功能
- ✅ 更新功能
- ✅ 开发模式（符号链接）
- ✅ 依赖检查
- ✅ 版本管理

### P2 - 增强功能
- ⭐ Marketplace 集成
- ⭐ 搜索功能
- ⭐ 并行安装
- ⭐ 缓存优化

### P3 - 未来功能
- ⭐ 发布功能
- ⭐ 评分和评论
- ⭐ 自动更新
- ⭐ 依赖解析

## 🔗 相关文档

- [SKILL_DESIGN.md](SKILL_DESIGN.md) - 整体设计方案
- [SKILL_GUIDE.md](SKILL_GUIDE.md) - 使用指南
- [MCP_IMPLEMENTATION.md](MCP_IMPLEMENTATION.md) - MCP 实现参考
