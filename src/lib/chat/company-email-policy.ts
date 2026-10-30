import {classifyEmail} from './work-email-policy';
export {classifyEmail, PERSONAL_EMAIL_DOMAINS, DISPOSABLE_EMAIL_DOMAINS, isWorkEmail} from './work-email-policy';
export const CE_WORKSPACE_ID = '09aa62df-5af6-4cec-b565-c335e907327d';
export const WORK_EMAIL_MESSAGE = 'Please use your company email address. Personal and disposable email addresses are not accepted for sales enquiries.';

/** Applies before either streaming or non-streaming chat can save a contact. */
export function companyEmailError(workspaceId: string, text: string): string | null {
  if (workspaceId.trim().replace(/[{}-]/g, '').toLowerCase() !== CE_WORKSPACE_ID.replace(/-/g, '')) return null;
  const emails = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) ?? [];
  return emails.some(email => classifyEmail(email) !== 'ok') ? WORK_EMAIL_MESSAGE : null;
}
