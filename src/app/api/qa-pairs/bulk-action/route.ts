import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';
import { getMergedCategories } from '@/lib/categories';
import { DEFAULT_WORKSPACE_SETTINGS, type WorkspaceSettings } from '@/types/workspace';

export async function POST(request: Request) {
  try {
    // 1. Get authenticated user
    const authClient = await createAuthClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get user's workspace with settings
    const supabase = createServerClient();
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id, settings')
      .eq('owner_id', user.id)
      .single();
    if (wsError || !workspace) {
      return NextResponse.json({ success: false, error: 'Workspace not found' }, { status: 404 });
    }
    const workspaceId = workspace.id;
    const settings = { ...DEFAULT_WORKSPACE_SETTINGS, ...workspace.settings } as WorkspaceSettings;

    // 3. Parse and validate body
    const body = await request.json();
    const { ids, action, category } = body;

    if (!Array.isArray(ids) || ids.length === 0 || !action) {
      return NextResponse.json({ success: false, error: 'Missing ids or action' }, { status: 400 });
    }

    // 4. Verify all IDs belong to this workspace
    const { data: ownedPairs } = await supabase
      .from('qa_pairs')
      .select('id')
      .in('id', ids)
      .eq('workspace_id', workspaceId);

    const ownedIds = (ownedPairs || []).map(p => p.id);
    if (ownedIds.length !== ids.length) {
      return NextResponse.json({ success: false, error: 'Some IDs do not belong to your workspace' }, { status: 403 });
    }

    // 5. Build update data based on action
    let updateData: Record<string, unknown> = {};

    switch (action) {
      case 'delete':
        updateData = { is_active: false };
        break;
      case 'activate':
        updateData = { is_active: true };
        break;
      case 'deactivate':
        updateData = { is_active: false };
        break;
      case 'categorize':
        // Validate category against allowed list
        const allowedCategories = getMergedCategories(settings.custom_categories || []);
        const normalizedCategory = category?.toLowerCase().trim();
        if (!normalizedCategory || !allowedCategories.includes(normalizedCategory)) {
          return NextResponse.json({ success: false, error: 'Invalid category' }, { status: 400 });
        }
        updateData = { category: normalizedCategory };
        break;
      default:
        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    updateData.updated_at = new Date().toISOString();

    // 6. Execute the bulk update
    const { error: updateError, count } = await supabase
      .from('qa_pairs')
      .update(updateData)
      .in('id', ownedIds)
      .eq('workspace_id', workspaceId); // Belt and suspenders

    if (updateError) {
      throw new Error(`Failed to update Q&A pairs: ${updateError.message}`);
    }

    return NextResponse.json({ success: true, affected: count || ownedIds.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
