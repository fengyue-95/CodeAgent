/**
 * 数据库工具测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabase, cleanupTestDatabase } from '../helpers/mock-db';
import Database from 'better-sqlite3';

describe('Database Helpers', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase('db-helper-test');
  });

  afterEach(() => {
    cleanupTestDatabase(db);
  });

  it('should create a test database', () => {
    expect(db).toBeDefined();
  });

  it('should have schema tables', () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table'
      ORDER BY name
    `).all();

    const tableNames = tables.map((t: any) => t.name);

    expect(tableNames).toContain('files');
    expect(tableNames).toContain('nodes');
    expect(tableNames).toContain('edges');
    expect(tableNames).toContain('sessions');
  });

  it('should insert and query data', () => {
    db.prepare(`
      INSERT INTO files (path, language, content_hash, size, modified_at, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('test.ts', 'typescript', 'hash123', 100, Date.now(), Date.now());

    const result = db.prepare('SELECT * FROM files WHERE path = ?').get('test.ts');

    expect(result).toBeDefined();
    expect((result as any).language).toBe('typescript');
  });
});
