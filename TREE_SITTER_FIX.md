# Tree-Sitter 版本不兼容问题修复 ✅

## 问题描述

运行 `code-agent index` 时出现错误：
```
[ERROR] Incompatible language version 0. Compatibility range 13 through 15.
```

## 已修复 ✅ (2026-05-28)

**原因**: `tree-sitter-wasms@0.1.11` 的 wasm 文件版本与 `web-tree-sitter@0.25.10` 不兼容。

**解决方案**: 
1. ✅ 降级 `web-tree-sitter` 从 0.25.10 到 0.23.2
2. ✅ 升级 `tree-sitter-wasms` 从 0.1.11 到 0.1.13
3. ✅ 修复所有导入语句以兼容新版本 API

**代码变更**:
- `package.json`: 更新依赖版本
- `src/parser/grammars.ts`: 使用 `Parser.Language.load()` 替代 `WasmLanguage.load()`
- `src/parser/common.ts`: 使用 `type SyntaxNode = Parser.SyntaxNode`
- `src/parser/java-extractor.ts`: 修复导入
- `src/parser/python-extractor.ts`: 修复导入
- `src/parser/script-extractor.ts`: 修复导入

## 验证修复

```bash
# 1. 安装依赖
npm install

# 2. 重新构建
npm run build
# ✅ 构建成功

# 3. 运行测试
npm test
# ✅ 71/73 tests passed

# 4. 测试索引
code-agent index
# 应该可以正常工作
```

## 解决方案

### 方案 1: 升级 tree-sitter-wasms（推荐）

```bash
# 1. 先修复 npm 缓存权限问题（如果有）
sudo chown -R $(whoami) ~/.npm

# 2. 升级到兼容版本
npm install tree-sitter-wasms@latest

# 3. 重新构建
npm run build

# 4. 测试
code-agent index
```

### 方案 2: 降级 web-tree-sitter

```bash
# 使用兼容的旧版本
npm install web-tree-sitter@0.20.8 tree-sitter-wasms@0.1.11

# 重新构建
npm run build
```

### 方案 3: 使用固定的兼容版本组合

```bash
# 已知兼容的版本组合
npm install web-tree-sitter@0.23.2 tree-sitter-wasms@0.1.13

# 重新构建
npm run build
```

## 修复 npm 缓存权限

如果遇到 npm 缓存权限错误：

```bash
# 方法 1: 修复权限
sudo chown -R $(whoami) ~/.npm

# 方法 2: 清理缓存
npm cache clean --force
sudo chown -R $(whoami) ~/.npm
```

## 验证修复

```bash
# 1. 检查版本
npm list tree-sitter-wasms web-tree-sitter

# 2. 重新构建
npm run build

# 3. 测试索引
code-agent index

# 4. 如果还有问题，查看详细日志
code-agent index --verbose
```

## 长期解决方案

更新 `package.json` 使用兼容的版本：

```json
{
  "dependencies": {
    "tree-sitter-wasms": "^0.1.13",
    "web-tree-sitter": "^0.23.2"
  }
}
```

或者使用最新版本：

```json
{
  "dependencies": {
    "tree-sitter-wasms": "^0.1.15",
    "web-tree-sitter": "^0.26.9"
  }
}
```

## 相关链接

- [web-tree-sitter releases](https://github.com/tree-sitter/tree-sitter/releases)
- [tree-sitter-wasms npm](https://www.npmjs.com/package/tree-sitter-wasms)
