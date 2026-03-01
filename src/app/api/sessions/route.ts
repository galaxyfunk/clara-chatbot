import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
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

    // DEBUG: Log workspace ID from owner lookup
    console.log('[Sessions Debug] User ID:', user.id);
    console.log('[Sessions Debug] Workspace ID from owner_id lookup:', workspaceId);

    // DEBUG: Query distinct workspace_ids from sessions to compare
    const { data: distinctWorkspaceIds } = await supabase
      .from('chat_sessions')
      .select('workspace_id')
      .limit(10);
    console.log('[Sessions Debug] Workspace IDs in chat_sessions table:',
      distinctWorkspaceIds?.map(r => r.workspace_id) || 'none');

    // DEBUG: Count total sessions in DB
    const { count: totalSessions } = await supabase
      .from('chat_sessions')
      .select('*', { count: 'exact', head: true });
    console.log('[Sessions Debug] Total sessions in DB:', totalSessions);

    // 3. Parse search param
    const url = new URL(request.url);
    const searchParam = url.searchParams.get('search')?.trim();

    // 4. Get sessions with optional search
    const query = supabase
      .from('chat_sessions')
      .select('id, session_token, messages, metadata, escalated, escalated_at, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(50); // Cap for performance

    // Note: Search in JSONB messages using text cast
    // We do client-side filtering as Supabase PostgREST doesn't support ::text casting well
    const { data: sessions, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch sessions: ${error.message}`);
    }

    // 5. Filter by search if provided (client-side JSONB search)
    let filteredSessions = sessions || [];
    if (searchParam) {
      const searchLower = searchParam.toLowerCase();
      filteredSessions = filteredSessions.filter((session) => {
        if (!Array.isArray(session.messages)) return false;
        return session.messages.some((msg: { content?: string }) =>
          msg.content?.toLowerCase().includes(searchLower)
        );
      });
    }

    // 6. Add message_count to each session
    const enrichedSessions = filteredSessions.map((session) => ({
      ...session,
      message_count: Array.isArray(session.messages) ? session.messages.length : 0,
    }));

    return NextResponse.json({ success: true, sessions: enrichedSessions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
