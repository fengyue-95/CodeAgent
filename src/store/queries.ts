import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  CodeEdge,
  CodeNode,
  EdgeKind,
  FileRecord,
  IndexStats,
  NodeKind,
  UnresolvedRef,
  UnresolvedKindStat,
  UnresolvedNameStat,
} from '../types';

export interface GraphStore {
  close(): void;
  init(): void;

  upsertFile(file: FileRecord): void;
  getFile(path: string): FileRecord | null;
  getAllFiles(): FileRecord[];
  deleteFile(path: string): void;

  insertNodes(nodes: CodeNode[]): void;
  getNodeById(id: string): CodeNode | null;
  getNodesByFile(filePath: string): CodeNode[];
  getNodesByName(name: string): CodeNode[];
  getNodesByQualifiedName(qualifiedName: string): CodeNode[];
  searchNodes(query: string, limit?: number): CodeNode[];
  getNodesByKind(kind: NodeKind): CodeNode[];
  deleteNodesByFile(filePath: string): void;
  deleteOrphanExternalNodes(): void;

  insertEdges(edges: CodeEdge[]): void;
  getOutgoingEdges(nodeId: string, kinds?: EdgeKind[]): CodeEdge[];
  getIncomingEdges(nodeId: string, kinds?: EdgeKind[]): CodeEdge[];
  deleteEdgesByFile(filePath: string): void;
  deleteEdgesByKinds(kinds: EdgeKind[]): void;

  insertUnresolvedRefs(refs: UnresolvedRef[]): void;
  getAllUnresolvedRefs(): UnresolvedRef[];
  getUnresolvedRefsByFile(filePath: string): UnresolvedRef[];
  getUnresolvedRefsByName(name: string): UnresolvedRef[];
  getUnresolvedStatsByKind(): UnresolvedKindStat[];
  getTopUnresolvedRefs(limit?: number): UnresolvedNameStat[];
  deleteUnresolvedRefsByIds(ids: number[]): void;
  deleteUnresolvedRefsByFile(filePath: string): void;

  replaceFileGraph(input: {
    file: FileRecord;
    nodes: CodeNode[];
    edges: CodeEdge[];
    unresolvedRefs: UnresolvedRef[];
  }): void;

  getStats(): IndexStats;
}

function parseJson<T>(value: string | null): T | undefined {
  if (!value) {
    return undefined;
  }

  return JSON.parse(value) as T;
}

function toJson(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  return JSON.stringify(value);
}

function rowToFileRecord(row: any): FileRecord {
  return {
    path: row.path,
    language: row.language,
    contentHash: row.content_hash,
    size: row.size,
    modifiedAt: row.modified_at,
    indexedAt: row.indexed_at,
    metadata: parseJson(row.metadata),
  };
}

function rowToCodeNode(row: any): CodeNode {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    qualifiedName: row.qualified_name ?? undefined,
    filePath: row.file_path,
    language: row.language,
    startLine: row.start_line,
    endLine: row.end_line,
    startColumn: row.start_column,
    endColumn: row.end_column,
    signature: row.signature ?? undefined,
    docstring: row.docstring ?? undefined,
    isExported: row.is_exported === 1,
    metadata: parseJson(row.metadata),
  };
}

function rowToCodeEdge(row: any): CodeEdge {
  return {
    id: row.id,
    source: row.source,
    target: row.target,
    kind: row.kind,
    line: row.line ?? undefined,
    column: row.column ?? undefined,
    metadata: parseJson(row.metadata),
  };
}

function rowToUnresolvedRef(row: any): UnresolvedRef {
  return {
    id: row.id,
    fromNodeId: row.from_node_id,
    refName: row.ref_name,
    refKind: row.ref_kind,
    filePath: row.file_path,
    language: row.language,
    line: row.line ?? undefined,
    column: row.column ?? undefined,
    candidates: parseJson(row.candidates),
    metadata: parseJson(row.metadata),
  };
}

