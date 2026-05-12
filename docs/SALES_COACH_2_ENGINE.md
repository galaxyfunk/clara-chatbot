# Sales Coach — Session 2 — Engine

**Track:** `sales-coach`
**Session:** 2 of 2 (engine v1 ships at end of this session)
**Brief version:** v3
**Goal:** Ship the working Sales Coach engine. Jake clicks "Run Sales Coach Now" on the prompt edit page → Clara fetches Shawnee's recent Fireflies calls → filters for sales calls with external attendees → loads the `sales-coach` prompt → runs each through Claude → posts coaching analysis to `#sales-coach-test` in Slack. Errors post to `#clara-errors`. Re-analysis supported.
**Outcome:** Jake clicks a button, gets coaching analyses in Slack within 30-60 seconds.

---

## Step 0 — Pre-flight (REQUIRED FIRST)

Do not write any code in this step. Verify the prerequisites below and report back. After confirmation, proceed to Step 1.

### 0.1 — Confirm Session 1 is deployed

Verify the `agent_prompts` table exists and has the `sales-coach` row:

```sql
SELECT slug, name, agent_type, length(content), is_active
FROM agent_prompts
WHERE slug = 'sales-coach';
```

Expected: 1 row, slug `sales-coach`, name `Sales Coach`, agent_type `sales_coach`, content length > 1000, is_active true.

### 0.2 — Confirm `sales_call_analyses` does not exist

```sql
SELECT to_regclass('public.sales_call_analyses');
```
Expected: `NULL`.

### 0.3 — Slack bot reachability

Jake has confirmed the bot can post to both channels (`#sales-coach-test` C0B3STF4C2U and `#clara-errors` C0B2H5QKG2K) using a curl test. **Do not re-test from Claude Code** — bot tokens are sensitive and we don't want them committed accidentally.

Required env vars (added in Step 0.5):
- `SLACK_BOT_TOKEN` — bot OAuth token starting with `xoxb-`
- `SLACK_SALES_COACH_CHANNEL` — channel ID for coaching output
- `SLACK_ERRORS_CHANNEL` — channel ID for errors

### 0.4 — Fireflies API access

We need Shawnee's personal Fireflies API key. The key authenticates as Shawnee, so all queries return only the calls she attended. This means:
- We do **not** filter on rep email (every transcript is hers by definition)
- We **do** filter on external-attendee presence (skip internal-only calls)

Required env var (added in Step 0.5):
- `FIREFLIES_API_KEY_SHAWNEE` — Jake has this in hand

### 0.5 — Add env vars to `.env.local` and Vercel

Required env vars for Session 2:

```bash
# Slack bot
SLACK_BOT_TOKEN=xoxb-<from-Jake>
SLACK_SALES_COACH_CHANNEL=C0B3STF4C2U
SLACK_ERRORS_CHANNEL=C0B2H5QKG2K

# Fireflies (Shawnee, personal key)
FIREFLIES_API_KEY_SHAWNEE=<from-Jake>

# Sales Coach config
SALES_COACH_WORKSPACE_ID=09aa62df-5af6-4cec-b565-c335e907327d
SALES_COACH_REP_EMAIL=shawnee.malesich@cloudemployee.io
SALES_COACH_REP_NAME=Shawnee
SALES_COACH_TEAM_DOMAINS=cloudemployee.io
SALES_COACH_FIRST_RUN_DAYS=7
SALES_COACH_FIRST_RUN_MAX=5
SALES_COACH_SUBSEQUENT_DAYS=2
```

Jake adds these to:
1. `.env.local` (for local dev)
2. Vercel production env vars (for the live deploy)

