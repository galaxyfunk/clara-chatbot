/** Same-site dashboard paths only, so ?next= cannot become an open redirect. */
export function safeNextPath(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value || typeof value !== 'string') return fallback;
  if (!value.startsWith('/dashboard') || value.startsWith('//') || value.includes('\\')) return fallback;
  try {
    const url = new URL(value, 'https://clara.invalid');
    if (url.origin !== 'https://clara.invalid') return fallback;
    return url.pathname + url.search;
  } catch { return fallback; }
}
