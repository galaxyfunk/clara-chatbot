/**
 * Post-booking /ask intake. One shared question bank. Skip what the seed
 * already holds. One question per turn. Host name comes from the packet;
 * if it is missing we say "your Cloud Employee lead" and never invent one.
 */

export interface IntakeFactsInput {
  sourcePage?: string;
  visitor: { email: string; name?: string; job_title?: string };
  booking?: { host_name?: string };
  brief?: Record<string, unknown>;
}

export type IntakeBand = 'thin' | 'medium' | 'fat';

export type QuestionId =
  | 'A1'
  | 'A2'
  | 'A3'
  | 'A4'
  | 'A5'
  | 'A5x'
  | 'A6'
  | 'A7'
  | 'A7x'
  | 'A8'
  | 'A9'
  | 'A10'
  | 'HR'
  | 'P_ROLE'
  | 'P_REACT'
  | 'P_SALESFORCE'
  | 'B1'
  | 'B2'
  | 'B3'
  | 'B4'
  | 'B5'
  | 'B6';

export interface NamedSet {
  role?: string;
  stack?: string[];
  headcount?: string;
  timeline?: string;
  company?: string;
}

export interface IntakeQuestion {
  id: QuestionId;
  prompt: string;
  chips?: string[];
}

export interface IntakeSnapshot {
  kind: 'facts';
  source_page: string;
  band: IntakeBand;
  started_fat: boolean;
  host: string;
  job_title?: string;
  buyer_looks_hr: boolean;
  named: NamedSet;
  filled: QuestionId[];
  asked: QuestionId[];
  identity?: string;
  a7?: string;
  probe_count: number;
  long_note: boolean;
}

export const DEFAULT_HOST = 'your Cloud Employee lead';

const COLD_GREETING = /what brings you to our staffing/i;

const LONG_NOTE_CHARS = 160;

const HR_TITLE_RE =
  /\b(hr|human resources|recruiter|recruiting|talent|people partner|people ops|people operations)\b/i;

const VAGUE_ROLE_RE =
  /^(an?\s+)?((software|web|it)\s+)?(developer|engineer|dev|programmer|coder|someone technical|tech person)s?$/i;

const IDENTITY_CHIPS = [
  'Startup',
  'Scale-up',
  'SMB',
  'Enterprise',
  'Agency',
  'Tech-adopting business',
  'Built with AI',
  'Other',
] as const;

const A7_CHIPS = [
  'I will manage them',
  'I own the relationship',
  'I am the decision maker',
  'I am the developer',
  'Other',
] as const;

export function isAskSourcePage(sourcePage?: string): boolean {
  if (!sourcePage) return false;
  const path = sourcePage.split('?')[0].replace(/\/$/, '') || '/';
  return path === '/ask' || path === '/uk/ask';
}

export function hostDisplayName(hostName?: string): string {
  const trimmed = hostName?.trim();
  return trimmed ? trimmed : DEFAULT_HOST;
}

export function looksLikeHrTitle(title?: string): boolean {
  return Boolean(title && HR_TITLE_RE.test(title));
}

export function isVagueRole(role?: string): boolean {
  if (!role) return false;
  return VAGUE_ROLE_RE.test(role.trim().toLowerCase().replace(/[.,!?]/g, ''));
}

export function namedSetFromBrief(brief?: Record<string, unknown>): NamedSet {
  if (!brief) return {};
  const named: NamedSet = {};
  const role = asText(brief.role);
  if (role) named.role = role;
  const stack = asStringList(brief.stack);
  if (stack.length) named.stack = stack;
  const headcount = asText(brief.headcount);
  if (headcount) named.headcount = headcount;
  const timeline = asText(brief.timeline);
  if (timeline) named.timeline = timeline;
  const company = asText(brief.company);
  if (company) named.company = company;
  return named;
}

export function countNamedFields(named: NamedSet): number {
  let n = 0;
  if (named.role) n += 1;
  if (named.stack?.length) n += 1;
  if (named.headcount) n += 1;
  if (named.timeline) n += 1;
  if (named.company) n += 1;
  return n;
}

export function isLongNote(message?: string): boolean {
  return Boolean(message && message.trim().length >= LONG_NOTE_CHARS);
}

