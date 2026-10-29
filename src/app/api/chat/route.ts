import { NextResponse, after } from 'next/server';
import { companyEmailError } from '@/lib/chat/company-email-policy';
import { chatMailboxError } from '@/lib/chat/email-validation';
import { processChat, processChatStream } from '@/lib/chat/engine';
import { summarizeConversation } from '@/lib/chat/summarize';
import { createServerClient } from '@/lib/supabase/server';
import { getCorsHeaders } from '@/lib/cors';
import { resolveSourcePage } from '@/lib/integrations/ce-lead';
import type { ChatRequest, ChatMessage } from '@/types/chat';

// Trigger summary after this many messages (3 exchanges = 6 messages)
const SUMMARY_THRESHOLD = 6;

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin, 'POST, OPTIONS'),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const cors = getCorsHeaders(origin, 'POST, OPTIONS');

  try {
    const body: ChatRequest & { stream?: boolean } = await request.json();

    if (!body.workspace_id || !body.session_token || !body.message) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400, headers: cors });
    }

    if (body.message.length > 2000) {
      return NextResponse.json({ success: false, error: 'Message too long (max 2000 characters)' }, { status: 400, headers: cors });
    }

    const mailboxFailure = await chatMailboxError(body.workspace_id, body.message, request.headers.get('x-vercel-ip-country'), async () => {
      const {data,error} = await createServerClient().from('chat_sessions').select('messages')
        .eq('workspace_id',body.workspace_id).eq('session_token',body.session_token).maybeSingle();
      if (error) throw new Error('session_context_unavailable');
      return Array.isArray(data?.messages) ? data.messages : [];
    });
    if (mailboxFailure && typeof mailboxFailure !== 'string') {
      const answer = mailboxFailure.message;
      if (body.stream === true || request.headers.get('accept')?.includes('text/event-stream')) {
        const events = [{ type: 'token', content: answer }, { type: 'done', escalation_offered: false, booking_url: null, email_captured: false, pendingReview: true }];
        return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } });
      }
      return NextResponse.json({ success: true, answer, pendingReview: true, email_captured: false, confidence: 0, gap_detected: false, escalation_offered: false, booking_url: null, matched_pairs: [] }, { headers: cors });
    }
    if (mailboxFailure) return NextResponse.json({ success: false, error: mailboxFailure, reason: 'email_validation_required' }, { status: 422, headers: cors });

    const emailError = companyEmailError(body.workspace_id, body.message);
    if (emailError) {
      return NextResponse.json({ success: false, error: emailError, reason: 'work_email_required' }, { status: 422, headers: cors });
    }

    body.source_page = resolveSourcePage(body.source_page, request.headers.get('referer'));

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

// Allow the streamed answer and bounded persistence to finish within one invocation.
export const maxDuration = 60;
