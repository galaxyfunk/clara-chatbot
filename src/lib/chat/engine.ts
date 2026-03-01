import { createServerClient } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/embed';
import { chatCompletion, chatCompletionStream, type LLMMessage } from '@/lib/llm/provider';
import { decrypt } from '@/lib/encryption';
import type { ChatRequest, ChatResponse, ChatMessage } from '@/types/chat';
import type { WorkspaceSettings } from '@/types/workspace';
import { v4 as uuidv4 } from 'uuid';

interface MatchedPair {
  id: string;
  question: string;
  answer: string;
  category: string;
  similarity: number;
}

// ─── Rate Limiting (In-Memory) ──────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(sessionToken: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const maxMessages = 100;
  const entry = rateLimitMap.get(sessionToken);
  if (!entry || now - entry.windowStart > windowMs) {
    rateLimitMap.set(sessionToken, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= maxMessages) return false;
  entry.count++;
  return true;
}

// ─── Chat Context (Shared Pre-LLM Logic) ────────────────────────────

interface ChatContext {
  settings: WorkspaceSettings;
  apiKeyRow: { provider: string; model: string; encrypted_key: string };
  rawApiKey: string;
  matchedPairs: MatchedPair[];
  isConfident: boolean;
  confidence: number;
  topMatch: MatchedPair | null;
  previousMessages: ChatMessage[];
  existingSession: { id: string; escalated: boolean; escalated_at: string | null } | null;
  llmMessages: LLMMessage[];
  fallbackAnswer?: string;
  fallbackChips?: string[];
}

async function prepareChatContext(request: ChatRequest): Promise<ChatContext> {
  const supabase = createServerClient();

  // 1. Rate limit check
  if (!checkRateLimit(request.session_token)) {
    return {
      settings: {} as WorkspaceSettings,
      apiKeyRow: { provider: '', model: '', encrypted_key: '' },
      rawApiKey: '',
      matchedPairs: [],
      isConfident: false,
      confidence: 0,
      topMatch: null,
      previousMessages: [],
      existingSession: null,
      llmMessages: [],
      fallbackAnswer: "You've sent a lot of messages! Please wait a bit before sending more.",
      fallbackChips: [],
    };
  }

  // 2. Get workspace
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces').select('*').eq('id', request.workspace_id).single();
  if (wsError || !workspace) throw new Error('Workspace not found');
  const settings: WorkspaceSettings = workspace.settings;

  // 3. Zero Q&A gate
  const { count } = await supabase
    .from('qa_pairs')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', request.workspace_id)
    .eq('is_active', true);

  if (count === 0) {
    return {
      settings,
      apiKeyRow: { provider: '', model: '', encrypted_key: '' },
      rawApiKey: '',
      matchedPairs: [],
      isConfident: false,
      confidence: 0,
      topMatch: null,
      previousMessages: [],
      existingSession: null,
      llmMessages: [],
      fallbackAnswer: `I'm not set up yet! My knowledge base is empty — add some Q&A pairs in the dashboard to get ${settings.display_name} started.`,
      fallbackChips: [],
    };
  }

  // 4. Get default API key
  const { data: apiKeyRow, error: keyError } = await supabase
    .from('api_keys').select('*')
    .eq('workspace_id', request.workspace_id)
    .eq('is_default', true).eq('is_active', true).single();

  if (keyError || !apiKeyRow) {
    throw new Error(`Add an API key in Settings to start chatting with ${settings.display_name}.`);
  }
  const rawApiKey = decrypt(apiKeyRow.encrypted_key);

  // 5. Embed question
  const questionEmbedding = await generateEmbedding(request.message);

  // 6. Vector search
  const { data: matches, error: searchError } = await supabase.rpc('search_qa_pairs', {
    p_workspace_id: request.workspace_id, query_embedding: questionEmbedding,
    match_threshold: 0.5, match_count: 5,
  });
  if (searchError) throw new Error(`Search failed: ${searchError.message}`);

  const matchedPairs: MatchedPair[] = (matches ?? []) as MatchedPair[];
  const topMatch = matchedPairs[0] ?? null;
  const confidence = topMatch?.similarity ?? 0;
  const isConfident = confidence >= settings.confidence_threshold;

  // 7. Get conversation history
  const { data: existingSession } = await supabase
    .from('chat_sessions')
    .select('id, messages, escalated, escalated_at')
    .eq('workspace_id', request.workspace_id)
    .eq('session_token', request.session_token).single();

  const previousMessages: ChatMessage[] = existingSession?.messages ?? [];

  // 8. Idempotency check
  if (request.message_id && previousMessages.some(m => m.message_id === request.message_id)) {
    const msgIndex = previousMessages.findIndex(m => m.message_id === request.message_id);
    const existingResponse = previousMessages[msgIndex + 1];
    if (existingResponse && existingResponse.role === 'assistant') {
      return {
        settings,
        apiKeyRow,
        rawApiKey,
        matchedPairs,
        isConfident,
        confidence,
        topMatch,
        previousMessages,
        existingSession: existingSession ? {
          id: existingSession.id,
          escalated: existingSession.escalated,
          escalated_at: existingSession.escalated_at,
        } : null,
        llmMessages: [],
        fallbackAnswer: existingResponse.content,
        fallbackChips: existingResponse.suggestion_chips ?? [],
      };
    }
  }

  // 9. Build LLM messages
  const llmMessages = buildChatPrompt(settings, request.message, matchedPairs, previousMessages, isConfident);

  return {
    settings,
    apiKeyRow,
    rawApiKey,
    matchedPairs,
    isConfident,
    confidence,
    topMatch,
    previousMessages,
    existingSession: existingSession ? {
      id: existingSession.id,
      escalated: existingSession.escalated,
      escalated_at: existingSession.escalated_at,
    } : null,
    llmMessages,
  };
}

