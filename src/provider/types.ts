export type ProviderRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ProviderToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ProviderMessage {
  role: ProviderRole;
  content?: string | null;
  name?: string;
  toolCallId?: string;
  toolCalls?: ProviderToolCall[];
}

export interface ProviderTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface ProviderRequest {
  messages: ProviderMessage[];
  model?: string;
  tools?: ProviderTool[];
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
}

export interface ProviderUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ProviderChoice {
  index: number;
  message: ProviderMessage;
  finishReason?: string;
}

export interface ProviderResponse {
  id?: string;
  model: string;
  choices: ProviderChoice[];
  usage?: ProviderUsage;
}

export type ProviderStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call-delta'; index: number; id?: string; name?: string; arguments?: string }
  | { type: 'finish'; reason?: string; usage?: ProviderUsage }
  | { type: 'error'; error: Error };

export interface ProviderClient {
  readonly id: string;
  readonly defaultModel: string;
  generate(input: ProviderRequest): Promise<ProviderResponse>;
  stream(input: ProviderRequest): AsyncGenerator<ProviderStreamEvent>;
}

export class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: string
  ) {
    super(message);
    this.name = 'ProviderRequestError';
  }
}
