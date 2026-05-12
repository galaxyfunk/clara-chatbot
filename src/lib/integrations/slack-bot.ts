const SLACK_API_URL = 'https://slack.com/api/chat.postMessage';

interface SlackPostResponse {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
}

interface PostParentOptions {
  token: string;
  channel: string;
  text: string;
  blocks?: unknown[];
}

interface PostThreadOptions {
  token: string;
  channel: string;
  threadTs: string;
  text: string;
}

async function postToSlack(body: Record<string, unknown>, token: string): Promise<SlackPostResponse> {
  const res = await fetch(SLACK_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as SlackPostResponse;
  if (!json.ok) {
    throw new Error(`[Slack] postMessage failed: ${json.error ?? 'unknown'}`);
  }
  return json;
}

export async function postParentMessage(options: PostParentOptions): Promise<string> {
  const result = await postToSlack(
    {
      channel: options.channel,
      text: options.text,
      blocks: options.blocks,
      unfurl_links: false,
      unfurl_media: false,
    },
    options.token
  );
  if (!result.ts) throw new Error('[Slack] No ts returned on parent message');
  return result.ts;
}

export async function postThreadReply(options: PostThreadOptions): Promise<string> {
  const result = await postToSlack(
    {
      channel: options.channel,
      text: options.text,
      thread_ts: options.threadTs,
      unfurl_links: false,
      unfurl_media: false,
    },
    options.token
  );
  if (!result.ts) throw new Error('[Slack] No ts returned on thread reply');
  return result.ts;
}
