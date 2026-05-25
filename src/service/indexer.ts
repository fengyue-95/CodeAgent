import fs from 'node:fs/promises';
import path from 'node:path';
import { LanguageParser } from '../parser';
import { ProjectScanner } from '../scanner';
import { GraphStore } from '../store/queries';
import { detectLanguage } from '../utils/language';
import { ReferenceResolver } from '../resolver';
import { CodeEdge, CodeNode } from '../types';

export interface IndexService {
  indexAll(root: string): Promise<void>;
  sync(root: string): Promise<SyncResult>;
}

export interface SyncResult {
  added: number;
  modified: number;
  deleted: number;
  changedFiles: number;
  files: {
    added: string[];
    modified: string[];
    deleted: string[];
  };
  diff?: SyncDiff;
}

export interface SyncDiff {
  nodes: {
    added: CodeNode[];
    removed: CodeNode[];
    updated: NodeUpdate[];
  };
  edges: {
    added: CodeEdge[];
    removed: CodeEdge[];
  };
}

export interface NodeUpdate {
  before: CodeNode;
  after: CodeNode;
  fields: string[];
}

interface GraphSnapshot {
  nodes: CodeNode[];
  edges: CodeEdge[];
}

export class CodeIndexService implements IndexService {
  constructor(
    private readonly scanner: ProjectScanner,
    private readonly parsers: LanguageParser[],
    private readonly resolver: ReferenceResolver,
    private readonly store: GraphStore
  ) {}

  async indexAll(root: string): Promise<void> {
    const files = await this.scanner.scanAll(root);
    await this.indexFiles(root, files);
  }

  async sync(root: string, options: { diff?: boolean } = {}): Promise<SyncResult> {
    const changes = await this.scanner.scanChanged(root);
    const changedFiles = Array.from(new Set([...changes.added, ...changes.modified]));
    const diffFiles = Array.from(new Set([...changedFiles, ...changes.deleted]));
    const before = options.diff ? this.snapshotFiles(diffFiles) : null;

    for (const deletedFile of changes.deleted) {
      this.store.deleteEdgesByFile(deletedFile);
      this.store.deleteUnresolvedRefsByFile(deletedFile);
      this.store.deleteNodesByFile(deletedFile);
      this.store.deleteFile(deletedFile);
    }

    await this.indexFiles(root, changedFiles);
    const after = options.diff ? this.snapshotFiles(diffFiles) : null;

    return {
      added: changes.added.length,
      modified: changes.modified.length,
      deleted: changes.deleted.length,
      changedFiles: changedFiles.length + changes.deleted.length,
      files: {
        added: changes.added,
        modified: changes.modified,
        deleted: changes.deleted,
      },
      diff: before && after ? diffSnapshots(before, after) : undefined,
    };
  }

  private snapshotFiles(files: string[]): GraphSnapshot {
    const nodes: CodeNode[] = [];
    const edges: CodeEdge[] = [];

    for (const file of files) {
      const fileNodes = this.store.getNodesByFile(file);
      nodes.push(...fileNodes);
      const nodeIds = new Set(fileNodes.map((node) => node.id));
      for (const node of fileNodes) {
        edges.push(...this.store.getOutgoingEdges(node.id).filter((edge) =>
          nodeIds.has(edge.source) || nodeIds.has(edge.target)
        ));
        edges.push(...this.store.getIncomingEdges(node.id).filter((edge) =>
          nodeIds.has(edge.source) || nodeIds.has(edge.target)
        ));
      }
    }

    return {
      nodes: uniqueNodes(nodes),
      edges: uniqueEdges(edges),
    };
  }

  private async indexFiles(root: string, files: string[]): Promise<void> {
    for (const relativePath of files) {
      const absolutePath = path.join(root, relativePath);
      const language = detectLanguage(relativePath);
      const parser = this.parsers.find((candidate) => candidate.supports(language));
      if (!parser) {
        continue;
      }

      const content = await fs.readFile(absolutePath, 'utf8');
      const parseResult = await parser.parse(relativePath, content);
      this.store.replaceFileGraph(parseResult);
    }

    await this.rebuildResolvedEdges();
  }

  private async rebuildResolvedEdges(): Promise<void> {
    const unresolvedRefs = this.store.getAllUnresolvedRefs();
    const result = this.resolver.resolveDetailed
      ? await this.resolver.resolveDetailed(unresolvedRefs)
      : {
        edges: await this.resolver.resolve(unresolvedRefs),
        resolvedRefs: [],
        nodes: [],
      };

    this.store.insertNodes(result.nodes ?? []);
    this.store.insertEdges(result.edges);
    this.store.deleteUnresolvedRefsByIds(
      result.resolvedRefs
        .map((ref) => ref.id)
        .filter((id): id is number => typeof id === 'number')
    );
    this.store.deleteOrphanExternalNodes();
  }
}

function diffSnapshots(before: GraphSnapshot, after: GraphSnapshot): SyncDiff {
  const beforeNodeIds = new Set(before.nodes.map((node) => node.id));
  const afterNodeIds = new Set(after.nodes.map((node) => node.id));
  const beforeNodesById = new Map(before.nodes.map((node) => [node.id, node]));
  const beforeEdgeKeys = new Set(before.edges.map(edgeKey));
  const afterEdgeKeys = new Set(after.edges.map(edgeKey));

  return {
    nodes: {
      added: after.nodes.filter((node) => !beforeNodeIds.has(node.id)),
      removed: before.nodes.filter((node) => !afterNodeIds.has(node.id)),
      updated: after.nodes
        .filter((node) => beforeNodeIds.has(node.id))
        .map((node) => {
          const beforeNode = beforeNodesById.get(node.id)!;
          return {
            before: beforeNode,
            after: node,
            fields: changedNodeFields(beforeNode, node),
          };
        })
        .filter((update) => update.fields.length > 0),
    },
    edges: {
      added: after.edges.filter((edge) => !beforeEdgeKeys.has(edgeKey(edge))),
      removed: before.edges.filter((edge) => !afterEdgeKeys.has(edgeKey(edge))),
    },
  };
}

function changedNodeFields(before: CodeNode, after: CodeNode): string[] {
  const fields: Array<keyof CodeNode> = [
    'kind',
    'name',
    'qualifiedName',
    'filePath',
    'language',
    'startLine',
    'endLine',
    'startColumn',
    'endColumn',
    'signature',
    'docstring',
    'isExported',
    'metadata',
  ];

  return fields.filter((field) => stableJson(before[field]) !== stableJson(after[field]));
}

function uniqueNodes(nodes: CodeNode[]): CodeNode[] {
  const seen = new Set<string>();
  const results: CodeNode[] = [];

  for (const node of nodes) {
    if (seen.has(node.id)) {
      continue;
    }

    seen.add(node.id);
    results.push(node);
  }

  return results;
}

function uniqueEdges(edges: CodeEdge[]): CodeEdge[] {
  const seen = new Set<string>();
  const results: CodeEdge[] = [];

  for (const edge of edges) {
    const key = edgeKey(edge);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push(edge);
  }

  return results;
}

function edgeKey(edge: CodeEdge): string {
  return [
    edge.source,
    edge.target,
    edge.kind,
    edge.line ?? '',
    edge.column ?? '',
    stableJson(edge.metadata),
  ].join('|');
}

function stableJson(value: unknown): string {
  if (value == null) {
    return '';
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }

  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
  }

  return JSON.stringify(value);
}
