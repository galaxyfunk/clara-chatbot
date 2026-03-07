import { createServerClient } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/embed';
import { chatCompletion, chatCompletionStream, type LLMMessage } from '@/lib/llm/provider';
import { decrypt } from '@/lib/encryption';
import { summarizeConversation } from '@/lib/chat/summarize';
import type { ChatRequest, ChatResponse, ChatMessage } from '@/types/chat';
import type { WorkspaceSettings } from '@/types/workspace';
import { v4 as uuidv4 } from 'uuid';

// Trigger summary after this many messages (3 exchanges = 6 messages)
const SUMMARY_THRESHOLD = 6;

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
}

async function prepareChatContext(request: ChatRequest, streaming: boolean = false): Promise<ChatContext> {
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
      };
    }
  }

  // 9. Build LLM messages
  const llmMessages = buildChatPrompt(settings, request.message, matchedPairs, previousMessages, isConfident, streaming);

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
  const parsed = parseLLMResponse(llmResponse.content);

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

  // ── Email capture + HubSpot upsert ──
  if (upsertedSession) {
    const detectedEmail = extractEmail(request.message);
    if (detectedEmail) {
      const { data: sessionCheck } = await supabase
        .from('chat_sessions')
        .select('visitor_email')
        .eq('id', upsertedSession.id)
        .single();

      if (!sessionCheck?.visitor_email) {
        await supabase
          .from('chat_sessions')
          .update({ visitor_email: detectedEmail })
          .eq('id', upsertedSession.id);

        if (context.settings.hubspot_enabled) {
          const { upsertHubSpotContact } = await import('@/lib/integrations/hubspot');
          const hubspotKey = process.env.HUBSPOT_API_KEY;
          if (hubspotKey) {
            const sessionUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/sessions`;

            await upsertHubSpotContact({
              email: detectedEmail,
              lead_source: 'Clara Chatbot',
              lifecyclestage: 'marketingqualifiedlead',
              clara_session_url: sessionUrl,
            }, hubspotKey);
          }
        }
      }
    }
  }

  return {
    answer: parsed.answer,
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
  const context = await prepareChatContext(request, true); // streaming = true

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

  // SSE padding to push past TCP buffer thresholds (~1460 bytes MSS)
  const SSE_PADDING = `: ${' '.repeat(256)}\n\n`;

  // Create SSE stream that wraps LLM tokens
  const sseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = llmStream.getReader();
      try {
        // Connection-priming comment to establish stream
        controller.enqueue(encoder.encode(`: stream-start\n\n`));

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Send token event
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'token', content: value })}\n\n`)
          );
          // Flush hint: pad with SSE comment to push past TCP buffer
          controller.enqueue(encoder.encode(SSE_PADDING));
        }

        // Use context-based escalation for streaming mode
        const escalationOffered = !context.isConfident && context.settings.escalation_enabled;

        // Send final metadata event
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'done',
          escalation_offered: escalationOffered,
          booking_url: escalationOffered
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

  // Escalation flag for use in postProcess
  const streamingEscalation = !context.isConfident && context.settings.escalation_enabled;

  // Return stream + a postProcess function for after()
  return {
    stream: sseStream,
    postProcess: async () => {
      const supabase = createServerClient();

      // Wait for full response text (plain text in streaming mode)
      const fullText = await getFullResponse();

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
            ai_answer: fullText, // Plain text answer
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
        content: fullText, // Plain text answer
        timestamp: new Date().toISOString(),
        gap_detected: !context.isConfident,
        matched_qa_ids: context.matchedPairs.map(m => m.id),
        confidence: context.confidence,
        escalation_offered: streamingEscalation,
      };

      const updatedMessages = [...context.previousMessages, userMessage, assistantMessage];

      console.log('[Summary Debug] Starting postProcess', {
        messageCount: updatedMessages.length,
        threshold: SUMMARY_THRESHOLD,
        meetsThreshold: updatedMessages.length >= SUMMARY_THRESHOLD,
      });

      const upsertResult = await supabase.from('chat_sessions').upsert({
        workspace_id: request.workspace_id,
        session_token: request.session_token,
        messages: updatedMessages,
        escalated: streamingEscalation || context.existingSession?.escalated || false,
        escalated_at: streamingEscalation
          ? new Date().toISOString()
          : context.existingSession?.escalated_at ?? null,
      }, { onConflict: 'workspace_id,session_token' }).select('id, metadata').single();

      console.log('[Summary Debug] Upsert result:', JSON.stringify(upsertResult, null, 2));

      const upsertedSession = upsertResult.data;

      // Summary generation (same logic as non-streaming path)
      if (upsertedSession && updatedMessages.length >= SUMMARY_THRESHOLD) {
        console.log('[Summary Debug] Entering summary block', {
          sessionId: upsertedSession.id,
          hasMetadata: !!upsertedSession.metadata,
          metadata: upsertedSession.metadata,
        });

        try {
          const metadata = (upsertedSession.metadata as Record<string, unknown>) || {};

          // Skip if already summarized
          if (!metadata.summarized_at) {
            console.log('[Summary Debug] Calling summarizeConversation with', updatedMessages.length, 'messages');

            const result = await summarizeConversation(updatedMessages);

            console.log('[Summary Debug] Summary result:', {
              success: result.success,
              hasSummary: !!result.summary,
              error: result.error,
            });

            if (result.success && result.summary) {
              const updateResult = await supabase
                .from('chat_sessions')
                .update({
                  metadata: {
                    ...metadata,
                    summary: result.summary,
                    summarized_at: new Date().toISOString(),
                  },
                })
                .eq('id', upsertedSession.id);

              console.log('[Summary Debug] Metadata update result:', JSON.stringify(updateResult, null, 2));
            }
          } else {
            console.log('[Summary Debug] Skipping - already summarized at:', metadata.summarized_at);
          }
        } catch (error) {
          console.error('[Summary Debug] Error in summary generation:', error);
        }
      } else {
        console.log('[Summary Debug] Skipping summary block', {
          hasUpsertedSession: !!upsertedSession,
          messageCount: updatedMessages.length,
          threshold: SUMMARY_THRESHOLD,
        });
      }

      // ── Email capture + HubSpot upsert ──
      if (upsertedSession) {
        const detectedEmail = extractEmail(request.message);
        if (detectedEmail) {
          const { data: sessionCheck } = await supabase
            .from('chat_sessions')
            .select('visitor_email')
            .eq('id', upsertedSession.id)
            .single();

          if (!sessionCheck?.visitor_email) {
            await supabase
              .from('chat_sessions')
              .update({ visitor_email: detectedEmail })
              .eq('id', upsertedSession.id);

            if (context.settings.hubspot_enabled) {
              const { upsertHubSpotContact } = await import('@/lib/integrations/hubspot');
              const hubspotKey = process.env.HUBSPOT_API_KEY;
              if (hubspotKey) {
                const metadata = (upsertedSession.metadata as Record<string, unknown>) || {};
                const summaryData = metadata.summary as Record<string, unknown> | undefined;
                const summaryText = typeof summaryData?.summary_text === 'string' ? summaryData.summary_text : undefined;
                const sessionUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/sessions`;

                await upsertHubSpotContact({
                  email: detectedEmail,
                  lead_source: 'Clara Chatbot',
                  lifecyclestage: 'marketingqualifiedlead',
                  clara_chat_summary: summaryText,
                  clara_session_url: sessionUrl,
                }, hubspotKey);
              }
            }
          }
        }
      }
    },
  };
}

// ─── Email Extraction ────────────────────────────────────────────────

function extractEmail(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase() : null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function appendUtmParams(url: string | null): string | null {
  if (!url) return null;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}utm_source=clara&utm_medium=chatbot`;
}

function buildChatPrompt(
  settings: WorkspaceSettings, userMessage: string, matchedPairs: MatchedPair[],
  previousMessages: ChatMessage[], _isConfident: boolean, streaming: boolean = false
): LLMMessage[] {
  const contextBlock = matchedPairs.length > 0
    ? matchedPairs.map((m, i) =>
        `[Q${i + 1}] ${m.question}\n[A${i + 1}] ${m.answer}\n(Category: ${m.category}, Relevance: ${(m.similarity * 100).toFixed(0)}%)`
      ).join('\n\n')
    : 'No relevant Q&A pairs found in the knowledge base.';

  // Different response format for streaming vs non-streaming
  let responseFormatSection: string;

  if (streaming) {
    responseFormatSection = `## Response Format
Respond naturally and conversationally. Do not use JSON format. Just write your answer as plain text.
Keep responses concise — 2-4 sentences for simple questions, more for complex ones.
${settings.escalation_enabled && settings.booking_url ? `Only suggest booking a call if the visitor explicitly asks to speak with someone, provides specific urgent hiring requirements, or asks "how do I get started" after discussing their needs.` : ''}`;
  } else {
    responseFormatSection = `${settings.escalation_enabled ? `## Escalation Rules
Set escalation_offered to true ONLY when the visitor explicitly signals readiness to engage with a human. This means:
- They directly ask to speak with someone or book a call
- They provide specific hiring requirements with urgency (e.g., "We need 5 React devs by next month")
- They explicitly ask "how do I get started" or "what are next steps" after already discussing their needs

Do NOT set escalation_offered to true for:
- General pricing questions ("How does pricing work?")
- Role availability questions ("Do you have React developers?")
- Process questions ("How does the onboarding work?")
- Comparison questions ("How are you different from Toptal?")

These are normal informational questions. Escalation should be rare — reserved for visitors who are clearly ready to convert.` : ''}

## Response Format
Respond in this exact JSON format (no markdown fences, raw JSON only):
{
  "answer": "Your conversational answer here",
  "escalation_offered": false
}

${settings.escalation_enabled && settings.booking_url ? `When escalation_offered is true, naturally weave a booking suggestion into your answer.` : ''}`;
  }

  const systemPrompt = `${settings.personality_prompt}

## Knowledge Base Context
${contextBlock}

## Response Rules
1. Answer using the knowledge base context above as your primary source.
2. If the knowledge base doesn't fully cover the question, use your general knowledge to give a helpful answer — but be upfront when you're going beyond what's in the knowledge base. Never just say "I don't know" and stop.
3. Keep responses SHORT — 2-3 sentences maximum. No paragraphs. Be conversational and direct.
4. End every response with a qualifying question to learn more about the visitor's needs (role type, tech stack, team size, timeline, hiring experience).
5. Never use bullet points or numbered lists in your answer. Write in natural conversational sentences.

${responseFormatSection}`;

  const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

  // Sliding window: last 20 messages
  const recentHistory = previousMessages.slice(-20);
  for (const msg of recentHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({ role: 'user', content: userMessage });
  return messages;
}

interface ParsedResponse { answer: string; escalation_offered: boolean; }

function parseLLMResponse(rawContent: string): ParsedResponse {
  try {
    const cleaned = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      answer: parsed.answer || rawContent,
      escalation_offered: Boolean(parsed.escalation_offered),
    };
  } catch {
    return { answer: rawContent, escalation_offered: false };
  }
}
