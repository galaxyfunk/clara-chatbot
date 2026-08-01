# CLAUDE.md — Clara Chatbot Project

## What Clara Is
Clara is a standalone, multi-tenant AI chatbot SaaS product. Users sign up, add Q&A pairs to a knowledge base, configure their own LLM provider (bring your own key), customize the chatbot's appearance and personality, and deploy it on their website via an embeddable widget. Built by Cloud Employee as both a production tool and a free open-source giveaway.

**Product name:** Clara
**Default agent name:** Clara (users can rename in settings)
**Tagline:** "Your AI-Powered Chatbot, Built in Minutes"

## Current Version
**v1.1: IN PROGRESS** — CLARA-2 complete (Jul 30, 2026). Clara now emits a `brief_update` SSE event after the token loop and before `done`, carrying a complete structured hiring brief for Cloud Employee's `/ask` page. Persisted on `chat_sessions.metadata.brief`. Awaiting merge + deploy; after that the remaining `/ask` work is CE-side plus one `personality_prompt` dashboard edit.

**v1.0: DEPLOYED** — Live at https://chatbot.jakevibes.dev (Feb 23, 2026)
- Dashboard app at chatbot.jakevibes.dev
- Auth, Q&A management, chat engine, gap detection, smart escalation
- Embeddable widget (iframe + floating bubble via `<script>` tag)
- 5 tabs settings with save button
- Styled chat playground
- CE-branded landing page
- 4 sessions, 18 build steps — ALL COMPLETE

## Codebase
- **Repo:** galaxyfunk/clara-chatbot (GitHub)
- **Database:** Supabase (standalone project — not shared with any other product)
- **Storage:** Supabase Storage (chatbot-assets bucket)
- **Deploy:** Vercel → chatbot.jakevibes.dev

## Tech Stack
| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, TypeScript) |
| Database | Supabase (Postgres + pgvector) |
| Storage | Supabase Storage |
| Styling | Tailwind CSS |
| Auth | Supabase Auth (Google OAuth + email/password) |
| AI — Chat | Multi-provider (Claude API + OpenAI API) — user's key |
| AI — Embeddings | OpenAI text-embedding-3-small — app-level key |
| AI — Extraction | Claude Sonnet 4.6 (`claude-sonnet-4-6`) — app-level key |
| AI — Classify / brief | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) — app-level key, per-turn work |
| Encryption | AES-256-GCM (Node.js crypto) |
| Integrations | HubSpot API (contact upsert via REST), Fireflies GraphQL API (transcripts), Slack Bot API (chat.postMessage) |
| Hosting | Vercel |

## Database Tables (7)
1. **workspaces** — One per user. Settings JSONB stores content (display_name, welcome_message, suggested_messages, placeholder_text, booking_url), style (primary_color, bubble_color, bubble_position, avatar_url, chat_icon_url, widget_layout, trigger_text, status_messages, hint_messages), AI config (personality_prompt, confidence_threshold, escalation_enabled), integrations (hubspot_enabled), widget (powered_by_clara), knowledge base (custom_categories), and onboarding (onboarding_completed_steps).
2. **api_keys** — User LLM API keys encrypted with AES-256-GCM. Fields: provider, model, encrypted_key, key_last4, label, is_default, is_active.
3. **qa_pairs** — Knowledge base. Fields: question, answer, category, embedding (vector 1536d), source (manual/csv_import/transcript_extraction), is_active, metadata.
4. **chat_sessions** — Conversation logs. Fields: session_token (client UUID), messages (JSONB array with message_id per message), summary (JSONB — **never written, read `metadata.summary` instead**), metadata (JSONB — holds `summary`, `summarized_at`, `brief`, `brief_updated_at`), visitor_name, visitor_email, escalated, escalated_at, slack_thread_ts (Slack `ts` of the chat-activity parent message — set when the start notification fires on the CE workspace, NULL otherwise). Unique on (workspace_id, session_token).
5. **qa_gaps** — Low-confidence questions flagged for review. Fields: question, ai_answer, best_match_id, similarity_score, session_id, status (open/resolved/dismissed), resolved_qa_id.
6. **agent_prompts** — Generic, workspace-scoped, slug-keyed prompt store usable by any Clara agent. Fields: slug, name, description, agent_type (e.g. `sales_coach`), content (with `{{variable}}` placeholders), metadata, is_active. Unique on (workspace_id, slug). Seeded with `sales-coach` for the CE workspace.
7. **sales_call_analyses** — Per-call Sales Coach output. Fields: fireflies_meeting_id, rep_email, rep_name, call_title, call_date, duration_seconds, prospect_domain, attendees (JSONB), fireflies_url, prompt_slug, claude_output, slack_channel_id, slack_parent_ts, slack_thread_ts, status (analyzed/failed/skipped), call_type (sales/internal/recruitment/other, nullable for pre-classifier rows), error_message, analyzed_at. Unique on (workspace_id, fireflies_meeting_id) — idempotency key. Failures don't insert (natural retry on next run); only `analyzed` and `skipped` statuses persist.

