import { NextResponse, after } from 'next/server';
import { processChat } from '@/lib/chat/engine';
import { summarizeConversation } from '@/lib/chat/summarize';
import { createServerClient } from '@/lib/supabase/server';
import type { ChatRequest, ChatMessage } from '@/types/chat';

// Trigger summary after this many messages (3 exchanges = 6 messages)
const SUMMARY_THRESHOLD = 6;

export async function POST(request: Request) {
  try {
    const body: ChatRequest = await request.json();

    if (!body.workspace_id || !body.session_token || !body.message) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    if (body.message.length > 2000) {
      return NextResponse.json({ success: false, error: 'Message too long (max 2000 characters)' }, { status: 400 });
    }

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

    return NextResponse.json({ success: true, ...response });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const maxDuration = 30;
