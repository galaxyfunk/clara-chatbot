import { NextResponse, after } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';
import { runSalesCoach, validateSalesCoachEnv } from '@/lib/agents/sales-coach/run';
import { postSalesCoachError } from '@/lib/agents/sales-coach/post-error';
import { postParentMessage } from '@/lib/integrations/slack-bot';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ meetingId: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { meetingId } = await context.params;
    if (!meetingId) {
      return NextResponse.json({ success: false, error: 'meetingId is required' }, { status: 400 });
    }

    const authClient = await createAuthClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .single();
    if (wsError || !workspace) {
      return NextResponse.json({ success: false, error: 'Workspace not found' }, { status: 404 });
    }

    try {
      validateSalesCoachEnv();
    } catch (envError) {
      const message = envError instanceof Error ? envError.message : 'Env validation failed';
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }

    const workspaceId = workspace.id;
    after(async () => {
      try {
        await runSalesCoach({ workspaceId, reanalyzeMeetingId: meetingId });
      } catch (error) {
        await postSalesCoachError({
          context: 'reanalyze-orchestrator-top-level',
          meetingId,
          error,
        });
        try {
          await postParentMessage({
            token: process.env.SLACK_BOT_TOKEN!,
            channel: process.env.SLACK_SALES_COACH_CHANNEL!,
            text: `❌ Sales Coach re-analyze failed for meeting ${meetingId} — see #clara-errors for details.`,
          });
        } catch (postErr) {
          console.error('[SalesCoach] Failed to post reanalyze failure notice', postErr);
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: `Sales Coach re-analysis started for meeting ${meetingId}. Output will appear in Slack within 1-2 minutes.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
