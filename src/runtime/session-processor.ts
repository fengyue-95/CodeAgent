import {
  ProviderStreamEvent,
  ProviderToolCall,
  ProviderUsage,
} from '../provider';
import {
  SessionMessage,
  SessionPart,
  SqliteSessionStore,
  ToolSessionPart,
} from '../session';

export interface SessionProcessorInput {
  sessions: SqliteSessionStore;
  sessionId: string;
  message: SessionMessage;
}

export interface ToolCallInput {
  id: string;
  name: string;
  input: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ToolResultInput {
  callId: string;
  output: string;
  metadata?: Record<string, unknown>;
}

export interface ToolErrorInput {
  callId: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface FinishInput {
  reason?: string;
  usage?: ProviderUsage;
  metadata?: Record<string, unknown>;
}

export type SessionProcessorEvent =
  | { type: 'text'; text: string; metadata?: Record<string, unknown> }
  | { type: 'tool-call'; id: string; name: string; input: Record<string, unknown>; metadata?: Record<string, unknown> }
  | { type: 'tool-result'; callId: string; output: string; metadata?: Record<string, unknown> }
  | { type: 'error'; message: string; metadata?: Record<string, unknown> }
  | { type: 'finish'; reason?: string; usage?: ProviderUsage; metadata?: Record<string, unknown> };

interface ToolCallDeltaState {
  id?: string;
  name?: string;
  arguments: string;
}

export class SessionProcessor {
  private readonly toolParts = new Map<string, ToolSessionPart>();
  private readonly toolCallDeltas = new Map<number, ToolCallDeltaState>();
  private currentTextPart: SessionPart | undefined;
  private finishedMessage: SessionMessage | undefined;

  constructor(private readonly input: SessionProcessorInput) {}

  handle(event: SessionProcessorEvent): SessionPart | SessionMessage | undefined {
    switch (event.type) {
      case 'text':
        return this.appendText(event.text, event.metadata);
      case 'tool-call':
        return this.recordToolCall({
          id: event.id,
          name: event.name,
          input: event.input,
          metadata: event.metadata,
        });
      case 'tool-result':
        return this.completeToolCall(event);
      case 'error':
        return this.recordError(event.message, event.metadata);
      case 'finish':
        return this.finish(event);
    }
  }

  handleProviderStreamEvent(event: ProviderStreamEvent): SessionPart | SessionMessage | undefined {
    switch (event.type) {
      case 'text-delta':
        return this.appendText(event.text);
      case 'tool-call-delta':
        return this.recordToolCallDelta(event);
      case 'error':
        return this.recordError(event.error.message);
      case 'finish':
        return this.finish({
          reason: event.reason,
          usage: event.usage,
        });
    }
  }

  startStep(metadata?: Record<string, unknown>): SessionPart {
    return this.input.sessions.createPart({
      sessionId: this.input.sessionId,
      messageId: this.input.message.id,
      type: 'step-start',
      metadata,
    });
  }

  appendText(text: string, metadata?: Record<string, unknown>): SessionPart | undefined {
    if (!text) {
      return undefined;
    }

    if (this.currentTextPart?.type === 'text') {
      this.currentTextPart = this.input.sessions.updatePart({
        ...this.currentTextPart,
        text: this.currentTextPart.text + text,
        metadata: metadata ?? this.currentTextPart.metadata,
      });
      return this.currentTextPart;
    }

    this.currentTextPart = this.input.sessions.createPart({
      sessionId: this.input.sessionId,
      messageId: this.input.message.id,
      type: 'text',
      text,
      metadata,
    });
    return this.currentTextPart;
  }

  appendReasoning(text: string, metadata?: Record<string, unknown>): SessionPart | undefined {
    if (!text) {
      return undefined;
    }

    return this.input.sessions.createPart({
      sessionId: this.input.sessionId,
      messageId: this.input.message.id,
      type: 'reasoning',
      text,
      metadata,
    });
  }

