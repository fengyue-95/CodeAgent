import {
  AgentPermissionRuleset,
  mergeAgentPermissions,
  permissionRule,
} from './permission';
import {
  BUILD_SYSTEM_PROMPT,
  PLAN_SYSTEM_PROMPT,
  GENERAL_SYSTEM_PROMPT,
  EXPLORE_SYSTEM_PROMPT,
  SCOUT_SYSTEM_PROMPT,
  REVIEW_SYSTEM_PROMPT,
  REFACTOR_SYSTEM_PROMPT,
  TEST_SYSTEM_PROMPT,
  DOC_SYSTEM_PROMPT,
  DEBUG_SYSTEM_PROMPT,
} from './prompts';

export type AgentName = 'build' | 'plan' | 'general' | 'explore' | 'scout' | 'review' | 'refactor' | 'test' | 'doc' | 'debug';
export type AgentMode = 'primary' | 'subagent';

export interface AgentInfo {
  name: AgentName;
  mode: AgentMode;
  description: string;
  systemPrompt: string;
  maxSteps: number;
  permission: AgentPermissionRuleset;
}

const DEFAULT_MAX_STEPS = 200; // Longer default for complex tasks

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
  // MCP 工具权限
  permissionRule('mcp.*', 'ask'),
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

export const generalAgent: AgentInfo = {
  name: 'general',
  mode: 'subagent',
  description: 'Versatile agent for complex, multi-step tasks. Full access to all tools including read, write, shell, and web.',
  systemPrompt: GENERAL_SYSTEM_PROMPT,
  maxSteps: DEFAULT_MAX_STEPS,
  permission: mergeAgentPermissions(
    basePermissions,
    [
      // Full access to workspace operations
      permissionRule('workspace.apply_patch', 'allow'),
      permissionRule('workspace.edit', 'allow'),
      permissionRule('workspace.write', 'allow'),
      permissionRule('workspace.shell', 'allow'),
      // Allow web access for research
      permissionRule('web.fetch', 'allow'),
      permissionRule('web.search', 'allow'),
      permissionRule('browser.navigate', 'allow'),
      permissionRule('browser.screenshot', 'allow'),
      // Deny only dangerous operations
      permissionRule('workspace.shell', 'deny', 'rm *'),
      permissionRule('workspace.shell', 'deny', 'rm -rf *'),
      permissionRule('workspace.shell', 'deny', 'git reset --hard*'),
      permissionRule('workspace.shell', 'deny', 'git clean *'),
      permissionRule('workspace.shell', 'deny', 'git push --force*'),
      permissionRule('workspace.shell', 'deny', 'dd if=*'),
    ]
  ),
};

export const exploreAgent: AgentInfo = {
  name: 'explore',
  mode: 'subagent',
  description: 'Fast codebase exploration agent. Read-only access optimized for understanding code structure and relationships.',
  systemPrompt: EXPLORE_SYSTEM_PROMPT,
  maxSteps: DEFAULT_MAX_STEPS,
  permission: mergeAgentPermissions(
    basePermissions,
    [
      // Read-only workspace access
      permissionRule('workspace.glob', 'allow'),
      permissionRule('workspace.grep', 'allow'),
      permissionRule('workspace.read', 'allow'),
      permissionRule('workspace.git_diff', 'allow'),
      // Deny all modifications
      permissionRule('workspace.apply_patch', 'deny'),
      permissionRule('workspace.edit', 'deny'),
      permissionRule('workspace.write', 'deny'),
      permissionRule('workspace.shell', 'deny'),
      permissionRule('task.run', 'deny'),
      // Deny web access (focus on local codebase)
      permissionRule('web.fetch', 'deny'),
      permissionRule('web.search', 'deny'),
      permissionRule('browser.navigate', 'deny'),
      permissionRule('browser.screenshot', 'deny'),
    ]
  ),
};

export const scoutAgent: AgentInfo = {
  name: 'scout',
  mode: 'subagent',
  description: 'External documentation and dependency research agent. Read-only with web access for gathering external information.',
  systemPrompt: SCOUT_SYSTEM_PROMPT,
  maxSteps: DEFAULT_MAX_STEPS,
  permission: mergeAgentPermissions(
    basePermissions,
    [
      // Read-only workspace access
      permissionRule('workspace.glob', 'allow'),
      permissionRule('workspace.grep', 'allow'),
      permissionRule('workspace.read', 'allow'),
      permissionRule('workspace.git_diff', 'allow'),
      // Deny all modifications
      permissionRule('workspace.apply_patch', 'deny'),
      permissionRule('workspace.edit', 'deny'),
      permissionRule('workspace.write', 'deny'),
      permissionRule('workspace.shell', 'deny'),
      permissionRule('task.run', 'deny'),
      // Allow web access for research
      permissionRule('web.fetch', 'allow'),
      permissionRule('web.search', 'allow'),
      permissionRule('browser.navigate', 'allow'),
      permissionRule('browser.screenshot', 'allow'),
    ]
  ),
};

