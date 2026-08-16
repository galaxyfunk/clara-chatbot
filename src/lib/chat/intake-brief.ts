import Anthropic from '@anthropic-ai/sdk';
import type { VisualBlock } from '@/lib/files/intake-document';

/**
 * Turns an uploaded job description into Clara's opening turn.
 *
 * Built in the image of summarize.ts: a separate, app-level Anthropic call with
 * its own prompt, parsed defensively. Two deliberate differences.
 *
 * 1. Haiku, not Sonnet. This runs on every upload, and reading one document to
 *    ask sensible questions about it does not need the heavier model.
 * 2. Plain text out, not JSON. The result is rendered as a single chat bubble,
 *    so a JSON envelope would only add a parse step that can fail.
 */

const MODEL = 'claude-haiku-4-5-20251001';

/**
 * A long JD costs tokens on EVERY subsequent turn, because it lives in the
 * session history that buildChatPrompt replays. Cap it. 12k characters is a
 * generous job description; beyond that is boilerplate, T&Cs and equal-
 * opportunity statements, none of which help us match an engineer.
 */
const MAX_JD_CHARS = 12000;

/**
 * Shared by both routes so the visitor gets the same Clara whether their job
 * description arrived as a .docx or as a screenshot.
 */
const OPENING_RULES = `The message has two jobs, in this order:

1. Show them you read it. Two sentences, maximum. Say what you understand they are hiring for in plain, human language - the role and what it is really for. Do not summarise the document back at them, do not list its contents, and do not compliment it.

2. Ask about what the document did NOT tell you. Pick the two or three most important missing things, and ask about them in one natural sentence.

The things that matter most for matching engineers, roughly in order: seniority, the core tech stack, team size and how many hires, timeline and urgency, time-zone or overlap needs, budget or rate expectations, and whether they have hired remotely before.

Hard rules:
- Only treat something as missing if it is genuinely absent. If the document states the stack, do not ask about the stack.
- Never guess or assume a value. An invented seniority or budget is worse than an absent one, because a human reads this before a sales call.
- No bullet points, no numbered lists, no headings. Write conversational sentences.
- No jargon and no corporate register. Write like a person who has just read something interesting.
- Do not greet them with "Hi" or "Hello" and do not introduce yourself. They just clicked a button; they know where they are.
- Keep the whole message under 80 words.
- Never write a URL or a link.`;

const OPENING_PROMPT = `You are Clara, talking to someone who has just uploaded a job description to a software engineering staffing company. They are hiring, not job hunting.

Write your opening message to them.

${OPENING_RULES}

Respond with the message text and nothing else.`;

export interface IntakeOpeningResult {
  success: boolean;
  opening?: string;
  error?: string;
}

/**
 * `jobDescription` is the already-extracted text of the uploaded document.
 * Returns the message Clara should open the seeded conversation with.
 */
export async function generateIntakeOpening(
  jobDescription: string
): Promise<IntakeOpeningResult> {
  const trimmed = jobDescription.trim();
  if (!trimmed) {
    return { success: false, error: 'No job description text to read' };
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      temperature: 0.4,
      system: OPENING_PROMPT,
      messages: [{ role: 'user', content: capJobDescription(trimmed) }],
    });

    const textContent = response.content.find((c) => c.type === 'text');
    const opening = textContent?.text?.trim();

    if (!opening) {
      return { success: false, error: 'Model returned no text' };
    }

    return { success: true, opening };
  } catch (error) {
    // Deliberately does not include the document text in the message.
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Intake opening failed: ${message}` };
  }
}

/** Exported so the route stores the same capped text it had Clara read. */
export function capJobDescription(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_JD_CHARS ? trimmed.slice(0, MAX_JD_CHARS) : trimmed;
}

/**
 * The visual route: a screenshot, a scanned PDF, or a Pages preview - anything
 * we hold as a picture of a document rather than as text.
 *
 * This does two jobs in one call rather than transcribing and then reading in a
 * second pass. Two calls would double the cost and latency on every visual
 * upload, and a transcription step adds a place for the document to be quietly
 * garbled before Clara ever sees it.
 */
const TRANSCRIBE_PROMPT = `You are reading an uploaded job description. It may be a screenshot, a scan, or a page image.

Return ONLY valid JSON, no markdown fences, in this exact shape:
{"jobDescription": "...", "opening": "..."}

"jobDescription": the document's text, transcribed as faithfully as you can. Preserve the headings and the order. If parts are illegible, write [illegible] rather than guessing at them. If the image is not a job description at all, set this to an empty string.

"opening": your opening message to the person who uploaded it, following these rules exactly:
${OPENING_RULES}

If "jobDescription" is empty because the image is not a job description, make "opening" a short, friendly sentence saying you could not see a job description in what was uploaded, and asking them to describe the role instead.`;

export interface IntakeVisualResult {
  success: boolean;
  jobDescription?: string;
  opening?: string;
  error?: string;
}

export async function generateIntakeOpeningFromVisual(
  block: VisualBlock
): Promise<IntakeVisualResult> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      temperature: 0.4,
      system: TRANSCRIBE_PROMPT,
      messages: [
        {
          role: 'user',
          // The document goes BEFORE the text, which is what the API expects and
          // what reads best for the model.
          content: [block, { type: 'text', text: 'Read this job description.' }],
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === 'text');
    const raw = textContent?.text?.trim();
    if (!raw) return { success: false, error: 'Model returned no text' };

    const parsed = parseJson(raw);
    if (!parsed) return { success: false, error: 'Could not parse the model response' };

    const opening = typeof parsed.opening === 'string' ? parsed.opening.trim() : '';
    if (!opening) return { success: false, error: 'Model returned no opening message' };

    const jobDescription =
      typeof parsed.jobDescription === 'string' ? capJobDescription(parsed.jobDescription) : '';

    return { success: true, jobDescription, opening };
  } catch (error) {
    // Never includes the document itself.
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Visual intake failed: ${message}` };
  }
}

/** Defensive, in the shape of summarize.ts: bare JSON first, then a fenced block. */
function parseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (!fenced) return null;
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      return null;
    }
  }
}
