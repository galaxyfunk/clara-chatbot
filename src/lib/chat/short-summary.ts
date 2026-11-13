import { createServerClient } from '@/lib/supabase/server';

/**
 * One-to-three line summary of a Clara chat for lead cards and Growth OS.
 * Stored in chat_sessions.summary (unused until 14 Nov 2026) as
 * { text, source, message_count, generated_at }.
 *
 * No model call: it prefers the optional AI summary (metadata.summary, only
 * written when CLARA_SUMMARY_ENABLED is on), then the extracted hiring brief
 * that Clara already keeps in metadata.brief, then the visitor's own words.
 * Free, deterministic and never invents facts.
 */
export interface ShortSummary {
  text: string;
  source: 'ai' | 'brief' | 'visitor';
  message_count: number;
  generated_at: string;
}

type Msg = { role?: string; content?: string };
const MAX = 280;
const clip = (s: string, n = MAX) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t;
};
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown) => typeof v === 'string' ? v.trim() : '';
/** Never repeat contact details in a summary that is posted to Slack. */
const scrub = (s: string) => s.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]').replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone]');

function fromBrief(briefValue: unknown): string {
  const brief = obj(briefValue);
  const roles = Array.isArray(brief.roles) ? brief.roles.map(obj) : [];
  const roleText = roles.map(r => [r.count ? String(r.count) : '', str(r.seniority), str(r.title)].filter(Boolean).join(' ')).filter(Boolean).join(', ');
  const parts: string[] = [];
  if (roleText) parts.push(`Wants ${roleText}`);
  else if (str(brief.goals)) parts.push(str(brief.goals).replace(/\.$/, ''));
  const stacks = Array.isArray(brief.techStacks) ? brief.techStacks.filter(x => typeof x === 'string') : [];
  if (stacks.length && !stacks.every(s => roleText.toLowerCase().includes(String(s).toLowerCase()))) parts.push(`stack ${stacks.join(', ')}`);
  const regions = Array.isArray(brief.regions) ? brief.regions.filter(x => typeof x === 'string') : [];
  if (regions.length) parts.push(`region ${regions.join('/')}`);
  if (str(brief.timeline)) parts.push(`timeline ${str(brief.timeline)}`);
  const context = str(brief.companyContext) || str(brief.teamContext);
  if (!parts.length) return '';
  return `${parts.join(' · ')}.${context ? ` ${context.replace(/\.$/, '')}.` : ''}`;
}

export function buildShortSummary(session: { messages?: unknown; metadata?: unknown }, now = new Date()): ShortSummary | null {
  const messages = Array.isArray(session.messages) ? session.messages as Msg[] : [];
  if (!messages.length) return null;
  const meta = obj(session.metadata);
  const generated_at = now.toISOString();
  const ai = str(obj(meta.summary).summary);
  if (ai) return { text: clip(scrub(ai)), source: 'ai', message_count: messages.length, generated_at };
  const brief = fromBrief(meta.brief);
  if (brief) return { text: clip(scrub(brief)), source: 'brief', message_count: messages.length, generated_at };
  const visitor = messages.filter(m => m.role === 'user').map(m => str(m.content)).filter(t => t && !/^[\w.+-]+@[\w.-]+$/.test(t));
  if (!visitor.length) return null;
  return { text: clip(scrub(`Asked: ${visitor.slice(0, 2).join(' / ')}`)), source: 'visitor', message_count: messages.length, generated_at };
}

export function readShortSummary(value: unknown): ShortSummary | null {
  const v = obj(value);
  return str(v.text) && typeof v.message_count === 'number' ? v as unknown as ShortSummary : null;
}

/** Refresh the stored summary when the chat has grown since it was written. */
export async function persistShortSummary(sessionId: string): Promise<ShortSummary | null> {
  const supabase = createServerClient();
  const { data } = await supabase.from('chat_sessions').select('messages, metadata, summary').eq('id', sessionId).single();
  if (!data) return null;
  const current = readShortSummary(data.summary);
  const count = Array.isArray(data.messages) ? data.messages.length : 0;
  if (current && current.message_count >= count) return current;
  const next = buildShortSummary(data);
  if (!next) return null;
  const { error } = await supabase.from('chat_sessions').update({ summary: next }).eq('id', sessionId);
  if (error) console.error('[Short summary] persist failed:', error.code ?? 'unknown');
  return next;
}
