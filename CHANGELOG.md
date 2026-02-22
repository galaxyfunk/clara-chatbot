# CHANGELOG.md — Clara Chatbot

Track of what shipped in each version. One paragraph per release.

---

## v1.0 — Ship by Friday
**Status:** In Progress (Session 1 of 4 complete)
**Deadline:** Friday, February 27, 2026

### Session 1 — Foundation (Feb 22, 2026)
Project scaffolded with Next.js 14, TypeScript, Tailwind, and CE brand tokens. Supabase database configured with 5 tables (workspaces, api_keys, qa_pairs, chat_sessions, qa_gaps), pgvector extension, RLS policies, and chatbot-assets storage bucket. Auth system implemented with Supabase Auth (email/password), middleware protection, and auto-workspace creation on first login. All TypeScript types defined for workspace settings, Q&A pairs, chat messages/sessions, gaps, and API keys. Complete lib function layer built: AES-256-GCM encryption, OpenAI embeddings, multi-provider LLM abstraction (Anthropic/OpenAI), chat engine with RAG + gap detection + escalation, transcript extraction via Claude, Q&A improvement, and dedup checking.

*(Full entry will be written when v1.0 ships)*
