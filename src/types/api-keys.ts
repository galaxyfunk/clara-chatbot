export type LLMProvider = 'openai' | 'anthropic';

export interface LLMModel {
  id: string;
  name: string;
  provider: LLMProvider;
  description: string;
}

export const SUPPORTED_MODELS: LLMModel[] = [
  // Anthropic models
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic', description: 'Most capable, best for complex tasks' },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', description: 'Best balance of speed and quality' },
  { id: 'claude-haiku-4-20250514', name: 'Claude Haiku 4', provider: 'anthropic', description: 'Fast and affordable' },
  { id: 'custom-anthropic', name: 'Custom Model', provider: 'anthropic', description: 'Enter any model ID' },
  // OpenAI models - GPT-5 family
  { id: 'gpt-5.2', name: 'GPT-5.2', provider: 'openai', description: 'Latest and most capable' },
  { id: 'gpt-5.2-pro', name: 'GPT-5.2 Pro', provider: 'openai', description: 'Enhanced reasoning' },
  { id: 'gpt-5.1', name: 'GPT-5.1', provider: 'openai', description: 'Great for coding and agentic tasks' },
  { id: 'gpt-5', name: 'GPT-5', provider: 'openai', description: 'Reasoning and coding' },
  // OpenAI models - GPT-4 family
  { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai', description: 'Enhanced GPT-4 reasoning' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', description: 'Multimodal, smart and fast' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', description: 'Cheapest option' },
  // OpenAI models - Reasoning (o-series)
  { id: 'o3', name: 'o3', provider: 'openai', description: 'Advanced reasoning model' },
  { id: 'o3-mini', name: 'o3 Mini', provider: 'openai', description: 'Fast reasoning model' },
  { id: 'custom-openai', name: 'Custom Model', provider: 'openai', description: 'Enter any model ID' },
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