export const reviewAgent: AgentInfo = {
  name: 'review',
  mode: 'subagent',
  description: 'Code review specialist. Analyzes code quality, security vulnerabilities, performance issues, and architectural problems. Read-only for files, with diagnostic shell and subtask support.',
  systemPrompt: REVIEW_SYSTEM_PROMPT,
  maxSteps: DEFAULT_MAX_STEPS,
  permission: mergeAgentPermissions(
    basePermissions,
    [
      // Read-only workspace access
      permissionRule('workspace.glob', 'allow'),
      permissionRule('workspace.grep', 'allow'),
      permissionRule('workspace.read', 'allow'),
      permissionRule('workspace.git_diff', 'allow'),
      // Code graph analysis (full access)
      permissionRule('code_graph.*', 'allow'),
      // Deny all modifications
      permissionRule('workspace.apply_patch', 'deny'),
      permissionRule('workspace.edit', 'deny'),
      permissionRule('workspace.write', 'deny'),
      // Diagnostic commands are allowed with confirmation; file changes remain denied.
      permissionRule('workspace.shell', 'ask'),
      permissionRule('task.run', 'allow'),
      permissionRule('workspace.shell', 'deny', 'rm *'),
      permissionRule('workspace.shell', 'deny', 'rm -rf *'),
      permissionRule('workspace.shell', 'deny', 'git reset --hard*'),
      permissionRule('workspace.shell', 'deny', 'git clean *'),
      permissionRule('workspace.shell', 'deny', 'git push --force*'),
      permissionRule('workspace.shell', 'deny', 'dd if=*'),
      // Optional web access for security research
      permissionRule('web.fetch', 'ask'),
      permissionRule('web.search', 'ask'),
      permissionRule('browser.navigate', 'ask'),
      permissionRule('browser.screenshot', 'deny'),
      permissionRule('browser.close', 'allow'),
    ]
  ),
};

export const refactorAgent: AgentInfo = {
  name: 'refactor',
  mode: 'subagent',
  description: 'Safe refactoring specialist. Performs intelligent, incremental refactoring with comprehensive impact analysis. Always analyzes before modifying.',
  systemPrompt: REFACTOR_SYSTEM_PROMPT,
  maxSteps: DEFAULT_MAX_STEPS,
  permission: mergeAgentPermissions(
    basePermissions,
    [
      // Read-only workspace access
      permissionRule('workspace.glob', 'allow'),
      permissionRule('workspace.grep', 'allow'),
      permissionRule('workspace.read', 'allow'),
      permissionRule('workspace.git_diff', 'allow'),
      // Code graph analysis (full access)
      permissionRule('code_graph.*', 'allow'),
      // Modifications require confirmation
      permissionRule('workspace.edit', 'ask'),
      permissionRule('workspace.write', 'ask'),
      permissionRule('workspace.apply_patch', 'ask'),
      // Shell for running tests (with confirmation)
      permissionRule('workspace.shell', 'ask'),
      // Deny dangerous operations
      permissionRule('workspace.shell', 'deny', 'rm *'),
      permissionRule('workspace.shell', 'deny', 'rm -rf *'),
      permissionRule('workspace.shell', 'deny', 'git reset --hard*'),
      permissionRule('workspace.shell', 'deny', 'git clean *'),
      permissionRule('workspace.shell', 'deny', 'git push --force*'),
      permissionRule('workspace.shell', 'deny', 'dd if=*'),
      // Optional web access
      permissionRule('web.fetch', 'ask'),
      permissionRule('web.search', 'ask'),
      permissionRule('browser.navigate', 'deny'),
      permissionRule('browser.screenshot', 'deny'),
    ]
  ),
};

