import Anthropic from '@anthropic-ai/sdk';
import type { FirefliesTranscriptDetail } from '@/types/fireflies';
import type { CallType, ClassifyResult } from '@/types/sales-coach';

const CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001';
const CLASSIFIER_MAX_TOKENS = 200;
const TRANSCRIPT_SENTENCE_LIMIT = 30;
const TRANSCRIPT_CHAR_BUDGET = 3000;

const VALID_TYPES: CallType[] = ['sales', 'internal', 'recruitment', 'other'];

const SYSTEM_PROMPT = `You are a call-type classifier for a B2B staffing company's sales operations.

Given a meeting's title, attendees, duration, and the opening transcript, classify the call as exactly one of:

- "sales": A revenue-generating conversation with a prospect or current customer. Includes discovery calls, demos, pricing/proposal discussions, contract negotiations, renewal conversations, and customer success check-ins where the goal is retention or expansion.
- "internal": A meeting where all (or effectively all) participants are employees of the company. Includes team standups, 1:1s, planning sessions, retros, training, internal reviews.
- "recruitment": Interviews, candidate screenings, recruiter intros, hiring panel discussions, or any conversation centered on evaluating a person for a role (either as candidate or for placement with a client).
- "other": Anything that doesn't cleanly fit the above. Partnership/BD meetings with non-customer companies, vendor calls, podcast recordings, advisory chats, support calls, social/networking conversations.

Use the title + attendee domains as strong signals; use the transcript to disambiguate. Output STRICT JSON only, no prose, no markdown fences:

{"call_type": "sales" | "internal" | "recruitment" | "other", "reason": "<one short sentence>"}`;

function buildUserMessage(
  detail: FirefliesTranscriptDetail,
  teamDomains: string[]
): string {
  const title = detail.title || '(untitled)';
  const normalizedTeamDomains = teamDomains.map((d) => d.toLowerCase().trim());

  const attendeeLines = detail.meeting_attendees.map((a) => {
    const email = (a.email ?? '').toLowerCase();
    const domain = email.includes('@') ? email.split('@')[1] : '';
    const tag = domain && normalizedTeamDomains.includes(domain) ? ' [team]' : ' [external]';
    const name = a.name || '(no name)';
    return `- ${name} <${email || 'no-email'}>${tag}`;
  });
  const attendeesBlock = attendeeLines.length > 0 ? attendeeLines.join('\n') : '(no attendees listed)';

  const durationMinutes = Math.round(detail.duration);

  const sentences = detail.sentences.slice(0, TRANSCRIPT_SENTENCE_LIMIT);
  let transcriptText = '';
  for (const s of sentences) {
    const line = `${s.speaker_name}: ${s.text}\n`;
    if (transcriptText.length + line.length > TRANSCRIPT_CHAR_BUDGET) break;
    transcriptText += line;
  }
  if (!transcriptText) transcriptText = '(no transcript content available)';

  return [
    `Title: ${title}`,
    `Duration: ~${durationMinutes} minutes`,
    `Attendees:\n${attendeesBlock}`,
    `Transcript (opening):\n${transcriptText.trim()}`,
  ].join('\n\n');
}

function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`[SalesCoach Classifier] No JSON object in response: ${text.slice(0, 200)}`);
  }
  return text.slice(start, end + 1);
}

export async function classifyCall(
  detail: FirefliesTranscriptDetail,
  teamDomains: string[]
): Promise<ClassifyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('[SalesCoach Classifier] ANTHROPIC_API_KEY not set');

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: CLASSIFIER_MODEL,
    max_tokens: CLASSIFIER_MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(detail, teamDomains) }],
  });

  const textContent = response.content.find((c) => c.type === 'text');
  const raw = textContent?.text?.trim() ?? '';
  if (!raw) throw new Error('[SalesCoach Classifier] Empty response');

  const json = extractJsonObject(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(`[SalesCoach Classifier] JSON parse failed: ${(err as Error).message} — raw: ${raw.slice(0, 200)}`);
  }

  const obj = parsed as { call_type?: unknown; reason?: unknown };
  const callType = typeof obj.call_type === 'string' ? obj.call_type : '';
  if (!VALID_TYPES.includes(callType as CallType)) {
    throw new Error(`[SalesCoach Classifier] Invalid call_type "${callType}" — raw: ${raw.slice(0, 200)}`);
  }
  const reason = typeof obj.reason === 'string' && obj.reason.trim() ? obj.reason.trim() : '(no reason given)';

  return { call_type: callType as CallType, reason };
}
