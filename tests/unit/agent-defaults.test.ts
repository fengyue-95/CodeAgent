import { describe, expect, it } from 'vitest';
import { BUILD_SYSTEM_PROMPT, listAgents } from '../../src/agent';

describe('agent defaults', () => {
  it('sets every built-in agent max steps to 200', () => {
    expect(listAgents().map((agent) => [agent.name, agent.maxSteps])).toEqual([
      ['build', 200],
      ['plan', 200],
      ['general', 200],
      ['explore', 200],
      ['scout', 200],
      ['review', 200],
      ['refactor', 200],
      ['test', 200],
      ['doc', 200],
      ['debug', 200],
    ]);
  });

  it('keeps build and plan as primary modes and all other built-in agents as subagents', () => {
    expect(listAgents().map((agent) => [agent.name, agent.mode])).toEqual([
      ['build', 'primary'],
      ['plan', 'primary'],
      ['general', 'subagent'],
      ['explore', 'subagent'],
      ['scout', 'subagent'],
      ['review', 'subagent'],
      ['refactor', 'subagent'],
      ['test', 'subagent'],
      ['doc', 'subagent'],
      ['debug', 'subagent'],
    ]);
  });

  it('instructs build mode to close the edit-verify-fix loop', () => {
    expect(BUILD_SYSTEM_PROMPT).toContain('edit-verify-fix loop');
    expect(BUILD_SYSTEM_PROMPT).toContain('If verification fails');
    expect(BUILD_SYSTEM_PROMPT).toContain('do not claim the task is complete');
  });

  it('instructs build mode to inspect definitions before fixing type errors', () => {
    expect(BUILD_SYSTEM_PROMPT).toContain('compile or type errors');
    expect(BUILD_SYSTEM_PROMPT).toContain('read the target symbol definition');
    expect(BUILD_SYSTEM_PROMPT).toContain('search existing call sites');
    expect(BUILD_SYSTEM_PROMPT).toContain('Do not guess method signatures, constructor parameters, DTO fields, or setter names');
  });
});
