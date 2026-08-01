# CHANGELOG.md — Clara Chatbot

Track of what shipped in each version. One paragraph per release.

---

## CLARA-2 — `brief_update` for Cloud Employee's /ask page
**Status:** ✅ COMPLETE
**Date:** July 30, 2026

Cloud Employee's `/ask` page builds a structured hiring brief beside the conversation and had nothing to build it from — Clara emitted only `token`, `done` and `error`. This adds a per-turn extraction pass and one new SSE event, `brief_update`, enqueued after the token loop and before `done`. The **complete** brief goes over the wire every time rather than a patch: merging partials across a network is where drift and irreproducible bugs live, and a brief is a few hundred bytes. CE replaces wholesale when `version` increases and ignores anything stale. New `src/types/brief.ts` mirrors the contract from CE's `site/src/lib/ask/brief.ts` field-for-field (decision D3 — two hand-maintained copies, versioned payload, unknown fields ignorable). New `src/lib/chat/extract-brief.ts` is built in the image of `summarize.ts` but on Claude Haiku 4.5 rather than Sonnet, because it runs every meaningful turn instead of once per session; it carries an 8s timeout (`done` queues behind it), `maxRetries: 1`, `temperature: 0`, and never throws — a failed extraction costs the visitor nothing but a missing canvas update. Only fields the visitor actually stated are filled; every field is coerced or dropped, never repaired, because CE renders absent fields as dashed "Clara will ask next" prompts and a human reads this brief before a sales call. `strength` (0-100, CE treats 70+ as "brief ready") is computed from weighted field completeness in code, not asked of the model, because it drives a meter that must only climb as the visitor says more. The weighting encodes a sales rule agreed with the director: five **core** facts — role title, headcount, tech stack, seniority, timeline — are what a rep cannot run a call without, and they are worth exactly 70 between them, so a brief carrying all five is ready on their strength alone. The remaining **context** fields (goals, company, engagement, team, region, must-haves) total 30 and can never cross the line by themselves. Because weighting alone is not enough — a brief missing only seniority still reaches 85 — the score is additionally **capped at 69 while any core fact is absent**, so the one number crossing the wire carries the whole rule and CE needs no second check. Two deliberate calls inside that: `intent` scores nothing, because it is derived from the other fields rather than being something the visitor said and was inflating every brief by 15 for free; and `regions` is worth almost nothing, because Cloud Employee largely determines where staff come from, making a stated preference information rather than qualification. A `product_build` brief has no per-seat seniority, so `goals` stands in for it there. Extraction is skipped on turns that cannot move the brief (`shouldExtractBrief` rejects greetings, bare emails, and pure Q&A like "what are your terms?"), and an unchanged brief is still re-sent at its existing version so a client that reloaded mid-conversation repaints. Persisted to `chat_sessions.metadata.brief` via `persistBrief()`, which re-reads `metadata` immediately before writing so it cannot clobber the summary written earlier in the same turn — and is deliberately ordered after the summary block in `postProcess` for the same reason. Non-streaming path persists the brief in `after()` but does not add it to the JSON response: `/ask` uses streaming, so blocking every non-streaming reply on an extraction call would buy latency nobody reads. New env var `ASK_BRIEF_WORKSPACE_IDS` (comma-separated) restricts which workspaces spend app-level Anthropic credit; unset means all, so `/ask` works without configuration. One behavioural guard found in testing: correcting "3 React devs" down to 2 made the model relabel a four-person brief as `single_hire`, which would have swapped CE's team board for a one-person card — a brief describing more than one person is now forced to `team_hire` in code. Verified live against the CE workspace over three real turns (event order, version increment, spend gate, and `metadata.brief` coexisting with `metadata.summary`), with the test rows deleted afterwards. No widget changes; HubSpot and Calendly untouched (the existing Calendly webhook already closes that loop). `personality_prompt` — teaching Clara to *ask* one question at a time rather than *answer* — is a dashboard edit, not part of this change.

---

## Maintenance — Claude model IDs refreshed to the 4.5/4.6 generation
**Status:** ✅ COMPLETE
**Date:** July 30, 2026

App-level extraction calls (`summarize.ts`, `extract-qa.ts`, `improve-qa.ts`) were pinned to `claude-sonnet-4-20250514` and now use `claude-sonnet-4-6`. The user-facing model picker (`src/types/api-keys.ts`, plus the defaults in the API Keys tab and onboarding wizard) now offers Sonnet 4.6, Opus 4.5 and Haiku 4.5. Existing rows in `api_keys` keep whatever model ID they were saved with — this changes the menu and the app-level defaults, not stored user selections. No schema change.

