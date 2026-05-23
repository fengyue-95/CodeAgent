export type Language =
  | 'java'
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'unknown';

export type NodeKind =
  | 'file'
  | 'module'
  | 'class'
  | 'interface'
  | 'enum'
  | 'function'
  | 'method'
  | 'constructor'
  | 'variable'
  | 'constant'
  | 'field';

export type EdgeKind =
  | 'contains'
  | 'imports'
  | 'exports'
  | 'calls'
  | 'references'
  | 'extends'
  | 'implements'
  | 'type_of'
  | 'returns';

export interface FileRecord {
  path: string;
  language: Language;
  contentHash: string;
  size: number;
  modifiedAt: number;
  indexedAt: number;
  metadata?: Record<string, unknown>;
}

export interface CodeNode {
  id: string;
  kind: NodeKind;
  name: string;
  qualifiedName?: string;
  filePath: string;
  language: Language;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  signature?: string;
  docstring?: string;
  isExported?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CodeEdge {
  id?: number;
  source: string;
  target: string;
  kind: EdgeKind;
  line?: number;
  column?: number;
  metadata?: Record<string, unknown>;
}

export interface UnresolvedRef {
  id?: number;
  fromNodeId: string;
  refName: string;
  refKind: 'call' | 'type' | 'value' | 'import' | 'inheritance';
  filePath: string;
  language: Language;
  line?: number;
  column?: number;
  candidates?: string[];
  metadata?: Record<string, unknown>;
}

export interface ParseResult {
  file: FileRecord;
  nodes: CodeNode[];
  edges: CodeEdge[];
  unresolvedRefs: UnresolvedRef[];
}

export interface SearchResult {
  node: CodeNode;
  score: number;
}

export interface ContextResult {
  query: string;
  entryPoints: CodeNode[];
  relatedNodes: CodeNode[];
  relatedFiles: string[];
}

export interface IndexStats {
  fileCount: number;
  nodeCount: number;
  edgeCount: number;
  unresolvedRefCount: number;
  lastIndexedAt?: number;
}