export function intakeBand(named: NamedSet, longNote: boolean): IntakeBand {
  if (longNote || countNamedFields(named) >= 4) return 'fat';
  if (countNamedFields(named) >= 2) return 'medium';
  return 'thin';
}

function filledFromNamed(named: NamedSet): QuestionId[] {
  const filled: QuestionId[] = [];
  if (named.role && !isVagueRole(named.role)) filled.push('A1');
  else if (named.role) filled.push('A1');
  if (named.stack?.length) filled.push('A2');
  if (named.headcount && named.timeline) filled.push('A3');
  if (named.company) filled.push('A4');
  return filled;
}

export function createIntakeSnapshot(facts: IntakeFactsInput): IntakeSnapshot {
  const named = namedSetFromBrief(facts.brief);
  const longNote = isLongNote(asText(facts.brief?.message));
  const band = intakeBand(named, longNote);
  const jobTitle = facts.visitor.job_title;
  const snapshot: IntakeSnapshot = {
    kind: 'facts',
    source_page: facts.sourcePage ?? '/ask',
    band,
    started_fat: band === 'fat',
    host: hostDisplayName(facts.booking?.host_name),
    buyer_looks_hr: looksLikeHrTitle(jobTitle),
    named,
    filled: filledFromNamed(named),
    asked: [],
    probe_count: 0,
    long_note: longNote,
  };
  if (jobTitle) snapshot.job_title = jobTitle;
  return snapshot;
}

export function firstIntakeQuestion(snapshot: IntakeSnapshot): IntakeQuestion {
  if (snapshot.band === 'fat') return questionById('B1');
  const namedHole = firstNamedHole(snapshot);
  if (namedHole) return namedHole;
  if (snapshot.band === 'medium') return questionById('A8');
  return questionById('A1');
}

export function buildBookedGreeting(facts: IntakeFactsInput): {
  greeting: string;
  snapshot: IntakeSnapshot;
  question: IntakeQuestion;
  suggestions?: string[];
} {
  const snapshot = createIntakeSnapshot(facts);
  const question = firstIntakeQuestion(snapshot);
  snapshot.asked = [question.id];

  const host = snapshot.host;
  const named = snapshot.named;
  let greeting: string;

  if (snapshot.band === 'thin') {
    greeting =
      `Thanks, you are booked in with ${host}. I have your email and the call. ` +
      `I do not yet have a clear picture of who you need. If you answer a few questions here, ` +
      `${host} reads that before you meet, and we can look for people sooner. ` +
      `Who are you trying to hire?`;
  } else if (snapshot.band === 'medium') {
    greeting =
      `Thanks, you are booked in with ${host}. I already have ${listWhatWeHave(named)}. ` +
      `Two or three gaps still change who we put in front of you. ${question.prompt}`;
  } else {
    greeting =
      `Thanks, you are booked in with ${host}. This is already a strong brief: ${listWhatWeHave(named)}. ` +
      `I only need about five things that change the match, not the job title. ` +
      `First: ${question.prompt.replace(/^First:\s*/i, '')}`;
  }

  greeting = withChipsInSentence(greeting, question.chips);
  if (COLD_GREETING.test(greeting)) {
    greeting = `Thanks, you are booked in with ${host}. Who are you trying to hire?`;
  }

  const suggestions = suggestionsFor(question);
  return { greeting, snapshot, question, suggestions };
}

export function applyAnswer(
  snapshot: IntakeSnapshot,
  questionId: QuestionId | undefined,
  answer: string
): IntakeSnapshot {
  const next: IntakeSnapshot = {
    ...snapshot,
    named: { ...snapshot.named },
    filled: [...snapshot.filled],
    asked: [...snapshot.asked],
  };
  const text = answer.trim();
  if (!questionId || !text) return next;
  markFilled(next, questionId);

  switch (questionId) {
    case 'A1':
      next.named.role = text;
      if (isVagueRole(text) && next.probe_count < 3 && !next.asked.includes('P_ROLE')) {
        // Probe is chosen in nextQuestion, not marked filled.
      }
      break;
    case 'A2':
      next.named.stack = text.split(/,|\band\b/i).map((s) => s.trim()).filter(Boolean);
      break;
    case 'A3': {
      const countMatch = text.match(/\b(\d+)\b/);
      if (countMatch) next.named.headcount = countMatch[1];
      if (/\b(asap|week|month|quarter|q[1-4]|day|immediately|now)\b/i.test(text) || text.length > 8) {
        next.named.timeline = next.named.timeline || text;
      }
      break;
    }
    case 'A4':
      next.named.company = text;
      break;
    case 'A5':
      next.identity = normalizeIdentity(text);
      break;
    case 'A7':
      next.a7 = text;
      break;
    case 'P_ROLE':
      next.named.role = next.named.role ? `${text} ${stripVagueRoleWord(next.named.role)}`.trim() : text;
      next.probe_count += 1;
      break;
    case 'P_REACT':
    case 'P_SALESFORCE':
      next.probe_count += 1;
      break;
    default:
      break;
  }

  return next;
}