  recordToolCall(input: ToolCallInput): ToolSessionPart {
    const existing = this.toolParts.get(input.id);
    if (existing) {
      const updated = this.input.sessions.updatePart({
        ...existing,
        tool: input.name,
        input: input.input,
        status: 'running',
        metadata: input.metadata ?? existing.metadata,
      });
      const part = assertToolPart(updated);
      this.toolParts.set(input.id, part);
      return part;
    }

    const created = this.input.sessions.createPart({
      sessionId: this.input.sessionId,
      messageId: this.input.message.id,
      type: 'tool',
      tool: input.name,
      callId: input.id,
      status: 'running',
      input: input.input,
      metadata: input.metadata,
    });
    const part = assertToolPart(created);
    this.toolParts.set(input.id, part);
    return part;
  }

  recordProviderToolCall(call: ProviderToolCall): ToolSessionPart {
    return this.recordToolCall({
      id: call.id,
      name: call.function.name,
      input: parseToolArguments(call.function.arguments),
    });
  }

  recordToolCallDelta(input: { index: number; id?: string; name?: string; arguments?: string }): ToolSessionPart | undefined {
    const state = this.toolCallDeltas.get(input.index) ?? { arguments: '' };
    if (input.id) {
      state.id = input.id;
    }
    if (input.name) {
      state.name = input.name;
    }
    if (input.arguments) {
      state.arguments += input.arguments;
    }
    this.toolCallDeltas.set(input.index, state);

    if (!state.id || !state.name) {
      return undefined;
    }

    return this.recordToolCall({
      id: state.id,
      name: state.name,
      input: parsePartialToolArguments(state.arguments),
    });
  }

  completeToolCall(input: ToolResultInput): ToolSessionPart {
    const existing = this.requireToolPart(input.callId);
    const updated = assertToolPart(this.input.sessions.updatePart({
      ...existing,
      status: 'completed',
      output: input.output,
      metadata: input.metadata ?? existing.metadata,
    }));
    this.toolParts.set(input.callId, updated);
    this.input.sessions.createPart({
      sessionId: this.input.sessionId,
      messageId: this.input.message.id,
      type: 'tool-result',
      callId: input.callId,
      output: input.output,
      metadata: input.metadata,
    });
    return updated;
  }

  failToolCall(input: ToolErrorInput): ToolSessionPart {
    const existing = this.toolParts.get(input.callId);
    const part = existing
      ? assertToolPart(this.input.sessions.updatePart({
        ...existing,
        status: 'error',
        error: input.message,
        metadata: input.metadata ?? existing.metadata,
      }))
      : assertToolPart(this.input.sessions.createPart({
        sessionId: this.input.sessionId,
        messageId: this.input.message.id,
        type: 'tool',
        tool: 'unknown',
        callId: input.callId,
        status: 'error',
        input: {},
        error: input.message,
        metadata: input.metadata,
      }));
    this.toolParts.set(input.callId, part);
    this.recordError(input.message, input.metadata);
    return part;
  }

  recordError(message: string, metadata?: Record<string, unknown>): SessionPart {
    return this.input.sessions.createPart({
      sessionId: this.input.sessionId,
      messageId: this.input.message.id,
      type: 'error',
      message,
      metadata,
    });
  }

  finish(input: FinishInput = {}): SessionMessage {
    if (this.finishedMessage) {
      return this.finishedMessage;
    }

    this.input.sessions.createPart({
      sessionId: this.input.sessionId,
      messageId: this.input.message.id,
      type: 'step-finish',
      reason: input.reason,
      usage: input.usage,
      metadata: input.metadata,
    });
    this.finishedMessage = this.input.sessions.completeMessage(this.input.message.id) ?? this.input.message;
    return this.finishedMessage;
  }

  parseToolArguments(value: string): Record<string, unknown> {
    return parseToolArguments(value);
  }

  private requireToolPart(callId: string): ToolSessionPart {
    const existing = this.toolParts.get(callId);
    if (existing) {
      return existing;
    }

    throw new Error(`Tool call not found: ${callId}`);
  }
}

export function parseToolArguments(value: string): Record<string, unknown> {
  if (!value.trim()) {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Tool arguments must be a JSON object');
  }

  return parsed as Record<string, unknown>;
}

function parsePartialToolArguments(value: string): Record<string, unknown> {
  try {
    return parseToolArguments(value);
  } catch {
    return {};
  }
}

function assertToolPart(part: unknown): ToolSessionPart {
  if (part && typeof part === 'object' && 'type' in part && part.type === 'tool') {
    return part as ToolSessionPart;
  }

  throw new Error('Expected tool session part');
}
