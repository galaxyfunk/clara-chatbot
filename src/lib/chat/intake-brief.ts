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
 * Shared by the JD upload route and the known-facts route so the visitor gets
 * the same Clara whether the context arrived as a .docx, a screenshot, or a
 * JSON packet from a booking page.
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

const FACTS_OPENING_PROMPT = `You are Clara, talking to someone who has just booked a call with a software engineering staffing company, or landed here after sharing a few details. They are hiring, not job hunting. You have been given known facts about them. They did not type those facts to you.

Write your opening message to them.

${OPENING_RULES}

The "document" is the known-facts packet. Treat a field as present only if it has a real value.

Gaps that matter for this opening, in this order: the role they are hiring for, the tech stack, how many people they need, timeline, and what the company does.

Never re-ask a field that is present. If the packet states the role, do not ask about the role. If it states the stack, do not ask about the stack.

Respond with the message text and nothing else.`;

const THIN_FACTS_OPENING_PROMPT = `You are Clara. Someone has just booked a call with a software engineering staffing company. You only have their contact details. They did not type anything to you.

Write one short sentence asking what the call is about.

Hard rules:
- Do not greet them with "Hi" or "Hello" and do not introduce yourself.
- Do not mention their email, a packet, or that information is missing.
- Do not invent a role, a stack, or a company.
- No bullet points. Keep it under 20 words.

Respond with the message text and nothing else.`;

export interface IntakeOpeningResult {
  success: boolean;
  opening?: string;
  error?: string;
}

export interface IntakeFactsBookingAnswer {
  question: string;
  answer: string;
}

export interface IntakeFactsBooking {
  start_time?: string;
  host_name?: string;
  host_email?: string;
  timezone?: string;
  event_name?: string;
  answers?: IntakeFactsBookingAnswer[];
}

export interface IntakeFactsVisitor {
  email: string;
  name?: string;
  /** Who they are at the company. Never the role they are hiring. */
  job_title?: string;
}

export interface ParsedIntakeFacts {
  workspaceId: string;
  sourcePage?: string;
  visitor: IntakeFactsVisitor;
  booking?: IntakeFactsBooking;
  brief?: Record<string, unknown>;
}

/**
 * `jobDescription` is the already-extracted text of the uploaded document.
 * Returns the message Clara should open the seeded conversation with.
 */
export async function generateIntakeOpening(
  jobDescription: string
): Promise<IntakeOpeningResult> {
  return runOpening(OPENING_PROMPT, jobDescription, 'No job description text to read');
}

/**
 * Same model, same opening rules, same cap as the JD path. The packet is JSON
 * facts from a booking page, not a file. A packet with only contact details
 * uses a thinner prompt so Clara asks what the call is about instead of
 * walking the hiring gap list.
 */
export async function generateIntakeOpeningFromFacts(
  factsText: string,
  facts: ParsedIntakeFacts
): Promise<IntakeOpeningResult> {
  const system = isThinIntakeFacts(facts) ? THIN_FACTS_OPENING_PROMPT : FACTS_OPENING_PROMPT;
  return runOpening(system, factsText, 'No known facts to read');
}

/** True when we have contact details but nothing about the hire. */
export function isThinIntakeFacts(facts: ParsedIntakeFacts): boolean {
  const brief = facts.brief;
  if (brief) {
    for (const value of Object.values(brief)) {
      if (formatBriefValue(value)) return false;
    }
  }
  if (facts.booking?.event_name) return false;
  if (facts.booking?.answers?.length) return false;
  return true;
}

