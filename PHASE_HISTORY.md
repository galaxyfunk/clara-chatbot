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
**Date:** TBD
**Steps:** 10–14
**Status:** ⏳ Next

*(Entry will be written after session completes)*
