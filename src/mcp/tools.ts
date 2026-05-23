import { GraphQueryService } from '../graph';
import { createStore, ensureStateDir, resolveProjectPaths } from '../project';
import { McpTool } from './protocol';

const projectPathProperty = {
  type: 'string',
  description: 'Optional project root. Defaults to the MCP server working directory.',
};

const queryProperty = {
  type: 'string',
  description: 'Symbol name, qualified name, node id, or search query.',
};

export const mcpTools: McpTool[] = [
  {
    name: 'code_agent_status',
    description: 'Show index statistics for a CodeAgent project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: projectPathProperty,
      },
    },
  },
  {
    name: 'code_agent_search',
    description: 'Search indexed symbols by name, qualified name, or signature.',
    inputSchema: {
      type: 'object',
      properties: {
        query: queryProperty,
        projectPath: projectPathProperty,
      },
      required: ['query'],
    },
  },
  {
    name: 'code_agent_node',
    description: 'Return detailed information for a symbol or node id.',
    inputSchema: {
      type: 'object',
      properties: {
        query: queryProperty,
        projectPath: projectPathProperty,
      },
      required: ['query'],
    },
  },
  {
    name: 'code_agent_callers',
    description: 'Find methods or constructors that call a symbol.',
    inputSchema: {
      type: 'object',
      properties: {
        query: queryProperty,
        projectPath: projectPathProperty,
      },
      required: ['query'],
    },
  },
  {
    name: 'code_agent_callees',
    description: 'Find symbols called by a method or constructor.',
    inputSchema: {
      type: 'object',
      properties: {
        query: queryProperty,
        projectPath: projectPathProperty,
      },
      required: ['query'],
    },
  },
  {
    name: 'code_agent_refs',
    description: 'Find references to a symbol, including calls, types, imports, returns, inheritance, and implementations.',
    inputSchema: {
      type: 'object',
      properties: {
        query: queryProperty,
        projectPath: projectPathProperty,
      },
      required: ['query'],
    },
  },
  {
    name: 'code_agent_context',
    description: 'Build a small graph context for a query using search, references, callers, callees, and related files.',
    inputSchema: {
      type: 'object',
      properties: {
        query: queryProperty,
        projectPath: projectPathProperty,
      },
      required: ['query'],
    },
  },
];

interface ToolArgs {
  query?: unknown;
  projectPath?: unknown;
}

function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing or invalid ${name}`);
  }

  return value;
}

function getProjectPath(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export function callMcpTool(name: string, args: ToolArgs = {}): unknown {
  const paths = resolveProjectPaths(getProjectPath(args.projectPath));
  ensureStateDir(paths.stateDir);
  const store = createStore(paths.dbPath);

  try {
    const graph = new GraphQueryService(store);

    if (name === 'code_agent_status') {
      return {
        projectRoot: paths.root,
        database: paths.dbPath,
        stats: store.getStats(),
      };
    }

    const query = assertString(args.query, 'query');

    if (name === 'code_agent_search') {
      return graph.searchSymbol(query);
    }

    if (name === 'code_agent_node') {
      return graph.resolveSymbol(query);
    }

    if (name === 'code_agent_callers') {
      return {
        resolved: graph.resolveSymbol(query),
        callers: graph.findCallers(query),
      };
    }

    if (name === 'code_agent_callees') {
      return {
        resolved: graph.resolveSymbol(query),
        callees: graph.findCallees(query),
      };
    }

    if (name === 'code_agent_refs') {
      return {
        resolved: graph.resolveSymbol(query),
        references: graph.findReferences(query),
      };
    }

    if (name === 'code_agent_context') {
      return graph.buildContext(query);
    }

    throw new Error(`Unknown tool: ${name}`);
  } finally {
    store.close();
  }
}
