import Database from 'better-sqlite3';
import {
  CreateMessageInput,
  CreatePartInput,
  CreatePermissionInput,
  CreateRunInput,
  CreateSessionInput,
  PermissionRecord,
  RunRecord,
  SessionInfo,
  SessionMessage,
  SessionMessageWithParts,
  SessionPart,
  SessionStatus,
  RunStatus,
} from './types';
import { createMessageId, createPartId, createPermissionId, createRunId, createSessionId } from './id';

function parseJson<T>(value: string | null): T | undefined {
  if (!value) {
    return undefined;
  }

  return JSON.parse(value) as T;
}

function toJson(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  return JSON.stringify(value);
}

function rowToSession(row: any): SessionInfo {
  return {
    id: row.id,
    title: row.title,
    cwd: row.cwd,
    agent: row.agent,
    model: row.model ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: parseJson(row.metadata),
  };
}

function rowToMessage(row: any): SessionMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    agent: row.agent ?? undefined,
    model: row.model ?? undefined,
    parentMessageId: row.parent_message_id ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    metadata: parseJson(row.metadata),
  };
}

function rowToPart(row: any): SessionPart {
  return {
    id: row.id,
    sessionId: row.session_id,
    messageId: row.message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...JSON.parse(row.data),
  } as SessionPart;
}

function rowToRun(row: any): RunRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    messageId: row.message_id ?? undefined,
    agent: row.agent,
    model: row.model ?? undefined,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    steps: row.steps,
    error: row.error ?? undefined,
    metadata: parseJson(row.metadata),
  };
}

function rowToPermission(row: any): PermissionRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    runId: row.run_id ?? undefined,
    toolCallId: row.tool_call_id ?? undefined,
    permission: row.permission,
    pattern: row.pattern,
    action: row.action,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: parseJson(row.metadata),
  };
}

export class SqliteSessionStore {
  constructor(private readonly db: Database.Database) {}

  createSession(input: CreateSessionInput): SessionInfo {
    const now = Date.now();
    const session: SessionInfo = {
      id: createSessionId(),
      title: input.title ?? `New session - ${new Date(now).toISOString()}`,
      cwd: input.cwd,
      agent: input.agent ?? 'build',
      model: input.model,
      status: 'idle',
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };

    this.db.prepare(`
      INSERT INTO sessions (
        id, title, cwd, agent, model, status, created_at, updated_at, metadata
      ) VALUES (
        @id, @title, @cwd, @agent, @model, @status, @createdAt, @updatedAt, @metadata
      )
    `).run({
      ...session,
      model: session.model ?? null,
      metadata: toJson(session.metadata),
    });

    return session;
  }

