import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase/server';
import { loadPromptContent } from '@/lib/agent-prompts/loader';
import {
  listRecentTranscripts,
  getTranscriptDetail,
  normalizeDurationPct,
} from '@/lib/integrations/fireflies';
import { postParentMessage, postThreadReply } from '@/lib/integrations/slack-bot';
import { shouldAnalyze } from './filter';
import {
  buildPromptVariables,
  interpolatePrompt,
  pickProspectDomain,
} from './build-prompt';
import { postSalesCoachError } from './post-error';
import type {
  FirefliesTranscriptDetail,
  FirefliesTranscriptSummary,
  FirefliesSpeakerAnalytics,
} from '@/types/fireflies';
import type { SalesCoachRunResult } from '@/types/sales-coach';

const PROMPT_SLUG = 'sales-coach';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const CLAUDE_MAX_TOKENS = 2000;
const SLACK_TEXT_TRUNCATE_LIMIT = 38500;

interface ValidatedEnv {
  firefliesApiKey: string;
  repEmail: string;
  repName: string;
  teamDomains: string[];
  slackToken: string;
  salesCoachChannel: string;
  errorsChannel: string;
  firstRunDays: number;
  firstRunMax: number;
  subsequentDays: number;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function validateSalesCoachEnv(): ValidatedEnv {
  const required = {
    FIREFLIES_API_KEY_SHAWNEE: process.env.FIREFLIES_API_KEY_SHAWNEE,
    SALES_COACH_REP_EMAIL: process.env.SALES_COACH_REP_EMAIL,
    SALES_COACH_REP_NAME: process.env.SALES_COACH_REP_NAME,
    SALES_COACH_TEAM_DOMAINS: process.env.SALES_COACH_TEAM_DOMAINS,
    SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
    SLACK_SALES_COACH_CHANNEL: process.env.SLACK_SALES_COACH_CHANNEL,
    SLACK_ERRORS_CHANNEL: process.env.SLACK_ERRORS_CHANNEL,
  };
  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`[SalesCoach] Missing required env vars: ${missing.join(', ')}`);
  }
  return {
    firefliesApiKey: required.FIREFLIES_API_KEY_SHAWNEE!,
    repEmail: required.SALES_COACH_REP_EMAIL!,
    repName: required.SALES_COACH_REP_NAME!,
    teamDomains: required.SALES_COACH_TEAM_DOMAINS!.split(',').map((d) => d.trim()).filter(Boolean),
    slackToken: required.SLACK_BOT_TOKEN!,
    salesCoachChannel: required.SLACK_SALES_COACH_CHANNEL!,
    errorsChannel: required.SLACK_ERRORS_CHANNEL!,
    firstRunDays: parsePositiveInt(process.env.SALES_COACH_FIRST_RUN_DAYS, 7),
    firstRunMax: parsePositiveInt(process.env.SALES_COACH_FIRST_RUN_MAX, 5),
    subsequentDays: parsePositiveInt(process.env.SALES_COACH_SUBSEQUENT_DAYS, 2),
  };
}

function formatDurationSeconds(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function formatSpeakerBreakdown(
  speakers: FirefliesSpeakerAnalytics[],
  repName: string
): string {
  if (speakers.length === 0) return 'Talk: (no speaker data)';
  if (speakers.length === 1) {
    return `Talk: ${speakers[0].name} 100%`;
  }
  const rep = speakers.find((s) => s.name.toLowerCase().includes(repName.toLowerCase()));
  if (rep) {
    const repPct = normalizeDurationPct(rep.duration_pct);
    const otherPct = Math.max(0, 100 - repPct);
    return `Talk: ${rep.name} ${repPct}% / Others ${otherPct}%`;
  }
  const top = [...speakers].sort((a, b) => b.duration_pct - a.duration_pct).slice(0, 2);
  return `Talk: ${top[0].name} ${normalizeDurationPct(top[0].duration_pct)}% / ${top[1].name} ${normalizeDurationPct(top[1].duration_pct)}%`;
}

function buildParentMessageText(
  detail: FirefliesTranscriptDetail,
  repName: string
): string {
  const callTitle = detail.title || '(untitled)';
  const durationLine = formatDurationSeconds(detail.duration * 60);
  const speakerBreakdown = formatSpeakerBreakdown(detail.analytics.speakers, repName);
  return (
    `🎯 Sales Coach\n` +
    `Call: ${callTitle}\n` +
    `Duration: ${durationLine} · ${speakerBreakdown}\n` +
    `Recording: ${detail.transcript_url}\n\n` +
    `🧵 Coaching breakdown in thread below`
  );
}

function truncateThreadText(text: string): string {
  if (text.length <= SLACK_TEXT_TRUNCATE_LIMIT) return text;
  return text.slice(0, SLACK_TEXT_TRUNCATE_LIMIT) +
    '\n\n[Output truncated — see sales_call_analyses.claude_output for full text]';
}

async function callClaude(promptText: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('[SalesCoach] ANTHROPIC_API_KEY not set');
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: CLAUDE_MAX_TOKENS,
    messages: [{ role: 'user', content: promptText }],
  });
  const textContent = response.content.find((c) => c.type === 'text');
  const text = textContent?.text ?? '';
  if (!text.trim()) throw new Error('[SalesCoach] Claude returned empty text');
  return text;
}