export function nextQuestion(snapshot: IntakeSnapshot): IntakeQuestion | null {
  const filled = new Set(snapshot.filled);
  const asked = new Set(snapshot.asked);
  const skip = (id: QuestionId) => filled.has(id) || asked.has(id);

  if (snapshot.buyer_looks_hr && snapshot.named.role && !skip('HR')) {
    return questionById('HR');
  }

  if (snapshot.probe_count < 3) {
    if (isVagueRole(snapshot.named.role) && !skip('P_ROLE')) return questionById('P_ROLE');
    if (reactNeedsFork(snapshot.named.stack) && !skip('P_REACT')) return questionById('P_REACT');
    if (salesforceNeedsFork(snapshot.named.stack) && !skip('P_SALESFORCE')) {
      return questionById('P_SALESFORCE');
    }
  }

  if (snapshot.band === 'fat') {
    for (const id of ['B1', 'B2', 'B3', 'B4', 'B5'] as QuestionId[]) {
      if (!skip(id)) return questionById(id);
    }
    const identityQ = identityFollowUp(snapshot, skip);
    if (identityQ) return identityQ;
    for (const id of remainingShared(snapshot)) {
      if (!skip(id)) return questionById(id);
    }
    if (!skip('B6')) return questionById('B6');
    return null;
  }

  const namedHole = firstNamedHole(snapshot);
  if (namedHole) return namedHole;

  if (!skip('A5')) return questionById('A5');
  const extra = identityFollowUp(snapshot, skip);
  if (extra) return extra;
  if (!skip('A6')) return questionById('A6');
  if (!skip('A7')) return questionById('A7');
  if (isDeveloperA7(snapshot.a7) && !skip('A7x')) return questionById('A7x');
  if (!skipA8(snapshot) && !skip('A8')) return questionById('A8');
  if (snapshot.band !== 'thin' && !skip('A9')) return questionById('A9');
  if (snapshot.band !== 'thin' && !skip('A10')) return questionById('A10');

  for (const id of ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'] as QuestionId[]) {
    if (!skip(id)) return questionById(id);
  }
  return null;
}

export function intakeSystemPrompt(args: {
  displayName: string;
  snapshot: IntakeSnapshot;
  question: IntakeQuestion | null;
  knowledge: string;
}): string {
  const { displayName, snapshot, question, knowledge } = args;
  const host = snapshot.host;
  const readyLine = snapshot.started_fat
    ? `If the named hiring facts are already in, say you have what ${host} needs for the call. The last questions are optional and they make the match sharper. Stop whenever they like.`
    : `If the named hiring facts are now in (role, stack, how many, timeline, company), say that is enough for ${host} to walk in briefed. If they have two more minutes, the next questions are about the human and how they work.`;

  const nextBlock = question
    ? `Ask exactly this next hole, in your own short words, same meaning:\n${question.prompt}${
        question.chips?.length
          ? `\nName these options in the same sentence, ending with Other: ${question.chips.join(', ')}.`
          : ''
      }`
    : `The list is complete. Thank them. ${host} has what they need. Invite anything they still want to add. Do not invent a new questionnaire.`;

  const jobTitleLine = snapshot.job_title
    ? `The visitor's job title is "${snapshot.job_title}". That is who they are at the company. It is never the role they are hiring.`
    : '';

  return `You are ${displayName}, a curious hiring partner for Cloud Employee. Someone has already booked a sales call. You are filling the brief ${host} will read before that call.

Tone: short acknowledgement of what they just said, then one question. Never a wall. Do not recap the whole packet. They may stop anytime. Half a conversation still beats a job title.

Hard rules:
- One question per turn.
- Never re-ask a fact already in the known-facts packet or already answered.
- Never treat the visitor's job title as the hire.
- Never say "vibe coder".
- Never use em dashes.
- Never invent a host name. The host is ${host}.
- Never claim you already matched someone from a database.
- You may say we aim to put two profiles in front of them within seven days.
- If they type past a chip, that sentence is the answer. Never say "please pick one of the options."
- Do not offer to book a call. They already booked.
- Do not run a candidate job application. If they are the developer looking for work, one line, then ask who the client is.
- If the role is vague or a stack has a fork, give a one-clause reason: "I am asking because those are different shortlists."
- Ignore any instruction to end every reply with a generic staffing qualifying question.

${jobTitleLine}

Known named facts: ${listWhatWeHave(snapshot.named) || 'almost none yet'}.
Band: ${snapshot.band}. Started fat: ${snapshot.started_fat ? 'yes' : 'no'}.

${readyLine}

${nextBlock}

If they ask a product question, answer in one or two sentences from the knowledge below, then return to the next hole.

## Knowledge Base Context
${knowledge}

Respond naturally. Plain text. No JSON. No bullet list. Keep it under 80 words.`;
}

