# FEATURE_MAP.md — Clara Chatbot

Maps every feature to its owning files. Organized by feature area.

---

## Authentication

### User Authentication
- **Description:** Email/password login and signup with Supabase Auth
- **Page:** `/login`
- **API Routes:** None (client-side Supabase Auth)
- **Components:** Login form in `src/app/login/page.tsx`
- **Lib Modules:** `src/lib/supabase/client.ts`, `src/lib/supabase/auth-server.ts`
- **DB Tables:** `auth.users` (Supabase managed)
- **Session:** 1

### Auth Middleware
- **Description:** Protects dashboard routes, redirects unauthenticated users
- **Page:** N/A
- **API Routes:** N/A
- **Components:** N/A
- **Lib Modules:** `src/middleware.ts`
- **DB Tables:** None
- **Session:** 1

### Auth Callback
- **Description:** Handles OAuth code exchange and redirects
- **Page:** N/A
- **API Routes:** `src/app/auth/callback/route.ts`
- **Components:** N/A
- **Lib Modules:** N/A
- **DB Tables:** None
- **Session:** 1

---

## Workspace Management

### Workspace Auto-Creation
- **Description:** Creates workspace automatically on first login
- **Page:** N/A (runs in dashboard layout)
- **API Routes:** None (server-side in layout)
- **Components:** N/A
- **Lib Modules:** `src/lib/workspace.ts`
- **DB Tables:** `workspaces`
- **Session:** 1

---

## Core Infrastructure

### Encryption
- **Description:** AES-256-GCM encryption for API keys
- **Page:** N/A
- **API Routes:** Used by api-keys routes (Session 2)
- **Components:** N/A
- **Lib Modules:** `src/lib/encryption.ts`
- **DB Tables:** `api_keys.encrypted_key`
- **Session:** 1

### Embeddings
- **Description:** OpenAI text-embedding-3-small vector generation
- **Page:** N/A
- **API Routes:** Used by qa-pairs and chat routes (Session 2)
- **Components:** N/A
- **Lib Modules:** `src/lib/embed.ts`
- **DB Tables:** `qa_pairs.embedding`
- **Session:** 1

### LLM Provider Abstraction
- **Description:** Multi-provider chat completion (Anthropic/OpenAI)
- **Page:** N/A
- **API Routes:** Used by chat route (Session 2)
- **Components:** N/A
- **Lib Modules:** `src/lib/llm/provider.ts`
- **DB Tables:** `api_keys` (for provider/model info)
- **Session:** 1

---

## Chat Engine

### Chat Processing
- **Description:** Full RAG pipeline with rate limiting, gap detection, escalation
- **Page:** N/A (used by chat API)
- **API Routes:** `/api/chat` (Session 2)
- **Components:** N/A
- **Lib Modules:** `src/lib/chat/engine.ts`
- **DB Tables:** `workspaces`, `qa_pairs`, `api_keys`, `chat_sessions`, `qa_gaps`
- **Session:** 1

### Q&A Deduplication
- **Description:** Checks for duplicate Q&A pairs before creation
- **Page:** N/A
- **API Routes:** `/api/qa-pairs` (Session 2)
- **Components:** N/A
- **Lib Modules:** `src/lib/chat/dedup.ts`
- **DB Tables:** `qa_pairs`
- **Session:** 1

---

## Transcript Extraction

### Extract Q&A from Transcript
- **Description:** Uses Claude to extract Q&A pairs from call transcripts
- **Page:** `/dashboard/knowledge/extract` (Session 3)
- **API Routes:** `/api/qa-pairs/extract` (Session 2)
- **Components:** TBD (Session 3)
- **Lib Modules:** `src/lib/chat/extract-qa.ts`
- **DB Tables:** `qa_pairs`
- **Session:** 1

### Improve Q&A Pair
- **Description:** Uses Claude to improve question/answer quality
- **Page:** `/dashboard/knowledge` (Session 3)
- **API Routes:** `/api/qa-pairs/improve` (Session 2)
- **Components:** TBD (Session 3)
- **Lib Modules:** `src/lib/chat/improve-qa.ts`
- **DB Tables:** `qa_pairs`
- **Session:** 1

---

## Type Definitions

