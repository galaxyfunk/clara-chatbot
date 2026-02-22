import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/embed';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: pairId } = await params;

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

    // 3. Verify pair belongs to workspace
    const { data: existingPair, error: pairError } = await supabase
      .from('qa_pairs')
      .select('id, question')
      .eq('id', pairId)
      .eq('workspace_id', workspaceId)
      .single();

    if (pairError || !existingPair) {
      return NextResponse.json({ success: false, error: 'Q&A pair not found' }, { status: 404 });
    }

    // 4. Parse body and build update object
    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.question !== undefined) {
      updateData.question = body.question.trim();
    }
    if (body.answer !== undefined) {
      updateData.answer = body.answer.trim();
    }
    if (body.category !== undefined) {
      updateData.category = body.category.trim();
    }
    if (body.is_active !== undefined) {
      updateData.is_active = body.is_active;
    }

    // 5. If question changed, regenerate embedding
    if (updateData.question && updateData.question !== existingPair.question) {
      const embedding = await generateEmbedding(updateData.question as string);
      updateData.embedding = embedding;
    }

    updateData.updated_at = new Date().toISOString();

    // 6. Update the row
    const { data, error } = await supabase
      .from('qa_pairs')
      .update(updateData)
      .eq('id', pairId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update Q&A pair: ${error.message}`);
    }

    return NextResponse.json({ success: true, pair: data });
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
    const { id: pairId } = await params;

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

    // 3. Verify pair belongs to workspace
    const { data: existingPair, error: pairError } = await supabase
      .from('qa_pairs')
      .select('id')
      .eq('id', pairId)
      .eq('workspace_id', workspaceId)
      .single();

    if (pairError || !existingPair) {
      return NextResponse.json({ success: false, error: 'Q&A pair not found' }, { status: 404 });
    }

    // 4. Soft delete (set is_active = false)
    const { error } = await supabase
      .from('qa_pairs')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', pairId);

    if (error) {
      throw new Error(`Failed to delete Q&A pair: ${error.message}`);
    }

    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
