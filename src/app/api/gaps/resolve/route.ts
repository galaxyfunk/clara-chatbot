import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/embed';

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

    // 3. Parse and validate body
    const body = await request.json();
    const gapId = body.gap_id;
    const question = body.question?.trim();
    const answer = body.answer?.trim();
    const category = body.category?.trim() || 'general';

    if (!gapId || !question || !answer) {
      return NextResponse.json({ success: false, error: 'gap_id, question, and answer are required' }, { status: 400 });
    }

    // 4. Verify gap belongs to workspace and is open
    const { data: gap, error: gapError } = await supabase
      .from('qa_gaps')
      .select('*')
      .eq('id', gapId)
      .eq('workspace_id', workspaceId)
      .eq('status', 'open')
      .single();

    if (gapError || !gap) {
      return NextResponse.json({ success: false, error: 'Gap not found or already resolved' }, { status: 404 });
    }

    // 5. Generate embedding and create Q&A pair
    const embedding = await generateEmbedding(question);
    const { data: newPair, error: pairError } = await supabase
      .from('qa_pairs')
      .insert({
        workspace_id: workspaceId,
        question,
        answer,
        category,
        source: 'manual',
        embedding,
      })
      .select()
      .single();

    if (pairError) {
      throw new Error(`Failed to create Q&A pair: ${pairError.message}`);
    }

    // 6. Update gap status
    const { data: updatedGap, error: updateError } = await supabase
      .from('qa_gaps')
      .update({ status: 'resolved', resolved_qa_id: newPair.id })
      .eq('id', gapId)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update gap: ${updateError.message}`);
    }

    return NextResponse.json({ success: true, pair: newPair, gap: updatedGap });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
