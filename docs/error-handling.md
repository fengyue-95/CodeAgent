# 错误处理和日志系统

本文档介绍 CodeAgent 的错误处理和日志系统。

## 目录

- [日志系统](#日志系统)
- [错误处理](#错误处理)
- [CLI 选项](#cli-选项)
- [最佳实践](#最佳实践)

## 日志系统

### 日志级别

CodeAgent 支持以下日志级别：

- `DEBUG` - 调试信息，用于开发和故障排查
- `INFO` - 一般信息，正常操作的反馈
- `WARN` - 警告信息，潜在问题
- `ERROR` - 错误信息，操作失败
- `SILENT` - 静默模式，不输出任何日志

### 使用日志

```typescript
import { logger, LogLevel } from './utils/logger';

// 设置日志级别
logger.setLevel(LogLevel.DEBUG);

// 记录日志
logger.debug('Debug message', { data: 'value' });
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message', error);

// 创建子日志器
const childLogger = logger.child('module-name');
childLogger.info('Message from module');
```

### CLI 日志选项

```bash
# 详细输出
code-agent index --verbose

# 调试输出
code-agent index --debug

# 静默模式
code-agent index --quiet

# 禁用颜色
code-agent index --no-color

# 输出到文件
code-agent index --log-file output.log
```

**注意**：全局选项（--verbose, --debug, --quiet, --no-color, --log-file）可以用于任何命令。

## 错误处理

### 错误类型

CodeAgent 定义了以下错误类型：

#### CodeAgentError

基础错误类，所有自定义错误都继承自它。

```typescript
import { CodeAgentError, ErrorCode } from './utils/errors';

throw new CodeAgentError(
  'Operation failed',
  ErrorCode.INVALID_ARGUMENT,
  {
    context: { param: 'value' },
    suggestions: [
      {
        message: 'Check the parameter value',
        action: 'code-agent help',
      },
    ],
  }
);
```

#### 特定错误类型

- `FileSystemError` - 文件系统错误
- `ParseError` - 解析错误
- `DatabaseError` - 数据库错误
- `NetworkError` - 网络错误
- `ConfigError` - 配置错误
- `AgentError` - Agent 错误

### 错误代码

```typescript
enum ErrorCode {
  // 通用错误
  UNKNOWN = 'UNKNOWN',
  INTERNAL = 'INTERNAL',
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
  NOT_FOUND = 'NOT_FOUND',
  
  // 文件系统错误
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_READ_ERROR = 'FILE_READ_ERROR',
  
  // 解析错误
  PARSE_ERROR = 'PARSE_ERROR',
  UNSUPPORTED_LANGUAGE = 'UNSUPPORTED_LANGUAGE',
  
  // 数据库错误
  DATABASE_ERROR = 'DATABASE_ERROR',
  
  // 网络错误
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_ERROR = 'API_ERROR',
  
  // 配置错误
  CONFIG_ERROR = 'CONFIG_ERROR',
  MISSING_CONFIG = 'MISSING_CONFIG',
  
  // Agent 错误
  AGENT_ERROR = 'AGENT_ERROR',
  MAX_STEPS_EXCEEDED = 'MAX_STEPS_EXCEEDED',
}
```

### 错误工厂函数

使用工厂函数创建常见错误：

```typescript
import {
  createFileNotFoundError,
  createMissingConfigError,
  createAPIError,
  createDatabaseError,
} from './utils/errors';

// 文件未找到
throw createFileNotFoundError('/path/to/file.ts');

// 配置缺失
throw createMissingConfigError('API_KEY', '.env');

// API 错误
throw createAPIError('Request failed', 404);

// 数据库错误
throw createDatabaseError('Query failed', 'SELECT * FROM users');
```

### 错误处理

```typescript
import { ErrorHandler } from './utils/errors';

try {
  // 操作
} catch (error) {
  // 处理错误
  const handled = ErrorHandler.handle(error);
  console.error(handled.format());
  
  // 获取建议
  const suggestions = ErrorHandler.getSuggestions(error);
  suggestions.forEach(s => console.log(s.message));
}
```

### 错误报告

```typescript
import { ErrorReporter } from './utils/error-reporter';
import { logger } from './utils/logger';

const reporter = new ErrorReporter(logger);

try {
  // 操作
} catch (error) {
  // 报告错误
  reporter.report(error, verbose);
  
  // 生成错误报告
  const report = reporter.generateReport(error);
  
  // 保存报告
  reporter.saveReport(error, 'error-report.json');
}
```

## CLI 选项

### 全局选项

所有命令都支持以下全局选项：

```bash
--verbose       # 启用详细输出
--debug         # 启用调试输出
--quiet         # 静默模式，只显示错误
--no-color      # 禁用彩色输出
--log-file PATH # 将日志写入文件
```

### CLI 日志选项

```bash
# 详细模式索引项目
code-agent index --verbose

# 调试模式运行 Agent
code-agent run "task" --debug

# 静默模式，只显示错误
code-agent sync --quiet

# 保存日志到文件
code-agent index --log-file index.log
```

## 错误信息格式

### 基本格式

CodeAgent 的错误信息现在包含：
- 清晰的错误描述
- 错误代码（用于分类）
- 上下文信息（相关参数和状态）
- 可操作的建议（如何解决问题）

```
Error [ERROR_CODE]: Error message

Context:
  key: value
  
Suggestions:
  1. Suggestion message
     → Action to take
  2. Another suggestion

Caused by: Original error message
```

### CLI 错误示例

**无效的命令**：
```bash
$ code-agent invalid-command
Error [INVALID_ARGUMENT]: Unknown command: invalid-command

Suggestions:
  1. Run code-agent --help to see available commands
```

**缺少必需参数**：
```bash
$ code-agent run
Error [INVALID_ARGUMENT]: Missing task argument

Suggestions:
  1. Usage: code-agent run "<task>" [projectPath]
```

**无效的选项值**：
```bash
$ code-agent run "task" --agent invalid
Error [INVALID_ARGUMENT]: Invalid agent: invalid

Context:
  value: "invalid"

Suggestions:
  1. Expected "build" or "plan"
```

**会话不存在**：
```bash
$ code-agent run "task" --continue
Error [NOT_FOUND]: No existing sessions found

Suggestions:
  1. Run "code-agent session new" to create a session first
  2. Or omit --continue to create a new session automatically
```

### 详细错误信息

使用 `--verbose` 或 `--debug` 选项可以获取更详细的错误信息：

```bash
# 基本错误信息
$ code-agent run "task"
Error [API_ERROR]: Request failed

# 详细错误信息（包含上下文和堆栈跟踪）
$ code-agent run "task" --debug
Error [API_ERROR]: Request failed

Context:
  endpoint: "https://api.deepseek.com/v1/chat/completions"
  statusCode: 401

Suggestions:
  1. Check your API key configuration
     → cat ~/.code-agent/.env
  2. Verify the API key is valid
     → https://platform.deepseek.com/api_keys

Caused by: Unauthorized: Invalid API key

Stack trace:
  at DeepSeekProvider.chat (src/provider/deepseek.ts:45:10)
  ...
```

### 示例

```
Error [FILE_NOT_FOUND]: File not found: src/missing.ts

Context:
  filePath: "src/missing.ts"

Suggestions:
  1. Check if the file path is correct
     → ls -la src/missing.ts
  2. Check if the file exists in the project
     → find . -name "missing.ts"
```

## 最佳实践

### 1. 使用适当的日志级别

```typescript
// ✅ 好
logger.debug('Parsing file', { path: filePath });
logger.info('Index completed');
logger.warn('File skipped', { reason: 'too large' });
logger.error('Failed to parse', error);

// ❌ 不好
logger.info('x = 5'); // 太详细
logger.error('Something happened'); // 不够具体
```

### 2. 提供有用的错误信息

```typescript
// ✅ 好
throw new FileSystemError(
  `Failed to read file: ${filePath}`,
  ErrorCode.FILE_READ_ERROR,
  {
    context: { filePath, error: err.message },
    suggestions: [
      { message: 'Check file permissions' },
      { message: 'Verify the file exists' },
    ],
  }
);

// ❌ 不好
throw new Error('Read failed');
```

### 3. 使用子日志器组织日志

```typescript
// ✅ 好
const parserLogger = logger.child('parser');
const indexLogger = logger.child('indexer');

parserLogger.info('Parsing file');
indexLogger.info('Indexing complete');

// 输出:
// [INFO] [parser] Parsing file
// [INFO] [indexer] Indexing complete
```

### 4. 捕获并处理错误

```typescript
// ✅ 好
try {
  await parseFile(filePath);
} catch (error) {
  throw ErrorHandler.wrap(
    error,
    `Failed to parse ${filePath}`,
    ErrorCode.PARSE_ERROR
  );
}

// ❌ 不好
try {
  await parseFile(filePath);
} catch (error) {
  // 吞掉错误
}
```

### 5. 提供可操作的建议

```typescript
// ✅ 好
suggestions: [
  {
    message: 'Install missing dependencies',
    action: 'npm install',
  },
  {
    message: 'Check the configuration file',
    action: 'cat .code-agent/config.json',
  },
]

// ❌ 不好
suggestions: [
  { message: 'Fix the error' }, // 不够具体
]
```

## 调试技巧

### 1. 启用调试模式

```bash
code-agent index --debug
```

### 2. 查看详细错误信息

```bash
code-agent run "task" --verbose
```

### 3. 保存日志用于分析

```bash
code-agent index --log-file debug.log --debug
```

### 4. 生成错误报告

当遇到错误时，错误报告会自动保存到 `.code-agent/error-report.json`，包含：
- 错误详情
- 系统信息
- 上下文数据
- 建议的解决方案

## 参考

- [Logger API](../src/utils/logger.ts)
- [Errors API](../src/utils/errors.ts)
- [Error Reporter API](../src/utils/error-reporter.ts)
- [CLI Helpers](../src/utils/cli-helpers.ts)
