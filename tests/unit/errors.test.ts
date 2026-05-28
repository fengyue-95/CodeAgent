/**
 * 错误处理测试
 */

import { describe, it, expect } from 'vitest';
import {
  CodeAgentError,
  ErrorCode,
  FileSystemError,
  ParseError,
  DatabaseError,
  ErrorHandler,
  createFileNotFoundError,
  createMissingConfigError,
} from '../../src/utils/errors';

describe('Errors', () => {
  describe('CodeAgentError', () => {
    it('should create error with code', () => {
      const error = new CodeAgentError('test message', ErrorCode.NOT_FOUND);

      expect(error.message).toBe('test message');
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
      expect(error.name).toBe('CodeAgentError');
    });

    it('should create error with context', () => {
      const error = new CodeAgentError('test', ErrorCode.NOT_FOUND, {
        context: { file: 'test.ts' },
      });

      expect(error.context).toEqual({ file: 'test.ts' });
    });

    it('should create error with suggestions', () => {
      const error = new CodeAgentError('test', ErrorCode.NOT_FOUND, {
        suggestions: [
          { message: 'Try this', action: 'do something' },
        ],
      });

      expect(error.suggestions.length).toBe(1);
      expect(error.suggestions[0].message).toBe('Try this');
    });

    it('should format error message', () => {
      const error = new CodeAgentError('test', ErrorCode.NOT_FOUND, {
        context: { file: 'test.ts' },
        suggestions: [{ message: 'Check the file' }],
      });

      const formatted = error.format();
      expect(formatted).toContain('test');
      expect(formatted).toContain('NOT_FOUND');
      expect(formatted).toContain('Context:');
      expect(formatted).toContain('Suggestions:');
    });

    it('should convert to JSON', () => {
      const error = new CodeAgentError('test', ErrorCode.NOT_FOUND);
      const json = error.toJSON();

      expect(json).toHaveProperty('name');
      expect(json).toHaveProperty('code');
      expect(json).toHaveProperty('message');
    });
  });

  describe('Specific error types', () => {
    it('should create FileSystemError', () => {
      const error = new FileSystemError('file not found');
      expect(error.name).toBe('FileSystemError');
      expect(error.code).toBe(ErrorCode.FILE_NOT_FOUND);
    });

    it('should create ParseError', () => {
      const error = new ParseError('parse failed');
      expect(error.name).toBe('ParseError');
      expect(error.code).toBe(ErrorCode.PARSE_ERROR);
    });

    it('should create DatabaseError', () => {
      const error = new DatabaseError('query failed');
      expect(error.name).toBe('DatabaseError');
      expect(error.code).toBe(ErrorCode.DATABASE_ERROR);
    });
  });

  describe('ErrorHandler', () => {
    it('should handle CodeAgentError', () => {
      const original = new CodeAgentError('test', ErrorCode.NOT_FOUND);
      const handled = ErrorHandler.handle(original);

      expect(handled).toBe(original);
    });

    it('should handle generic Error', () => {
      const original = new Error('test');
      const handled = ErrorHandler.handle(original);

      expect(handled).toBeInstanceOf(CodeAgentError);
      expect(handled.message).toBe('test');
      expect(handled.cause).toBe(original);
    });

    it('should handle unknown error', () => {
      const handled = ErrorHandler.handle('string error');

      expect(handled).toBeInstanceOf(CodeAgentError);
      expect(handled.message).toBe('string error');
    });

    it('should wrap error', () => {
      const original = new Error('original');
      const wrapped = ErrorHandler.wrap(original, 'wrapped message');

      expect(wrapped.message).toBe('wrapped message');
      expect(wrapped.cause).toBe(original);
    });

    it('should check error code', () => {
      const error = new CodeAgentError('test', ErrorCode.NOT_FOUND);

      expect(ErrorHandler.isErrorCode(error, ErrorCode.NOT_FOUND)).toBe(true);
      expect(ErrorHandler.isErrorCode(error, ErrorCode.PARSE_ERROR)).toBe(false);
    });
  });

  describe('Error factories', () => {
    it('should create file not found error', () => {
      const error = createFileNotFoundError('/path/to/file.ts');

      expect(error.code).toBe(ErrorCode.FILE_NOT_FOUND);
      expect(error.message).toContain('/path/to/file.ts');
      expect(error.suggestions.length).toBeGreaterThan(0);
    });

    it('should create missing config error', () => {
      const error = createMissingConfigError('API_KEY', '.env');

      expect(error.code).toBe(ErrorCode.MISSING_CONFIG);
      expect(error.message).toContain('API_KEY');
      expect(error.suggestions.length).toBeGreaterThan(0);
    });
  });
});
