import { describe, expect, it } from 'vitest';
import { AgentRuntime } from '../../src/runtime';
import {
  ProviderClient,
  ProviderRequest,
  ProviderResponse,
  ProviderStreamEvent,
} from '../../src/provider';
import { cleanupTempDir, createTempDir } from '../helpers/test-utils';

class CapturesMessagesProvider implements ProviderClient {
  readonly id = 'test';
  readonly defaultModel = 'test-model';
  readonly streamRequests: ProviderRequest[] = [];

  async generate(_input: ProviderRequest): Promise<ProviderResponse> {
    throw new Error('generate is not used in this test');
  }

  async *stream(input: ProviderRequest): AsyncGenerator<ProviderStreamEvent> {
    this.streamRequests.push(input);
    yield { type: 'text-delta', text: '完成。' };
    yield { type: 'finish', reason: 'stop' };
  }
}

describe('AgentRuntime language preference', () => {
  it('asks the model to respond in the same language as the task by default', async () => {
    const projectPath = createTempDir('agent-runtime-language');
    const provider = new CapturesMessagesProvider();

    try {
      await new AgentRuntime().run({
        task: '请分析这个项目的整体结构',
        projectPath,
        provider,
        maxSteps: 1,
      });

      expect(provider.streamRequests[0]?.messages[0]?.content).toContain(
        'Default to responding in the same language as the user task'
      );
      expect(provider.streamRequests[0]?.messages[0]?.content).toContain('Detected task language: Chinese');
    } finally {
      cleanupTempDir(projectPath);
    }
  });

  it('uses the latest user task language when continuing a session', async () => {
    const projectPath = createTempDir('agent-runtime-language-latest');
    const provider = new CapturesMessagesProvider();

    try {
      const first = await new AgentRuntime().run({
        task: 'Analyze this project structure',
        projectPath,
        provider,
        maxSteps: 1,
      });

      await new AgentRuntime().run({
        task: '继续分析这个项目',
        projectPath,
        provider,
        sessionId: first.session.id,
        maxSteps: 1,
      });

      expect(provider.streamRequests[0]?.messages[0]?.content).toContain('Detected task language: English');
      expect(provider.streamRequests[1]?.messages[0]?.content).toContain('Detected task language: Chinese');
    } finally {
      cleanupTempDir(projectPath);
    }
  });
});
