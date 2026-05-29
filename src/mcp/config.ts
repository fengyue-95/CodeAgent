import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

const DEFAULT_CONFIG: McpConfig = {
  mcpServers: {
    // 示例配置
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
      enabled: false,
    },
  },
};

export function getConfigPath(): string {
  const configDir = join(homedir(), '.code-agent');
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  return join(configDir, 'mcp-config.json');
}

export function loadMcpConfig(): McpConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    // 创建默认配置
    saveMcpConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content) as McpConfig;

    // 环境变量替换
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      if (serverConfig.env) {
        for (const [key, value] of Object.entries(serverConfig.env)) {
          if (value.startsWith('${') && value.endsWith('}')) {
            const envVar = value.slice(2, -1);
            serverConfig.env[key] = process.env[envVar] ?? '';
          }
        }
      }
    }

    return config;
  } catch (error) {
    console.error(`Failed to load MCP config: ${error}`);
    return DEFAULT_CONFIG;
  }
}

export function saveMcpConfig(config: McpConfig): void {
  const configPath = getConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function updateServerConfig(name: string, config: Partial<McpServerConfig>): void {
  const mcpConfig = loadMcpConfig();

  if (!mcpConfig.mcpServers[name]) {
    throw new Error(`MCP server not found: ${name}`);
  }

  mcpConfig.mcpServers[name] = {
    ...mcpConfig.mcpServers[name],
    ...config,
  };

  saveMcpConfig(mcpConfig);
}

export function enableServer(name: string): void {
  updateServerConfig(name, { enabled: true });
}

export function disableServer(name: string): void {
  updateServerConfig(name, { enabled: false });
}

export function addServer(name: string, config: McpServerConfig): void {
  const mcpConfig = loadMcpConfig();
  mcpConfig.mcpServers[name] = config;
  saveMcpConfig(mcpConfig);
}

export function removeServer(name: string): void {
  const mcpConfig = loadMcpConfig();
  delete mcpConfig.mcpServers[name];
  saveMcpConfig(mcpConfig);
}
