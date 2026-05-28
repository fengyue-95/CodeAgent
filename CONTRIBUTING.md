# 贡献指南

感谢你对 CodeAgent 的关注！我们欢迎各种形式的贡献，包括但不限于：

- 🐛 报告 Bug
- 💡 提出新功能建议
- 📝 改进文档
- 🔧 提交代码修复
- ✨ 实现新功能
- 🧪 添加测试

## 目录

- [行为准则](#行为准则)
- [开始之前](#开始之前)
- [开发环境设置](#开发环境设置)
- [开发流程](#开发流程)
- [代码规范](#代码规范)
- [提交规范](#提交规范)
- [Pull Request 流程](#pull-request-流程)
- [测试](#测试)
- [文档](#文档)

## 行为准则

参与本项目即表示你同意遵守我们的行为准则：

- 尊重所有贡献者
- 使用友好和包容的语言
- 接受建设性的批评
- 关注对社区最有利的事情
- 对其他社区成员表示同理心

## 开始之前

### 报告 Bug

在报告 Bug 之前，请：

1. **搜索现有 Issues** - 确保问题尚未被报告
2. **使用最新版本** - 确认问题在最新版本中仍然存在
3. **提供详细信息** - 包括复现步骤、预期行为、实际行为

**Bug 报告模板**:

```markdown
## 描述
简要描述问题

## 复现步骤
1. 执行命令 `code-agent ...`
2. 观察到...
3. 预期应该...

## 环境信息
- OS: macOS 14.0
- Node.js: 20.10.0
- CodeAgent: 0.1.0

## 日志
粘贴相关日志或错误信息
```

### 提出功能建议

在提出新功能之前，请：

1. **搜索现有 Issues** - 确保功能尚未被提出
2. **说明用例** - 解释为什么需要这个功能
3. **考虑替代方案** - 是否有其他方式实现

**功能建议模板**:

```markdown
## 功能描述
简要描述建议的功能

## 动机
为什么需要这个功能？解决什么问题？

## 建议的实现
如何实现这个功能？

## 替代方案
是否考虑过其他方案？

## 额外信息
其他相关信息
```

## 开发环境设置

### 前置要求

- Node.js 20 或更高版本
- npm
- Git

### 克隆仓库

```bash
git clone https://github.com/your-username/CodeAgent.git
cd CodeAgent
```

### 安装依赖

```bash
npm install --cache .npm-cache
```

### 构建项目

```bash
npm run build
```

### 运行测试

```bash
npm test
```

### 配置 API Key

```bash
mkdir -p ~/.code-agent
echo 'DEEPSEEK_API_KEY=your_key' > ~/.code-agent/.env
```

## 开发流程

### 1. 创建分支

从 `main` 分支创建新分支：

```bash
git checkout -b feature/my-feature
# 或
git checkout -b fix/my-bugfix
```

**分支命名规范**:
- `feature/` - 新功能
- `fix/` - Bug 修复
- `docs/` - 文档更新
- `test/` - 测试相关
- `refactor/` - 代码重构
- `perf/` - 性能优化

### 2. 进行开发

- 保持提交小而专注
- 遵循代码规范
- 添加必要的测试
- 更新相关文档

### 3. 运行检查

在提交前运行：

```bash
# 类型检查
npm run check

# 运行测试
npm test

# 构建项目
npm run build
```

### 4. 提交更改

```bash
git add .
git commit -m "feat: add new feature"
```

### 5. 推送分支

```bash
git push origin feature/my-feature
```

### 6. 创建 Pull Request

在 GitHub 上创建 Pull Request。

## 代码规范

### TypeScript 风格

我们遵循以下 TypeScript 风格指南：

#### 命名规范

```typescript
// ✅ 好
class UserService {}
interface CodeNode {}
type Language = 'typescript' | 'python';
const MAX_STEPS = 50;
function getUserById(id: string) {}

// ❌ 不好
class userservice {}
interface codenode {}
type language = string;
const maxSteps = 50;
function GetUserById(id: string) {}
```

#### 类型注解

```typescript
// ✅ 好 - 明确的类型
function processFile(filePath: string): Promise<ParseResult> {
  // ...
}

// ❌ 不好 - 隐式 any
function processFile(filePath) {
  // ...
}
```

#### 接口 vs 类型

```typescript
// ✅ 使用 interface 定义对象结构
interface CodeNode {
  id: string;
  name: string;
}

// ✅ 使用 type 定义联合类型
type NodeKind = 'class' | 'function' | 'variable';

// ✅ 使用 type 定义复杂类型
type ParseResult = {
  nodes: CodeNode[];
  edges: CodeEdge[];
};
```

#### 异步代码

```typescript
// ✅ 好 - 使用 async/await
async function indexFile(filePath: string): Promise<void> {
  const content = await fs.readFile(filePath, 'utf-8');
  const result = await parser.parse(filePath, content);
  await store.save(result);
}

// ❌ 不好 - 回调地狱
function indexFile(filePath: string, callback: Function) {
  fs.readFile(filePath, 'utf-8', (err, content) => {
    if (err) return callback(err);
    parser.parse(filePath, content, (err, result) => {
      if (err) return callback(err);
      store.save(result, callback);
    });
  });
}
```

#### 错误处理

```typescript
// ✅ 好 - 明确的错误处理
async function getUser(id: string): Promise<User> {
  if (!id) {
    throw new Error('User ID is required');
  }
  
  try {
    return await db.findUser(id);
  } catch (error) {
    throw new Error(`Failed to get user: ${error.message}`);
  }
}

// ❌ 不好 - 吞掉错误
async function getUser(id: string): Promise<User | null> {
  try {
    return await db.findUser(id);
  } catch (error) {
    return null;
  }
}
```

### 文件组织

```
src/
├── module/
│   ├── index.ts          # 导出公共 API
│   ├── types.ts          # 类型定义
│   ├── service.ts        # 主要逻辑
│   └── utils.ts          # 辅助函数
```

### 注释规范

```typescript
/**
 * 解析源代码文件并提取符号
 * 
 * @param filePath - 文件路径
 * @param content - 文件内容
 * @returns 解析结果，包含节点和边
 * @throws 如果文件无法解析
 */
async function parse(filePath: string, content: string): Promise<ParseResult> {
  // 实现
}
```

**何时添加注释**:
- ✅ 公共 API 和接口
- ✅ 复杂的算法或逻辑
- ✅ 非显而易见的代码
- ❌ 显而易见的代码
- ❌ 重复代码本身的信息

## 提交规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

### 提交消息格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 类型

- `feat` - 新功能
- `fix` - Bug 修复
- `docs` - 文档更新
- `style` - 代码格式（不影响功能）
- `refactor` - 代码重构
- `perf` - 性能优化
- `test` - 测试相关
- `chore` - 构建或辅助工具

### Scope 范围（可选）

- `parser` - 解析器
- `graph` - 图谱
- `runtime` - 运行时
- `tool` - 工具
- `cli` - 命令行
- `tui` - 终端 UI

### 示例

```bash
# 新功能
git commit -m "feat(parser): add Go language support"

# Bug 修复
git commit -m "fix(graph): resolve circular dependency issue"

# 文档
git commit -m "docs: update installation guide"

# 重构
git commit -m "refactor(tool): simplify tool registry"

# 测试
git commit -m "test(parser): add tests for Python parser"
```

### 提交消息最佳实践

- ✅ 使用现在时态："add feature" 而不是 "added feature"
- ✅ 使用祈使语气："move cursor to..." 而不是 "moves cursor to..."
- ✅ 首字母小写
- ✅ 不要以句号结尾
- ✅ 限制第一行在 72 字符以内
- ✅ 如果需要，在空行后添加详细说明

## Pull Request 流程

### 1. 创建 PR

在 GitHub 上创建 Pull Request，使用以下模板：

```markdown
## 描述
简要描述这个 PR 的目的

## 变更类型
- [ ] Bug 修复
- [ ] 新功能
- [ ] 重构
- [ ] 文档更新
- [ ] 测试

## 变更内容
- 添加了...
- 修复了...
- 更新了...

## 测试
- [ ] 添加了新测试
- [ ] 所有测试通过
- [ ] 手动测试通过

## 检查清单
- [ ] 代码遵循项目规范
- [ ] 添加了必要的文档
- [ ] 更新了 CHANGELOG（如果需要）
- [ ] 没有引入破坏性变更（或已说明）

## 相关 Issue
Closes #123
```

### 2. 代码审查

- 响应审查意见
- 进行必要的修改
- 保持讨论专业和建设性

### 3. 合并

PR 将在以下条件满足后合并：

- ✅ 至少一个维护者批准
- ✅ 所有 CI 检查通过
- ✅ 没有合并冲突
- ✅ 代码符合规范

## 测试

### 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试
npm test tests/unit/parser.test.ts

# 监听模式
npm run test:watch

# 覆盖率报告
npm run test:coverage
```

### 编写测试

每个新功能或 Bug 修复都应该有相应的测试：

```typescript
import { describe, it, expect } from 'vitest';

describe('MyFeature', () => {
  it('should work correctly', () => {
    const result = myFeature('input');
    expect(result).toBe('expected');
  });
  
  it('should handle edge cases', () => {
    expect(() => myFeature('')).toThrow();
  });
});
```

详见 [测试指南](docs/testing.md)。

## 文档

### 更新文档

如果你的更改影响用户使用方式，请更新相关文档：

- `README.md` - 主要文档
- `docs/` - 详细文档
- 代码注释 - API 文档

### 文档风格

- 使用清晰、简洁的语言
- 提供代码示例
- 包含常见问题解答
- 保持格式一致

## 发布流程

（仅限维护者）

### 1. 更新版本

```bash
npm version patch  # 0.1.0 -> 0.1.1
npm version minor  # 0.1.0 -> 0.2.0
npm version major  # 0.1.0 -> 1.0.0
```

### 2. 更新 CHANGELOG

在 `CHANGELOG.md` 中记录变更。

### 3. 创建 Git Tag

```bash
git tag v0.1.1
git push origin v0.1.1
```

### 4. 发布到 npm

```bash
npm publish
```

## 获取帮助

如果你有任何问题：

- 📖 查看 [文档](docs/)
- 💬 在 Issue 中提问
- 📧 联系维护者

## 致谢

感谢所有贡献者！你们的贡献让 CodeAgent 变得更好。

## 许可证

通过贡献代码，你同意你的贡献将在 MIT 许可证下发布。
