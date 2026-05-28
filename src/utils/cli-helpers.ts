/**
 * CLI 选项扩展
 */

import { Logger, LogLevel } from '../utils/logger';
import { ErrorReporter } from '../utils/error-reporter';

/**
 * CLI 全局选项
 */
export interface GlobalOptions {
  verbose?: boolean;
  debug?: boolean;
  quiet?: boolean;
  noColor?: boolean;
  logFile?: string;
}

/**
 * 配置日志器
 */
export function configureLogger(options: GlobalOptions): Logger {
  const logger = new Logger({
    level: getLogLevel(options),
    colors: !options.noColor && process.stdout.isTTY,
    timestamp: options.debug,
  });

  return logger;
}

/**
 * 获取日志级别
 */
function getLogLevel(options: GlobalOptions): LogLevel {
  if (options.quiet) {
    return LogLevel.ERROR;
  }

  if (options.debug) {
    return LogLevel.DEBUG;
  }

  if (options.verbose) {
    return LogLevel.INFO;
  }

  return LogLevel.WARN;
}

/**
 * 创建错误报告器
 */
export function createErrorReporter(logger: Logger): ErrorReporter {
  return new ErrorReporter(logger);
}

/**
 * 处理未捕获的错误
 */
export function setupErrorHandlers(
  logger: Logger,
  reporter: ErrorReporter,
  verbose: boolean
): void {
  // 未捕获的异常
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    reporter.report(error, verbose);
    process.exit(1);
  });

  // 未处理的 Promise 拒绝
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
    reporter.report(reason, verbose);
    process.exit(1);
  });
}

/**
 * 包装异步函数以处理错误
 */
export function wrapAsync<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  reporter: ErrorReporter,
  verbose: boolean
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      reporter.report(error, verbose);
      process.exit(1);
    }
  };
}

/**
 * 添加全局选项到命令
 */
export function addGlobalOptions(command: any): any {
  return command
    .option('--verbose', 'Enable verbose output')
    .option('--debug', 'Enable debug output')
    .option('--quiet', 'Suppress non-error output')
    .option('--no-color', 'Disable colored output')
    .option('--log-file <path>', 'Write logs to file');
}
