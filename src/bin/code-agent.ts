#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createStore, ensureStateDir, resolveProjectPaths } from '../project';
import { SqliteGraphStore } from '../store/queries';
import { CodeIndexService, SyncResult } from '../service/indexer';
import { CodeEdge, CodeNode } from '../types';
import { GraphContextResult, GraphQueryService, RelatedNode } from '../graph';
import { startMcpServer } from '../mcp/server';
import { createDefaultIndexService } from '../service/default-service';
import {
  FileWatcher,
  installGitSyncHooks,
  isGitSyncHookInstalled,
  removeGitSyncHooks,
  watchDisabledReason,
} from '../sync';
import { AgentName } from '../agent';
import { AgentRuntime, AgentRuntimeResult } from '../runtime';
import { createDeepSeekProvider } from '../provider';
import { SessionPart } from '../session';

type Command =
  | 'run'
  | 'index'
  | 'sync'
  | 'watch'
  | 'git'
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

const commands: Command[] = [
  'run',
  'index',
  'sync',
  'watch',
  'git',
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
];

function usage(): string {
  return [
    'Usage: code-agent <command> [args]',
    '',
    'Commands:',
    '  run "<task>" [projectPath]       Run an agent task',
    '  index [projectPath]              Build or rebuild the local code graph index',
    '  sync [projectPath]               Sync changed files into the local index',
    '  watch [options] [projectPath]    Watch files and auto-sync changed source files',
    '  git sync [projectPath]           Run git-based sync',
    '  git hook <action> [projectPath]  Manage git hooks; action: install, remove, status',
    '  stats [projectPath]              Show local index statistics',
    '  unresolved [options] [projectPath] Show unresolved reference summary',
    '  search <query> [projectPath]     Search symbols by name',
    '  node <query> [projectPath]       Show details for a symbol or node id',
    '  context <query> [projectPath]    Build a small graph context for a query',
    '  callers <symbol> [projectPath]   Find methods that call a symbol',
    '  callees <symbol> [projectPath]   Find symbols called by a method',
    '  refs <symbol> [projectPath]      Find references to a symbol',
    '  references <symbol> [projectPath] Alias for refs',
    '  serve [options] [projectPath]    Start the MCP stdio server',
    '',
    'Run options:',
    '  --agent <build|plan>             Agent to use; default: build',
    '  --model <model>                  Provider model override',
    '  --max-steps <n>                  Maximum agent loop steps',
    '  --temperature <n>                Sampling temperature',
    '  --cwd, --project <projectPath>   Project root override',
    '',
    'Watch options:',
    '  --verbose, -v                    Print changed nodes and edges',
    '  --debounce <ms>                  Debounce file events; default: 1500',
    '',
    'Serve options:',
    '  --no-auto-sync                   Disable initial/automatic sync',
    '  --watch                          Watch files while serving MCP',
    '  --debounce <ms>                  Debounce watch events',
    '',
    'Unresolved options:',
    '  --limit <n>, -n <n>              Number of top unresolved refs to show',
    '',
    'Operation examples:',
    '  code-agent index .',
    '      Build the code graph for the current project.',
    '  code-agent sync .',
    '      Incrementally sync changed files into the existing graph.',
    '  code-agent run "explain the runtime entrypoint"',
    '      Run the default build agent against the current project.',
    '  code-agent run "plan a session resume feature" --agent plan --max-steps 6',
    '      Use the read-only planning agent with a step limit.',
    '  code-agent search SessionProcessor',
    '      Search indexed symbols matching SessionProcessor.',
    '  code-agent node GraphQueryService',
    '      Show details for a resolved symbol or node id.',
    '  code-agent context AgentRuntime',
    '      Show entry points, callers, callees, references, and related files.',
    '  code-agent callers createLocalToolRegistry',
    '      Find code paths that call a symbol.',
    '  code-agent callees AgentRuntime',
    '      Find symbols called by a method or constructor.',
    '  code-agent refs GraphQueryService',
    '      Find references to a symbol.',
    '  code-agent unresolved --limit 10',
    '      Show the top unresolved references.',
    '  code-agent watch --verbose .',
    '      Keep the graph synced and print detailed diffs.',
    '  code-agent serve --watch .',
    '      Start the MCP server and keep the graph synced.',
    '  code-agent git hook install .',
    '      Install git hooks that keep the graph in sync.',
    '  code-agent git hook status .',
    '      Check whether git sync hooks are installed.',
  ].join('\n');
}

