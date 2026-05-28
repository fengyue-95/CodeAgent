/**
 * 测试工具函数
 */

import fs from 'fs';
import path from 'path';
import { TEST_TMP_DIR } from '../setup';

let tempDirCounter = 0;

/**
 * 创建临时测试目录
 */
export function createTempDir(name: string): string {
  const uniqueId = `${Date.now()}-${tempDirCounter++}`;
  const dir = path.join(TEST_TMP_DIR, name, uniqueId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 清理临时目录
 */
export function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 创建测试文件
 */
export function createTestFile(dir: string, filename: string, content: string): string {
  const filePath = path.join(dir, filename);
  const fileDir = path.dirname(filePath);

  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * 创建测试项目结构
 */
export function createTestProject(name: string, files: Record<string, string>): string {
  const projectDir = createTempDir(name);

  for (const [filename, content] of Object.entries(files)) {
    createTestFile(projectDir, filename, content);
  }

  return projectDir;
}

/**
 * 等待指定时间
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 重试函数直到成功或超时
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; delay?: number } = {}
): Promise<T> {
  const { maxAttempts = 3, delay = 100 } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      await sleep(delay);
    }
  }

  throw new Error('Retry failed');
}

/**
 * 断言抛出异步错误
 */
export async function expectAsyncError(
  fn: () => Promise<any>,
  errorMatcher?: string | RegExp | ((error: Error) => boolean)
): Promise<void> {
  let error: Error | undefined;

  try {
    await fn();
  } catch (e) {
    error = e as Error;
  }

  if (!error) {
    throw new Error('Expected function to throw an error, but it did not');
  }

  if (typeof errorMatcher === 'string') {
    if (!error.message.includes(errorMatcher)) {
      throw new Error(`Expected error message to include "${errorMatcher}", but got "${error.message}"`);
    }
  } else if (errorMatcher instanceof RegExp) {
    if (!errorMatcher.test(error.message)) {
      throw new Error(`Expected error message to match ${errorMatcher}, but got "${error.message}"`);
    }
  } else if (typeof errorMatcher === 'function') {
    if (!errorMatcher(error)) {
      throw new Error(`Error did not match custom matcher: ${error.message}`);
    }
  }
}
