export type LLMProvider = 'openai' | 'anthropic';

export interface LLMModel {
  id: string;
  name: string;
  provider: LLMProvider;
  description: string;
}

export const SUPPORTED_MODELS: LLMModel[] = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet', provider: 'anthropic', description: 'Best conversational quality' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku', provider: 'anthropic', description: 'Fast and affordable' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', description: 'Smart and capable' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', description: 'Cheapest option' },
  { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai', description: 'Latest OpenAI model' },
] as const;

export interface ApiKey {
  id: string;
  workspaceId: string;
  provider: LLMProvider;
  model: string;
  keyLast4: string;
  label: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyFormData {
  provider: LLMProvider;
  model: string;
  apiKey: string;
  label?: string;
  isDefault: boolean;
}