---

## chat-activity-slack Session 1 — Live Chat Notifications in Slack
**Status:** ✅ COMPLETE
**Date:** May 15, 2026

Chat sessions on the CE workspace now post real-time activity into a public Slack channel so the team can see conversations as they happen without opening the dashboard. When a visitor sends their first message, a parent Slack message goes out with the workspace name in the header, the visitor's first message in a blockquote (truncated at 200 chars), and a "View session →" link pointing at `/dashboard/sessions?session=<id>`. The Slack `ts` returned by that post is stored on a new `slack_thread_ts` column on `chat_sessions`. When the AI summary later persists (at message 4 in streaming, message 6 in non-streaming, mirroring the existing thresholds), a thread reply lands under the same parent containing visitor intent, visitor email, the paragraph summary, and action-item bullets (capped at 6). New module `src/lib/integrations/chat-activity-slack.ts` exposes `notifyChatStarted` and `notifyChatSummary` — both gated on `CHAT_ACTIVITY_WORKSPACE_ID` (a new env var, independent of `SALES_COACH_WORKSPACE_ID` so the two features can decouple later) plus `SLACK_BOT_TOKEN` and `SLACK_CHAT_ACTIVITY_CHANNEL`. Fail-silent: hard errors mirror to `#clara-errors`; if the start post fails, `slack_thread_ts` stays NULL and the summary hook silently no-ops. Three engine hooks: non-streaming start uses `after()` inside `processChat` (after the session upsert, gated on `context.existingSession === null`); streaming start + summary hooks run inline within `processChatStream`'s `postProcess` (which is already wrapped in `after()` by the route handler). Non-streaming summary hook lives in `src/app/api/chat/route.ts` inside the existing summary `after()` block. New `GET /api/sessions/[id]` route supports the deep link by returning a single session — used by the dashboard sessions page (`src/app/dashboard/sessions/page.tsx`) to hydrate a deep-linked session that's not in the recent-list window. The page reads `?session=<id>` via `window.location.search` inside a mount-time `useEffect` (sidesteps the Suspense-boundary requirement that `useSearchParams` would impose on a client-component root page). DB migration (manual SQL): `ALTER TABLE chat_sessions ADD COLUMN slack_thread_ts TEXT NULL;`. Multi-tenant per-customer Slack config is explicitly out of scope — same gating pattern as Sales Coach.

---

## sales-coach Session 2.2 — Call-Type Classifier
**Status:** ✅ COMPLETE
**Date:** May 13, 2026

Shawnee's Fireflies key returns all of her recorded calls — sales, internal standups, recruitment interviews, vendor chats — so `#sales-coach-test` was getting coaching breakdowns for calls that aren't sales conversations. This change adds an LLM-powered classifier that audits every fetched call before analysis. New module `src/lib/agents/sales-coach/classify.ts` calls Claude Haiku 4.5 with a compact prompt (title, attendees tagged `[team]`/`[external]`, duration, first 30 transcript sentences capped at 3000 chars) and returns one of four labels: `sales | internal | recruitment | other`. Only the `sales` label proceeds to the existing coaching pipeline; the other three labels insert a `status='skipped'` row with the new `call_type` column populated and post NOTHING to Slack. The classifier replaces the previous external-attendee filter entirely — `src/lib/agents/sales-coach/filter.ts` is deleted along with its types. Schema change: added `call_type TEXT` column to `sales_call_analyses` (nullable for pre-classifier rows, CHECK constraint enforces the 4 values) plus an index on `(workspace_id, call_type)`. The re-analyze route bypasses the classifier (forces `sales`) since the user explicitly requested that meeting be processed. Run-summary label `Internal-only:` renamed to `Non-sales:` to reflect the broader meaning of `skipped_filter`. Classifier errors (parse failure, invalid label, missing API key) post to `#clara-errors` and skip the insert — same natural-retry behavior as other transcript-level failures.

---

## sales-coach Session 2.1 — Cron Auto-Trigger
**Status:** ✅ COMPLETE
**Date:** May 12, 2026

