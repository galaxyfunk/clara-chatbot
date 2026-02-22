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

  const client = new Anthropic({ apiKey });

  const extractionResponse = await client.messages.create({
    model: 'claude-sonnet-4-20250514', max_tokens: 4096, temperature: 0.3,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Here is the transcript:\n\n${transcript}` }],
  });

  const textContent = extractionResponse.content.find(c => c.type === 'text');
  const rawPairs = parseExtractionResponse(textContent?.text ?? '');

  if (rawPairs.length === 0) {
    return { pairs: [], totalFound: 0, newCount: 0, overlapCount: 0 };
  }

  const supabase = createServerClient();
  const enrichedPairs: ExtractedQAPair[] = [];

  for (const pair of rawPairs) {
    const embedding = await generateEmbedding(pair.question);
    const { data: matches } = await supabase.rpc('search_qa_pairs', {
      p_workspace_id: workspaceId, query_embedding: embedding, match_threshold: 0.85, match_count: 1,
    });

    const topMatch = matches?.[0];
    const isOverlap = topMatch && topMatch.similarity >= 0.85;

    enrichedPairs.push({
      ...pair,
      existingMatchId: isOverlap ? topMatch.id : undefined,
      existingMatchScore: isOverlap ? topMatch.similarity : undefined,
      isNew: !isOverlap,
    });
  }

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
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
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
  } catch { return []; }
}
