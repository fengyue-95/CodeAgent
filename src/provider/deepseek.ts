import { OpenAICompatibleProvider } from './openai-compatible';
import { ProviderClient } from './types';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';

export interface DeepSeekProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export function createDeepSeekProvider(options: DeepSeekProviderOptions = {}): ProviderClient {
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('Missing DeepSeek API key. Set DEEPSEEK_API_KEY or pass apiKey.');
  }

  return new OpenAICompatibleProvider({
    id: 'deepseek',
    apiKey,
    baseUrl: options.baseUrl ?? process.env.CODE_AGENT_DEEPSEEK_BASE_URL ?? DEFAULT_BASE_URL,
    defaultModel: options.model ?? process.env.CODE_AGENT_DEEPSEEK_MODEL ?? DEFAULT_MODEL,
  });
}
