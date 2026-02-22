# CHANGELOG.md — Clara Chatbot

Track of what shipped in each version. One paragraph per release.

---

## v1.0 — Ship by Friday
**Status:** In Progress (Session 2 of 4 complete)
**Deadline:** Friday, February 27, 2026

### Session 1 — Foundation (Feb 22, 2026)
Project scaffolded with Next.js 14, TypeScript, Tailwind, and CE brand tokens. Supabase database configured with 5 tables (workspaces, api_keys, qa_pairs, chat_sessions, qa_gaps), pgvector extension, RLS policies, and chatbot-assets storage bucket. Auth system implemented with Supabase Auth (email/password), middleware protection, and auto-workspace creation on first login. All TypeScript types defined for workspace settings, Q&A pairs, chat messages/sessions, gaps, and API keys. Complete lib function layer built: AES-256-GCM encryption, OpenAI embeddings, multi-provider LLM abstraction (Anthropic/OpenAI), chat engine with RAG + gap detection + escalation, transcript extraction via Claude, Q&A improvement, and dedup checking.

### Session 2 — API Routes (Feb 22, 2026)
All 16 API route files built with 20 HTTP methods total. Q&A CRUD with dedup checking and auto-embedding on create/update. CSV import with overlap detection and papaparse. Transcript extraction via Claude Sonnet. Q&A improvement endpoint. Bulk save for imported/extracted pairs. API key management with provider validation, AES-256-GCM encryption, and secure GET responses (key_last4 only). Image upload to Supabase Storage. Gap review queue with resolve (creates Q&A pair) and dismiss. Session browser with message counts. Workspace settings with JSONB merge. Dashboard stats aggregation. Public chat endpoint calling the full RAG engine with rate limiting, gap detection, and escalation.

*(Full entry will be written when v1.0 ships)*
