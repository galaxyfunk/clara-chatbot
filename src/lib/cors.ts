/**
 * Shared CORS allow-list for public Clara API routes (/api/chat, /api/workspace/public).
 *
 * Unknown origins: still receive Access-Control-Allow-Origin set to the first
 * hardcoded origin (https://chatbot.jakevibes.dev) rather than being refused.
 * That legacy fallback is intentional for this change — tighten later if desired.
 *
 * Extra origins: set CLARA_EXTRA_ALLOWED_ORIGINS to a comma-separated list
 * (e.g. https://preview.example.com). Do NOT use a blanket *.vercel.app pattern.
 */

const BASE_ALLOWED_ORIGINS = [
  'https://chatbot.jakevibes.dev',
  'https://cloudemployee.com',
  'https://www.cloudemployee.com',
  'https://cloudemployee.io',
  'https://www.cloudemployee.io',
  'https://clara.cloudemployee.io',
  'https://staging.jakevibes.dev',
  'http://localhost:3000',
] as const;

function getAllowedOrigins(): string[] {
  const extra = (process.env.CLARA_EXTRA_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...BASE_ALLOWED_ORIGINS, ...extra];
}

export function getCorsHeaders(
  requestOrigin: string | null,
  methods: string
): Record<string, string> {
  const allowed = getAllowedOrigins();
  const origin = allowed.includes(requestOrigin ?? '')
    ? requestOrigin!
    : allowed[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
