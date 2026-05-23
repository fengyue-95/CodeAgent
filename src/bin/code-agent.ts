#!/usr/bin/env node

import { createStore, ensureStateDir, resolveProjectPaths } from '../project';
import { SqliteGraphStore } from '../store/queries';
import { FileSystemScanner } from '../scanner';
import { JavaParser } from '../parser';
import { SimpleResolver } from '../resolver';
import { CodeIndexService } from '../service/indexer';
import { CodeNode } from '../types';
import { GraphContextResult, GraphQueryService, RelatedNode } from '../graph';
import { startMcpServer } from '../mcp/server';

type Command =
  | 'index'
  | 'sync'
  | 'stats'
  | 'unresolved'
  | 'search'
  | 'node'
  | 'context'
  | 'serve'
  | 'callers'
  | 'callees'
  | 'refs'
  | 'references';

function usage(): string {
  return [
    'Usage: code-agent <command> [projectPath]',
    '',
    'Commands:',
    '  index   Build or rebuild the local code graph index',
    '  sync    Sync changed files into the local index',
    '  stats   Show local index statistics',
    '  unresolved Show unresolved reference summary',
    '  search  Search symbols by name',
    '  node    Show details for a symbol or node id',
    '  context Build a small graph context for a query',
    '  serve   Start the MCP stdio server',
    '  callers Find methods that call a symbol',
    '  callees Find symbols called by a method',
    '  refs    Find references to a symbol',
  ].join('\n');
}

async function createIndexService(dbPath: string): Promise<{
  store: SqliteGraphStore;
  service: CodeIndexService;
}> {
  const store = createStore(dbPath);
  const scanner = new FileSystemScanner();
  const resolver = new SimpleResolver(store);
  const service = new CodeIndexService(scanner, [new JavaParser()], resolver, store);
  return { store, service };
}

function formatTimestamp(value?: number): string {
  if (!value) {
    return 'n/a';
  }

  return new Date(value).toISOString();
}

function formatNode(node: CodeNode): string {
  const qualifiedName = node.qualifiedName ?? node.name;
  const signature = node.signature ? ` ${node.signature}` : '';
  if (node.metadata?.external === true) {
    return `${node.kind} ${qualifiedName}${signature} (external)`;
  }

  return `${node.kind} ${qualifiedName}${signature} (${node.filePath}:${node.startLine})`;
}

function printNodes(nodes: CodeNode[]): void {
  if (nodes.length === 0) {
    console.log('No results.');
    return;
  }

  for (const node of nodes) {
    console.log(formatNode(node));
  }
}

