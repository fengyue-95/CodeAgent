/**
 * 错误代码
 */
export enum ErrorCode {
  // 通用错误
  UNKNOWN = 'UNKNOWN',
  INTERNAL = 'INTERNAL',
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  TIMEOUT = 'TIMEOUT',

  // 文件系统错误
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_READ_ERROR = 'FILE_READ_ERROR',
  FILE_WRITE_ERROR = 'FILE_WRITE_ERROR',
  DIRECTORY_NOT_FOUND = 'DIRECTORY_NOT_FOUND',

  // 解析错误
  PARSE_ERROR = 'PARSE_ERROR',
  SYNTAX_ERROR = 'SYNTAX_ERROR',
  UNSUPPORTED_LANGUAGE = 'UNSUPPORTED_LANGUAGE',

  // 数据库错误
  DATABASE_ERROR = 'DATABASE_ERROR',
  DATABASE_CONNECTION_ERROR = 'DATABASE_CONNECTION_ERROR',
  DATABASE_QUERY_ERROR = 'DATABASE_QUERY_ERROR',

  // 网络错误
  NETWORK_ERROR = 'NETWORK_ERROR',
  HTTP_ERROR = 'HTTP_ERROR',
  API_ERROR = 'API_ERROR',

  // 配置错误
  CONFIG_ERROR = 'CONFIG_ERROR',
  MISSING_CONFIG = 'MISSING_CONFIG',
  INVALID_CONFIG = 'INVALID_CONFIG',

  // Agent 错误
  AGENT_ERROR = 'AGENT_ERROR',
  TOOL_ERROR = 'TOOL_ERROR',
  MAX_STEPS_EXCEEDED = 'MAX_STEPS_EXCEEDED',
}

/**
 * 错误上下文
 */
export interface ErrorContext {
  [key: string]: any;
}

/**
 * 错误建议
 */
export interface ErrorSuggestion {
  message: string;
  action?: string;
}

/**
 * 基础错误类
 */
export class CodeAgentError extends Error {
  public readonly code: ErrorCode;
  public readonly context?: ErrorContext;
  public readonly suggestions: ErrorSuggestion[];
  public readonly cause?: Error;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    options: {
      context?: ErrorContext;
      suggestions?: ErrorSuggestion[];
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'CodeAgentError';
    this.code = code;
    this.context = options.context;
    this.suggestions = options.suggestions || [];
    this.cause = options.cause;

    // 保持正确的堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * 格式化错误信息
   */
  format(): string {
    const parts: string[] = [];

    // 错误消息
    parts.push(`Error [${this.code}]: ${this.message}`);

    // 上下文
    if (this.context && Object.keys(this.context).length > 0) {
      parts.push('\nContext:');
      for (const [key, value] of Object.entries(this.context)) {
        parts.push(`  ${key}: ${JSON.stringify(value)}`);
      }
    }

    // 建议
    if (this.suggestions.length > 0) {
      parts.push('\nSuggestions:');
      this.suggestions.forEach((suggestion, index) => {
        parts.push(`  ${index + 1}. ${suggestion.message}`);
        if (suggestion.action) {
          parts.push(`     → ${suggestion.action}`);
        }
      });
    }

    // 原因
    if (this.cause) {
      parts.push(`\nCaused by: ${this.cause.message}`);
    }

    return parts.join('\n');
  }

  /**
   * 转换为 JSON
   */
  toJSON(): object {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      suggestions: this.suggestions,
      cause: this.cause ? {
        name: this.cause.name,
        message: this.cause.message,
      } : undefined,
      stack: this.stack,
    };
  }
}

/**
 * 文件系统错误
 */
export class FileSystemError extends CodeAgentError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.FILE_NOT_FOUND,
    options?: {
      context?: ErrorContext;
      suggestions?: ErrorSuggestion[];
      cause?: Error;
    }
  ) {
    super(message, code, options);
    this.name = 'FileSystemError';
  }
}

/**
 * 解析错误
 */
export class ParseError extends CodeAgentError {
  constructor(
    message: string,
    options?: {
      context?: ErrorContext;
      suggestions?: ErrorSuggestion[];
      cause?: Error;
    }
  ) {
    super(message, ErrorCode.PARSE_ERROR, options);
    this.name = 'ParseError';
  }
}

/**
 * 数据库错误
 */
export class DatabaseError extends CodeAgentError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.DATABASE_ERROR,
    options?: {
      context?: ErrorContext;
      suggestions?: ErrorSuggestion[];
      cause?: Error;
    }
  ) {
    super(message, code, options);
    this.name = 'DatabaseError';
  }
}

