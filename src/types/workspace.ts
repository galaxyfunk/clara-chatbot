export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  settings: WorkspaceSettings;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSettings {
  // Content
  display_name: string;
  welcome_message: string;
  placeholder_text: string;
  suggested_messages: string[];
  booking_url: string | null;

  // Style
  primary_color: string;
  bubble_color: string;
  bubble_position: 'left' | 'right';
  avatar_url: string | null;
  chat_icon_url: string | null;

  // AI
  personality_prompt: string;
  confidence_threshold: number;
  max_suggestion_chips: number;

  // Escalation
  escalation_enabled: boolean;

  // Widget
  powered_by_clara: boolean;
}

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  display_name: 'Assistant',
  welcome_message: 'Hi! How can I help you today?',
  placeholder_text: 'Type your message...',
  suggested_messages: [],
  booking_url: null,
  primary_color: '#6366f1',
  bubble_color: '#000000',
  bubble_position: 'right',
  avatar_url: null,
  chat_icon_url: null,
  personality_prompt: `### Business Context
Describe what your company does, your key services, and your target audience.

### Role
You are a friendly and knowledgeable virtual assistant. Your primary role is to answer questions accurately using the knowledge base provided. Be conversational, helpful, and professional.

### Constraints
1. Only answer from the knowledge base context provided.
2. If you don't have enough information, be honest and suggest booking a call.
3. Never make up information or speculate beyond what the knowledge base contains.
4. Keep responses concise — 2-4 sentences for simple questions.`,
  confidence_threshold: 0.78,
  max_suggestion_chips: 3,
  escalation_enabled: true,
  powered_by_clara: true,
};
