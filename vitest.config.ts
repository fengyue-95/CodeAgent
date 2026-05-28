import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // 测试环境
    environment: 'node',

    // 全局测试设置
    globals: true,

    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/**',
        'tests/**',
        'scripts/**',
      ],
      // 覆盖率阈值
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },

    // 测试文件匹配模式
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.spec.ts',
    ],

    // 排除的文件
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache',
    ],

    // 测试超时时间（毫秒）
    testTimeout: 10000,

    // 钩子超时时间
    hookTimeout: 10000,

    // 设置文件（在每个测试文件之前运行）
    setupFiles: ['./tests/setup.ts'],

    // 并发运行测试
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },

    // 监听模式排除
    watchExclude: [
      'node_modules',
      'dist',
      '.code-agent',
    ],
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
});
