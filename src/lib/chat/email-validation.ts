import { CE_WORKSPACE_ID } from './company-email-policy';

const UNAVAILABLE = 'Email verification is temporarily unavailable. Please try again later.';
/** CE only. Other tenants do not use CE's provider, credits or email policy. */
export async function mailboxError(workspaceId: string, text: string, context?: string, country?: string | null): Promise<string | { pendingReview: true; message: string } | null> {
  if (workspaceId.trim().replace(/[{}-]/g, '').toLowerCase() !== CE_WORKSPACE_ID.replace(/-/g, '')) return null;
  const emails = [...new Set(text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) ?? [])];
  if (!emails.length) return null;
  if (emails.length > 3) return 'Please provide one email address at a time.';
  const key = process.env.EMAIL_VALIDATION_BRIDGE_KEY;
  if (!key) return UNAVAILABLE;
  for (const email of emails) {
    try {
      const response = await fetch('https://www.cloudemployee.io/api/email/validate', {
        method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(12000),
        headers: { 'Content-Type': 'application/json', 'x-email-validation-key': key },
        body: JSON.stringify({ email, inquiry: (context ?? text).slice(0, 20000), country }),
      });
      const result = await response.json();
      if (response.ok && result.pendingReview === true && typeof result.message === 'string') return { pendingReview: true, message: result.message };
      if (!response.ok || result.ok !== true) {
        return typeof result.message === 'string' ? result.message : UNAVAILABLE;
      }
    } catch { return UNAVAILABLE; }
  }
  return null;
}

/** Use visitor-authored history: the email can arrive after the service pitch. */
export async function chatMailboxError(
  workspaceId: string, text: string, country: string | null,
  loadMessages: () => Promise<Array<{role:string;content:string}>>,
) {
  const ce = workspaceId.trim().replace(/[{}-]/g, '').toLowerCase() === CE_WORKSPACE_ID.replace(/-/g, '');
  if (!ce || !/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(text)) return null;
  try {
    const messages = await loadMessages();
    const history = messages.filter(m => m.role === 'user' && typeof m.content === 'string').map(m => m.content);
    // Preserve the current message while bounding earlier visitor context.
    const context = [...history, text].join('\n').slice(-20000);
    return await mailboxError(workspaceId, text, context, country);
  } catch { return UNAVAILABLE; }
}
