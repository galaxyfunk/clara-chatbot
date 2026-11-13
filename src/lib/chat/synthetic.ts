/**
 * The website's service-health monitor asks Clara this exact question every
 * two hours (cloudemployee.io site/src/app/api/cron/service-health). Since
 * 14 Nov 2026 it sends `health_check: true` and Clara answers WITHOUT saving a
 * chat. Rows saved before that are hidden from the Sessions list by default.
 */
export const HEALTH_CHECK_QUESTION = 'Where are your engineers based?';

type SessionLike = {
  messages?: unknown;
  metadata?: unknown;
  visitor_email?: string | null;
};

export function isSyntheticSession(session: SessionLike): boolean {
  const meta = session.metadata && typeof session.metadata === 'object' ? session.metadata as Record<string, unknown> : {};
  if (meta.synthetic === true) return true;
  if (session.visitor_email) return false;
  const messages = Array.isArray(session.messages) ? session.messages as Array<{ role?: string; content?: string }> : [];
  return messages.length === 2
    && messages[0]?.role === 'user'
    && messages[0]?.content?.trim() === HEALTH_CHECK_QUESTION;
}

/** A health probe must be the fixed question; anything else is a normal chat. */
export function isHealthProbe(body: { health_check?: unknown; message?: unknown }): boolean {
  return body.health_check === true && typeof body.message === 'string' && body.message.trim() === HEALTH_CHECK_QUESTION;
}
