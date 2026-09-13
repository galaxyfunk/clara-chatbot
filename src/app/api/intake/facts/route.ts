import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getCorsHeaders } from '@/lib/cors';
import {
  buildFactsSeedContent,
  formatIntakeFacts,
  generateIntakeOpeningFromFacts,
  parseIntakeFactsBody,
} from '@/lib/chat/intake-brief';
import type { ChatMessage } from '@/types/chat';

/**
 * POST /api/intake/facts  (application/json)
 *
 * Public, unauthenticated. A booking-confirmation page already knows who the
 * visitor is and what they submitted. /api/chat cannot take that packet
 * (ChatRequest is workspace_id, session_token, message, message_id, optional
 * source_page), and metadata is invisible to later turns. This clones the JD
 * intake path: write a framed user turn into chat_sessions.messages, then
 * return session_token + greeting so the widget can open mid-conversation.
 *
 * SECURITY POSTURE. Matches /api/intake:
 *   - rate-limited by IP,
 *   - workspace must exist,
 *   - and it NEVER logs the packet. A booking brief is customer data and this
 *     repo is public.
 */

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * In-memory, matching /api/intake. It resets on deploy and is per-instance, so
 * it is a courtesy limit rather than a hard guarantee.
 */
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(ip);

  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;

  entry.count += 1;
  return true;
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'unknown';
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin, 'POST, OPTIONS'),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const cors = getCorsHeaders(origin, 'POST, OPTIONS');

  const fail = (error: string, status: number) =>
    NextResponse.json({ success: false, error }, { status, headers: cors });

  try {
    if (!checkRateLimit(clientIp(request))) {
      return fail('Too many requests. Please try again shortly.', 429);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail('JSON body is required', 400);
    }

    const parsed = parseIntakeFactsBody(body);
    if (!parsed.ok) return fail(parsed.error, 400);

    const { workspaceId, sourcePage, visitor } = parsed.data;

    const supabase = createServerClient();
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', workspaceId)
      .single();

    if (workspaceError || !workspace) {
      return fail('Workspace not found', 404);
    }

    const factsText = formatIntakeFacts(parsed.data);
    const opening = await generateIntakeOpeningFromFacts(factsText, parsed.data);
    if (!opening.success || !opening.opening) {
      console.error('[Intake facts] Opening generation failed', opening.error);
      return fail('We could not start that conversation. Please try again.', 502);
    }

    const now = new Date().toISOString();
    const sessionToken = crypto.randomUUID();
    const seedContent = buildFactsSeedContent(factsText);

    const messages: ChatMessage[] = [
      {
        message_id: crypto.randomUUID(),
        role: 'user',
        content: seedContent,
        timestamp: now,
      },
      {
        message_id: crypto.randomUUID(),
        role: 'assistant',
        content: opening.opening,
        timestamp: now,
      },
    ];

    const { error: sessionError } = await supabase.from('chat_sessions').upsert(
      {
        workspace_id: workspaceId,
        session_token: sessionToken,
        messages,
        visitor_email: visitor.email,
        visitor_name: visitor.name ?? null,
        metadata: {
          intake: {
            kind: 'facts',
            source_page: sourcePage ?? null,
            received_at: now,
          },
        },
      },
      { onConflict: 'workspace_id,session_token' }
    );

    if (sessionError) {
      console.error('[Intake facts] Session upsert failed', sessionError);
      return fail('We could not start that conversation. Please try again.', 500);
    }

    return NextResponse.json(
      {
        success: true,
        session_token: sessionToken,
        greeting: opening.opening,
      },
      { headers: cors }
    );
  } catch (error) {
    // No packet reaches this log.
    console.error('[Intake facts] Unhandled error', error);
    return fail('Something went wrong handling that request.', 500);
  }
}

export const maxDuration = 30;
