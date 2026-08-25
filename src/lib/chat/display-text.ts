/**
 * Clean assistant text before it is shown or stored.
 * The Book a Call button is rendered from booking_url, so leftover
 * "[Book a call]" tokens and hallucinated URLs must not stay in the bubble.
 */
const BOOKING_CTA_TOKEN =
  /\[(?:book\s+a\s+call|book\s+a\s+meeting|schedule\s+a\s+call|talk\s+to\s+(?:a\s+)?human)\](?:\([^)]*\))?/gi;

export function stripAssistantDisplayText(text: string): string {
  return text
    .replace(BOOKING_CTA_TOKEN, '')
    .replace(/https?:\/\/[^\s]+/gi, '')
    .replace(/(?:\s*(?:here|below)):\s*$/i, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
