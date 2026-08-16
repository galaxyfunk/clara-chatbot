import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getCorsHeaders } from '@/lib/cors';
import { parseFile } from '@/lib/files/parse';
import {
  capJobDescription,
  generateIntakeOpening,
  generateIntakeOpeningFromVisual,
} from '@/lib/chat/intake-brief';
import {
  buildVisualBlock,
  extensionOf,
  imageMediaType,
  isAcceptedExtension,
} from '@/lib/files/intake-document';
import type { ChatMessage } from '@/types/chat';

/**
 * POST /api/intake  (multipart/form-data)
 *
 * Public, unauthenticated. A visitor on the Cloud Employee hiring pages uploads a
 * job description; we extract its text, have Clara read it, and open a chat
 * session that already contains both. The site then opens the widget on that
 * session token, so the visitor lands mid-conversation instead of in an empty box.
 *
 * Why this is not /api/upload: that route is auth-gated to a dashboard user and
 * accepts images. This one is anonymous and accepts documents. Sharing it would
 * have meant weakening its auth, which is the wrong trade.
 *
 * SECURITY POSTURE. This is the first unauthenticated route in this repo that
 * accepts a file AND spends model budget, so:
 *   - it is rate-limited by IP,
 *   - it re-validates size and extension server-side rather than trusting the
 *     browser, because the caller is a form anyone can replay,
 *   - and it NEVER logs document text. A job description is customer data and
 *     this repo is public. Errors name the file, not its contents.
 */

/** Must not exceed parseFile's own 4MB ceiling, and the CE form must match it. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;

/** Uploads per IP per window. Deliberately tight: a real visitor uploads once. */
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * In-memory, matching the existing checkRateLimit in engine.ts. It resets on
 * deploy and is per-instance, so it is a courtesy limit rather than a hard
 * guarantee - enough to stop a loop, not a determined attacker.
 */
const uploadCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = uploadCounts.get(ip);

  if (!entry || now > entry.resetAt) {
    uploadCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
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
      return fail('Too many uploads. Please try again shortly.', 429);
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const workspaceId = formData.get('workspace_id');
    // Free-text label for where this came from, e.g. "/services/hire-uk-engineers".
    const sourcePage = formData.get('source_page');

    if (typeof workspaceId !== 'string' || !workspaceId) {
      return fail('workspace_id is required', 400);
    }
    if (!(file instanceof File)) {
      return fail('file is required', 400);
    }

    // Validate before spending anything. Extension first: it is the cheapest
    // check and the one the browser's `accept` attribute cannot be trusted for,
    // because a drag-and-drop bypasses it entirely.
    const ext = extensionOf(file.name);
    if (!isAcceptedExtension(ext)) {
      return fail(
        'Please upload a PDF, Word, Pages, or text document - or a screenshot of the role.',
        400
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return fail('That file is too large. The limit is 4MB.', 400);
    }
    if (file.size === 0) {
      return fail('That file appears to be empty.', 400);
    }

    const supabase = createServerClient();
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', workspaceId)
      .single();

    if (workspaceError || !workspace) {
      return fail('Workspace not found', 404);
    }

    // ── Read it ──
    //
    // Two routes. Text is extracted locally where the bytes contain text at all;
    // anything that is a PICTURE of a document - a screenshot, a scan, a Pages
    // preview - goes to Claude, which reads PDFs and images natively.
    const buffer = Buffer.from(await file.arrayBuffer());
    const directImageType = imageMediaType(ext);

    let jobDescription: string;
    let openingText: string;
    // True when we could only read part of the document - currently the .pages
    // case, where Apple's embedded preview covers the first page alone.
    let partialRead = false;

    if (directImageType) {
      const visual = await generateIntakeOpeningFromVisual(
        buildVisualBlock(directImageType, buffer)
      );
      if (!visual.success || !visual.opening) {
        console.error('[Intake] Visual read failed for', file.name, visual.error);
        return fail('We could not read that image. Please try again.', 502);
      }
      jobDescription = visual.jobDescription ?? '';
      openingText = visual.opening;
    } else {
      const parsed = await parseFile(buffer, file.name);

      if (parsed.success && parsed.text) {
        jobDescription = capJobDescription(parsed.text);
        const opening = await generateIntakeOpening(jobDescription);
        if (!opening.success || !opening.opening) {
          console.error('[Intake] Opening generation failed for', file.name, opening.error);
          return fail('We could not read that document. Please try again.', 502);
        }
        openingText = opening.opening;
      } else if (parsed.visualFallback) {
        // No selectable text, but the bytes are readable by eye: a scanned PDF,
        // or the preview lifted out of a .pages bundle.
        const visual = await generateIntakeOpeningFromVisual(
          buildVisualBlock(parsed.visualFallback.mediaType, parsed.visualFallback.buffer)
        );
        if (!visual.success || !visual.opening) {
          console.error('[Intake] Visual fallback failed for', file.name, visual.error);
          return fail(parsed.error ?? 'We could not read that document.', 422);
        }
        jobDescription = visual.jobDescription ?? '';
        openingText = visual.opening;
        partialRead = Boolean(parsed.visualFallback.partial) && Boolean(jobDescription);
      } else {
        // parseFile's errors are already visitor-safe ("export it as a PDF", "the
        // document appears to be empty") and describe the file, never its content.
        return fail(parsed.error ?? 'We could not read that document.', 422);
      }
    }

    // ── Seed the session ──
    //
    // The JD goes in as a `user` turn rather than into metadata, because
    // buildChatPrompt replays chat_sessions.messages and nothing else. Anything
    // parked in metadata would be invisible to every subsequent turn, which is
    // the whole point of doing this.
    //
    // It is framed as an upload so Clara does not read it as something the
    // visitor typed at her.
    const now = new Date().toISOString();
    const sessionToken = crypto.randomUUID();

    // An upload we could open but not read as a job description (a screenshot of
    // something else, an illegible scan) still opens a conversation - Clara's
    // opening says so and asks them to describe the role. Saying "its full text
    // follows" with nothing after it would be a lie told to the model.
    const seedContent = jobDescription
      ? `[The visitor uploaded a job description: "${file.name}".${
          partialRead
            ? ' Only the FIRST PAGE could be read - what follows may be incomplete, so do not assume anything absent from it is genuinely absent from the role.'
            : ' Its full text follows.'
        } Treat it as their hiring requirement throughout this conversation.]\n\n${jobDescription}`
      : `[The visitor uploaded a file ("${file.name}") but no job description could be read from it. Ask them to describe the role instead; do not claim to have read anything.]`;

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
        content: openingText,
        timestamp: now,
      },
    ];

    const { error: sessionError } = await supabase.from('chat_sessions').upsert(
      {
        workspace_id: workspaceId,
        session_token: sessionToken,
        messages,
        metadata: {
          intake: {
            filename: file.name,
            source_page: typeof sourcePage === 'string' ? sourcePage : null,
            uploaded_at: now,
          },
        },
      },
      { onConflict: 'workspace_id,session_token' }
    );

    if (sessionError) {
      console.error('[Intake] Session upsert failed', sessionError);
      return fail('We could not start that conversation. Please try again.', 500);
    }

    // `filename` is returned so the widget can show an attachment chip. The JD
    // text itself is deliberately NOT returned: it is server-side context for
    // Clara, not something to paint into the thread as a wall of text.
    return NextResponse.json(
      {
        success: true,
        session_token: sessionToken,
        greeting: openingText,
        filename: file.name,
      },
      { headers: cors }
    );
  } catch (error) {
    // No document text reaches this log: the only values interpolated anywhere
    // in this handler are filenames and Supabase errors.
    console.error('[Intake] Unhandled error', error);
    return fail('Something went wrong handling that upload.', 500);
  }
}

export const maxDuration = 30;