interface RunArgs {
  task: string;
  projectArg?: string;
  agent?: AgentName;
  model?: string;
  maxSteps?: number;
  temperature?: number;
}

async function createIndexService(dbPath: string): Promise<{
  store: SqliteGraphStore;
  service: CodeIndexService;
}> {
  return createDefaultIndexService(dbPath);
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

function formatEdge(edge: CodeEdge, store: SqliteGraphStore, fallbackNodes: CodeNode[] = []): string {
  const fallbackById = new Map(fallbackNodes.map((node) => [node.id, node]));
  const source = store.getNodeById(edge.source) ?? fallbackById.get(edge.source);
  const target = store.getNodeById(edge.target) ?? fallbackById.get(edge.target);
  const sourceName = source ? formatNode(source) : edge.source;
  const targetName = target ? formatNode(target) : edge.target;
  const location = edge.line ? ` at ${edge.line}:${edge.column ?? 0}` : '';

  return `${edge.kind} ${sourceName} -> ${targetName}${location}`;
}

function formatFieldChange(field: string, before: unknown, after: unknown): string {
  return `${field}: ${formatCompactValue(before)} -> ${formatCompactValue(after)}`;
}

function formatCompactValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return JSON.stringify(value.length > 80 ? `${value.slice(0, 77)}...` : value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  const json = JSON.stringify(value);
  return json.length > 80 ? `${json.slice(0, 77)}...` : json;
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

function printWatchVerboseResult(result: SyncResult, store: SqliteGraphStore): void {
  console.log('');
  console.log(`[${new Date().toISOString()}] Watch sync detail`);
  console.log(`Changed files: ${result.changedFiles} (added ${result.added}, modified ${result.modified}, deleted ${result.deleted})`);
  if (result.files.added.length === 0 && result.files.modified.length === 0 && result.files.deleted.length === 0) {
    console.log('  none');
  } else {
    printChangedFileGroup('+', result.files.added);
    printChangedFileGroup('~', result.files.modified);
    printChangedFileGroup('-', result.files.deleted);
  }

  if (!result.diff) {
    return;
  }

  const fallbackNodes = [
    ...result.diff.nodes.added,
    ...result.diff.nodes.removed,
    ...result.diff.nodes.updated.map((update) => update.before),
    ...result.diff.nodes.updated.map((update) => update.after),
  ];

  console.log('');
  console.log(
    `Node changes: +${result.diff.nodes.added.length} ` +
    `~${result.diff.nodes.updated.length} -${result.diff.nodes.removed.length}`
  );
  printNodeDiff('+', result.diff.nodes.added);
  printNodeUpdateDiff(result.diff.nodes.updated);
  printNodeDiff('-', result.diff.nodes.removed);

  console.log('');
  console.log('Edge changes:');
  printEdgeDiff('+', result.diff.edges.added, store, fallbackNodes);
  printEdgeDiff('-', result.diff.edges.removed, store, fallbackNodes);
}

function printChangedFileGroup(prefix: string, files: string[]): void {
  for (const filePath of files) {
    console.log(`  ${prefix} ${filePath}`);
  }
}

function printNodeDiff(prefix: string, nodes: CodeNode[]): void {
  if (nodes.length === 0) {
    console.log(`  ${prefix} none`);
    return;
  }

  for (const node of nodes) {
    console.log(`  ${prefix} ${formatNode(node)}`);
  }
}

function printNodeUpdateDiff(updates: NonNullable<SyncResult['diff']>['nodes']['updated']): void {
  if (updates.length === 0) {
    console.log('  ~ none');
    return;
  }

  for (const update of updates) {
    console.log(`  ~ ${formatNode(update.after)}`);
    const details = update.fields.map((field) =>
      formatFieldChange(field, update.before[field as keyof CodeNode], update.after[field as keyof CodeNode])
    );
    console.log(`    ${details.join('; ')}`);
  }
}

function printEdgeDiff(prefix: string, edges: CodeEdge[], store: SqliteGraphStore, fallbackNodes: CodeNode[]): void {
  if (edges.length === 0) {
    console.log(`  ${prefix} none`);
    return;
  }

  for (const edge of edges) {
    console.log(`  ${prefix} ${formatEdge(edge, store, fallbackNodes)}`);
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

function parseOptionalNumber(value: string | undefined, name: string): number {
  if (!value) {
    throw new Error(`Missing value for ${name}`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  return parsed;
}

function parseRunArgs(args: string[]): RunArgs {
  let task: string | undefined;
  let projectArg: string | undefined;
  let agent: AgentName | undefined;
  let model: string | undefined;
  let maxSteps: number | undefined;
  let temperature: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === '--agent') {
      agent = parseAgentName(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith('--agent=')) {
      agent = parseAgentName(arg.slice('--agent='.length));
      continue;
    }

    if (arg === '--model') {
      model = args[index + 1];
      if (!model) {
        throw new Error('Missing value for --model');
      }
      index += 1;
      continue;
    }

    if (arg.startsWith('--model=')) {
      model = arg.slice('--model='.length);
      continue;
    }

    if (arg === '--max-steps') {
      maxSteps = parseLimit(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith('--max-steps=')) {
      maxSteps = parseLimit(arg.slice('--max-steps='.length));
      continue;
    }

    if (arg === '--temperature') {
      temperature = parseOptionalNumber(args[index + 1], '--temperature');
      index += 1;
      continue;
    }

    if (arg.startsWith('--temperature=')) {
      temperature = parseOptionalNumber(arg.slice('--temperature='.length), '--temperature');
      continue;
    }

    if (arg === '--cwd' || arg === '--project') {
      projectArg = args[index + 1];
      if (!projectArg) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      continue;
    }

    if (arg.startsWith('--cwd=')) {
      projectArg = arg.slice('--cwd='.length);
      continue;
    }

    if (arg.startsWith('--project=')) {
      projectArg = arg.slice('--project='.length);
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown run option: ${arg}`);
    }

    if (!task) {
      task = arg;
      continue;
    }

    if (!projectArg) {
      projectArg = arg;
      continue;
    }

    throw new Error(`Unexpected run argument: ${arg}`);
  }

  if (!task) {
    throw new Error('Missing task. Usage: code-agent run "<task>" [projectPath]');
  }

  return { task, projectArg, agent, model, maxSteps, temperature };
}

function parseAgentName(value: string | undefined): AgentName {
  if (value === 'build' || value === 'plan') {
    return value;
  }

  throw new Error(`Invalid agent: ${value ?? ''}. Expected "build" or "plan".`);
}

function isCommand(value: string): value is Command {
  return commands.includes(value as Command);
}

function loadLocalEnv(projectRoot: string): void {
  const home = process.env.HOME;
  if (home) {
    loadDotEnvFile(path.join(home, '.code-agent', '.env'));
    loadDotEnvFile(path.join(home, '.config', 'code-agent', '.env'));
  }

  loadDotEnvFile(path.join(projectRoot, '.env'));
  loadDotEnvFile(path.join(process.cwd(), '.env'));
}

function loadDotEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (process.env[key!] !== undefined) {
      continue;
    }

    process.env[key!] = unquoteEnvValue(rawValue ?? '');
  }
}

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
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

async function runAgentTask(args: string[]): Promise<void> {
  const options = parseRunArgs(args);
  const paths = resolveProjectPaths(options.projectArg);
  loadLocalEnv(paths.root);

  const runtime = new AgentRuntime();
  const provider = createDeepSeekProvider({
    model: options.model,
  });

  console.log(`Project: ${paths.root}`);
  console.log(`Agent: ${options.agent ?? 'build'}`);
  console.log(`Model: ${options.model ?? provider.defaultModel}`);
  console.log('');

  const result = await runtime.run({
    task: options.task,
    projectPath: paths.root,
    provider,
    agent: options.agent,
    model: options.model,
    maxSteps: options.maxSteps,
    temperature: options.temperature,
    title: options.task,
  });

  printRunResult(result);
  if (result.status === 'failed') {
    process.exitCode = 1;
  }
}

async function runSync(projectArg?: string): Promise<void> {
  const paths = resolveProjectPaths(projectArg);
  ensureStateDir(paths.stateDir);

  const { store, service } = await createIndexService(paths.dbPath);
  try {
    console.log(`Syncing project: ${paths.root}`);
    const result = await service.sync(paths.root);
    const stats = store.getStats();
    console.log(`Changed files: ${result.changedFiles} (added ${result.added}, modified ${result.modified}, deleted ${result.deleted})`);
    console.log(`Indexed files: ${stats.fileCount}`);
    console.log(`Nodes: ${stats.nodeCount}`);
    console.log(`Edges: ${stats.edgeCount}`);
    console.log(`Unresolved refs: ${stats.unresolvedRefCount}`);
  } finally {
    store.close();
  }
}

async function runWatch(args: string[]): Promise<void> {
  const { debounceMs, projectArg, verbose } = parseWatchArgs(args);
  const paths = resolveProjectPaths(projectArg);
  ensureStateDir(paths.stateDir);

  const disabledReason = watchDisabledReason(paths.root);
  if (disabledReason) {
    throw new Error(`watch disabled: ${disabledReason}`);
  }

  const { store, service } = await createIndexService(paths.dbPath);
  const watcher = new FileWatcher<SyncResult>(
    paths.root,
    () => service.sync(paths.root, { diff: verbose }),
    {
      debounceMs,
      onEvent: (filePath) => {
        console.log(`Changed: ${filePath}`);
      },
      onSyncComplete: (result) => {
        if (verbose) {
          printWatchVerboseResult(result, store);
        }

        const stats = store.getStats();
        console.log(
          `Synced ${result.changedFiles} file(s) in ${result.durationMs}ms. ` +
          `Nodes: ${stats.nodeCount}, Edges: ${stats.edgeCount}, Unresolved refs: ${stats.unresolvedRefCount}`
        );
      },
      onSyncError: (error) => {
        console.error(`Watch sync failed: ${error.message}`);
      },
    }
  );

  const started = watcher.start();
  if (!started) {
    store.close();
    throw new Error('Failed to start file watcher.');
  }

  console.log(`Watching project: ${paths.root}`);
  console.log(`Debounce: ${debounceMs}ms`);
  console.log(`Verbose: ${verbose ? 'on' : 'off'}`);
  console.log('Press Ctrl+C to stop.');

  const stop = (): void => {
    watcher.stop();
    store.close();
    console.log('');
    console.log('Watcher stopped.');
    process.exit(0);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  await new Promise<void>(() => {
    // Keep the process alive until a signal arrives.
  });
}

async function runGit(args: string[]): Promise<void> {
  const subcommand = args[0];
  if (!subcommand || subcommand === 'sync') {
    await runSync(args[1]);
    return;
  }

  const projectArg = args[2];
  const paths = resolveProjectPaths(projectArg);
  ensureStateDir(paths.stateDir);

  if (subcommand === 'hook') {
    const action = args[1] ?? 'status';
    if (action === 'install') {
      const result = installGitSyncHooks(paths.root);
      printGitHookResult('Installed', result);
      return;
    }

    if (action === 'remove') {
      const result = removeGitSyncHooks(paths.root);
      printGitHookResult('Removed', result);
      return;
    }

    if (action === 'status') {
      const installed = isGitSyncHookInstalled(paths.root);
      console.log(`Project: ${paths.root}`);
      console.log(`Git hooks: ${installed ? 'installed' : 'not installed'}`);
      return;
    }
  }

  throw new Error('Usage: code-agent git sync [projectPath] | code-agent git hook <install|remove|status> [projectPath]');
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

function printRunResult(result: AgentRuntimeResult): void {
  console.log(`Session: ${result.session.id}`);
  console.log(`Status: ${result.status}`);
  console.log(`Steps: ${result.steps}`);
  console.log('');

  let printedAssistant = false;
  for (const item of result.messages) {
    if (item.message.role !== 'assistant') {
      continue;
    }

    for (const part of item.parts) {
      printRunPart(part);
      if (part.type === 'text' && part.text.trim()) {
        printedAssistant = true;
      }
    }
  }

  if (!printedAssistant) {
    console.log('No assistant text output.');
  }
}

function printRunPart(part: SessionPart): void {
  if (part.type === 'text') {
    const text = part.text.trim();
    if (text) {
      console.log(text);
      console.log('');
    }
    return;
  }

  if (part.type === 'tool') {
    const label = part.status === 'completed'
      ? 'completed'
      : part.status === 'error'
        ? `error: ${part.error ?? 'unknown error'}`
        : part.status;
    console.log(`[tool:${part.tool}] ${label}`);
    return;
  }

  if (part.type === 'error') {
    console.log(`[error] ${part.message}`);
  }
}

function parseWatchArgs(args: string[]): { debounceMs: number; projectArg?: string; verbose: boolean } {
  let debounceMs = 1500;
  let projectArg: string | undefined;
  let verbose = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === '--verbose' || arg === '-v') {
      verbose = true;
      continue;
    }

    if (arg === '--debounce') {
      debounceMs = parseLimit(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith('--debounce=')) {
      debounceMs = parseLimit(arg.slice('--debounce='.length));
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown watch option: ${arg}`);
    }

    projectArg = arg;
  }

  return { debounceMs, projectArg, verbose };
}

function parseServeArgs(args: string[]): { projectArg?: string; autoSync: boolean; watch: boolean; debounceMs?: number } {
  let projectArg: string | undefined;
  let autoSync = true;
  let watch = false;
  let debounceMs: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === '--no-auto-sync') {
      autoSync = false;
      continue;
    }

    if (arg === '--watch') {
      watch = true;
      continue;
    }

    if (arg === '--debounce') {
      debounceMs = parseLimit(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith('--debounce=')) {
      debounceMs = parseLimit(arg.slice('--debounce='.length));
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown serve option: ${arg}`);
    }

    projectArg = arg;
  }

  return { projectArg, autoSync, watch, debounceMs };
}

function printGitHookResult(action: string, result: { hooksDir: string | null; hooks: string[]; skipped?: string }): void {
  if (result.skipped) {
    console.log(`Skipped: ${result.skipped}`);
    return;
  }

  console.log(`${action} hooks: ${result.hooks.length > 0 ? result.hooks.join(', ') : 'none'}`);
  console.log(`Hooks dir: ${result.hooksDir ?? 'n/a'}`);
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

  if (!isCommand(rawCommand)) {
    console.error(`Unknown command: ${rawCommand}`);
    console.error('');
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const command = rawCommand;

  if (command === 'run') {
    await runAgentTask(restArgs);
    return;
  }

  if (command === 'index') {
    await runIndex(firstArg);
    return;
  }

  if (command === 'sync') {
    await runSync(firstArg);
    return;
  }

  if (command === 'watch') {
    await runWatch(restArgs);
    return;
  }

  if (command === 'git') {
    await runGit(restArgs);
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
    const serveOptions = parseServeArgs(restArgs);
    await startMcpServer(serveOptions.projectArg, {
      autoSync: serveOptions.autoSync,
      watch: serveOptions.watch,
      debounceMs: serveOptions.debounceMs,
    });
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
