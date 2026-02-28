import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';
import { summarizeConversation } from '@/lib/chat/summarize';
import type { ChatMessage } from '@/types/chat';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    // 1. Get authenticated user
    const authClient = await createAuthClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get user's workspace
    const supabase = createServerClient();
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .single();
    if (wsError || !workspace) {
      return NextResponse.json({ success: false, error: 'Workspace not found' }, { status: 404 });
    }
    const workspaceId = workspace.id;

    // 3. Parse and validate body
    const body = await request.json();
    const sessionId = body.session_id;

    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'session_id is required' }, { status: 400 });
    }

    // 4. Get session with messages
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id, messages, metadata')
      .eq('id', sessionId)
      .eq('workspace_id', workspaceId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }

    const messages = session.messages as ChatMessage[];
    if (!messages || messages.length === 0) {
      return NextResponse.json({ success: false, error: 'Session has no messages' }, { status: 400 });
    }

    // 5. Generate summary
    const result = await summarizeConversation(messages);

    if (!result.success || !result.summary) {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to generate summary',
      }, { status: 500 });
    }

    // 6. Store summary in session metadata
    const currentMetadata = (session.metadata as Record<string, unknown>) || {};
    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({
        metadata: {
          ...currentMetadata,
          summary: result.summary,
          summarized_at: new Date().toISOString(),
        },
      })
      .eq('id', sessionId);

    if (updateError) {
      return NextResponse.json({
        success: false,
        error: `Failed to save summary: ${updateError.message}`,
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, summary: result.summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