### All Types
- **Description:** TypeScript interfaces for all data models
- **Files:**
  - `src/types/workspace.ts` — Workspace, WorkspaceSettings
  - `src/types/qa.ts` — QAPair, ExtractedQAPair, QAImportResult
  - `src/types/chat.ts` — ChatMessage, ChatSession, ChatRequest, ChatResponse
  - `src/types/gaps.ts` — QAGap, GapStatus, GapResolveRequest
  - `src/types/api-keys.ts` — LLMProvider, LLMModel, ApiKey, SUPPORTED_MODELS
- **Session:** 1

---

## Supabase Clients

### Client Factories
- **Description:** Three Supabase client types for different contexts
- **Files:**
  - `src/lib/supabase/server.ts` — Service role (bypasses RLS)
  - `src/lib/supabase/client.ts` — Browser client (respects RLS)
  - `src/lib/supabase/auth-server.ts` — SSR with user auth context
- **Session:** 1

---

## API Routes (Session 2)

### Chat Endpoint
- **Description:** Public chat endpoint calling full RAG pipeline with rate limiting, gap detection, escalation
- **API Route:** `src/app/api/chat/route.ts` — POST (public)
- **Lib Modules:** `src/lib/chat/engine.ts`
- **DB Tables:** `workspaces`, `qa_pairs`, `api_keys`, `chat_sessions`, `qa_gaps`
- **Session:** 2

### Q&A CRUD
- **Description:** List, create, update, delete Q&A pairs with dedup check and auto-embedding
- **API Routes:**
  - `src/app/api/qa-pairs/route.ts` — GET (list with filters) + POST (create with dedup)
  - `src/app/api/qa-pairs/[id]/route.ts` — PATCH (update, re-embed if question changed) + DELETE (soft delete)
- **Lib Modules:** `src/lib/chat/dedup.ts`, `src/lib/embed.ts`
- **DB Tables:** `qa_pairs`
- **Session:** 2

### Q&A Import & Extraction
- **Description:** CSV import, transcript extraction, AI improvement, bulk save
- **API Routes:**
  - `src/app/api/qa-pairs/import/route.ts` — POST (CSV with overlap detection)
  - `src/app/api/qa-pairs/extract/route.ts` — POST (transcript → Q&A via Claude)
  - `src/app/api/qa-pairs/improve/route.ts` — POST (AI improve single pair)
  - `src/app/api/qa-pairs/bulk-save/route.ts` — POST (save with sequential embedding)
- **Lib Modules:** `src/lib/chat/extract-qa.ts`, `src/lib/chat/improve-qa.ts`, `src/lib/embed.ts`
- **DB Tables:** `qa_pairs`
- **Dependencies:** papaparse
- **Session:** 2

### API Key Management
- **Description:** Encrypted storage of user LLM API keys with provider validation
- **API Routes:**
  - `src/app/api/api-keys/route.ts` — GET (key_last4 only) + POST (validate + encrypt)
  - `src/app/api/api-keys/[id]/route.ts` — PATCH (toggle default/active) + DELETE (hard delete)
- **Lib Modules:** `src/lib/encryption.ts`
- **DB Tables:** `api_keys`
- **Session:** 2

### Gap Review
- **Description:** Review queue for low-confidence questions flagged by chat engine
- **API Routes:**
  - `src/app/api/gaps/route.ts` — GET (queue with best match question)
  - `src/app/api/gaps/resolve/route.ts` — POST (create Q&A pair + update gap)
  - `src/app/api/gaps/dismiss/route.ts` — POST (mark as dismissed)
- **DB Tables:** `qa_gaps`, `qa_pairs`
- **Session:** 2

### Session Browser
- **Description:** List chat sessions with message counts
- **API Route:** `src/app/api/sessions/route.ts` — GET
- **DB Tables:** `chat_sessions`
- **Session:** 2

### Workspace Settings
- **Description:** Read and update workspace settings with JSONB merge
- **API Route:** `src/app/api/workspace/route.ts` — GET + PATCH (settings merge, not replace)
- **DB Tables:** `workspaces`
- **Session:** 2

### Dashboard Stats
- **Description:** Aggregate counts for dashboard overview
- **API Route:** `src/app/api/dashboard/stats/route.ts` — GET
- **DB Tables:** `qa_pairs`, `chat_sessions`, `qa_gaps`
- **Session:** 2

### Image Upload
- **Description:** Upload avatar/icon images to Supabase Storage
- **API Route:** `src/app/api/upload/route.ts` — POST
- **Storage:** `chatbot-assets` bucket
- **Session:** 2

---

## Dashboard UI (Session 3) ✅ Complete