## Key API Routes
| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| /api/chat | POST+OPTIONS | Public | Main chat endpoint with CORS (workspace_id identifies) |
| /api/qa-pairs | GET/POST | Auth | Q&A CRUD with dedup check |
| /api/qa-pairs/[id] | PATCH/DELETE | Auth | Update/soft-delete pair |
| /api/qa-pairs/import | POST | Auth | CSV bulk import with overlap detection |
| /api/qa-pairs/extract | POST | Auth | Transcript → Q&A via Claude |
| /api/qa-pairs/improve | POST | Auth | AI improve single pair |
| /api/qa-pairs/bulk-save | POST | Auth | Save extracted/imported pairs |
| /api/qa-pairs/bulk-action | POST | Auth | Bulk delete/activate/categorize pairs |
| /api/qa-pairs/test-match | POST | Auth | Test question similarity against knowledge base |
| /api/api-keys | GET/POST | Auth | List/add encrypted keys |
| /api/api-keys/[id] | PATCH/DELETE | Auth | Update/delete key |
| /api/workspace | GET/PATCH | Auth | Read/update workspace settings |
| /api/upload | POST | Auth | Avatar/icon image upload |
| /api/gaps | GET | Auth | Gap review queue |
| /api/gaps/bulk | PATCH | Auth | Bulk dismiss/delete gaps |
| /api/gaps/resolve | POST | Auth | Promote gap → Q&A pair |
| /api/gaps/dismiss | POST | Auth | Dismiss gap |
| /api/gaps/interview-guide | POST | Auth | AI interview guide generation |
| /api/sessions | GET | Auth | Chat session browser |
| /api/sessions/[id] | GET | Auth | Single-session fetch for deep-link hydration (used by `?session=<id>` query param on `/dashboard/sessions`) |
| /api/sessions/summarize | POST | Auth | Generate AI summary for a session |
| /api/dashboard/stats | GET | Auth | Dashboard aggregate stats |
| /api/agent-prompts | GET | Auth | List agent prompts for the workspace |
| /api/agent-prompts/[slug] | GET/PATCH | Auth | Fetch or update a single agent prompt by slug |
| /api/agents/sales-coach/run | POST | Auth | Trigger a Sales Coach run (background via after(); pre-flights env vars, returns 200 then runs orchestrator) |
| /api/agents/sales-coach/reanalyze/[meetingId] | POST | Auth | Re-analyze a single meeting (deletes prior row, fetches transcript, posts new Slack output) |
| /api/cron/sales-coach/run | GET | CRON_SECRET | Vercel cron entry point (every 15 min). Same orchestrator, `triggeredBy: 'cron'` so idle runs stay silent. |

## Pages (10)
| Route | Purpose |
|-------|---------|
| / | Landing page (CE-branded, login CTA) |
| /login | Supabase Auth UI |
| /dashboard | Stats overview, recent gaps, quick actions |
| /dashboard/knowledge | Q&A pair management (table, add, edit, import) |
| /dashboard/knowledge/extract | Transcript extraction flow |
| /dashboard/gaps | Gap review queue |
| /dashboard/sessions | Conversation browser |
| /dashboard/chat | Chat playground (styled to match widget) |
| /dashboard/settings | 5 tabs: Content, Style, AI, API Keys, Embed |
| /dashboard/agent-settings/prompts | List of agent prompts for the workspace |
| /dashboard/agent-settings/prompts/[slug] | Editor for a single agent prompt |
| /chat/[workspaceId] | Public chat page (widget iframe target) |

