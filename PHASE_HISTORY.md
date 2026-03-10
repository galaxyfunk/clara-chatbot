# PHASE_HISTORY.md — Clara Chatbot

Detailed record of what each session/phase built. More detailed than CHANGELOG.

---

## v1.0 Session 1 — Foundation
**Date:** February 22, 2026
**Steps:** 1–5
**Status:** ✅ Complete

### What Was Built

**Step 1: Project Scaffolding**
- Next.js 14 project with TypeScript, Tailwind, ESLint, App Router
- CE brand tokens in tailwind.config.ts (ce-navy, ce-lime, ce-teal, ce-surface, ce-muted, etc.)
- Dependencies: @supabase/ssr, @supabase/supabase-js, @anthropic-ai/sdk, openai, lucide-react, uuid
- Documentation files: CLAUDE.md, CONVENTIONS.md, CHANGELOG.md
- Clara logo SVGs in public/

**Step 2: Supabase Setup**
- 5 tables created with full schema (workspaces, api_keys, qa_pairs, chat_sessions, qa_gaps)
- pgvector extension enabled
- IVFFlat index on qa_pairs.embedding
- search_qa_pairs RPC function for semantic search
- set_updated_at trigger function on all tables
- RLS policies for workspace isolation
- chatbot-assets storage bucket with upload/read/delete policies
- Auth configured: Site URL, redirect URLs, email auth enabled

