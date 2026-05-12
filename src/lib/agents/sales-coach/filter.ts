import type { SalesCoachFilterInput, SalesCoachFilterResult } from '@/types/sales-coach';

/**
 * Returns ok: true if the call has at least one attendee outside the team domains.
 * Returns ok: false with a reason otherwise.
 */
export function shouldAnalyze(input: SalesCoachFilterInput): SalesCoachFilterResult {
  if (!input.attendees || input.attendees.length === 0) {
    return { ok: false, reason: 'no_attendees' };
  }

  const teamDomains = input.teamDomains.map((d) => d.toLowerCase().trim());
  const externalAttendees = input.attendees.filter((a) => {
    const email = (a.email ?? '').toLowerCase();
    if (!email.includes('@')) return false;
    const domain = email.split('@')[1];
    return !teamDomains.includes(domain);
  });

  if (externalAttendees.length === 0) {
    return { ok: false, reason: 'no_external_attendee' };
  }

  return { ok: true, externalAttendees };
}