## Architecture Rules
- Everything TypeScript — no Python
- Single Vercel deployment — frontend + API routes
- App Router only — no Pages Router
- All logic in /lib — API routes are thin wrappers
- Workspace isolation on every query
- Sequential embedding generation (no Promise.all)
- Two API key layers: app-level (env vars) + user-level (encrypted in DB)
- Message IDs for chat idempotency
- Q&A dedup check before creation (> 0.95 similarity)
- Gap dedup before insertion (same question check)
- Dynamic display name — never hardcode "Clara", use settings.display_name
- Category normalization — lowercase + trim via getMergedCategories() helper
- Bulk operations — verify workspace ownership, validate categories, single atomic UPDATE
- Iframe detection — window.self !== window.top, postMessage for resize
- File parsing — mammoth for .docx, pdf-parse/lib/pdf-parse.js for .pdf (requires runtime = 'nodejs')
- Background work — use after() from next/server, never void asyncFn()
- AI summaries — app-level Claude key, trigger after 4+ messages, summary stored in metadata.summary
- Shadow DOM isolation — widget layouts (Side Whisper, Command Bar) use attachShadow({ mode: 'open' }) for style encapsulation on host pages
- CORS on /api/chat — allowlist-based origin headers for cross-origin widget embedding (chatbot.jakevibes.dev, cloudemployee.com/io, localhost)
- HubSpot integration — upsert-only via REST API, gated by hubspot_enabled toggle, fail silently, [HubSpot] log prefix, 500-char summary truncation
- Email capture — regex extraction from user messages in postProcess, stored once per session on visitor_email, triggers HubSpot upsert when enabled
- Agent prompts — generic, workspace-scoped, slug-keyed store (`agent_prompts` table). All agent system prompts live in this table, never hardcoded. Loaded via `loadPromptContent(workspaceId, slug)` in `src/lib/agent-prompts/loader.ts` with a 60s in-process cache; edits via the dashboard invalidate the cache on the editing instance immediately. New agents plug in by inserting a row with a new `agent_type` value — no schema changes.
- Sales Coach — single rep (Shawnee) hardcoded via env vars in v1; multi-rep refactor deferred to sales-coach-3. Orchestrator lives at `src/lib/agents/sales-coach/run.ts`; runs inside `after()` so the API route returns 200 immediately. Idempotency on `(workspace_id, fireflies_meeting_id)`: `analyzed` and `skipped` rows persist, failures do NOT insert (allow natural retry next run). All errors post to `#clara-errors`. Re-analyze deletes the prior row and processes the single meeting.
- Sales Coach call-type classifier — Every fetched transcript is passed through `classifyCall()` (`src/lib/agents/sales-coach/classify.ts`, Claude Haiku 4.5, JSON output) before analysis. Labels: `sales | internal | recruitment | other`. Only `sales` proceeds to coaching analysis + Slack post. Non-sales calls are recorded as `status='skipped'` rows with `call_type` populated, NO Slack output. Run-summary counter `skipped_filter` covers all non-sales (label rendered as `Non-sales:`). The re-analyze route bypasses the classifier (forces `sales`) since the user explicitly requested it. Classifier parse/label errors post to `#clara-errors` and skip the insert (natural retry).
- Sales Coach triggers — three entry points share the orchestrator: (1) manual "Run Now" button at `/dashboard/agent-settings/prompts/sales-coach` → `POST /api/agents/sales-coach/run`, (2) re-analyze a specific meeting → `POST /api/agents/sales-coach/reanalyze/[meetingId]`, (3) Vercel cron every 15 min → `GET /api/cron/sales-coach/run` (bearer-auth via `CRON_SECRET`). Run-complete summary always posts on manual + reanalyze paths; on cron path it's suppressed unless there's NEW activity (`analyzed > 0` OR `failed > 0` OR `skipped_filter > 0`) — prevents 96 idle-summary posts/day to `#sales-coach-test`.
- Ask Clara brief — `brief_update` SSE event, enqueued after the token loop and **before `done`** (consumers treat `done` as end-of-stream). The COMPLETE brief every time, never a patch. Extraction is a separate Haiku call on the app-level key (`src/lib/chat/extract-brief.ts`), gated by `shouldExtractBrief()` so pure Q&A turns cost nothing, and by `ASK_BRIEF_WORKSPACE_IDS`. Only fields the visitor actually stated get filled — absent fields are how CE renders "Clara will ask next", so never guess. `strength` is computed in code, never asked of the model. Merge extracted fields over the stored brief so a field the model forgets does not vanish. `version` increments only on real content change. Persisted by `persistBrief()`, which re-reads `metadata` first and runs AFTER the summary block in `postProcess` so the two cannot clobber each other. `src/types/brief.ts` is a hand-maintained mirror of CE's `site/src/lib/ask/brief.ts` — **changes must land in both repos**.
- Chat session Slack notifications — CE-only, env-gated via `CHAT_ACTIVITY_WORKSPACE_ID` (independent of the Sales Coach gate so the two features stay decoupled). Two hooks in the chat engine: (1) when `context.existingSession === null` (truly first message of a brand-new session), post a parent Slack message via `notifyChatStarted` with the visitor's first message (truncated 200 chars), workspace display name, and deep link `?session=<id>`; persist the returned `ts` to `chat_sessions.slack_thread_ts`. (2) When the AI summary is persisted, post a thread reply via `notifyChatSummary` with intent, visitor email, paragraph summary, and action-item bullets. Both helpers live in `src/lib/integrations/chat-activity-slack.ts`, share the existing `SLACK_BOT_TOKEN`, and post to `SLACK_CHAT_ACTIVITY_CHANNEL`. Fail-silent — hard errors mirror to `#clara-errors`; if the start post failed, `slack_thread_ts` stays NULL and the summary hook silently no-ops. Non-streaming start hook uses `after()` inside `processChat`; streaming start/summary hooks run inline within the existing `postProcess` (which is already wrapped in `after()` by the route). Non-streaming summary hook lives in `/api/chat/route.ts` inside the existing summary `after()` block.

## Env Vars (Sales Coach)
| Var | Purpose |
|-----|---------|
| `SLACK_BOT_TOKEN` | Bot OAuth token (`xoxb-…`) — posts to coaching + errors channels |
| `SLACK_SALES_COACH_CHANNEL` | Channel ID for coaching output (e.g. `#sales-coach-test`) |
| `SLACK_ERRORS_CHANNEL` | Channel ID for orchestrator errors (e.g. `#clara-errors`) |
| `FIREFLIES_API_KEY_SHAWNEE` | Shawnee's personal Fireflies key — authenticates as her, returns only her calls |
| `SALES_COACH_WORKSPACE_ID` | CE workspace UUID — defensive constant (matches workspaces table) |
| `SALES_COACH_REP_EMAIL` | Rep email (used for the `(rep)` annotation in prompt + DB rows) |
| `SALES_COACH_REP_NAME` | Rep first name — used for fuzzy speaker matching in talk-ratio breakdown |
| `SALES_COACH_TEAM_DOMAINS` | Comma-separated team email domains — drives the external-attendee filter |
| `SALES_COACH_FIRST_RUN_DAYS` | Extended lookback window on first run (default 7) |
| `SALES_COACH_FIRST_RUN_MAX` | Max calls to process on first run (default 5) |
| `SALES_COACH_SUBSEQUENT_DAYS` | Standard lookback window after first run (default 2) |
| `CRON_SECRET` | Bearer token used by Vercel cron to authenticate against `/api/cron/sales-coach/run`. **Vercel Production env only** — not Preview/Development. Vercel auto-injects this into the `Authorization: Bearer …` header when the cron fires. |