Sales Coach now runs automatically every 15 minutes via Vercel cron. New route `GET /api/cron/sales-coach/run` is bearer-auth'd with `CRON_SECRET` (Vercel auto-injects the header when the env var is set in the project). Hardcodes `workspaceId` from `SALES_COACH_WORKSPACE_ID` since cron has no user session. Shares the orchestrator with the manual Run Now button via a new `triggeredBy: 'manual' | 'cron'` option. On the cron path, the run-complete summary is suppressed unless there's NEW activity (analyzed > 0 OR failed > 0 OR skipped_filter > 0) — prevents 96 idle-summary posts per day to `#sales-coach-test`. The polling approach uses Shawnee's API key which already returns team-wide calls (verified during sales-coach-2 UI test), so this sidesteps Fireflies' per-owner webhook scope limitation. `vercel.json` moved cron from `_disabled_crons_example` to canonical `crons` key. `CRON_SECRET` lives in Vercel Production env only, not Preview/Development.

---

## sales-coach Session 2 — Engine
**Status:** ✅ COMPLETE
**Date:** May 12, 2026

Sales Coach engine shipped. Manual trigger via "Run Now" button on the Sales Coach prompt edit page → orchestrator fetches Shawnee's recent Fireflies calls (extended 7d/5 max on first run, standard 2d/20 max thereafter — auto-detected via `sales_call_analyses` row count) → filters for external attendees → loads the `sales-coach` prompt from `agent_prompts` → interpolates `{{company}}`/`{{attendees}}`/`{{transcript}}`/etc. → calls Claude Sonnet 4 (`max_tokens: 2000`) → posts parent message (call metadata + Fireflies link) + threaded coaching breakdown to `#sales-coach-test`. Failures post to `#clara-errors`. Every run posts a completion summary so the system confirms aliveness on empty runs. New table `sales_call_analyses` with `UNIQUE(workspace_id, fireflies_meeting_id)` idempotency key — `analyzed`/`skipped` rows persist, failures do NOT (allows natural retry next click). Re-analyze route deletes prior row + reprocesses single meeting. New libs: `src/lib/integrations/fireflies.ts` (GraphQL wrapper), `src/lib/integrations/slack-bot.ts` (chat.postMessage with threading), `src/lib/agents/sales-coach/{filter,build-prompt,run,post-error}.ts`. API routes: `POST /api/agents/sales-coach/run` and `POST /api/agents/sales-coach/reanalyze/[meetingId]` (both Node runtime, `maxDuration: 300`, `after()` background work with pre-flight env validation returning 400 on missing). UI: `SalesCoachActions` card rendered above the prompt editor when slug is `sales-coach`. Cron stubbed in `vercel.json` under an underscored key (disabled in v1; enabled in sales-coach-3). Single rep (Shawnee) hardcoded via env vars; multi-rep refactor deferred.

**Three fixes applied during implementation vs the draft brief:** (1) Fireflies `duration` field is decimal minutes, not seconds — verified via 0.8 introspection; type comments and prompt builder updated. (2) Fireflies' `meeting_attendees` excludes the authenticated user, so the rep is prepended manually with `(rep)` annotation in the prompt's `{{attendees}}` variable. (3) `pickProspectDomain` picks the most-common external domain (not first match) to handle multi-attendee prospect calls correctly.

---

## sales-coach Session 1 — Agent Prompts Foundation
**Status:** ✅ COMPLETE
**Date:** May 11, 2026

Added the `agent_prompts` table and the Agent Settings → Prompts UI. Generic, workspace-scoped prompt store keyed by `(workspace_id, slug)` and tagged with `agent_type` — usable by any future Clara agent without schema changes. Lib loader at `src/lib/agent-prompts/loader.ts` exposes `loadPromptContent` (60s in-process cache, throws on missing/inactive), `invalidatePrompt`, `listPrompts`, `getPromptBySlug`, `updatePrompt`. API surface is `GET /api/agent-prompts` and `GET/PATCH /api/agent-prompts/[slug]` — no POST/DELETE (new prompts are seeded via SQL). Dashboard pages at `/dashboard/agent-settings/prompts` (list, server component) and `/dashboard/agent-settings/prompts/[slug]` (editor, client component) styled with CE brand tokens to match the existing Q&A pairs table and settings page save button. New `Agent Prompts` flat entry added to the sidebar above Settings using the Sparkles icon. Seeded with the **Sales Coach** prompt for the CE workspace — generic discovery-call coaching template that applies to all sales reps, with `{{company}}`, `{{attendees}}`, `{{transcript}}`, etc. placeholders for interpolation by the engine in sales-coach-2. Foundation only — no Slack output, no Fireflies polling, no scheduled jobs (those land in sales-coach-2).

---

## v1.0 — Ship by Friday
**Status:** ✅ SHIPPED
**Deployed:** February 23, 2026
**URL:** https://chatbot.jakevibes.dev

