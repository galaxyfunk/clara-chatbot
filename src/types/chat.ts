export interface ChatMessage {
  message_id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestion_chips?: string[];
  gap_detected?: boolean;
  matched_qa_ids?: string[];
  confidence?: number;
  escalation_offered?: boolean;
}

export interface ChatSession {
  id: string;
  workspaceId: string;
  sessionToken: string;
  messages: ChatMessage[];
  metadata: Record<string, unknown>;
  visitorName: string | null;
  visitorEmail: string | null;
  escalated: boolean;
  escalatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatRequest {
  workspace_id: string;
  session_token: string;
  message: string;
  message_id: string;
}

export interface ChatResponse {
  answer: string;
  suggestion_chips: string[];
  confidence: number;
  gap_detected: boolean;
  escalation_offered: boolean;
  booking_url: string | null;
  matched_pairs: { id: string; question: string; similarity: number }[];
}
