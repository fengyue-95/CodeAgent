import { describe, expect, it } from 'vitest';
import { ContextCompressor } from '../../src/runtime';
import {
  ProviderClient,
  ProviderRequest,
  ProviderResponse,
  ProviderStreamEvent,
} from '../../src/provider';
import { SessionMessageWithParts } from '../../src/session';

class SummaryProvider implements ProviderClient {
  readonly id = 'summary-test';
  readonly defaultModel = 'summary-model';
  readonly requests: ProviderRequest[] = [];

  constructor(private readonly summaries: string[]) {}

  async generate(input: ProviderRequest): Promise<ProviderResponse> {
    this.requests.push(input);
    const summary = this.summaries.shift() ?? 'fallback model summary';
    return {
      model: input.model ?? this.defaultModel,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: summary },
          finishReason: 'stop',
        },
      ],
    };
  }

  async *stream(_input: ProviderRequest): AsyncGenerator<ProviderStreamEvent> {
    throw new Error('stream is not used in this test');
  }
}

function message(
  role: 'user' | 'assistant',
  text: string,
  index: number,
  metadata?: Record<string, unknown>
): SessionMessageWithParts {
  const createdAt = 1_700_000_000_000 + index;
  return {
    message: {
      id: `msg-${index}`,
      sessionId: 'session-1',
      role,
      agent: 'build',
      createdAt,
      metadata,
    },
    parts: [
      {
        id: `part-${index}`,
        sessionId: 'session-1',
        messageId: `msg-${index}`,
        type: 'text',
        text,
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };
}

describe('ContextCompressor', () => {
  it('uses the provider to create a compaction summary and keeps recent messages intact', async () => {
    const provider = new SummaryProvider([
      [
        '## Goal',
        '- Finish the migration',
        '',
        '## Next Steps',
        '- Continue with tests',
      ].join('\n'),
    ]);
    const timeline = Array.from({ length: 8 }, (_, index) =>
      message(index % 2 === 0 ? 'user' : 'assistant', `message ${index} `.repeat(80), index)
    );
    const compressor = new ContextCompressor({
      maxTokens: 100,
      keepRecentCount: 2,
      enableCompression: true,
      provider,
      model: 'summary-model',
    });

    const result = await compressor.compress('system prompt', timeline);

    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]).toMatchObject({
      model: 'summary-model',
      tools: [],
      toolChoice: 'none',
      temperature: 0,
    });
    expect(provider.requests[0]!.messages.at(-1)?.content).toContain('Create a new anchored summary');
    expect(result.map((item) => item.role)).toEqual(['system', 'system', 'user', 'assistant']);
    expect(result[1]?.content).toContain('## Previous Conversation Summary');
    expect(result[1]?.content).toContain('Finish the migration');
    expect(result.at(-2)?.content).toContain('message 6');
    expect(result.at(-1)?.content).toContain('message 7');
  });

  it('updates an existing anchored summary when one is available', async () => {
    const provider = new SummaryProvider(['## Goal\n- Updated summary']);
    const timeline = Array.from({ length: 6 }, (_, index) =>
      message(
        index % 2 === 0 ? 'user' : 'assistant',
        `message ${index} `.repeat(80),
        index,
        index === 0 ? { compactionSummary: 'existing summary' } : undefined
      )
    );
    const compressor = new ContextCompressor({
      maxTokens: 100,
      keepRecentCount: 2,
      provider,
    });

    await compressor.compress('system prompt', timeline);

    expect(provider.requests).toHaveLength(1);
    const prompt = provider.requests[0]!.messages.at(-1)?.content;
    expect(prompt).toContain('Update the anchored summary');
    expect(prompt).toContain('<previous-summary>');
    expect(prompt).toContain('existing summary');
  });

  it('reuses an existing summary without calling the provider again when the compacted context fits', async () => {
    const provider = new SummaryProvider(['should not be used']);
    const timeline = Array.from({ length: 6 }, (_, index) =>
      message(
        index % 2 === 0 ? 'user' : 'assistant',
        index < 4 ? `old message ${index} `.repeat(80) : `recent ${index}`,
        index,
        index === 3 ? { compactionSummary: '## Goal\n- Existing compacted state' } : undefined
      )
    );
    const compressor = new ContextCompressor({
      maxTokens: 100,
      keepRecentCount: 2,
      provider,
    });

    const result = await compressor.compress('system prompt', timeline);

    expect(provider.requests).toHaveLength(0);
    expect(result[1]?.content).toContain('Existing compacted state');
    expect(result.map((item) => item.role)).toEqual(['system', 'system', 'user', 'assistant']);
  });
});
