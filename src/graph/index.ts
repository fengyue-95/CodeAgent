import { CodeEdge, CodeNode, EdgeKind, SearchResult } from '../types';
import { GraphStore } from '../store/queries';

export interface RelatedNode {
  node: CodeNode;
  edge: CodeEdge;
}

export interface GraphContextResult {
  query: string;
  entryPoints: SearchResult[];
  references: RelatedNode[];
  callers: RelatedNode[];
  callees: RelatedNode[];
  relatedFiles: string[];
}

export class GraphQueryService {
  private static readonly referenceEdgeKinds: EdgeKind[] = [
    'calls',
    'imports',
    'references',
    'extends',
    'implements',
    'type_of',
    'returns',
  ];

  constructor(private readonly store: GraphStore) {}

  searchSymbol(query: string, limit = 20): SearchResult[] {
    return this.store.searchNodes(query, limit).map((node) => ({
      node,
      score: this.scoreNode(query, node),
    }));
  }

  resolveSymbol(query: string): CodeNode[] {
    const byId = this.store.getNodeById(query);
    if (byId) {
      return [byId];
    }

    const byQualifiedName = this.store.getNodesByQualifiedName(query);
    if (byQualifiedName.length > 0) {
      return byQualifiedName;
    }

    const byName = this.store.getNodesByName(query);
    if (byName.length > 0) {
      return byName;
    }

    return this.store.searchNodes(query, 10);
  }

  findCallers(query: string): RelatedNode[] {
    const targets = this.resolveSymbol(query);
    return this.findIncomingRelatedNodes(targets, ['calls']);
  }

  findCallees(query: string): RelatedNode[] {
    const sources = this.resolveSymbol(query);
    return this.findOutgoingRelatedNodes(sources, ['calls']);
  }

  findReferences(query: string): RelatedNode[] {
    const targets = this.resolveSymbol(query);
    return this.findIncomingRelatedNodes(targets, GraphQueryService.referenceEdgeKinds);
  }

  buildContext(query: string): GraphContextResult {
    const entryPoints = this.searchSymbol(query, 5);
    const references = this.findReferences(query);
    const callers = this.findCallers(query);
    const callees = this.findCallees(query);
    const relatedFiles = this.collectRelatedFiles([
      ...entryPoints.map((result) => result.node),
      ...references.map((result) => result.node),
      ...callers.map((result) => result.node),
      ...callees.map((result) => result.node),
    ]);

    return {
      query,
      entryPoints,
      references,
      callers,
      callees,
      relatedFiles,
    };
  }

  private collectRelatedFiles(nodes: CodeNode[]): string[] {
    return Array.from(new Set(
      nodes
        .filter((node) => node.metadata?.external !== true)
        .map((node) => node.filePath)
    )).sort();
  }

  private findIncomingRelatedNodes(targets: CodeNode[], edgeKinds: EdgeKind[]): RelatedNode[] {
    const results: RelatedNode[] = [];
    const seen = new Set<string>();

    for (const target of targets) {
      const edges = this.store.getIncomingEdges(target.id, edgeKinds);
      for (const edge of edges) {
        const source = this.store.getNodeById(edge.source);
        if (!source) {
          continue;
        }

        const key = `${source.id}:${edge.kind}:${target.id}:${edge.line ?? ''}:${edge.column ?? ''}`;
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        results.push({ node: source, edge });
      }
    }

    return results;
  }

  private findOutgoingRelatedNodes(sources: CodeNode[], edgeKinds: EdgeKind[]): RelatedNode[] {
    const results: RelatedNode[] = [];
    const seen = new Set<string>();

    for (const source of sources) {
      const edges = this.store.getOutgoingEdges(source.id, edgeKinds);
      for (const edge of edges) {
        const target = this.store.getNodeById(edge.target);
        if (!target) {
          continue;
        }

        const key = `${source.id}:${edge.kind}:${target.id}:${edge.line ?? ''}:${edge.column ?? ''}`;
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        results.push({ node: target, edge });
      }
    }

    return results;
  }

  private scoreNode(query: string, node: CodeNode): number {
    const normalizedQuery = query.toLowerCase();
    const name = node.name.toLowerCase();
    const qualifiedName = node.qualifiedName?.toLowerCase() ?? '';

    if (node.name === query || node.qualifiedName === query) {
      return 1;
    }

    if (name === normalizedQuery || qualifiedName === normalizedQuery) {
      return 0.95;
    }

    if (name.startsWith(normalizedQuery)) {
      return 0.85;
    }

    if (qualifiedName.includes(normalizedQuery)) {
      return 0.75;
    }

    return 0.5;
  }
}
