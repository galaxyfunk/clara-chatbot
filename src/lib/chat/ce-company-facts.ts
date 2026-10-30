import facts from './ce-company-facts.json';

export function companyHeadcountStatement(): string {
  return `${facts.totalHeadcount} total company headcount as of ${facts.asOf} (not a confirmed active-developer subtotal)`;
}

/** Remove stale scale claims from the CE system persona and retrieved knowledge.
 * Never apply to visitor messages or other workspaces. */
export function reconcileCompanyHeadcount(context: string): string {
  return context.replace(/\b\d{3,4}\+?(?:\s|\\n)+active(?:\s|\\n)+(?:developers|engineers)\b/gi, companyHeadcountStatement());
}
