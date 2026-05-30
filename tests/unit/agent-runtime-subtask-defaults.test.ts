import { describe, expect, it } from 'vitest';
import { AgentRuntime, AgentRuntimeEvent } from '../../src/runtime';
import {
  ProviderClient,
  ProviderRequest,
  ProviderResponse,
  ProviderStreamEvent,
} from '../../src/provider';
import { cleanupTempDir, createTempDir } from '../helpers/test-utils';
import { parseTaskToolOutput } from '../../src/utils/tool-output';

class LongSubtaskProvider implements ProviderClient {
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
        name: 'task',
        arguments: JSON.stringify({
          description: 'Inspect structure',
          prompt: 'Inspect the project structure and report briefly.',
          agent: 'plan',
        }),
      };
      yield { type: 'finish', reason: 'tool_calls' };
      return;
    }

    if (this.streamCount <= 50) {
      yield { type: 'text-delta', text: `subtask step ${this.streamCount}` };
      yield { type: 'finish', reason: 'length' };
      return;
    }

    yield { type: 'text-delta', text: 'Parent done.' };
    yield { type: 'finish', reason: 'stop' };
  }
}

describe('AgentRuntime subtask defaults', () => {
  it('runs subagent tasks with a default max step budget of 50', async () => {
    const projectPath = createTempDir('agent-runtime-subtask-defaults');
    const events: AgentRuntimeEvent[] = [];
    const permissionRequests: string[] = [];

    try {
      await new AgentRuntime().run({
        task: 'Delegate a focused task',
        projectPath,
        provider: new LongSubtaskProvider(),
        toolMode: 'full',
        maxSteps: 2,
        onEvent: (event) => {
          events.push(event);
        },
        onPermissionRequest: async (request) => {
          permissionRequests.push(request.permission);
          return true;
        },
      });

      const taskResult = events.find((event): event is Extract<AgentRuntimeEvent, { type: 'tool-result' }> =>
        event.type === 'tool-result' && event.tool === 'task'
      );
      const task = parseTaskToolOutput(taskResult?.output ?? '');
      const subtaskStarts = events.filter((event) =>
        event.type === 'step-start' &&
        event.source === 'subtask'
      );

      expect(task?.steps).toBe(50);
      expect(permissionRequests).not.toContain('continue');
      expect(subtaskStarts.length).toBeGreaterThan(0);
      expect(subtaskStarts[0]).toMatchObject({
        step: 1,
        maxSteps: 50,
        taskDescription: 'Inspect structure',
      });
    } finally {
      cleanupTempDir(projectPath);
    }
  });
});
