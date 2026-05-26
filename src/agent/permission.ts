export type AgentPermissionAction = 'allow' | 'ask' | 'deny';

export interface AgentPermissionRule {
  permission: string;
  pattern: string;
  action: AgentPermissionAction;
}

export type AgentPermissionRuleset = AgentPermissionRule[];

export interface AgentPermissionDecision extends AgentPermissionRule {
  matched: boolean;
}

export function permissionRule(
  permission: string,
  action: AgentPermissionAction,
  pattern = '*'
): AgentPermissionRule {
  return { permission, pattern, action };
}

export function evaluateAgentPermission(
  ruleset: AgentPermissionRuleset,
  permission: string,
  pattern = '*'
): AgentPermissionDecision {
  for (let index = ruleset.length - 1; index >= 0; index -= 1) {
    const rule = ruleset[index]!;
    if (wildcardMatch(rule.permission, permission) && wildcardMatch(rule.pattern, pattern)) {
      return { ...rule, matched: true };
    }
  }

  return {
    permission,
    pattern,
    action: 'ask',
    matched: false,
  };
}

export function mergeAgentPermissions(...rulesets: AgentPermissionRuleset[]): AgentPermissionRuleset {
  return rulesets.flat();
}

function wildcardMatch(pattern: string, value: string): boolean {
  if (pattern === '*') {
    return true;
  }

  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(value);
}
