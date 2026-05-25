import { callMcpTool, mcpTools } from './tools';
import { JsonRpcRequest, JsonRpcResponse, ToolCallParams } from './protocol';
import { ensureStateDir, resolveProjectPaths } from '../project';
import { createDefaultIndexService } from '../service/default-service';
import { FileWatcher, watchDisabledReason } from '../sync';

const PROTOCOL_VERSION = '2024-11-05';

export interface McpServerOptions {
  autoSync?: boolean;
  watch?: boolean;
  debounceMs?: number;
}

interface ProjectSyncRuntime {
  sync(projectArg?: string): Promise<void>;
  stop(): void;
}

function writeResponse(response: JsonRpcResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function success(id: string | number | null | undefined, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    result,
  };
}

function failure(id: string | number | null | undefined, code: number, message: string, data?: unknown): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message,
      data,
    },
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

async function handleRequest(request: JsonRpcRequest, runtime: ProjectSyncRuntime | null): Promise<void> {
  try {
    if (request.method === 'initialize') {
      writeResponse(success(request.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'code-agent',
          version: '0.1.0',
        },
      }));
      return;
    }

    if (request.method === 'tools/list') {
      writeResponse(success(request.id, {
        tools: mcpTools,
      }));
      return;
    }

    if (request.method === 'tools/call') {
      const params = asObject(request.params) as ToolCallParams;
      if (typeof params.name !== 'string') {
        throw new Error('Missing tool name');
      }

      const result = await callMcpTool(params.name, asObject(params.arguments), {
        beforeToolCall: runtime ? (projectArg) => runtime.sync(projectArg) : undefined,
      });
      writeResponse(success(request.id, {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      }));
      return;
    }

    if (request.id !== undefined) {
      writeResponse(failure(request.id, -32601, `Method not found: ${request.method}`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeResponse(failure(request.id, -32000, message));
  }
}

function createProjectSyncRuntime(projectPath: string | undefined, options: McpServerOptions): ProjectSyncRuntime | null {
  const autoSync = options.autoSync ?? process.env.CODE_AGENT_MCP_AUTO_SYNC !== '0';
  const watch = options.watch ?? process.env.CODE_AGENT_MCP_WATCH === '1';

  if (!autoSync && !watch) {
    return null;
  }

  const services = new Map<string, ReturnType<typeof createDefaultIndexService>>();
  const watchers = new Map<string, { stop(): void }>();
  const syncing = new Map<string, Promise<void>>();

  const getService = (projectArg?: string): ReturnType<typeof createDefaultIndexService> & { root: string } => {
    const paths = resolveProjectPaths(projectArg ?? projectPath);
    ensureStateDir(paths.stateDir);
    const existing = services.get(paths.root);
    if (existing) {
      return { ...existing, root: paths.root };
    }

    const created = createDefaultIndexService(paths.dbPath);
    services.set(paths.root, created);

    if (watch) {
      const disabledReason = watchDisabledReason(paths.root);
      if (!disabledReason) {
        const watcher = new FileWatcher(paths.root, () => created.service.sync(paths.root), {
          debounceMs: options.debounceMs,
          onSyncError: (error) => {
            process.stderr.write(`[code-agent] MCP watch sync failed: ${error.message}\n`);
          },
        });
        if (watcher.start()) {
          watchers.set(paths.root, watcher);
          process.stderr.write(`[code-agent] MCP watcher started: ${paths.root}\n`);
        }
      } else {
        process.stderr.write(`[code-agent] MCP watcher disabled: ${disabledReason}\n`);
      }
    }

    return { ...created, root: paths.root };
  };

  return {
    async sync(projectArg?: string): Promise<void> {
      if (!autoSync) {
        getService(projectArg);
        return;
      }

      const item = getService(projectArg);
      const current = syncing.get(item.root);
      if (current) {
        await current;
        return;
      }

      const next = item.service.sync(item.root).then(() => undefined);
      syncing.set(item.root, next);
      try {
        await next;
      } finally {
        syncing.delete(item.root);
      }
    },
    stop(): void {
      for (const watcher of watchers.values()) {
        watcher.stop();
      }
      for (const item of services.values()) {
        item.store.close();
      }
      watchers.clear();
      services.clear();
    },
  };
}

export async function startMcpServer(projectPath?: string, options: McpServerOptions = {}): Promise<void> {
  if (projectPath) {
    process.chdir(projectPath);
  }

  const runtime = createProjectSyncRuntime(projectPath, options);

  const stop = (): void => {
    runtime?.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const request = JSON.parse(trimmed) as JsonRpcRequest;
        void handleRequest(request, runtime);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        writeResponse(failure(null, -32700, message));
      }
    }
  });
}
