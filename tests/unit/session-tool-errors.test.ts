import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { SqliteSessionStore, messageToProviderMessage } from '../../src/session';
import { SessionMessageWithParts } from '../../src/session/types';
import { SessionProcessor } from '../../src/runtime/session-processor';

function createMemorySessionStore(): { db: Database.Database; sessions: SqliteSessionStore } {
  const db = new Database(':memory:');
  const schemaPath = path.join(process.cwd(), 'src/store/schema.sql');
  db.exec(fs.readFileSync(schemaPath, 'utf8'));

  return {
    db,
    sessions: new SqliteSessionStore(db),
  };
}

describe('tool error session handling', () => {
  it('records failed tool calls as tool results so providers can see the failure', () => {
    const { db, sessions } = createMemorySessionStore();
    try {
      const session = sessions.createSession({ cwd: process.cwd(), agent: 'build' });
      const message = sessions.createMessage({
        sessionId: session.id,
        role: 'assistant',
        agent: 'build',
      });
      const processor = new SessionProcessor({
        sessions,
        sessionId: session.id,
        message,
      });

      processor.recordToolCall({ id: 'call-1', name: 'write', input: {} });
      processor.failToolCall({
        callId: 'call-1',
        message: 'Failed to parse tool arguments: Unterminated string in JSON',
      });

      const parts = sessions.listMessages(session.id)[0]!.parts;

      expect(parts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'tool-result',
          callId: 'call-1',
          output: expect.stringContaining('Failed to parse tool arguments'),
        }),
      ]));
    } finally {
      db.close();
    }
  });

  it('keeps failed assistant tool calls in provider messages to match error tool results', () => {
    const now = Date.now();
    const message: SessionMessageWithParts = {
      message: {
        id: 'message-1',
        sessionId: 'session-1',
        role: 'assistant',
        agent: 'build',
        createdAt: now,
      },
      parts: [
        {
          id: 'part-1',
          sessionId: 'session-1',
          messageId: 'message-1',
          type: 'tool',
          tool: 'write',
          callId: 'call-1',
          status: 'error',
          input: {},
          error: 'Failed to parse tool arguments',
          createdAt: now,
          updatedAt: now,
        },
      ],
    };

    expect(messageToProviderMessage(message).toolCalls).toEqual([
      {
        id: 'call-1',
        type: 'function',
        function: {
          name: 'write',
          arguments: '{}',
        },
      },
    ]);
  });
});