## Env Vars (Chat Activity Slack)
| Var | Purpose |
|-----|---------|
| `CHAT_ACTIVITY_WORKSPACE_ID` | Workspace UUID allowed to fire chat-activity Slack notifications. CE workspace only. Independent of `SALES_COACH_WORKSPACE_ID` so the two features can decouple later. |
| `SLACK_CHAT_ACTIVITY_CHANNEL` | Channel ID for chat-activity output (parent + thread reply per session). Reuses `SLACK_BOT_TOKEN` and `SLACK_ERRORS_CHANNEL`. |

## Env Vars (Ask Clara / brief)
| Var | Purpose |
|-----|---------|
| `ASK_BRIEF_WORKSPACE_IDS` | Comma-separated workspace UUIDs allowed to spend app-level Anthropic credit on per-turn brief extraction. **Unset = every workspace extracts**, so `/ask` works without configuration; set it to the CE workspace once other tenants are live. |
| `CLARA_EXTRA_ALLOWED_ORIGINS` | Comma-separated extra CORS origins for the public routes (CLARA-1). Use for Vercel preview hosts rather than a blanket `*.vercel.app`. |

## Version Roadmap
| Version | Focus | Status |
|---------|-------|--------|
| v1.0 | Core Product + Widget + Deploy | **✅ SHIPPED — Feb 23, 2026** |
| v1.1 | Polish + Intelligence + UX + Widget Layouts + CE Go-Live + Agents + `/ask` | **IN PROGRESS — 14 sessions complete** |
| v1.2 | Channel Integrations (Slack, Telegram, WhatsApp) | Future |
| v1.3 | Analytics + Reporting | Future |
| Bridge | Insights Bank one-way API push | Future |

## v1.0 Build Sessions
| Session | Focus | Steps | Day | Status |
|---------|-------|-------|-----|--------|
| 1 | Setup + DB + Auth + Types + All Lib Functions | 1–5 | Mon | ✅ COMPLETE |
| 2 | All API Routes | 6–9 | Tue | ✅ COMPLETE |
| 3 | All Dashboard UI | 10–14 | Wed–Thu | ✅ COMPLETE |
| 4 | Widget + Landing + Deploy | 15–18 | Thu–Fri | ✅ COMPLETE |

## v1.1 Build Sessions
| Session | Focus | Features | Status |
|---------|-------|----------|--------|
| 5 (v1.1-1) | Quick Wins + Infrastructure | 10 features | **✅ COMPLETE — Feb 28, 2026** |
| 6 (v1.1-2) | Intelligence | 7 features | **✅ COMPLETE — Mar 1, 2026** |
| 7A (v1.1-3a) | UX Polish | 4 features | **✅ COMPLETE — Mar 2, 2026** |
| 8 (v1.1-4) | Widget Layouts | 5 features | **✅ COMPLETE — Mar 3, 2026** |
| 9A (v1.1-5) | CE Go-Live Infrastructure | 4 features | **✅ COMPLETE — Mar 7, 2026** |
| 9B (v1.1-6) | Cleanup + HubSpot Fixes | 4 changes | **✅ COMPLETE — Mar 8, 2026** |
| 9C (v1.1-7) | Calendly Fix + Summary Rewrite + Widget Polish | 5 changes | **✅ COMPLETE — Mar 10, 2026** |
| sales-coach-1 | Agent Prompts Foundation | `agent_prompts` table, lib loader with cache, GET/PATCH API, dashboard editor, sidebar entry | **✅ COMPLETE — May 11, 2026** |
| sales-coach-2 | Sales Coach Engine | `sales_call_analyses` table, Fireflies + Slack clients, filter/prompt-builder/orchestrator, Run Now button, manual trigger + re-analyze routes, cron stub disabled | **✅ COMPLETE — May 12, 2026** |
| sales-coach-2.1 | Cron Auto-Trigger | `/api/cron/sales-coach/run` (CRON_SECRET bearer auth), `vercel.json` cron enabled at 15-min cadence, `triggeredBy: 'cron'` option on orchestrator with idle-run summary suppression | **✅ COMPLETE — May 12, 2026** |
| sales-coach-2.2 | Call-Type Classifier | New `classify.ts` (Claude Haiku 4.5, JSON output, 4 labels), replaces external-attendee filter, `call_type` column added to `sales_call_analyses`, only `sales` posts to Slack, re-analyze bypasses classifier, run-summary `Internal-only:` → `Non-sales:` | **✅ COMPLETE — May 13, 2026** |
| chat-activity-slack-1 | Chat Session Slack Notifications | `slack_thread_ts` column on `chat_sessions`, new `chat-activity-slack.ts` module (notifyChatStarted + notifyChatSummary), engine hooks on first-message + summary-persistence, new `GET /api/sessions/[id]` route + `?session=<id>` deep-link auto-select on dashboard sessions page, two new env vars (`CHAT_ACTIVITY_WORKSPACE_ID`, `SLACK_CHAT_ACTIVITY_CHANNEL`) | **✅ COMPLETE — May 15, 2026** |
| CLARA-1 | CE origins + booking regex | Shared `src/lib/cors.ts` (both public routes import it), `staging.jakevibes.dev` allowed, `CLARA_EXTRA_ALLOWED_ORIGINS` env list, `talk to a human` / `speak to a human` added to the hoisted `BOOKING_OFFER_REGEX` | **✅ COMPLETE — merged PR #1** |
| CLARA-2 | `brief_update` for CE `/ask` | New `src/types/brief.ts` (contract mirror) + `src/lib/chat/extract-brief.ts` (Haiku 4.5, coerce-or-drop, deterministic `strength`, spend gate), `brief_update` emitted in `processChatStream` before `done`, persisted to `chat_sessions.metadata.brief`, one new env var (`ASK_BRIEF_WORKSPACE_IDS`) | **✅ COMPLETE — Jul 30, 2026** |