**Step 3: Auth + Login + Dashboard Layout**
- Supabase client factories: server.ts (service role), client.ts (browser), auth-server.ts (SSR)
- Middleware protecting /dashboard/* routes
- Auth callback route for code exchange
- Login page with email/password (sign up + sign in modes)
- Dashboard layout with auth check and workspace ensure
- ensureWorkspace() function for auto-creating workspace on first login
- Placeholder dashboard and landing pages

**Step 4: Type Definitions**
- `src/types/workspace.ts` — Workspace, WorkspaceSettings, DEFAULT_WORKSPACE_SETTINGS
- `src/types/qa.ts` — QAPair, QASource, QAImportResult, ExtractedQAPair, TranscriptExtractionResult, DEFAULT_CATEGORIES
- `src/types/chat.ts` — ChatMessage, ChatSession, ChatRequest, ChatResponse
- `src/types/gaps.ts` — QAGap, GapStatus, GapResolveRequest
- `src/types/api-keys.ts` — LLMProvider, LLMModel, SUPPORTED_MODELS, ApiKey, ApiKeyFormData

**Step 5: All Lib Functions**
- `src/lib/encryption.ts` — AES-256-GCM encrypt/decrypt with getEncryptionKey()
- `src/lib/embed.ts` — generateEmbedding() using OpenAI text-embedding-3-small
- `src/lib/llm/provider.ts` — chatCompletion() with Anthropic and OpenAI support
- `src/lib/chat/dedup.ts` — checkForDuplicate() for Q&A similarity check
- `src/lib/chat/engine.ts` — processChat() with full RAG pipeline, rate limiting, gap detection, escalation, idempotency
- `src/lib/chat/extract-qa.ts` — extractQAPairsFromTranscript() using Claude Sonnet
- `src/lib/chat/improve-qa.ts` — improveQAPair() for Q&A refinement

### Files Created

```
src/
├── app/
│   ├── auth/callback/route.ts
│   ├── dashboard/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── login/page.tsx
│   └── page.tsx
├── lib/
│   ├── chat/
│   │   ├── dedup.ts
│   │   ├── engine.ts
│   │   ├── extract-qa.ts
│   │   └── improve-qa.ts
│   ├── llm/
│   │   └── provider.ts
│   ├── supabase/
│   │   ├── auth-server.ts
│   │   ├── client.ts
│   │   └── server.ts
│   ├── embed.ts
│   ├── encryption.ts
│   └── workspace.ts
├── types/
│   ├── api-keys.ts
│   ├── chat.ts
│   ├── gaps.ts
│   ├── qa.ts
│   └── workspace.ts
└── middleware.ts
```

### Key Patterns Established
- Three Supabase clients for different contexts (server/client/auth)
- Type definitions before lib functions that use them
- Lib function structure: private helpers first, main export last
- AES-256-GCM encryption with iv:authTag:ciphertext format
- Sequential embedding generation (never Promise.all)
- Chat engine with RAG, rate limiting, gap detection, escalation
- Idempotency via message_id deduplication

### Data State
- Database: 5 empty tables ready for data
- Storage: chatbot-assets bucket ready for uploads
- Auth: Working email/password authentication
- Workspaces: Auto-created on first login

### Git Commits
1. `feat: project scaffolding with CE brand tokens and docs`
2. `feat: auth, supabase clients, login page, dashboard layout with workspace ensure`
3. `feat: all TypeScript type definitions`
4. `feat: all lib functions - encryption, embed, LLM provider, chat engine, extraction, improve, dedup`

---

## v1.0 Session 2 — API Routes
**Date:** February 22, 2026
**Steps:** 6–9
**Status:** ✅ Complete

### What Was Built

**Step 6: Q&A CRUD Routes**
- `GET /api/qa-pairs` — List pairs with search, category, active_only filters
- `POST /api/qa-pairs` — Create pair with dedup check (0.95 threshold) + auto-embed
- `PATCH /api/qa-pairs/[id]` — Update pair, re-embed if question changes
- `DELETE /api/qa-pairs/[id]` — Soft delete (is_active = false)

**Step 7: Q&A Import + Extraction Routes**
- Installed papaparse for CSV parsing
- `POST /api/qa-pairs/import` — CSV import with overlap detection (0.85 threshold)
- `POST /api/qa-pairs/extract` — Transcript extraction via Claude Sonnet
- `POST /api/qa-pairs/improve` — AI Q&A improvement via Claude
- `POST /api/qa-pairs/bulk-save` — Save multiple pairs with sequential embedding

**Step 8: Supporting Routes**
- `GET/POST /api/api-keys` — List keys (key_last4 only), add key with provider validation
- `PATCH/DELETE /api/api-keys/[id]` — Toggle default/active, hard delete
- `POST /api/upload` — Image upload to Supabase Storage (avatar/icon)
- `GET /api/gaps` — Gap queue with status filter and best match question
- `POST /api/gaps/resolve` — Create Q&A pair + update gap status
- `POST /api/gaps/dismiss` — Mark gap as dismissed
- `GET /api/sessions` — Session list with message counts
- `GET/PATCH /api/workspace` — Read/update workspace settings (merge, not replace)
- `GET /api/dashboard/stats` — Aggregate counts (pairs, sessions, gaps, escalations)

**Step 9: Chat Endpoint**
- `POST /api/chat` — Public endpoint calling processChat() with full RAG pipeline
- Validates workspace_id, session_token, message
- 2000 character message limit
- maxDuration = 30 for Vercel

### Files Created

```
src/app/api/
├── chat/
│   └── route.ts                    POST (public)
├── qa-pairs/
│   ├── route.ts                    GET + POST
│   ├── [id]/
│   │   └── route.ts                PATCH + DELETE
│   ├── import/
│   │   └── route.ts                POST
│   ├── extract/
│   │   └── route.ts                POST
│   ├── improve/
│   │   └── route.ts                POST
│   └── bulk-save/
│       └── route.ts                POST
├── api-keys/
│   ├── route.ts                    GET + POST
│   └── [id]/
│       └── route.ts                PATCH + DELETE
├── upload/
│   └── route.ts                    POST
├── gaps/
│   ├── route.ts                    GET
│   ├── resolve/
│   │   └── route.ts                POST
│   └── dismiss/
│       └── route.ts                POST
├── sessions/
│   └── route.ts                    GET
├── workspace/
│   └── route.ts                    GET + PATCH
└── dashboard/
    └── stats/
        └── route.ts                GET
```

**Total: 16 route files, 20 HTTP methods**

### Key Patterns Established
- Auth helper pattern: createAuthClient() for user, createServerClient() for data
- API key validation with live provider test before saving
- Never return encrypted_key — only key_last4 in responses
- maxDuration exports for long-running routes (30-120s)
- Sequential embedding in bulk operations (for loop, never Promise.all)
- Settings merge (not replace) for workspace updates
- Soft delete for Q&A pairs, hard delete for API keys

### Data State
- All API routes functional
- Chat endpoint ready to receive messages
- Full RAG pipeline connected end-to-end

### Git Commits
1. `feat: Q&A CRUD routes - GET/POST qa-pairs, PATCH/DELETE qa-pairs/[id]`
2. `feat: Q&A import, extraction, improve, and bulk-save routes`
3. `feat: api-keys, upload, gaps, sessions, workspace, stats routes`
4. `feat: chat endpoint - Clara speaks! Full flow verified`

---

## v1.0 Session 3 — Dashboard UI
**Date:** February 22, 2026
**Steps:** 10–14
**Status:** ✅ Complete

### What Was Built

**Step 10: Dashboard Home**
- Stats cards showing total Q&A pairs, chat sessions, open gaps, escalations
- Recent gaps widget with quick accept/dismiss
- Quick actions for common tasks
- Skeleton loading states

**Step 11: Knowledge Base Management**
- Searchable Q&A pairs table with category filters
- Add/edit Q&A modal with category dropdown
- Delete confirmation with soft delete
- CSV import modal with file upload and paste option
- Overlap detection preview before bulk save

**Step 12: Transcript Extraction**
- Full extraction page at `/dashboard/knowledge/extract`
- Paste or upload transcript flow
- Claude-powered extraction with progress indicator
- Preview extracted pairs with edit capability
- Bulk save with sequential embedding

**Step 13: Supporting Pages**
- Gap review queue with accept (creates Q&A pair) and dismiss actions
- Session browser with expandable conversation view
- Full message history display with timestamps

**Step 14: Settings + Chat Playground**
- 5-tab settings panel:
  - Content: display name, welcome message, suggested messages, placeholder, booking URL
  - Style: primary color, bubble color, bubble position, avatar/icon upload
  - AI: personality prompt (resizable textarea), confidence threshold, max chips, escalation toggle
  - API Keys: add/delete keys, set default, custom model support
  - Embed: workspace ID display, embed code snippets
- Unified save button with loading state
- Chat playground styled to match widget
- Suggestion chips (initial + dynamic from AI responses)
- Escalation message display

### Bug Fixes

1. **Transcript Extraction Truncation**
   - Problem: Large transcripts caused JSON parse errors
   - Cause: max_tokens was 4096, Claude's response got cut off
   - Fix: Increased max_tokens to 16000 in `src/lib/chat/extract-qa.ts`

2. **CSV Import Column Names**
   - Problem: Import failed with "question and answer are required"
   - Cause: User's CSV had "questions"/"answers" (plural)
   - Fix: Added flexible column detection in `src/app/api/qa-pairs/import/route.ts`

3. **API Key Model List**
   - Problem: Outdated models, no GPT-5 options
   - Fix: Updated `src/types/api-keys.ts` with GPT-5 family + custom model option

4. **Dynamic Suggestion Chips**
   - Problem: Only initial chips displayed, not AI-generated ones
   - Fix: Updated `src/components/chat/chat-window.tsx` to store and display `suggestion_chips` from API response

### Files Created

```
src/app/dashboard/
├── page.tsx                    Dashboard home
├── knowledge/
│   ├── page.tsx                Q&A management
│   └── extract/
│       └── page.tsx            Transcript extraction
├── gaps/
│   └── page.tsx                Gap review
├── sessions/
│   └── page.tsx                Session browser
├── chat/
│   └── page.tsx                Chat playground
└── settings/
    └── page.tsx                5-tab settings

src/components/
├── dashboard/
│   ├── stats-cards.tsx
│   ├── recent-gaps.tsx
│   └── quick-actions.tsx
├── knowledge/
│   ├── qa-pairs-table.tsx
│   ├── add-qa-modal.tsx
│   └── import-modal.tsx
├── gaps/
│   └── gaps-list.tsx
├── sessions/
│   └── sessions-list.tsx
├── settings/
│   ├── content-tab.tsx
│   ├── style-tab.tsx
│   ├── ai-tab.tsx
│   ├── api-keys-tab.tsx
│   └── embed-tab.tsx
└── chat/
    ├── chat-window.tsx
    ├── message-bubble.tsx
    └── suggestion-chips.tsx
```

### Key Patterns Established
- Component data arrays for repeated UI (cards, nav items)
- Skeleton variants for async loading states
- Modal pattern with form state management
- Flexible input detection for user-provided data
- Custom model option in dropdown with text input fallback
- Dynamic chip display from API responses

### Data State
- Full dashboard functional end-to-end
- Chat playground working with RAG + suggestion chips
- Settings saving correctly with JSONB merge
- API key validation with live provider test

### Git Commits
1. `feat: dashboard UI - stats, knowledge, gaps, sessions, settings, chat`
2. `fix: transcript extraction, CSV import, and API key improvements`
3. `fix: make personality prompt textarea larger and resizable`
4. `fix: display dynamic suggestion chips from AI responses`

---

## v1.0 Session 4 — Widget + Landing + Deploy
**Date:** February 23, 2026
**Steps:** 15–18
**Status:** ✅ Complete

### What Was Built

**Step 15: Public Chat Route**
- `/chat/[workspaceId]` — Public chat page serving as widget iframe target
- Loads workspace settings on init, renders chat window with full styling

**Step 16: Widget Script + Embed Tab**
- `public/widget.js` — Embeddable script that creates floating bubble + iframe
- Bubble respects `bubble_color` and `bubble_position` from settings
- Embed tab in settings shows copy-paste snippet

**Step 17: Landing Page**
- CE-branded landing page at `/`
- Login CTA routing to `/login`

**Step 18: Deploy**
- Deployed to Vercel at chatbot.jakevibes.dev
- Auth configured for production (site URL, redirect URLs)
- Middleware hardened for Edge runtime
- E2E flow verified: signup → add Q&A → chat → widget embed

### Deployment Notes
- `NEXT_PUBLIC_SUPABASE_URL` must include `https://` prefix
- Middleware updated for Edge runtime compatibility
- Auth callback working with email/password signup

### Git Commits
- Widget, landing page, and deployment commits (exact messages in git log)

---

## v1.1 Session 2 + Polish
**Date:** March 1, 2026
**Status:** ✅ Complete

### Features Built

1. **File Upload for Transcript Extraction**
   - Support for .docx (mammoth) and .pdf (pdf-parse v1.1.1) files
   - Drag-and-drop or click-to-upload interface
   - File parsing in extraction page with runtime = 'nodejs'

2. **Gap Auto-Resolution on Bulk Save**
   - When Q&A pairs are saved, checks for matching open gaps (0.85 similarity threshold)
   - Uses `after()` from next/server for background processing
   - Auto-updates gap status to 'resolved' with best_match_id

3. **AI Conversation Summaries**
   - ConversationSummary type with summary, topics, sentiment, actionItems
   - Summarize lib using app-level Claude key
   - Auto-triggers after 6+ messages in a session
   - POST /api/sessions/summarize endpoint

4. **Visitor Intent Cards**
   - IntentCard component showing conversation insights
   - Session list and detail integration
   - Displays summary, topics, sentiment, action items

5. **Sessions Bug Fix**
   - Fixed onConflict in chat engine to use column names vs constraint name
   - Session display and message rendering corrected

6. **Expandable Knowledge Base Rows**
   - Q&A pairs table rows expand to show full answer text
   - Click-to-expand pattern instead of full-text display

7. **Flagged Questions Rename + Bulk Operations**
   - Renamed "Gaps" to "Flagged Questions" throughout UI
   - URL changed to /dashboard/gaps (kept for routing simplicity)
   - Bulk dismiss and delete operations with selection checkboxes
   - PATCH /api/gaps/bulk route for batch operations
   - GapsBulkActionBar component

8. **Chat Playground Dotted Background**
   - Added subtle dotted pattern to chat playground
   - Matches widget styling for consistency

9. **Auto-Resolve Notification on Extraction**
   - Shows notification when extracted Q&A pairs auto-resolve open gaps
   - Feedback loop for users saving new knowledge

10. **Interview Guide Export**
    - Export dropdown with 3 options: Questions Only, Interview Guide Only, Questions + Interview Guide
    - AI-powered interview guide generation using user's LLM key (BYOK)
    - Cross-references existing knowledge base to identify coverage gaps
    - Clusters flagged questions into 4-8 logical themes
    - Generates interview prompts, edge cases, escalation triggers per question
    - Excel export with Master Question List and Interview Guide sheets
    - POST /api/gaps/interview-guide route with xlsx package

### Bugs Fixed

1. **Sessions onConflict Column Names**
   - Problem: Upsert was failing with constraint name instead of column names
   - Fix: Changed onConflict to use proper column list

2. **pdf-parse v2 → v1.1.1 Downgrade**
   - Problem: pdf-parse v2 had ESM compatibility issues with Turbopack
   - Fix: Downgraded to v1.1.1, using `pdf-parse/lib/pdf-parse.js` import path

3. **Anthropic SDK Timeout 120s**
   - Problem: Interview guide generation was timing out for large requests
   - Fix: Added `timeout: 120000` to Anthropic client initialization in provider.ts

### Key Decisions

1. **Rename Gaps → Flagged Questions**
   - More user-friendly terminology
   - "Gaps" was confusing for non-technical users
   - Kept /dashboard/gaps URL for routing simplicity

2. **BYOK for Interview Guide**
   - Uses user's own LLM API key for interview guide generation
   - Consistent with rest of application (user brings own key)
   - No additional cost to platform

3. **Expandable Rows over Full-Text Display**
   - Knowledge base table shows truncated answers
   - Click to expand for full text
   - Better UX for scanning many pairs

4. **Excel Download over Google Sheets**
   - Interview guide exports as .xlsx file
   - No auth required for Google Sheets API
   - Works offline, user owns the file
   - Uses xlsx (SheetJS) package

### Files Created/Modified

```
Created:
├── src/app/api/gaps/bulk/route.ts
├── src/app/api/gaps/interview-guide/route.ts
├── src/components/gaps/gaps-bulk-action-bar.tsx

Modified:
├── src/app/dashboard/gaps/page.tsx (bulk operations, export dropdown)
├── src/app/dashboard/knowledge/extract/page.tsx (file upload, auto-resolve notification)
├── src/app/dashboard/chat/page.tsx (dotted background)
├── src/app/api/qa-pairs/bulk-save/route.ts (auto-resolve logic)
├── src/components/gaps/gap-card.tsx (checkbox support)
├── src/lib/llm/provider.ts (120s timeout)
├── src/lib/files/parse.ts (pdf-parse fix)
├── package.json (xlsx dependency)
```

### Git Commits
1. `feat: sessions bug fix, UI polish, rename Gaps to Flagged Questions`
2. `fix: use dynamic import for pdf-parse to resolve Turbopack ESM issue`
3. `feat: Interview Guide Export + v1.1 Session 2 polish complete`

---

## v1.1 Session 7A — UX Polish
**Date:** March 2, 2026
**Status:** ✅ Complete

### Features Built

1. **Streaming Chat Responses (SSE)**
   - Real-time token streaming via Server-Sent Events
   - `chatCompletionStream()` in `src/lib/llm/provider.ts` — supports Anthropic + OpenAI streaming
   - `processChatStream()` in `src/lib/chat/engine.ts` — wraps LLM stream in SSE format
   - `prepareChatContext()` helper extracted for shared pre-LLM logic
   - Frontend SSE handling in `src/components/chat/chat-window.tsx`
   - SSE events: `token` (content chunks), `done` (metadata), `error` (failures)
   - `after()` for post-processing (gap detection, session upsert)
   - Non-streaming fallback preserved for backward compatibility

2. **Settings Live Preview Panel**
   - `src/components/settings/settings-preview.tsx` — mini widget preview component
   - Real-time updates as settings change (no save required to see preview)
   - Shows avatar, display_name, primary_color, bubble_color, welcome_message, suggested_messages
   - Sample conversation with user/assistant messages
   - "Unsaved" badge when hasUnsavedChanges is true
   - Responsive layout:
     - Desktop (lg+): 60/40 split layout, preview always visible
     - Tablet (md-lg): Collapsible via eye icon toggle
     - Mobile: Preview hidden
   - Preview hidden for non-visual tabs (API Keys, Embed)

3. **Onboarding Wizard**
   - `OnboardingStepRecord` type added to `src/types/workspace.ts`
   - `onboarding_completed_steps` field in WorkspaceSettings
   - `src/components/onboarding/onboarding-wizard.tsx` — full-screen 4-step wizard
   - `src/components/onboarding/onboarding-gate.tsx` — conditional wrapper
   - Integrated in `src/app/dashboard/layout.tsx`
   - **Step 1 (Name Bot):** display_name + welcome_message
   - **Step 2 (Add Knowledge):** CSV upload, transcript extraction, or manual Q&A
   - **Step 3 (Connect AI):** Provider selection cards, API key input, test button
   - **Step 4 (Preview):** Mini chat window to test the bot
   - Progress bar with step indicators
   - Skip functionality per step (marks as 'skipped' vs 'completed')
   - Resumes at first incomplete step on reload
   - z-index 50+ to overlay entire dashboard
   - Branded header with CE colors (#213D66)

4. **Auto-Resolve Gaps on Individual Q&A Add**
   - Updated `src/app/api/qa-pairs/route.ts` POST handler
   - Calls `autoResolveGaps(workspaceId)` via `after()` after successful insert
   - Same behavior as bulk-save — checks all open gaps against all active pairs
   - Background processing doesn't block API response

### Files Created

```
src/components/onboarding/
├── onboarding-wizard.tsx      (930 lines)
└── onboarding-gate.tsx        (79 lines)

src/components/settings/
└── settings-preview.tsx       (170 lines)
```

### Files Modified

```
src/lib/llm/provider.ts        — Added chatCompletionStream(), streamAnthropic(), streamOpenAI()
src/lib/chat/engine.ts         — Added processChatStream(), prepareChatContext()
src/app/api/chat/route.ts      — SSE streaming support with after() post-processing
src/app/api/qa-pairs/route.ts  — after() call to autoResolveGaps on POST
src/components/chat/chat-window.tsx — Frontend SSE handling
src/app/dashboard/settings/page.tsx — Split layout, preview integration
src/app/dashboard/layout.tsx   — OnboardingGate wrapper
src/types/workspace.ts         — OnboardingStepRecord, onboarding_completed_steps
```

### Key Patterns Established

1. **SSE Streaming Pattern:**
   - Return `{ stream, postProcess }` from engine
   - `stream` is `ReadableStream<Uint8Array>` with SSE-formatted chunks
   - `postProcess` is async closure for background work
   - API route calls `after(postProcess)` before returning stream response

2. **Onboarding Gate Pattern:**
   - Wrapper component fetches workspace on mount
   - Checks if all 4 steps completed/skipped
   - Renders wizard overlay if incomplete, children if done
   - Full-screen overlay with z-50 to cover sidebar

3. **Settings Preview Pattern:**
   - Preview receives current (unsaved) settings as props
   - Updates instantly as user changes form inputs
   - Hidden for non-visual tabs
   - Responsive visibility via Tailwind breakpoints

### Git Commits
1. `feat: streaming chat responses via Server-Sent Events`
2. `feat: settings live preview panel with unsaved state indicator`
3. `feat: onboarding wizard for new users`
4. `fix: auto-resolve gaps on individual Q&A add`
5. `fix: streaming chat shows plain text instead of raw JSON`
6. `feat: onboarding wizard UX polish — branded header, provider cards, better layout`

---

## v1.1 Session 8 — Widget Layouts
**Date:** March 3, 2026
**Status:** ✅ Complete

### Features Built

1. **Side Whisper Widget Layout**
   - Frosted glass panel that slides in from right edge
   - Shadow DOM isolation for complete style encapsulation
   - `src/components/chat/panel-chat.tsx` component with backdrop blur effect
   - Supports `?mode=panel` param in chat route

2. **Command Bar Widget Layout**
   - Spotlight-style overlay triggered by ⌘K keyboard shortcut
   - Shadow DOM injection via `public/widget.js`
   - Centered modal with search-like UX
   - Supports `?mode=command` param in chat route

3. **LLM-Generated Suggestion Chips** *(Removed in Session 9B)*
   - AI generates contextual follow-up questions after each response
   - `generateFollowUpChips()` function in `src/lib/chat/engine.ts`
   - Fallback chain to matched Q&A pairs when LLM generation fails
   - Integrated into streaming response flow
   - **Note:** Fully removed in Session 9B — all chip code, components, types, and settings deleted

4. **Widget Mode System**
   - Chat route accepts `?mode=panel|command|default` parameter
   - `widget.js` updated to pass mode to iframe
   - `WIDGET_LAYOUTS` constant in `src/types/workspace.ts`
   - `widget_layout` field in WorkspaceSettings

5. **Landing Page Widget Showcase**
   - New section showcasing widget layout options
   - Live demo integration
   - Updated hero and feature presentation

6. **Streaming Summary Debug Logging**
   - Comprehensive `[Summary Debug]` logging added to postProcess function
   - Traces: message count, threshold check, upsert result, summary generation, metadata update
   - Located in `src/lib/chat/engine.ts` lines 514-583
   - Confirmed AI summaries working correctly in streaming path

### Files Created

```
src/components/chat/
└── panel-chat.tsx              (Side Whisper component)
```

### Files Modified

```
src/lib/chat/engine.ts          — generateFollowUpChips(), [Summary Debug] logging in postProcess
src/app/chat/[workspaceId]/page.tsx — Mode switching logic (panel/command/default)
public/widget.js                — Shadow DOM injection, mode param handling, ⌘K shortcut
src/types/workspace.ts          — WIDGET_LAYOUTS constant, widget_layout field
src/app/page.tsx                — Landing page widget showcase section
src/app/dashboard/settings/page.tsx — Removed preview panel, full-width layout
```

### Key Patterns Established

1. **Shadow DOM Widget Injection:**
   - Create shadow root on target container
   - Inject iframe inside shadow DOM for style isolation
   - Handle keyboard shortcuts (⌘K) at document level

2. **Widget Mode Param Pattern:**
   - Chat route reads `mode` from searchParams
   - Renders different component based on mode value
   - Widget script passes mode to iframe src

3. **LLM Chip Generation with Fallback:**
   - Try LLM generation first
   - On failure, fall back to matched Q&A pair questions
   - Filter out duplicate/similar chips

4. **Debug Logging Pattern:**
   - Use `[FeatureName Debug]` prefix for easy grep
   - Log at key decision points (threshold check, API calls, results)
   - Include relevant context (IDs, counts, success/error states)

### Git Commits
1. `feat: LLM-generated contextual suggestion chips with fallback chain`
2. `feat: shadow DOM Side Whisper with real frosted glass backdrop blur`
3. `feat: command bar widget — shadow DOM spotlight overlay with ⌘K shortcut`
4. `feat: refresh landing page with widget layout showcase + live demo`
5. `fix: session previews, streaming summaries, escalation threshold`

---

## v1.1 Session 9A — CE Go-Live Infrastructure
**Date:** March 7, 2026
**Status:** ✅ Complete

### Features Built

1. **Email Capture in Chat Engine**
   - `extractEmail()` helper in `src/lib/chat/engine.ts` — regex extraction from user messages
   - Runs in `postProcess` for both streaming and non-streaming paths
   - Stores first detected email on `chat_sessions.visitor_email` (one-time write per session)
   - Fresh query before write to avoid overwriting existing email

2. **HubSpot Contact Sync**
   - `src/types/integrations.ts` — `HubSpotContactPayload` interface
   - `src/lib/integrations/hubspot.ts` — `upsertHubSpotContact()` using HubSpot REST API batch upsert
   - Idempotent by email (upsert, not create) — safe to call multiple times
   - Gated by `settings.hubspot_enabled` toggle + `HUBSPOT_API_KEY` env var
   - Fail-silent with `[HubSpot]` log prefix — never blocks chat flow
   - Summary truncated to 500 chars for CRM field limits

3. **CORS on /api/chat**
   - Allowlist-based `ALLOWED_ORIGINS` array (chatbot.jakevibes.dev, cloudemployee.com, cloudemployee.io, localhost:3000)
   - `getCorsHeaders()` helper returns origin-matched headers
   - `OPTIONS` preflight handler returning 204
   - CORS headers added to all response paths (streaming, non-streaming, validation errors, server errors)

4. **HubSpot Settings Toggle**
   - `hubspot_enabled: boolean` added to `WorkspaceSettings` interface + defaults (false)
   - Toggle in AI tab under new "Integrations" section with border separator
   - Added to public chat page `fullSettings` object literal to prevent type error

### Files Created

```
src/types/integrations.ts                — HubSpotContactPayload interface
src/lib/integrations/hubspot.ts          — upsertHubSpotContact() function
```

### Files Modified

```
src/types/workspace.ts                   — Added hubspot_enabled to WorkspaceSettings + defaults
src/lib/chat/engine.ts                   — extractEmail() helper, email capture + HubSpot blocks in both paths
src/app/api/chat/route.ts                — CORS headers, OPTIONS handler, getCorsHeaders()
src/components/settings/ai-tab.tsx       — HubSpot toggle under Integrations section
src/app/chat/[workspaceId]/page.tsx      — hubspot_enabled in fullSettings literal
```

### Key Patterns Established

1. **Integration Gating Pattern:**
   - Feature toggle in workspace settings (`hubspot_enabled`)
   - Environment variable for API key (`HUBSPOT_API_KEY`)
   - Both must be truthy for integration to fire
   - Dynamic import (`await import()`) to avoid loading integration code when disabled

2. **Email Capture Pattern:**
   - Regex extraction from user message text
   - One-time write per session (check before write)
   - Runs in background `postProcess`, never blocks response

3. **CORS Allowlist Pattern:**
   - Static array of allowed origins
   - Helper function returns origin-specific headers
   - Applied to all response paths including errors

### Git Commits
1. `feat: add hubspot integration types and hubspot_enabled to WorkspaceSettings`
2. `feat: add hubspot integration lib with upsert function`
3. `feat: add email capture to engine postProcess with hubspot trigger`
4. `fix: add CORS headers to chat API route`
5. `feat: add hubspot_enabled toggle to workspace settings UI`
6. `fix: add cloudemployee.io to CORS allowed origins`

---

## v1.1 Session 9B — Cleanup + HubSpot Fixes
**Date:** March 8, 2026
**Status:** ✅ Complete

### Changes Made

1. **Suggestion Chips Removal**
   - Fully removed LLM-generated suggestion chips from entire codebase (~570 lines deleted)
   - Deleted `src/components/chat/suggestion-chips.tsx`
   - Removed `generateFollowUpChips()` function, `FOLLOWUP_SYSTEM_PROMPT`, and `Anthropic` SDK import from engine.ts
   - Removed `suggestion_chips` from SSE `done` events, `ChatMessage`, and `ChatResponse` types
   - Removed `suggestion_chips_enabled` and `max_suggestion_chips` from `WorkspaceSettings` interface and defaults
   - Removed chip toggle and slider from ai-tab.tsx settings UI
   - Removed chip rendering from widget.js (Command Bar + Side Whisper Shadow DOM), chat-window.tsx, panel-chat.tsx, session-detail.tsx
   - Removed chip fields from public settings API response and public chat page
   - Simplified `parseLLMResponse()` signature (no longer needs settings parameter)

2. **HubSpot lead_source Fix**
   - Changed `lead_source` from `'Clara Chatbot'` to `'Website'` in 3 locations
   - `'Clara Chatbot'` was not a valid HubSpot dropdown option, causing 400 validation errors
   - Fixed in: hubspot.ts (default), engine.ts non-streaming path, engine.ts streaming postProcess path

3. **HubSpot sessionUrl Deep Link**
   - Changed `sessionUrl` from generic `/dashboard/sessions` to `/dashboard/sessions/${upsertedSession.id}`
   - Enables direct deep-linking from HubSpot CRM to the specific conversation
   - Fixed in both streaming and non-streaming paths in engine.ts

4. **HubSpot Debug Logging**
   - Added `[HubSpot Debug]` console.log statements at 6 points across engine.ts and hubspot.ts
   - Traces: hubspot_enabled flag, email extraction, API key presence, upsert call, API response

### Files Deleted

```
src/components/chat/suggestion-chips.tsx
```

### Files Modified

```
src/lib/chat/engine.ts                   — Chip removal + HubSpot fixes + debug logging
src/lib/integrations/hubspot.ts          — lead_source fix + debug logging
public/widget.js                         — Chip removal (Command Bar + Side Whisper)
src/components/chat/chat-window.tsx      — Chip removal
src/components/chat/panel-chat.tsx       — Chip removal
src/components/settings/ai-tab.tsx       — Chip toggle/slider removal
src/components/sessions/session-detail.tsx — Chip display removal
src/types/workspace.ts                   — suggestion_chips_enabled, max_suggestion_chips removal
src/types/chat.ts                        — suggestion_chips removal from ChatMessage/ChatResponse
src/app/chat/[workspaceId]/page.tsx      — Chip fields removal from PublicSettings/fullSettings
src/app/api/workspace/public/route.ts    — Chip fields removal from public API response
```

### Git Commits
1. `feat: remove suggestion chips from entire codebase`
2. `feat: add HubSpot debug logging to trace contact creation flow`
3. `fix: change HubSpot lead_source from Clara Chatbot to Website`
4. `fix: HubSpot sessionUrl deep link with session ID`