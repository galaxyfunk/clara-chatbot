import type {
  FirefliesTranscriptDetail,
  FirefliesAttendee,
} from '@/types/fireflies';
import { normalizeDurationPct } from '@/lib/integrations/fireflies';
import type { SalesCoachPromptVariables } from '@/types/sales-coach';

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/**
 * Pick the most common external email domain from the attendees list.
 * Fireflies' `meeting_attendees` excludes the authenticated user, so the team
 * rep won't appear here — but defend with the team-domain filter anyway. If
 * multiple external domains appear (prospect company + ICP guest, etc.),
 * the most-common one is almost always the prospect.
 */
export function pickProspectDomain(
  attendees: FirefliesAttendee[],
  teamDomains: string[]
): string | null {
  const teamSet = new Set(teamDomains.map((d) => d.toLowerCase().trim()));
  const counts = new Map<string, number>();
  for (const a of attendees) {
    const email = (a.email ?? '').toLowerCase();
    if (!email.includes('@')) continue;
    const domain = email.split('@')[1];
    if (!domain || teamSet.has(domain)) continue;
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const [topDomain] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return topDomain;
}

function inferProspectCompany(
  attendees: FirefliesAttendee[],
  teamDomains: string[]
): string {
  const domain = pickProspectDomain(attendees, teamDomains);
  if (!domain) return 'Unknown';
  const root = domain.split('.')[0];
  return root.charAt(0).toUpperCase() + root.slice(1);
}

/**
 * Build the comma-joined attendees line for the prompt. Fireflies omits the
 * authenticated user from meeting_attendees, so prepend the rep manually with
 * a "(rep)" annotation so Claude has full context for the coaching.
 */
function formatAttendees(
  attendees: FirefliesAttendee[],
  rep: { name: string; email: string }
): string {
  const repLine = `${rep.name} <${rep.email}> (rep)`;
  const others = attendees.map((a) => `${a.name ?? '(no name)'} <${a.email ?? ''}>`);
  return [repLine, ...others].join(', ');
}

function formatTalkRatios(
  speakers: FirefliesTranscriptDetail['analytics']['speakers']
): string {
  return speakers
    .map((s) => `${s.name}: ${normalizeDurationPct(s.duration_pct)}%`)
    .join(', ');
}

function formatLongestMonologue(
  speakers: FirefliesTranscriptDetail['analytics']['speakers']
): string {
  const top = [...speakers].sort((a, b) => b.longest_monologue - a.longest_monologue)[0];
  if (!top) return 'Unknown';
  return `${top.name}: ${formatDuration(top.longest_monologue)}`;
}

function formatQuestionsAsked(
  speakers: FirefliesTranscriptDetail['analytics']['speakers'],
  repName: string
): string {
  const rep = speakers.find((s) => s.name.toLowerCase().includes(repName.toLowerCase()));
  if (!rep) return `${repName}: unknown`;
  return `${rep.name}: ${rep.questions}`;
}

function formatTranscript(sentences: FirefliesTranscriptDetail['sentences']): string {
  return sentences
    .map((s) => `${s.speaker_name}: ${s.text}`)
    .join('\n');
}

export function buildPromptVariables(
  transcript: FirefliesTranscriptDetail,
  rep: { name: string; email: string },
  teamDomains: string[]
): SalesCoachPromptVariables {
  return {
    company: inferProspectCompany(transcript.meeting_attendees, teamDomains),
    attendees: formatAttendees(transcript.meeting_attendees, rep),
    duration: formatDuration(transcript.duration * 60),
    talk_ratios: formatTalkRatios(transcript.analytics.speakers),
    longest_monologue: formatLongestMonologue(transcript.analytics.speakers),
    questions_asked: formatQuestionsAsked(transcript.analytics.speakers, rep.name),
    transcript: formatTranscript(transcript.sentences),
  };
}

/**
 * Interpolate {{variable}} placeholders in the template with the variables map.
 * Unknown placeholders are left as-is (logged as warning).
 */
export function interpolatePrompt(
  template: string,
  vars: SalesCoachPromptVariables
): string {
  const map = vars as unknown as Record<string, string>;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key in map) return map[key];
    console.warn(`[SalesCoach] Unknown prompt variable: ${key}`);
    return match;
  });
}