**Do not commit `.env.local` to git** (it's already in `.gitignore` — verify before continuing).

Also confirm `ANTHROPIC_API_KEY` already exists (used elsewhere in Clara for extraction/summary).

### 0.6 — Identify existing app-level Anthropic call pattern

Find where Clara already calls the Anthropic API with the app-level key (not user-encrypted keys). Likely files:
- `src/lib/chat/extract-qa.ts` (transcript extraction)
- `src/lib/chat/summarize.ts` (session summaries, if it exists from v1.1)
- `src/lib/llm/provider.ts`

Report:
- The function name and signature used for app-level Claude calls
- The model string used (likely `claude-sonnet-4-20250514` or similar)
- Whether there's a shared helper or each module instantiates its own SDK client

We will reuse this pattern, not introduce a new one.

### 0.7 — Verify `createServerClient` is service-role

The orchestrator runs inside `after()` after the HTTP response returns. Auth context (session cookies) is gone by then. The Supabase client used in background work MUST be service-role to bypass RLS.

Open `src/lib/supabase/server.ts`. Confirm `createServerClient` instantiates the client with `SUPABASE_SERVICE_ROLE_KEY` (not `SUPABASE_ANON_KEY` or session cookies).

Report the relevant lines. If it is NOT service-role, stop and surface to Jake — Session 1's loader.ts also relies on this assumption and would need a separate fix.

### 0.8 — Fireflies GraphQL schema introspection

The GraphQL queries in `lib/integrations/fireflies.ts` (Step 3) reference field names from an older Fireflies spec. Schemas drift. Verify the real shape before writing the lib.

Run this curl against Shawnee's real account (Jake provides the key via env):

```bash
curl -X POST https://api.fireflies.ai/graphql \
  -H "Authorization: Bearer $FIREFLIES_API_KEY_SHAWNEE" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ user { name email user_id } transcripts(limit: 1) { id title date duration transcript_url meeting_attendees { email name } analytics { speakers { name duration duration_pct longest_monologue questions } } sentences { speaker_name text start_time end_time } } }"}'
```

Report:
- The `user` block — confirms auth works and shows Shawnee's name
- The first transcript — confirms which fields exist on `transcripts(...)` vs what needs to be fetched via `transcript(id: ...)`
- Any fields that returned `null` or were absent from the response — those need to be removed or renamed in the queries in Step 3

**If any field in the curl above errors with "Cannot query field X on type Y"** — adjust the queries in Step 3 to match the actual schema. Use Fireflies' official docs (https://docs.fireflies.ai/graphql-api/query) as the authoritative reference.

**If `transcripts` does NOT accept a `fromDate` parameter** — fall back to fetching the most recent N (sorted by date desc) and filter in code by `date >= cutoffMs`. Adjust `listRecentTranscripts` signature accordingly.

---

## Architecture decisions (locked)

- **Single rep for v1.** Hardcoded to Shawnee via env vars. Multi-rep refactor is sales-coach-3 territory.
- **Polling, not webhook.** Jake clicks "Run Now"; manual trigger only in v1. Cron is added as a stubbed-but-disabled `vercel.json` entry for sales-coach-3.
- **Idempotency on success and skip only.** `sales_call_analyses` has a unique `(workspace_id, fireflies_meeting_id)` constraint. We insert rows ONLY for `status = 'analyzed'` (success) and `status = 'skipped'` (filter rejection — internal-only call, won't ever pass filter). **Failures do NOT insert a row.** A failed call retries naturally on the next run. Failures are logged to `#clara-errors` so they're visible.
- **Run mode auto-detected.** If `sales_call_analyses` has zero rows for the workspace → "extended" lookback (7 days, 5 max). Otherwise → "standard" lookback (2 days, 20 max). No body parameter on the API route.
- **Background work via `after()`.** API route returns 200 immediately. The Fireflies + Claude + Slack work runs in `after()`. Never `void asyncFn()`.
- **Node runtime, not Edge.** Anthropic SDK requires Node. Both API routes export `runtime = 'nodejs'`.
- **Service-role DB access in background work.** The orchestrator uses `createServerClient` (service-role) since auth context is gone after the response returns. Verified in Step 0.7.
- **Per-call Slack format.** Each analyzed call → parent message (Fireflies metadata + recording link) + thread reply (full Claude output verbatim). No fragile parsing.
- **Run-complete summary message** posts to `#sales-coach-test` at the end of every run, regardless of outcome. Confirms the system is alive even when there's no new work to do.
- **Errors to Slack.** Any failure during processing posts to `#clara-errors` with context (orchestrator step, meeting ID if known, error text).
- **Storage of Claude output.** Full output in `sales_call_analyses.claude_output` for debugging and re-analyze.
- **Filter is generic and TDD-friendly.** Lives in `lib/agents/sales-coach/filter.ts`. Pure function, no I/O.
- **Rep identification is fuzzy with fallback.** Try case-insensitive substring match between `SALES_COACH_REP_NAME` and `speakers[].name`. If no match, show all speakers with their actual Fireflies names in the parent message — don't guess.
- **`maxDuration = 300`** on the run route. Processing up to 20 calls × (Fireflies + Claude + Slack) can take 2-5 minutes inside `after()`.

---

## Files to create / modify

| Path | Action |
|---|---|
| Supabase SQL Editor | Run migration (Step 1) |
| `docs/SCHEMA.md` | Update at end (Step 12) |
| `src/types/sales-coach.ts` | Create |
| `src/types/fireflies.ts` | Create |
| `src/lib/integrations/fireflies.ts` | Create |
| `src/lib/integrations/slack-bot.ts` | Create |
| `src/lib/agents/sales-coach/filter.ts` | Create |
| `src/lib/agents/sales-coach/build-prompt.ts` | Create |
| `src/lib/agents/sales-coach/run.ts` | Create |
| `src/lib/agents/sales-coach/post-error.ts` | Create |
| `src/app/api/agents/sales-coach/run/route.ts` | Create |
| `src/app/api/agents/sales-coach/reanalyze/[meetingId]/route.ts` | Create |
| `src/components/agent-prompts/sales-coach-actions.tsx` | Create |
| `src/app/dashboard/agent-settings/prompts/[slug]/page.tsx` | Modify (conditionally render actions) |
| `vercel.json` | Modify or create (cron stub, disabled) |
| `CLAUDE.md`, `CONVENTIONS.md`, `CHANGELOG.md`, `FEATURE_MAP.md` | Update at end (Step 12) |

---

## Step 1 — Migration

Paste into Supabase SQL Editor:

```sql
CREATE TABLE sales_call_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  fireflies_meeting_id text NOT NULL,
  rep_email text NOT NULL,
  rep_name text NOT NULL,
  call_title text,
  call_date timestamptz,
  duration_seconds integer,
  prospect_domain text,
  attendees jsonb NOT NULL DEFAULT '[]',
  fireflies_url text,
  prompt_slug text NOT NULL,
  claude_output text,
  slack_channel_id text,
  slack_parent_ts text,
  slack_thread_ts text,
  status text NOT NULL,
  error_message text,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_call_analyses_meeting_unique UNIQUE (workspace_id, fireflies_meeting_id),
  CONSTRAINT sales_call_analyses_status_check CHECK (status IN ('analyzed', 'failed', 'skipped'))
);

CREATE INDEX idx_sales_call_analyses_workspace_created
  ON sales_call_analyses(workspace_id, created_at DESC);

CREATE INDEX idx_sales_call_analyses_workspace_status
  ON sales_call_analyses(workspace_id, status);

ALTER TABLE sales_call_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY sales_call_analyses_owner ON sales_call_analyses
  FOR ALL USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );
```

Verify:
```sql
SELECT to_regclass('public.sales_call_analyses');  -- expect 'sales_call_analyses'
```

---

## Step 2 — TypeScript types

### `src/types/fireflies.ts`

```typescript
export interface FirefliesAttendee {
  email: string;
  name: string | null;
  location?: string | null;
}

export interface FirefliesSentence {
  speaker_name: string;
  text: string;
  start_time: number;
  end_time: number;
}

export interface FirefliesSpeakerAnalytics {
  name: string;
  duration: number;            // seconds
  duration_pct: number;        // 0-1 OR 0-100 — normalize in lib
  word_count: number;
  longest_monologue: number;   // seconds
  questions: number;
}

export interface FirefliesTranscriptSummary {
  id: string;
  title: string;
  date: number;                // unix ms
  duration: number;            // seconds
  transcript_url: string;
  meeting_attendees: FirefliesAttendee[];
}

export interface FirefliesTranscriptDetail extends FirefliesTranscriptSummary {
  sentences: FirefliesSentence[];
  analytics: {
    speakers: FirefliesSpeakerAnalytics[];
  };
}
```

### `src/types/sales-coach.ts`

```typescript
export interface SalesCoachFilterInput {
  attendees: { email: string; name: string | null }[];
  teamDomains: string[];
}

export interface SalesCoachFilterResult {
  ok: boolean;
  reason?: 'no_external_attendee' | 'no_attendees';
  externalAttendees?: { email: string; name: string | null }[];
}

export interface SalesCoachPromptVariables {
  company: string;
  attendees: string;
  duration: string;
  talk_ratios: string;
  longest_monologue: string;
  questions_asked: string;
  transcript: string;
}

export interface SalesCallAnalysis {
  id: string;
  workspaceId: string;
  firefliesMeetingId: string;
  repEmail: string;
  repName: string;
  callTitle: string | null;
  callDate: string | null;
  durationSeconds: number | null;
  prospectDomain: string | null;
  attendees: { email: string; name: string | null }[];
  firefliesUrl: string | null;
  promptSlug: string;
  claudeOutput: string | null;
  slackChannelId: string | null;
  slackParentTs: string | null;
  slackThreadTs: string | null;
  status: 'analyzed' | 'failed' | 'skipped';
  errorMessage: string | null;
  analyzedAt: string;
  createdAt: string;
}

export interface SalesCoachRunResult {
  fetched: number;       // total calls returned by Fireflies
  skipped_already_analyzed: number;
  skipped_filter: number;
  analyzed: number;
  failed: number;
}
```

---

## Step 3 — Fireflies client

Create `src/lib/integrations/fireflies.ts`. Wraps Fireflies' GraphQL API. Two exported functions: `listRecentTranscripts` and `getTranscriptDetail`.

```typescript
import type {
  FirefliesTranscriptSummary,
  FirefliesTranscriptDetail,
} from '@/types/fireflies';

const FIREFLIES_GRAPHQL_URL = 'https://api.fireflies.ai/graphql';

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function firefliesQuery<T>(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(FIREFLIES_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`[Fireflies] HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(`[Fireflies] GraphQL: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  if (!json.data) {
    throw new Error('[Fireflies] Empty response');
  }
  return json.data;
}

/**
 * List recent transcripts owned by the authenticated user.
 * `fromDate` is ISO 8601. Returns most recent first.
 */
export async function listRecentTranscripts(
  apiKey: string,
  options: { fromDate: string; limit: number }
): Promise<FirefliesTranscriptSummary[]> {
  const query = `
    query Transcripts($fromDate: DateTime, $limit: Int) {
      transcripts(fromDate: $fromDate, limit: $limit) {
        id
        title
        date
        duration
        transcript_url
        meeting_attendees {
          email
          name
          location
        }
      }
    }
  `;
  const data = await firefliesQuery<{ transcripts: FirefliesTranscriptSummary[] }>(
    apiKey,
    query,
    { fromDate: options.fromDate, limit: options.limit }
  );
  return data.transcripts ?? [];
}

/**
 * Fetch full transcript (sentences + analytics) for a single meeting ID.
 */
export async function getTranscriptDetail(
  apiKey: string,
  meetingId: string
): Promise<FirefliesTranscriptDetail | null> {
  const query = `
    query Transcript($id: String!) {
      transcript(id: $id) {
        id
        title
        date
        duration
        transcript_url
        meeting_attendees {
          email
          name
          location
        }
        sentences {
          speaker_name
          text
          start_time
          end_time
        }
        analytics {
          speakers {
            name
            duration
            duration_pct
            word_count
            longest_monologue
            questions
          }
        }
      }
    }
  `;
  const data = await firefliesQuery<{ transcript: FirefliesTranscriptDetail | null }>(
    apiKey,
    query,
    { id: meetingId }
  );
  return data.transcript;
}

/**
 * Normalize Fireflies' duration_pct, which can be 0-1 or 0-100 depending on field/version.
 * Returns a percentage 0-100 rounded to nearest integer.
 */
export function normalizeDurationPct(raw: number): number {
  const pct = raw <= 1 ? raw * 100 : raw;
  return Math.round(pct);
}
```

---

## Step 4 — Slack bot client

Create `src/lib/integrations/slack-bot.ts`. Two functions: `postParentMessage` and `postThreadReply`. Both use `chat.postMessage`.

```typescript
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
  text: string;       // plain-text fallback
  blocks?: unknown[]; // optional Block Kit
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
```

---

## Step 5 — Filter (TDD)

Create `src/lib/agents/sales-coach/filter.ts`. Pure function, no I/O, easy to test.

```typescript
import type { SalesCoachFilterInput, SalesCoachFilterResult } from '@/types/sales-coach';

/**
 * Returns ok: true if the call has at least one attendee outside the team domains.
 * Returns ok: false with a reason otherwise.
 */
export function shouldAnalyze(input: SalesCoachFilterInput): SalesCoachFilterResult {
  if (!input.attendees || input.attendees.length === 0) {
    return { ok: false, reason: 'no_attendees' };
  }

  const teamDomains = input.teamDomains.map((d) => d.toLowerCase().trim());
  const externalAttendees = input.attendees.filter((a) => {
    const email = (a.email ?? '').toLowerCase();
    if (!email.includes('@')) return false;
    const domain = email.split('@')[1];
    return !teamDomains.includes(domain);
  });

  if (externalAttendees.length === 0) {
    return { ok: false, reason: 'no_external_attendee' };
  }

  return { ok: true, externalAttendees };
}
```

**Inline tests (run as part of dev validation, not full test suite):** the brief does not require a vitest setup. Manual test cases to walk through mentally:
- Empty attendees → `no_attendees`
- Only `@cloudemployee.io` attendees → `no_external_attendee`
- Mix of internal + external → `ok: true`, externalAttendees populated
- Attendees with malformed emails (no `@`) → treated as not-external

---

## Step 6 — Prompt builder

Create `src/lib/agents/sales-coach/build-prompt.ts`. Takes a Fireflies transcript detail + the rep name + the raw prompt template, returns the fully-interpolated prompt string ready for Claude.

```typescript
import type {
  FirefliesTranscriptDetail,
  FirefliesAttendee,
} from '@/types/fireflies';
import { normalizeDurationPct } from '@/lib/integrations/fireflies';
import type { SalesCoachPromptVariables } from '@/types/sales-coach';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function inferProspectCompany(
  attendees: FirefliesAttendee[],
  teamDomains: string[]
): string {
  const teamSet = new Set(teamDomains.map((d) => d.toLowerCase()));
  const externalDomain = attendees
    .map((a) => (a.email ?? '').toLowerCase().split('@')[1])
    .find((d) => d && !teamSet.has(d));
  if (!externalDomain) return 'Unknown';
  const root = externalDomain.split('.')[0];
  return root.charAt(0).toUpperCase() + root.slice(1);
}

function formatAttendees(attendees: FirefliesAttendee[]): string {
  return attendees
    .map((a) => `${a.name ?? '(no name)'} <${a.email ?? ''}>`)
    .join(', ');
}

function formatTalkRatios(
  speakers: FirefliesTranscriptDetail['analytics']['speakers']
): string {
  return speakers
    .map((s) => `${s.name}: ${normalizeDurationPct(s.duration_pct)}%`)
    .join(', ');
}

function formatLongestMonologue(
  speakers: FirefliesTranscriptDetail['analytics']['speakers']
): string {
  const top = [...speakers].sort((a, b) => b.longest_monologue - a.longest_monologue)[0];
  if (!top) return 'Unknown';
  return `${top.name}: ${formatDuration(top.longest_monologue)}`;
}

function formatQuestionsAsked(
  speakers: FirefliesTranscriptDetail['analytics']['speakers'],
  repName: string
): string {
  const rep = speakers.find((s) => s.name.toLowerCase().includes(repName.toLowerCase()));
  if (!rep) return `${repName}: unknown`;
  return `${rep.name}: ${rep.questions}`;
}

function formatTranscript(sentences: FirefliesTranscriptDetail['sentences']): string {
  return sentences
    .map((s) => `${s.speaker_name}: ${s.text}`)
    .join('\n');
}

export function buildPromptVariables(
  transcript: FirefliesTranscriptDetail,
  repName: string,
  teamDomains: string[]
): SalesCoachPromptVariables {
  return {
    company: inferProspectCompany(transcript.meeting_attendees, teamDomains),
    attendees: formatAttendees(transcript.meeting_attendees),
    duration: formatDuration(transcript.duration),
    talk_ratios: formatTalkRatios(transcript.analytics.speakers),
    longest_monologue: formatLongestMonologue(transcript.analytics.speakers),
    questions_asked: formatQuestionsAsked(transcript.analytics.speakers, repName),
    transcript: formatTranscript(transcript.sentences),
  };
}

/**
 * Interpolate {{variable}} placeholders in the template with the variables map.
 * Unknown placeholders are left as-is (logged as warning).
 */
export function interpolatePrompt(
  template: string,
  vars: SalesCoachPromptVariables
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key in vars) return (vars as Record<string, string>)[key];
    console.warn(`[SalesCoach] Unknown prompt variable: ${key}`);
    return match;
  });
}
```

---

## Step 7 — Orchestrator

Create `src/lib/agents/sales-coach/run.ts`. The main worker function. Called from the API route inside `after()`.

Signature:
```typescript
export async function runSalesCoach(options: {
  workspaceId: string;
  reanalyzeMeetingId?: string; // if set, skip listing and just process this one meeting
}): Promise<SalesCoachRunResult>;
```

**Run mode is auto-detected, not passed in.** Inside `runSalesCoach`, count rows in `sales_call_analyses` for the workspace. Zero rows → extended mode (7d / 5 max). Otherwise → standard mode (2d / 20 max). Re-analyze short-circuits both.

Logic:
1. Read env vars and validate (see "Env var validation" subsection below). Required: `FIREFLIES_API_KEY_SHAWNEE`, `SALES_COACH_REP_EMAIL`, `SALES_COACH_REP_NAME`, `SALES_COACH_TEAM_DOMAINS` (parse comma-separated), `SLACK_BOT_TOKEN`, `SLACK_SALES_COACH_CHANNEL`, `SLACK_ERRORS_CHANNEL`. Throw with a clear message if any are missing.
2. **Branch on re-analyze:**
   - **If `reanalyzeMeetingId` is set** — DELETE the existing row for `(workspaceId, reanalyzeMeetingId)` from `sales_call_analyses` (ignore "not found" — it's fine if there was no prior row). Skip step 3 entirely. Skip the idempotency check in step 4. Call `getTranscriptDetail(apiKey, reanalyzeMeetingId)` and process that one transcript through the rest of step 4 starting from `shouldAnalyze`. Then go to step 6.
   - **If `reanalyzeMeetingId` is NOT set** — continue to step 3 below.
3. **Auto-detect run mode:** query `sales_call_analyses` count for the workspace.
   - Count === 0 → `fromDate = now - SALES_COACH_FIRST_RUN_DAYS days`, `limit = SALES_COACH_FIRST_RUN_MAX`
   - Count > 0 → `fromDate = now - SALES_COACH_SUBSEQUENT_DAYS days`, `limit = 20`
   - Call `listRecentTranscripts(apiKey, { fromDate, limit })`. If empty list, skip to step 6.
4. For each transcript in the list (or for the single re-analyze transcript via step 2):
   - **Idempotency check (skipped on re-analyze path):** check if a row exists for `(workspaceId, transcript.id)`. If yes (status is `analyzed` or `skipped`), increment `skipped_already_analyzed` and `continue`. We do NOT retry `skipped` rows — internal calls won't become external.
   - Call `getTranscriptDetail(apiKey, transcript.id)` for full data (if not already fetched on re-analyze path).
   - Run `shouldAnalyze({ attendees: detail.meeting_attendees, teamDomains })`. If `!ok`:
     - INSERT row with `status = 'skipped'`, `error_message = result.reason`, minimal other fields (call_title, call_date, fireflies_url, attendees, rep_email, rep_name).
     - Increment `skipped_filter`.
     - `continue`.
   - Load prompt: `await loadPromptContent(workspaceId, 'sales-coach')`.
   - Build variables: `buildPromptVariables(detail, repName, teamDomains)`.
   - Interpolate: `interpolatePrompt(template, vars)`.
   - Call Claude using the app-level pattern from Step 0.6. Single user-role message with the interpolated prompt. `max_tokens: 2000`. Model matches Clara's existing app-level Claude calls (likely `claude-sonnet-4-5-20250929` or `claude-sonnet-4-20250514` — use whatever Clara already uses).
   - Build parent message text (see format below).
   - Post parent → get `parentTs`.
   - Post thread reply with full Claude output → get `threadTs`.
   - INSERT row in `sales_call_analyses` with `status = 'analyzed'`, all fields populated (workspace_id, fireflies_meeting_id, rep_email, rep_name, call_title, call_date, duration_seconds, prospect_domain (first external domain), attendees JSONB, fireflies_url, prompt_slug='sales-coach', claude_output, slack_channel_id, slack_parent_ts, slack_thread_ts).
   - Increment `analyzed`.
5. Wrap each per-transcript iteration in `try/catch`. On error:
   - **Do NOT insert a row.** This is critical — inserting a `failed` row would block retry on the next run. Instead:
   - Increment `failed`.
   - Call `postSalesCoachError({ context: 'per-transcript', meetingId: transcript.id, error })` to post to `#clara-errors`.
   - `continue` to next transcript. Do not abort the whole run.
6. **Post run-complete summary** to `#sales-coach-test` (the coaching channel, not errors) regardless of outcome:
   ```
   ✅ Sales Coach run complete
   Fetched: {fetched} · Analyzed: {analyzed} · Already done: {skipped_already_analyzed} · Internal-only: {skipped_filter} · Failed: {failed}
   ```
   If `analyzed === 0` and the list was empty, the summary still posts — confirms the system ran. This message is the LAST Slack action in the run, so it always appears after any per-call analyses in the channel timeline.
7. Return `SalesCoachRunResult` (counts).

### Env var validation

Pre-validate required env vars **at the top of `runSalesCoach`**. Helper:

```typescript
function readEnv(): {
  firefliesApiKey: string;
  repEmail: string;
  repName: string;
  teamDomains: string[];
  slackToken: string;
  salesCoachChannel: string;
  errorsChannel: string;
} {
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
    teamDomains: required.SALES_COACH_TEAM_DOMAINS!.split(',').map((d) => d.trim()),
    slackToken: required.SLACK_BOT_TOKEN!,
    salesCoachChannel: required.SLACK_SALES_COACH_CHANNEL!,
    errorsChannel: required.SLACK_ERRORS_CHANNEL!,
  };
}
```

**Export the validation helper** as `validateSalesCoachEnv()` so the API route can pre-flight it before entering `after()` (see Step 8).

### Parent message format

```
🎯 Sales Coach
Call: {call_title}
Duration: {duration} · {speaker_breakdown}
Recording: {fireflies_url}

🧵 Coaching breakdown in thread below
```

Where `{speaker_breakdown}` is computed as follows:
- Try to find a speaker whose `name` (case-insensitive) contains `SALES_COACH_REP_NAME`. If found → format as `Talk: {rep_name} {rep_pct}% / Others {other_pct}%` (sum of other speakers).
- If no match → format as `Talk: {speaker1_name} {pct1}% / {speaker2_name} {pct2}%` for the top two speakers by talk percentage.
- If only one speaker → `Talk: {name} 100%`.

This avoids guessing which speaker is the rep when name matching fails.

### Thread reply

Full Claude output verbatim. No modifications. No preamble. The prompt instructs Claude to output the 5 numbered sections — we trust that.

If the output exceeds 39,000 characters (Slack's `text` field limit is 40,000, leaving headroom), truncate at 38,500 and append `\n\n[Output truncated — see sales_call_analyses.claude_output for full text]`. This is defensive; in practice 5-section coaching output is 2,000-4,000 chars.

### `src/lib/agents/sales-coach/post-error.ts`

Helper called from `run.ts` and the API routes when something fails before or during per-transcript processing.

```typescript
import { postParentMessage } from '@/lib/integrations/slack-bot';

export async function postSalesCoachError(params: {
  context: string;          // e.g., 'listRecentTranscripts', 'per-transcript', 'orchestrator-top-level'
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
```

---

## Step 8 — API routes

### `src/app/api/agents/sales-coach/run/route.ts`

`POST` — manual trigger. Auth-gated to workspace owner. Returns 200 immediately, runs orchestrator in `after()`.

```typescript
import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';
import { runSalesCoach, validateSalesCoachEnv } from '@/lib/agents/sales-coach/run';
import { postSalesCoachError } from '@/lib/agents/sales-coach/post-error';
import { postParentMessage } from '@/lib/integrations/slack-bot';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(_request: Request) {
  try {
    // Auth
    const authClient = await createAuthClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Workspace
    const supabase = createServerClient();
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .single();
    if (wsError || !workspace) {
      return NextResponse.json({ success: false, error: 'Workspace not found' }, { status: 404 });
    }

    // Pre-flight env validation. Fail fast in the response so the user sees a clear error
    // immediately, not 2 minutes later after they check Slack and see nothing.
    try {
      validateSalesCoachEnv();
    } catch (envError) {
      const message = envError instanceof Error ? envError.message : 'Env validation failed';
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }

    // Run mode (extended vs standard lookback) is auto-detected inside runSalesCoach
    // based on whether sales_call_analyses has any rows for this workspace.
    after(async () => {
      try {
        await runSalesCoach({ workspaceId: workspace.id });
      } catch (error) {
        // Top-level failure inside after(). Post to BOTH channels so the user's expected
        // feedback channel (#sales-coach-test) always shows something, not just errors.
        await postSalesCoachError({ context: 'run-orchestrator-top-level', error });
        try {
          await postParentMessage({
            token: process.env.SLACK_BOT_TOKEN!,
            channel: process.env.SLACK_SALES_COACH_CHANNEL!,
            text: '❌ Sales Coach run failed at startup — see #clara-errors for details.',
          });
        } catch (postErr) {
          console.error('[SalesCoach] Failed to post startup-failure notice to coaching channel', postErr);
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Sales Coach run started. Output will appear in Slack within 1-2 minutes.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
```

### `src/app/api/agents/sales-coach/reanalyze/[meetingId]/route.ts`

`POST` — re-run analysis for a single meeting. The orchestrator's re-analyze path deletes the prior row and re-processes that one meeting.

Same shape as the run route — including the pre-flight `validateSalesCoachEnv()` check and the same after() failure-to-both-channels pattern. The only differences:

- Route signature includes `[meetingId]` async param (Next.js 16):
  ```typescript
  interface RouteContext {
    params: Promise<{ meetingId: string }>;
  }
  export async function POST(_request: Request, context: RouteContext) {
    const { meetingId } = await context.params;
    // ... auth, workspace, env validation as in run route ...
    after(async () => {
      try {
        await runSalesCoach({ workspaceId: workspace.id, reanalyzeMeetingId: meetingId });
      } catch (error) {
        // Same dual-channel failure posting as run route.
      }
    });
    // ... return 200 ...
  }
  ```

- Required exports (same as run route):
  ```typescript
  export const runtime = 'nodejs';
  export const maxDuration = 300;
  export const dynamic = 'force-dynamic';
  ```

---

## Step 9 — UI: Sales Coach actions

### `src/components/agent-prompts/sales-coach-actions.tsx`

Client component. Renders a "Run Sales Coach Now" button + last-run feedback. Renders above the prompt editor (per Jake's preference).

```typescript
'use client';

import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';

export function SalesCoachActions() {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setRunning(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/agents/sales-coach/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Run failed');
      setMessage(data.message ?? 'Run started. Check Slack.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-ce-border p-5 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ce-text">Run Sales Coach now</h2>
          <p className="text-xs text-ce-text-muted mt-1">
            Fetches Shawnee&apos;s last 7 days of Fireflies calls (max 5), runs each through the prompt above,
            and posts coaching analyses to <code className="text-ce-teal">#sales-coach-test</code>.
            Already-analyzed calls are skipped.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          className="shrink-0 px-4 py-2 bg-ce-navy text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 flex items-center gap-2"
        >
          {running ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Running...</>
          ) : (
            <><Play className="w-4 h-4" /> Run Now</>
          )}
        </button>
      </div>
      {message && (
        <div className="mt-3 text-sm text-ce-teal bg-ce-muted rounded-md p-2">{message}</div>
      )}
      {error && (
        <div className="mt-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-md p-2">{error}</div>
      )}
    </div>
  );
}
```

### Modify `src/app/dashboard/agent-settings/prompts/[slug]/page.tsx`

Conditionally render `<SalesCoachActions />` above `<PromptEditor />` when `prompt.slug === 'sales-coach'`:

```typescript
import { SalesCoachActions } from '@/components/agent-prompts/sales-coach-actions';
// ...
return (
  <div className="max-w-4xl mx-auto p-6">
    {prompt.slug === 'sales-coach' && <SalesCoachActions />}
    <PromptEditor prompt={prompt} />
  </div>
);
```

---

## Step 10 — Cron stub (disabled)

Create or update `vercel.json` at repo root with a stubbed cron entry, commented out. Future sales-coach-3 enables it.

If `vercel.json` already exists, add the comment below as a placeholder near the top of the file. Do not add an active cron entry — cron must remain disabled in v1.

```jsonc
{
  // Sales Coach cron (disabled in v1, enabled in sales-coach-3 once manual run is trusted):
  // "crons": [
  //   { "path": "/api/agents/sales-coach/run", "schedule": "0 */2 * * *" }
  // ]
}
```

---

## Step 11 — Testing

### Manual UI smoke test (primary verification)

1. Restart dev server (`npm run dev`) after `.env.local` changes — env vars only load at boot.
2. Log into Clara as the CE workspace owner.
3. Navigate to **Agent Settings → Prompts → Sales Coach**.
4. The "Run Sales Coach now" card appears above the prompt editor.
5. Click **Run Now**.
6. Button shows "Running..." briefly, then a green confirmation: "Sales Coach run started. Output will appear in Slack within 1-2 minutes."
7. Watch `#sales-coach-test` in Slack. Within 30-90 seconds:
   - Zero or more per-call analyses post (parent + thread).
   - A final **"✅ Sales Coach run complete"** summary message posts with the counts (fetched, analyzed, already-done, internal-only, failed).
   - The summary message ALWAYS appears, even if zero calls were found.
8. Open one of the per-call analyses (if any). The thread reply contains the full 5-section coaching breakdown.
9. Check `sales_call_analyses` in Supabase:
   ```sql
   SELECT call_title, status, analyzed_at FROM sales_call_analyses ORDER BY analyzed_at DESC;
   ```
   Should match the number of analyses posted (`analyzed` rows) plus any `skipped` rows for internal-only calls. **No `failed` rows should exist** — failures don't insert.
10. Click **Run Now** a second time. Expected:
    - Zero new per-call analyses (already-done idempotency working).
    - A new run-complete summary message in `#sales-coach-test` with `Already done` count > 0.

### Empty-result behavior

If Shawnee hasn't recorded a call in the lookback window, the run still completes and posts the summary message:
```
✅ Sales Coach run complete
Fetched: 0 · Analyzed: 0 · Already done: 0 · Internal-only: 0 · Failed: 0
```
This confirms the system ran and is alive.

### Re-analyze test

Pick one `fireflies_meeting_id` from the table. Curl:
```bash
curl -X POST http://localhost:3000/api/agents/sales-coach/reanalyze/<MEETING_ID> \
  -H "Cookie: <your dev session cookie>"
```
Within 60 seconds: a new Slack analysis appears for the same call. The DB row is replaced (same meeting ID, new `analyzed_at`).

### Error path test (Fireflies fails inside run)

Temporarily set `FIREFLIES_API_KEY_SHAWNEE` to a syntactically valid but unauthorized value in `.env.local` (e.g. `bad_key_for_test`), restart, click Run Now.

Expected (since the env var is *set*, pre-flight passes; failure happens during the actual Fireflies call inside `after()`):
- A structured error message in `#clara-errors`: context = `run-orchestrator-top-level` or `per-transcript`, error text from Fireflies.
- A `❌ Sales Coach run failed at startup — see #clara-errors for details.` message in `#sales-coach-test` (NOT the run-complete summary — the orchestrator threw before reaching step 6).
- **No new rows in `sales_call_analyses`** (failure does not insert).

Restore the key after.

### Env-missing test (pre-flight validation)

Temporarily delete `SLACK_BOT_TOKEN` from `.env.local`, restart, click Run Now.

Expected:
- Route returns 400 (not 200) immediately.
- UI shows a red error banner with text like `Missing required env vars: SLACK_BOT_TOKEN`.
- **No background work runs.** Nothing posts to either Slack channel.

This is the "fail fast in the response" path — user knows immediately, doesn't wait 2 minutes.

Restore the env var after.

### Failure retry test (per-call Claude fail)

Harder to manufacture cleanly. Verify the intent in code review: per-transcript catch block should NOT insert a row, only `postSalesCoachError` and `continue`. The next Run Now invocation should retry that same meeting.

---

## Step 12 — Build verification

Run all three. Zero new errors introduced:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Pre-existing lint warnings from Session 1's audit are acceptable. **New lint errors introduced by this session must be fixed.**

---

## Step 13 — Documentation updates

1. **`docs/SCHEMA.md`** — Add `sales_call_analyses` to the table list (7 tables now), full column reference, indexes, RLS policy, migration SQL.
2. **`CLAUDE.md`** — Bump DB tables 6 → 7. Add new API routes (`POST /api/agents/sales-coach/run`, `POST /api/agents/sales-coach/reanalyze/[meetingId]`) and new env vars table. Add a "Sales Coach" entry to the architecture rules: "Single rep (Shawnee) hardcoded via env vars in v1; multi-rep deferred to sales-coach-3."
3. **`CONVENTIONS.md`** — Add "Agent Orchestrator Pattern" section describing `lib/agents/<agent>/run.ts` as the canonical place for an agent's main loop. Add "External Integration Pattern" section if not already present (`lib/integrations/<service>.ts`).
4. **`CHANGELOG.md`** — Sales Coach Session 2 entry: "Sales Coach engine shipped. Fireflies polling + Claude analysis + Slack output to #sales-coach-test, errors to #clara-errors. Manual trigger via 'Run Now' button on the prompt edit page. Single rep (Shawnee) hardcoded. Re-analyze route supported. Cron stubbed but disabled."
5. **`FEATURE_MAP.md`** — Add under "Agent Infrastructure":

```markdown
### Sales Coach (v1)
- **Description:** Coaches sales reps on Fireflies-recorded discovery calls. Polls Fireflies, filters for external attendees, runs each transcript through the editable `sales-coach` prompt via Claude, posts parent + thread message per call to a Slack channel.
- **Pages:** `/dashboard/agent-settings/prompts/sales-coach` (Run Now button)
- **API Routes:** `POST /api/agents/sales-coach/run`, `POST /api/agents/sales-coach/reanalyze/[meetingId]`
- **Components:** `src/components/agent-prompts/sales-coach-actions.tsx`
- **Lib Modules:** `src/lib/agents/sales-coach/run.ts`, `filter.ts`, `build-prompt.ts`, `post-error.ts`; `src/lib/integrations/fireflies.ts`, `slack-bot.ts`
- **DB Tables:** `sales_call_analyses`, reads from `agent_prompts`
- **Types:** `src/types/sales-coach.ts`, `src/types/fireflies.ts`
- **Env Vars:** `SLACK_BOT_TOKEN`, `SLACK_SALES_COACH_CHANNEL`, `SLACK_ERRORS_CHANNEL`, `FIREFLIES_API_KEY_SHAWNEE`, `SALES_COACH_REP_EMAIL`, `SALES_COACH_REP_NAME`, `SALES_COACH_TEAM_DOMAINS`, `SALES_COACH_WORKSPACE_ID`, `SALES_COACH_FIRST_RUN_DAYS`, `SALES_COACH_FIRST_RUN_MAX`, `SALES_COACH_SUBSEQUENT_DAYS`
- **Track / Session:** sales-coach-2
```

---

## Step 14 — Commit cadence

1. `feat(db): add sales_call_analyses table`
2. `feat(types): add Fireflies and Sales Coach types`
3. `feat(lib): add Fireflies GraphQL client`
4. `feat(lib): add Slack bot client (chat.postMessage with threading)`
5. `feat(lib): add Sales Coach filter (TDD-ready)`
6. `feat(lib): add Sales Coach prompt builder and variable interpolation`
7. `feat(lib): add Sales Coach orchestrator and error helper`
8. `feat(api): add Sales Coach run and reanalyze routes`
9. `feat(ui): add Run Now action to Sales Coach prompt editor`
10. `chore: add stubbed Sales Coach cron config (disabled)`
11. `docs: update SCHEMA, CLAUDE, CONVENTIONS, CHANGELOG, FEATURE_MAP for sales-coach-2`

---

## Out of scope (sales-coach-3 and beyond)

Deliberately not in this session:

- Multi-rep support (config-driven mapping of rep email → Fireflies key → Slack channel)
- Vercel cron enabled (running on a schedule)
- UI for browsing analysis history (`/dashboard/agent-settings/sales-coach`)
- DMing Jake on critical errors (currently posts to channel only)
- Re-analyze UI (currently only via curl)
- Adding Molly / Shawnee to Slack output channels
- Slack interactive components (e.g. "👍 useful" reactions tracked in DB)
- Cost / token tracking on Claude calls

---

## Brief history

| Version | Date | Changes |
|---|---|---|
| v1 | initial | First draft, single-rep v1 |
| v2 | this revision | Audit fixes (surgical): added Step 0.7 (`createServerClient` service-role check) and Step 0.8 (Fireflies GraphQL schema introspection — verify field names before writing the lib); added `runtime = 'nodejs'` to both API routes; switched run-mode detection to auto-detect inside the orchestrator (zero rows = extended 7d/5max, else standard 2d/20max), removed `firstRun` body parameter; idempotency now only inserts rows for `analyzed` and `skipped` statuses — failures do NOT insert (allows natural retry on next run, failures still post to `#clara-errors`); added run-complete summary message to `#sales-coach-test` at the end of every run (confirms aliveness on empty runs); fixed rep identification with fuzzy name matching + fallback to showing all speakers (no guessing); bumped Claude `max_tokens` from 1500 to 2000; added Slack thread truncation guard at 38,500 chars; updated testing section to verify all the above. |
| v3 | this revision | Audit fixes (surgical, second pass): clarified the re-analyze path in Step 7 — explicitly skips `listRecentTranscripts` and the step-4 idempotency check, calls `getTranscriptDetail` directly with `reanalyzeMeetingId`; extracted `validateSalesCoachEnv()` as a separate export from `run.ts` so the API route can pre-flight env vars BEFORE entering `after()`; the run route now returns 400 immediately on missing env vars instead of silently failing 2 minutes later; the `after()` top-level catch now posts to BOTH `#clara-errors` AND `#sales-coach-test` (the user's expected feedback channel always shows something — never silent); cleaned up the title (removed confusing "(v1)" suffix — engine versioning moved to subtitle line); fleshed out the reanalyze route shape with explicit code; added env-missing test case in Step 11 to verify the pre-flight 400 path. |
