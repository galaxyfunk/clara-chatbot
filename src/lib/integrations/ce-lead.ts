/**
 * Tells Cloud Employee's website that Clara just captured a work email.
 *
 * Clara does NOT post to Slack itself. This POST hits the existing
 * https://www.cloudemployee.io/api/lead endpoint, and THAT service:
 *   - rejects Gmail / AOL / other personal inboxes
 *   - posts the Lead Agent brief to #aa-leads-channel
 *   - sends +test- emails to #aa-leads-test
 *
 * Failures are swallowed. A lead or Slack outage must never break the chat.
 */

const CE_LEAD_URL = 'https://www.cloudemployee.io/api/lead';
const LEAD_TIMEOUT_MS = 5000;

export interface AskClaraLeadInput {
  email: string;
  firstName?: string | null;
  sourcePage?: string | null;
  message?: string | null;
  /** Same session permalink HubSpot gets. Slack turns this into "Read the conversation". */
  claraSessionUrl?: string | null;
}

export async function notifyAskClaraLead(input: AskClaraLeadInput): Promise<void> {
  try {
    const body = {
      gateway: 'ask_clara',
      sourcePage: input.sourcePage?.trim() || '/',
      firstName: input.firstName?.trim() || 'Visitor',
      email: input.email,
      ...(input.message?.trim()
        ? { message: input.message.trim().slice(0, 4000) }
        : {}),
      ...(input.claraSessionUrl?.trim()
        ? { claraSessionUrl: input.claraSessionUrl.trim() }
        : {}),
    };

    console.log('[CE Lead] POSTing ask_clara lead');

    const response = await fetch(CE_LEAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LEAD_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[CE Lead] POST failed:', response.status, detail.slice(0, 300));
      return;
    }

    console.log('[CE Lead] POST ok');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CE Lead] notifyAskClaraLead error:', message);
  }
}

/** First name from the chat session, or "Visitor" when we never learned one. */
export function firstNameFromChat(visitorName?: string | null): string {
  const trimmed = visitorName?.trim();
  if (!trimmed) return 'Visitor';
  return trimmed.split(/\s+/)[0];
}

/**
 * Short note for the lead brief. Prefer the stored AI summary when it exists;
 * otherwise stitch the visitor's recent messages so the brief is not empty.
 */
export function buildAskClaraLeadMessage(
  messages: Array<{ role: string; content: string }>,
  storedSummary?: string | null,
): string | undefined {
  if (storedSummary?.trim()) {
    return storedSummary.trim().slice(0, 4000);
  }

  const userBits = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content.trim())
    .filter(Boolean)
    .slice(-6);

  if (userBits.length === 0) return undefined;
  return userBits.join('\n').slice(0, 4000);
}

/**
 * Best-effort page the visitor was on. The widget does not send a page URL
 * today, so we read the Referer header. Iframe chats originate on Clara's
 * own host, which is not the marketing page — those fall back to "/".
 */
export function resolveSourcePage(
  declared: unknown,
  referer: string | null,
  appUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL,
): string {
  if (typeof declared === 'string' && declared.trim()) {
    return declared.trim().slice(0, 500);
  }

  if (!referer) return '/';

  try {
    const url = new URL(referer);
    if (appUrl) {
      const appHost = new URL(appUrl).host;
      if (url.host === appHost) return '/';
    }
    const path = `${url.pathname}${url.search}`;
    return path || '/';
  } catch {
    return '/';
  }
}
