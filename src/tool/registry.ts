import { GraphQueryService } from '../graph';
import { GraphAnalysisService } from '../graph/analysis';
import { GraphStore } from '../store/queries';
import {
  FileEditArgs,
  FileWriteArgs,
  editFile,
  writeFile,
} from './file-edit';
import {
  TodoItem,
  TodoWriteArgs,
  parseTodos,
} from './todo';
import {
  BrowserContentArgs,
  BrowserNavigateArgs,
  BrowserScreenshotArgs,
  WebFetchArgs,
  WebSearchArgs,
  browserContent,
  closeBrowserSession,
  browserNavigate,
  browserScreenshot,
  webFetch,
  webSearch,
} from './web';
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

export type LocalToolMode = 'core' | 'full';

export interface LocalToolRegistryInput {
  projectRoot: string;
  store: GraphStore;
  mode?: LocalToolMode;
  runTask?: LocalSubTaskRunner;
}

export interface LocalSubTaskInput {
  description: string;
  prompt: string;
  agent?: string;
  maxSteps?: number;
}

export type LocalSubTaskRunner = (input: LocalSubTaskInput) => Promise<unknown>;

export function createLocalToolRegistry(input: LocalToolRegistryInput): ToolRegistry {
  const todos: TodoItem[] = [];
  const mode = input.mode ?? 'core';

  // 默认包含所有基础工具
  const tools = [
    ...createWorkspaceTools(input.projectRoot),
    ...createFileEditTools(input.projectRoot),
    ...createCodeGraphTools(input.store),
    ...createTodoTools(todos),
    ...createTaskTools(input.runTask),
    // Web 工具可选，只在 full 模式下启用
    ...(mode === 'full' ? createWebTools(input.projectRoot) : []),
  ];

  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  return {
    ids: () => tools.map((tool) => tool.name),
    all: () => [...tools],
    get: (name) => byName.get(name),
  };
}

export function createCoreWorkspaceTools(projectRoot: string): LocalToolDefinition[] {
  return createWorkspaceTools(projectRoot).filter((tool) =>
    tool.name === 'glob' ||
    tool.name === 'grep' ||
    tool.name === 'read' ||
    tool.name === 'gitDiff'
  );
}