  getSession(id: string): SessionInfo | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    return row ? rowToSession(row) : null;
  }

  listSessions(limit = 50): SessionInfo[] {
    const rows = this.db.prepare(`
      SELECT * FROM sessions
      ORDER BY updated_at DESC, created_at DESC
      LIMIT ?
    `).all(limit);
    return rows.map(rowToSession);
  }

  updateSessionStatus(id: string, status: SessionStatus): SessionInfo | null {
    const now = Date.now();
    this.db.prepare(`
      UPDATE sessions
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).run(status, now, id);
    return this.getSession(id);
  }

  createMessage(input: CreateMessageInput): SessionMessage {
    const now = Date.now();
    const message: SessionMessage = {
      id: createMessageId(),
      sessionId: input.sessionId,
      role: input.role,
      agent: input.agent,
      model: input.model,
      parentMessageId: input.parentMessageId,
      createdAt: now,
      metadata: input.metadata,
    };

    this.db.prepare(`
      INSERT INTO messages (
        id, session_id, role, agent, model, parent_message_id, created_at, completed_at, metadata
      ) VALUES (
        @id, @sessionId, @role, @agent, @model, @parentMessageId, @createdAt, @completedAt, @metadata
      )
    `).run({
      ...message,
      agent: message.agent ?? null,
      model: message.model ?? null,
      parentMessageId: message.parentMessageId ?? null,
      completedAt: message.completedAt ?? null,
      metadata: toJson(message.metadata),
    });
    this.touchSession(input.sessionId, now);

    return message;
  }

  completeMessage(id: string): SessionMessage | null {
    const now = Date.now();
    const message = this.getMessage(id);
    if (!message) {
      return null;
    }

    this.db.prepare(`
      UPDATE messages
      SET completed_at = ?
      WHERE id = ?
    `).run(now, id);
    this.touchSession(message.sessionId, now);
    return this.getMessage(id);
  }

  getMessage(id: string): SessionMessage | null {
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    return row ? rowToMessage(row) : null;
  }

  listMessages(sessionId: string): SessionMessageWithParts[] {
    const rows = this.db.prepare(`
      SELECT * FROM messages
      WHERE session_id = ?
      ORDER BY created_at, id
    `).all(sessionId);
    const messages = rows.map(rowToMessage);
    const parts = this.listParts(sessionId);
    const partsByMessage = new Map<string, SessionPart[]>();
    for (const part of parts) {
      const list = partsByMessage.get(part.messageId) ?? [];
      list.push(part);
      partsByMessage.set(part.messageId, list);
    }

    return messages.map((message) => ({
      message,
      parts: partsByMessage.get(message.id) ?? [],
    }));
  }

  createPart(input: CreatePartInput): SessionPart {
    const now = Date.now();
    const part = {
      ...input,
      id: createPartId(),
      createdAt: now,
      updatedAt: now,
    } as SessionPart;

    this.db.prepare(`
      INSERT INTO message_parts (
        id, session_id, message_id, type, data, created_at, updated_at
      ) VALUES (
        @id, @sessionId, @messageId, @type, @data, @createdAt, @updatedAt
      )
    `).run({
      id: part.id,
      sessionId: part.sessionId,
      messageId: part.messageId,
      type: part.type,
      data: toJson(stripPartEnvelope(part)),
      createdAt: part.createdAt,
      updatedAt: part.updatedAt,
    });
    this.touchSession(part.sessionId, now);

    return part;
  }

  updatePart(part: SessionPart): SessionPart {
    const updated = {
      ...part,
      updatedAt: Date.now(),
    } as SessionPart;
    this.db.prepare(`
      UPDATE message_parts
      SET type = @type, data = @data, updated_at = @updatedAt
      WHERE id = @id
    `).run({
      id: updated.id,
      type: updated.type,
      data: toJson(stripPartEnvelope(updated)),
      updatedAt: updated.updatedAt,
    });
    this.touchSession(updated.sessionId, updated.updatedAt);

    return updated;
  }

  getPart(id: string): SessionPart | null {
    const row = this.db.prepare('SELECT * FROM message_parts WHERE id = ?').get(id);
    return row ? rowToPart(row) : null;
  }

  listParts(sessionId: string): SessionPart[] {
    const rows = this.db.prepare(`
      SELECT * FROM message_parts
      WHERE session_id = ?
      ORDER BY created_at, id
    `).all(sessionId);
    return rows.map(rowToPart);
  }

  createRun(input: CreateRunInput): RunRecord {
    const now = Date.now();
    const run: RunRecord = {
      id: createRunId(),
      sessionId: input.sessionId,
      messageId: input.messageId,
      agent: input.agent,
      model: input.model,
      status: 'running',
      startedAt: now,
      steps: 0,
      metadata: input.metadata,
    };

    this.db.prepare(`
      INSERT INTO runs (
        id, session_id, message_id, agent, model, status, started_at, completed_at, steps, error, metadata
      ) VALUES (
        @id, @sessionId, @messageId, @agent, @model, @status, @startedAt, @completedAt, @steps, @error, @metadata
      )
    `).run({
      ...run,
      messageId: run.messageId ?? null,
      model: run.model ?? null,
      completedAt: run.completedAt ?? null,
      error: run.error ?? null,
      metadata: toJson(run.metadata),
    });
    this.touchSession(input.sessionId, now);

    return run;
  }

  completeRun(id: string, status: Exclude<RunStatus, 'running'>, error?: string): RunRecord | null {
    const now = Date.now();
    const run = this.getRun(id);
    if (!run) {
      return null;
    }

    this.db.prepare(`
      UPDATE runs
      SET status = ?, completed_at = ?, error = ?
      WHERE id = ?
    `).run(status, now, error ?? null, id);
    this.touchSession(run.sessionId, now);
    return this.getRun(id);
  }

  incrementRunSteps(id: string, amount = 1): RunRecord | null {
    const run = this.getRun(id);
    if (!run) {
      return null;
    }

    this.db.prepare(`
      UPDATE runs
      SET steps = steps + ?
      WHERE id = ?
    `).run(amount, id);
    return this.getRun(id);
  }

  getRun(id: string): RunRecord | null {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
    return row ? rowToRun(row) : null;
  }

  listRuns(sessionId: string): RunRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM runs
      WHERE session_id = ?
      ORDER BY started_at, id
    `).all(sessionId);
    return rows.map(rowToRun);
  }

  createPermission(input: CreatePermissionInput): PermissionRecord {
    const now = Date.now();
    const permission: PermissionRecord = {
      id: createPermissionId(),
      sessionId: input.sessionId,
      runId: input.runId,
      toolCallId: input.toolCallId,
      permission: input.permission,
      pattern: input.pattern,
      action: input.action,
      status: input.status ?? (input.action === 'ask' ? 'pending' : 'approved'),
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };

    this.db.prepare(`
      INSERT INTO permissions (
        id, session_id, run_id, tool_call_id, permission, pattern, action, status, created_at, updated_at, metadata
      ) VALUES (
        @id, @sessionId, @runId, @toolCallId, @permission, @pattern, @action, @status, @createdAt, @updatedAt, @metadata
      )
    `).run({
      ...permission,
      runId: permission.runId ?? null,
      toolCallId: permission.toolCallId ?? null,
      metadata: toJson(permission.metadata),
    });
    this.touchSession(input.sessionId, now);

    return permission;
  }

  updatePermissionStatus(id: string, status: PermissionRecord['status']): PermissionRecord | null {
    const now = Date.now();
    const permission = this.getPermission(id);
    if (!permission) {
      return null;
    }

    this.db.prepare(`
      UPDATE permissions
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).run(status, now, id);
    this.touchSession(permission.sessionId, now);
    return this.getPermission(id);
  }

  getPermission(id: string): PermissionRecord | null {
    const row = this.db.prepare('SELECT * FROM permissions WHERE id = ?').get(id);
    return row ? rowToPermission(row) : null;
  }

  listPermissions(sessionId: string): PermissionRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM permissions
      WHERE session_id = ?
      ORDER BY created_at, id
    `).all(sessionId);
    return rows.map(rowToPermission);
  }

  private touchSession(sessionId: string, updatedAt = Date.now()): void {
    this.db.prepare(`
      UPDATE sessions
      SET updated_at = ?
      WHERE id = ?
    `).run(updatedAt, sessionId);
  }
}

function stripPartEnvelope(part: SessionPart): Record<string, unknown> {
  const { id, sessionId, messageId, createdAt, updatedAt, ...data } = part;
  return data;
}
