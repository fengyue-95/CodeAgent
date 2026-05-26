import { AgentName } from '../agent';
import { ProviderMessage, ProviderToolCall, ProviderUsage } from '../provider';

export type SessionStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
export type SessionMessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type SessionPartType =
  | 'text'
  | 'reasoning'
  | 'tool'
  | 'tool-result'
  | 'error'
  | 'step-start'
  | 'step-finish';
export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'error';
export type PermissionStatus = 'pending' | 'approved' | 'rejected';
export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface SessionInfo {
  id: string;
  title: string;
  cwd: string;
  agent: AgentName;
  model?: string;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface SessionMessage {
  id: string;
  sessionId: string;
  role: SessionMessageRole;
  agent?: AgentName;
  model?: string;
  parentMessageId?: string;
  createdAt: number;
  completedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface TextSessionPart {
  id: string;
  sessionId: string;
  messageId: string;
  type: 'text';
  text: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface ReasoningSessionPart {
  id: string;
  sessionId: string;
  messageId: string;
  type: 'reasoning';
  text: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface ToolSessionPart {
  id: string;
  sessionId: string;
  messageId: string;
  type: 'tool';
  tool: string;
  callId: string;
  status: ToolCallStatus;
  input: Record<string, unknown>;
  output?: string;
  error?: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface ToolResultSessionPart {
  id: string;
  sessionId: string;
  messageId: string;
  type: 'tool-result';
  callId: string;
  output: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface ErrorSessionPart {
  id: string;
  sessionId: string;
  messageId: string;
  type: 'error';
  message: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface StepStartSessionPart {
  id: string;
  sessionId: string;
  messageId: string;
  type: 'step-start';
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface StepFinishSessionPart {
  id: string;
  sessionId: string;
  messageId: string;
  type: 'step-finish';
  reason?: string;
  usage?: ProviderUsage;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export type SessionPart =
  | TextSessionPart
  | ReasoningSessionPart
  | ToolSessionPart
  | ToolResultSessionPart
  | ErrorSessionPart
  | StepStartSessionPart
  | StepFinishSessionPart;

export interface SessionMessageWithParts {
  message: SessionMessage;
  parts: SessionPart[];
}

export interface PermissionRecord {
  id: string;
  sessionId: string;
  runId?: string;
  toolCallId?: string;
  permission: string;
  pattern: string;
  action: 'allow' | 'ask' | 'deny';
  status: PermissionStatus;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface RunRecord {
  id: string;
  sessionId: string;
  messageId?: string;
  agent: AgentName;
  model?: string;
  status: RunStatus;
  startedAt: number;
  completedAt?: number;
  steps: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateSessionInput {
  title?: string;
  cwd: string;
  agent?: AgentName;
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateMessageInput {
  sessionId: string;
  role: SessionMessageRole;
  agent?: AgentName;
  model?: string;
  parentMessageId?: string;
  metadata?: Record<string, unknown>;
}

export type CreatePartInput =
  | Omit<TextSessionPart, 'id' | 'createdAt' | 'updatedAt'>
  | Omit<ReasoningSessionPart, 'id' | 'createdAt' | 'updatedAt'>
  | Omit<ToolSessionPart, 'id' | 'createdAt' | 'updatedAt'>
  | Omit<ToolResultSessionPart, 'id' | 'createdAt' | 'updatedAt'>
  | Omit<ErrorSessionPart, 'id' | 'createdAt' | 'updatedAt'>
  | Omit<StepStartSessionPart, 'id' | 'createdAt' | 'updatedAt'>
  | Omit<StepFinishSessionPart, 'id' | 'createdAt' | 'updatedAt'>;

export interface CreateRunInput {
  sessionId: string;
  messageId?: string;
  agent: AgentName;
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface CreatePermissionInput {
  sessionId: string;
  runId?: string;
  toolCallId?: string;
  permission: string;
  pattern: string;
  action: 'allow' | 'ask' | 'deny';
  status?: PermissionStatus;
  metadata?: Record<string, unknown>;
}

export function messageToProviderMessage(input: SessionMessageWithParts): ProviderMessage {
  const content = input.parts
    .filter((part): part is TextSessionPart | ReasoningSessionPart => part.type === 'text' || part.type === 'reasoning')
    .map((part) => part.text)
    .join('\n');
  const toolCalls = input.message.role === 'assistant'
    ? input.parts
      .filter((part): part is ToolSessionPart => part.type === 'tool' && part.status !== 'error')
      .map((part): ProviderToolCall => ({
        id: part.callId,
        type: 'function',
        function: {
          name: part.tool,
          arguments: JSON.stringify(part.input),
        },
      }))
    : [];

  return {
    role: input.message.role,
    content: content || null,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}
