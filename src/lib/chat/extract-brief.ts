import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase/server';
import type {
  Brief,
  BriefContent,
  BriefEngagement,
  BriefEngagementType,
  BriefIntent,
  BriefMustHave,
  BriefPodSlot,
  BriefRegion,
  BriefRole,
} from '@/types/brief';
import type { ChatMessage } from '@/types/chat';

/**
 * Per-turn hiring brief extraction for Cloud Employee's /ask page.
 *
 * Built in the image of `summarize.ts` (JSON-only system prompt, separate
 * Anthropic call on the app-level key, parsed defensively) with two deliberate
 * differences: this runs on a Haiku-class model because it fires every
 * meaningful turn rather than once per session, and it never throws — a failed
 * extraction must cost the visitor nothing but a missing canvas update.
 */

const BRIEF_MODEL = 'claude-haiku-4-5-20251001';
const BRIEF_MAX_TOKENS = 900;

/** The SSE `done` event queues behind this call, so it cannot wait forever. */
const BRIEF_TIMEOUT_MS = 8000;

const HISTORY_MESSAGE_LIMIT = 20;
const HISTORY_CHAR_BUDGET = 8000;

// Field caps. The brief fills cards in a UI, not a document.
const MAX_ROLES = 10;
const MAX_STACKS = 12;
const MAX_MUST_HAVES = 10;
const MAX_COMPLIANCE_FLAGS = 8;
const MAX_POD_SLOTS = 8;
const MAX_PEOPLE = 500;
const MAX_DURATION_MONTHS = 60;
const CAP_TITLE = 80;
const CAP_SENIORITY = 40;
const CAP_STACK = 40;
const CAP_TIMELINE = 120;
const CAP_SENTENCE = 300;
const CAP_LABEL = 120;
const CAP_FLAG = 60;
const CAP_NOTE = 140;

const VALID_INTENTS: BriefIntent[] = ['unknown', 'single_hire', 'team_hire', 'product_build'];
const VALID_REGIONS: BriefRegion[] = ['PH', 'EE', 'LATAM', 'mixed'];
const VALID_ENGAGEMENT_TYPES: BriefEngagementType[] = ['full_time', 'part_time', 'contract'];

const EXTRACT_BRIEF_PROMPT = `You extract a structured hiring brief from a conversation between a visitor and an AI assistant for Cloud Employee, a software staffing company that builds offshore development teams.

A human salesperson reads this brief before calling the visitor.

## The rule that matters most
Only include a field when the visitor has actually said it, or when it follows unambiguously from what they said. OMIT every field you are not confident about. Do not guess, do not fill in a plausible default, and do not take a value from the assistant's suggestions unless the visitor agreed to it. An omitted field is rendered to the salesperson as "Clara will ask next"; a wrong field misleads them. A missing value is always better than an invented one.

## Fields
Return one JSON object. Every field except "intent" is optional — omit it entirely rather than sending null, "", 0, an empty array or "unknown".

- intent (required): one of "single_hire" (they want one person), "team_hire" (they want several people), "product_build" (they want a product or MVP delivered rather than named seats), "unknown" (their goal is not yet clear). Stay on "unknown" until it genuinely is clear.
- headcount: total people they want to hire, as an integer.
- roles: array of { title, seniority?, count, stacks? }. "title" is a short job title such as "React Developer". "seniority" only if stated, such as "Senior" or "Mid-level". "count" is how many people for that role. "stacks" are technologies named for that specific role.
- techStacks: technologies, languages and frameworks the visitor named across the whole engagement. Short names such as "React", "Node.js", "AWS".
- regions: array of "PH" (Philippines), "EE" (Eastern Europe), "LATAM", "mixed". Only if the visitor expressed a location preference — not because Cloud Employee happens to hire there.
- engagement: { type: "full_time" | "part_time" | "contract", durationMonths? }. Only if stated.
- timeline: short phrase in the visitor's own terms, such as "ASAP", "start in Q3", "within 6 weeks".
- teamContext: one short sentence about the team they already have (size, structure, where it sits).
- companyContext: one short sentence about their company (what it does, stage, industry, location).
- goals: one short sentence on what they are trying to achieve by hiring.
- mustHaves: array of { label, confirmed }. Only requirements the visitor placed on the people being hired, such as "Overlap with GMT hours" or "Has shipped a payments product". A fact about the visitor's own company or industry is NOT a must-have — that belongs in companyContext. Set "confirmed" true when they stated it as a firm requirement, false when it is still tentative.
- complianceFlags: array of short strings, ONLY if the visitor raised a compliance or regulatory need such as "GDPR", "HIPAA", "SOC 2", "EU data residency".
- suggestedPod: array of { role, count, note? }. ONLY when intent is "product_build" AND the shape of the delivery team has actually been discussed. Never invent a pod.

Keep every string short — roughly 20 words maximum, no paragraphs.

Read the WHOLE conversation. Where the visitor corrected themselves, use their most recent statement.

Output STRICT JSON only: no prose, no explanation, no markdown fences. If there is nothing you are confident about, return {"intent":"unknown"}.`;

