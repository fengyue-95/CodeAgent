/**
 * 错误报告工具
 */

import os from 'os';
import { CodeAgentError } from './errors';
import { Logger } from './logger';

/**
 * 错误报告
 */
export interface ErrorReport {
  error: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
  };
  context?: Record<string, any>;
  suggestions?: Array<{ message: string; action?: string }>;
  system: {
    platform: string;
    arch: string;
    nodeVersion: string;
    codeAgentVersion: string;
  };
  timestamp: string;
}

/**
 * 错误报告器
 */
export class ErrorReporter {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * 报告错误
   */
  report(error: unknown, verbose: boolean = false): void {
    if (error instanceof CodeAgentError) {
      this.reportCodeAgentError(error, verbose);
    } else if (error instanceof Error) {
      this.reportGenericError(error, verbose);
    } else {
      this.reportUnknownError(error, verbose);
    }
  }

  /**
   * 报告 CodeAgent 错误
   */
  private reportCodeAgentError(error: CodeAgentError, verbose: boolean): void {
    // 错误消息
    this.logger.error(error.message);

    // 上下文
    if (verbose && error.context && Object.keys(error.context).length > 0) {
      console.error('\nContext:');
      for (const [key, value] of Object.entries(error.context)) {
        console.error(`  ${key}: ${JSON.stringify(value)}`);
      }
    }

    // 建议
    if (error.suggestions.length > 0) {
      console.error('\nSuggestions:');
      error.suggestions.forEach((suggestion, index) => {
        console.error(`  ${index + 1}. ${suggestion.message}`);
        if (suggestion.action) {
          console.error(`     → ${suggestion.action}`);
        }
      });
    }

    // 原因
    if (verbose && error.cause) {
      console.error(`\nCaused by: ${error.cause.message}`);
      if (error.cause.stack) {
        console.error(error.cause.stack);
      }
    }

    // 堆栈跟踪
    if (verbose && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  }

  /**
   * 报告通用错误
   */
  private reportGenericError(error: Error, verbose: boolean): void {
    this.logger.error(error.message);

    if (verbose && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  }

  /**
   * 报告未知错误
   */
  private reportUnknownError(error: unknown, verbose: boolean): void {
    this.logger.error(`Unknown error: ${String(error)}`);

    if (verbose) {
      console.error('\nError details:');
      console.error(error);
    }
  }

  /**
   * 生成错误报告
   */
  generateReport(error: unknown): ErrorReport {
    const report: ErrorReport = {
      error: {
        name: 'Unknown',
        message: String(error),
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        codeAgentVersion: this.getVersion(),
      },
      timestamp: new Date().toISOString(),
    };

    if (error instanceof CodeAgentError) {
      report.error = {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack,
      };
      report.context = error.context;
      report.suggestions = error.suggestions;
    } else if (error instanceof Error) {
      report.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return report;
  }

  /**
   * 保存错误报告
   */
  saveReport(error: unknown, outputPath: string): void {
    const report = this.generateReport(error);
    const fs = require('fs');
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.error(`\nError report saved to: ${outputPath}`);
  }

  /**
   * 获取版本号
   */
  private getVersion(): string {
    try {
      const packageJson = require('../../package.json');
      return packageJson.version || 'unknown';
    } catch {
      return 'unknown';
    }
  }
}

/**
 * 格式化错误用于显示
 */
export function formatError(error: unknown, verbose: boolean = false): string {
  if (error instanceof CodeAgentError) {
    return verbose ? error.format() : error.message;
  }

  if (error instanceof Error) {
    return verbose && error.stack ? error.stack : error.message;
  }

  return String(error);
}

/**
 * 判断是否应该显示堆栈跟踪
 */
export function shouldShowStack(error: unknown): boolean {
  // 对于已知的用户错误，不显示堆栈
  if (error instanceof CodeAgentError) {
    return false;
  }

  // 对于未知错误，显示堆栈
  return true;
}
