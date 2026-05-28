import { describe, expect, it } from 'vitest';
import { AgentRuntime, AgentRuntimeEvent } from '../../src/runtime';
import {
  ProviderClient,
  ProviderRequest,
  ProviderResponse,
  ProviderStreamEvent,
} from '../../src/provider';
import { createTempDir, cleanupTempDir } from '../helpers/test-utils';

class OversizedWriteProvider implements ProviderClient {
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
        name: 'write',
        arguments: '{"filePath":"big.txt","content":"',
      };
      yield {
        type: 'tool-call-delta',
        index: 0,
        arguments: 'x'.repeat(20_000),
      };
      yield { type: 'finish', reason: 'tool_calls' };
      return;
    }

    yield { type: 'text-delta', text: 'Recovered after oversized write.' };
    yield { type: 'finish', reason: 'stop' };
  }
}

describe('AgentRuntime streamed tool argument guard', () => {
  it('rejects oversized write arguments with actionable guidance instead of JSON parse errors', async () => {
    const projectPath = createTempDir('oversized-write-runtime');
    const events: AgentRuntimeEvent[] = [];

    try {
      const result = await new AgentRuntime().run({
        task: 'Create a very large file',
        projectPath,
        provider: new OversizedWriteProvider(),
        maxSteps: 3,
        onEvent: (event) => {
          events.push(event);
        },
      });

      const toolError = events.find((event): event is Extract<AgentRuntimeEvent, { type: 'tool-error' }> =>
        event.type === 'tool-error'
      );

      expect(result.status).toBe('completed');
      expect(toolError?.tool).toBe('write');
      expect(toolError?.error).toContain('too large to stream safely');
      expect(toolError?.error).toContain('minimal skeleton');
      expect(toolError?.error).not.toContain('Unterminated string');
    } finally {
      cleanupTempDir(projectPath);
    }
  });
});
