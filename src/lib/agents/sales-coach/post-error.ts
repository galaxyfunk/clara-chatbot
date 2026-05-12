import { postParentMessage } from '@/lib/integrations/slack-bot';

export async function postSalesCoachError(params: {
  context: string;
  meetingId?: string;
  error: unknown;
}): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_ERRORS_CHANNEL;
  if (!token || !channel) {
    console.error('[SalesCoach] Cannot post error — Slack env vars missing', params);
    return;
  }
  const message =
    `❌ Sales Coach error\n` +
    `Context: ${params.context}\n` +
    (params.meetingId ? `Meeting: ${params.meetingId}\n` : '') +
    `Error: ${params.error instanceof Error ? params.error.message : String(params.error)}`;
  try {
    await postParentMessage({ token, channel, text: message });
  } catch (postErr) {
    console.error('[SalesCoach] Failed to post error to Slack', postErr);
  }
}