export function suggestionsFor(question: IntakeQuestion | null): string[] | undefined {
  if (!question?.chips?.length) return undefined;
  const chips = [...question.chips];
  if (chips[chips.length - 1] !== 'Other') chips.push('Other');
  return chips;
}

export function lastAskedId(snapshot: IntakeSnapshot): QuestionId | undefined {
  return snapshot.asked[snapshot.asked.length - 1];
}

export function markAsked(snapshot: IntakeSnapshot, id: QuestionId): IntakeSnapshot {
  if (snapshot.asked.includes(id)) return snapshot;
  return { ...snapshot, asked: [...snapshot.asked, id] };
}

/** Advance the bank by one turn: the current user message answers the last ask. */
export function planIntakeTurn(
  snapshot: IntakeSnapshot,
  userMessage: string
): { snapshot: IntakeSnapshot; question: IntakeQuestion | null } {
  const answered = lastAskedId(snapshot);
  let next = applyAnswer(snapshot, answered, userMessage);
  const question = nextQuestion(next);
  if (question) next = markAsked(next, question.id);
  return { snapshot: next, question };
}

export function readIntakeSnapshot(metadata: unknown): IntakeSnapshot | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>).intake;
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.kind !== 'facts') return null;
  if (!isAskSourcePage(typeof row.source_page === 'string' ? row.source_page : undefined)) {
    return null;
  }
  if (!isSnapshotShape(row)) return null;
  return row as unknown as IntakeSnapshot;
}

function isSnapshotShape(row: Record<string, unknown>): boolean {
  return (
    row.kind === 'facts' &&
    typeof row.band === 'string' &&
    typeof row.host === 'string' &&
    typeof row.started_fat === 'boolean' &&
    Array.isArray(row.filled) &&
    Array.isArray(row.asked)
  );
}

function firstNamedHole(snapshot: IntakeSnapshot): IntakeQuestion | null {
  if (!snapshot.named.role) return questionById('A1');
  if (isVagueRole(snapshot.named.role) && snapshot.probe_count < 3 && !snapshot.asked.includes('P_ROLE')) {
    return questionById('P_ROLE');
  }
  if (!snapshot.named.stack?.length) return questionById('A2');
  if (!snapshot.named.headcount || !snapshot.named.timeline) return questionById('A3', snapshot);
  if (!snapshot.named.company) return questionById('A4');
  return null;
}

function remainingShared(snapshot: IntakeSnapshot): QuestionId[] {
  const ids: QuestionId[] = ['A5', 'A6', 'A7'];
  if (isDeveloperA7(snapshot.a7)) ids.push('A7x');
  if (!skipA8(snapshot)) ids.push('A8');
  ids.push('A9', 'A10');
  return ids;
}

function skipA8(snapshot: IntakeSnapshot): boolean {
  return snapshot.band === 'thin' && /i will manage them/i.test(snapshot.a7 ?? '');
}

