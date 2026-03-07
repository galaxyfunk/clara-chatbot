import { NextResponse, after } from 'next/server';
import { processChat, processChatStream } from '@/lib/chat/engine';
import { summarizeConversation } from '@/lib/chat/summarize';
import { createServerClient } from '@/lib/supabase/server';
import type { ChatRequest, ChatMessage } from '@/types/chat';

// Trigger summary after this many messages (3 exchanges = 6 messages)
const SUMMARY_THRESHOLD = 6;

// ─── CORS ────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://chatbot.jakevibes.dev',
  'https://cloudemployee.com',
  'https://www.cloudemployee.com',
  'http://localhost:3000',
];

function getCorsHeaders(requestOrigin: string | null) {
  const origin = ALLOWED_ORIGINS.includes(requestOrigin ?? '')
    ? requestOrigin!
    : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const cors = getCorsHeaders(origin);

  try {
    const body: ChatRequest & { stream?: boolean } = await request.json();

    if (!body.workspace_id || !body.session_token || !body.message) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400, headers: cors });
    }

    if (body.message.length > 2000) {
      return NextResponse.json({ success: false, error: 'Message too long (max 2000 characters)' }, { status: 400, headers: cors });
    }

    // Detect if client wants streaming
    const wantsStream = body.stream === true
      || request.headers.get('accept')?.includes('text/event-stream');

    if (wantsStream) {
      const { stream, postProcess } = await processChatStream(body);

      // Post-processing (gap detection + session upsert) runs after response is sent
      after(postProcess);

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          ...cors,
        },
      });
    }

    // Non-streaming path (existing behavior)
    const response = await processChat(body);

    // Trigger summary generation in background after enough messages
    if (response.session_id && response.message_count && response.message_count >= SUMMARY_THRESHOLD) {
      const sessionId = response.session_id;
      after(async () => {
        try {
          const supabase = createServerClient();
          // Check if already summarized
          const { data: session } = await supabase
            .from('chat_sessions')
            .select('messages, metadata')
            .eq('id', sessionId)
            .single();

          if (!session) return;

          const metadata = (session.metadata as Record<string, unknown>) || {};
          if (metadata.summarized_at) return; // Already summarized

          const messages = session.messages as ChatMessage[];
          const result = await summarizeConversation(messages);

          if (result.success && result.summary) {
            await supabase
              .from('chat_sessions')
              .update({
                metadata: {
                  ...metadata,
                  summary: result.summary,
                  summarized_at: new Date().toISOString(),
                },
              })
              .eq('id', sessionId);
          }
        } catch {
          // Silently fail - this is background work
        }
      });
    }

    return NextResponse.json({ success: true, ...response }, { headers: cors });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500, headers: cors });
  }
}

export const maxDuration = 30;
