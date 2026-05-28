/**
 * 全局选项解析
 */

import { GlobalOptions } from '../utils/cli-helpers';

/**
 * 从命令行参数中解析全局选项
 */
export function parseGlobalOptions(args: string[]): GlobalOptions {
  const options: GlobalOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === '--verbose') {
      options.verbose = true;
      continue;
    }

    if (arg === '--debug') {
      options.debug = true;
      continue;
    }

    if (arg === '--quiet') {
      options.quiet = true;
      continue;
    }

    if (arg === '--no-color') {
      options.noColor = true;
      continue;
    }

    if (arg === '--log-file') {
      options.logFile = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--log-file=')) {
      options.logFile = arg.slice('--log-file='.length);
      continue;
    }
  }

  return options;
}

/**
 * 从参数列表中移除全局选项
 */
export function stripGlobalOptions(args: string[]): string[] {
  const result: string[] = [];
  let skip = false;

  for (const arg of args) {
    if (skip) {
      skip = false;
      continue;
    }

    if (arg === '--verbose' || arg === '--debug' || arg === '--quiet' || arg === '--no-color') {
      continue;
    }

    if (arg === '--log-file') {
      skip = true;
      continue;
    }

    if (arg.startsWith('--log-file=')) {
      continue;
    }

    result.push(arg);
  }

  return result;
}