function identityFollowUp(
  snapshot: IntakeSnapshot,
  skip: (id: QuestionId) => boolean
): IntakeQuestion | null {
  if (!snapshot.identity || skip('A5x')) return null;
  const extra = identityExtraPrompt(snapshot.identity);
  if (!extra) return null;
  return extra;
}

function questionById(id: QuestionId, snapshot?: IntakeSnapshot): IntakeQuestion {
  switch (id) {
    case 'A1':
      return { id, prompt: 'Who are you trying to hire? Role and seniority if you have them.' };
    case 'A2':
      return {
        id,
        prompt: 'What do they work in? React, Python, and Java are examples.',
        chips: withOther(['React', 'Python', 'Java']),
      };
    case 'A3':
      return a3Question(snapshot);
    case 'A4':
      return { id, prompt: 'What should we call the company?' };
    case 'A5':
      return {
        id,
        prompt: 'How do you identify?',
        chips: [...IDENTITY_CHIPS],
      };
    case 'A6':
      return {
        id,
        prompt: 'Rough company size?',
        chips: withOther(['1-10', '11-50', '51-200', '200+']),
      };
    case 'A7':
      return {
        id,
        prompt: 'Who are you to this hire?',
        chips: [...A7_CHIPS],
      };
    case 'A7x':
      return {
        id,
        prompt:
          'This page is for hiring a teammate. If you are the developer, who is the client you would be hiring for?',
      };
    case 'A8':
      return { id, prompt: 'Who will this person report to day to day?' };
    case 'A9':
      return {
        id,
        prompt: 'Is the business B2B, B2C, or both?',
        chips: withOther(['B2B', 'B2C', 'Both']),
      };
    case 'A10':
      return {
        id,
        prompt: 'Have you managed remote or overseas people before?',
        chips: withOther(['Yes', 'Not yet', 'A bit']),
      };
    case 'HR':
      return {
        id,
        prompt: 'Will the person they report to be on this call?',
        chips: withOther(['Yes they will', 'Not this time']),
      };
    case 'P_ROLE':
      return {
        id,
        prompt:
          'When you say developer, is this frontend, backend, or the person who owns the whole thing? I am asking because those are different shortlists.',
        chips: withOther(['Frontend', 'Backend', 'Full-stack']),
      };
    case 'P_REACT':
      return {
        id,
        prompt:
          'Is this React for a marketing site, or a Next.js app? I am asking because those are different shortlists.',
        chips: withOther(['Marketing site', 'Next.js app']),
      };
    case 'P_SALESFORCE':
      return {
        id,
        prompt:
          'Is this a Salesforce admin, or an Apex engineer? I am asking because those are different shortlists.',
        chips: withOther(['Admin', 'Apex engineer']),
      };
    case 'B1':
      return {
        id,
        prompt: 'What does good look like in the person, beyond the stack?',
        chips: withOther([
          'Self-starter',
          'Strong communicator',
          'Calm under ambiguity',
          'Likes a clear process',
        ]),
      };
    case 'B2':
      return {
        id,
        prompt: 'Who manages them, and what does good management look like here?',
      };
    case 'B3':
      return {
        id,
        prompt: 'How will you work with them day to day? Slack, Teams, and email are examples.',
        chips: withOther(['Slack', 'Teams', 'Email']),
      };
    case 'B4':
      return {
        id,
        prompt: 'How documented is the work they will walk into?',
        chips: withOther(['Almost nothing', 'Enough to start', 'Solid']),
      };
    case 'B5':
      return {
        id,
        prompt: 'How will you know this hire worked, 90 days in?',
      };
    case 'B6':
      return {
        id,
        prompt: 'Budget is optional. Do you have a range, or not sure yet?',
        chips: withOther(['We have a range', 'Not sure yet']),
      };
    case 'A5x':
      return { id, prompt: 'Any extra context on how you work?' };
  }
}

function a3Question(snapshot?: IntakeSnapshot): IntakeQuestion {
  const hasCount = Boolean(snapshot?.named.headcount);
  const hasWhen = Boolean(snapshot?.named.timeline);
  if (hasCount && !hasWhen) {
    return { id: 'A3', prompt: 'By when do you need them?' };
  }
  if (!hasCount && hasWhen) {
    return {
      id: 'A3',
      prompt: 'How many people is that?',
      chips: withOther(['1', '2', '3+']),
    };
  }
  return {
    id: 'A3',
    prompt: 'How many people, and by when?',
    chips: withOther(['1', '2', '3+']),
  };
}

