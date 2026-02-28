import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, ConversationSummary } from '@/types/chat';

const SUMMARIZE_PROMPT = `You are analyzing a customer support conversation. Extract structured information from the chat.

Return a JSON object with these fields:
- visitor_name: The visitor's name if mentioned, or null
- intent_tags: Array of 1-3 tags describing what the visitor wanted (e.g., "pricing_inquiry", "technical_support", "demo_request", "general_question", "complaint", "feature_request")
- summary: A 1-2 sentence summary of what the conversation was about
- extracted_facts: Array of key facts learned about the visitor (e.g., company name, industry, use case, budget)
- next_steps: Array of follow-up actions if any were mentioned

Respond ONLY with valid JSON, no markdown or explanation.`;

interface SummarizeResult {
  success: boolean;
  summary?: ConversationSummary;
  error?: string;
}

/**
 * Generate an AI summary of a conversation.
 * Uses the app-level Claude API key (extraction).
 */
export async function summarizeConversation(messages: ChatMessage[]): Promise<SummarizeResult> {
  if (!messages || messages.length === 0) {
    return { success: false, error: 'No messages to summarize' };
  }

  // Format conversation for the prompt
  const conversationText = messages
    .map((m) => `${m.role === 'user' ? 'Visitor' : 'Assistant'}: ${m.content}`)
    .join('\n');

  try {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      temperature: 0.3,
      system: SUMMARIZE_PROMPT,
      messages: [{ role: 'user', content: conversationText }],
    });

    const textContent = response.content.find((c) => c.type === 'text');
    const text = textContent?.text || '';

    // Parse JSON response
    const parsed = parseJsonResponse(text);
    if (!parsed) {
      return { success: false, error: 'Failed to parse summary response' };
    }

    // Validate required fields
    const summary: ConversationSummary = {
      visitor_name: typeof parsed.visitor_name === 'string' ? parsed.visitor_name : null,
      intent_tags: Array.isArray(parsed.intent_tags) ? parsed.intent_tags : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      extracted_facts: Array.isArray(parsed.extracted_facts) ? parsed.extracted_facts : [],
      next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps : [],
    };

    return { success: true, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Summarization failed: ${message}` };
  }
}

function parseJsonResponse(text: string): Record<string, unknown> | null {
  try {
    // Try direct JSON parse
    return JSON.parse(text);
  } catch {
    // Try extracting JSON from markdown code block
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        return null;
      }
    }
    return null;
  }
}
