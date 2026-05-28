import {
  AgentPermissionRuleset,
  mergeAgentPermissions,
  permissionRule,
} from './permission';
import { BUILD_SYSTEM_PROMPT, PLAN_SYSTEM_PROMPT } from './prompts';

export type AgentName = 'build' | 'plan';
export type AgentMode = 'primary';

export interface AgentInfo {
  name: AgentName;
  mode: AgentMode;
  description: string;
  systemPrompt: string;
  maxSteps: number;
  permission: AgentPermissionRuleset;
}

const DEFAULT_MAX_STEPS = 100; // 增加到 100 步，适应复杂任务

const basePermissions: AgentPermissionRuleset = [
  permissionRule('*', 'ask'),
  permissionRule('code_graph.*', 'allow'),
  permissionRule('workspace.glob', 'allow'),
  permissionRule('workspace.grep', 'allow'),
  permissionRule('workspace.read', 'allow'),
  permissionRule('workspace.git_diff', 'allow'),
  permissionRule('workspace.apply_patch', 'ask'),
  permissionRule('workspace.edit', 'ask'),
  permissionRule('workspace.write', 'ask'),
  permissionRule('workspace.shell', 'ask'),
  permissionRule('todo.write', 'allow'),
  permissionRule('task.run', 'allow'),
  permissionRule('web.fetch', 'ask'),
  permissionRule('web.search', 'ask'),
  permissionRule('browser.navigate', 'ask'),
  permissionRule('browser.content', 'allow'),
  permissionRule('browser.screenshot', 'ask'),
  permissionRule('browser.close', 'allow'),
];

export const buildAgent: AgentInfo = {
  name: 'build',
  mode: 'primary',
  description: 'Default development agent. Can read, edit, patch, and run commands subject to permissions.',
  systemPrompt: BUILD_SYSTEM_PROMPT,
  maxSteps: DEFAULT_MAX_STEPS,
  permission: mergeAgentPermissions(
    basePermissions,
    [
      // 自动允许常见操作
      permissionRule('workspace.apply_patch', 'allow'),
      permissionRule('workspace.edit', 'allow'),
      permissionRule('workspace.write', 'allow'),
      permissionRule('workspace.shell', 'allow'),
      // 仅拒绝危险命令
      permissionRule('workspace.shell', 'deny', 'rm *'),
      permissionRule('workspace.shell', 'deny', 'rm -rf *'),
      permissionRule('workspace.shell', 'deny', 'git reset --hard*'),
      permissionRule('workspace.shell', 'deny', 'git clean *'),
      permissionRule('workspace.shell', 'deny', 'git push --force*'),
      permissionRule('workspace.shell', 'deny', 'dd if=*'),
    ]
  ),
};

export const planAgent: AgentInfo = {
  name: 'plan',
  mode: 'primary',
  description: 'Read-only planning agent. Can inspect code and build an implementation plan, but cannot edit.',
  systemPrompt: PLAN_SYSTEM_PROMPT,
  maxSteps: DEFAULT_MAX_STEPS,
  permission: mergeAgentPermissions(
    basePermissions,
    [
      permissionRule('workspace.glob', 'allow'),
      permissionRule('workspace.grep', 'allow'),
      permissionRule('workspace.read', 'allow'),
      permissionRule('workspace.git_diff', 'allow'),
      permissionRule('workspace.apply_patch', 'deny'),
      permissionRule('workspace.edit', 'deny'),
      permissionRule('workspace.write', 'deny'),
      permissionRule('workspace.shell', 'deny'),
      permissionRule('task.run', 'deny'),
      permissionRule('browser.navigate', 'ask'),
      permissionRule('browser.content', 'allow'),
      permissionRule('browser.screenshot', 'ask'),
      permissionRule('browser.close', 'allow'),
    ]
  ),
};

const agents: Record<AgentName, AgentInfo> = {
  build: buildAgent,
  plan: planAgent,
};

export function listAgents(): AgentInfo[] {
  return Object.values(agents);
}

export function getAgent(name: AgentName = 'build'): AgentInfo {
  return agents[name];
}

export function resolveAgent(name: string | undefined): AgentInfo | undefined {
  if (!name) {
    return buildAgent;
  }

  return isAgentName(name) ? agents[name] : undefined;
}

export function isAgentName(value: string): value is AgentName {
  return value === 'build' || value === 'plan';
}
