import { describe, expect, it } from 'vitest';
import { AgentRuntime, AgentRuntimeEvent } from '../../src/runtime';
import {
  ProviderClient,
  ProviderRequest,
  ProviderResponse,
  ProviderStreamEvent,
} from '../../src/provider';
import { createTempDir, cleanupTempDir } from '../helpers/test-utils';

class CompletesOnSecondStepProvider implements ProviderClient {
  readonly id = 'test';
  readonly defaultModel = 'test-model';
  private streamCount = 0;

  async generate(_input: ProviderRequest): Promise<ProviderResponse> {
    throw new Error('generate is not used in this test');
  }

  async *stream(_input: ProviderRequest): AsyncGenerator<ProviderStreamEvent> {
    this.streamCount += 1;

    if (this.streamCount === 1) {
      yield {
        type: 'tool-call-delta',
        index: 0,
        id: 'call-1',
        name: 'glob',
        arguments: '{"pattern":"src/**/*.ts"}',
      };
      yield { type: 'finish', reason: 'tool_calls' };
      return;
    }

    yield { type: 'text-delta', text: 'Completed on the last allowed step.' };
    yield { type: 'finish', reason: 'stop' };
  }
}

class NeedsThirdStepProvider implements ProviderClient {
  readonly id = 'test';
  readonly defaultModel = 'test-model';
  private streamCount = 0;

  async generate(_input: ProviderRequest): Promise<ProviderResponse> {
    throw new Error('generate is not used in this test');
  }

  async *stream(_input: ProviderRequest): AsyncGenerator<ProviderStreamEvent> {
    this.streamCount += 1;

    if (this.streamCount === 1) {
      yield {
        type: 'tool-call-delta',
        index: 0,
        id: 'call-1',
        name: 'glob',
        arguments: '{"pattern":"src/**/*.ts"}',
      };
      yield { type: 'finish', reason: 'tool_calls' };
      return;
    }

    if (this.streamCount === 2) {
      yield { type: 'text-delta', text: 'Still working, need one more step.' };
      yield { type: 'finish', reason: 'length' };
      return;
    }

    yield { type: 'text-delta', text: 'Completed after extending max steps.' };
    yield { type: 'finish', reason: 'stop' };
  }
}

describe('AgentRuntime max steps continuation', () => {
  it('uses the full configured step budget before requesting an extension', async () => {
    const projectPath = createTempDir('agent-runtime-max-steps-last-step');
    const permissionCalls: Array<{ permission: string; pattern: string }> = [];

    try {
      const result = await new AgentRuntime().run({
        task: 'Finish within the configured two-step budget',
        projectPath,
        provider: new CompletesOnSecondStepProvider(),
        maxSteps: 2,
        toolMode: 'core',
        onPermissionRequest: async (request) => {
          permissionCalls.push({ permission: request.permission, pattern: request.pattern });
          return true;
        },
      });

      expect(result.status).toBe('completed');
      expect(result.steps).toBe(2);
      expect(permissionCalls).toEqual([]);
    } finally {
      cleanupTempDir(projectPath);
    }
  });

  it('continues execution after the configured step budget is exhausted and extension is approved', async () => {
    const projectPath = createTempDir('agent-runtime-max-steps-extension');
    const events: AgentRuntimeEvent[] = [];
    const permissionCalls: Array<{ permission: string; pattern: string }> = [];

    try {
      const result = await new AgentRuntime().run({
        task: 'Finish a task that needs more than two steps',
        projectPath,
        provider: new NeedsThirdStepProvider(),
        maxSteps: 2,
        toolMode: 'core',
        onEvent: (event) => {
          events.push(event);
        },
        onPermissionRequest: async (request) => {
          permissionCalls.push({ permission: request.permission, pattern: request.pattern });
          return request.permission === 'continue';
        },
      });

      const finalText = events
        .filter((event): event is Extract<AgentRuntimeEvent, { type: 'assistant-text-delta' }> =>
          event.type === 'assistant-text-delta'
        )
        .map((event) => event.text)
        .join('');

      const extensionNotice = events.find((event): event is Extract<AgentRuntimeEvent, { type: 'runtime-error' }> =>
        event.type === 'runtime-error' && event.error.includes('新的步骤限制')
      );

      expect(result.status).toBe('completed');
      expect(result.steps).toBe(3);
      expect(finalText).toContain('Completed after extending max steps.');
      expect(permissionCalls).toContainEqual({ permission: 'continue', pattern: 'extend-steps' });
      expect(extensionNotice?.error).toContain('新的步骤限制');
    } finally {
      cleanupTempDir(projectPath);
    }
  });

  it('continues execution automatically when auto extension is enabled', async () => {
    const projectPath = createTempDir('agent-runtime-max-steps-auto-extension');
    const events: AgentRuntimeEvent[] = [];

    try {
      const result = await new AgentRuntime().run({
        task: 'Finish a task that needs more than two steps',
        projectPath,
        provider: new NeedsThirdStepProvider(),
        maxSteps: 2,
        toolMode: 'core',
        autoExtendSteps: true,
        onEvent: (event) => {
          events.push(event);
        },
      });

      const finalText = events
        .filter((event): event is Extract<AgentRuntimeEvent, { type: 'assistant-text-delta' }> =>
          event.type === 'assistant-text-delta'
        )
        .map((event) => event.text)
        .join('');

      expect(result.status).toBe('completed');
      expect(result.steps).toBe(3);
      expect(finalText).toContain('Completed after extending max steps.');
    } finally {
      cleanupTempDir(projectPath);
    }
  });
});