async function runOpening(
  system: string,
  userText: string,
  emptyError: string
): Promise<IntakeOpeningResult> {
  const trimmed = userText.trim();
  if (!trimmed) {
    return { success: false, error: emptyError };
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      temperature: 0.4,
      system,
      messages: [{ role: 'user', content: capJobDescription(trimmed) }],
    });

    const textContent = response.content.find((c) => c.type === 'text');
    const opening = textContent?.text?.trim();

    if (!opening) {
      return { success: false, error: 'Model returned no text' };
    }

    return { success: true, opening };
  } catch (error) {
    // Deliberately does not include the packet or document text in the message.
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Intake opening failed: ${message}` };
  }
}

/** Exported so the route stores the same capped text it had Clara read. */
export function capJobDescription(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_JD_CHARS ? trimmed.slice(0, MAX_JD_CHARS) : trimmed;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/**
 * Reads only the known facts fields. Extra keys on the body, visitor, booking,
 * or an answer object are ignored.
 */
export function parseIntakeFactsBody(
  body: unknown
): { ok: true; data: ParsedIntakeFacts } | { ok: false; error: string } {
  const record = asRecord(body);
  if (!record) return { ok: false, error: 'JSON body is required' };

  const workspaceId = asNonEmptyString(record.workspace_id);
  if (!workspaceId) return { ok: false, error: 'workspace_id is required' };

  const visitorRecord = asRecord(record.visitor);
  if (!visitorRecord) return { ok: false, error: 'visitor.email is required' };

  const emailRaw = asNonEmptyString(visitorRecord.email);
  if (!emailRaw) return { ok: false, error: 'visitor.email is required' };
  const email = emailRaw.toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'visitor.email is invalid' };

  const visitor: IntakeFactsVisitor = { email };
  const name = asNonEmptyString(visitorRecord.name);
  if (name) visitor.name = name;
  const jobTitle = asNonEmptyString(visitorRecord.job_title);
  if (jobTitle) visitor.job_title = jobTitle;

  const parsed: ParsedIntakeFacts = { workspaceId, visitor };

  const sourcePage = asNonEmptyString(record.source_page);
  if (sourcePage) parsed.sourcePage = sourcePage;

  const bookingRecord = asRecord(record.booking);
  if (bookingRecord) {
    const booking: IntakeFactsBooking = {};
    const startTime = asNonEmptyString(bookingRecord.start_time);
    const hostName = asNonEmptyString(bookingRecord.host_name);
    const hostEmail = asNonEmptyString(bookingRecord.host_email);
    const timezone = asNonEmptyString(bookingRecord.timezone);
    const eventName = asNonEmptyString(bookingRecord.event_name);
    if (startTime) booking.start_time = startTime;
    if (hostName) booking.host_name = hostName;
    if (hostEmail) booking.host_email = hostEmail;
    if (timezone) booking.timezone = timezone;
    if (eventName) booking.event_name = eventName;

    if (Array.isArray(bookingRecord.answers)) {
      const answers = bookingRecord.answers.flatMap((item) => {
        const row = asRecord(item);
        if (!row) return [];
        const question = asNonEmptyString(row.question);
        const answer = asNonEmptyString(row.answer);
        if (!question || !answer) return [];
        return [{ question, answer }];
      });
      if (answers.length) booking.answers = answers;
    }

    if (Object.keys(booking).length) parsed.booking = booking;
  }

  const brief = asRecord(record.brief);
  if (brief && Object.keys(brief).length) parsed.brief = brief;

  return { ok: true, data: parsed };
}

function formatBriefValue(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return asNonEmptyString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value) || typeof value === 'object') {
    try {
      const json = JSON.stringify(value);
      return json && json !== '{}' && json !== '[]' ? json : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Turns a parsed packet into the text Clara reads. Caps at the same 12k as a JD. */
export function formatIntakeFacts(facts: ParsedIntakeFacts): string {
  const lines: string[] = [];

  lines.push('Visitor');
  lines.push(`email: ${facts.visitor.email}`);
  if (facts.visitor.name) lines.push(`name: ${facts.visitor.name}`);
  if (facts.visitor.job_title) {
    lines.push(`job_title: ${facts.visitor.job_title}`);
    lines.push('job_title_note: who they are at the company, not the role they are hiring');
  }

  if (facts.booking) {
    const bookingLines: string[] = [];
    if (facts.booking.event_name) bookingLines.push(`event_name: ${facts.booking.event_name}`);
    if (facts.booking.start_time) bookingLines.push(`start_time: ${facts.booking.start_time}`);
    if (facts.booking.host_name) bookingLines.push(`host_name: ${facts.booking.host_name}`);
    if (facts.booking.host_email) bookingLines.push(`host_email: ${facts.booking.host_email}`);
    if (facts.booking.timezone) bookingLines.push(`timezone: ${facts.booking.timezone}`);
    if (facts.booking.answers?.length) {
      bookingLines.push('answers:');
      for (const answer of facts.booking.answers) {
        bookingLines.push(`- ${answer.question}: ${answer.answer}`);
      }
    }
    if (bookingLines.length) {
      lines.push('');
      lines.push('Booking');
      lines.push(...bookingLines);
    }
  }

  if (facts.brief) {
    const briefLines: string[] = [];
    for (const [key, value] of Object.entries(facts.brief)) {
      const rendered = formatBriefValue(value);
      if (rendered) briefLines.push(`${key}: ${rendered}`);
    }
    if (briefLines.length) {
      lines.push('');
      lines.push('Brief');
      lines.push(...briefLines);
    }
  }

  return capJobDescription(lines.join('\n'));
}

/**
 * Framed the same way as the JD seed: a user turn, but labelled as system
 * context so Clara does not treat it as something the visitor typed.
 */
export function buildFactsSeedContent(factsText: string): string {
  return `[The visitor did not type this. These are known facts from their booking and the page they came from. Treat them as given throughout this conversation. Do not ask again for anything already stated.]\n\n${factsText}`;
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