| Feature | API Route | UI Page | Components |
|---------|-----------|---------|------------|
| Dashboard Home | `/api/dashboard/stats` | `/dashboard` | `stats-cards.tsx`, `recent-gaps.tsx`, `quick-actions.tsx` |
| Q&A Management | `/api/qa-pairs` | `/dashboard/knowledge` | `qa-pairs-table.tsx`, `add-qa-modal.tsx`, `import-modal.tsx` |
| Transcript Extraction | `/api/qa-pairs/extract` | `/dashboard/knowledge/extract` | `extraction-page.tsx` |
| Gap Review | `/api/gaps` | `/dashboard/gaps` | `gaps-list.tsx` |
| Session Browser | `/api/sessions` | `/dashboard/sessions` | `sessions-list.tsx` |
| Settings (5 tabs) | `/api/workspace`, `/api/api-keys`, `/api/upload` | `/dashboard/settings` | `content-tab.tsx`, `style-tab.tsx`, `ai-tab.tsx`, `api-keys-tab.tsx`, `embed-tab.tsx` |
| Chat Playground | `/api/chat` | `/dashboard/chat` | `chat-window.tsx`, `message-bubble.tsx` |

### Bug Fixes in Session 3
- Transcript extraction: max_tokens increased 4096 → 16000 (prevents JSON truncation)
- CSV import: flexible column names (question/questions/q, answer/answers/a/response)
- API keys: updated model list with GPT-5 family + custom model option
- ~~Suggestion chips: now display dynamically from AI responses~~ (removed in Session 9B)

## Widget (Session 4) ✅ Complete

| Feature | Description | Files | Session |
|---------|-------------|-------|---------|
| Public Chat Page | Widget iframe target | `/chat/[workspaceId]` | 4 |
| Widget Script | Floating bubble embed | `public/widget.js` | 4 |
| Landing Page | CE-branded with login CTA | `/` | 4 |

---

## v1.1 Session 2 + Polish Features ✅ Complete

### Interview Guide Export
- **Description:** AI-powered founder interview guide generation from flagged questions with KB cross-referencing
- **Page:** `/dashboard/gaps` (Export dropdown)
- **API Route:** `src/app/api/gaps/interview-guide/route.ts` — POST
- **Components:** Export dropdown in `src/app/dashboard/gaps/page.tsx`
- **Lib Modules:** `src/lib/llm/provider.ts`
- **DB Tables:** `qa_gaps`, `qa_pairs`, `api_keys`
- **Dependencies:** xlsx (SheetJS)
- **Session:** v1.1-2

### Bulk Gap Operations
- **Description:** Bulk dismiss and delete operations for flagged questions
- **Page:** `/dashboard/gaps`
- **API Route:** `src/app/api/gaps/bulk/route.ts` — PATCH
- **Components:** `src/components/gaps/gaps-bulk-action-bar.tsx`, `src/components/gaps/gap-card.tsx` (checkbox support)
- **DB Tables:** `qa_gaps`
- **Session:** v1.1-2

### Expandable Knowledge Base Rows
- **Description:** Click-to-expand rows showing full answer text in Q&A table
- **Page:** `/dashboard/knowledge`
- **Components:** `src/components/knowledge/qa-pairs-table.tsx`
- **Session:** v1.1-2

### Auto-Resolve Notification
- **Description:** Shows notification when extracted Q&A pairs auto-resolve open flagged questions
- **Page:** `/dashboard/knowledge/extract`
- **API Route:** `src/app/api/qa-pairs/bulk-save/route.ts` (returns autoResolvedCount)
- **Components:** Notification toast in extraction results
- **DB Tables:** `qa_gaps`
- **Session:** v1.1-2

### Chat Playground Dotted Background
- **Description:** Subtle dotted pattern background matching widget styling
- **Page:** `/dashboard/chat`
- **Components:** `src/app/dashboard/chat/page.tsx`
- **Session:** v1.1-2

### File Upload for Extraction
- **Description:** Support for .docx and .pdf file uploads in transcript extraction
- **Page:** `/dashboard/knowledge/extract`
- **Lib Modules:** `src/lib/files/parse.ts`
- **Dependencies:** mammoth, pdf-parse v1.1.1
- **Session:** v1.1-2

