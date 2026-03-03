# CHANGELOG.md — Clara Chatbot

Track of what shipped in each version. One paragraph per release.

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

**v1.1 Session 8 Complete.** Clara is live at https://chatbot.jakevibes.dev