interface ProcessContext {
  workspaceId: string;
  env: ValidatedEnv;
}

async function processTranscript(
  ctx: ProcessContext,
  detail: FirefliesTranscriptDetail,
  result: SalesCoachRunResult
): Promise<void> {
  const supabase = createServerClient();
  const { env } = ctx;

  const filter = shouldAnalyze({
    attendees: detail.meeting_attendees.map((a) => ({ email: a.email, name: a.name })),
    teamDomains: env.teamDomains,
  });

  if (!filter.ok) {
    const { error: insertErr } = await supabase
      .from('sales_call_analyses')
      .insert({
        workspace_id: ctx.workspaceId,
        fireflies_meeting_id: detail.id,
        rep_email: env.repEmail,
        rep_name: env.repName,
        call_title: detail.title || null,
        call_date: detail.date ? new Date(detail.date).toISOString() : null,
        duration_seconds: Math.round(detail.duration * 60),
        prospect_domain: null,
        attendees: detail.meeting_attendees.map((a) => ({ email: a.email, name: a.name })),
        fireflies_url: detail.transcript_url || null,
        prompt_slug: PROMPT_SLUG,
        claude_output: null,
        slack_channel_id: null,
        slack_parent_ts: null,
        slack_thread_ts: null,
        status: 'skipped',
        error_message: filter.reason ?? null,
      });
    if (insertErr) {
      throw new Error(`[SalesCoach] Failed to insert skipped row: ${insertErr.message}`);
    }
    result.skipped_filter += 1;
    return;
  }

  const promptTemplate = await loadPromptContent(ctx.workspaceId, PROMPT_SLUG);
  const vars = buildPromptVariables(
    detail,
    { name: env.repName, email: env.repEmail },
    env.teamDomains
  );
  const interpolated = interpolatePrompt(promptTemplate, vars);
  const claudeOutput = await callClaude(interpolated);

  const parentText = buildParentMessageText(detail, env.repName);
  const parentTs = await postParentMessage({
    token: env.slackToken,
    channel: env.salesCoachChannel,
    text: parentText,
  });
  const threadTs = await postThreadReply({
    token: env.slackToken,
    channel: env.salesCoachChannel,
    threadTs: parentTs,
    text: truncateThreadText(claudeOutput),
  });

  const prospectDomain = pickProspectDomain(detail.meeting_attendees, env.teamDomains);

  const { error: insertErr } = await supabase
    .from('sales_call_analyses')
    .insert({
      workspace_id: ctx.workspaceId,
      fireflies_meeting_id: detail.id,
      rep_email: env.repEmail,
      rep_name: env.repName,
      call_title: detail.title || null,
      call_date: detail.date ? new Date(detail.date).toISOString() : null,
      duration_seconds: Math.round(detail.duration * 60),
      prospect_domain: prospectDomain,
      attendees: detail.meeting_attendees.map((a) => ({ email: a.email, name: a.name })),
      fireflies_url: detail.transcript_url || null,
      prompt_slug: PROMPT_SLUG,
      claude_output: claudeOutput,
      slack_channel_id: env.salesCoachChannel,
      slack_parent_ts: parentTs,
      slack_thread_ts: threadTs,
      status: 'analyzed',
      error_message: null,
    });
  if (insertErr) {
    throw new Error(`[SalesCoach] Failed to insert analyzed row: ${insertErr.message}`);
  }
  result.analyzed += 1;
}

async function getExistingAnalysisStatus(
  workspaceId: string,
  meetingId: string
): Promise<'analyzed' | 'failed' | 'skipped' | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('sales_call_analyses')
    .select('status')
    .eq('workspace_id', workspaceId)
    .eq('fireflies_meeting_id', meetingId)
    .maybeSingle();
  if (error) {
    throw new Error(`[SalesCoach] Idempotency lookup failed: ${error.message}`);
  }
  return (data?.status as 'analyzed' | 'failed' | 'skipped' | undefined) ?? null;
}