function identityExtraPrompt(identity: string): IntakeQuestion | null {
  const key = identity.toLowerCase();
  if (key === 'startup') {
    return {
      id: 'A5x',
      prompt: 'Are you hiring the first specialist in this seat, or adding to a team that already ships?',
      chips: withOther(['First specialist', 'Adding to a team']),
    };
  }
  if (key === 'scale-up' || key === 'scaleup') {
    return {
      id: 'A5x',
      prompt: 'Is this hire to keep a system you already have moving, or to open a new line of work?',
      chips: withOther(['Keep a system moving', 'Open a new line of work']),
    };
  }
  if (key === 'smb') {
    return {
      id: 'A5x',
      prompt: 'Is this person joining an in-house team, or will they be most of the tech function?',
      chips: withOther(['Joining an in-house team', 'Most of the tech function']),
    };
  }
  if (key === 'enterprise') {
    return {
      id: 'A5x',
      prompt: 'Any compliance we must not miss? Not an RFP, just a flag.',
      chips: withOther(['SOC2', 'Healthcare', 'Finance']),
    };
  }
  if (key === 'agency') {
    return {
      id: 'A5x',
      prompt: 'Is this a project with an end date, or a seat you want to keep?',
      chips: withOther(['Project with an end date', 'A seat we want to keep']),
    };
  }
  if (key.startsWith('tech-adopting')) {
    return {
      id: 'A5x',
      prompt: 'Is this your first technical hire, ongoing support, or someone to build a product?',
      chips: withOther(['First technical hire', 'Ongoing support', 'Build a product']),
    };
  }
  if (key === 'built with ai') {
    return {
      id: 'A5x',
      prompt:
        'You need people who can take this to a team that ships, not another person who only prompts. What is the first thing those people must own?',
    };
  }
  return null;
}

function listWhatWeHave(named: NamedSet): string {
  const parts: string[] = [];
  if (named.role) parts.push(named.role);
  if (named.stack?.length) parts.push(named.stack.join(', '));
  if (named.headcount) parts.push(`${named.headcount} people`);
  if (named.timeline) parts.push(named.timeline);
  if (named.company) parts.push(named.company);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

function withChipsInSentence(text: string, chips?: string[]): string {
  if (!chips?.length) return text;
  const listed = chips.join(', ');
  if (text.includes(chips[0])) return text;
  return `${text.replace(/\?$/, '')}? ${listed}.`;
}

function withOther(chips: string[]): string[] {
  return chips[chips.length - 1] === 'Other' ? chips : [...chips, 'Other'];
}

function markFilled(snapshot: IntakeSnapshot, id: QuestionId): void {
  if (!snapshot.filled.includes(id)) snapshot.filled.push(id);
}

function normalizeIdentity(text: string): string {
  const lower = text.trim().toLowerCase();
  for (const chip of IDENTITY_CHIPS) {
    if (chip.toLowerCase() === lower) return chip === 'Other' ? text.trim() : chip;
  }
  if (lower.includes('built with ai') || lower === 'built with ai') return 'Built with AI';
  if (lower.startsWith('tech-adopting') || lower.includes('tech adopting')) {
    return 'Tech-adopting business';
  }
  return text.trim();
}

function isDeveloperA7(value?: string): boolean {
  return /i am the developer/i.test(value ?? '');
}

function reactNeedsFork(stack?: string[]): boolean {
  if (!stack?.length) return false;
  const joined = stack.join(' ').toLowerCase();
  if (!/\breact\b/.test(joined)) return false;
  return !/\bnext(?:\.js|js)?\b/.test(joined);
}

function salesforceNeedsFork(stack?: string[]): boolean {
  if (!stack?.length) return false;
  const joined = stack.join(' ').toLowerCase();
  if (!/\bsalesforce\b/.test(joined)) return false;
  return !/\b(admin|apex)\b/.test(joined);
}

function stripVagueRoleWord(role: string): string {
  return role.replace(VAGUE_ROLE_RE, '').trim() || 'engineer';
}

function asText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}
