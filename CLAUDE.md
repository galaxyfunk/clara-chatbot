# CLAUDE.md — Clara Chatbot Project

## What Clara Is
Clara is a standalone, multi-tenant AI chatbot SaaS product. Users sign up, add Q&A pairs to a knowledge base, configure their own LLM provider (bring your own key), customize the chatbot's appearance and personality, and deploy it on their website via an embeddable widget. Built by Cloud Employee as both a production tool and a free open-source giveaway.

**Product name:** Clara
**Default agent name:** Clara (users can rename in settings)
**Tagline:** "Your AI-Powered Chatbot, Built in Minutes"

## Current Version
**v1.1: IN PROGRESS** — Session 2 of 3 complete (Feb 28, 2026)

**v1.0: DEPLOYED** — Live at https://chatbot.jakevibes.dev (Feb 23, 2026)
- Dashboard app at chatbot.jakevibes.dev
- Auth, Q&A management, chat engine, gap detection, suggestion chips, smart escalation
- Embeddable widget (iframe + floating bubble via `<script>` tag)
- 5 tabs settings with save button
- Styled chat playground
- CE-branded landing page
- 4 sessions, 18 build steps — ALL COMPLETE

## Codebase
- **Repo:** ce-chatbot (GitHub)
- **Database:** Supabase (standalone project — not shared with any other product)
- **Storage:** Supabase Storage (chatbot-assets bucket)
- **Deploy:** Vercel → chatbot.jakevibes.dev

## Tech Stack
| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router, TypeScript) |
| Database | Supabase (Postgres + pgvector) |
| Storage | Supabase Storage |
| Styling | Tailwind CSS |
| Auth | Supabase Auth (Google OAuth + email/password) |
| AI — Chat | Multi-provider (Claude API + OpenAI API) — user's key |
| AI — Embeddings | OpenAI text-embedding-3-small — app-level key |
| AI — Extraction | Claude Sonnet — app-level key |
| Encryption | AES-256-GCM (Node.js crypto) |
| Hosting | Vercel |

## Database Tables (5)
1. **workspaces** — One per user. Settings JSONB stores content (display_name, welcome_message, suggested_messages, placeholder_text, booking_url), style (primary_color, bubble_color, bubble_position, avatar_url, chat_icon_url), and AI config (personality_prompt, confidence_threshold, max_suggestion_chips, escalation_enabled).
2. **api_keys** — User LLM API keys encrypted with AES-256-GCM. Fields: provider, model, encrypted_key, key_last4, label, is_default, is_active.
3. **qa_pairs** — Knowledge base. Fields: question, answer, category, embedding (vector 1536d), source (manual/csv_import/transcript_extraction), is_active, metadata.
4. **chat_sessions** — Conversation logs. session_token (client UUID), messages (JSONB array with message_id per message), escalated flag.
5. **qa_gaps** — Low-confidence questions flagged for review. Fields: question, ai_answer, best_match_id, similarity_score, status (open/resolved/dismissed).

## Key API Routes
| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| /api/chat | POST | Public | Main chat endpoint (workspace_id identifies) |
| /api/qa-pairs | GET/POST | Auth | Q&A CRUD with dedup check |
| /api/qa-pairs/[id] | PATCH/DELETE | Auth | Update/soft-delete pair |
| /api/qa-pairs/import | POST | Auth | CSV bulk import with overlap detection |
| /api/qa-pairs/extract | POST | Auth | Transcript → Q&A via Claude |
| /api/qa-pairs/improve | POST | Auth | AI improve single pair |
| /api/qa-pairs/bulk-save | POST | Auth | Save extracted/imported pairs |
| /api/qa-pairs/bulk-action | POST | Auth | Bulk delete/activate/categorize pairs |
| /api/qa-pairs/test-match | POST | Auth | Test question similarity against knowledge base |
| /api/api-keys | GET/POST | Auth | List/add encrypted keys |
| /api/api-keys/[id] | PATCH/DELETE | Auth | Update/delete key |
| /api/workspace | GET/PATCH | Auth | Read/update workspace settings |
| /api/upload | POST | Auth | Avatar/icon image upload |
| /api/gaps | GET | Auth | Gap review queue |
| /api/gaps/resolve | POST | Auth | Promote gap → Q&A pair |
| /api/gaps/dismiss | POST | Auth | Dismiss gap |
| /api/sessions | GET | Auth | Chat session browser |
| /api/sessions/summarize | POST | Auth | Generate AI summary for a session |
| /api/dashboard/stats | GET | Auth | Dashboard aggregate stats |

