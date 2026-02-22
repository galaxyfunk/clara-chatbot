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
**Date:** TBD
**Steps:** 6–9
**Status:** ⏳ Next

*(Entry will be written after session completes)*
