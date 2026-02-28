import { createServerClient } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/embed';

const AUTO_RESOLVE_THRESHOLD = 0.85;

interface AutoResolveResult {
  checked: number;
  resolved: number;
  errors: string[];
}

/**
 * Auto-resolve open gaps by matching against existing Q&A pairs.
 * Gaps with > 0.85 similarity to a Q&A pair are marked as resolved.
 * This runs in the background after bulk Q&A imports.
 */
export async function autoResolveGaps(workspaceId: string): Promise<AutoResolveResult> {
  const supabase = createServerClient();
  const result: AutoResolveResult = { checked: 0, resolved: 0, errors: [] };

  try {
    // 1. Get all open gaps for this workspace
    const { data: gaps, error: gapsError } = await supabase
      .from('qa_gaps')
      .select('id, question')
      .eq('workspace_id', workspaceId)
      .eq('status', 'open');

    if (gapsError) {
      result.errors.push(`Failed to fetch gaps: ${gapsError.message}`);
      return result;
    }

    if (!gaps || gaps.length === 0) {
      return result;
    }

    // 2. Process each gap sequentially (to avoid rate limits on embedding API)
    for (const gap of gaps) {
      result.checked++;

      try {
        // Generate embedding for gap question
        const embedding = await generateEmbedding(gap.question);

        // Search for matching Q&A pairs
        const { data: matches, error: searchError } = await supabase.rpc('search_qa_pairs', {
          p_workspace_id: workspaceId,
          query_embedding: embedding,
          match_threshold: AUTO_RESOLVE_THRESHOLD,
          match_count: 1,
        });

        if (searchError) {
          result.errors.push(`Search failed for gap ${gap.id}: ${searchError.message}`);
          continue;
        }

        // If we found a match above threshold, resolve the gap
        if (matches && matches.length > 0 && matches[0].similarity >= AUTO_RESOLVE_THRESHOLD) {
          const matchedPair = matches[0];

          const { error: updateError } = await supabase
            .from('qa_gaps')
            .update({
              status: 'resolved',
              resolved_qa_id: matchedPair.id,
              resolution_type: 'auto_matched',
            })
            .eq('id', gap.id);

          if (updateError) {
            result.errors.push(`Failed to resolve gap ${gap.id}: ${updateError.message}`);
          } else {
            result.resolved++;
          }
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Unknown error';
        result.errors.push(`Error processing gap ${gap.id}: ${errMsg}`);
      }
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Auto-resolve failed: ${message}`);
    return result;
  }
}
