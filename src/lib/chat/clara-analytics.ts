export type ClaraAnalyticsEvent = 'clara_conversation_started' | 'clara_email_captured';

const startedTokens: Record<string, true> = {};
const emailTokens: Record<string, true> = {};

/**
 * Tell the host page that a conversation started or an email was saved.
 * Payload is only source, type, event, and session_token. No transcript, name, or email.
 */
export function postClaraAnalytics(event: ClaraAnalyticsEvent, sessionToken: string): void {
  if (!sessionToken || typeof window === 'undefined') return;

  if (event === 'clara_conversation_started') {
    if (startedTokens[sessionToken]) return;
    startedTokens[sessionToken] = true;
  } else if (event === 'clara_email_captured') {
    if (emailTokens[sessionToken]) return;
    emailTokens[sessionToken] = true;
  } else {
    return;
  }

  const payload = {
    source: 'clara-widget',
    type: 'clara-analytics',
    event,
    session_token: sessionToken,
  };

  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }

  if (inIframe) {
    window.parent.postMessage(payload, '*');
  } else {
    window.postMessage(payload, window.location.origin);
  }
}