## v1.1 Session 1 Features (Complete)
1. Deploy fixes — remotePatterns + maxDuration
2. Sliding window bump — 10 → 20 messages
3. Powered by Clara toggle in settings
4. Custom categories with combo input + extraction fix
5. Gap export as CSV
6. Improve with persistent revert
7. Session search across messages
8. Iframe-responsive public chat page
9. Bulk Q&A operations (delete/activate/categorize)
10. Test-this-pair similarity check

## v1.1 Session 2 Features (Complete)
1. File upload (.docx/.pdf) for transcript extraction — mammoth + pdf-parse
2. Gap auto-resolution on bulk save — 0.85 threshold, after() background processing
3. AI conversation summaries — ConversationSummary type, summarize lib, auto-trigger after 6 messages
4. Visitor intent cards on sessions page — IntentCard component, session list/detail integration
5. Sessions bug fix + UI polish
6. Flagged Questions rename (from Gaps) + bulk operations + URL update to /dashboard/gaps
7. Interview Guide Export — AI-powered founder interview guide with KB cross-referencing, xlsx export

## v1.1 Session 7A Features (Complete)
1. Streaming chat responses (SSE) — Real-time token streaming via Server-Sent Events, chatCompletionStream in provider.ts, processChatStream in engine.ts, frontend SSE handling in chat-window.tsx
2. Settings live preview panel — Real-time widget preview as settings change, 60/40 split layout on desktop, collapsible on tablet, hidden on mobile (removed in Session 8)
3. Onboarding wizard — 4-step full-screen wizard for new users (name bot, add knowledge, connect AI, preview), OnboardingGate wrapper in dashboard layout, progress tracking in workspace settings
4. Auto-resolve gaps on individual Q&A add — Triggers autoResolveGaps() via after() when single Q&A pair is created (not just bulk save)

## v1.1 Session 8 Features (Complete)
1. Side Whisper widget layout — Frosted glass panel that slides in from right edge, Shadow DOM isolation for style encapsulation, panel-chat.tsx component with backdrop blur
2. Command Bar widget layout — Spotlight-style overlay triggered by ⌘K shortcut, Shadow DOM injection via widget.js, centered modal with search-like UX
3. ~~LLM-generated suggestion chips~~ — **Removed in Session 9B**
4. Widget mode system — Chat route supports `?mode=panel` and `?mode=command` params, widget.js passes mode to iframe, WIDGET_LAYOUTS constant in workspace types
5. Landing page refresh — Widget layout showcase section with live demo, updated hero and feature presentation
6. Streaming summary debug logging — `[Summary Debug]` traces in engine.ts postProcess function for diagnosing AI summary generation in streaming path

## v1.1 Session 9A Features (Complete)
1. Email capture in chat engine — Regex extraction from user messages in postProcess (both streaming and non-streaming paths), stored once per session on visitor_email, fresh query to avoid overwriting
2. HubSpot contact sync — upsertHubSpotContact() in src/lib/integrations/hubspot.ts, batch upsert via REST API, gated by hubspot_enabled toggle, fail-silent with [HubSpot] log prefix
3. CORS on /api/chat — Allowlist-based origin headers (chatbot.jakevibes.dev, cloudemployee.com, cloudemployee.io, localhost), OPTIONS preflight handler, headers on all response paths
4. HubSpot settings toggle — hubspot_enabled boolean in WorkspaceSettings, toggle in AI tab under Integrations section, off by default