export class SqliteGraphStore implements GraphStore {
  private readonly db: Database.Database;

  constructor(
    private readonly dbPath: string,
    private readonly schemaPath: string = SqliteGraphStore.resolveSchemaPath()
  ) {
    this.db = new Database(this.dbPath);
    this.db.pragma('foreign_keys = ON');
  }

  private static resolveSchemaPath(): string {
    const candidates = [
      path.join(__dirname, 'schema.sql'),
      path.join(process.cwd(), 'src', 'store', 'schema.sql'),
      path.join(process.cwd(), 'dist', 'store', 'schema.sql'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return candidates[0];
  }

  init(): void {
    const schema = fs.readFileSync(this.schemaPath, 'utf8');
    this.db.exec(schema);
  }

  close(): void {
    this.db.close();
  }

  upsertFile(file: FileRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO files (
        path, language, content_hash, size, modified_at, indexed_at, metadata
      ) VALUES (
        @path, @language, @contentHash, @size, @modifiedAt, @indexedAt, @metadata
      )
      ON CONFLICT(path) DO UPDATE SET
        language = excluded.language,
        content_hash = excluded.content_hash,
        size = excluded.size,
        modified_at = excluded.modified_at,
        indexed_at = excluded.indexed_at,
        metadata = excluded.metadata
    `);

    stmt.run({
      ...file,
      metadata: toJson(file.metadata),
    });
  }

  getFile(filePath: string): FileRecord | null {
    const row = this.db.prepare('SELECT * FROM files WHERE path = ?').get(filePath);
    return row ? rowToFileRecord(row) : null;
  }

  getAllFiles(): FileRecord[] {
    const rows = this.db.prepare('SELECT * FROM files ORDER BY path').all();
    return rows.map(rowToFileRecord);
  }

  deleteFile(filePath: string): void {
    this.db.prepare('DELETE FROM files WHERE path = ?').run(filePath);
  }

  insertNodes(nodes: CodeNode[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO nodes (
        id, kind, name, qualified_name, file_path, language,
        start_line, end_line, start_column, end_column,
        signature, docstring, is_exported, metadata
      ) VALUES (
        @id, @kind, @name, @qualifiedName, @filePath, @language,
        @startLine, @endLine, @startColumn, @endColumn,
        @signature, @docstring, @isExported, @metadata
      )
    `);

    const tx = this.db.transaction((items: CodeNode[]) => {
      for (const node of items) {
        stmt.run({
          ...node,
          qualifiedName: node.qualifiedName ?? null,
          signature: node.signature ?? null,
          docstring: node.docstring ?? null,
          isExported: node.isExported ? 1 : 0,
          metadata: toJson(node.metadata),
        });
      }
    });

    tx(nodes);
  }

  getNodeById(id: string): CodeNode | null {
    const row = this.db.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
    return row ? rowToCodeNode(row) : null;
  }

  getNodesByFile(filePath: string): CodeNode[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM nodes
        WHERE file_path = ?
        ORDER BY start_line, start_column
      `)
      .all(filePath);

    return rows.map(rowToCodeNode);
  }

  getNodesByName(name: string): CodeNode[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM nodes
        WHERE name = ?
        ORDER BY file_path, start_line, start_column
      `)
      .all(name);

    return rows.map(rowToCodeNode);
  }

