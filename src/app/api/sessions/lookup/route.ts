import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { buildShortSummary, readShortSummary } from '@/lib/chat/short-summary';
import { isSyntheticSession } from '@/lib/chat/synthetic';

/**
 * Server-to-server lookup used by cloudemployee.io (lead cards) and Growth OS
 * (/leads/[id]/clara). Keyed by the visitor's session_token: a random UUID
 * that only the visitor's browser (and our own lead records) ever hold, so it
 * works like a capability link. No CORS headers: browsers on other origins
 * cannot read it. ?include=transcript adds the messages for Growth OS, which
 * shows them only behind its cloudemployee.io Google sign-in.
 *
 * The response never contains the visitor's email address.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspace_id')?.trim() ?? '';
  const token = url.searchParams.get('session_token')?.trim() ?? '';
  if (!UUID.test(workspaceId) || !UUID.test(token)) {
    return NextResponse.json({ success: false, error: 'workspace_id and session_token are required' }, { status: 400 });
  }
  const supabase = createServerClient();
  const { data: session, error } = await supabase
    .from('chat_sessions')
    .select('id, messages, metadata, summary, visitor_name, visitor_email, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .eq('session_token', token)
    .maybeSingle();
  if (error) return NextResponse.json({ success: false, error: 'lookup_failed' }, { status: 500 });
  if (!session || isSyntheticSession(session)) return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });

  const messages = Array.isArray(session.messages) ? session.messages as Array<{ role: string; content: string; timestamp?: string }> : [];
  let summary = readShortSummary(session.summary);
  if (!summary || summary.message_count < messages.length) {
    summary = buildShortSummary(session);
    if (summary) {
      const { error: writeError } = await supabase.from('chat_sessions').update({ summary }).eq('id', session.id);
      if (writeError) console.error('[Session lookup] summary persist failed:', writeError.code ?? 'unknown');
    }
  }
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://clara.cloudemployee.io').replace(/\/$/, '');
  const includeTranscript = url.searchParams.get('include') === 'transcript';
  return NextResponse.json({
    success: true,
    session: {
      id: session.id,
      created_at: session.created_at,
      updated_at: session.updated_at,
      message_count: messages.length,
      visitor_message_count: messages.filter(m => m.role === 'user').length,
      summary: summary?.text ?? null,
      summary_source: summary?.source ?? null,
      visitor_name: session.visitor_name ?? null,
      email_captured: Boolean(session.visitor_email),
      brief: (session.metadata as Record<string, unknown> | null)?.brief ?? null,
      dashboard_url: `${base}/dashboard/sessions/${session.id}`,
      ...(includeTranscript ? { messages: messages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp ?? null })) } : {}),
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
