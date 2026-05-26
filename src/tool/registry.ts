import { GraphQueryService } from '../graph';
import { GraphStore } from '../store/queries';
import {
  WorkspaceToolArgs,
  workspaceApplyPatch,
  workspaceGitDiff,
  workspaceGlob,
  workspaceGrep,
  workspaceReadFile,
  workspaceShellExec,
} from './workspace';

export interface LocalToolDefinition {
  name: string;
  permission: string;
  description: string;
  parameters: Record<string, unknown>;
  pattern(args: Record<string, unknown>): string;
  execute(args: Record<string, unknown>): Promise<unknown>;
}

export interface ToolRegistry {
  ids(): string[];
  all(): LocalToolDefinition[];
  get(name: string): LocalToolDefinition | undefined;
}

export interface LocalToolRegistryInput {
  projectRoot: string;
  store: GraphStore;
}

export function createLocalToolRegistry(input: LocalToolRegistryInput): ToolRegistry {
  const tools = [
    ...createWorkspaceTools(input.projectRoot),
    ...createCodeGraphTools(input.store),
  ];
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  return {
    ids: () => tools.map((tool) => tool.name),
    all: () => [...tools],
    get: (name) => byName.get(name),
  };
}

export function createWorkspaceTools(projectRoot: string): LocalToolDefinition[] {
  return [
    {
      name: 'workspaceGlob',
      permission: 'workspace.glob',
      description: 'List workspace files matching a glob pattern.',
      parameters: objectSchema({
        pattern: stringProperty('Glob pattern to match, for example "src/**/*.ts".'),
        cwd: stringProperty('Optional working directory inside the project root.'),
        limit: numberProperty('Maximum number of files to return.'),
      }, ['pattern']),
      pattern: (args) => String(args.pattern ?? '*'),
      execute: (args) => workspaceGlob(projectRoot, args as WorkspaceToolArgs),
    },
    {
      name: 'workspaceGrep',
      permission: 'workspace.grep',
      description: 'Search workspace file contents with ripgrep.',
      parameters: objectSchema({
        pattern: stringProperty('Text or regex pattern to search for.'),
        glob: stringProperty('Optional file glob to restrict the search.'),
        cwd: stringProperty('Optional working directory inside the project root.'),
        ignoreCase: booleanProperty('Whether to search case-insensitively.'),
        regex: booleanProperty('Whether pattern should be treated as a regex. Defaults to true.'),
        limit: numberProperty('Maximum number of matches to return.'),
        maxBuffer: numberProperty('Maximum bytes of command output to collect.'),
        timeoutMs: numberProperty('Command timeout in milliseconds.'),
      }, ['pattern']),
      pattern: (args) => String(args.pattern ?? '*'),
      execute: (args) => workspaceGrep(projectRoot, args as WorkspaceToolArgs),
    },
    {
      name: 'workspaceReadFile',
      permission: 'workspace.read',
      description: 'Read a workspace file, optionally constrained to a line range.',
      parameters: objectSchema({
        filePath: stringProperty('Path to a file inside the project root.'),
        startLine: numberProperty('One-based first line to read.'),
        endLine: numberProperty('One-based last line to read.'),
        maxBytes: numberProperty('Maximum bytes of file text to return.'),
      }, ['filePath']),
      pattern: (args) => String(args.filePath ?? '*'),
      execute: (args) => workspaceReadFile(projectRoot, args as WorkspaceToolArgs),
    },
    {
      name: 'workspaceApplyPatch',
      permission: 'workspace.apply_patch',
      description: 'Apply a git-compatible patch inside the workspace.',
      parameters: objectSchema({
        patch: stringProperty('Unified diff patch to apply.'),
      }, ['patch']),
      pattern: () => '*',
      execute: (args) => workspaceApplyPatch(projectRoot, args as WorkspaceToolArgs),
    },
    {
      name: 'workspaceGitDiff',
      permission: 'workspace.git_diff',
      description: 'Show the current workspace git diff, optionally for one file.',
      parameters: objectSchema({
        filePath: stringProperty('Optional file path inside the project root.'),
        maxBuffer: numberProperty('Maximum bytes of diff output to collect.'),
        timeoutMs: numberProperty('Command timeout in milliseconds.'),
      }),
      pattern: (args) => String(args.filePath ?? '*'),
      execute: (args) => workspaceGitDiff(projectRoot, args as WorkspaceToolArgs),
    },
    {
      name: 'workspaceShellExec',
      permission: 'workspace.shell',
      description: 'Run a shell command inside the workspace.',
      parameters: objectSchema({
        command: stringProperty('Shell command to run.'),
        cwd: stringProperty('Optional working directory inside the project root.'),
        maxBuffer: numberProperty('Maximum bytes of command output to collect.'),
        timeoutMs: numberProperty('Command timeout in milliseconds.'),
      }, ['command']),
      pattern: (args) => String(args.command ?? '*'),
      execute: (args) => workspaceShellExec(projectRoot, args as WorkspaceToolArgs),
    },
  ];
}

