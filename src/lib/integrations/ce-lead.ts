/**
 * Tells Cloud Employee's website that Clara just captured a work email.
 *
 * Clara does NOT post to Slack itself. This POST hits the existing
 * https://www.cloudemployee.io/api/lead endpoint, and THAT service:
 *   - rejects Gmail / AOL / other personal inboxes
 *   - posts the Lead Agent brief to #aa-leads-channel
 *   - sends +test- emails to #aa-leads-test
 *
 * Failures return false so the session can retry delivery on the next turn.
 */

const DEFAULT_CE_LEAD_URL = 'https://www.cloudemployee.io/api/lead';
const LEAD_TIMEOUT_MS = 15000;

export interface AskClaraLeadInput {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  surface?: 'popup' | 'ask';
  conversationId?: string | null;
  sourcePage?: string | null;
  message?: string | null;
  /** Same session permalink HubSpot gets. Slack turns this into "Read the conversation". */
  claraSessionUrl?: string | null;
}

export async function notifyAskClaraLead(input: AskClaraLeadInput): Promise<boolean> {
  try {
    const body = {
      gateway: 'ask_clara',
      sourcePage: input.sourcePage?.trim() || '/',
      firstName: input.firstName?.trim() || 'Visitor',
      email: input.email,
      lastName: input.lastName || undefined,
      company: input.company || undefined,
      sourceSurface: input.surface || 'popup',
      claraConversationId: input.conversationId || undefined,
      ...(input.message?.trim()
        ? { message: input.message.trim().slice(0, 4000) }
        : {}),
      ...(input.claraSessionUrl?.trim()
        ? { claraSessionUrl: input.claraSessionUrl.trim() }
        : {}),
    };

    console.log('[CE Lead] POSTing ask_clara lead');

    // Branch-only preview pairing; never send preview QA through the production receiver.
    const target = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_GIT_COMMIT_REF === 'fix/leads-lv2'
      ? 'https://mygratr-git-fix-leads-lv2-cloud-employee.vercel.app/api/lead'
      : process.env.CE_LEAD_URL || DEFAULT_CE_LEAD_URL;
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LEAD_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[CE Lead] POST failed:', response.status, detail.slice(0, 300));
      return false;
    }

    const result = await response.json();
    if (result.ok !== true) return false;
    console.log('[CE Lead] Delivery accepted');
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CE Lead] notifyAskClaraLead error:', message);
    return false;
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

  const userBits = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content.trim())
    .filter(Boolean);

  if (userBits.length === 0) return storedSummary?.trim().slice(0, 4000) || undefined;
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
