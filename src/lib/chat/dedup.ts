import { generateEmbedding } from '@/lib/embed';
import { createServerClient } from '@/lib/supabase/server';

export async function checkForDuplicate(
  question: string,
  workspaceId: string,
  threshold: number = 0.95
): Promise<{ isDuplicate: boolean; existingId?: string; similarity?: number }> {
  const embedding = await generateEmbedding(question);
  const supabase = createServerClient();
  const { data: matches } = await supabase.rpc('search_qa_pairs', {
    p_workspace_id: workspaceId, query_embedding: embedding, match_threshold: threshold, match_count: 1,
  });
  const topMatch = matches?.[0];
  if (topMatch && topMatch.similarity >= threshold) {
    return { isDuplicate: true, existingId: topMatch.id, similarity: topMatch.similarity };
  }
  return { isDuplicate: false };
}
