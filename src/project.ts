import fs from 'node:fs';
import path from 'node:path';
import { SqliteGraphStore } from './store/queries';

export interface ProjectPaths {
  root: string;
  stateDir: string;
  dbPath: string;
}

export function resolveProjectPaths(projectArg?: string): ProjectPaths {
  const root = path.resolve(projectArg ?? process.cwd());
  const stateDir = path.join(root, '.code-agent');
  const dbPath = path.join(stateDir, 'index.db');
  return { root, stateDir, dbPath };
}

export function ensureStateDir(stateDir: string): void {
  fs.mkdirSync(stateDir, { recursive: true });
}

export function createStore(dbPath: string): SqliteGraphStore {
  const store = new SqliteGraphStore(dbPath);
  store.init();
  return store;
}
