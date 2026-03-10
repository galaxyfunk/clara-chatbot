import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

// ─── CORS ────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://chatbot.jakevibes.dev',
  'https://cloudemployee.com',
  'https://www.cloudemployee.com',
  'https://cloudemployee.io',
  'https://www.cloudemployee.io',
  'https://clara.cloudemployee.io',
  'http://localhost:3000',
];

function getCorsHeaders(requestOrigin: string | null) {
  const origin = ALLOWED_ORIGINS.includes(requestOrigin ?? '')
    ? requestOrigin!
    : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

/**
 * GET /api/workspace/public?workspace_id={id}
 * Public endpoint to fetch workspace settings for widget/embed.
 * Returns only public-facing settings (no sensitive data).
 */
export async function GET(request: Request) {
  const origin = request.headers.get('origin');
  const cors = getCorsHeaders(origin);

  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id');

    if (!workspaceId) {
      return NextResponse.json(
        { success: false, error: 'workspace_id is required' },
        { status: 400, headers: cors }
      );
    }

    const supabase = createServerClient();
    const { data: workspace, error } = await supabase
      .from('workspaces')
      .select('id, settings')
      .eq('id', workspaceId)
      .single();

    if (error || !workspace) {
      return NextResponse.json(
        { success: false, error: 'Workspace not found' },
        { status: 404, headers: cors }
      );
    }

    // Extract only public-facing settings
    const settings = workspace.settings || {};
    const publicSettings = {
      display_name: settings.display_name || 'Clara',
      welcome_message: settings.welcome_message || 'Hi! How can I help you today?',
      placeholder_text: settings.placeholder_text || 'Type your message...',
      suggested_messages: settings.suggested_messages || [],
      booking_url: settings.booking_url || null,
      primary_color: settings.primary_color || '#6366f1',
      bubble_color: settings.bubble_color || '#000000',
      bubble_position: settings.bubble_position || 'right',
      avatar_url: settings.avatar_url || null,
      chat_icon_url: settings.chat_icon_url || null,
      escalation_enabled: settings.escalation_enabled ?? true,
      powered_by_clara: settings.powered_by_clara ?? true,
      // Widget layouts
      widget_layout: settings.widget_layout ?? 'classic',
      trigger_text: settings.trigger_text ?? null,
      status_messages: settings.status_messages ?? null,
      hint_messages: settings.hint_messages ?? null,
    };

    return NextResponse.json({
      success: true,
      workspace_id: workspace.id,
      settings: publicSettings,
    }, { headers: cors });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500, headers: cors });
  }
}
