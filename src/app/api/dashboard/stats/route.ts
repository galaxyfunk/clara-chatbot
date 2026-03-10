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

    // 3. Read optional period filter for bookings
    const period = new URL(request.url).searchParams.get('period') ?? 'all';

    // 4. Build bookings query with optional date filter
    let bookingsQuery = supabase
      .from('chat_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .not('booked_at', 'is', null);

    if (period === 'week') {
      bookingsQuery = bookingsQuery.gte('booked_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    } else if (period === 'month') {
      bookingsQuery = bookingsQuery.gte('booked_at', new Date(new Date().setDate(1)).toISOString());
    } else if (period === '30days') {
      bookingsQuery = bookingsQuery.gte('booked_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    }

    // 5. Run aggregate queries
    const [pairsResult, sessionsResult, gapsResult, escalationsResult, bookingsResult] = await Promise.all([
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
      // Booked sessions
      bookingsQuery,
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        totalPairs: pairsResult.count || 0,
        totalSessions: sessionsResult.count || 0,
        openGaps: gapsResult.count || 0,
        escalations: escalationsResult.count || 0,
        bookings: bookingsResult.count || 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
