import { describe, expect, it } from 'vitest';
import { evaluateAgentPermission, getAgent } from '../../src/agent';

describe('agent permissions', () => {
  it('lets review run diagnostic shell commands while keeping edits denied', () => {
    const review = getAgent('review');

    expect(evaluateAgentPermission(review.permission, 'workspace.shell', 'mvn compile').action).toBe('ask');
    expect(evaluateAgentPermission(review.permission, 'task.run', 'plan').action).toBe('allow');
    expect(evaluateAgentPermission(review.permission, 'workspace.edit', 'app/Foo.java').action).toBe('deny');
    expect(evaluateAgentPermission(review.permission, 'workspace.write', 'app/Foo.java').action).toBe('deny');
    expect(evaluateAgentPermission(review.permission, 'workspace.apply_patch', 'app/Foo.java').action).toBe('deny');
  });
});