/** CE's page treats this as "brief ready" and offers the call. */
export const BRIEF_READY_THRESHOLD = 70;

/** Ceiling while any core fact is missing — one below the ready line. */
const BRIEF_INCOMPLETE_CORE_CAP = BRIEF_READY_THRESHOLD - 1;

/**
 * Weighted field completeness, summing to 100 and split by what the number is
 * for. Core is what a salesperson cannot run a call without — no role title
 * means nothing to source, no timeline means no way to tell a live deal from
 * browsing. Context only changes how they pitch.
 *
 * Core sums to exactly BRIEF_READY_THRESHOLD, so a brief carrying all five core
 * facts is ready on the strength of those alone and context takes it towards
 * 100. Context sums to the remaining 30 and can therefore never reach the line
 * by itself. `people` is worth least because a named role already answers it.
 *
 * `intent` is deliberately unweighted: it is derived from these fields rather
 * than being something the visitor told us, so scoring it inflated every brief
 * by 15 for free.
 */
const STRENGTH_WEIGHTS = {
  // Core — deal-shaping. 70 total.
  roleShape: 15,
  techStacks: 15,
  timeline: 15,
  seniority: 15,
  people: 10,
  // Context — pitch-shaping. 30 total. Regions rank lowest because Cloud
  // Employee largely determines where staff come from, so a stated preference is
  // information but not qualification.
  goals: 10,
  companyContext: 7,
  engagement: 5,
  teamContext: 4,
  regions: 2,
  mustHaves: 2,
} as const;

/** One conversation turn as the extractor needs it — role and text, nothing else. */
export type BriefConversationTurn = Pick<ChatMessage, 'role' | 'content'>;

export interface ExtractBriefResult {
  success: boolean;
  /** The complete, merged, versioned brief. Undefined when there is nothing to say yet. */
  brief?: Brief;
  /** True when the content differs from the previous brief, i.e. worth persisting. */
  changed: boolean;
  error?: string;
}

// ─── Cost gates ─────────────────────────────────────────────────────

/**
 * Workspaces allowed to spend app-level Anthropic credit on brief extraction.
 * Unset (the default) means every workspace extracts, so /ask works without
 * configuration; set ASK_BRIEF_WORKSPACE_IDS to a comma-separated list of
 * workspace UUIDs to restrict it once other tenants are live.
 */
export function isBriefExtractionEnabled(workspaceId: string): boolean {
  const configured = (process.env.ASK_BRIEF_WORKSPACE_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (configured.length === 0) return true;
  return configured.includes(workspaceId);
}

const TRIVIAL_MESSAGE_REGEX =
  /^(hi|hello|hey|yo|thanks|thank you|ty|ok|okay|k|sure|yes|yep|yeah|no|nope|nice|great|cool|perfect|got it|sounds good|will do|bye|goodbye|cheers)[\s!.,?]*$/i;

const EMAIL_ONLY_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const QUESTION_OPENER_REGEX = /^(what|how|who|where|when|why|which|do|does|did|can|could|would|is|are|tell me)\b/i;

/** First person, or vocabulary that only shows up when someone describes their own need. */
const BRIEF_SIGNAL_REGEX =
  /\b(i|we|my|our|us|me)\b|\b(need|needs|looking for|want|hiring|hire|recruit|build|building|scale|team|role|developer|engineer|designer|stack|budget|timeline|start|deadline|month|months|week|weeks|remote|onsite|offshore|contract|full[-\s]?time|part[-\s]?time)\b/i;

/**
 * Whether this visitor message could plausibly change the brief. Purely a spend
 * gate: "What are your terms?" needs no extraction pass, and this is the
 * difference between a sensible bill and a silly one. Biased towards running,
 * because a missed brief update is more visible than one wasted Haiku call.
 */
export function shouldExtractBrief(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length < 3) return false;
  if (TRIVIAL_MESSAGE_REGEX.test(trimmed)) return false;
  // An email on its own is contact capture, already handled elsewhere.
  if (EMAIL_ONLY_REGEX.test(trimmed)) return false;

  const looksLikeQuestion = trimmed.includes('?') || QUESTION_OPENER_REGEX.test(trimmed);
  const hasBriefSignal = BRIEF_SIGNAL_REGEX.test(trimmed);
  const hasNumber = /\d/.test(trimmed);
  // A question about Cloud Employee that says nothing about the visitor's own
  // situation cannot move the brief.
  if (looksLikeQuestion && !hasBriefSignal && !hasNumber) return false;

  return true;
}