### Session 1 — Foundation (Feb 22, 2026)
Project scaffolded with Next.js 14, TypeScript, Tailwind, and CE brand tokens. Supabase database configured with 5 tables (workspaces, api_keys, qa_pairs, chat_sessions, qa_gaps), pgvector extension, RLS policies, and chatbot-assets storage bucket. Auth system implemented with Supabase Auth (email/password), middleware protection, and auto-workspace creation on first login. All TypeScript types defined for workspace settings, Q&A pairs, chat messages/sessions, gaps, and API keys. Complete lib function layer built: AES-256-GCM encryption, OpenAI embeddings, multi-provider LLM abstraction (Anthropic/OpenAI), chat engine with RAG + gap detection + escalation, transcript extraction via Claude, Q&A improvement, and dedup checking.

### Session 2 — API Routes (Feb 22, 2026)
All 16 API route files built with 20 HTTP methods total. Q&A CRUD with dedup checking and auto-embedding on create/update. CSV import with overlap detection and papaparse. Transcript extraction via Claude Sonnet. Q&A improvement endpoint. Bulk save for imported/extracted pairs. API key management with provider validation, AES-256-GCM encryption, and secure GET responses (key_last4 only). Image upload to Supabase Storage. Gap review queue with resolve (creates Q&A pair) and dismiss. Session browser with message counts. Workspace settings with JSONB merge. Dashboard stats aggregation. Public chat endpoint calling the full RAG engine with rate limiting, gap detection, and escalation.

### Session 3 — Dashboard UI (Feb 22, 2026)
Complete dashboard UI built across 5 main sections. Dashboard home with stats cards (Q&A pairs, sessions, gaps, escalations). Knowledge base management with searchable table, add/edit modal, category filters, and import modal (CSV upload with overlap detection). Transcript extraction page with paste-or-upload flow, extraction preview, and bulk save. Gap review queue with accept/dismiss actions and "add to knowledge base" flow. Session browser with expandable conversation view showing full message history. Chat playground styled to match the widget with suggestion chips and escalation support. 5-tab settings panel (Content, Style, AI, API Keys, Embed) with unified save. Multiple bug fixes: transcript extraction max_tokens increased from 4096 to 16000, CSV import flexible column detection, API key model list updated with GPT-5 family and custom model option, dynamic suggestion chips now display after AI responses.

### Session 4 — Widget + Landing + Deploy (Feb 23, 2026)
Public chat route built at `/chat/[workspaceId]` for iframe embedding and direct links, reusing MessageBubble and SuggestionChips components. Public workspace settings API at `/api/workspace/public` returns only public-facing settings without auth. Floating widget script (`/public/widget.js`) creates chat bubble that opens iframe overlay, configurable position/colors, mobile-responsive full-screen mode. Embed tab updated with three options: script tag (floating bubble), iframe embed, and direct link — each with copy button. CE-branded landing page with "Meet Clara" hero, interactive chat preview, features section, how-it-works steps, and pricing preview. Deployed to Vercel at chatbot.jakevibes.dev. Post-deploy fixes: middleware updated for Edge runtime robustness, Supabase URL Configuration set for auth redirects.

---

## v1.1 Session 9A — CE Go-Live Infrastructure
**Status:** ✅ COMPLETE
**Date:** March 7, 2026

CE go-live infrastructure for production deployment. **Email capture** — regex extraction from visitor messages in postProcess, stored once per session on `visitor_email`. **HubSpot contact sync** — `upsertHubSpotContact()` via REST API batch upsert, gated by `hubspot_enabled` toggle + `HUBSPOT_API_KEY` env var, fail-silent with `[HubSpot]` log prefix, 500-char summary truncation. **CORS on /api/chat** — allowlist-based origin headers for cross-origin widget embedding (chatbot.jakevibes.dev, cloudemployee.com/io, localhost). **HubSpot settings toggle** — `hubspot_enabled` boolean in AI tab under Integrations section.

---

## v1.1 Session 9B — Cleanup + HubSpot Fixes
**Status:** ✅ COMPLETE
**Date:** March 8, 2026

