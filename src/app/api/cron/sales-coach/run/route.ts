import { NextResponse, after } from 'next/server';
import { runSalesCoach, validateSalesCoachEnv } from '@/lib/agents/sales-coach/run';
import { postSalesCoachError } from '@/lib/agents/sales-coach/post-error';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = process.env.SALES_COACH_WORKSPACE_ID;
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: 'SALES_COACH_WORKSPACE_ID not set' },
      { status: 500 }
    );
  }

  try {
    validateSalesCoachEnv();
  } catch (envError) {
    const message = envError instanceof Error ? envError.message : 'Env validation failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }

  after(async () => {
    try {
      await runSalesCoach({ workspaceId, triggeredBy: 'cron' });
    } catch (error) {
      await postSalesCoachError({ context: 'cron-orchestrator-top-level', error });
    }
  });

  return NextResponse.json({ success: true });
}