  getNodesByQualifiedName(qualifiedName: string): CodeNode[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM nodes
        WHERE qualified_name = ?
        ORDER BY file_path, start_line, start_column
      `)
      .all(qualifiedName);

    return rows.map(rowToCodeNode);
  }

  searchNodes(query: string, limit = 20): CodeNode[] {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    const likeQuery = `%${normalizedQuery.toLowerCase()}%`;
    const rows = this.db
      .prepare(`
        SELECT * FROM nodes
        WHERE lower(name) LIKE ?
           OR lower(qualified_name) LIKE ?
           OR lower(signature) LIKE ?
        ORDER BY
          CASE
            WHEN name = ? THEN 0
            WHEN qualified_name = ? THEN 1
            WHEN lower(name) = lower(?) THEN 2
            WHEN lower(qualified_name) = lower(?) THEN 3
            WHEN lower(name) LIKE lower(?) THEN 4
            ELSE 5
          END,
          file_path,
          start_line,
          start_column
        LIMIT ?
      `)
      .all(
        likeQuery,
        likeQuery,
        likeQuery,
        normalizedQuery,
        normalizedQuery,
        normalizedQuery,
        normalizedQuery,
        `${normalizedQuery}%`,
        limit
      );

    return rows.map(rowToCodeNode);
  }

  getNodesByKind(kind: NodeKind): CodeNode[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM nodes
        WHERE kind = ?
        ORDER BY file_path, start_line, start_column
      `)
      .all(kind);

