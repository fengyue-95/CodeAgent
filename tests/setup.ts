/**
 * Vitest 全局设置文件
 * 在所有测试运行之前执行
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// 测试临时目录
export const TEST_TMP_DIR = path.join(os.tmpdir(), 'code-agent-tests');

// 全局钩子
beforeAll(() => {
  // 创建测试临时目录
  if (!fs.existsSync(TEST_TMP_DIR)) {
    fs.mkdirSync(TEST_TMP_DIR, { recursive: true });
  }
});

afterAll(() => {
  // 清理测试临时目录
  if (fs.existsSync(TEST_TMP_DIR)) {
    try {
      fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors on Windows or when files are locked
      console.warn('Failed to cleanup test directory:', error);
    }
  }
});

beforeEach(() => {
  // 每个测试前的设置
});

afterEach(() => {
  // 每个测试后的清理
});

// 设置环境变量
process.env.NODE_ENV = 'test';
process.env.CODE_AGENT_TEST = 'true';
