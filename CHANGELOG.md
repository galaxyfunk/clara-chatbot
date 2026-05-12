# CHANGELOG.md — Clara Chatbot

Track of what shipped in each version. One paragraph per release.

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
