import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';
import { checkForDuplicate } from '@/lib/chat/dedup';
import { generateEmbedding } from '@/lib/embed';

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

    // 3. Parse query params
    const url = new URL(request.url);
    const search = url.searchParams.get('search');
    const category = url.searchParams.get('category');
    const activeOnly = url.searchParams.get('active_only') !== 'false';

    // 4. Build query
    let query = supabase
      .from('qa_pairs')
      .select('id, question, answer, category, source, is_active, metadata, created_at, updated_at')
      .eq('workspace_id', workspaceId);

    if (search) {
      query = query.or(`question.ilike.%${search}%,answer.ilike.%${search}%`);
    }
    if (category) {
      query = query.eq('category', category);
    }
    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch Q&A pairs: ${error.message}`);
    }

    return NextResponse.json({ success: true, pairs: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

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
    const answer = body.answer?.trim();
    const category = body.category?.trim() || 'general';
    const source = body.source || 'manual';
    const metadata = body.metadata || {};

    if (!question || !answer) {
      return NextResponse.json({ success: false, error: 'Question and answer are required' }, { status: 400 });
    }

    // 4. Check for duplicate
    const dupCheck = await checkForDuplicate(question, workspaceId);
    if (dupCheck.isDuplicate) {
      return NextResponse.json({
        success: true,
        warning: 'Similar Q&A pair already exists',
        existingId: dupCheck.existingId,
        similarity: dupCheck.similarity,
        created: false,
      });
    }

    // 5. Generate embedding
    const embedding = await generateEmbedding(question);

    // 6. Insert Q&A pair
    const { data, error } = await supabase
      .from('qa_pairs')
      .insert({
        workspace_id: workspaceId,
        question,
        answer,
        category,
        source,
        embedding,
        metadata,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create Q&A pair: ${error.message}`);
    }

    return NextResponse.json({ success: true, pair: data, created: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