// ─── Non-Streaming Chat (Original) ──────────────────────────────────

export async function processChat(request: ChatRequest): Promise<ChatResponse> {
  const context = await prepareChatContext(request);

  // Handle fallback cases (rate limit, zero QA, idempotent hit)
  if (context.fallbackAnswer !== undefined) {
    return {
      answer: context.fallbackAnswer,
      suggestion_chips: context.fallbackChips ?? [],
      confidence: context.confidence,
      gap_detected: false,
      escalation_offered: false,
      booking_url: null,
      matched_pairs: [],
    };
  }

  const supabase = createServerClient();

  // Call LLM
  const llmResponse = await chatCompletion(
    context.apiKeyRow.provider,
    context.apiKeyRow.model,
    context.rawApiKey,
    context.llmMessages,
    { maxTokens: 1024, temperature: 0.7 }
  );

  // Parse response
  const parsed = parseLLMResponse(llmResponse.content, context.settings);

  // Gap detection with dedup
  const gapDetected = !context.isConfident;
  if (gapDetected) {
    const { data: existingGaps } = await supabase
      .from('qa_gaps').select('id, question')
      .eq('workspace_id', request.workspace_id).eq('status', 'open');

    const isDuplicateGap = (existingGaps ?? []).some(g =>
      g.question.toLowerCase().trim() === request.message.toLowerCase().trim()
    );

    if (!isDuplicateGap) {
      await supabase.from('qa_gaps').insert({
        workspace_id: request.workspace_id,
        question: request.message,
        ai_answer: parsed.answer,
        best_match_id: context.topMatch?.id ?? null,
        similarity_score: context.confidence,
        session_id: context.existingSession?.id ?? null,
        status: 'open',
      });
    }
  }

  // Upsert chat session
  const userMessage: ChatMessage = {
    message_id: request.message_id || uuidv4(),
    role: 'user',
    content: request.message,
    timestamp: new Date().toISOString(),
  };
  const assistantMessage: ChatMessage = {
    message_id: uuidv4(),
    role: 'assistant',
    content: parsed.answer,
    timestamp: new Date().toISOString(),
    suggestion_chips: parsed.suggestion_chips,
    gap_detected: gapDetected,
    matched_qa_ids: context.matchedPairs.map(m => m.id),
    confidence: context.confidence,
    escalation_offered: parsed.escalation_offered,
  };

  const updatedMessages = [...context.previousMessages, userMessage, assistantMessage];

  const { data: upsertedSession, error: sessionError } = await supabase.from('chat_sessions').upsert({
    workspace_id: request.workspace_id,
    session_token: request.session_token,
    messages: updatedMessages,
    escalated: parsed.escalation_offered || context.existingSession?.escalated || false,
    escalated_at: parsed.escalation_offered ? new Date().toISOString() : context.existingSession?.escalated_at ?? null,
  }, { onConflict: 'workspace_id,session_token' }).select('id').single();

  if (sessionError) {
    console.error('[Session Upsert Error]', sessionError);
  }

  return {
    answer: parsed.answer,
    suggestion_chips: parsed.suggestion_chips,
    confidence: context.confidence,
    gap_detected: gapDetected,
    escalation_offered: parsed.escalation_offered,
    booking_url: parsed.escalation_offered ? appendUtmParams(context.settings.booking_url) : null,
    matched_pairs: context.matchedPairs.map(m => ({ id: m.id, question: m.question, similarity: m.similarity })),
    session_id: upsertedSession?.id || context.existingSession?.id,
    message_count: updatedMessages.length,
  };
}