**Suggestion chips fully removed** — stripped LLM-generated suggestion chips from the entire codebase. Deleted `suggestion-chips.tsx` component. Removed `generateFollowUpChips()` function and `FOLLOWUP_SYSTEM_PROMPT` from engine.ts. Removed chip rendering from widget.js (both Command Bar and Side Whisper Shadow DOM layouts), chat-window.tsx, panel-chat.tsx, and session-detail.tsx. Removed `suggestion_chips_enabled` and `max_suggestion_chips` from WorkspaceSettings type and defaults. Removed `suggestion_chips` from ChatMessage and ChatResponse types. Removed settings UI toggle and slider from ai-tab.tsx. Removed chip fields from public settings API response. ~570 lines deleted across 11 files.

**HubSpot fixes:** Changed `lead_source` from `'Clara Chatbot'` (invalid dropdown value causing 400 validation errors) to `'Website'` (standard HubSpot value). Fixed `sessionUrl` to deep-link to specific session (`/dashboard/sessions/${id}`) instead of generic list page. Added `[HubSpot Debug]` logging across engine.ts and hubspot.ts to trace contact creation flow.

---

## v1.1 Session 8 — Widget Layouts
**Status:** ✅ COMPLETE
**Date:** March 3, 2026

Alternative widget layouts using Shadow DOM for complete style isolation. **Side Whisper** — frosted glass panel that slides in from the right edge with backdrop blur effect, implemented in `panel-chat.tsx`. **Command Bar** — spotlight-style overlay triggered by ⌘K keyboard shortcut, centered modal with search-like UX (full implementation parked for future session). **LLM-generated suggestion chips** — AI now generates contextual follow-up questions after each response with fallback chain to matched Q&A pairs when generation fails. **Widget mode system** — chat route accepts `?mode=panel|command` parameter, `widget.js` updated to pass mode to iframe and handle Shadow DOM injection for each layout type. **Landing page refresh** — new widget layout showcase section with live demo. Settings preview panel removed — settings page now uses full-width layout. **Debug logging** — comprehensive `[Summary Debug]` logging added to streaming postProcess function to diagnose and verify AI summary generation; confirmed working correctly.

---

## v1.1 Session 7A — UX Polish
**Status:** ✅ COMPLETE
**Date:** March 2, 2026

Streaming chat responses via Server-Sent Events — tokens now appear in real-time instead of waiting for full LLM response. Added `chatCompletionStream()` for both Anthropic and OpenAI, `processChatStream()` in chat engine, and frontend SSE handling. Settings live preview panel shows widget changes in real-time without saving — 60/40 split layout on desktop, collapsible on tablet, hidden on mobile (removed in Session 8). Onboarding wizard guides new users through 4 steps: name bot, add knowledge, connect AI provider, preview chat. Full-screen overlay with progress tracking, skip functionality, and resume on reload. Auto-resolve gaps now triggers on individual Q&A add (not just bulk save) via `after()` background processing. Fixed streaming chat showing raw JSON instead of plain text.

---

## v1.1 Session 2 + Polish
**Status:** ✅ COMPLETE
**Date:** March 1, 2026

Intelligence features (docx/pdf upload, gap auto-resolution, conversation summaries, visitor intent cards), sessions bug fix, expandable knowledge base rows, Flagged Questions rename + bulk operations + URL update, chat playground dotted background, auto-resolve notification on extraction, and Interview Guide Export feature (AI-powered founder interview guide generation with knowledge base cross-referencing).

---

## v1.1 Session 9C — Calendly Fix + Summary Rewrite + Widget Polish
**Status:** ✅ COMPLETE
**Date:** March 10, 2026

**Calendly webhook metadata fix** — `handleCalendlyBooking()` was selecting the non-existent `summary` column from `chat_sessions`. Changed to select `metadata` and extract summary via `metadata.summary.summary`, matching how `engine.ts` actually stores AI summaries. **Summary threshold lowered** — `SUMMARY_THRESHOLD` reduced from 6 to 4 messages (triggers after 2 exchanges instead of 3). **Calendly lead_source** — Changed from `'Website'` to `'Clara'` in Calendly booking handler to distinguish chatbot-originated bookings in HubSpot CRM. **Summary prompt rewrite** — Rewrote the `summarize.ts` system prompt for staffing sales context: now produces a visitor-focused client brief (what they need, technical requirements, timeline, budget) rather than a generic conversation recap; uses staffing-relevant intent examples. **Command Bar widget fixes** — Added `marginBottom: 16px` below suggestion chips for spacing, fixed `scrollToBottom()` to target `body` (`cb-body` with `overflow-y: auto`) instead of `messagesContainer`, added `scrollToBottom()` calls in `addUserMessage()` and `addAssistantMessage()` so new messages are always visible.

---

**v1.1 Session 9C Complete.** Clara is live at https://chatbot.jakevibes.dev
