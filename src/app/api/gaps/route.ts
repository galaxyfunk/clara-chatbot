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

    // 3. Parse query param
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'open';

    // 4. Get gaps
    const { data: gaps, error } = await supabase
      .from('qa_gaps')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch gaps: ${error.message}`);
    }

    // 5. For each gap with best_match_id, fetch the matching Q&A question
    const enrichedGaps = await Promise.all(
      (gaps || []).map(async (gap) => {
        if (gap.best_match_id) {
          const { data: match } = await supabase
            .from('qa_pairs')
            .select('question')
            .eq('id', gap.best_match_id)
            .single();
          return { ...gap, bestMatchQuestion: match?.question || null };
        }
        return { ...gap, bestMatchQuestion: null };
      })
    );

    return NextResponse.json({ success: true, gaps: enrichedGaps });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