async function countAnalyses(workspaceId: string): Promise<number> {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from('sales_call_analyses')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);
  if (error) {
    throw new Error(`[SalesCoach] Count query failed: ${error.message}`);
  }
  return count ?? 0;
}

async function deleteAnalysis(workspaceId: string, meetingId: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from('sales_call_analyses')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('fireflies_meeting_id', meetingId);
  if (error) {
    throw new Error(`[SalesCoach] Delete prior analysis failed: ${error.message}`);
  }
}

async function postRunCompleteSummary(
  env: ValidatedEnv,
  result: SalesCoachRunResult
): Promise<void> {
  const text =
    `✅ Sales Coach run complete\n` +
    `Fetched: ${result.fetched} · ` +
    `Analyzed: ${result.analyzed} · ` +
    `Already done: ${result.skipped_already_analyzed} · ` +
    `Internal-only: ${result.skipped_filter} · ` +
    `Failed: ${result.failed}`;
  try {
    await postParentMessage({
      token: env.slackToken,
      channel: env.salesCoachChannel,
      text,
    });
  } catch (err) {
    console.error('[SalesCoach] Failed to post run-complete summary', err);
  }
}

async function maybePostRunCompleteSummary(
  env: ValidatedEnv,
  result: SalesCoachRunResult,
  triggeredBy: 'manual' | 'cron'
): Promise<void> {
  if (triggeredBy === 'cron') {
    const hasNewActivity =
      result.analyzed > 0 || result.failed > 0 || result.skipped_filter > 0;
    if (!hasNewActivity) return;
  }
  await postRunCompleteSummary(env, result);
}

export async function runSalesCoach(options: {
  workspaceId: string;
  reanalyzeMeetingId?: string;
  triggeredBy?: 'manual' | 'cron';
}): Promise<SalesCoachRunResult> {
  const env = validateSalesCoachEnv();
  const triggeredBy = options.triggeredBy ?? 'manual';
  const ctx: ProcessContext = { workspaceId: options.workspaceId, env };
  const result: SalesCoachRunResult = {
    fetched: 0,
    skipped_already_analyzed: 0,
    skipped_filter: 0,
    analyzed: 0,
    failed: 0,
  };

  if (options.reanalyzeMeetingId) {
    const meetingId = options.reanalyzeMeetingId;
    try {
      await deleteAnalysis(options.workspaceId, meetingId);
      const detail = await getTranscriptDetail(env.firefliesApiKey, meetingId);
      if (!detail) {
        throw new Error(`[SalesCoach] Transcript not found for meeting ${meetingId}`);
      }
      result.fetched = 1;
      await processTranscript(ctx, detail, result);
    } catch (err) {
      result.failed += 1;
      await postSalesCoachError({
        context: 'reanalyze',
        meetingId,
        error: err,
      });
    }
    await maybePostRunCompleteSummary(env, result, triggeredBy);
    return result;
  }

  const existingCount = await countAnalyses(options.workspaceId);
  const isFirstRun = existingCount === 0;
  const lookbackDays = isFirstRun ? env.firstRunDays : env.subsequentDays;
  const limit = isFirstRun ? env.firstRunMax : 20;
  const fromDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  let transcripts: FirefliesTranscriptSummary[] = [];
  try {
    transcripts = await listRecentTranscripts(env.firefliesApiKey, { fromDate, limit });
  } catch (err) {
    await postSalesCoachError({
      context: 'listRecentTranscripts',
      error: err,
    });
    await maybePostRunCompleteSummary(env, result, triggeredBy);
    return result;
  }

  result.fetched = transcripts.length;

  for (const summary of transcripts) {
    try {
      const existingStatus = await getExistingAnalysisStatus(options.workspaceId, summary.id);
      if (existingStatus === 'analyzed' || existingStatus === 'skipped') {
        result.skipped_already_analyzed += 1;
        continue;
      }
      const detail = await getTranscriptDetail(env.firefliesApiKey, summary.id);
      if (!detail) {
        throw new Error(`[SalesCoach] getTranscriptDetail returned null for ${summary.id}`);
      }
      await processTranscript(ctx, detail, result);
    } catch (err) {
      result.failed += 1;
      await postSalesCoachError({
        context: 'per-transcript',
        meetingId: summary.id,
        error: err,
      });
    }
  }

  await maybePostRunCompleteSummary(env, result, triggeredBy);
  return result;
}
