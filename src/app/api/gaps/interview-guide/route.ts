import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/encryption';
import { chatCompletion, type LLMMessage } from '@/lib/llm/provider';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface InterviewQuestion {
  question: string;
  source: 'new_gap' | 'needs_deepening' | 'ai_suggested';
  category: string;
  suggested_interview_prompt: string;
  edge_cases: string;
  escalation_triggers: string;
  objection_depth: 'low' | 'medium' | 'high';
  why_this_matters: string;
}

interface InterviewTheme {
  theme_name: string;
  description: string;
  coverage_status: 'none' | 'partial' | 'mostly_covered';
  existing_coverage: string[];
  questions: InterviewQuestion[];
}

interface InterviewGuideResponse {
  themes: InterviewTheme[];
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

    // 3. Parse request body
    const body = await request.json();
    const { gap_ids, include_questions_sheet, include_guide_sheet } = body as {
      gap_ids: string[];
      include_questions_sheet: boolean;
      include_guide_sheet: boolean;
    };

    if (!gap_ids || !Array.isArray(gap_ids) || gap_ids.length === 0) {
      return NextResponse.json({ success: false, error: 'No gaps specified' }, { status: 400 });
    }

    // 4. Fetch the selected gaps
    const { data: gaps, error: gapsError } = await supabase
      .from('qa_gaps')
      .select('id, question, ai_answer, best_match_id, similarity_score, created_at')
      .eq('workspace_id', workspaceId)
      .in('id', gap_ids);

    if (gapsError) {
      throw new Error(`Failed to fetch gaps: ${gapsError.message}`);
    }

    if (!gaps || gaps.length === 0) {
      return NextResponse.json({ success: false, error: 'No matching gaps found' }, { status: 404 });
    }

