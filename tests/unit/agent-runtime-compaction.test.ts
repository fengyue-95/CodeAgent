import { describe, expect, it } from 'vitest';
import { AgentRuntime } from '../../src/runtime';
import {
  ProviderClient,
  ProviderRequest,
  ProviderResponse,
  ProviderStreamEvent,
} from '../../src/provider';
import { cleanupTempDir, createTempDir } from '../helpers/test-utils';

class CompactionRuntimeProvider implements ProviderClient {
  readonly id = 'test';
  readonly defaultModel = 'test-model';
  readonly generateRequests: ProviderRequest[] = [];
  readonly streamRequests: ProviderRequest[] = [];

  async generate(input: ProviderRequest): Promise<ProviderResponse> {
    this.generateRequests.push(input);
    return {
      model: input.model ?? this.defaultModel,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: '## Goal\n- Keep implementing the large task' },
          finishReason: 'stop',
        },
      ],
    };
  }

  async *stream(input: ProviderRequest): AsyncGenerator<ProviderStreamEvent> {
    this.streamRequests.push(input);

    if (this.streamRequests.length === 1) {
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

    yield { type: 'text-delta', text: 'Finished with compacted context.' };
    yield { type: 'finish', reason: 'stop' };
  }
}

describe('AgentRuntime context compaction', () => {
  it('uses a model-generated summary when the conversation exceeds the context threshold', async () => {
    const projectPath = createTempDir('agent-runtime-compaction');
    const provider = new CompactionRuntimeProvider();

    try {
      await new AgentRuntime().run({
        task: 'large task '.repeat(120_000),
        projectPath,
        provider,
        maxSteps: 2,
        toolMode: 'core',
      });

      expect(provider.generateRequests).toHaveLength(1);
      expect(provider.generateRequests[0]).toMatchObject({
        tools: [],
        toolChoice: 'none',
        temperature: 0,
      });
      expect(provider.streamRequests).toHaveLength(2);
      expect(provider.streamRequests[1]!.messages.some((message) =>
        message.content?.includes('## Previous Conversation Summary') &&
        message.content.includes('Keep implementing the large task')
      )).toBe(true);
    } finally {
      cleanupTempDir(projectPath);
    }
  });
});