// ─── Extraction ─────────────────────────────────────────────────────

/**
 * Extract a brief from the conversation and merge it over the brief already on
 * the session. Never throws.
 *
 * The model sees the transcript, not the previous brief: a fresh read of the
 * whole conversation handles corrections naturally, and the merge below protects
 * against a turn where the model simply omits something it mentioned before.
 */
export async function extractBrief(
  conversation: BriefConversationTurn[],
  previousBrief: Brief | null
): Promise<ExtractBriefResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { success: false, changed: false, error: 'ANTHROPIC_API_KEY not set' };
  if (conversation.length === 0) return { success: false, changed: false, error: 'No conversation to extract from' };

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create(
      {
        model: BRIEF_MODEL,
        max_tokens: BRIEF_MAX_TOKENS,
        temperature: 0,
        system: EXTRACT_BRIEF_PROMPT,
        messages: [{ role: 'user', content: buildTranscript(conversation) }],
      },
      { timeout: BRIEF_TIMEOUT_MS, maxRetries: 1 }
    );

    const textContent = response.content.find((c) => c.type === 'text');
    const raw = textContent?.text?.trim() ?? '';
    if (!raw) return { success: false, changed: false, error: 'Empty response' };

    const parsed = parseJsonObject(raw);
    if (!parsed) {
      return { success: false, changed: false, error: `Unparseable response: ${raw.slice(0, 200)}` };
    }

    return buildBrief(coerceExtractedFields(parsed), previousBrief);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, changed: false, error: `Brief extraction failed: ${message}` };
  }
}

