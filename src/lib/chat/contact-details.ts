/** Extract only visitor-supplied identity, never an assistant's suggested example. */
export function contactDetails(messages: Array<{role: string; content: string}>) {
  let name: string | null = null;
  let company: string | null = null;
  let email: string | null = null;
  for (const {content} of messages.filter(m => m.role === 'user')) {
    const foundEmail = content.match(/[\w.%+\-]+@[\w.\-]+\.[a-z]{2,}/i)?.[0];
    if (foundEmail) email = foundEmail.toLowerCase();
    const explicitName = content.match(/(?:[Mm]y name is|[Nn]ame\s*:|I am|I'm)\s+([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+){0,3})(?=[,.;/\n]|\s+(?:at|from|and|with|of)|$)/)?.[1];
    const prefixName = foundEmail ? content.split(foundEmail)[0].replace(/[,/\s]+$/, '').trim() : '';
    const shortName = /^[A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+){1,3}$/.test(prefixName) ? prefixName : null;
    if (explicitName || shortName) name = explicitName || shortName;
    const namedCompany = content.match(/\bcompany(?: name)?\s*(?:is|:)\s*([^,;\n]+?)(?=[.;](?:\s|$)|[,;\n]|$)/i)?.[1];
    const introducedCompany = name && content.includes(name) ? content.match(/\b(?:at|from|of)\s+([^,;\n]+?)(?=[.;](?:\s|$)|[,;\n]|$)/)?.[1] : null;
    const suffixCompany = content.match(/\b([A-Z][\w&'’-]*(?:\s+[A-Z][\w&'’-]*){0,4}\s+(?:Ltd|Limited|Inc|LLC|PLC))\b/)?.[1];
    if (suffixCompany || namedCompany || introducedCompany) company = (suffixCompany || namedCompany || introducedCompany)!.trim().slice(0,120);
    if (!name && !foundEmail && !suffixCompany && !namedCompany && !introducedCompany && /^[A-Z][a-z'’-]+\s+[A-Z][a-z'’-]+$/.test(content.trim())) name = content.trim();
  }
  return {name, company, email};
}

export function chatSurface(surface: unknown, sourcePage?: string): 'popup' | 'ask' {
  return surface === 'popup' ? 'popup' : surface === 'ask' || /(?:^|\/)ask(?:[/?#]|$)/.test(sourcePage || '') ? 'ask' : 'popup';
}

/** Contact capture, not generated prose, is the primary popup booking trigger. */
export function shouldShowBooking(surface: 'popup' | 'ask', email: string | null, offered: boolean) {
  return offered || (surface === 'popup' && Boolean(email));
}