/**
 * 网络错误
 */
export class NetworkError extends CodeAgentError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.NETWORK_ERROR,
    options?: {
      context?: ErrorContext;
      suggestions?: ErrorSuggestion[];
      cause?: Error;
    }
  ) {
    super(message, code, options);
    this.name = 'NetworkError';
  }
}

/**
 * 配置错误
 */
export class ConfigError extends CodeAgentError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.CONFIG_ERROR,
    options?: {
      context?: ErrorContext;
      suggestions?: ErrorSuggestion[];
      cause?: Error;
    }
  ) {
    super(message, code, options);
    this.name = 'ConfigError';
  }
}

/**
 * Agent 错误
 */
export class AgentError extends CodeAgentError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.AGENT_ERROR,
    options?: {
      context?: ErrorContext;
      suggestions?: ErrorSuggestion[];
      cause?: Error;
    }
  ) {
    super(message, code, options);
    this.name = 'AgentError';
  }
}

/**
 * 错误处理器
 */
export class ErrorHandler {
  /**
   * 处理错误
   */
  static handle(error: unknown): CodeAgentError {
    if (error instanceof CodeAgentError) {
      return error;
    }

    if (error instanceof Error) {
      return new CodeAgentError(error.message, ErrorCode.UNKNOWN, {
        cause: error,
      });
    }

    return new CodeAgentError(String(error), ErrorCode.UNKNOWN);
  }

  /**
   * 包装错误
   */
  static wrap(error: unknown, message: string, code?: ErrorCode): CodeAgentError {
    const cause = error instanceof Error ? error : new Error(String(error));
    return new CodeAgentError(message, code || ErrorCode.UNKNOWN, { cause });
  }

  /**
   * 判断是否为特定错误
   */
  static isErrorCode(error: unknown, code: ErrorCode): boolean {
    return error instanceof CodeAgentError && error.code === code;
  }

  /**
   * 从错误中提取建议
   */
  static getSuggestions(error: unknown): ErrorSuggestion[] {
    if (error instanceof CodeAgentError) {
      return error.suggestions;
    }
    return [];
  }
}

/**
 * 创建文件未找到错误
 */
export function createFileNotFoundError(
  filePath: string,
  cause?: Error
): FileSystemError {
  return new FileSystemError(
    `File not found: ${filePath}`,
    ErrorCode.FILE_NOT_FOUND,
    {
      context: { filePath },
      suggestions: [
        {
          message: 'Check if the file path is correct',
          action: `ls -la ${filePath}`,
        },
        {
          message: 'Check if the file exists in the project',
          action: `find . -name "${filePath.split('/').pop()}"`,
        },
      ],
      cause,
    }
  );
}

/**
 * 创建配置缺失错误
 */
export function createMissingConfigError(
  configKey: string,
  configFile?: string
): ConfigError {
  return new ConfigError(
    `Missing required configuration: ${configKey}`,
    ErrorCode.MISSING_CONFIG,
    {
      context: { configKey, configFile },
      suggestions: [
        {
          message: `Set ${configKey} in your configuration`,
          action: configFile
            ? `echo '${configKey}=value' >> ${configFile}`
            : `export ${configKey}=value`,
        },
        {
          message: 'Check the documentation for configuration options',
          action: 'cat docs/configuration.md',
        },
      ],
    }
  );
}

/**
 * 创建 API 错误
 */
export function createAPIError(
  message: string,
  statusCode?: number,
  response?: any
): NetworkError {
  return new NetworkError(message, ErrorCode.API_ERROR, {
    context: { statusCode, response },
    suggestions: [
      {
        message: 'Check your API key configuration',
        action: 'cat ~/.code-agent/.env',
      },
      {
        message: 'Verify the API endpoint is accessible',
      },
      {
        message: 'Check the API documentation for correct usage',
      },
    ],
  });
}

/**
 * 创建数据库错误
 */
export function createDatabaseError(
  message: string,
  query?: string,
  cause?: Error
): DatabaseError {
  return new DatabaseError(message, ErrorCode.DATABASE_ERROR, {
    context: { query },
    suggestions: [
      {
        message: 'Check if the database file is corrupted',
        action: 'sqlite3 .code-agent/graph.db "PRAGMA integrity_check"',
      },
      {
        message: 'Try rebuilding the index',
        action: 'code-agent index --rebuild',
      },
    ],
    cause,
  });
}