function buildTranscript(conversation: BriefConversationTurn[]): string {
  const lines = conversation
    .slice(-HISTORY_MESSAGE_LIMIT)
    .map((m) => `${m.role === 'user' ? 'Visitor' : 'Assistant'}: ${m.content}`);

  // Drop the oldest turns first when over budget — anything the visitor said
  // earlier is already carried forward by the merge against the stored brief.
  while (lines.length > 1 && lines.join('\n').length > HISTORY_CHAR_BUDGET) {
    lines.shift();
  }
  return lines.join('\n').slice(-HISTORY_CHAR_BUDGET);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// ─── Merge + versioning ─────────────────────────────────────────────

function buildBrief(extracted: Partial<BriefContent>, previousBrief: Brief | null): ExtractBriefResult {
  const content = mergeBriefContent(previousBrief, extracted);
  const previousContent = previousBrief ? briefContent(previousBrief) : null;

  const changed =
    previousContent === null
      ? hasAnyContent(content)
      : stableStringify(content) !== stableStringify(previousContent);

  // Nothing confident yet and nothing stored: say nothing rather than publish an
  // empty brief and burn a version number on it.
  if (!changed && previousContent === null) {
    return { success: true, changed: false };
  }

  const version = changed ? (previousBrief?.version ?? 0) + 1 : previousBrief?.version ?? 1;
  return { success: true, changed, brief: { version, ...content } };
}

/**
 * Previous brief as the base, extracted fields overwriting where present.
 *
 * Corrections still land, because the model re-reads the whole conversation and
 * returns the corrected value. What the merge protects against is a field
 * silently disappearing from the canvas because one extraction pass omitted it.
 * The trade-off is that a field, once set, cannot be cleared by extraction — the
 * right call when the alternative is a brief that flickers.
 */
function mergeBriefContent(previousBrief: Brief | null, extracted: Partial<BriefContent>): BriefContent {
  const previous = previousBrief ? briefContent(previousBrief) : null;

  const content: BriefContent = {
    // "unknown" never overwrites an intent we already established.
    intent: extracted.intent && extracted.intent !== 'unknown'
      ? extracted.intent
      : previous?.intent ?? 'unknown',
    strength: 0,
  };

  const headcount = extracted.headcount ?? previous?.headcount;
  if (headcount !== undefined) content.headcount = headcount;

  const roles = extracted.roles ?? previous?.roles;
  if (roles) content.roles = roles;

  const techStacks = extracted.techStacks ?? previous?.techStacks;
  if (techStacks) content.techStacks = techStacks;

  const regions = extracted.regions ?? previous?.regions;
  if (regions) content.regions = regions;

  const engagement = extracted.engagement ?? previous?.engagement;
  if (engagement) content.engagement = engagement;

  const timeline = extracted.timeline ?? previous?.timeline;
  if (timeline) content.timeline = timeline;

  const teamContext = extracted.teamContext ?? previous?.teamContext;
  if (teamContext) content.teamContext = teamContext;

  const companyContext = extracted.companyContext ?? previous?.companyContext;
  if (companyContext) content.companyContext = companyContext;

  const goals = extracted.goals ?? previous?.goals;
  if (goals) content.goals = goals;

  const mustHaves = extracted.mustHaves ?? previous?.mustHaves;
  if (mustHaves) content.mustHaves = mustHaves;

  const complianceFlags = extracted.complianceFlags ?? previous?.complianceFlags;
  if (complianceFlags) content.complianceFlags = complianceFlags;

  const suggestedPod = extracted.suggestedPod ?? previous?.suggestedPod;
  if (suggestedPod) content.suggestedPod = suggestedPod;

  // Repair an arithmetic contradiction rather than publish it. Observed in
  // testing: correcting "3 React devs" down to 2 made the model relabel a
  // four-person brief as a single hire, which would swap CE's team board for a
  // one-person card. A brief describing more than one person is not a single
  // hire, whatever the model called it. Only this direction is safe to correct —
  // "team_hire" with one role may just mean they have not named the rest yet.
  if (content.intent === 'single_hire' && countBriefPeople(content) > 1) {
    content.intent = 'team_hire';
  }

  content.strength = computeBriefStrength(content);
  return content;
}

function briefContent(brief: Brief): BriefContent {
  const copy: Record<string, unknown> = { ...brief };
  delete copy.version;
  const content = copy as unknown as BriefContent;
  content.strength = computeBriefStrength(content);
  return content;
}

/** The five facts a salesperson needs before the call is worth taking. */
export interface BriefCoreFacts {
  role: boolean;
  people: boolean;
  stack: boolean;
  seniority: boolean;
  timeline: boolean;
}

export function briefCoreFacts(content: BriefContent): BriefCoreFacts {
  // A product build has a pod where a hire has roles; either answers "who".
  const role = (content.roles?.length ?? 0) + (content.suggestedPod?.length ?? 0) > 0;

  return {
    role,
    people: typeof content.headcount === 'number' || role,
    stack: (content.techStacks?.length ?? 0) > 0,
    // A delivery team is not quoted per seat, so no seniority is ever stated for
    // one. What the build is for carries the same weight there, and stands in.
    seniority:
      content.intent === 'product_build'
        ? Boolean(content.goals)
        : (content.roles ?? []).some((role) => Boolean(role.seniority)),
    timeline: Boolean(content.timeline),
  };
}

/**
 * Deterministic strength, computed here rather than asked of the model: a
 * model-invented 0-100 wanders between turns, and this number drives a progress
 * meter that must only ever go up as the visitor says more.
 *
 * complianceFlags is deliberately unweighted — it is situational, not a sign of
 * a more complete brief.
 */
export function computeBriefStrength(content: BriefContent): number {
  const W = STRENGTH_WEIGHTS;
  const core = briefCoreFacts(content);
  let score = 0;

  if (core.role) score += W.roleShape;
  if (core.people) score += W.people;
  if (core.stack) score += W.techStacks;
  if (core.seniority) score += W.seniority;
  if (core.timeline) score += W.timeline;

  if (content.goals) score += W.goals;
  if (content.companyContext) score += W.companyContext;
  if (content.engagement) score += W.engagement;
  if (content.teamContext) score += W.teamContext;
  if ((content.regions?.length ?? 0) > 0) score += W.regions;
  if ((content.mustHaves?.length ?? 0) > 0) score += W.mustHaves;

  score = Math.min(100, score);

  // Hold the score under the ready line until every core fact is in, so the one
  // number crossing the wire carries the whole rule and CE needs no second
  // check. Weighting alone would not do it: a brief missing only seniority still
  // reaches 90, and would announce itself ready to quote.
  return Object.values(core).every(Boolean)
    ? score
    : Math.min(score, BRIEF_INCOMPLETE_CORE_CAP);
}

/** How many people the brief describes, by whichever field says the most. */
function countBriefPeople(content: BriefContent): number {
  const slots = [...(content.roles ?? []), ...(content.suggestedPod ?? [])].reduce(
    (total, entry) => total + entry.count,
    0
  );
  return Math.max(content.headcount ?? 0, slots);
}

function hasAnyContent(content: BriefContent): boolean {
  return (
    content.intent !== 'unknown' ||
    content.strength > 0 ||
    (content.complianceFlags?.length ?? 0) > 0
  );
}

/**
 * Key-sorted JSON, so "did the brief change?" survives the round trip through
 * jsonb — Postgres reorders object keys, so a plain stringify comparison would
 * report a change on every turn.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

// ─── Defensive coercion ─────────────────────────────────────────────

/**
 * Everything the model sent, reduced to fields that satisfy the contract.
 * Anything malformed is dropped rather than repaired: the canvas draws an absent
 * field as a prompt to ask, which is the correct outcome for a value we could
 * not trust.
 */
function coerceExtractedFields(raw: Record<string, unknown>): Partial<BriefContent> {
  const extracted: Partial<BriefContent> = {};

  const intent = typeof raw.intent === 'string' ? raw.intent : '';
  if (VALID_INTENTS.includes(intent as BriefIntent)) extracted.intent = intent as BriefIntent;

  const headcount = coerceInt(raw.headcount, 1, MAX_PEOPLE);
  if (headcount !== undefined) extracted.headcount = headcount;

  const roles = coerceRoles(raw.roles);
  if (roles) extracted.roles = roles;

  const techStacks = coerceStringArray(raw.techStacks, MAX_STACKS, CAP_STACK);
  if (techStacks) extracted.techStacks = techStacks;

  const regions = coerceRegions(raw.regions);
  if (regions) extracted.regions = regions;

  const engagement = coerceEngagement(raw.engagement);
  if (engagement) extracted.engagement = engagement;

  const timeline = coerceString(raw.timeline, CAP_TIMELINE);
  if (timeline) extracted.timeline = timeline;

  const teamContext = coerceString(raw.teamContext, CAP_SENTENCE);
  if (teamContext) extracted.teamContext = teamContext;

  const companyContext = coerceString(raw.companyContext, CAP_SENTENCE);
  if (companyContext) extracted.companyContext = companyContext;

  const goals = coerceString(raw.goals, CAP_SENTENCE);
  if (goals) extracted.goals = goals;

  const mustHaves = coerceMustHaves(raw.mustHaves);
  if (mustHaves) extracted.mustHaves = mustHaves;

  const complianceFlags = coerceStringArray(raw.complianceFlags, MAX_COMPLIANCE_FLAGS, CAP_FLAG);
  if (complianceFlags) extracted.complianceFlags = complianceFlags;

  const suggestedPod = coercePodSlots(raw.suggestedPod);
  if (suggestedPod) extracted.suggestedPod = suggestedPod;

  return extracted;
}

function coerceString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown') return undefined;
  return trimmed.slice(0, maxLength);
}