## Pages (10)
| Route | Purpose |
|-------|---------|
| / | Landing page (CE-branded, login CTA) |
| /login | Supabase Auth UI |
| /dashboard | Stats overview, recent gaps, quick actions |
| /dashboard/knowledge | Q&A pair management (table, add, edit, import) |
| /dashboard/knowledge/extract | Transcript extraction flow |
| /dashboard/gaps | Gap review queue |
| /dashboard/sessions | Conversation browser |
| /dashboard/chat | Chat playground (styled to match widget) |
| /dashboard/settings | 5 tabs: Content, Style, AI, API Keys, Embed |
| /chat/[workspaceId] | Public chat page (widget iframe target) |

## Architecture Rules
- Everything TypeScript — no Python
- Single Vercel deployment — frontend + API routes
- App Router only — no Pages Router
- All logic in /lib — API routes are thin wrappers
- Workspace isolation on every query
- Sequential embedding generation (no Promise.all)
- Two API key layers: app-level (env vars) + user-level (encrypted in DB)
- Message IDs for chat idempotency
- Q&A dedup check before creation (> 0.95 similarity)
- Gap dedup before insertion (same question check)
- Dynamic display name — never hardcode "Clara", use settings.display_name
- Category normalization — lowercase + trim via getMergedCategories() helper
- Bulk operations — verify workspace ownership, validate categories, single atomic UPDATE
- Iframe detection — window.self !== window.top, postMessage for resize
- File parsing — mammoth for .docx, pdf-parse/lib/pdf-parse.js for .pdf (requires runtime = 'nodejs')
- Background work — use after() from next/server, never void asyncFn()
- AI summaries — app-level Claude key, trigger after 6+ messages

## Version Roadmap
| Version | Focus | Status |
|---------|-------|--------|
| v1.0 | Core Product + Widget + Deploy | **✅ SHIPPED — Feb 23, 2026** |
| v1.1 | Polish + Intelligence + Integrations (18 features, 3 sessions) | **IN PROGRESS — 2/3 sessions complete** |
| v1.2 | Channel Integrations (Slack, Telegram, WhatsApp) | Future |
| v1.3 | Analytics + Reporting | Future |
| Bridge | Insights Bank one-way API push | Future |

## v1.0 Build Sessions
| Session | Focus | Steps | Day | Status |
|---------|-------|-------|-----|--------|
| 1 | Setup + DB + Auth + Types + All Lib Functions | 1–5 | Mon | ✅ COMPLETE |
| 2 | All API Routes | 6–9 | Tue | ✅ COMPLETE |
| 3 | All Dashboard UI | 10–14 | Wed–Thu | ✅ COMPLETE |
| 4 | Widget + Landing + Deploy | 15–18 | Thu–Fri | ✅ COMPLETE |

## v1.1 Build Sessions
| Session | Focus | Features | Status |
|---------|-------|----------|--------|
| 5 (v1.1-1) | Quick Wins + Infrastructure | 10 features | **✅ COMPLETE — Feb 28, 2026** |
| 6 (v1.1-2) | Intelligence | 4 features | **✅ COMPLETE — Feb 28, 2026** |
| 7 (v1.1-3) | Integrations | TBD | Pending |

## v1.1 Session 1 Features (Complete)
1. Deploy fixes — remotePatterns + maxDuration
2. Sliding window bump — 10 → 20 messages
3. Powered by Clara toggle in settings
4. Custom categories with combo input + extraction fix
5. Gap export as CSV
6. Improve with persistent revert
7. Session search across messages
8. Iframe-responsive public chat page
9. Bulk Q&A operations (delete/activate/categorize)
10. Test-this-pair similarity check

## v1.1 Session 2 Features (Complete)
1. File upload (.docx/.pdf) for transcript extraction — mammoth + pdf-parse
2. Gap auto-resolution on bulk save — 0.85 threshold, after() background processing
3. AI conversation summaries — ConversationSummary type, summarize lib, auto-trigger after 6 messages
4. Visitor intent cards on sessions page — IntentCard component, session list/detail integration

## Deployment Info
- **Production URL:** https://chatbot.jakevibes.dev
- **Vercel Project:** clara-chatbot (Cloud Employee team)
- **GitHub Repo:** galaxyfunk/clara-chatbot
- **Supabase Project:** clara-chatbot

## Post-Deploy Notes (Feb 23, 2026)
- Middleware updated to handle Edge runtime more robustly
- Supabase URL Configuration set: Site URL + redirect URLs for prod and localhost
- NEXT_PUBLIC_SUPABASE_URL must include `https://` prefix
- Auth working with email/password signup

## Build Process
1. Session briefs generated from scope doc (SHIP_BY_FRIDAY_V1_0.md) before each Claude Code session
2. 4 sessions total for v1.0 (18 steps)
3. Post-launch: audit codebase in fresh conversation before moving to v1.1
4. Update CHANGELOG.md and this file after each version ships

## Relationship to Insights Bank
Separate product. Separate repo, database, deployment, Claude Project. Future bridge API will push gap data to Insights Bank via REST call with shared secret. No database sharing, no shared auth. Not in v1.0 scope.
