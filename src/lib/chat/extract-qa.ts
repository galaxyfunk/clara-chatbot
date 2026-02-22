import Anthropic from '@anthropic-ai/sdk';
import { generateEmbedding } from '@/lib/embed';
import { createServerClient } from '@/lib/supabase/server';
import type { ExtractedQAPair, TranscriptExtractionResult } from '@/types/qa';

export async function extractQAPairsFromTranscript(
  transcript: string,
  workspaceId: string
): Promise<TranscriptExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  console.log('[extract-qa] Starting extraction, transcript length:', transcript.length);

  const client = new Anthropic({ apiKey });

  const extractionResponse = await client.messages.create({
    model: 'claude-sonnet-4-20250514', max_tokens: 16000, temperature: 0.3,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Here is the transcript:\n\n${transcript}` }],
  });

  const textContent = extractionResponse.content.find(c => c.type === 'text');
  const rawText = textContent?.text ?? '';
  console.log('[extract-qa] Claude response length:', rawText.length);
  console.log('[extract-qa] Claude response preview:', rawText.substring(0, 500));

  const rawPairs = parseExtractionResponse(rawText);
  console.log('[extract-qa] Parsed pairs count:', rawPairs.length);

  if (rawPairs.length === 0) {
    console.log('[extract-qa] No pairs parsed from response');
    return { pairs: [], totalFound: 0, newCount: 0, overlapCount: 0 };
  }

  const supabase = createServerClient();
  const enrichedPairs: ExtractedQAPair[] = [];

  console.log('[extract-qa] Starting duplicate check for', rawPairs.length, 'pairs');

  for (const pair of rawPairs) {
    try {
      const embedding = await generateEmbedding(pair.question);
      const { data: matches, error: rpcError } = await supabase.rpc('search_qa_pairs', {
        p_workspace_id: workspaceId, query_embedding: embedding, match_threshold: 0.85, match_count: 1,
      });

      if (rpcError) {
        console.error('[extract-qa] RPC error:', rpcError.message);
        // If RPC fails, just mark as new and continue
        enrichedPairs.push({ ...pair, isNew: true });
        continue;
      }

      const topMatch = matches?.[0];
      const isOverlap = topMatch && topMatch.similarity >= 0.85;

      enrichedPairs.push({
        ...pair,
        existingMatchId: isOverlap ? topMatch.id : undefined,
        existingMatchScore: isOverlap ? topMatch.similarity : undefined,
        isNew: !isOverlap,
      });
    } catch (err) {
      console.error('[extract-qa] Error checking pair:', err);
      enrichedPairs.push({ ...pair, isNew: true });
    }
  }

  console.log('[extract-qa] Finished enrichment, total pairs:', enrichedPairs.length);

  return {
    pairs: enrichedPairs, totalFound: enrichedPairs.length,
    newCount: enrichedPairs.filter(p => p.isNew).length,
    overlapCount: enrichedPairs.filter(p => !p.isNew).length,
  };
}

const EXTRACTION_SYSTEM_PROMPT = `You are an expert at extracting question-and-answer pairs from business call transcripts.

Your job:
1. Read the transcript carefully
2. Identify every question asked by prospects/clients AND the corresponding answer given
3. Also identify implied questions — topics discussed where the speaker provides information that answers a common question
4. Clean up the answers — they should be clear, professional, and self-contained
5. Categorize each Q&A pair

Rules:
- Answers must be CLEAN and PROFESSIONAL — rewrite transcript language into clear, readable responses
- Answers should be 2-5 sentences, self-contained
- Do NOT include filler words, stuttering, or conversation artifacts
- Each answer should sound like it could appear on a company FAQ page

Respond with a JSON array (no markdown fences):
[
  {
    "question": "What is your typical hiring timeline?",
    "answer": "Our typical hiring timeline is 2-4 weeks from briefing to candidate presentation.",
    "category": "process",
    "confidence": 0.95
  }
]

Categories to use: pricing, process, developers, retention, case_studies, comparisons, compliance, scaling, onboarding, general`;

function parseExtractionResponse(raw: string): ExtractedQAPair[] {
  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    console.log('[extract-qa] Cleaned response preview:', cleaned.substring(0, 300));
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      console.log('[extract-qa] Parsed result is not an array:', typeof parsed);
      return [];
    }
    console.log('[extract-qa] Parsed array length:', parsed.length);
    return parsed
      .filter((p: unknown) => {
        const item = p as Record<string, unknown>;
        return item.question && item.answer;
      })
      .map((p: unknown) => {
        const item = p as Record<string, unknown>;
        return {
          question: String(item.question).trim(),
          answer: String(item.answer).trim(),
          category: String(item.category || 'general').trim(),
          confidence: Number(item.confidence) || 0.5,
          isNew: true,
        };
      });
  } catch (error) {
    console.error('[extract-qa] Parse error:', error);
    return [];
  }
}
