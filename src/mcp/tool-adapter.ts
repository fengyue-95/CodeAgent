import { McpClient } from './client';
import { McpTool } from './protocol';
import { LocalToolDefinition } from '../tool';

/**
 * 将 MCP 工具转换为 LocalToolDefinition
 */
export function adaptMcpTool(
  mcpTool: McpTool,
  client: McpClient,
  pluginName: string
): LocalToolDefinition {
  return {
    name: `${pluginName}.${mcpTool.name}`,
    permission: `mcp.${pluginName}.${mcpTool.name}`,
    description: `[MCP:${pluginName}] ${mcpTool.description}`,
    parameters: mcpTool.inputSchema,
    pattern: (args) => {
      // 尝试从参数中提取有意义的模式
      if (typeof args === 'object' && args !== null) {
        const obj = args as Record<string, unknown>;
        // 常见的路径/查询参数
        const pathLike = obj.path ?? obj.filePath ?? obj.query ?? obj.name;
        if (typeof pathLike === 'string') {
          return pathLike;
        }
      }
      return '*';
    },
    execute: async (args) => {
      try {
        const result = await client.callTool(mcpTool.name, args);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`MCP tool ${pluginName}.${mcpTool.name} failed: ${message}`);
      }
    },
  };
}

/**
 * 批量转换 MCP 工具
 */
export function adaptMcpTools(
  mcpTools: McpTool[],
  client: McpClient,
  pluginName: string
): LocalToolDefinition[] {
  return mcpTools.map((tool) => adaptMcpTool(tool, client, pluginName));
}
