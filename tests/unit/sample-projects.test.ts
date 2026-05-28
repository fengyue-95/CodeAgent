/**
 * 示例项目测试
 */

import { describe, it, expect } from 'vitest';
import {
  SIMPLE_TYPESCRIPT_PROJECT,
  SIMPLE_PYTHON_PROJECT,
  SIMPLE_JAVA_PROJECT,
  COMPLEX_PROJECT_WITH_DEPENDENCIES,
} from '../fixtures/sample-projects';

describe('Sample Projects', () => {
  describe('SIMPLE_TYPESCRIPT_PROJECT', () => {
    it('should have package.json', () => {
      expect(SIMPLE_TYPESCRIPT_PROJECT['package.json']).toBeDefined();
    });

    it('should have source files', () => {
      expect(SIMPLE_TYPESCRIPT_PROJECT['src/index.ts']).toBeDefined();
      expect(SIMPLE_TYPESCRIPT_PROJECT['src/utils/math.ts']).toBeDefined();
    });

    it('should have valid TypeScript code', () => {
      const indexCode = SIMPLE_TYPESCRIPT_PROJECT['src/index.ts'];
      expect(indexCode).toContain('function');
      expect(indexCode).toContain('export');
    });
  });

  describe('SIMPLE_PYTHON_PROJECT', () => {
    it('should have Python files', () => {
      expect(SIMPLE_PYTHON_PROJECT['main.py']).toBeDefined();
    });

    it('should have valid Python code', () => {
      const mainCode = SIMPLE_PYTHON_PROJECT['main.py'];
      expect(mainCode).toContain('def');
      expect(mainCode).toContain('class');
    });
  });

  describe('SIMPLE_JAVA_PROJECT', () => {
    it('should have Java files', () => {
      expect(SIMPLE_JAVA_PROJECT['src/main/java/com/example/Main.java']).toBeDefined();
    });

    it('should have valid Java code', () => {
      const mainCode = SIMPLE_JAVA_PROJECT['src/main/java/com/example/Main.java'];
      expect(mainCode).toContain('package');
      expect(mainCode).toContain('public class');
    });
  });

  describe('COMPLEX_PROJECT_WITH_DEPENDENCIES', () => {
    it('should have multiple files', () => {
      const files = Object.keys(COMPLEX_PROJECT_WITH_DEPENDENCIES);
      expect(files.length).toBeGreaterThan(3);
    });

    it('should have dependencies in package.json', () => {
      const packageJson = JSON.parse(COMPLEX_PROJECT_WITH_DEPENDENCIES['package.json']);
      expect(packageJson.dependencies).toBeDefined();
    });

    it('should have service files', () => {
      expect(COMPLEX_PROJECT_WITH_DEPENDENCIES['src/services/UserService.ts']).toBeDefined();
      expect(COMPLEX_PROJECT_WITH_DEPENDENCIES['src/services/AuthService.ts']).toBeDefined();
    });
  });
});
