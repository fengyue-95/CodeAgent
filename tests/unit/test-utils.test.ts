/**
 * 测试工具函数测试
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  createTempDir,
  cleanupTempDir,
  createTestFile,
  createTestProject,
  sleep,
} from '../helpers/test-utils';
import fs from 'fs';
import path from 'path';

describe('Test Utils', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.forEach(dir => {
      try {
        cleanupTempDir(dir);
      } catch (e) {
        // Ignore cleanup errors
      }
    });
    tempDirs.length = 0;
  });

  describe('createTempDir', () => {
    it('should create a temporary directory', () => {
      const dir = createTempDir('test');
      tempDirs.push(dir);

      expect(fs.existsSync(dir)).toBe(true);
      expect(fs.statSync(dir).isDirectory()).toBe(true);
    });

    it('should create unique directories', () => {
      const dir1 = createTempDir('test');
      const dir2 = createTempDir('test');
      tempDirs.push(dir1, dir2);

      expect(dir1).not.toBe(dir2);
      expect(fs.existsSync(dir1)).toBe(true);
      expect(fs.existsSync(dir2)).toBe(true);
    });
  });

  describe('createTestFile', () => {
    it('should create a file with content', () => {
      const dir = createTempDir('test');
      tempDirs.push(dir);

      const filePath = createTestFile(dir, 'test.txt', 'Hello, World!');

      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('Hello, World!');
    });

    it('should create nested directories', () => {
      const dir = createTempDir('test');
      tempDirs.push(dir);

      const filePath = createTestFile(dir, 'nested/dir/test.txt', 'content');

      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.existsSync(path.dirname(filePath))).toBe(true);
    });
  });

  describe('createTestProject', () => {
    it('should create a project with multiple files', () => {
      const projectDir = createTestProject('test-project', {
        'file1.txt': 'content1',
        'file2.txt': 'content2',
        'dir/file3.txt': 'content3',
      });
      tempDirs.push(projectDir);

      expect(fs.existsSync(path.join(projectDir, 'file1.txt'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'file2.txt'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'dir/file3.txt'))).toBe(true);
    });
  });

  describe('sleep', () => {
    it('should wait for specified time', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some tolerance
    });
  });

  describe('cleanupTempDir', () => {
    it('should remove directory and contents', () => {
      const dir = createTempDir('test');
      createTestFile(dir, 'test.txt', 'content');

      expect(fs.existsSync(dir)).toBe(true);

      cleanupTempDir(dir);

      expect(fs.existsSync(dir)).toBe(false);
    });
  });
});