### AI Conversation Summaries
- **Description:** Auto-generated summaries with topics, sentiment, and action items
- **Page:** `/dashboard/sessions`
- **API Route:** `src/app/api/sessions/summarize/route.ts` — POST
- **Components:** IntentCard in sessions list/detail
- **Lib Modules:** `src/lib/chat/summarize.ts`, `src/lib/chat/engine.ts` (postProcess with debug logging)
- **DB Tables:** `chat_sessions.metadata` (contains summary, summarized_at)
- **Debug:** `[Summary Debug]` logs in engine.ts postProcess function trace upsert, threshold check, and summary generation
- **Session:** v1.1-2

---

## v1.1 Session 7A Features ✅ Complete

### Streaming Chat Responses (SSE)
- **Description:** Real-time token streaming via Server-Sent Events for instant feedback
- **Page:** `/dashboard/chat`, `/chat/[workspaceId]`
- **API Route:** `src/app/api/chat/route.ts` — POST (supports both streaming and non-streaming)
- **Components:** `src/components/chat/chat-window.tsx` (SSE client handling)
- **Lib Modules:** `src/lib/llm/provider.ts` (chatCompletionStream), `src/lib/chat/engine.ts` (processChatStream, prepareChatContext)
- **DB Tables:** `chat_sessions`, `qa_gaps`
- **Session:** v1.1-7A

### Settings Live Preview Panel (Removed)
- **Description:** Real-time widget preview showing settings changes before saving
- **Page:** `/dashboard/settings`
- **Status:** Removed in Session 8 — settings page now uses full-width layout
- **Session:** v1.1-7A (removed v1.1-8)

### Onboarding Wizard
- **Description:** 4-step full-screen wizard guiding new users through setup
- **Page:** `/dashboard/*` (overlay on all dashboard pages)
- **API Route:** `src/app/api/workspace` (PATCH for saving progress), `src/app/api/qa-pairs`, `src/app/api/api-keys`, `src/app/api/chat`
- **Components:** `src/components/onboarding/onboarding-wizard.tsx`, `src/components/onboarding/onboarding-gate.tsx`
- **Lib Modules:** N/A
- **DB Tables:** `workspaces.settings.onboarding_completed_steps`
- **Types:** `OnboardingStepRecord` in `src/types/workspace.ts`
- **Session:** v1.1-7A

### Auto-Resolve Gaps on Individual Q&A Add
- **Description:** Triggers gap auto-resolution when a single Q&A pair is added (not just bulk save)
- **Page:** N/A (background process)
- **API Route:** `src/app/api/qa-pairs/route.ts` — POST (calls autoResolveGaps via after())
- **Components:** N/A
- **Lib Modules:** `src/lib/chat/auto-resolve-gaps.ts`
- **DB Tables:** `qa_gaps`, `qa_pairs`
- **Session:** v1.1-7A

---

## v1.1 Session 8 Features ✅ Complete

### Side Whisper Widget Layout
- **Description:** Frosted glass panel that slides in from right edge with Shadow DOM style isolation
- **Page:** `/chat/[workspaceId]?mode=panel`
- **API Route:** N/A (uses existing chat API)
- **Components:** `src/components/chat/panel-chat.tsx`
- **Lib Modules:** N/A
- **Public Assets:** `public/widget.js` (Shadow DOM injection)
- **DB Tables:** `workspaces.settings.widget_layout`
- **Types:** `WIDGET_LAYOUTS` constant in `src/types/workspace.ts`
- **Session:** v1.1-8

### Command Bar Widget Layout
- **Description:** Spotlight-style overlay triggered by ⌘K shortcut with Shadow DOM injection
- **Page:** `/chat/[workspaceId]?mode=command`
- **API Route:** N/A (uses existing chat API)
- **Components:** Uses `ChatWindow` (command-specific component parked for future)
- **Public Assets:** `public/widget.js` (Shadow DOM injection, keyboard shortcut handling)
- **DB Tables:** `workspaces.settings.widget_layout`
- **Session:** v1.1-8

### ~~LLM-Generated Suggestion Chips~~ (REMOVED in Session 9B)
- **Description:** ~~Contextual follow-up questions generated by AI after each response with fallback chain~~
- **Status:** Fully removed in Session 9B. Deleted `suggestion-chips.tsx`, removed `generateFollowUpChips()` from engine.ts, stripped chip rendering from widget.js/chat-window.tsx/panel-chat.tsx, removed `suggestion_chips_enabled`/`max_suggestion_chips` from WorkspaceSettings, removed from ChatMessage/ChatResponse types
- **Session:** v1.1-8 (added), v1.1-9B (removed)