function coerceInt(value: unknown, min: number, max: number): number | undefined {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(num)) return undefined;
  const rounded = Math.round(num);
  if (rounded < min || rounded > max) return undefined;
  return rounded;
}

function coerceStringArray(value: unknown, maxItems: number, maxLength: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: string[] = [];
  for (const entry of value) {
    const str = coerceString(entry, maxLength);
    if (str && !items.includes(str)) items.push(str);
    if (items.length >= maxItems) break;
  }
  return items.length > 0 ? items : undefined;
}

function coerceRoles(value: unknown): BriefRole[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const roles: BriefRole[] = [];
  for (const entry of value.slice(0, MAX_ROLES)) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const title = coerceString(obj.title, CAP_TITLE);
    if (!title) continue; // A role with no title is not a role.
    // Count defaults to 1: they named the role, so it is at least one person.
    const role: BriefRole = { title, count: coerceInt(obj.count, 1, MAX_PEOPLE) ?? 1 };
    const seniority = coerceString(obj.seniority, CAP_SENIORITY);
    if (seniority) role.seniority = seniority;
    const stacks = coerceStringArray(obj.stacks, MAX_STACKS, CAP_STACK);
    if (stacks) role.stacks = stacks;
    roles.push(role);
  }
  return roles.length > 0 ? roles : undefined;
}

