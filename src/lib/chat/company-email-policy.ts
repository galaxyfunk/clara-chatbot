// Cloud Employee sales-capture policy. Domain lists match the website's
// site/src/lib/leads/email-policy.ts (CLO-69, 3 October 2026).
// A custom domain is eligible, not proof of identity or buying intent.
// Scope this policy to CE; Clara hosts unrelated customer workspaces.
/** Same shape the inputs and the Zod schemas accept: one @, no spaces, a dot in the domain. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Consumer mailbox providers - free/personal addresses with no company behind
 * the domain. Grown from the brief.ts CONSUMER_MAIL set; the additions are the
 * common national variants (yahoo.co.in, hotmail.fr) and the US/UK/AU ISP
 * mailboxes CE's audience actually uses (btinternet, comcast, bigpond).
 */
export const PERSONAL_EMAIL_DOMAINS = new Set([
  // Global free providers
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com',
  'proton.me', 'protonmail.com', 'pm.me', 'tutanota.com', 'tuta.io', 'tuta.com',
  'hushmail.com', 'duck.com', 'zoho.com', 'zohomail.com',
  'mail.com', 'inbox.com', 'fastmail.com', 'hey.com', 'gmx.com', 'gmx.de', 'gmx.net',
  'yandex.com', 'yandex.ru', 'mail.ru',
  'qq.com', '163.com', '126.com', 'sina.com', 'foxmail.com',
  'naver.com', 'hanmail.net', 'daum.net', 'rediffmail.com',
  // National variants of the big four
  'yahoo.co.uk', 'yahoo.co.in', 'yahoo.fr', 'yahoo.de', 'yahoo.es', 'yahoo.it',
  'yahoo.ca', 'yahoo.com.au', 'yahoo.com.br', 'yahoo.com.ph',
  'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.es', 'hotmail.it', 'hotmail.ca',
  'outlook.co.uk', 'outlook.fr', 'outlook.de', 'outlook.es', 'outlook.in', 'outlook.ph',
  'live.co.uk', 'live.fr', 'live.de', 'live.ca', 'live.com.au',
  // ISP mailboxes: UK
  'btinternet.com', 'btopenworld.com', 'sky.com', 'virginmedia.com',
  'talktalk.net', 'blueyonder.co.uk', 'ntlworld.com', 'plus.net',
  // ISP mailboxes: US/CA
  'comcast.net', 'att.net', 'verizon.net', 'sbcglobal.net', 'bellsouth.net',
  'cox.net', 'charter.net', 'earthlink.net', 'shaw.ca', 'rogers.com', 'sympatico.ca',
  // ISP mailboxes: AU/NZ
  'bigpond.com', 'bigpond.net.au', 'optusnet.com.au', 'iinet.net.au', 'xtra.co.nz',
  // PH (CE's talent audience - a hiring manager will not be on these either)
  'yahoo.com.sg', 'web.de', 't-online.de',
])

/**
 * Throwaway inboxes. These were already a negative signal in brief.ts
 * (nobody spends a budget from a ten-minute mailbox); now they are a hard no.
 */
export const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'temp-mail.org',
  'tempmail.dev', '10minutemail.com', 'throwawaymail.com', 'yopmail.com',
  'trashmail.com', 'sharklasers.com', 'getnada.com', 'maildrop.cc',
  'dispostable.com', 'mailnesia.com', 'fakeinbox.com', 'spamgourmet.com',
  'mintemail.com', 'mohmal.com', 'mytemp.email', 'burnermail.io',
  'emailondeck.com', 'mail.tm', 'moakt.com', '33mail.com', 'mailsac.com',
])

export function emailDomain(email: string): string {
  return (email.split('@')[1] ?? '').toLowerCase().trim()
}

export type EmailVerdict = 'ok' | 'invalid' | 'personal' | 'disposable'

/** Everything that can be judged without a network call. */
export function classifyEmail(email: string): EmailVerdict {
  if (!EMAIL_RE.test(email)) return 'invalid'
  const domain = emailDomain(email)
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return 'disposable'
  if (PERSONAL_EMAIL_DOMAINS.has(domain)) return 'personal'
  return 'ok'
}

/** The one question the forms ask. */
export function isWorkEmail(email: string): boolean {
  return classifyEmail(email) === 'ok'
}

export const CE_WORKSPACE_ID = '09aa62df-5af6-4cec-b565-c335e907327d';
export const WORK_EMAIL_MESSAGE = 'Please use your company email address. Personal and disposable email addresses are not accepted for sales enquiries.';

/** Applies before either streaming or non-streaming chat can save a contact. */
export function companyEmailError(workspaceId: string, text: string): string | null {
  if (workspaceId.trim().replace(/[{}-]/g, '').toLowerCase() !== CE_WORKSPACE_ID.replace(/-/g, '')) return null;
  const emails = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) ?? [];
  return emails.some(email => classifyEmail(email) !== 'ok') ? WORK_EMAIL_MESSAGE : null;
}