### Widget Mode System
- **Description:** Chat route supports mode parameter for different widget layouts
- **Page:** `/chat/[workspaceId]` (accepts `?mode=panel|command|default`)
- **API Route:** N/A
- **Components:** `src/app/chat/[workspaceId]/page.tsx` (mode switching logic)
- **Public Assets:** `public/widget.js` (passes mode param to iframe)
- **Types:** `widget_layout` field in `WorkspaceSettings`
- **Session:** v1.1-8

### Landing Page Widget Showcase
- **Description:** Updated landing page with widget layout showcase and live demo section
- **Page:** `/` (landing page)
- **Components:** `src/app/page.tsx`
- **Session:** v1.1-8

---

## v1.1 Session 9A Features ✅ Complete

### Email Capture
- **Description:** Extracts email from visitor messages via regex and stores on chat_sessions.visitor_email (one-time per session)
- **Page:** N/A (background process in chat engine)
- **API Route:** `src/app/api/chat/route.ts` (runs in postProcess via after())
- **Components:** N/A
- **Lib Modules:** `src/lib/chat/engine.ts` (extractEmail helper, email capture block in postProcess)
- **DB Tables:** `chat_sessions.visitor_email`
- **Session:** v1.1-9A

### HubSpot Contact Sync
- **Description:** Upserts HubSpot contact when visitor shares email in chat, gated by hubspot_enabled toggle
- **Page:** N/A (background process)
- **API Route:** N/A (triggered from engine.ts postProcess)
- **Components:** N/A
- **Lib Modules:** `src/lib/integrations/hubspot.ts` (upsertHubSpotContact)
- **Types:** `src/types/integrations.ts` (HubSpotContactPayload)
- **DB Tables:** `workspaces.settings.hubspot_enabled`
- **Env Vars:** `HUBSPOT_API_KEY`
- **Session:** v1.1-9A

### CORS on Chat API
- **Description:** Allowlist-based CORS headers on /api/chat for cross-origin widget embedding
- **Page:** N/A
- **API Route:** `src/app/api/chat/route.ts` (OPTIONS handler + CORS headers on all responses)
- **Components:** N/A
- **Allowed Origins:** chatbot.jakevibes.dev, cloudemployee.com, cloudemployee.io, localhost:3000
- **Session:** v1.1-9A

### HubSpot Settings Toggle
- **Description:** hubspot_enabled boolean toggle in workspace settings UI
- **Page:** `/dashboard/settings` (AI tab → Integrations section)
- **API Route:** `src/app/api/workspace` (PATCH via settings merge)
- **Components:** `src/components/settings/ai-tab.tsx` (toggle under Integrations heading)
- **Types:** `hubspot_enabled` in `WorkspaceSettings` (`src/types/workspace.ts`)
- **Session:** v1.1-9A

---

## v1.1 Session 9B Changes ✅ Complete

### Suggestion Chips Removal
- **Description:** Complete removal of LLM-generated suggestion chips from entire codebase
- **Files Deleted:** `src/components/chat/suggestion-chips.tsx`
- **Files Modified:** `src/lib/chat/engine.ts`, `public/widget.js`, `src/components/chat/chat-window.tsx`, `src/components/chat/panel-chat.tsx`, `src/components/settings/ai-tab.tsx`, `src/components/sessions/session-detail.tsx`, `src/types/workspace.ts`, `src/types/chat.ts`, `src/app/chat/[workspaceId]/page.tsx`, `src/app/api/workspace/public/route.ts`
- **Session:** v1.1-9B

### HubSpot lead_source Fix
- **Description:** Changed `lead_source` from `'Clara Chatbot'` (invalid HubSpot dropdown value) to `'Website'`
- **Files Modified:** `src/lib/integrations/hubspot.ts`, `src/lib/chat/engine.ts` (both streaming and non-streaming paths)
- **Session:** v1.1-9B

### HubSpot Session Deep Link
- **Description:** Changed `sessionUrl` from generic `/dashboard/sessions` to `/dashboard/sessions/${session.id}` for direct CRM linking
- **Files Modified:** `src/lib/chat/engine.ts` (both paths)
- **Session:** v1.1-9B

### HubSpot Debug Logging
- **Description:** Added `[HubSpot Debug]` console.log statements to trace contact creation flow
- **Files Modified:** `src/lib/chat/engine.ts`, `src/lib/integrations/hubspot.ts`
- **Session:** v1.1-9B
