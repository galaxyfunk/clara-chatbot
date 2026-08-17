import { postParentMessage, postThreadReply } from '@/lib/integrations/slack-bot';
import { createServerClient } from '@/lib/supabase/server';
import type { ConversationSummary } from '@/types/chat';

const LOG_PREFIX = '[Chat Slack]';
const FIRST_MESSAGE_MAX_LEN = 200;
const MAX_ACTION_ITEMS = 6;

function isEnabled(workspaceId: string): { token: string; channel: string } | null {
  const gateWorkspaceId = process.env.CHAT_ACTIVITY_WORKSPACE_ID;
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHAT_ACTIVITY_CHANNEL;
  if (!gateWorkspaceId || !token || !channel) return null;
  if (workspaceId !== gateWorkspaceId) return null;
  return { token, channel };
}

async function postChatActivityError(params: {
  context: string;
  sessionId?: string;
  error: unknown;
}): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_ERRORS_CHANNEL;
  if (!token || !channel) {
    console.error(`${LOG_PREFIX} Cannot post error — Slack env vars missing`, params);
    return;
  }
  const message =
    `❌ Chat activity notification error\n` +
    `Context: ${params.context}\n` +
    (params.sessionId ? `Session: ${params.sessionId}\n` : '') +
    `Error: ${params.error instanceof Error ? params.error.message : String(params.error)}`;
  try {
    await postParentMessage({ token, channel, text: message });
  } catch (postErr) {
    console.error(`${LOG_PREFIX} Failed to post error to Slack`, postErr);
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

function sessionDeepLink(sessionId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  return `${base}/dashboard/sessions?session=${sessionId}`;
}

export async function notifyChatStarted(params: {
  workspaceId: string;
  sessionId: string;
  firstUserMessage: string;
  workspaceDisplayName: string;
}): Promise<void> {
  const config = isEnabled(params.workspaceId);
  if (!config) return;

  const preview = truncate(params.firstUserMessage.trim(), FIRST_MESSAGE_MAX_LEN);
  const link = sessionDeepLink(params.sessionId);
  const text =
    `*New chat on ${params.workspaceDisplayName}*\n` +
    `${quote(preview)}\n` +
    `<${link}|View session →>`;

  try {
    const ts = await postParentMessage({
      token: config.token,
      channel: config.channel,
      text,
    });

    const supabase = createServerClient();
    const { error } = await supabase
      .from('chat_sessions')
      .update({ slack_thread_ts: ts })
      .eq('id', params.sessionId);

    if (error) {
      console.error(`${LOG_PREFIX} Failed to persist slack_thread_ts`, error);
      await postChatActivityError({
        context: 'persist-thread-ts',
        sessionId: params.sessionId,
        error,
      });
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} notifyChatStarted failed`, err);
    await postChatActivityError({
      context: 'parent-message',
      sessionId: params.sessionId,
      error: err,
    });
  }
}

export async function notifyChatSummary(params: {
  workspaceId: string;
  sessionId: string;
  summary: ConversationSummary;
}): Promise<void> {
  const config = isEnabled(params.workspaceId);
  if (!config) return;

  try {
    const supabase = createServerClient();
    const { data: session, error: readErr } = await supabase
      .from('chat_sessions')
      .select('slack_thread_ts, visitor_email')
      .eq('id', params.sessionId)
      .single();

    if (readErr || !session) {
      console.error(`${LOG_PREFIX} Could not read session for summary notify`, readErr);
      return;
    }

    const threadTs = session.slack_thread_ts as string | null;
    if (!threadTs) {
      // Start notification never went out — skip silently.
      return;
    }

    const email = params.summary.contact_info?.email ?? session.visitor_email ?? '—';
    const intent = params.summary.visitor_intent?.trim() || '—';
    const summaryText = params.summary.summary?.trim() || '—';
    const actionItems = (params.summary.action_items ?? [])
      .filter((item) => typeof item === 'string' && item.trim().length > 0)
      .slice(0, MAX_ACTION_ITEMS);

    const nextStepsBlock = actionItems.length > 0
      ? actionItems.map((item) => `• ${item}`).join('\n')
      : '_No next steps captured._';

    const link = sessionDeepLink(params.sessionId);
    const text =
      `*Summary ready*\n` +
      `*Intent:* ${intent}\n` +
      `*Visitor email:* ${email}\n` +
      `*Summary:* ${summaryText}\n` +
      `*Next steps:*\n${nextStepsBlock}\n` +
      `<${link}|View session →>`;

    await postThreadReply({
      token: config.token,
      channel: config.channel,
      threadTs,
      text,
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} notifyChatSummary failed`, err);
    await postChatActivityError({
      context: 'thread-reply',
      sessionId: params.sessionId,
      error: err,
    });
  }
}
