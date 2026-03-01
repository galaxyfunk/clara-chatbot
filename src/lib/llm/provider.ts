import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  provider: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export async function chatCompletion(
  provider: string,
  model: string,
  apiKey: string,
  messages: LLMMessage[],
  options: { maxTokens?: number; temperature?: number } = {}
): Promise<LLMResponse> {
  const { maxTokens = 1024, temperature = 0.7 } = options;
  switch (provider) {
    case 'anthropic':
      return callAnthropic(model, apiKey, messages, maxTokens, temperature);
    case 'openai':
      return callOpenAI(model, apiKey, messages, maxTokens, temperature);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

async function callAnthropic(model: string, apiKey: string, messages: LLMMessage[], maxTokens: number, temperature: number): Promise<LLMResponse> {
  const client = new Anthropic({ apiKey, timeout: 120000 });
  const systemMessage = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  const response = await client.messages.create({ model, max_tokens: maxTokens, temperature, system: systemMessage?.content || '', messages: chatMessages });
  const textContent = response.content.find(c => c.type === 'text');
  return { content: textContent?.text ?? '', provider: 'anthropic', model, usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } };
}

async function callOpenAI(model: string, apiKey: string, messages: LLMMessage[], maxTokens: number, temperature: number): Promise<LLMResponse> {
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({ model, max_tokens: maxTokens, temperature, messages: messages.map(m => ({ role: m.role, content: m.content })) });
  return { content: response.choices[0]?.message?.content ?? '', provider: 'openai', model, usage: { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0 } };
}