    return rows.map(rowToCodeNode);
  }

  deleteNodesByFile(filePath: string): void {
    this.db.prepare('DELETE FROM nodes WHERE file_path = ?').run(filePath);
  }

  deleteOrphanExternalNodes(): void {
    this.db.prepare(`
      DELETE FROM nodes
      WHERE (file_path = '<external>' OR json_extract(metadata, '$.external') = 1)
        AND NOT EXISTS (
          SELECT 1 FROM edges
          WHERE edges.source = nodes.id
             OR edges.target = nodes.id
        )
    `).run();
  }

  insertEdges(edges: CodeEdge[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO edges (
        source, target, kind, line, column, metadata
      ) VALUES (
        @source, @target, @kind, @line, @column, @metadata
      )
    `);

    const tx = this.db.transaction((items: CodeEdge[]) => {
      for (const edge of items) {
        stmt.run({
          ...edge,
          line: edge.line ?? null,
          column: edge.column ?? null,
          metadata: toJson(edge.metadata),
        });
      }
    });

    tx(edges);
  }

  getOutgoingEdges(nodeId: string, kinds?: EdgeKind[]): CodeEdge[] {
    let sql = 'SELECT * FROM edges WHERE source = ?';
    const params: unknown[] = [nodeId];

    if (kinds && kinds.length > 0) {
      sql += ` AND kind IN (${kinds.map(() => '?').join(', ')})`;
      params.push(...kinds);
    }

    const rows = this.db.prepare(sql).all(...params);
    return rows.map(rowToCodeEdge);
  }

  getIncomingEdges(nodeId: string, kinds?: EdgeKind[]): CodeEdge[] {
    let sql = 'SELECT * FROM edges WHERE target = ?';
    const params: unknown[] = [nodeId];

    if (kinds && kinds.length > 0) {
      sql += ` AND kind IN (${kinds.map(() => '?').join(', ')})`;
      params.push(...kinds);
    }

    const rows = this.db.prepare(sql).all(...params);
    return rows.map(rowToCodeEdge);
  }

  deleteEdgesByFile(filePath: string): void {
    this.db.prepare(`
      DELETE FROM edges
      WHERE source IN (SELECT id FROM nodes WHERE file_path = ?)
         OR target IN (SELECT id FROM nodes WHERE file_path = ?)
    `).run(filePath, filePath);
  }

  deleteEdgesByKinds(kinds: EdgeKind[]): void {
    if (kinds.length === 0) {
      return;
    }

    const placeholders = kinds.map(() => '?').join(', ');
    this.db.prepare(`DELETE FROM edges WHERE kind IN (${placeholders})`).run(...kinds);
  }

  insertUnresolvedRefs(refs: UnresolvedRef[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO unresolved_refs (
        from_node_id, ref_name, ref_kind, file_path, language,
        line, column, candidates, metadata
      ) VALUES (
        @fromNodeId, @refName, @refKind, @filePath, @language,
        @line, @column, @candidates, @metadata
      )
    `);

    const tx = this.db.transaction((items: UnresolvedRef[]) => {
      for (const ref of items) {
        stmt.run({
          ...ref,
          line: ref.line ?? null,
          column: ref.column ?? null,
          candidates: toJson(ref.candidates),
          metadata: toJson(ref.metadata),
        });
      }
    });

    tx(refs);
  }

  getAllUnresolvedRefs(): UnresolvedRef[] {
    const rows = this.db
      .prepare('SELECT * FROM unresolved_refs ORDER BY file_path, line, column')
      .all();

    return rows.map(rowToUnresolvedRef);
  }

  getUnresolvedRefsByFile(filePath: string): UnresolvedRef[] {
    const rows = this.db
      .prepare('SELECT * FROM unresolved_refs WHERE file_path = ?')
      .all(filePath);

    return rows.map(rowToUnresolvedRef);
  }

  getUnresolvedRefsByName(name: string): UnresolvedRef[] {
    const rows = this.db
      .prepare('SELECT * FROM unresolved_refs WHERE ref_name = ?')
      .all(name);

    return rows.map(rowToUnresolvedRef);
  }

  getUnresolvedStatsByKind(): UnresolvedKindStat[] {
    const rows = this.db
      .prepare(`
        SELECT ref_kind AS refKind, COUNT(*) AS count
        FROM unresolved_refs
        GROUP BY ref_kind
        ORDER BY count DESC, ref_kind
      `)
      .all() as UnresolvedKindStat[];

    return rows;
  }

  getTopUnresolvedRefs(limit = 20): UnresolvedNameStat[] {
    const rows = this.db
      .prepare(`
        SELECT ref_name AS refName, ref_kind AS refKind, COUNT(*) AS count
        FROM unresolved_refs
        GROUP BY ref_name, ref_kind
        ORDER BY count DESC, ref_name, ref_kind
        LIMIT ?
      `)
      .all(limit) as UnresolvedNameStat[];

    return rows;
  }

  deleteUnresolvedRefsByIds(ids: number[]): void {
    if (ids.length === 0) {
      return;
    }

    const batchSize = 500;
    const tx = this.db.transaction((items: number[]) => {
      for (let index = 0; index < items.length; index += batchSize) {
        const batch = items.slice(index, index + batchSize);
        const placeholders = batch.map(() => '?').join(', ');
        this.db.prepare(`DELETE FROM unresolved_refs WHERE id IN (${placeholders})`).run(...batch);
      }
    });

    tx(ids);
  }

  deleteUnresolvedRefsByFile(filePath: string): void {
    this.db.prepare('DELETE FROM unresolved_refs WHERE file_path = ?').run(filePath);
  }

  replaceFileGraph(input: {
    file: FileRecord;
    nodes: CodeNode[];
    edges: CodeEdge[];
    unresolvedRefs: UnresolvedRef[];
  }): void {
    const tx = this.db.transaction(() => {
      this.upsertFile(input.file);
      this.deleteEdgesByFile(input.file.path);
      this.deleteUnresolvedRefsByFile(input.file.path);
      this.deleteNodesByFile(input.file.path);
      this.insertNodes(input.nodes);
      this.insertEdges(input.edges);
      this.insertUnresolvedRefs(input.unresolvedRefs);
    });

    tx();
  }

  getStats(): IndexStats {
    const fileRow = this.db.prepare('SELECT COUNT(*) AS count FROM files').get() as { count: number };
    const nodeRow = this.db.prepare('SELECT COUNT(*) AS count FROM nodes').get() as { count: number };
    const edgeRow = this.db.prepare('SELECT COUNT(*) AS count FROM edges').get() as { count: number };
    const unresolvedRow = this.db.prepare('SELECT COUNT(*) AS count FROM unresolved_refs').get() as { count: number };
    const lastRow = this.db.prepare('SELECT MAX(indexed_at) AS value FROM files').get() as { value: number | null };

    return {
      fileCount: fileRow.count,
      nodeCount: nodeRow.count,
      edgeCount: edgeRow.count,
      unresolvedRefCount: unresolvedRow.count,
      lastIndexedAt: lastRow.value ?? undefined,
    };
  }
}
