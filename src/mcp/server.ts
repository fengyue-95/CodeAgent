import { callMcpTool, mcpTools } from './tools';
import { JsonRpcRequest, JsonRpcResponse, ToolCallParams } from './protocol';

const PROTOCOL_VERSION = '2024-11-05';

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

async function handleRequest(request: JsonRpcRequest): Promise<void> {
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

      const result = callMcpTool(params.name, asObject(params.arguments));
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

export async function startMcpServer(projectPath?: string): Promise<void> {
  if (projectPath) {
    process.chdir(projectPath);
  }

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
        void handleRequest(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        writeResponse(failure(null, -32700, message));
      }
    }
  });
}
