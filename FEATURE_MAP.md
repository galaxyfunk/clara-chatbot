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

## Pending Features (Session 2+)

The following features have lib modules built but await API routes and UI:

| Feature | Lib Module | API Route | UI Page | Session |
|---------|------------|-----------|---------|---------|
| Chat API | `chat/engine.ts` | `/api/chat` | `/chat/[workspaceId]` | 2, 4 |
| Q&A CRUD | `chat/dedup.ts` | `/api/qa-pairs` | `/dashboard/knowledge` | 2, 3 |
| Transcript Extraction | `chat/extract-qa.ts` | `/api/qa-pairs/extract` | `/dashboard/knowledge/extract` | 2, 3 |
| Q&A Improvement | `chat/improve-qa.ts` | `/api/qa-pairs/improve` | `/dashboard/knowledge` | 2, 3 |
| API Key Management | `encryption.ts` | `/api/api-keys` | `/dashboard/settings` | 2, 3 |
| Gap Review | — | `/api/gaps` | `/dashboard/gaps` | 2, 3 |
| Session Browser | — | `/api/sessions` | `/dashboard/sessions` | 2, 3 |
| Dashboard Stats | — | `/api/dashboard/stats` | `/dashboard` | 2, 3 |
| Workspace Settings | — | `/api/workspace` | `/dashboard/settings` | 2, 3 |
| Image Upload | — | `/api/upload` | `/dashboard/settings` | 2, 3 |
