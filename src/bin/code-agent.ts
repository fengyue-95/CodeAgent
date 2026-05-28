#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
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
import { AgentPermissionRequest, AgentRuntime, AgentRuntimeEvent, AgentRuntimeResult } from '../runtime';
import { createDeepSeekProvider } from '../provider';
import { LocalToolMode, closeBrowserSession } from '../tool';
import { SessionInfo } from '../session';
import { startTui } from '../tui';
import { Logger, LogLevel } from '../utils/logger';
import { ErrorReporter } from '../utils/error-reporter';
import { configureLogger, GlobalOptions, setupErrorHandlers } from '../utils/cli-helpers';
import { CodeAgentError, ErrorCode, ErrorHandler } from '../utils/errors';
import { parseGlobalOptions, stripGlobalOptions } from './parse-global-options';

type Command =
  | 'run'
  | 'tui'
  | 'index'
  | 'sync'
  | 'watch'
  | 'git'
  | 'session'
  | 'sessions'
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
  'tui',
  'index',
  'sync',
  'watch',
  'git',
  'session',
  'sessions',
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
    '  tui [options] [projectPath]      Start interactive terminal UI',
    '  index [projectPath]              Build or rebuild the local code graph index',
    '  sync [projectPath]               Sync changed files into the local index',
    '  watch [options] [projectPath]    Watch files and auto-sync changed source files',
    '  git sync [projectPath]           Run git-based sync',
    '  git hook <action> [projectPath]  Manage git hooks; action: install, remove, status',
    '  session list [projectPath]       List agent sessions for a project',
    '  session new [projectPath]        Create a session manually',
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
    'Global options:',
    '  --verbose                        Enable verbose output',
    '  --debug                          Enable debug output',
    '  --quiet                          Suppress non-error output',
    '  --no-color                       Disable colored output',
    '  --log-file <path>                Write logs to file',
    '',
    'Run options:',
    '  --agent <build|plan>             Agent to use; default: build',
    '  --model <model>                  Provider model override',
    '  --max-steps <n>                  Maximum agent loop steps; default: 50',
    '  --temperature <n>                Sampling temperature',
    '  --tools <core|full>              Tool set for run; default: core',
    '  --session <sessionId>            Continue an existing session',
    '  --continue                       Continue the latest session in the project',
    '  --cwd, --project <projectPath>   Project root override',
    '',
    'TUI options:',
    '  --agent <build|plan>             Initial agent; default: build',
    '  --tools <core|full>              Initial tool set; default: core',
    '  --model <model>                  Provider model override',
    '  --max-steps <n>                  Maximum agent loop steps',
    '  --continue                       Continue the latest session',
    '  --cwd, --project <projectPath>   Project root override',
    '',
    'Session options:',
    '  --title <title>                  Title for session new',
    '  --limit <n>                      Number of sessions to list; default: 20',
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
    '  code-agent run "inspect gift card design" --max-steps 50',
    '      Override the maximum agent loop steps for this run.',
    '  code-agent run "fix the failing test" --tools full',
    '      Enable editing, shell, web, todo, and subagent tools for this run.',
    '  code-agent tui',
    '      Open an interactive terminal conversation.',
    '  code-agent tui --continue --agent plan',
    '      Continue the latest session in plan mode.',
    '  code-agent session new --title "gift card investigation"',
    '      Create a session before running a series of related prompts.',
    '  code-agent run "continue the investigation" --continue',
    '      Continue the latest session instead of creating a new one.',
    '  code-agent run "check edge cases" --session ses_xxx',
    '      Continue a specific session.',
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
    '  code-agent index --verbose .',
    '      Build the index with verbose logging.',
    '  code-agent sync --debug .',
    '      Sync with debug output for troubleshooting.',
  ].join('\n');
}

interface RunArgs {
  task: string;
  projectArg?: string;
  agent?: AgentName;
  model?: string;
  maxSteps?: number;
  temperature?: number;
  toolMode?: LocalToolMode;
  sessionId?: string;
  continueLatest?: boolean;
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
    throw new CodeAgentError(
      `Invalid limit: ${value}`,
      ErrorCode.INVALID_ARGUMENT,
      {
        context: { value },
        suggestions: [
          { message: 'Limit must be a positive integer' },
        ],
      }
    );
  }

  return parsed;
}

