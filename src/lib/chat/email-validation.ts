import { CE_WORKSPACE_ID } from './company-email-policy';

const UNAVAILABLE = 'Email verification is temporarily unavailable. Please try again later.';
/** CE only. Other tenants do not use CE's provider, credits or email policy. */
export async function mailboxError(workspaceId: string, text: string): Promise<string | null> {
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
        body: JSON.stringify({ email }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        return typeof result.message === 'string' ? result.message : UNAVAILABLE;
      }
    } catch { return UNAVAILABLE; }
  }
  return null;
}
