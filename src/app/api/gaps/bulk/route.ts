import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';

export async function PATCH(request: Request) {
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
    const { ids, action } = body as { ids: string[]; action: 'dismiss' | 'delete' };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, error: 'IDs array is required' }, { status: 400 });
    }

    if (!action || !['dismiss', 'delete'].includes(action)) {
      return NextResponse.json({ success: false, error: 'Valid action is required (dismiss or delete)' }, { status: 400 });
    }

    // 4. Perform the action
    let affected = 0;

    if (action === 'dismiss') {
      // Update status to 'dismissed' for all selected gaps
      const { data, error } = await supabase
        .from('qa_gaps')
        .update({ status: 'dismissed' })
        .eq('workspace_id', workspaceId)
        .in('id', ids)
        .select('id');

      if (error) {
        throw new Error(`Failed to dismiss gaps: ${error.message}`);
      }
      affected = data?.length || 0;
    } else if (action === 'delete') {
      // Delete all selected gaps
      const { data, error } = await supabase
        .from('qa_gaps')
        .delete()
        .eq('workspace_id', workspaceId)
        .in('id', ids)
        .select('id');

      if (error) {
        throw new Error(`Failed to delete gaps: ${error.message}`);
      }
      affected = data?.length || 0;
    }

    return NextResponse.json({ success: true, affected, action });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
