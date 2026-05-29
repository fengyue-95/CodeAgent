import { McpClient } from './client';
import { McpServerConfig, loadMcpConfig, McpConfig } from './config';
import { adaptMcpTools } from './tool-adapter';
import { LocalToolDefinition } from '../tool';

export type PluginStatus = 'stopped' | 'starting' | 'running' | 'error';

export interface McpPluginInfo {
  name: string;
  config: McpServerConfig;
  client?: McpClient;
  tools: LocalToolDefinition[];
  status: PluginStatus;
  error?: string;
}

export interface McpPluginManagerOptions {
  onPluginStatusChange?: (name: string, status: PluginStatus) => void;
  onPluginError?: (name: string, error: Error) => void;
}

export class McpPluginManager {
  private plugins = new Map<string, McpPluginInfo>();
  private options: McpPluginManagerOptions;

  constructor(options: McpPluginManagerOptions = {}) {
    this.options = options;
  }

  /**
   * 加载配置文件中启用的所有 MCP 服务
   */
  async loadEnabledPlugins(config?: McpConfig): Promise<void> {
    const mcpConfig = config ?? loadMcpConfig();

    const startPromises: Promise<void>[] = [];

    for (const [name, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
      if (serverConfig.enabled) {
        startPromises.push(
          this.startPlugin(name, serverConfig).catch((error) => {
            console.error(`Failed to start MCP plugin ${name}:`, error);
          })
        );
      } else {
        // 注册但不启动
        this.plugins.set(name, {
          name,
          config: serverConfig,
          tools: [],
          status: 'stopped',
        });
      }
    }

    await Promise.all(startPromises);
  }

  /**
   * 启动单个 MCP 服务
   */
  async startPlugin(name: string, config?: McpServerConfig): Promise<void> {
    const existing = this.plugins.get(name);

    if (existing?.status === 'running') {
      console.log(`MCP plugin ${name} is already running`);
      return;
    }

    const serverConfig = config ?? existing?.config;
    if (!serverConfig) {
      throw new Error(`MCP server config not found: ${name}`);
    }

    const pluginInfo: McpPluginInfo = {
      name,
      config: serverConfig,
      tools: [],
      status: 'starting',
    };

    this.plugins.set(name, pluginInfo);
    this.notifyStatusChange(name, 'starting');

    try {
      const client = new McpClient({
        onError: (error) => {
          this.handlePluginError(name, error);
        },
        onClose: () => {
          this.handlePluginClose(name);
        },
      });

      await client.connect(serverConfig);

      const mcpTools = await client.listTools();
      const tools = adaptMcpTools(mcpTools, client, name);

      pluginInfo.client = client;
      pluginInfo.tools = tools;
      pluginInfo.status = 'running';
      pluginInfo.error = undefined;

      this.notifyStatusChange(name, 'running');

      console.log(`MCP plugin ${name} started with ${tools.length} tools`);
    } catch (error) {
      pluginInfo.status = 'error';
      pluginInfo.error = error instanceof Error ? error.message : String(error);
      this.notifyStatusChange(name, 'error');
      this.options.onPluginError?.(name, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * 停止单个 MCP 服务
   */
  async stopPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);

    if (!plugin) {
      throw new Error(`MCP plugin not found: ${name}`);
    }

    if (plugin.status === 'stopped') {
      return;
    }

    if (plugin.client) {
      await plugin.client.disconnect();
    }

    plugin.client = undefined;
    plugin.tools = [];
    plugin.status = 'stopped';
    plugin.error = undefined;

    this.notifyStatusChange(name, 'stopped');

    console.log(`MCP plugin ${name} stopped`);
  }

  /**
   * 重启单个 MCP 服务
   */
  async restartPlugin(name: string): Promise<void> {
    await this.stopPlugin(name);
    await this.startPlugin(name);
  }

  /**
   * 获取所有已加载的工具
   */
  getAllTools(): LocalToolDefinition[] {
    const tools: LocalToolDefinition[] = [];

    for (const plugin of this.plugins.values()) {
      if (plugin.status === 'running') {
        tools.push(...plugin.tools);
      }
    }

    return tools;
  }

  /**
   * 获取插件信息
   */
  getPlugin(name: string): McpPluginInfo | undefined {
    return this.plugins.get(name);
  }

  /**
   * 获取所有插件信息
   */
  getAllPlugins(): McpPluginInfo[] {
    return Array.from(this.plugins.values());
  }

  /**
   * 热重载配置
   */
  async reload(): Promise<void> {
    const config = loadMcpConfig();
    const configuredPlugins = new Set(Object.keys(config.mcpServers));

    // 停止不再配置的插件
    for (const [name, plugin] of this.plugins.entries()) {
      if (!configuredPlugins.has(name)) {
        await this.stopPlugin(name);
        this.plugins.delete(name);
      }
    }

    // 更新或启动插件
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      const existing = this.plugins.get(name);

      if (serverConfig.enabled) {
        if (!existing || existing.status !== 'running') {
          await this.startPlugin(name, serverConfig);
        }
      } else {
        if (existing && existing.status === 'running') {
          await this.stopPlugin(name);
        }
      }
    }
  }

  /**
   * 停止所有插件
   */
  async stopAll(): Promise<void> {
    const stopPromises: Promise<void>[] = [];

    for (const name of this.plugins.keys()) {
      stopPromises.push(this.stopPlugin(name).catch((error) => {
        console.error(`Failed to stop MCP plugin ${name}:`, error);
      }));
    }

    await Promise.all(stopPromises);
  }

  private handlePluginError(name: string, error: Error): void {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.status = 'error';
      plugin.error = error.message;
      this.notifyStatusChange(name, 'error');
    }
    this.options.onPluginError?.(name, error);
  }

  private handlePluginClose(name: string): void {
    const plugin = this.plugins.get(name);
    if (plugin && plugin.status === 'running') {
      plugin.status = 'stopped';
      plugin.tools = [];
      this.notifyStatusChange(name, 'stopped');
    }
  }

  private notifyStatusChange(name: string, status: PluginStatus): void {
    this.options.onPluginStatusChange?.(name, status);
  }
}