function coerceRegions(value: unknown): BriefRegion[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const regions: BriefRegion[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const region = entry.trim() as BriefRegion;
    if (VALID_REGIONS.includes(region) && !regions.includes(region)) regions.push(region);
  }
  return regions.length > 0 ? regions : undefined;
}

function coerceEngagement(value: unknown): BriefEngagement | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  const type = typeof obj.type === 'string' ? obj.type.trim() : '';
  if (!VALID_ENGAGEMENT_TYPES.includes(type as BriefEngagementType)) return undefined;
  const engagement: BriefEngagement = { type: type as BriefEngagementType };
  const durationMonths = coerceInt(obj.durationMonths, 1, MAX_DURATION_MONTHS);
  if (durationMonths !== undefined) engagement.durationMonths = durationMonths;
  return engagement;
}

function coerceMustHaves(value: unknown): BriefMustHave[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const mustHaves: BriefMustHave[] = [];
  for (const entry of value.slice(0, MAX_MUST_HAVES)) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const label = coerceString(obj.label, CAP_LABEL);
    if (!label) continue;
    mustHaves.push({ label, confirmed: obj.confirmed === true });
  }
  return mustHaves.length > 0 ? mustHaves : undefined;
}

function coercePodSlots(value: unknown): BriefPodSlot[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const slots: BriefPodSlot[] = [];
  for (const entry of value.slice(0, MAX_POD_SLOTS)) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const role = coerceString(obj.role, CAP_TITLE);
    if (!role) continue;
    const slot: BriefPodSlot = { role, count: coerceInt(obj.count, 1, MAX_PEOPLE) ?? 1 };
    const note = coerceString(obj.note, CAP_NOTE);
    if (note) slot.note = note;
    slots.push(slot);
  }
  return slots.length > 0 ? slots : undefined;
}

// ─── Session storage ────────────────────────────────────────────────

/**
 * Read a stored brief back out of `chat_sessions.metadata`, coercing it through
 * the same gate as a fresh extraction. Whatever is in the column may predate the
 * current contract, so nothing about its shape is assumed.
 */
export function readBriefFromMetadata(metadata: unknown): Brief | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const stored = (metadata as Record<string, unknown>).brief;
  if (!stored || typeof stored !== 'object') return null;

  const raw = stored as Record<string, unknown>;
  const content = coerceExtractedFields(raw);
  const version = coerceInt(raw.version, 0, Number.MAX_SAFE_INTEGER) ?? 1;

  const briefContentValue: BriefContent = {
    ...content,
    intent: content.intent ?? 'unknown',
    strength: 0,
  };
  briefContentValue.strength = computeBriefStrength(briefContentValue);

  return { version, ...briefContentValue };
}

/**
 * Store the brief on `chat_sessions.metadata.brief`, so a returning visitor
 * resumes with their brief intact and a human can read it later.
 *
 * Metadata is re-read immediately before the write: the summary hook may have
 * written to the same column earlier in this turn, and spreading a stale copy
 * would drop it.
 */
export async function persistBrief(sessionId: string, brief: Brief): Promise<void> {
  const supabase = createServerClient();

  const { data, error: readError } = await supabase
    .from('chat_sessions')
    .select('metadata')
    .eq('id', sessionId)
    .single();

  if (readError) {
    console.error('[Brief] Could not read metadata before persisting:', readError.message);
    return;
  }

  const metadata = (data?.metadata as Record<string, unknown>) || {};
  const { error: writeError } = await supabase
    .from('chat_sessions')
    .update({
      metadata: { ...metadata, brief, brief_updated_at: new Date().toISOString() },
    })
    .eq('id', sessionId);

  if (writeError) {
    console.error('[Brief] Persist failed:', writeError.message);
  }
}
