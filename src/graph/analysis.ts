import { GraphStore } from '../store/queries';
import { CodeEdge, CodeNode, EdgeKind } from '../types';
import { GraphQueryService } from './index';

const DEPENDENCY_EDGE_KINDS: EdgeKind[] = [
  'imports',
  'calls',
  'references',
  'extends',
  'implements',
  'type_of',
  'returns',
];

const LIVE_INCOMING_EDGE_KINDS: EdgeKind[] = [
  'calls',
  'references',
  'extends',
  'implements',
];

export interface FileDependency {
  from: string;
  to: string;
  kinds: EdgeKind[];
  count: number;
}

export interface ImpactAnalysisResult {
  query: string;
  resolved: CodeNode[];
  nodes: CodeNode[];
  files: string[];
}

export interface DeadCodeCandidate {
  node: CodeNode;
  reason: string;
}

export interface ComplexityOptions {
  limit?: number;
}

export interface ComplexityMetric {
  node: CodeNode;
  lines: number;
  fanIn: number;
  fanOut: number;
  score: number;
}

export interface GraphMetrics {
  fileCount: number;
  nodeCount: number;
  edgeCount: number;
  dependencyCount: number;
  circularDependencyCount: number;
  deadCodeCandidateCount: number;
  averageFanIn: number;
  averageFanOut: number;
  maxFanIn: number;
  maxFanOut: number;
}

export class GraphAnalysisService {
  private readonly query: GraphQueryService;
  private nodesCache: CodeNode[] | undefined;

  constructor(private readonly store: GraphStore) {
    this.query = new GraphQueryService(store);
  }

