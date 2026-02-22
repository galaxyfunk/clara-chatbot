import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';

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

    // 3. Parse body
    const body = await request.json();
    const gapId = body.gap_id;

    if (!gapId) {
      return NextResponse.json({ success: false, error: 'gap_id is required' }, { status: 400 });
    }

    // 4. Verify gap belongs to workspace and is open
    const { data: gap, error: gapError } = await supabase
      .from('qa_gaps')
      .select('id')
      .eq('id', gapId)
      .eq('workspace_id', workspaceId)
      .eq('status', 'open')
      .single();

    if (gapError || !gap) {
      return NextResponse.json({ success: false, error: 'Gap not found or already resolved' }, { status: 404 });
    }

    // 5. Update gap status to dismissed
    const { error: updateError } = await supabase
      .from('qa_gaps')
      .update({ status: 'dismissed' })
      .eq('id', gapId);

    if (updateError) {
      throw new Error(`Failed to dismiss gap: ${updateError.message}`);
    }

    return NextResponse.json({ success: true, dismissed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
