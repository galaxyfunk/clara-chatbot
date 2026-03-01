import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/embed';
import { autoResolveGaps } from '@/lib/chat/auto-resolve-gaps';

export const maxDuration = 120;

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
    const pairs = body.pairs as Array<{ question: string; answer: string; category?: string }>;
    const source = body.source as 'csv_import' | 'transcript_extraction';
    const importBatchId = body.import_batch_id;

    if (!pairs || !Array.isArray(pairs) || pairs.length === 0) {
      return NextResponse.json({ success: false, error: 'Pairs array is required' }, { status: 400 });
    }

    if (!source || !['csv_import', 'transcript_extraction'].includes(source)) {
      return NextResponse.json({ success: false, error: 'Valid source is required (csv_import or transcript_extraction)' }, { status: 400 });
    }

    // 4. Process each pair sequentially
    const errors: string[] = [];
    let imported = 0;

    for (const pair of pairs) {
      const question = pair.question?.trim();
      const answer = pair.answer?.trim();
      const category = pair.category?.trim() || 'general';

      if (!question || !answer) {
        errors.push(`Skipped pair: question and answer are required`);
        continue;
      }

      try {
        // Generate embedding (sequential, never Promise.all)
        const embedding = await generateEmbedding(question);

        // Build metadata
        const metadata: Record<string, unknown> = {};
        if (importBatchId) {
          metadata.import_batch_id = importBatchId;
        }

        // Insert
        const { error: insertError } = await supabase.from('qa_pairs').insert({
          workspace_id: workspaceId,
          question,
          answer,
          category,
          source,
          embedding,
          metadata,
        });

        if (insertError) {
          errors.push(`Failed to save "${question.substring(0, 50)}...": ${insertError.message}`);
        } else {
          imported++;
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Unknown error';
        errors.push(`Error processing "${question.substring(0, 50)}...": ${errMsg}`);
      }
    }

    // Auto-resolve gaps after importing new Q&A pairs
    let autoResolved = 0;
    if (imported > 0) {
      try {
        const resolveResult = await autoResolveGaps(workspaceId);
        autoResolved = resolveResult.resolved;
      } catch {
        // Continue even if auto-resolve fails
      }
    }

    return NextResponse.json({ success: true, imported, auto_resolved: autoResolved, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