## v1.1 Session 9B Changes (Complete)
1. Suggestion chips removal — Fully removed LLM-generated suggestion chips from entire codebase: deleted suggestion-chips.tsx, removed generateFollowUpChips() from engine.ts, stripped chip rendering from widget.js (Command Bar + Side Whisper), chat-window.tsx, panel-chat.tsx, removed suggestion_chips_enabled/max_suggestion_chips from WorkspaceSettings, removed chips from ChatMessage/ChatResponse types, removed settings UI toggles from ai-tab.tsx
2. HubSpot lead_source fix — Changed from 'Clara Chatbot' (invalid dropdown value causing 400 errors) to 'Website' (standard HubSpot value) in hubspot.ts and both engine.ts paths
3. HubSpot sessionUrl deep link — Changed generic `/dashboard/sessions` to `/dashboard/sessions/${session.id}` for direct session linking in CRM
4. HubSpot debug logging — Added `[HubSpot Debug]` console.log statements across engine.ts and hubspot.ts to trace contact creation flow

## sales-coach-1 Changes (Complete)
1. `agent_prompts` table — workspace-scoped, slug-keyed generic prompt store with `agent_type` discriminator, content + metadata JSONB, slug format CHECK (`^[a-z0-9-]+$`), non-empty content CHECK, unique `(workspace_id, slug)`, RLS on workspace ownership, `set_updated_at` trigger, `idx_agent_prompts_workspace` index
2. Seed — `sales-coach` (generic, applies to all sales reps), agent_type `sales_coach`, full discovery-call coaching prompt with `{{company}}`/`{{attendees}}`/`{{transcript}}`/etc. placeholders for sales-coach-2 interpolation
3. Lib loader — `src/lib/agent-prompts/loader.ts` exposes `loadPromptContent` (60s in-process cache, throws on missing/inactive), `invalidatePrompt`, `listPrompts`, `getPromptBySlug`, `updatePrompt`. Cache invalidates on the editing instance immediately on update; other Vercel instances pick up changes within 60s
4. API routes — `GET /api/agent-prompts` lists for the authenticated user's workspace; `GET /api/agent-prompts/[slug]` returns the full prompt; `PATCH /api/agent-prompts/[slug]` updates editable fields with defensive type coercion and a 400 response on empty content. No POST/DELETE — new prompts seeded via SQL
5. Dashboard UI — `/dashboard/agent-settings/prompts` lists prompts in a table styled to match the Q&A pairs table (`bg-white shadow-sm`, `bg-ce-muted` header, mobile cards), `/dashboard/agent-settings/prompts/[slug]` is the editor (client component with name/description/content/active fields, `bg-ce-navy` save button matching settings page pattern). Both pages are `force-dynamic` server components with auth + workspace lookup. Next.js 16 Promise params syntax used throughout
6. Sidebar — Added flat `Agent Prompts` entry (Sparkles icon) directly above `Settings` in `src/components/sidebar.tsx`

