import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
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

    // 3. Run aggregate queries
    const [pairsResult, sessionsResult, gapsResult, escalationsResult] = await Promise.all([
      // Total active Q&A pairs
      supabase
        .from('qa_pairs')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('is_active', true),
      // Total sessions
      supabase
        .from('chat_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId),
      // Open gaps
      supabase
        .from('qa_gaps')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('status', 'open'),
      // Escalated sessions
      supabase
        .from('chat_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('escalated', true),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        totalPairs: pairsResult.count || 0,
        totalSessions: sessionsResult.count || 0,
        openGaps: gapsResult.count || 0,
        escalations: escalationsResult.count || 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
