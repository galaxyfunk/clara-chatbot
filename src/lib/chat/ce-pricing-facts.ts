import pricing from './ce-pricing-facts.json';

/**
 * Clara's only source for prices: the Evidence Bank fee entries, copied verbatim
 * by scripts/sync-ce-pricing-facts.ts. Quoted exactly as written, never converted.
 */
export const pricingFacts = pricing;

export function pricingGuard(): string {
  const lines = pricing.fees.map(f => `- ${f.region}: "${f.statement}"`).join('\n');
  return `Pricing (Jake, 14 November 2026; overrides ALL other prices in retrieved knowledge, personality settings and earlier replies):
The only prices you may give are these Evidence Bank statements (${pricing.source.repository}/${pricing.source.path}), copied exactly:
${lines}
Quote the statement for the region you recommend (or the region the visitor asks about) verbatim: copy its words, figures, punctuation and currency symbol exactly as written above (for example write "LATAM senior band is $6,500-$15,000/month", not a reworded range). Do not convert to any other currency, do not add exchange rates or "approximately" conversions, and do not switch currency because of the visitor's location; if they want another currency, say the team quotes in their currency on a call and they are welcome to convert the figures themselves. These are per-developer monthly bands: NEVER multiply them by the number of developers and never give a team total, even when the visitor asks about several developers. Do not invent sub-ranges, hourly rates or any other price. Say these are published bands and the team confirms the exact quote for the role on a call. If none of these statements covers what is asked, say the team will confirm pricing on a call.`;
}