## sales-coach-2 Changes (Complete)
1. `sales_call_analyses` table — per-call output store, UNIQUE `(workspace_id, fireflies_meeting_id)` idempotency key, status CHECK `(analyzed/failed/skipped)`, RLS on workspace ownership, `idx_..._workspace_created` + `idx_..._workspace_status` indexes. Failures do NOT insert — allows natural retry on next run.
2. Fireflies client — `src/lib/integrations/fireflies.ts` with `listRecentTranscripts(fromDate, limit)` and `getTranscriptDetail(id)`. Wraps GraphQL with bearer auth. Schema verified via 0.8 introspection: `transcripts.fromDate` accepted, `meeting_attendees { email, name, location }`, `analytics.speakers { name, duration, duration_pct, longest_monologue, questions, word_count }`. **Duration unit gotcha:** `transcript.duration` and `speaker.duration` are decimal minutes (not seconds); `longest_monologue` is seconds. Type comments document this; call sites multiply by 60 before formatting.
3. Slack bot client — `src/lib/integrations/slack-bot.ts` with `postParentMessage` and `postThreadReply`. Both use `chat.postMessage` with `unfurl_links: false`. Errors throw on `ok: false`.
4. Filter — `src/lib/agents/sales-coach/filter.ts` `shouldAnalyze()` is pure (no I/O). Returns `{ok: true, externalAttendees}` if at least one attendee email domain isn't in `teamDomains`; otherwise `{ok: false, reason: 'no_external_attendee' | 'no_attendees'}`.
5. Prompt builder — `src/lib/agents/sales-coach/build-prompt.ts`. **Three corrections vs brief draft:** (a) duration multiplied by 60 (minutes → seconds) before `formatDuration` runs, (b) rep prepended manually with `(rep)` annotation in `formatAttendees` because Fireflies' `meeting_attendees` omits the authenticated user, (c) `pickProspectDomain` picks the most-common external domain (not first-match) for multi-attendee prospect calls — exposed as a named export so the orchestrator can reuse for the `prospect_domain` column.
6. Orchestrator — `src/lib/agents/sales-coach/run.ts`. `runSalesCoach({workspaceId, reanalyzeMeetingId?})`. Auto-detects mode (zero rows → 7d/5 max, else 2d/20 max). Re-analyze branch deletes prior row, fetches single transcript, skips idempotency check. Per-transcript try/catch posts errors to `#clara-errors` but does NOT insert a row (natural retry). Run-complete summary always posts to `#sales-coach-test` at the end of the run. Claude call mirrors `extract-qa.ts` pattern: inline SDK, `claude-sonnet-4-6`, `max_tokens: 2000`. Thread reply truncates at 38500 chars with pointer to `claude_output`. `validateSalesCoachEnv()` exported separately for API route pre-flight.
7. Error helper — `src/lib/agents/sales-coach/post-error.ts` `postSalesCoachError({context, meetingId?, error})`. Structured message format, fail-silent on outer post failure.
8. API routes — `POST /api/agents/sales-coach/run` (auth-gated, pre-flights env vars returning 400 on missing, runs orchestrator inside `after()`, top-level after() catch posts to BOTH `#clara-errors` AND `#sales-coach-test` so the user's expected channel never goes silent). `POST /api/agents/sales-coach/reanalyze/[meetingId]` same shape with single-meeting orchestrator path. Both routes: `runtime = 'nodejs'`, `maxDuration = 300`, `dynamic = 'force-dynamic'`.
9. UI — `src/components/agent-prompts/sales-coach-actions.tsx` client component renders "Run Now" card above the prompt editor with success/error inline state. Conditionally rendered in `prompts/[slug]/page.tsx` when `prompt.slug === 'sales-coach'` — editor stays generic for all other slugs.
10. Cron stub — `vercel.json` records the cron schedule under an underscored key so it's a no-op for Vercel. Enabled in sales-coach-2.1 by moving to canonical `crons` key.

## sales-coach-2.1 Changes (Complete)
1. Cron-only route — `src/app/api/cron/sales-coach/run/route.ts`. GET handler, `CRON_SECRET` bearer auth (Vercel auto-injects header when env var is set), hardcoded `workspaceId` from `SALES_COACH_WORKSPACE_ID`, calls `runSalesCoach({workspaceId, triggeredBy: 'cron'})` inside `after()`. Failures post to `#clara-errors` only.
2. `triggeredBy` orchestrator option — `'manual' | 'cron'` (defaults to `'manual'`). On `'cron'` path, run-complete summary is suppressed unless `analyzed > 0` OR `failed > 0` OR `skipped_filter > 0` (any NEW activity). Prevents 96 idle-summary posts per day. Manual + reanalyze paths unchanged (always post summary).
3. `vercel.json` — moved cron from `_disabled_crons_example` to canonical `crons` key. Schedule `*/15 * * * *` (every 15 minutes, UTC). Path `/api/cron/sales-coach/run`.
4. `CRON_SECRET` env var — added to `.env.local` (local testing) and Vercel Production env vars only (NOT Preview/Development). Used by Vercel to authenticate cron invocations; we verify via constant string compare on `Authorization: Bearer <secret>` header.

## sales-coach-2.2 Changes (Complete)
1. `call_type` column — Added to `sales_call_analyses`: `TEXT`, nullable for pre-classifier rows, `CHECK (call_type IS NULL OR call_type IN ('sales','internal','recruitment','other'))`. New index `idx_sales_call_analyses_workspace_call_type` on `(workspace_id, call_type)`. Migration run manually in Supabase SQL editor (no migration files in repo).
2. Classifier module — `src/lib/agents/sales-coach/classify.ts` exports `classifyCall(detail, teamDomains)`. Uses Claude Haiku 4.5 (`claude-haiku-4-5-20251001`), system prompt defines the four labels for a B2B staffing context, user message contains title + duration + attendee list (with `[team]`/`[external]` tags) + first 30 sentences (capped at 3000 chars). Returns `{ call_type, reason }`. Throws on empty response, missing JSON, parse failure, or invalid label — caller posts to `#clara-errors` and skips the insert (natural retry on next run).
3. Orchestrator wiring — `run.ts` `processTranscript` now calls `classifyCall` instead of the deleted `shouldAnalyze` filter. Non-sales labels insert a `skipped` row with `call_type` populated and `error_message: null` (no longer an error condition), increment `skipped_filter`, NO Slack output. Sales label proceeds to the existing prompt-build → Claude → Slack → `analyzed` insert path; that row now also carries `call_type: 'sales'`.
4. Re-analyze bypass — `ProcessContext` gained a `skipClassifier?: boolean` flag. The re-analyze branch passes `skipClassifier: true`, treating the meeting as `sales` regardless of what the classifier would say. Rationale: re-analyze is an explicit user action, so the classifier must not silently drop the call.
5. Run-summary label — `postRunCompleteSummary` renamed `Internal-only:` to `Non-sales:` since `skipped_filter` now covers recruitment + other + internal, not just internal. Cron idle-run suppression logic unchanged.
6. Deletions — `src/lib/agents/sales-coach/filter.ts` removed entirely; `SalesCoachFilterInput`/`SalesCoachFilterResult` types removed from `src/types/sales-coach.ts`. New `CallType` union and `ClassifyResult` interface live there instead.

## chat-activity-slack-1 Changes (Complete)
1. `slack_thread_ts` column — Added to `chat_sessions`: `TEXT NULL`. Stores the Slack `ts` of the chat-activity parent message when the start notification fires. NULL for non-CE workspaces and for sessions whose start notification failed. No index needed — only read by primary-key session lookup. Migration run manually in Supabase SQL editor.
2. `chat-activity-slack.ts` module — `src/lib/integrations/chat-activity-slack.ts` exports `notifyChatStarted` and `notifyChatSummary`. Both gated on `workspaceId === CHAT_ACTIVITY_WORKSPACE_ID` AND `SLACK_BOT_TOKEN` + `SLACK_CHAT_ACTIVITY_CHANNEL` present. Parent message format: header with workspace display name, blockquoted first user message (truncated 200 chars + `…`), "View session →" link to `?session=<id>`. Thread reply format: intent, visitor email (with fallback to `chat_sessions.visitor_email`), paragraph summary, bulleted next steps (capped at 6), "View session →" link. Inline `postChatActivityError` helper mirrors `postSalesCoachError` shape — fail-silent on outer post failure.
3. Engine hooks — `src/lib/chat/engine.ts` imports `after` from `next/server` and the two notify functions. Three hooks total: (a) non-streaming start hook in `processChat` after the session upsert, gated on `context.existingSession === null`, wrapped in `after()` so it never blocks the user's response. (b) Streaming start hook in `processChatStream`'s `postProcess` after the upsert, gated the same way, called inline (the whole `postProcess` already runs inside `after()` via the route handler). (c) Streaming summary hook in `postProcess` immediately after the `metadata.summary` update succeeds. Non-streaming summary hook lives in `src/app/api/chat/route.ts` inside the existing summary `after()` block, after the metadata update.
4. Single-session API route — `src/app/api/sessions/[id]/route.ts` GET handler. Auth-gated, workspace-scoped (`eq('workspace_id', workspace.id)`). Returns the same shape as one entry in `GET /api/sessions`, with `message_count` enriched. Used by the dashboard sessions page to hydrate a deep-linked session that's not in the recent-list window.
5. Sessions page deep-link — `src/app/dashboard/sessions/page.tsx` reads `?session=<id>` from `window.location.search` inside a mount-time `useEffect` (no `useSearchParams` to avoid the Suspense-boundary requirement on a client-component root page). If the id is in the loaded list, auto-selects it; if not, fetches via `/api/sessions/[id]` and prepends to the list before selecting. Uses a `hydratedDeepLinkRef` to guard against re-running on subsequent renders.
6. Env vars — `CHAT_ACTIVITY_WORKSPACE_ID` (CE workspace UUID, same value as `SALES_COACH_WORKSPACE_ID` today but a separate var so the gates stay independent) and `SLACK_CHAT_ACTIVITY_CHANNEL` (channel ID). Reuses `SLACK_BOT_TOKEN`, `SLACK_ERRORS_CHANNEL`, `NEXT_PUBLIC_APP_URL`. Both added to `.env.local`; `SLACK_CHAT_ACTIVITY_CHANNEL` left blank locally so the feature stays off until the channel is created.
7. Accepted edge cases — Race on `slack_thread_ts` is theoretical only in practice (4-message threshold = multiple HTTP roundtrips); start-post failure → `slack_thread_ts` stays NULL → summary hook silently no-ops (the `#clara-errors` post is the signal); deep-linked session that doesn't exist or belongs to another workspace returns 404 and the sessions list loads normally with no selection.

## v1.1 Session 9C Changes (Complete)
1. Calendly metadata fix — Changed Supabase select from `summary` column to `metadata` column in handleCalendlyBooking(), updated extraction path to `metadata.summary.summary` matching how engine.ts stores summaries
2. Summary threshold lowered — SUMMARY_THRESHOLD changed from 6 to 4 messages (2 exchanges instead of 3) in engine.ts
3. Calendly lead_source — Changed from `'Website'` to `'Clara'` in handleCalendlyBooking() hubspotPayload to distinguish chatbot-originated bookings in HubSpot
4. Summary prompt rewrite — Rewrote summarize.ts system prompt for staffing sales context: visitor-focused client brief (not conversation recap), staffing-relevant intent examples, action items as next steps
5. Command Bar widget fixes — Added 16px margin below suggestion chips container, fixed scrollToBottom() to target `body` (cb-body, the actual scrollable parent with overflow-y: auto) instead of messagesContainer, added scrollToBottom() calls after addUserMessage() and addAssistantMessage() insertions

## Deployment Info
- **Production URL:** https://chatbot.jakevibes.dev
- **Vercel Project:** clara-chatbot (Cloud Employee team)
- **GitHub Repo:** galaxyfunk/clara-chatbot
- **Supabase Project:** clara-chatbot

## Post-Deploy Notes (Feb 23, 2026)
- Middleware updated to handle Edge runtime more robustly
- Supabase URL Configuration set: Site URL + redirect URLs for prod and localhost
- NEXT_PUBLIC_SUPABASE_URL must include `https://` prefix
- Auth working with email/password signup

## Build Process
1. Session briefs generated from scope doc (SHIP_BY_FRIDAY_V1_0.md) before each Claude Code session
2. 4 sessions total for v1.0 (18 steps)
3. Post-launch: audit codebase in fresh conversation before moving to v1.1
4. Update CHANGELOG.md and this file after each version ships

## Relationship to Insights Bank
Separate product. Separate repo, database, deployment, Claude Project. Future bridge API will push gap data to Insights Bank via REST call with shared secret. No database sharing, no shared auth. Not in v1.0 scope.
