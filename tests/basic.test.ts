/**
 * 基础测试 - 验证测试框架工作正常
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Basic Tests', () => {
  it('should run a simple test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have access to Node.js APIs', () => {
    expect(fs).toBeDefined();
    expect(path).toBeDefined();
  });

  it('should verify project structure', () => {
    const srcExists = fs.existsSync(path.join(process.cwd(), 'src'));
    const testsExists = fs.existsSync(path.join(process.cwd(), 'tests'));

    expect(srcExists).toBe(true);
    expect(testsExists).toBe(true);
  });

  it('should verify source files exist', () => {
    const parserExists = fs.existsSync(path.join(process.cwd(), 'src/parser/index.ts'));
    const graphExists = fs.existsSync(path.join(process.cwd(), 'src/graph/index.ts'));

    expect(parserExists).toBe(true);
    expect(graphExists).toBe(true);
  });

  it('should verify test helpers exist', () => {
    const utilsExists = fs.existsSync(path.join(process.cwd(), 'tests/helpers/test-utils.ts'));
    const mockDbExists = fs.existsSync(path.join(process.cwd(), 'tests/helpers/mock-db.ts'));

    expect(utilsExists).toBe(true);
    expect(mockDbExists).toBe(true);
  });
});
