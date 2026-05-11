export const AGENT_TYPES = ['sales_coach'] as const;

export type AgentType = typeof AGENT_TYPES[number];

export interface AgentPrompt {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  description: string | null;
  agentType: AgentType;
  content: string;
  metadata: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentPromptListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  agentType: AgentType;
  isActive: boolean;
  updatedAt: string;
}

export interface AgentPromptUpdate {
  name?: string;
  description?: string | null;
  content?: string;
  isActive?: boolean;
}
