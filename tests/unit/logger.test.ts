/**
 * 日志系统测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Logger, LogLevel } from '../../src/utils/logger';

describe('Logger', () => {
  let logger: Logger;
  let output: string[];
  let originalStdout: any;
  let originalStderr: any;

  beforeEach(() => {
    logger = new Logger({ colors: false });
    output = [];

    // 捕获输出
    originalStdout = process.stdout.write;
    originalStderr = process.stderr.write;

    process.stdout.write = ((chunk: any) => {
      output.push(chunk.toString());
      return true;
    }) as any;

    process.stderr.write = ((chunk: any) => {
      output.push(chunk.toString());
      return true;
    }) as any;
  });

  afterEach(() => {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
  });

  describe('log levels', () => {
    it('should log debug messages when level is DEBUG', () => {
      logger.setLevel(LogLevel.DEBUG);
      logger.debug('test message');

      expect(output.length).toBeGreaterThan(0);
      expect(output[0]).toContain('DEBUG');
      expect(output[0]).toContain('test message');
    });

    it('should not log debug messages when level is INFO', () => {
      logger.setLevel(LogLevel.INFO);
      logger.debug('test message');

      expect(output.length).toBe(0);
    });

    it('should log info messages', () => {
      logger.setLevel(LogLevel.INFO);
      logger.info('test message');

      expect(output.length).toBeGreaterThan(0);
      expect(output[0]).toContain('INFO');
    });

    it('should log warn messages', () => {
      logger.setLevel(LogLevel.WARN);
      logger.warn('test message');

      expect(output.length).toBeGreaterThan(0);
      expect(output[0]).toContain('WARN');
    });

    it('should log error messages', () => {
      logger.setLevel(LogLevel.ERROR);
      logger.error('test message');

      expect(output.length).toBeGreaterThan(0);
      expect(output[0]).toContain('ERROR');
    });
  });

  describe('child logger', () => {
    it('should create child logger with prefix', () => {
      logger.setLevel(LogLevel.INFO);
      const child = logger.child('test');
      child.info('message');

      expect(output[0]).toContain('[test]');
      expect(output[0]).toContain('message');
    });

    it('should nest prefixes', () => {
      logger.setLevel(LogLevel.INFO);
      const child1 = logger.child('parent');
      const child2 = child1.child('child');
      child2.info('message');

      expect(output[0]).toContain('[parent:child]');
    });
  });

  describe('data logging', () => {
    it('should log additional data', () => {
      logger.setLevel(LogLevel.INFO);
      logger.info('message', { key: 'value' });

      expect(output.length).toBeGreaterThan(1);
      expect(output[1]).toContain('key');
      expect(output[1]).toContain('value');
    });
  });

  describe('error logging', () => {
    it('should log error with stack trace', () => {
      logger.setLevel(LogLevel.ERROR);
      const error = new Error('test error');
      logger.error('message', error);

      expect(output.length).toBeGreaterThan(1);
      expect(output.join('')).toContain('test error');
    });
  });

  describe('entries', () => {
    it('should store log entries', () => {
      logger.setLevel(LogLevel.DEBUG);
      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      const entries = logger.getEntries();
      expect(entries.length).toBe(4);
      expect(entries[0].message).toBe('debug');
      expect(entries[3].message).toBe('error');
    });

    it('should clear entries', () => {
      logger.setLevel(LogLevel.INFO);
      logger.info('test');
      expect(logger.getEntries().length).toBe(1);

      logger.clear();
      expect(logger.getEntries().length).toBe(0);
    });
  });
});