    // 5. Fetch ALL qa_pairs for this workspace (question and category only)
    const { data: qaPairs, error: qaError } = await supabase
      .from('qa_pairs')
      .select('question, category')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true);

    if (qaError) {
      throw new Error(`Failed to fetch Q&A pairs: ${qaError.message}`);
    }

    // 6. Fetch and decrypt the user's default API key
    const { data: apiKeyRow, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_default', true)
      .eq('is_active', true)
      .single();

    if (keyError || !apiKeyRow) {
      return NextResponse.json(
        { success: false, error: 'Please add an API key in Settings before generating an interview guide' },
        { status: 400 }
      );
    }

    const rawApiKey = decrypt(apiKeyRow.encrypted_key);

    // 7. Build the LLM messages
    const systemMessage = `You are an expert interview strategist. Your job is to transform chatbot knowledge gaps into a structured founder interview guide that makes knowledge extraction calls maximally efficient.

You receive two inputs:
1. FLAGGED QUESTIONS — real questions visitors asked that the chatbot couldn't answer. These are confirmed blind spots.
2. EXISTING KNOWLEDGE BASE — questions already answered (titles and categories only). This tells you what's already covered.

Your job:
1. Cluster the flagged questions into 4-8 logical themes based on topic similarity
2. For each theme, identify what the knowledge base already covers (to avoid wasting interview time)
3. For each flagged question, generate interview-ready metadata
4. For each theme, generate 3-5 ADDITIONAL questions that visitors will likely ask next but haven't yet — fill the gaps proactively
5. Tag each question as: "new_gap" (not in KB at all), "needs_deepening" (KB has surface-level coverage in this area), or "ai_suggested" (you generated this to fill a gap)

Respond in this exact JSON format (no markdown fences, raw JSON only):
{
  "themes": [
    {
      "theme_name": "Theme Name",
      "description": "Why this theme matters for conversion — 1-2 sentences",
      "coverage_status": "none | partial | mostly_covered",
      "existing_coverage": ["List of KB questions that partially cover this theme"],
      "questions": [
        {
          "question": "The question text",
          "source": "new_gap | needs_deepening | ai_suggested",
          "category": "pricing | process | retention | developers | compliance | general | scaling | onboarding",
          "suggested_interview_prompt": "A natural, conversational way to ask this in a founder interview. Should encourage detailed, story-driven answers.",
          "edge_cases": "2-3 follow-up scenarios to probe if the founder gives a surface-level answer",
          "escalation_triggers": "Signals that this question is high-stakes for the visitor",
          "objection_depth": "low | medium | high",
          "why_this_matters": "Brief context on why visitors ask this and what a good answer achieves"
        }
      ]
    }
  ]
}`;

    const flaggedQuestionsList = gaps
      .map((g, i) => `${i + 1}. ${g.question}`)
      .join('\n');

    const kbList = (qaPairs || [])
      .map((qa, i) => `${i + 1}. [${qa.category || 'uncategorized'}] ${qa.question}`)
      .join('\n');

    const userMessage = `Here are ${gaps.length} flagged questions that our chatbot couldn't confidently answer:

FLAGGED QUESTIONS:
${flaggedQuestionsList}

EXISTING KNOWLEDGE BASE (${(qaPairs || []).length} questions already answered):
${kbList}

Generate the interview guide. Cluster into themes, cross-reference with existing coverage, expand each theme with additional questions visitors will likely ask, and generate full interview metadata for every question.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ];

    // 8. Call the LLM
    const llmResponse = await chatCompletion(
      apiKeyRow.provider,
      apiKeyRow.model,
      rawApiKey,
      messages,
      { maxTokens: 16000 }
    );

    // 9. Parse the JSON response
    let guideData: InterviewGuideResponse;
    try {
      // Try to extract JSON from the response (in case it's wrapped in markdown)
      let jsonString = llmResponse.content.trim();

      // Remove markdown code fences if present
      if (jsonString.startsWith('```json')) {
        jsonString = jsonString.slice(7);
      } else if (jsonString.startsWith('```')) {
        jsonString = jsonString.slice(3);
      }
      if (jsonString.endsWith('```')) {
        jsonString = jsonString.slice(0, -3);
      }
      jsonString = jsonString.trim();

      guideData = JSON.parse(jsonString);
    } catch {
      console.error('Failed to parse LLM response:', llmResponse.content);
      return NextResponse.json(
        { success: false, error: 'Failed to generate interview guide. Please try again.' },
        { status: 500 }
      );
    }

    // 10. Generate Excel file
    const workbook = XLSX.utils.book_new();

    if (include_questions_sheet) {
      // Sheet 1: Master Question List
      const questionsData: (string | undefined)[][] = [
        ['Theme', 'Question', 'Source', 'Category', 'Objection Depth', 'Why This Matters'],
      ];

      for (const theme of guideData.themes) {
        for (const q of theme.questions) {
          const sourceLabel =
            q.source === 'new_gap' ? 'New Gap' :
            q.source === 'needs_deepening' ? 'Needs Deepening' :
            'AI Suggested';
          questionsData.push([
            theme.theme_name,
            q.question,
            sourceLabel,
            q.category,
            q.objection_depth,
            q.why_this_matters,
          ]);
        }
      }

      const questionsSheet = XLSX.utils.aoa_to_sheet(questionsData);

      // Set column widths
      questionsSheet['!cols'] = [
        { wch: 25 }, // Theme
        { wch: 50 }, // Question
        { wch: 18 }, // Source
        { wch: 15 }, // Category
        { wch: 15 }, // Objection Depth
        { wch: 60 }, // Why This Matters
      ];

      XLSX.utils.book_append_sheet(workbook, questionsSheet, 'Master Question List');
    }

    if (include_guide_sheet) {
      // Sheet 2: Interview Guide
      const guideSheetData: (string | undefined)[][] = [
        ['Theme', 'Theme Description', 'Coverage Status', 'Question', 'Source', 'Suggested Interview Prompt', 'Edge Cases', 'Escalation Triggers', 'Objection Depth'],
      ];

      for (const theme of guideData.themes) {
        for (const q of theme.questions) {
          const sourceLabel =
            q.source === 'new_gap' ? 'New Gap' :
            q.source === 'needs_deepening' ? 'Needs Deepening' :
            'AI Suggested';
          guideSheetData.push([
            theme.theme_name,
            theme.description,
            theme.coverage_status,
            q.question,
            sourceLabel,
            q.suggested_interview_prompt,
            q.edge_cases,
            q.escalation_triggers,
            q.objection_depth,
          ]);
        }
      }

      const guideSheet = XLSX.utils.aoa_to_sheet(guideSheetData);

      // Set column widths
      guideSheet['!cols'] = [
        { wch: 25 }, // Theme
        { wch: 50 }, // Theme Description
        { wch: 18 }, // Coverage Status
        { wch: 50 }, // Question
        { wch: 18 }, // Source
        { wch: 60 }, // Suggested Interview Prompt
        { wch: 50 }, // Edge Cases
        { wch: 40 }, // Escalation Triggers
        { wch: 15 }, // Objection Depth
      ];

      XLSX.utils.book_append_sheet(workbook, guideSheet, 'Interview Guide');
    }

    // 11. Write to buffer and return
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const today = new Date().toISOString().split('T')[0];

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="clara-interview-guide-${today}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Interview guide generation error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
