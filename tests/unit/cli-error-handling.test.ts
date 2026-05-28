/**
 * CLI 错误处理集成测试
 */

import { describe, it, expect } from 'vitest';
import { parseGlobalOptions, stripGlobalOptions } from '../../src/bin/parse-global-options';

describe('CLI Error Handling', () => {
  describe('parseGlobalOptions', () => {
    it('should parse verbose option', () => {
      const options = parseGlobalOptions(['--verbose']);
      expect(options.verbose).toBe(true);
    });

    it('should parse debug option', () => {
      const options = parseGlobalOptions(['--debug']);
      expect(options.debug).toBe(true);
    });

    it('should parse quiet option', () => {
      const options = parseGlobalOptions(['--quiet']);
      expect(options.quiet).toBe(true);
    });

    it('should parse no-color option', () => {
      const options = parseGlobalOptions(['--no-color']);
      expect(options.noColor).toBe(true);
    });

    it('should parse log-file option', () => {
      const options = parseGlobalOptions(['--log-file', 'output.log']);
      expect(options.logFile).toBe('output.log');
    });

    it('should parse log-file option with equals', () => {
      const options = parseGlobalOptions(['--log-file=output.log']);
      expect(options.logFile).toBe('output.log');
    });

    it('should parse multiple options', () => {
      const options = parseGlobalOptions(['--verbose', '--no-color', '--log-file', 'test.log']);
      expect(options.verbose).toBe(true);
      expect(options.noColor).toBe(true);
      expect(options.logFile).toBe('test.log');
    });

    it('should ignore non-global options', () => {
      const options = parseGlobalOptions(['--agent', 'build', '--verbose']);
      expect(options.verbose).toBe(true);
      expect(options).not.toHaveProperty('agent');
    });
  });

  describe('stripGlobalOptions', () => {
    it('should remove verbose option', () => {
      const result = stripGlobalOptions(['--verbose', 'index', '.']);
      expect(result).toEqual(['index', '.']);
    });

    it('should remove debug option', () => {
      const result = stripGlobalOptions(['--debug', 'sync']);
      expect(result).toEqual(['sync']);
    });

    it('should remove log-file with value', () => {
      const result = stripGlobalOptions(['--log-file', 'output.log', 'index']);
      expect(result).toEqual(['index']);
    });

    it('should remove log-file with equals', () => {
      const result = stripGlobalOptions(['--log-file=output.log', 'index']);
      expect(result).toEqual(['index']);
    });

    it('should preserve non-global options', () => {
      const result = stripGlobalOptions(['--verbose', '--agent', 'build', '--debug']);
      expect(result).toEqual(['--agent', 'build']);
    });

    it('should handle mixed options', () => {
      const result = stripGlobalOptions([
        '--verbose',
        'run',
        'task',
        '--agent',
        'build',
        '--debug',
        '--log-file',
        'test.log',
      ]);
      expect(result).toEqual(['run', 'task', '--agent', 'build']);
    });
  });
});
