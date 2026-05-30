import { describe, expect, it } from 'vitest';
import { ContextCompressor } from '../../src/runtime';
import { SessionMessageWithParts } from '../../src/session';

function assistantMessage(parts: SessionMessageWithParts['parts']): SessionMessageWithParts {
  return {
    message: {
      id: 'assistant-1',
      sessionId: 'session-1',
      role: 'assistant',
      agent: 'build',
      createdAt: 1,
    },
    parts,
  };
}

describe('ContextCompressor provider messages', () => {
  it('omits empty assistant messages without tool calls', async () => {
    const compressor = new ContextCompressor({ enableCompression: false });

    const messages = await compressor.compress('system prompt', [
      assistantMessage([]),
    ]);

    expect(messages).toEqual([
      { role: 'system', content: 'system prompt' },
    ]);
  });

  it('keeps assistant tool calls paired with their tool results', async () => {
    const compressor = new ContextCompressor({ enableCompression: false });

    const messages = await compressor.compress('system prompt', [
      assistantMessage([
        {
          id: 'tool-1',
          sessionId: 'session-1',
          messageId: 'assistant-1',
          type: 'tool',
          tool: 'grep',
          callId: 'call-1',
          status: 'completed',
          input: { pattern: 'EnvEnum' },
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'result-1',
          sessionId: 'session-1',
          messageId: 'assistant-1',
          type: 'tool-result',
          callId: 'call-1',
          output: 'no matches',
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
    ]);

    expect(messages).toEqual([
      { role: 'system', content: 'system prompt' },
      {
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'grep',
              arguments: '{"pattern":"EnvEnum"}',
            },
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'call-1',
        content: 'no matches',
      },
    ]);
  });
});
