import { JavaParser, PythonParser, ScriptParser } from '../parser';
import { createStore } from '../project';
import { SimpleResolver } from '../resolver';
import { FileSystemScanner } from '../scanner';
import { SqliteGraphStore } from '../store/queries';
import { CodeIndexService } from './indexer';

export function createDefaultIndexService(dbPath: string): {
  store: SqliteGraphStore;
  service: CodeIndexService;
} {
  const store = createStore(dbPath);
  const scanner = new FileSystemScanner();
  const resolver = new SimpleResolver(store);
  const service = new CodeIndexService(
    scanner,
    [
      new JavaParser(),
      new ScriptParser('javascript'),
      new ScriptParser('typescript'),
      new PythonParser(),
    ],
    resolver,
    store
  );

  return { store, service };
}