  analyzeDependencies(): FileDependency[] {
    const dependencies = new Map<string, FileDependency>();

    for (const node of this.allProjectNodes()) {
      for (const edge of this.store.getOutgoingEdges(node.id, DEPENDENCY_EDGE_KINDS)) {
        const target = this.store.getNodeById(edge.target);
        if (!target || target.metadata?.external === true || target.filePath === node.filePath) {
          continue;
        }

        const key = `${node.filePath}\u0000${target.filePath}`;
        const existing = dependencies.get(key) ?? {
          from: node.filePath,
          to: target.filePath,
          kinds: [],
          count: 0,
        };
        existing.count += 1;
        if (!existing.kinds.includes(edge.kind)) {
          existing.kinds.push(edge.kind);
        }
        dependencies.set(key, existing);
      }
    }

    return Array.from(dependencies.values())
      .sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to));
  }

  findCircularDependencies(): string[][] {
    const graph = new Map<string, string[]>();
    for (const dependency of this.analyzeDependencies()) {
      const outgoing = graph.get(dependency.from) ?? [];
      outgoing.push(dependency.to);
      graph.set(dependency.from, outgoing);
      if (!graph.has(dependency.to)) {
        graph.set(dependency.to, []);
      }
    }

    return stronglyConnectedComponents(graph)
      .filter((component) => component.length > 1 || hasSelfLoop(graph, component[0]!))
      .map((component) => {
        const sorted = component.sort();
        return [...sorted, sorted[0]!];
      })
      .sort((left, right) => left.join('>').localeCompare(right.join('>')));
  }

  analyzeImpact(query: string): ImpactAnalysisResult {
    const resolved = this.query.resolveSymbol(query);
    const seen = new Set(resolved.map((node) => node.id));
    const impacted: CodeNode[] = [];
    const queue = [...resolved];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of this.store.getIncomingEdges(current.id, DEPENDENCY_EDGE_KINDS)) {
        const source = this.store.getNodeById(edge.source);
        if (!source || source.metadata?.external === true || seen.has(source.id)) {
          continue;
        }

        seen.add(source.id);
        impacted.push(source);
        queue.push(source);
      }
    }

    return {
      query,
      resolved,
      nodes: impacted,
      files: uniqueSorted(impacted.map((node) => node.filePath)),
    };
  }

  findDeadCode(): DeadCodeCandidate[] {
    return this.allProjectNodes()
      .filter((node) => isExecutableNode(node) && !node.isExported)
      .filter((node) => this.store.getIncomingEdges(node.id, LIVE_INCOMING_EDGE_KINDS).length === 0)
      .map((node) => ({
        node,
        reason: 'No incoming calls, references, inheritance, or implementation edges were found.',
      }))
      .sort((left, right) => left.node.filePath.localeCompare(right.node.filePath) || left.node.startLine - right.node.startLine);
  }

  analyzeComplexity(options: ComplexityOptions = {}): ComplexityMetric[] {
    const metrics = this.allProjectNodes()
      .filter(isExecutableNode)
      .map((node) => {
        const fanIn = this.store.getIncomingEdges(node.id, DEPENDENCY_EDGE_KINDS).length;
        const fanOut = this.store.getOutgoingEdges(node.id, DEPENDENCY_EDGE_KINDS).length;
        const lines = Math.max(1, node.endLine - node.startLine + 1);

        return {
          node,
          lines,
          fanIn,
          fanOut,
          score: lines + fanIn * 2 + fanOut * 2,
        };
      })
      .sort((left, right) => right.score - left.score || left.node.filePath.localeCompare(right.node.filePath));

    return metrics.slice(0, options.limit ?? 20);
  }

  calculateMetrics(): GraphMetrics {
    const nodes = this.allProjectNodes();
    const fanIn = nodes.map((node) => this.store.getIncomingEdges(node.id, DEPENDENCY_EDGE_KINDS).length);
    const fanOut = nodes.map((node) => this.store.getOutgoingEdges(node.id, DEPENDENCY_EDGE_KINDS).length);
    const edgeCount = fanOut.reduce((sum, value) => sum + value, 0);

    return {
      fileCount: this.store.getAllFiles().length,
      nodeCount: nodes.length,
      edgeCount,
      dependencyCount: this.analyzeDependencies().length,
      circularDependencyCount: this.findCircularDependencies().length,
      deadCodeCandidateCount: this.findDeadCode().length,
      averageFanIn: average(fanIn),
      averageFanOut: average(fanOut),
      maxFanIn: Math.max(0, ...fanIn),
      maxFanOut: Math.max(0, ...fanOut),
    };
  }

  renderArchitectureMermaid(limit = 80): string {
    const dependencies = this.analyzeDependencies().slice(0, limit);
    const lines = ['graph TD'];
    if (dependencies.length === 0) {
      lines.push('  empty["No cross-file dependencies indexed"]');
      return lines.join('\n');
    }

    const labels = new Map<string, string>();
    const nodeId = (filePath: string): string => {
      const existing = labels.get(filePath);
      if (existing) {
        return existing;
      }

      const id = `n${labels.size + 1}`;
      labels.set(filePath, id);
      lines.push(`  ${id}["${escapeMermaidLabel(filePath)}"]`);
      return id;
    };

    for (const dependency of dependencies) {
      lines.push(`  ${nodeId(dependency.from)} -->|${dependency.kinds.join(',')} ${dependency.count}| ${nodeId(dependency.to)}`);
    }

    return lines.join('\n');
  }

  private allProjectNodes(): CodeNode[] {
    this.nodesCache ??= this.store.getAllFiles()
      .flatMap((file) => this.store.getNodesByFile(file.path))
      .filter((node) => node.metadata?.external !== true);
    return this.nodesCache;
  }
}

function isExecutableNode(node: CodeNode): boolean {
  return ['class', 'interface', 'enum', 'function', 'method', 'constructor'].includes(node.kind);
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/\\/g, '/').replace(/"/g, '\\"');
}

function hasSelfLoop(graph: Map<string, string[]>, node: string): boolean {
  return (graph.get(node) ?? []).includes(node);
}

function stronglyConnectedComponents(graph: Map<string, string[]>): string[][] {
  const indexByNode = new Map<string, number>();
  const lowLinkByNode = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let nextIndex = 0;

  const visit = (node: string): void => {
    indexByNode.set(node, nextIndex);
    lowLinkByNode.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);

    for (const target of graph.get(node) ?? []) {
      if (!indexByNode.has(target)) {
        visit(target);
        lowLinkByNode.set(node, Math.min(lowLinkByNode.get(node)!, lowLinkByNode.get(target)!));
      } else if (onStack.has(target)) {
        lowLinkByNode.set(node, Math.min(lowLinkByNode.get(node)!, indexByNode.get(target)!));
      }
    }

    if (lowLinkByNode.get(node) !== indexByNode.get(node)) {
      return;
    }

    const component: string[] = [];
    while (stack.length > 0) {
      const item = stack.pop()!;
      onStack.delete(item);
      component.push(item);
      if (item === node) {
        break;
      }
    }
    components.push(component);
  };

  for (const node of Array.from(graph.keys()).sort()) {
    if (!indexByNode.has(node)) {
      visit(node);
    }
  }

  return components;
}
