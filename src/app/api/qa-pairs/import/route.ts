import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/embed';
import type { ExtractedQAPair } from '@/types/qa';

export const maxDuration = 60;

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
    if (!body.csv_text) {
      return NextResponse.json({ success: false, error: 'csv_text is required' }, { status: 400 });
    }

    // 4. Parse CSV
    const parsed = Papa.parse<{ question?: string; answer?: string; category?: string }>(body.csv_text, {
      header: true,
      skipEmptyLines: true,
    });

    const errors: string[] = [];
    if (parsed.errors.length > 0) {
      parsed.errors.forEach((e) => errors.push(`CSV parse error: ${e.message}`));
    }

    // 5. Validate and check overlaps
    const enrichedPairs: ExtractedQAPair[] = [];

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i];
      const question = row.question?.trim();
      const answer = row.answer?.trim();
      const category = row.category?.trim() || 'general';

      if (!question || !answer) {
        errors.push(`Row ${i + 1}: question and answer are required`);
        continue;
      }

      // Generate embedding and check for overlap
      const embedding = await generateEmbedding(question);
      const { data: matches } = await supabase.rpc('search_qa_pairs', {
        p_workspace_id: workspaceId,
        query_embedding: embedding,
        match_threshold: 0.85,
        match_count: 1,
      });

      const topMatch = matches?.[0];
      const isOverlap = topMatch && topMatch.similarity >= 0.85;

      enrichedPairs.push({
        question,
        answer,
        category,
        confidence: 1.0,
        existingMatchId: isOverlap ? topMatch.id : undefined,
        existingMatchScore: isOverlap ? topMatch.similarity : undefined,
        isNew: !isOverlap,
      });
    }

    const newCount = enrichedPairs.filter((p) => p.isNew).length;
    const overlapCount = enrichedPairs.filter((p) => !p.isNew).length;

    return NextResponse.json({
      success: true,
      pairs: enrichedPairs,
      totalFound: enrichedPairs.length,
      newCount,
      overlapCount,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
