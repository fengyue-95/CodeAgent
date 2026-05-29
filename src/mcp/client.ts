import { spawn, ChildProcess } from 'child_process';
import { McpServerConfig } from './config';
import { JsonRpcRequest, JsonRpcResponse, McpTool } from './protocol';

export interface McpClientOptions {
  onError?: (error: Error) => void;
  onClose?: () => void;
}

export class McpClient {
  private process?: ChildProcess;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private buffer = '';
  private connected = false;
  private options: McpClientOptions;

  constructor(options: McpClientOptions = {}) {
    this.options = options;
  }

  async connect(config: McpServerConfig): Promise<void> {
    if (this.connected) {
      throw new Error('Client already connected');
    }

    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(config.command, config.args, {
          env: { ...process.env, ...config.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.process.on('error', (error) => {
          this.options.onError?.(error);
          reject(error);
        });

        this.process.on('close', () => {
          this.connected = false;
          this.options.onClose?.();
        });

        if (!this.process.stdout || !this.process.stdin) {
          throw new Error('Failed to create stdio streams');
        }

        this.process.stdout.setEncoding('utf-8');
        this.process.stdout.on('data', (chunk: string) => {
          this.handleData(chunk);
        });

        this.process.stderr?.on('data', (chunk: Buffer) => {
          // Log stderr for debugging
          const message = chunk.toString('utf-8');
          if (message.trim()) {
            console.error(`[MCP stderr] ${message}`);
          }
        });

        // Initialize connection
        this.sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'code-agent',
            version: '0.1.0',
          },
        })
          .then(() => {
            this.connected = true;
            resolve();
          })
          .catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const response = JSON.parse(trimmed) as JsonRpcResponse;
        this.handleResponse(response);
      } catch (error) {
        console.error(`Failed to parse MCP response: ${error}`);
      }
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    if (response.id === null || response.id === undefined) {
      return; // Notification, ignore
    }

    const pending = this.pendingRequests.get(Number(response.id));
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(Number(response.id));

    if ('error' in response && response.error) {
      pending.reject(new Error(response.error.message));
    } else if ('result' in response) {
      pending.resolve(response.result);
    } else {
      pending.reject(new Error('Invalid response'));
    }
  }

  private sendRequest(method: string, params?: unknown): Promise<unknown> {
    if (!this.process?.stdin) {
      return Promise.reject(new Error('Client not connected'));
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const line = JSON.stringify(request) + '\n';
      this.process!.stdin!.write(line, (error) => {
        if (error) {
          this.pendingRequests.delete(id);
          reject(error);
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  async listTools(): Promise<McpTool[]> {
    const response = await this.sendRequest('tools/list') as { tools: McpTool[] };
    return response.tools ?? [];
  }

  async callTool(name: string, args: unknown): Promise<unknown> {
    const response = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    }) as { content: Array<{ type: string; text: string }> };

    // Extract text from content array
    if (response.content && Array.isArray(response.content)) {
      const textContent = response.content
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join('\n');

      try {
        return JSON.parse(textContent);
      } catch {
        return textContent;
      }
    }

    return response;
  }

  async disconnect(): Promise<void> {
    if (!this.connected || !this.process) {
      return;
    }

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      pending.reject(new Error('Client disconnected'));
      this.pendingRequests.delete(id);
    }

    return new Promise((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      this.process.once('close', () => {
        this.connected = false;
        this.process = undefined;
        resolve();
      });

      this.process.kill();

      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    });
  }

  isConnected(): boolean {
    return this.connected;
  }
}
