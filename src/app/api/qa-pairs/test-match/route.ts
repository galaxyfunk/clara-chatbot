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
    const question = body.question?.trim();

    if (!question) {
      return NextResponse.json({ success: false, error: 'Question required' }, { status: 400 });
    }

    // 4. Generate embedding for the test question
    const embedding = await generateEmbedding(question);

    // 5. Search against knowledge base
    const { data: matches, error: searchError } = await supabase.rpc('search_qa_pairs', {
      p_workspace_id: workspaceId,
      query_embedding: embedding,
      match_threshold: 0.3, // Low threshold to show range of matches
      match_count: 5,
    });

    if (searchError) {
      throw new Error(`Search failed: ${searchError.message}`);
    }

    // 6. Return formatted matches
    return NextResponse.json({
      success: true,
      matches: (matches || []).map((m: { id: string; question: string; answer: string; similarity: number }) => ({
        id: m.id,
        question: m.question,
        answer: m.answer,
        similarity: m.similarity,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
