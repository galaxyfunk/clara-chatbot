import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, ConversationSummary } from '@/types/chat';

const SUMMARIZE_PROMPT = `You are analyzing a customer support conversation. Extract structured information from the chat.

Return a JSON object with these exact fields:
- summary: A 1-2 sentence summary of what the conversation was about
- visitor_intent: A short phrase describing the visitor's primary intent (e.g., "pricing inquiry", "technical support", "demo request")
- topics_discussed: Array of topics covered in the conversation
- sentiment: One of "positive", "neutral", or "negative" based on the visitor's tone
- buying_stage: One of "awareness", "consideration", "decision", or "unknown"
- contact_info: Object with { name: string|null, email: string|null, company: string|null }
- action_items: Array of follow-up actions if any were mentioned

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

    // Parse contact_info object
    const contactInfo = parsed.contact_info as Record<string, unknown> | undefined;

    // Validate sentiment
    const validSentiments = ['positive', 'neutral', 'negative'] as const;
    const sentiment = validSentiments.includes(parsed.sentiment as typeof validSentiments[number])
      ? (parsed.sentiment as 'positive' | 'neutral' | 'negative')
      : 'neutral';

    // Validate buying_stage
    const validStages = ['awareness', 'consideration', 'decision', 'unknown'] as const;
    const buyingStage = validStages.includes(parsed.buying_stage as typeof validStages[number])
      ? (parsed.buying_stage as 'awareness' | 'consideration' | 'decision' | 'unknown')
      : 'unknown';

    // Build validated summary object
    const summary: ConversationSummary = {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      visitor_intent: typeof parsed.visitor_intent === 'string' ? parsed.visitor_intent : '',
      topics_discussed: Array.isArray(parsed.topics_discussed) ? parsed.topics_discussed : [],
      sentiment,
      buying_stage: buyingStage,
      contact_info: {
        name: typeof contactInfo?.name === 'string' ? contactInfo.name : null,
        email: typeof contactInfo?.email === 'string' ? contactInfo.email : null,
        company: typeof contactInfo?.company === 'string' ? contactInfo.company : null,
      },
      action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
      generated_at: new Date().toISOString(),
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
