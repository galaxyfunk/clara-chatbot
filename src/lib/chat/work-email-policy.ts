// Synced from cloudemployee.io site/src/lib/leads/email-policy.ts.
// The work-email policy, in one place.
//
// DECISION (Jake, 21 Aug 2026): the site's lead forms accept WORK emails only.
// Personal mailboxes (gmail, yahoo, icloud, ISP addresses) and disposable
// mailboxes are rejected at the form with "use a valid work email". The earlier
// stance - "people evaluating vendors use personal addresses, a false positive
// silently loses a real buyer" (see the old header of /api/pricing-unlock) -
// was reversed after a week of watching #aa-leads-channel: the personal-email
// submissions were job seekers and keyboard mash, not buyers, and each one
// fires a HubSpot workflow notification a salesperson has to read and dismiss.
// A buyer on a personal address still has a path: every page's CTA also offers
// the Calendly booking flow, which this policy does not touch.
//
// CLIENT-SAFE ON PURPOSE. This module is pure data + string tests, imported by
// the client form components (instant inline error) AND the API routes (the
// real gate - a POST from curl never runs the client check). The DNS half of
// the policy lives in email-policy.server.ts because node:dns cannot ship to
// the browser.
//
// The domain sets started life in brief.ts, where they only LABELLED a Slack
// brief ("Unknown (personal email)"). brief.ts now imports them from here, so
// the label and the gate cannot drift apart.

export const WORK_EMAIL_MESSAGE = 'Please use your work email.'

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
  'yahoo.com.mx', 'yahoo.com.ar', 'yahoo.com.tr', 'yahoo.com.co', 'yahoo.com.pe',
  'yahoo.com.ve', 'yahoo.com.cn', 'yahoo.cn', 'yahoo.dk', 'yahoo.no', 'yahoo.se',
  'yahoo.fi', 'yahoo.gr', 'yahoo.pt', 'yahoo.pl', 'yahoo.ro', 'yahoo.hu',
  'hotmail.nl', 'hotmail.be', 'hotmail.dk', 'hotmail.se', 'hotmail.no',
  'hotmail.ch', 'hotmail.at', 'hotmail.co.il', 'hotmail.com.mx', 'hotmail.com.ar',
  'outlook.it', 'outlook.be', 'outlook.dk', 'outlook.at', 'outlook.cz',
  'outlook.co.id', 'outlook.co.th', 'outlook.jp', 'outlook.kr', 'outlook.sa',
  'live.be', 'live.dk', 'live.se', 'live.no', 'live.at', 'live.cn', 'live.hk',
  'hotmail.co.za', 'outlook.co.nz', 'live.com.sg', 'live.com.my', 'live.com.ph',
  'yahoo.co.jp', 'yahoo.co.nz', 'yahoo.com.hk', 'yahoo.com.tw', 'yahoo.co.id',
  'yahoo.com.my', 'yahoo.com.vn', 'yahoo.co.za', 'yahoo.ie', 'yahoo.in',
  'hotmail.com.au', 'hotmail.com.br', 'hotmail.co.jp', 'hotmail.co.nz',
  'outlook.com.au', 'outlook.com.br', 'live.com.mx', 'live.com.ar',
  'live.nl', 'live.it', 'live.in', 'live.jp', 'aol.co.uk', 'aol.de',
  'gmx.co.uk', 'gmx.fr', 'gmx.at', 'gmx.ch', 'yandex.by', 'yandex.kz',
  'ya.ru', 'bk.ru', 'list.ru', 'inbox.ru', 'rambler.ru', 'protonmail.ch',
  'tutanota.de', 'tutamail.com', 'keemail.me', 'yeah.net', 'sina.cn',
  'mailfence.com', 'disroot.org', 'mailbox.org', 'posteo.de',
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

/** Run before intent routing, persistence, or notifications on website forms. */
export function workEmailError(email: string) {
  const verdict = classifyEmail(email.trim())
  return verdict === 'ok' ? null : {
    ok: false as const,
    reason: verdict === 'personal' ? 'work_email_required' : 'email_invalid',
    message: WORK_EMAIL_MESSAGE,
  }
}