export const testAgent: AgentInfo = {
  name: 'test',
  mode: 'subagent',
  description: 'Test generation specialist. Analyzes code and generates comprehensive test cases with high coverage. Supports unit tests, integration tests, and edge cases.',
  systemPrompt: TEST_SYSTEM_PROMPT,
  maxSteps: DEFAULT_MAX_STEPS,
  permission: mergeAgentPermissions(
    basePermissions,
    [
      // Read-only workspace access
      permissionRule('workspace.glob', 'allow'),
      permissionRule('workspace.grep', 'allow'),
      permissionRule('workspace.read', 'allow'),
      permissionRule('workspace.git_diff', 'allow'),
      // Code graph analysis (full access)
      permissionRule('code_graph.*', 'allow'),
      // Can write test files
      permissionRule('workspace.edit', 'allow'),
      permissionRule('workspace.write', 'allow'),
      permissionRule('workspace.apply_patch', 'allow'),
      // Shell for running tests (with confirmation)
      permissionRule('workspace.shell', 'ask'),
      // Deny dangerous operations
      permissionRule('workspace.shell', 'deny', 'rm *'),
      permissionRule('workspace.shell', 'deny', 'rm -rf *'),
      permissionRule('workspace.shell', 'deny', 'git reset --hard*'),
      permissionRule('workspace.shell', 'deny', 'git clean *'),
      permissionRule('workspace.shell', 'deny', 'git push --force*'),
      permissionRule('workspace.shell', 'deny', 'dd if=*'),
      // Optional web access for testing best practices
      permissionRule('web.fetch', 'ask'),
      permissionRule('web.search', 'ask'),
      permissionRule('browser.navigate', 'deny'),
      permissionRule('browser.screenshot', 'deny'),
    ]
  ),
};

export const docAgent: AgentInfo = {
  name: 'doc',
  mode: 'subagent',
  description: 'Documentation specialist. Generates API docs, README files, architecture documentation, and code comments. Keeps docs in sync with code.',
  systemPrompt: DOC_SYSTEM_PROMPT,
  maxSteps: DEFAULT_MAX_STEPS,
  permission: mergeAgentPermissions(
    basePermissions,
    [
      // Read-only workspace access
      permissionRule('workspace.glob', 'allow'),
      permissionRule('workspace.grep', 'allow'),
      permissionRule('workspace.read', 'allow'),
      permissionRule('workspace.git_diff', 'allow'),
      // Code graph analysis (full access)
      permissionRule('code_graph.*', 'allow'),
      // Can write documentation files
      permissionRule('workspace.edit', 'allow'),
      permissionRule('workspace.write', 'allow'),
      permissionRule('workspace.apply_patch', 'allow'),
      // No shell execution needed for docs
      permissionRule('workspace.shell', 'deny'),
      permissionRule('task.run', 'deny'),
      // Optional web access for documentation best practices
      permissionRule('web.fetch', 'ask'),
      permissionRule('web.search', 'ask'),
      permissionRule('browser.navigate', 'deny'),
      permissionRule('browser.screenshot', 'deny'),
    ]
  ),
};

export const debugAgent: AgentInfo = {
  name: 'debug',
  mode: 'subagent',
  description: 'Debugging specialist. Diagnoses errors, traces root causes, and suggests verified fixes. Analyzes call chains and provides actionable solutions.',
  systemPrompt: DEBUG_SYSTEM_PROMPT,
  maxSteps: DEFAULT_MAX_STEPS,
  permission: mergeAgentPermissions(
    basePermissions,
    [
      // Read-only workspace access
      permissionRule('workspace.glob', 'allow'),
      permissionRule('workspace.grep', 'allow'),
      permissionRule('workspace.read', 'allow'),
      permissionRule('workspace.git_diff', 'allow'),
      // Code graph analysis (full access)
      permissionRule('code_graph.*', 'allow'),
      // Shell for diagnostic commands (with confirmation)
      permissionRule('workspace.shell', 'ask'),
      // Fixes require confirmation
      permissionRule('workspace.edit', 'ask'),
      permissionRule('workspace.write', 'deny'), // Don't create new files
      permissionRule('workspace.apply_patch', 'ask'),
      // Deny dangerous operations
      permissionRule('workspace.shell', 'deny', 'rm *'),
      permissionRule('workspace.shell', 'deny', 'rm -rf *'),
      permissionRule('workspace.shell', 'deny', 'git reset --hard*'),
      permissionRule('workspace.shell', 'deny', 'git clean *'),
      permissionRule('workspace.shell', 'deny', 'git push --force*'),
      permissionRule('workspace.shell', 'deny', 'dd if=*'),
      // Optional web access for error research
      permissionRule('web.fetch', 'ask'),
      permissionRule('web.search', 'ask'),
      permissionRule('browser.navigate', 'deny'),
      permissionRule('browser.screenshot', 'deny'),
    ]
  ),
};

const agents: Record<AgentName, AgentInfo> = {
  build: buildAgent,
  plan: planAgent,
  general: generalAgent,
  explore: exploreAgent,
  scout: scoutAgent,
  review: reviewAgent,
  refactor: refactorAgent,
  test: testAgent,
  doc: docAgent,
  debug: debugAgent,
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
  return value === 'build' || value === 'plan' || value === 'general' || value === 'explore' || value === 'scout' || value === 'review' || value === 'refactor' || value === 'test' || value === 'doc' || value === 'debug';
}
