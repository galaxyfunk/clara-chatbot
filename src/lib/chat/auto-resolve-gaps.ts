import { createServerClient } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/embed';
import { DEFAULT_WORKSPACE_SETTINGS, type WorkspaceSettings } from '@/types/workspace';

interface AutoResolveResult {
  checked: number;
  resolved: number;
  errors: string[];
}

/**
 * Auto-resolve open gaps by matching against existing Q&A pairs.
 * Uses the workspace's confidence_threshold for matching.
 * This runs in the background after bulk Q&A imports.
 */
export async function autoResolveGaps(workspaceId: string): Promise<AutoResolveResult> {
  const supabase = createServerClient();
  const result: AutoResolveResult = { checked: 0, resolved: 0, errors: [] };

  try {
    // 1. Get workspace settings for confidence threshold
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('settings')
      .eq('id', workspaceId)
      .single();

    if (wsError || !workspace) {
      result.errors.push(`Failed to fetch workspace: ${wsError?.message || 'Not found'}`);
      return result;
    }

    const settings = { ...DEFAULT_WORKSPACE_SETTINGS, ...workspace.settings } as WorkspaceSettings;
    const threshold = settings.confidence_threshold;

    // 2. Get all open gaps for this workspace
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

    // 3. Process each gap sequentially (to avoid rate limits on embedding API)
    for (const gap of gaps) {
      result.checked++;

      try {
        // Generate embedding for gap question
        const embedding = await generateEmbedding(gap.question);

        // Search for matching Q&A pairs using workspace threshold
        const { data: matches, error: searchError } = await supabase.rpc('search_qa_pairs', {
          p_workspace_id: workspaceId,
          query_embedding: embedding,
          match_threshold: threshold,
          match_count: 1,
        });

        if (searchError) {
          result.errors.push(`Search failed for gap ${gap.id}: ${searchError.message}`);
          continue;
        }

        // If we found a match above threshold, resolve the gap
        if (matches && matches.length > 0 && matches[0].similarity >= threshold) {
          const matchedPair = matches[0];

          const { error: updateError } = await supabase
            .from('qa_gaps')
            .update({
              status: 'resolved',
              resolved_qa_id: matchedPair.id,
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
