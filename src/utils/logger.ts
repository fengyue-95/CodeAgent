/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

/**
 * 日志配置
 */
export interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
  timestamp?: boolean;
  colors?: boolean;
}

/**
 * 日志条目
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  prefix?: string;
  data?: any;
  error?: Error;
}

/**
 * 颜色代码
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // 前景色
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

/**
 * 日志器类
 */
export class Logger {
  private config: LoggerConfig;
  private entries: LogEntry[] = [];

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: LogLevel.INFO,
      timestamp: false,
      colors: true,
      ...config,
    };
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * 获取日志级别
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * 启用/禁用颜色
   */
  setColors(enabled: boolean): void {
    this.config.colors = enabled;
  }

  /**
   * DEBUG 日志
   */
  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * INFO 日志
   */
  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * WARN 日志
   */
  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * ERROR 日志
   */
  error(message: string, error?: Error | any): void {
    this.log(LogLevel.ERROR, message, undefined, error);
  }

  /**
   * 记录日志
   */
  private log(level: LogLevel, message: string, data?: any, error?: Error): void {
    if (level < this.config.level) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      prefix: this.config.prefix,
      data,
      error,
    };

    this.entries.push(entry);
    this.output(entry);
  }

  /**
   * 输出日志
   */
  private output(entry: LogEntry): void {
    const parts: string[] = [];

    // 时间戳
    if (this.config.timestamp) {
      const time = entry.timestamp.toISOString();
      parts.push(this.colorize(colors.gray, time));
    }

    // 级别标签
    const levelLabel = this.getLevelLabel(entry.level);
    parts.push(levelLabel);

    // 前缀
    if (entry.prefix) {
      parts.push(this.colorize(colors.cyan, `[${entry.prefix}]`));
    }

    // 消息
    parts.push(entry.message);

    // 输出
    const output = parts.join(' ');
    const stream = entry.level >= LogLevel.ERROR ? process.stderr : process.stdout;
    stream.write(output + '\n');

    // 数据
    if (entry.data !== undefined) {
      const dataStr = typeof entry.data === 'string'
        ? entry.data
        : JSON.stringify(entry.data, null, 2);
      stream.write(this.colorize(colors.gray, dataStr) + '\n');
    }

    // 错误
    if (entry.error) {
      if (entry.error instanceof Error) {
        stream.write(this.colorize(colors.red, entry.error.stack || entry.error.message) + '\n');
      } else {
        stream.write(this.colorize(colors.red, String(entry.error)) + '\n');
      }
    }
  }

  /**
   * 获取级别标签
   */
  private getLevelLabel(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return this.colorize(colors.gray, '[DEBUG]');
      case LogLevel.INFO:
        return this.colorize(colors.blue, '[INFO]');
      case LogLevel.WARN:
        return this.colorize(colors.yellow, '[WARN]');
      case LogLevel.ERROR:
        return this.colorize(colors.red, '[ERROR]');
      default:
        return '[LOG]';
    }
  }

  /**
   * 着色文本
   */
  private colorize(color: string, text: string): string {
    if (!this.config.colors) {
      return text;
    }
    return `${color}${text}${colors.reset}`;
  }

  /**
   * 获取所有日志条目
   */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * 清空日志
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * 创建子日志器
   */
  child(prefix: string): Logger {
    return new Logger({
      ...this.config,
      prefix: this.config.prefix ? `${this.config.prefix}:${prefix}` : prefix,
    });
  }
}

/**
 * 全局日志器实例
 */
let globalLogger: Logger | null = null;

/**
 * 获取全局日志器
 */
export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}

/**
 * 设置全局日志器
 */
export function setLogger(logger: Logger): void {
  globalLogger = logger;
}

/**
 * 便捷方法
 */
export const logger = {
  debug: (message: string, data?: any) => getLogger().debug(message, data),
  info: (message: string, data?: any) => getLogger().info(message, data),
  warn: (message: string, data?: any) => getLogger().warn(message, data),
  error: (message: string, error?: Error | any) => getLogger().error(message, error),
  setLevel: (level: LogLevel) => getLogger().setLevel(level),
  child: (prefix: string) => getLogger().child(prefix),
};