// ─── Streaming Chat (SSE) ───────────────────────────────────────────

export interface StreamingChatResult {
  stream: ReadableStream<Uint8Array>;
  postProcess: () => Promise<void>;
}

export async function processChatStream(request: ChatRequest): Promise<StreamingChatResult> {
  const encoder = new TextEncoder();
  const context = await prepareChatContext(request);

  // Handle fallback cases (rate limit, zero QA, idempotent hit)
  if (context.fallbackAnswer !== undefined) {
    const fallbackStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'token', content: context.fallbackAnswer })}\n\n`
        ));
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({
            type: 'done',
            suggestion_chips: context.fallbackChips ?? [],
            escalation_offered: false,
            booking_url: null,
          })}\n\n`
        ));
        controller.close();
      },
    });
    return {
      stream: fallbackStream,
      postProcess: async () => {},
    };
  }

  // Stream from LLM
  const { stream: llmStream, getFullResponse } = await chatCompletionStream(
    context.apiKeyRow.provider,
    context.apiKeyRow.model,
    context.rawApiKey,
    context.llmMessages,
    { maxTokens: 1024, temperature: 0.7 }
  );

  // Create SSE stream that wraps LLM tokens
  const sseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = llmStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'token', content: value })}\n\n`)
          );
        }

        // Stream complete — get full text and parse for metadata
        const fullText = await getFullResponse();
        const parsed = parseLLMResponse(fullText, context.settings);

        // Send final metadata event
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'done',
          suggestion_chips: parsed.suggestion_chips,
          escalation_offered: parsed.escalation_offered,
          booking_url: parsed.escalation_offered
            ? appendUtmParams(context.settings.booking_url)
            : null,
        })}\n\n`));

        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Stream interrupted' })}\n\n`)
        );
        controller.close();
      }
    },
  });

  // Return stream + a postProcess function for after()
  return {
    stream: sseStream,
    postProcess: async () => {
      const supabase = createServerClient();

      // Wait for full response text
      const fullText = await getFullResponse();
      const parsed = parseLLMResponse(fullText, context.settings);

      // Gap detection (same logic as non-streaming)
      if (!context.isConfident) {
        const { data: existingGaps } = await supabase
          .from('qa_gaps').select('id, question')
          .eq('workspace_id', request.workspace_id).eq('status', 'open');

        const isDuplicateGap = (existingGaps ?? []).some(g =>
          g.question.toLowerCase().trim() === request.message.toLowerCase().trim()
        );

        if (!isDuplicateGap) {
          await supabase.from('qa_gaps').insert({
            workspace_id: request.workspace_id,
            question: request.message,
            ai_answer: parsed.answer,
            best_match_id: context.topMatch?.id ?? null,
            similarity_score: context.confidence,
            session_id: context.existingSession?.id ?? null,
            status: 'open',
          });
        }
      }

      // Session upsert
      const userMessage: ChatMessage = {
        message_id: request.message_id || uuidv4(),
        role: 'user',
        content: request.message,
        timestamp: new Date().toISOString(),
      };
      const assistantMessage: ChatMessage = {
        message_id: uuidv4(),
        role: 'assistant',
        content: parsed.answer,
        timestamp: new Date().toISOString(),
        suggestion_chips: parsed.suggestion_chips,
        gap_detected: !context.isConfident,
        matched_qa_ids: context.matchedPairs.map(m => m.id),
        confidence: context.confidence,
        escalation_offered: parsed.escalation_offered,
      };

      const updatedMessages = [...context.previousMessages, userMessage, assistantMessage];

      await supabase.from('chat_sessions').upsert({
        workspace_id: request.workspace_id,
        session_token: request.session_token,
        messages: updatedMessages,
        escalated: parsed.escalation_offered || context.existingSession?.escalated || false,
        escalated_at: parsed.escalation_offered
          ? new Date().toISOString()
          : context.existingSession?.escalated_at ?? null,
      }, { onConflict: 'workspace_id,session_token' });
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function appendUtmParams(url: string | null): string | null {
  if (!url) return null;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}utm_source=clara&utm_medium=chatbot`;
}

function buildChatPrompt(
  settings: WorkspaceSettings, userMessage: string, matchedPairs: MatchedPair[],
  previousMessages: ChatMessage[], _isConfident: boolean
): LLMMessage[] {
  const contextBlock = matchedPairs.length > 0
    ? matchedPairs.map((m, i) =>
        `[Q${i + 1}] ${m.question}\n[A${i + 1}] ${m.answer}\n(Category: ${m.category}, Relevance: ${(m.similarity * 100).toFixed(0)}%)`
      ).join('\n\n')
    : 'No relevant Q&A pairs found in the knowledge base.';

  const systemPrompt = `${settings.personality_prompt}

## Knowledge Base Context
${contextBlock}

## Response Rules
1. Answer the user's question using ONLY the knowledge base context above. Do not make up information.
2. If the context doesn't fully answer the question, be honest: provide what you can and acknowledge what you don't know.
3. Keep responses concise and conversational — 2-4 sentences for simple questions, more for complex ones.

## Suggestion Chip Rules
Generate exactly ${settings.max_suggestion_chips} suggestion chips. These are NOT generic follow-ups. Each chip should do ONE of:
(a) Help the visitor clarify their specific needs
(b) Surface high-value information from the knowledge base that's related to their question
(c) Guide toward booking a call IF buying intent is present

${settings.escalation_enabled ? `## Escalation Rules
If the user shows buying intent (asking about pricing, timelines, team availability, "how do I get started", comparing options), include a booking suggestion and set escalation to true.` : ''}

## Response Format
Respond in this exact JSON format (no markdown fences, raw JSON only):
{
  "answer": "Your conversational answer here",
  "suggestion_chips": ["Strategic follow-up 1?", "Strategic follow-up 2?", "Strategic follow-up 3?"],
  "escalation_offered": false
}

${settings.escalation_enabled && settings.booking_url ? `When escalation_offered is true, naturally weave a booking suggestion into your answer.` : ''}`;

  const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

  // Sliding window: last 20 messages
  const recentHistory = previousMessages.slice(-20);
  for (const msg of recentHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({ role: 'user', content: userMessage });
  return messages;
}

interface ParsedResponse { answer: string; suggestion_chips: string[]; escalation_offered: boolean; }

function parseLLMResponse(rawContent: string, settings: WorkspaceSettings): ParsedResponse {
  try {
    const cleaned = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      answer: parsed.answer || rawContent,
      suggestion_chips: Array.isArray(parsed.suggestion_chips) ? parsed.suggestion_chips.slice(0, settings.max_suggestion_chips) : [],
      escalation_offered: Boolean(parsed.escalation_offered),
    };
  } catch {
    return { answer: rawContent, suggestion_chips: [], escalation_offered: false };
  }
}
