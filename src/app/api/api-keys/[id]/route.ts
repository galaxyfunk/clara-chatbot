import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: keyId } = await params;

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

    // 3. Verify key belongs to workspace
    const { data: existingKey, error: keyError } = await supabase
      .from('api_keys')
      .select('id')
      .eq('id', keyId)
      .eq('workspace_id', workspaceId)
      .single();

    if (keyError || !existingKey) {
      return NextResponse.json({ success: false, error: 'API key not found' }, { status: 404 });
    }

    // 4. Parse body and build update object
    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.is_default !== undefined) {
      updateData.is_default = body.is_default;
    }
    if (body.is_active !== undefined) {
      updateData.is_active = body.is_active;
    }
    if (body.label !== undefined) {
      updateData.label = body.label;
    }

    // 5. If setting is_default = true, unset other defaults first
    if (body.is_default === true) {
      await supabase
        .from('api_keys')
        .update({ is_default: false })
        .eq('workspace_id', workspaceId);
    }

    updateData.updated_at = new Date().toISOString();

    // 6. Update the key
    const { data, error } = await supabase
      .from('api_keys')
      .update(updateData)
      .eq('id', keyId)
      .select('id, provider, model, key_last4, label, is_default, is_active, created_at, updated_at')
      .single();

    if (error) {
      throw new Error(`Failed to update API key: ${error.message}`);
    }

    return NextResponse.json({ success: true, key: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: keyId } = await params;

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

    // 3. Verify key belongs to workspace
    const { data: existingKey, error: keyError } = await supabase
      .from('api_keys')
      .select('id')
      .eq('id', keyId)
      .eq('workspace_id', workspaceId)
      .single();

    if (keyError || !existingKey) {
      return NextResponse.json({ success: false, error: 'API key not found' }, { status: 404 });
    }

    // 4. Hard delete
    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', keyId);

    if (error) {
      throw new Error(`Failed to delete API key: ${error.message}`);
    }

    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
