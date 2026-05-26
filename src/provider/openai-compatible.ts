import {
  ProviderChoice,
  ProviderClient,
  ProviderMessage,
  ProviderRequest,
  ProviderRequestError,
  ProviderResponse,
  ProviderStreamEvent,
  ProviderToolCall,
  ProviderUsage,
} from './types';

export interface OpenAICompatibleProviderOptions {
  id: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  headers?: Record<string, string>;
}

type OpenAIMessage = {
  role: ProviderMessage['role'];
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ProviderToolCall[];
};

type OpenAIChoice = {
  index?: number;
  message?: OpenAIMessage;
  delta?: {
    content?: string | null;
    tool_calls?: Array<{
      index?: number;
      id?: string;
      function?: {
        name?: string;
        arguments?: string;
      };
    }>;
  };
  finish_reason?: string | null;
};

type OpenAIUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type OpenAIChatResponse = {
  id?: string;
  model?: string;
  choices?: OpenAIChoice[];
  usage?: OpenAIUsage;
  error?: {
    message?: string;
    type?: string;
  };
};

export class OpenAICompatibleProvider implements ProviderClient {
  readonly id: string;
  readonly defaultModel: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.id = options.id;
    this.defaultModel = options.defaultModel;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.headers = options.headers ?? {};
  }

  async generate(input: ProviderRequest): Promise<ProviderResponse> {
    const response = await fetch(this.chatCompletionsUrl(), {
      method: 'POST',
      headers: this.requestHeaders(),
      body: JSON.stringify(this.requestBody(input, false)),
      signal: input.abortSignal,
    });
    const text = await response.text();

    if (!response.ok) {
      throw new ProviderRequestError(`Provider request failed with HTTP ${response.status}`, response.status, text);
    }

    const json = parseJson<OpenAIChatResponse>(text);
    if (json.error) {
      throw new ProviderRequestError(json.error.message ?? 'Provider returned an error', response.status, text);
    }

    return {
      id: json.id,
      model: json.model ?? input.model ?? this.defaultModel,
      choices: (json.choices ?? []).map((choice, index) => this.mapChoice(choice, index)),
      usage: mapUsage(json.usage),
    };
  }

  async *stream(input: ProviderRequest): AsyncGenerator<ProviderStreamEvent> {
    const response = await fetch(this.chatCompletionsUrl(), {
      method: 'POST',
      headers: this.requestHeaders(),
      body: JSON.stringify(this.requestBody(input, true)),
      signal: input.abortSignal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new ProviderRequestError(`Provider stream failed with HTTP ${response.status}`, response.status, body);
    }

    if (!response.body) {
      throw new Error('Provider stream response has no body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const event = line.trim();
        if (!event.startsWith('data:')) {
          continue;
        }

        const data = event.slice('data:'.length).trim();
        if (!data || data === '[DONE]') {
          continue;
        }

        yield* this.mapStreamChunk(data);
      }
    }

    if (buffer.trim()) {
      const event = buffer.trim();
      if (event.startsWith('data:')) {
        const data = event.slice('data:'.length).trim();
        if (data && data !== '[DONE]') {
          yield* this.mapStreamChunk(data);
        }
      }
    }
  }

  private chatCompletionsUrl(): string {
    return `${this.baseUrl}/chat/completions`;
  }

  private requestHeaders(): Record<string, string> {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${this.apiKey}`,
      ...this.headers,
    };
  }

  private requestBody(input: ProviderRequest, stream: boolean): Record<string, unknown> {
    return compactObject({
      model: input.model ?? this.defaultModel,
      messages: input.messages.map(mapMessage),
      tools: input.tools,
      tool_choice: input.toolChoice,
      temperature: input.temperature,
      top_p: input.topP,
      max_tokens: input.maxTokens,
      stream,
      stream_options: stream ? { include_usage: true } : undefined,
    });
  }

  private mapChoice(choice: OpenAIChoice, fallbackIndex: number): ProviderChoice {
    const message = choice.message ?? { role: 'assistant', content: '' };
    return {
      index: choice.index ?? fallbackIndex,
      message: mapProviderMessage(message),
      finishReason: choice.finish_reason ?? undefined,
    };
  }

  private *mapStreamChunk(data: string): Generator<ProviderStreamEvent> {
    const json = parseJson<OpenAIChatResponse>(data);
    if (json.error) {
      yield { type: 'error', error: new Error(json.error.message ?? 'Provider returned an error') };
      return;
    }

    const usage = mapUsage(json.usage);
    for (const choice of json.choices ?? []) {
      const content = choice.delta?.content;
      if (content) {
        yield { type: 'text-delta', text: content };
      }

      for (const toolCall of choice.delta?.tool_calls ?? []) {
        yield {
          type: 'tool-call-delta',
          index: toolCall.index ?? 0,
          id: toolCall.id,
          name: toolCall.function?.name,
          arguments: toolCall.function?.arguments,
        };
      }

      if (choice.finish_reason || usage) {
        yield { type: 'finish', reason: choice.finish_reason ?? undefined, usage };
      }
    }

    if ((json.choices ?? []).length === 0 && usage) {
      yield { type: 'finish', usage };
    }
  }
}

function mapMessage(message: ProviderMessage): OpenAIMessage {
  return compactObject({
    role: message.role,
    content: message.content,
    name: message.name,
    tool_call_id: message.toolCallId,
    tool_calls: message.toolCalls,
  }) as OpenAIMessage;
}

function mapProviderMessage(message: OpenAIMessage): ProviderMessage {
  return {
    role: message.role,
    content: message.content,
    name: message.name,
    toolCallId: message.tool_call_id,
    toolCalls: message.tool_calls,
  };
}

function mapUsage(usage: OpenAIUsage | undefined): ProviderUsage | undefined {
  if (!usage) {
    return undefined;
  }

  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;
}

function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`Failed to parse provider response JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