export function createWorkspaceTools(projectRoot: string): LocalToolDefinition[] {
  return [
    {
      name: 'glob',
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
      name: 'grep',
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
      name: 'read',
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
      name: 'applyPatch',
      permission: 'workspace.apply_patch',
      description: 'Apply a git-compatible patch inside the workspace.',
      parameters: objectSchema({
        patch: stringProperty('Unified diff patch to apply.'),
      }, ['patch']),
      pattern: () => '*',
      execute: (args) => workspaceApplyPatch(projectRoot, args as WorkspaceToolArgs),
    },
    {
      name: 'gitDiff',
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
      name: 'shell',
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

export function createFileEditTools(projectRoot: string): LocalToolDefinition[] {
  return [
    {
      name: 'edit',
      permission: 'workspace.edit',
      description: 'Replace text in an existing workspace file. PREFERRED tool for modifying files and adding content incrementally. Use a specific oldString; set replaceAll only when every occurrence should change. For large additions, use multiple edit operations instead of one large write.',
      parameters: objectSchema({
        filePath: stringProperty('Path to a file inside the project root.'),
        oldString: stringProperty('Exact text to replace.'),
        newString: stringProperty('Replacement text.'),
        replaceAll: booleanProperty('Replace every occurrence of oldString. Defaults to false.'),
      }, ['filePath', 'oldString', 'newString']),
      pattern: (args) => String(args.filePath ?? '*'),
      execute: (args) => editFile(projectRoot, args as FileEditArgs),
    },
    {
      name: 'write',
      permission: 'workspace.write',
      description: 'Write full content to a workspace file, creating parent directories when needed. IMPORTANT: Use this ONLY for NEW files. For large files (>200 lines), write a minimal skeleton first, then use edit tool to add implementation incrementally. Each write operation should be under 300 lines to avoid JSON parsing errors.',
      parameters: objectSchema({
        filePath: stringProperty('Path to a file inside the project root.'),
        content: stringProperty('Full file content to write. Keep under 300 lines when possible.'),
      }, ['filePath', 'content']),
      pattern: (args) => String(args.filePath ?? '*'),
      execute: (args) => writeFile(projectRoot, args as FileWriteArgs),
    },
  ];
}

export function createTodoTools(todos: TodoItem[]): LocalToolDefinition[] {
  return [
    {
      name: 'todowrite',
      permission: 'todo.write',
      description: 'Replace the current todo list for this agent run. Use it to track multi-step work.',
      parameters: objectSchema({
        todos: {
          type: 'array',
          description: 'The updated todo list.',
          items: objectSchema({
            content: stringProperty('Brief task description.'),
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed', 'cancelled'],
              description: 'Current status.',
            },
            priority: {
              type: 'string',
              enum: ['high', 'medium', 'low'],
              description: 'Priority.',
            },
          }, ['content', 'status', 'priority']),
        },
      }, ['todos']),
      pattern: () => '*',
      execute: async (args) => {
        const next = parseTodos(args as TodoWriteArgs);
        todos.splice(0, todos.length, ...next);
        return {
          todos: [...todos],
          active: todos.filter((todo) => todo.status !== 'completed' && todo.status !== 'cancelled').length,
        };
      },
    },
  ];
}

export function createTaskTools(runTask?: LocalSubTaskRunner): LocalToolDefinition[] {
  return [
    {
      name: 'task',
      permission: 'task.run',
      description: 'Run a focused subagent task and return its result. Use for independent investigation or planning.',
      parameters: objectSchema({
        description: stringProperty('Short 3-5 word description of the subtask.'),
        prompt: stringProperty('Detailed task for the subagent.'),
        agent: stringProperty('Optional agent to use, such as plan or build. Defaults to plan.'),
        maxSteps: numberProperty('Optional maximum subagent steps.'),
      }, ['description', 'prompt']),
      pattern: (args) => String(args.agent ?? 'plan'),
      execute: async (args) => {
        if (!runTask) {
          throw new Error('Subagent task runner is not configured');
        }
        return runTask({
          description: requireString(args.description, 'description'),
          prompt: requireString(args.prompt, 'prompt'),
          agent: typeof args.agent === 'string' ? args.agent : undefined,
          maxSteps: getLimit(args.maxSteps),
        });
      },
    },
  ];
}

export function createWebTools(projectRoot: string): LocalToolDefinition[] {
  return [
    {
      name: 'webfetch',
      permission: 'web.fetch',
      description: 'Fetch content from an HTTP or HTTPS URL and return text or HTML.',
      parameters: objectSchema({
        url: stringProperty('URL to fetch. Must start with http:// or https://.'),
        format: {
          type: 'string',
          enum: ['text', 'html'],
          description: 'Return plain text or raw HTML. Defaults to text.',
        },
        timeoutMs: numberProperty('Request timeout in milliseconds.'),
        maxBytes: numberProperty('Maximum response bytes to read.'),
      }, ['url']),
      pattern: (args) => String(args.url ?? '*'),
      execute: (args) => webFetch(args as WebFetchArgs),
    },
    {
      name: 'websearch',
      permission: 'web.search',
      description: 'Search the web with a local Chrome browser driven by Playwright and return result links and snippets.',
      parameters: objectSchema({
        query: stringProperty('Web search query.'),
        limit: numberProperty('Maximum number of results. Defaults to 8.'),
        engine: {
          type: 'string',
          enum: ['google', 'duckduckgo', 'bing'],
          description: 'Search engine to use. Defaults to duckduckgo.',
        },
        headless: booleanProperty('Run Chrome headlessly. Defaults to true.'),
        timeoutMs: numberProperty('Browser navigation timeout in milliseconds.'),
      }, ['query']),
      pattern: (args) => String(args.query ?? '*'),
      execute: (args) => webSearch(args as WebSearchArgs),
    },
    {
      name: 'browserNavigate',
      permission: 'browser.navigate',
      description: 'Navigate the local Chrome browser to a URL using Playwright.',
      parameters: objectSchema({
        url: stringProperty('URL to navigate to. Must start with http:// or https://.'),
        waitUntil: {
          type: 'string',
          enum: ['load', 'domcontentloaded', 'networkidle', 'commit'],
          description: 'Navigation wait condition. Defaults to domcontentloaded.',
        },
        headless: booleanProperty('Run Chrome headlessly. Defaults to true.'),
        timeoutMs: numberProperty('Navigation timeout in milliseconds.'),
      }, ['url']),
      pattern: (args) => String(args.url ?? '*'),
      execute: (args) => browserNavigate(args as BrowserNavigateArgs),
    },
    {
      name: 'browserContent',
      permission: 'browser.content',
      description: 'Get text or HTML from the current local Chrome browser page.',
      parameters: objectSchema({
        format: {
          type: 'string',
          enum: ['text', 'html'],
          description: 'Return plain text or raw HTML. Defaults to text.',
        },
        maxBytes: numberProperty('Maximum bytes to return.'),
      }),
      pattern: () => '*',
      execute: (args) => browserContent(args as BrowserContentArgs),
    },
    {
      name: 'browserScreenshot',
      permission: 'browser.screenshot',
      description: 'Take a screenshot of the current local Chrome browser page and save it under the project.',
      parameters: objectSchema({
        filePath: stringProperty('Optional output path inside the project. Defaults to .code-agent/screenshots/*.png.'),
        fullPage: booleanProperty('Capture the full scrollable page. Defaults to false.'),
      }),
      pattern: (args) => String(args.filePath ?? '*'),
      execute: (args) => browserScreenshot(projectRoot, args as BrowserScreenshotArgs),
    },
    {
      name: 'browserClose',
      permission: 'browser.close',
      description: 'Close the local Chrome browser session used by browser tools.',
      parameters: objectSchema({}),
      pattern: () => '*',
      execute: async () => closeBrowserSession(),
    },
  ];
}

export function createCodeGraphTools(store: GraphStore): LocalToolDefinition[] {
  const graph = new GraphQueryService(store);
  const analysis = new GraphAnalysisService(store);

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
    {
      name: 'codeGraphDependencies',
      permission: 'code_graph.dependencies',
      description: 'Analyze cross-file dependencies and file-level circular dependencies.',
      parameters: objectSchema({}),
      pattern: () => '*',
      execute: async () => ({
        dependencies: analysis.analyzeDependencies(),
        cycles: analysis.findCircularDependencies(),
      }),
    },
    {
      name: 'codeGraphImpact',
      permission: 'code_graph.impact',
      description: 'Analyze files and symbols that may be impacted by changing a symbol.',
      parameters: querySchema(),
      pattern: queryPattern,
      execute: async (args) => analysis.analyzeImpact(requireString(args.query, 'query')),
    },
    {
      name: 'codeGraphDeadCode',
      permission: 'code_graph.dead_code',
      description: 'Find likely dead code candidates with no incoming usage edges.',
      parameters: objectSchema({}),
      pattern: () => '*',
      execute: async () => analysis.findDeadCode(),
    },
    {
      name: 'codeGraphComplexity',
      permission: 'code_graph.complexity',
      description: 'Rank symbols by estimated complexity using size, fan-in, and fan-out.',
      parameters: objectSchema({
        limit: numberProperty('Maximum number of complexity rows to return.'),
      }),
      pattern: () => '*',
      execute: async (args) => analysis.analyzeComplexity({ limit: getLimit(args.limit) }),
    },
    {
      name: 'codeGraphMetrics',
      permission: 'code_graph.metrics',
      description: 'Calculate graph-level code metrics including dependency, coupling, and dead-code counts.',
      parameters: objectSchema({}),
      pattern: () => '*',
      execute: async () => analysis.calculateMetrics(),
    },
    {
      name: 'codeGraphArchitecture',
      permission: 'code_graph.architecture',
      description: 'Render an architecture dependency graph in Mermaid format.',
      parameters: objectSchema({
        limit: numberProperty('Maximum number of dependency edges to render.'),
      }),
      pattern: () => '*',
      execute: async (args) => analysis.renderArchitectureMermaid(getLimit(args.limit)),
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