function parseOptionalNumber(value: string | undefined, name: string): number {
  if (!value) {
    throw new CodeAgentError(
      `Missing value for ${name}`,
      ErrorCode.INVALID_ARGUMENT,
      {
        context: { name },
      }
    );
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new CodeAgentError(
      `Invalid ${name}: ${value}`,
      ErrorCode.INVALID_ARGUMENT,
      {
        context: { name, value },
        suggestions: [
          { message: `${name} must be a valid number` },
        ],
      }
    );
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
  let toolMode: LocalToolMode | undefined;
  let sessionId: string | undefined;
  let continueLatest = false;

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

    if (arg === '--tools') {
      toolMode = parseToolMode(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith('--tools=')) {
      toolMode = parseToolMode(arg.slice('--tools='.length));
      continue;
    }

    if (arg === '--session') {
      const value = args[index + 1];
      if (!value) {
        throw new Error('Missing value for --session');
      }
      sessionId = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--session=')) {
      sessionId = arg.slice('--session='.length);
      continue;
    }

    if (arg === '--continue') {
      continueLatest = true;
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
    throw new CodeAgentError(
      'Missing task argument',
      ErrorCode.INVALID_ARGUMENT,
      {
        suggestions: [
          { message: 'Usage: code-agent run "<task>" [projectPath]' },
        ],
      }
    );
  }

  if (sessionId && continueLatest) {
    throw new CodeAgentError(
      'Cannot use both --session and --continue',
      ErrorCode.INVALID_ARGUMENT,
      {
        suggestions: [
          { message: 'Use either --session <id> or --continue, not both' },
        ],
      }
    );
  }

  return { task, projectArg, agent, model, maxSteps, temperature, toolMode, sessionId, continueLatest };
}

function parseAgentName(value: string | undefined): AgentName {
  if (value === 'build' || value === 'plan') {
    return value;
  }

  throw new CodeAgentError(
    `Invalid agent: ${value ?? ''}`,
    ErrorCode.INVALID_ARGUMENT,
    {
      context: { value },
      suggestions: [
        { message: 'Expected "build" or "plan"' },
      ],
    }
  );
}

function parseToolMode(value: string | undefined): LocalToolMode {
  if (value === 'core' || value === 'full') {
    return value;
  }

  throw new CodeAgentError(
    `Invalid tool mode: ${value ?? ''}`,
    ErrorCode.INVALID_ARGUMENT,
    {
      context: { value },
      suggestions: [
        { message: 'Expected "core" or "full"' },
      ],
    }
  );
}

function parseProjectFlag(arg: string, next: string | undefined): { consumed: boolean; value?: string } | undefined {
  if (arg === '--cwd' || arg === '--project') {
    if (!next) {
      throw new Error(`Missing value for ${arg}`);
    }
    return { consumed: true, value: next };
  }

  if (arg.startsWith('--cwd=')) {
    return { consumed: false, value: arg.slice('--cwd='.length) };
  }

  if (arg.startsWith('--project=')) {
    return { consumed: false, value: arg.slice('--project='.length) };
  }

  return undefined;
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

async function runIndex(projectArg?: string, logger?: Logger): Promise<void> {
  const paths = resolveProjectPaths(projectArg);
  ensureStateDir(paths.stateDir);

  const { store, service } = await createIndexService(paths.dbPath);
  try {
    if (logger) {
      logger.info('Starting index operation', { projectRoot: paths.root });
    }
    console.log(`Indexing project: ${paths.root}`);
    await service.indexAll(paths.root);
    const stats = store.getStats();
    console.log(`Indexed files: ${stats.fileCount}`);
    console.log(`Nodes: ${stats.nodeCount}`);
    console.log(`Edges: ${stats.edgeCount}`);
    console.log(`Unresolved refs: ${stats.unresolvedRefCount}`);
    console.log(`Database: ${paths.dbPath}`);
    if (logger) {
      logger.info('Index operation completed', { stats });
    }
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
  console.log(`Tools: ${options.toolMode ?? 'core'}`);
  const sessionId = options.sessionId ?? (options.continueLatest ? resolveLatestSessionId(paths.dbPath) : undefined);
  if (sessionId) {
    console.log(`Session: ${sessionId}`);
  }
  console.log('');

  try {
    const result = await runtime.run({
      task: options.task,
      projectPath: paths.root,
      provider,
      sessionId,
      agent: options.agent,
      model: options.model,
      maxSteps: options.maxSteps,
      temperature: options.temperature,
      toolMode: options.toolMode,
      title: options.task,
      onEvent: printRunEvent,
      onPermissionRequest: askPermission,
    });

    printRunResult(result);
    if (result.status === 'failed') {
      process.exitCode = 1;
    }
  } finally {
    await closeBrowserSession();
  }
}

function resolveLatestSessionId(dbPath: string): string {
  ensureStateDir(path.dirname(dbPath));
  const store = createStore(dbPath);
  try {
    const session = store.sessions().listSessions(1)[0];
    if (!session) {
      throw new CodeAgentError(
        'No existing sessions found',
        ErrorCode.NOT_FOUND,
        {
          suggestions: [
            { message: 'Run "code-agent session new" to create a session first' },
            { message: 'Or omit --continue to create a new session automatically' },
          ],
        }
      );
    }
    return session.id;
  } finally {
    store.close();
  }
}

function runSessionCommand(args: string[]): void {
  const actionArg = args[0];
  const action = actionArg === 'new' || actionArg === 'list' ? actionArg : 'list';
  const rest = action === 'list' && actionArg !== 'list' && actionArg !== 'new' ? args : args.slice(1);
  const options = parseSessionArgs(rest);
  const paths = resolveProjectPaths(options.projectArg);
  ensureStateDir(paths.stateDir);
  const store = createStore(paths.dbPath);
  try {
    if (action === 'new') {
      const session = store.sessions().createSession({
        cwd: paths.root,
        agent: options.agent ?? 'build',
        model: options.model,
        title: options.title,
      });
      printSession(session);
      return;
    }

    const sessions = store.sessions().listSessions(options.limit);
    if (sessions.length === 0) {
      console.log('No sessions.');
      return;
    }

    for (const session of sessions) {
      printSession(session);
      console.log('');
    }
  } finally {
    store.close();
  }
}

function parseSessionArgs(args: string[]): {
  projectArg?: string;
  title?: string;
  agent?: AgentName;
  model?: string;
  limit: number;
} {
  let projectArg: string | undefined;
  let title: string | undefined;
  let agent: AgentName | undefined;
  let model: string | undefined;
  let limit = 20;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    const projectFlag = parseProjectFlag(arg, args[index + 1]);
    if (projectFlag) {
      projectArg = projectFlag.value;
      if (projectFlag.consumed) {
        index += 1;
      }
      continue;
    }

    if (arg === '--title') {
      title = args[index + 1];
      if (!title) {
        throw new Error('Missing value for --title');
      }
      index += 1;
      continue;
    }

    if (arg.startsWith('--title=')) {
      title = arg.slice('--title='.length);
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

    if (arg === '--limit') {
      limit = parseLimit(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      limit = parseLimit(arg.slice('--limit='.length));
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown session option: ${arg}`);
    }

    projectArg = arg;
  }

  return { projectArg, title, agent, model, limit };
}

function printSession(session: SessionInfo): void {
  console.log(`id: ${session.id}`);
  console.log(`title: ${session.title}`);
  console.log(`cwd: ${session.cwd}`);
  console.log(`agent: ${session.agent}`);
  console.log(`model: ${session.model ?? 'n/a'}`);
  console.log(`status: ${session.status}`);
  console.log(`updated: ${formatTimestamp(session.updatedAt)}`);
}

async function runSync(projectArg?: string, logger?: Logger): Promise<void> {
  const paths = resolveProjectPaths(projectArg);
  ensureStateDir(paths.stateDir);

  const { store, service } = await createIndexService(paths.dbPath);
  try {
    if (logger) {
      logger.info('Starting sync operation', { projectRoot: paths.root });
    }
    console.log(`Syncing project: ${paths.root}`);
    const result = await service.sync(paths.root);
    const stats = store.getStats();
    console.log(`Changed files: ${result.changedFiles} (added ${result.added}, modified ${result.modified}, deleted ${result.deleted})`);
    console.log(`Indexed files: ${stats.fileCount}`);
    console.log(`Nodes: ${stats.nodeCount}`);
    console.log(`Edges: ${stats.edgeCount}`);
    console.log(`Unresolved refs: ${stats.unresolvedRefCount}`);
    if (logger) {
      logger.info('Sync operation completed', { result, stats });
    }
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
    throw new CodeAgentError(
      'Watch is disabled',
      ErrorCode.INTERNAL,
      {
        context: { reason: disabledReason },
        suggestions: [
          { message: 'Check if the required tools are installed' },
        ],
      }
    );
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
    throw new CodeAgentError(
      'Failed to start file watcher',
      ErrorCode.INTERNAL,
      {
        suggestions: [
          { message: 'Check if the project directory is accessible' },
          { message: 'Verify that file watching is supported on this system' },
        ],
      }
    );
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

    throw new CodeAgentError(
      `Invalid git hook action: ${action}`,
      ErrorCode.INVALID_ARGUMENT,
      {
        context: { action },
        suggestions: [
          { message: 'Valid actions: install, remove, status' },
        ],
      }
    );
  }

  throw new CodeAgentError(
    'Invalid git command',
    ErrorCode.INVALID_ARGUMENT,
    {
      suggestions: [
        { message: 'Usage: code-agent git sync [projectPath]' },
        { message: 'Usage: code-agent git hook <install|remove|status> [projectPath]' },
      ],
    }
  );
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
  closeRunTextLine();
  console.log('');
  console.log(`Session: ${result.session.id}`);
  console.log(`Status: ${result.status}`);
  console.log(`Steps: ${result.steps}`);
}

let runTextLineOpen = false;

function printRunEvent(event: AgentRuntimeEvent): void {
  if (event.type === 'step-start') {
    closeRunTextLine();
    console.log(`\n[step ${event.step}/${event.maxSteps}] start`);
    return;
  }

  if (event.type === 'assistant-text-delta') {
    process.stdout.write(event.text);
    runTextLineOpen = true;
    return;
  }

  if (event.type === 'assistant-text') {
    closeRunTextLine();
    console.log(event.text.trim());
    console.log('');
    return;
  }

  if (event.type === 'tool-call-start') {
    closeRunTextLine();
    console.log(`[tool:${event.tool}] input`);
    return;
  }

  if (event.type === 'tool-call') {
    closeRunTextLine();
    console.log(`[tool:${event.tool}] start ${formatToolInput(event.input)}`);
    return;
  }

  if (event.type === 'permission-request') {
    closeRunTextLine();
    console.log(`[permission] ${event.request.permission} ${event.request.pattern}`);
    return;
  }

  if (event.type === 'permission-result') {
    closeRunTextLine();
    console.log(`[permission] ${event.approved ? 'approved' : 'rejected'}`);
    return;
  }

  if (event.type === 'tool-result') {
    closeRunTextLine();
    console.log(`[tool:${event.tool}] done ${formatToolOutput(event.output)}`);
    return;
  }

  if (event.type === 'tool-error') {
    closeRunTextLine();
    console.log(`[tool:${event.tool}] error ${event.error}`);
    return;
  }

  if (event.type === 'step-finish') {
    closeRunTextLine();
    console.log(`[step ${event.step}] finish${event.reason ? ` (${event.reason})` : ''}`);
    return;
  }

  if (event.type === 'runtime-error') {
    closeRunTextLine();
    console.log(`[error] ${event.error}`);
  }
}

function closeRunTextLine(): void {
  if (runTextLineOpen) {
    process.stdout.write('\n');
    runTextLineOpen = false;
  }
}

async function askPermission(request: AgentPermissionRequest): Promise<boolean> {
  closeRunTextLine();
  console.log('');
  console.log('Permission required:');
  console.log(`  Tool: ${request.tool}`);
  console.log(`  Permission: ${request.permission}`);
  console.log(`  Pattern: ${request.pattern}`);
  console.log(`  Input: ${formatToolInput(request.input)}`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = (await rl.question('Approve? [y/N] ')).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

function formatToolInput(input: Record<string, unknown>): string {
  const json = JSON.stringify(input);
  return json ? truncateText(json, 300) : '{}';
}

function formatToolOutput(output: string): string {
  const trimmed = output.trim();
  if (!trimmed) {
    return '';
  }

  return truncateText(trimmed.replace(/\s+/g, ' '), 500);
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
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
    throw new CodeAgentError(
      'Missing search query',
      ErrorCode.INVALID_ARGUMENT,
      {
        suggestions: [
          { message: 'Usage: code-agent search <symbol> [projectPath]' },
        ],
      }
    );
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
    throw new CodeAgentError(
      'Missing symbol argument',
      ErrorCode.INVALID_ARGUMENT,
      {
        suggestions: [
          { message: 'Usage: code-agent node <symbol-or-node-id> [projectPath]' },
        ],
      }
    );
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
    throw new CodeAgentError(
      'Missing query argument',
      ErrorCode.INVALID_ARGUMENT,
      {
        suggestions: [
          { message: 'Usage: code-agent context <query> [projectPath]' },
        ],
      }
    );
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
    throw new CodeAgentError(
      'Missing symbol argument',
      ErrorCode.INVALID_ARGUMENT,
      {
        suggestions: [
          { message: 'Usage: code-agent callers <symbol> [projectPath]' },
        ],
      }
    );
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
    throw new CodeAgentError(
      'Missing symbol argument',
      ErrorCode.INVALID_ARGUMENT,
      {
        suggestions: [
          { message: 'Usage: code-agent callees <symbol> [projectPath]' },
        ],
      }
    );
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
    throw new CodeAgentError(
      'Missing symbol argument',
      ErrorCode.INVALID_ARGUMENT,
      {
        suggestions: [
          { message: 'Usage: code-agent refs <symbol> [projectPath]' },
        ],
      }
    );
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
  // Parse global options
  const globalOptions = parseGlobalOptions(process.argv.slice(2));

  // Configure logger and error handling
  const logger = configureLogger(globalOptions);
  const reporter = new ErrorReporter(logger);
  setupErrorHandlers(logger, reporter, globalOptions.verbose || globalOptions.debug || false);

  const rawCommand = process.argv[2];
  const firstArg = process.argv[3];
  const projectArg = process.argv[4];
  const restArgs = process.argv.slice(3);

  if (!rawCommand) {
    await startTui([]);
    return;
  }

  if (rawCommand.startsWith('--') && rawCommand !== '--help') {
    await startTui(process.argv.slice(2));
    return;
  }

  if (rawCommand === '--help' || rawCommand === '-h') {
    console.log(usage());
    return;
  }

  if (!isCommand(rawCommand)) {
    throw new CodeAgentError(
      `Unknown command: ${rawCommand}`,
      ErrorCode.INVALID_ARGUMENT,
      {
        context: { command: rawCommand },
        suggestions: [
          { message: 'Run code-agent --help to see available commands' },
        ],
      }
    );
  }

  const command = rawCommand;

  if (command === 'run') {
    if (restArgs.includes('--help') || restArgs.includes('-h')) {
      console.log(usage());
      return;
    }
    await runAgentTask(restArgs);
    return;
  }

  if (command === 'tui') {
    if (restArgs.includes('--help') || restArgs.includes('-h')) {
      console.log(usage());
      return;
    }
    await startTui(restArgs);
    return;
  }

  if (command === 'session' || command === 'sessions') {
    if (restArgs.includes('--help') || restArgs.includes('-h')) {
      console.log(usage());
      return;
    }
    runSessionCommand(restArgs);
    return;
  }

  if (command === 'index') {
    await runIndex(firstArg, logger);
    return;
  }

  if (command === 'sync') {
    await runSync(firstArg, logger);
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
  const logger = new Logger({ colors: process.stdout.isTTY });
  const reporter = new ErrorReporter(logger);
  const verbose = process.argv.includes('--verbose') || process.argv.includes('--debug');

  reporter.report(error, verbose);
  process.exit(1);
});