export function createCodeGraphTools(store: GraphStore): LocalToolDefinition[] {
  const graph = new GraphQueryService(store);

  return [
    {
      name: 'codeGraphSearch',
      permission: 'code_graph.search',
      description: 'Search indexed symbols by name, qualified name, or signature.',
      parameters: querySchema(),
      pattern: queryPattern,
      execute: async (args) => graph.searchSymbol(requireString(args.query, 'query'), getLimit(args.limit)),
    },
    {
      name: 'codeGraphNode',
      permission: 'code_graph.node',
      description: 'Resolve a symbol name, qualified name, node id, or fuzzy query to matching code nodes.',
      parameters: querySchema(),
      pattern: queryPattern,
      execute: async (args) => graph.resolveSymbol(requireString(args.query, 'query')),
    },
    {
      name: 'codeGraphCallers',
      permission: 'code_graph.callers',
      description: 'Find methods or constructors that call a symbol.',
      parameters: querySchema(),
      pattern: queryPattern,
      execute: async (args) => ({
        resolved: graph.resolveSymbol(requireString(args.query, 'query')),
        callers: graph.findCallers(requireString(args.query, 'query')),
      }),
    },
    {
      name: 'codeGraphCallees',
      permission: 'code_graph.callees',
      description: 'Find symbols called by a method or constructor.',
      parameters: querySchema(),
      pattern: queryPattern,
      execute: async (args) => ({
        resolved: graph.resolveSymbol(requireString(args.query, 'query')),
        callees: graph.findCallees(requireString(args.query, 'query')),
      }),
    },
    {
      name: 'codeGraphRefs',
      permission: 'code_graph.refs',
      description: 'Find references to a symbol, including calls, types, imports, returns, inheritance, and implementations.',
      parameters: querySchema(),
      pattern: queryPattern,
      execute: async (args) => ({
        resolved: graph.resolveSymbol(requireString(args.query, 'query')),
        references: graph.findReferences(requireString(args.query, 'query')),
      }),
    },
    {
      name: 'codeGraphContext',
      permission: 'code_graph.context',
      description: 'Build a focused graph context for a query using search, references, callers, callees, and related files.',
      parameters: querySchema(),
      pattern: queryPattern,
      execute: async (args) => graph.buildContext(requireString(args.query, 'query')),
    },
    {
      name: 'codeGraphStatus',
      permission: 'code_graph.status',
      description: 'Show code graph index statistics.',
      parameters: objectSchema({}),
      pattern: () => '*',
      execute: async () => store.getStats(),
    },
  ];
}

function querySchema(): Record<string, unknown> {
  return objectSchema({
    query: stringProperty('Symbol name, qualified name, node id, or search query.'),
    limit: numberProperty('Maximum number of search results when supported.'),
  }, ['query']);
}

function queryPattern(args: Record<string, unknown>): string {
  return String(args.query ?? '*');
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required argument: ${name}`);
  }

  return value;
}

function getLimit(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid limit: ${String(value)}`);
  }

  return parsed;
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

function stringProperty(description: string): Record<string, unknown> {
  return {
    type: 'string',
    description,
  };
}

function numberProperty(description: string): Record<string, unknown> {
  return {
    type: 'number',
    description,
  };
}

function booleanProperty(description: string): Record<string, unknown> {
  return {
    type: 'boolean',
    description,
  };
}
