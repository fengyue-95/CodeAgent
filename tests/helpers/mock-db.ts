/**
 * 数据库 Mock 工具
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { createTempDir } from './test-utils';

/**
 * 创建测试数据库
 */
export function createTestDatabase(name: string = 'test'): Database.Database {
  const dbDir = createTempDir(`db-${name}`);
  const dbPath = path.join(dbDir, 'test.db');

  const db = new Database(dbPath);

  // 加载 schema
  const schemaPath = path.join(__dirname, '../../src/store/schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    try {
      db.exec(schema);
    } catch (error) {
      console.error('Failed to execute schema:', error);
      throw error;
    }
  }

  return db;
}

/**
 * 清理测试数据库
 */
export function cleanupTestDatabase(db: Database.Database): void {
  try {
    db.close();
  } catch (error) {
    // Ignore errors during cleanup
  }
}

/**
 * 插入测试数据
 */
export function insertTestData(db: Database.Database, table: string, data: any[]): void {
  if (data.length === 0) return;

  const columns = Object.keys(data[0]);
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

  const stmt = db.prepare(sql);

  for (const row of data) {
    const values = columns.map(col => row[col]);
    stmt.run(...values);
  }
}
