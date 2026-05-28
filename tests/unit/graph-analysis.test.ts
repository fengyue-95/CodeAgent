import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GraphAnalysisService } from '../../src/graph/analysis';
import { SqliteGraphStore } from '../../src/store/queries';
import { CodeEdge, CodeNode, FileRecord } from '../../src/types';
import { createTempDir, cleanupTempDir } from '../helpers/test-utils';

function file(pathName: string): FileRecord {
  return {
    path: pathName,
    language: 'typescript',
    contentHash: pathName,
    size: 100,
    modifiedAt: 1,
    indexedAt: 1,
  };
}

function node(id: string, filePath: string, name: string, kind: CodeNode['kind'] = 'function'): CodeNode {
  return {
    id,
    kind,
    name,
    qualifiedName: name,
    filePath,
    language: 'typescript',
    startLine: 1,
    endLine: kind === 'function' ? 20 : 80,
    startColumn: 0,
    endColumn: 1,
    isExported: false,
  };
}

function edge(source: string, target: string, kind: CodeEdge['kind']): CodeEdge {
  return { source, target, kind };
}

function createStore(): { store: SqliteGraphStore; dir: string } {
  const dir = createTempDir('graph-analysis');
  const store = new SqliteGraphStore(path.join(dir, 'graph.db'));
  store.init();

  for (const item of ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/dead.ts'].map(file)) {
    store.upsertFile(item);
  }

  store.insertNodes([
    node('a', 'src/a.ts', 'A', 'class'),
    node('b', 'src/b.ts', 'B', 'class'),
    node('c', 'src/c.ts', 'C', 'class'),
    node('dead', 'src/dead.ts', 'deadFunction'),
  ]);
  store.insertEdges([
    edge('a', 'b', 'imports'),
    edge('b', 'a', 'imports'),
    edge('c', 'b', 'calls'),
  ]);

  return { store, dir };
}

describe('GraphAnalysisService', () => {
  it('detects file-level dependency cycles', () => {
    const { store, dir } = createStore();
    try {
      const cycles = new GraphAnalysisService(store).findCircularDependencies();
      expect(cycles).toEqual([
        ['src/a.ts', 'src/b.ts', 'src/a.ts'],
      ]);
    } finally {
      store.close();
      cleanupTempDir(dir);
    }
  });

  it('reports impact, dead code, complexity, metrics, and architecture diagrams', () => {
    const { store, dir } = createStore();
    try {
      const analysis = new GraphAnalysisService(store);

      expect(analysis.analyzeImpact('B').files).toContain('src/c.ts');
      expect(analysis.findDeadCode().map((item) => item.node.id)).toContain('dead');
      expect(analysis.analyzeComplexity({ limit: 1 })[0]?.node.id).toBe('b');
      expect(analysis.calculateMetrics().fileCount).toBe(4);
      expect(analysis.renderArchitectureMermaid()).toContain('graph TD');
    } finally {
      store.close();
      cleanupTempDir(dir);
    }
  });
});