function parseLimit(value: string | undefined, fallback = 20): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid limit: ${value}`);
  }

  return parsed;
}

function parseUnresolvedArgs(args: string[]): { limit: number; projectArg?: string } {
  const [first, second, third] = args;

  if (first === '--limit' || first === '-n') {
    return {
      limit: parseLimit(second),
      projectArg: third,
    };
  }

  if (first?.startsWith('--limit=')) {
    return {
      limit: parseLimit(first.slice('--limit='.length)),
      projectArg: second,
    };
  }

  const firstAsNumber = first ? Number(first) : Number.NaN;
  if (first && Number.isInteger(firstAsNumber) && firstAsNumber > 0) {
    return {
      limit: firstAsNumber,
      projectArg: second,
    };
  }

  return {
    limit: 20,
    projectArg: first,
  };
}

function printNodeDetails(node: CodeNode): void {
  console.log(`id: ${node.id}`);
  console.log(`kind: ${node.kind}`);
  console.log(`name: ${node.name}`);
  console.log(`qualifiedName: ${node.qualifiedName ?? 'n/a'}`);
  console.log(`file: ${node.metadata?.external === true ? 'external' : `${node.filePath}:${node.startLine}:${node.startColumn}`}`);
  console.log(`range: ${node.startLine}:${node.startColumn} - ${node.endLine}:${node.endColumn}`);
  console.log(`language: ${node.language}`);
  console.log(`signature: ${node.signature ?? 'n/a'}`);
  console.log(`docstring: ${node.docstring ?? 'n/a'}`);
  console.log(`isExported: ${node.isExported ? 'true' : 'false'}`);
  console.log(`metadata: ${node.metadata ? JSON.stringify(node.metadata, null, 2) : 'n/a'}`);
}

function printNodeDetailsList(nodes: CodeNode[]): void {
  if (nodes.length === 0) {
    console.log('No results.');
    return;
  }

  nodes.forEach((node, index) => {
    if (index > 0) {
      console.log('');
      console.log('---');
    }

    printNodeDetails(node);
  });
}

function printRelatedNodes(results: RelatedNode[]): void {
  if (results.length === 0) {
    console.log('No results.');
    return;
  }

  for (const result of results) {
    const location = result.edge.line
      ? ` via ${result.edge.kind} at ${result.edge.line}:${result.edge.column ?? 0}`
      : ` via ${result.edge.kind}`;
    console.log(`${formatNode(result.node)}${location}`);
  }
}

function printContext(context: GraphContextResult): void {
  console.log(`Query: ${context.query}`);
  console.log('');

  console.log('Entry points:');
  if (context.entryPoints.length === 0) {
    console.log('No results.');
  } else {
    for (const result of context.entryPoints) {
      console.log(`${formatNode(result.node)} score=${result.score.toFixed(2)}`);
    }
  }

  console.log('');
  console.log('References:');
  printRelatedNodes(context.references);

  console.log('');
  console.log('Callers:');
  printRelatedNodes(context.callers);

  console.log('');
  console.log('Callees:');
  printRelatedNodes(context.callees);

  console.log('');
  console.log('Related files:');
  if (context.relatedFiles.length === 0) {
    console.log('No results.');
  } else {
    for (const filePath of context.relatedFiles) {
      console.log(filePath);
    }
  }
}

async function runIndex(projectArg?: string): Promise<void> {
  const paths = resolveProjectPaths(projectArg);
  ensureStateDir(paths.stateDir);

  const { store, service } = await createIndexService(paths.dbPath);
  try {
    console.log(`Indexing project: ${paths.root}`);
    await service.indexAll(paths.root);
    const stats = store.getStats();
    console.log(`Indexed files: ${stats.fileCount}`);
    console.log(`Nodes: ${stats.nodeCount}`);
    console.log(`Edges: ${stats.edgeCount}`);
    console.log(`Unresolved refs: ${stats.unresolvedRefCount}`);
    console.log(`Database: ${paths.dbPath}`);
  } finally {
    store.close();
  }
}

async function runSync(projectArg?: string): Promise<void> {
  const paths = resolveProjectPaths(projectArg);
  ensureStateDir(paths.stateDir);

  const { store, service } = await createIndexService(paths.dbPath);
  try {
    console.log(`Syncing project: ${paths.root}`);
    await service.sync(paths.root);
    const stats = store.getStats();
    console.log(`Indexed files: ${stats.fileCount}`);
    console.log(`Nodes: ${stats.nodeCount}`);
    console.log(`Edges: ${stats.edgeCount}`);
    console.log(`Unresolved refs: ${stats.unresolvedRefCount}`);
  } finally {
    store.close();
  }
}

function runStats(projectArg?: string): void {
  const paths = resolveProjectPaths(projectArg);
  ensureStateDir(paths.stateDir);
  const store = createStore(paths.dbPath);
  try {
    const stats = store.getStats();
    console.log(`Project: ${paths.root}`);
    console.log(`Database: ${paths.dbPath}`);
    console.log(`Files: ${stats.fileCount}`);
    console.log(`Nodes: ${stats.nodeCount}`);
    console.log(`Edges: ${stats.edgeCount}`);
    console.log(`Unresolved refs: ${stats.unresolvedRefCount}`);
    console.log(`Last indexed: ${formatTimestamp(stats.lastIndexedAt)}`);
  } finally {
    store.close();
  }
}

function runUnresolved(args: string[]): void {
  const { limit, projectArg } = parseUnresolvedArgs(args);
  const paths = resolveProjectPaths(projectArg);
  ensureStateDir(paths.stateDir);
  const store = createStore(paths.dbPath);
  try {
    const stats = store.getStats();
    const byKind = store.getUnresolvedStatsByKind();
    const topRefs = store.getTopUnresolvedRefs(limit);

    console.log(`Project: ${paths.root}`);
    console.log(`Total unresolved refs: ${stats.unresolvedRefCount}`);
    console.log('');

    console.log('By kind:');
    if (byKind.length === 0) {
      console.log('No unresolved refs.');
    } else {
      for (const row of byKind) {
        console.log(`${row.refKind.padEnd(12)} ${row.count}`);
      }
    }

    console.log('');
    console.log(`Top refs (limit ${limit}):`);
    if (topRefs.length === 0) {
      console.log('No unresolved refs.');
    } else {
      for (const row of topRefs) {
        console.log(`${row.refName.padEnd(40)} ${row.refKind.padEnd(12)} ${row.count}`);
      }
    }
  } finally {
    store.close();
  }
}

function runSearch(query: string | undefined, projectArg?: string): void {
  if (!query) {
    throw new Error('Missing search query. Usage: code-agent search <symbol> [projectPath]');
  }

  const paths = resolveProjectPaths(projectArg);
  ensureStateDir(paths.stateDir);
  const store = createStore(paths.dbPath);
  try {
    const graph = new GraphQueryService(store);
    const results = graph.searchSymbol(query);
    if (results.length === 0) {
      console.log('No results.');
      return;
    }

    for (const result of results) {
      console.log(`${formatNode(result.node)} score=${result.score.toFixed(2)}`);
    }
  } finally {
    store.close();
  }
}

function runNode(query: string | undefined, projectArg?: string): void {
  if (!query) {
    throw new Error('Missing symbol. Usage: code-agent node <symbol-or-node-id> [projectPath]');
  }

  const paths = resolveProjectPaths(projectArg);
  ensureStateDir(paths.stateDir);
  const store = createStore(paths.dbPath);
  try {
    const graph = new GraphQueryService(store);
    const resolved = graph.resolveSymbol(query);
    if (resolved.length === 0) {
      console.log(`Symbol not found: ${query}`);
      return;
    }

    printNodeDetailsList(resolved);
  } finally {
    store.close();
  }
}

function runContext(query: string | undefined, projectArg?: string): void {
  if (!query) {
    throw new Error('Missing query. Usage: code-agent context <query> [projectPath]');
  }

  const paths = resolveProjectPaths(projectArg);
  ensureStateDir(paths.stateDir);
  const store = createStore(paths.dbPath);
  try {
    const graph = new GraphQueryService(store);
    printContext(graph.buildContext(query));
  } finally {
    store.close();
  }
}

function runCallers(query: string | undefined, projectArg?: string): void {
  if (!query) {
    throw new Error('Missing symbol. Usage: code-agent callers <symbol> [projectPath]');
  }

  const paths = resolveProjectPaths(projectArg);
  ensureStateDir(paths.stateDir);
  const store = createStore(paths.dbPath);
  try {
    const graph = new GraphQueryService(store);
    const resolved = graph.resolveSymbol(query);
    if (resolved.length === 0) {
      console.log(`Symbol not found: ${query}`);
      return;
    }

    console.log('Resolved symbols:');
    printNodes(resolved);
    console.log('');
    console.log('Callers:');
    printRelatedNodes(graph.findCallers(query));
  } finally {
    store.close();
  }
}

function runCallees(query: string | undefined, projectArg?: string): void {
  if (!query) {
    throw new Error('Missing symbol. Usage: code-agent callees <symbol> [projectPath]');
  }

  const paths = resolveProjectPaths(projectArg);
  ensureStateDir(paths.stateDir);
  const store = createStore(paths.dbPath);
  try {
    const graph = new GraphQueryService(store);
    const resolved = graph.resolveSymbol(query);
    if (resolved.length === 0) {
      console.log(`Symbol not found: ${query}`);
      return;
    }

    console.log('Resolved symbols:');
    printNodes(resolved);
    console.log('');
    console.log('Callees:');
    printRelatedNodes(graph.findCallees(query));
  } finally {
    store.close();
  }
}

function runReferences(query: string | undefined, projectArg?: string): void {
  if (!query) {
    throw new Error('Missing symbol. Usage: code-agent refs <symbol> [projectPath]');
  }

  const paths = resolveProjectPaths(projectArg);
  ensureStateDir(paths.stateDir);
  const store = createStore(paths.dbPath);
  try {
    const graph = new GraphQueryService(store);
    const resolved = graph.resolveSymbol(query);
    if (resolved.length === 0) {
      console.log(`Symbol not found: ${query}`);
      return;
    }

    console.log('Resolved symbols:');
    printNodes(resolved);
    console.log('');
    console.log('References:');
    printRelatedNodes(graph.findReferences(query));
  } finally {
    store.close();
  }
}

async function main(): Promise<void> {
  const rawCommand = process.argv[2];
  const firstArg = process.argv[3];
  const projectArg = process.argv[4];
  const restArgs = process.argv.slice(3);

  if (!rawCommand || rawCommand === '--help' || rawCommand === '-h') {
    console.log(usage());
    return;
  }

  if (
    ![
      'index',
      'sync',
      'stats',
      'unresolved',
      'search',
      'node',
      'context',
      'serve',
      'callers',
      'callees',
      'refs',
      'references',
    ].includes(rawCommand)
  ) {
    console.error(`Unknown command: ${rawCommand}`);
    console.error('');
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const command = rawCommand as Command;

  if (command === 'index') {
    await runIndex(firstArg);
    return;
  }

  if (command === 'sync') {
    await runSync(firstArg);
    return;
  }

  if (command === 'unresolved') {
    runUnresolved(restArgs);
    return;
  }

  if (command === 'search') {
    runSearch(firstArg, projectArg);
    return;
  }

  if (command === 'node') {
    runNode(firstArg, projectArg);
    return;
  }

  if (command === 'context') {
    runContext(firstArg, projectArg);
    return;
  }

  if (command === 'serve') {
    await startMcpServer(firstArg);
    return;
  }

  if (command === 'callers') {
    runCallers(firstArg, projectArg);
    return;
  }

  if (command === 'callees') {
    runCallees(firstArg, projectArg);
    return;
  }

  if (command === 'refs' || command === 'references') {
    runReferences(firstArg, projectArg);
    return;
  }

  runStats(firstArg);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
