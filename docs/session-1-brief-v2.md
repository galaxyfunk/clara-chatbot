# SESSION 1 BRIEF — Setup + DB + Auth + Types + All Lib Functions

**Date:** February 22, 2026
**Session:** 1 of 4
**Steps:** 1–5
**Goal:** Project scaffolded, database live, auth working, all TypeScript types defined, all lib functions written
**Repo:** https://github.com/galaxyfunk/clara-chatbot (empty — you're initializing it)

---

## IMPORTANT CONTEXT

You are building Clara — a multi-tenant AI chatbot SaaS. This is Session 1 of 4. Read CLAUDE.md and CONVENTIONS.md in the repo after you create them (Step 1). They contain architecture rules and code patterns you MUST follow.

**Key architecture rules (do not violate):**
- Everything TypeScript — no Python
- Next.js 14 App Router only — no Pages Router
- All business logic in `/lib` — API routes are thin wrappers
- Tailwind only — no CSS modules, no inline styles
- Sequential embedding generation — never Promise.all
- Workspace isolation — every query filters by workspace_id

---

## STEP 1: Project Scaffolding

### 1a. Create Next.js project

```bash
npx create-next-app@latest clara-chatbot --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd clara-chatbot
```

### 1b. Install dependencies

```bash
npm install @supabase/ssr @supabase/supabase-js @anthropic-ai/sdk openai lucide-react uuid
npm install -D @types/uuid
```

### 1c. Set up CE brand tokens in `tailwind.config.ts`

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'ce-navy': '#0B1A2E',
        'ce-lime': '#B8E62E',
        'ce-teal': '#1A8A7A',
        'ce-surface': '#FFFFFF',
        'ce-muted': '#F5F7FA',
        'ce-text': '#0B1A2E',
        'ce-text-muted': '#6B7280',
        'ce-border': '#E5E7EB',
      },
    },
  },
  plugins: [],
};
export default config;
```

### 1d. Set up `src/app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: 'Geist Sans', system-ui, -apple-system, sans-serif;
}
```

### 1e. Create `.env.local`

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://krtuflrdeexzrtderydh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<JAKE WILL PASTE>
SUPABASE_SERVICE_ROLE_KEY=<JAKE WILL PASTE>

# AI (app-level keys)
ANTHROPIC_API_KEY=<JAKE WILL PASTE>
OPENAI_API_KEY=<JAKE WILL PASTE>

# Encryption
ENCRYPTION_KEY=<JAKE WILL PASTE>

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**IMPORTANT:** After creating .env.local, STOP and ask Jake to paste in the real values. Do not proceed until env vars are confirmed.

### 1f. Add `.env.local` to `.gitignore`

Ensure `.env.local` is in `.gitignore` (create-next-app should handle this, but verify).

### 1g. Copy Clara logo SVGs

Jake has two logo files ready:
- `Clara-Logo-white-caps.svg` — White version (for navy sidebar)
- `Clara-Logo-white.svg` — White version alternate

Copy both into `public/` directory.

### 1h. Create project documentation files

Create these three files in the project root. Content is provided below.

**CLAUDE.md:**

```markdown
# CLAUDE.md — Clara Chatbot Project

## What Clara Is
Clara is a standalone, multi-tenant AI chatbot SaaS product. Users sign up, add Q&A pairs to a knowledge base, configure their own LLM provider (bring your own key), customize the chatbot's appearance and personality, and deploy it on their website. Built by Cloud Employee as both a production tool and a free giveaway.

**Product name:** Clara
**Default agent name:** Clara (users can rename in settings)
**Tagline:** "Your AI-Powered Chatbot, Built in Minutes"

## Current Phase
**v1.0: Ship by Friday** — Building the complete Clara product at chatbot.jakevibes.dev
- Auth, Q&A management, chat engine, gap detection, suggestion chips, smart escalation
- Tabbed settings with save button
- Widget embed (iframe + floating bubble)
- 4 sessions, 18 build steps

## Codebase
- **Repo:** clara-chatbot (GitHub — github.com/galaxyfunk/clara-chatbot)
- **Database:** Supabase (separate project from Insights Bank)
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
| /api/api-keys | GET/POST | Auth | List/add encrypted keys |
| /api/api-keys/[id] | PATCH/DELETE | Auth | Update/delete key |
| /api/workspace | GET/PATCH | Auth | Read/update workspace settings |
| /api/upload | POST | Auth | Avatar/icon image upload |
| /api/gaps | GET | Auth | Gap review queue |
| /api/gaps/resolve | POST | Auth | Promote gap → Q&A pair |
| /api/gaps/dismiss | POST | Auth | Dismiss gap |
| /api/sessions | GET | Auth | Chat session browser |
| /api/dashboard/stats | GET | Auth | Dashboard aggregate stats |

## Pages (10)
| Route | Purpose |
|-------|---------|
| / | Landing page with login CTA |
| /login | Login (email/password + Google OAuth) |
| /dashboard | Stats overview, recent gaps, quick actions |
| /dashboard/knowledge | Q&A pair management (table, add, edit, import) |
| /dashboard/knowledge/extract | Transcript extraction flow |
| /dashboard/gaps | Gap review queue |
| /dashboard/sessions | Conversation browser |
| /dashboard/chat | Chat playground (test Clara) |
| /dashboard/settings | Tabbed settings (Content/Style/AI/API Keys/Embed) |
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

## Build Sessions
| Session | Focus | Steps |
|---------|-------|-------|
| 1 | Setup + DB + Auth + Types + All Lib Functions | 1–5 |
| 2 | All API Routes | 6–9 |
| 3 | All Dashboard UI | 10–14 |
| 4 | Widget + Landing + Deploy | 15–18 |

## Phase Roadmap
| Release | Focus | Status |
|---------|-------|--------|
| v1.0 | Core Product + Widget + Deploy | IN PROGRESS — Ships Fri Feb 27 |
| v1.1 | Polish (onboarding wizard, bulk ops, auto-save, live preview) | Next week |
| v1.2 | Channel Integrations (Slack, Telegram, WhatsApp) | Future |
| v1.3 | Analytics + Reporting | Future |

## Build Process
1. Session briefs generated from scope doc before each Claude Code session
2. 4 sessions total for v1.0 (18 steps)
3. Post-launch: audit codebase in fresh conversation before v1.1
4. Update CHANGELOG.md and this file after each release ships

## Relationship to Insights Bank
Separate product. Separate repo, database, deployment, Claude Project. Future bridge API will push gap data to Insights Bank via REST call with shared secret. No database sharing, no shared auth.
```

**CONVENTIONS.md:**

```markdown
# CONVENTIONS.md — Clara Chatbot

Patterns established during development. Updated after each phase.

---

## File Structure
\`\`\`
src/
├── app/              → Pages and API routes (App Router)
│   ├── api/          → API route handlers (thin wrappers)
│   └── dashboard/    → Dashboard pages
├── components/       → React components
│   └── settings/     → Settings-specific components (tabs, preview)
├── lib/              → Business logic (ALL logic lives here)
│   ├── supabase/     → Supabase client factories
│   ├── llm/          → LLM provider abstraction
│   └── chat/         → Chat engine, extraction, dedup, improve
└── types/            → TypeScript interfaces
\`\`\`

## Naming Conventions
- Files: kebab-case (`qa-pairs-table.tsx`, `extract-qa.ts`)
- Components: PascalCase (`QAPairsTable`, `ChatPlayground`)
- Component variants: PascalCase + suffix (`StatsCardsSkeleton`)
- Types/Interfaces: PascalCase (`WorkspaceSettings`, `ChatMessage`)
- Type constants: SCREAMING_SNAKE_CASE (`SUPPORTED_MODELS`, `DEFAULT_CATEGORIES`)
- Database columns: snake_case (`workspace_id`, `created_at`)
- TypeScript properties: camelCase (`workspaceId`, `createdAt`)
- API responses: snake_case for DB fields, camelCase for computed fields
- Exported lib functions: camelCase verb-first (`processChat`, `extractQAPairs`)

---

## Import Ordering

Standard order (top to bottom):

\`\`\`typescript
'use client'  // directive first, if needed

import { useState } from 'react'              // 1. React
import { useRouter } from 'next/navigation'   // 2. Next.js
import { LogOut } from 'lucide-react'         // 3. External libraries
import { createClient } from '@/lib/...'      // 4. Internal lib
import { SomeType } from '@/types/...'        // 5. Internal types
import { SomeComponent } from '@/components'  // 6. Internal components
\`\`\`

---

## API Route Pattern
\`\`\`typescript
export async function METHOD(request: Request) {
  try {
    // 1. Parse and validate input
    // 2. Get workspace (authenticated routes)
    // 3. Call lib function (ALL logic in lib/)
    // 4. Return NextResponse.json({ success: true, ...data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
\`\`\`

**Rules:**
- Route files are thin — logic lives in `/lib`
- Always wrap in try-catch
- Always return `{ success: boolean, ...data }` or `{ success: false, error: string }`
- Extract error message via `error instanceof Error ? error.message : 'Unknown error'`

---

## Lib Function Structure

Pattern: Private helpers first, main exported function last.

\`\`\`typescript
// Private helpers first
function validateInput(data: unknown): boolean { ... }
function formatResponse(raw: any): FormattedResult { ... }

// Main exported function last
export async function processChat(request: ChatRequest): Promise<ChatResponse> {
  const supabase = createServerClient();
  // ... processing logic
  return response;
}
\`\`\`

**Rules:**
- Create Supabase client at start of function
- Use typed result objects (define in `/types`)
- Collect errors in array rather than failing fast (for batch operations)
- Throw errors for fatal issues, push to `errors[]` for recoverable ones

---

## Type Definition Patterns

Location: `src/types/*.ts`

\`\`\`typescript
// Constants as readonly tuple
export const DEFAULT_CATEGORIES = [
  'pricing',
  'process',
  'developers',
  'general',
] as const;

// Derive type from constant
export type DefaultCategory = typeof DEFAULT_CATEGORIES[number];

// Interfaces for data shapes
export interface QAPair {
  id: string;
  question: string;
  // ...
}

// Result types for lib functions
export interface QAImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}
\`\`\`

---

## Supabase Client Usage
- `createServerClient()` — Service role, bypasses RLS. API routes for admin ops.
- `createClient()` — Browser client, respects RLS. Client components.
- `createAuthClient()` — SSR client with user auth context. Server Components.

### Query Pattern
\`\`\`typescript
const { data, error } = await supabase
  .from('table_name')
  .select('col1, col2, col3')
  .eq('workspace_id', workspaceId)
  .order('created_at', { ascending: false })
  .limit(10);

if (error) {
  throw new Error(\`Failed to fetch: \${error.message}\`);
}
\`\`\`

### Insert Pattern
\`\`\`typescript
const { error: insertError } = await supabase
  .from('table_name')
  .insert({
    workspace_id: workspaceId,
    field1: value1,
  });

if (insertError) {
  result.errors.push(\`Insert failed: \${insertError.message}\`);
}
\`\`\`

---

## Error Handling

**At route level:** Try-catch with standardized response.

**In lib functions:**
- Throw for fatal errors (missing env vars, API failures)
- Collect recoverable errors in result array

\`\`\`typescript
// Fatal — throw
if (!apiKey) throw new Error('ENCRYPTION_KEY not set');

// Recoverable — collect
if (insertError) {
  result.errors.push(\`Insert failed for "\${question}": \${insertError.message}\`);
  continue;
}
\`\`\`

---

## Embedding Rules
- Always sequential (for loop, never Promise.all)
- Use app-level OPENAI_API_KEY for embeddings
- Use user's encrypted key ONLY for chat completions

---

## Idempotency Rules
- Every ChatMessage has a `message_id` (UUID) — engine deduplicates
- Q&A creation checks for duplicates (> 0.95 similarity) — returns warning
- Gap creation checks for existing open gaps with same question
- CSV import shows overlap preview before saving
- Bulk save includes `import_batch_id` in metadata

---

## Component Patterns

\`\`\`typescript
// 1. Props interface
interface StatsCardsProps {
  stats: {
    totalPairs: number;
    // ...
  }
}

// 2. Main component
export function StatsCards({ stats }: StatsCardsProps) {
  // 3. Data array for repeated elements
  const cards = [
    { label: 'Q&A Pairs', value: stats.totalPairs, icon: Database },
    // ...
  ];

  // 4. Render by mapping over data
  return (
    <div className="grid ...">
      {cards.map((card) => (
        <div key={card.label}>...</div>
      ))}
    </div>
  );
}

// 5. Loading skeleton as separate export
export function StatsCardsSkeleton() { ... }
\`\`\`

**Rules:**
- Server Components by default
- `'use client'` only when needed (forms, interactivity, hooks)
- Props interface directly above component
- Use data arrays for repeated UI (cards, nav items, etc.)
- Provide skeleton variants for async data
- Tailwind only — no inline styles, no CSS modules
- lucide-react for icons

---

## Layout Rules

All authenticated pages live inside `src/app/dashboard/` and inherit the dashboard layout (sidebar, auth check, mobile nav). Never import Sidebar into individual pages.

\`\`\`
src/app/
├── page.tsx               → Landing page (public)
├── login/page.tsx         → Login page (public)
├── layout.tsx             → Root layout (html, body, providers)
├── dashboard/
│   ├── layout.tsx         → Dashboard layout (sidebar + main, auth check)
│   ├── page.tsx           → Dashboard home (stats)
│   ├── knowledge/         → /dashboard/knowledge
│   ├── gaps/              → /dashboard/gaps
│   ├── sessions/          → /dashboard/sessions
│   ├── chat/              → /dashboard/chat
│   └── settings/          → /dashboard/settings
\`\`\`

**Rules:**
- Put all authenticated pages inside `dashboard/`
- Never import `<Sidebar>` or `<MobileNav>` into page components
- Login and auth callback live outside the dashboard group (public routes)

---

## Discriminated Union API Responses

For routes that return variable response shapes, use discriminated unions:

\`\`\`typescript
// When response type varies by context
export type ChatEngineResponse =
  | { type: 'answer'; answer: string; chips: string[]; confidence: number }
  | { type: 'escalation'; answer: string; booking_url: string }
  | { type: 'gap'; answer: string; gap_detected: true };
\`\`\`

**Frontend contract:** Gate on `res.ok` before parsing typed response:
\`\`\`typescript
if (!res.ok) {
  const err = await res.json();
  showError(err.error);
  return;
}
const data: SomeResponse = await res.json();
\`\`\`

---

## Security Rules
- Never return `encrypted_key` from GET endpoints — only `key_last4`
- AES-256-GCM encryption via `src/lib/encryption.ts`
- Service role key in env vars only — never exposed to client
- Workspace isolation enforced at application level + RLS policies
- Two API key layers: app-level (env vars) + user-level (encrypted in DB)

---

## Git Discipline
- Commit after every working step
- Descriptive messages: `feat: add Q&A dedup check on create`
- Never batch unrelated changes

---

## Testing Pattern
- Test each API route with curl before building UI
- Verify JSON response matches TypeScript interface
- Run migrations in Supabase SQL Editor before any coding

---

## Anti-Patterns to Avoid

- **No Python** — everything is TypeScript
- **No Pages Router** — App Router only
- **No logic in route files** — delegate to lib functions
- **No inline styles** — Tailwind utility classes only, no `style={}` props
- **No CSS modules, no styled-components** — Tailwind is the only styling system
- **No raw API keys in GET responses** — only `keyLast4`
- **No Promise.all for embeddings** — always sequential
- **No queries without workspace_id** — workspace isolation is mandatory
- **No user API keys for embeddings** — app-level key only
- **No hardcoded provider conditionals** — use the LLM provider abstraction

---

## Phase History

| Phase | Status | Key Patterns Established |
|-------|--------|-------------------------|
| v1.0 | In Progress | File structure, API route pattern, Supabase clients, encryption, LLM provider abstraction, workspace isolation, idempotency, dedup, component patterns, settings tabs |
```

**CHANGELOG.md:**

```markdown
# CHANGELOG.md — Clara Chatbot

Track of what shipped in each release. One paragraph per release.

---

## v1.0 — Ship by Friday
**Status:** In Progress
**Started:** February 2026

*(Entry will be written when v1.0 ships)*
```

### 1i. Initialize git and push

```bash
git init
git add .
git commit -m "feat: project scaffolding with CE brand tokens and docs"
git branch -M main
git remote add origin https://github.com/galaxyfunk/clara-chatbot.git
git push -u origin main
```

**✅ CHECKPOINT:** Project runs with `npm run dev`, shows Next.js default page, git pushed to GitHub.

---

## STEP 2: Supabase Setup

### 2a. Run Migration 5A-1 in Supabase SQL Editor

**STOP and tell Jake:** "Open Supabase Dashboard → SQL Editor → New Query. Paste Migration 5A-1 and click Run."

Here is the full migration SQL to give Jake:

```sql
-- ============================================
-- Migration 5A-1: Core tables for Clara chatbot
-- Run in Supabase SQL Editor
-- ============================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ────────────────────────────────────────────
-- Table: workspaces
-- ────────────────────────────────────────────
CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'My Chatbot',
  settings jsonb NOT NULL DEFAULT '{
    "display_name": "Clara",
    "welcome_message": "Hi! How can I help you today?",
    "placeholder_text": "Type your message...",
    "suggested_messages": [],
    "booking_url": null,
    "primary_color": "#6366f1",
    "bubble_color": "#000000",
    "bubble_position": "right",
    "avatar_url": null,
    "chat_icon_url": null,
    "personality_prompt": "### Business Context\nDescribe what your company does, your key services, and your target audience.\n\n### Role\nYou are Clara, a friendly and knowledgeable virtual assistant. Your primary role is to answer questions accurately using the knowledge base provided. Be conversational, helpful, and professional.\n\n### Constraints\n1. Only answer from the knowledge base context provided.\n2. If you don not have enough information, be honest and suggest booking a call.\n3. Never make up information or speculate beyond what the knowledge base contains.\n4. Keep responses concise — 2-4 sentences for simple questions.",
    "confidence_threshold": 0.78,
    "max_suggestion_chips": 3,
    "escalation_enabled": true,
    "powered_by_clara": true
  }'::jsonb,
  onboarding_completed_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id)
);

COMMENT ON TABLE workspaces IS 'One workspace per user. Multi-tenant isolation unit.';

-- ────────────────────────────────────────────
-- Table: api_keys
-- ────────────────────────────────────────────
CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('openai', 'anthropic')),
  model text NOT NULL,
  encrypted_key text NOT NULL,
  key_last4 text NOT NULL,
  label text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN api_keys.encrypted_key IS 'AES-256-GCM encrypted. Format: iv:authTag:ciphertext (hex-encoded).';

-- ────────────────────────────────────────────
-- Table: qa_pairs
-- ────────────────────────────────────────────
CREATE TABLE qa_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  embedding vector(1536),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'csv_import', 'transcript_extraction')),
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────
-- Table: chat_sessions
-- ────────────────────────────────────────────
CREATE TABLE chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_token text NOT NULL,
  messages jsonb NOT NULL DEFAULT '[]',
  summary jsonb DEFAULT NULL,
  metadata jsonb DEFAULT '{}',
  visitor_name text,
  visitor_email text,
  escalated boolean NOT NULL DEFAULT false,
  escalated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_sessions_workspace_token_unique UNIQUE(workspace_id, session_token)
);

-- ────────────────────────────────────────────
-- Table: qa_gaps
-- ────────────────────────────────────────────
CREATE TABLE qa_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  question text NOT NULL,
  ai_answer text,
  best_match_id uuid REFERENCES qa_pairs(id) ON DELETE SET NULL,
  similarity_score float,
  session_id uuid REFERENCES chat_sessions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_qa_id uuid REFERENCES qa_pairs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────
-- Indexes
-- ────────────────────────────────────────────
CREATE INDEX idx_qa_pairs_embedding ON qa_pairs
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

CREATE INDEX idx_qa_pairs_workspace ON qa_pairs(workspace_id);
CREATE INDEX idx_qa_pairs_workspace_active ON qa_pairs(workspace_id, is_active);
CREATE INDEX idx_chat_sessions_workspace ON chat_sessions(workspace_id);
CREATE INDEX idx_chat_sessions_token ON chat_sessions(session_token);
CREATE INDEX idx_qa_gaps_workspace ON qa_gaps(workspace_id);
CREATE INDEX idx_qa_gaps_workspace_status ON qa_gaps(workspace_id, status);
CREATE INDEX idx_api_keys_workspace ON api_keys(workspace_id);

-- ────────────────────────────────────────────
-- Functions
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search_qa_pairs(
  p_workspace_id uuid,
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  question text,
  answer text,
  category text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    qp.id,
    qp.question,
    qp.answer,
    qp.category,
    1 - (qp.embedding <=> query_embedding) AS similarity
  FROM qa_pairs qp
  WHERE qp.workspace_id = p_workspace_id
    AND qp.is_active = true
    AND qp.embedding IS NOT NULL
    AND 1 - (qp.embedding <=> query_embedding) > match_threshold
  ORDER BY qp.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_workspaces
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_api_keys
  BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_qa_pairs
  BEFORE UPDATE ON qa_pairs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_chat_sessions
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ────────────────────────────────────────────
-- Row Level Security (RLS)
-- ────────────────────────────────────────────
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_gaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_owner ON workspaces
  FOR ALL USING (owner_id = auth.uid());

CREATE POLICY api_keys_owner ON api_keys
  FOR ALL USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );

CREATE POLICY qa_pairs_owner ON qa_pairs
  FOR ALL USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );

CREATE POLICY chat_sessions_owner ON chat_sessions
  FOR ALL USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );

CREATE POLICY qa_gaps_owner ON qa_gaps
  FOR ALL USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );
```

### 2b. Run Migration 5A-2 in Supabase SQL Editor

**Tell Jake:** "Now paste Migration 5A-2 — the storage bucket."

```sql
-- ============================================
-- Migration 5A-2: Storage bucket for chatbot assets
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('chatbot-assets', 'chatbot-assets', true);

CREATE POLICY "Users can upload chatbot assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chatbot-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM workspaces WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Public read chatbot assets"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'chatbot-assets');

CREATE POLICY "Users can delete own chatbot assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chatbot-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM workspaces WHERE owner_id = auth.uid()
    )
  );
```

### 2c. Configure Supabase Auth Settings

**Tell Jake to do these three things in Supabase Dashboard:**

1. **Authentication → URL Configuration:**
   - Set **Site URL** to `http://localhost:3000`
   - Add `http://localhost:3000/auth/callback` to **Redirect URLs**

2. **Authentication → Settings → Email Auth:**
   - Confirm "Enable Email Signup" is ON
   - Confirm "Confirm email" is ON

3. **Authentication → Providers:**
   - Google OAuth stays OFF for now (we'll add it before deploy)

**Note for Jake:** Because email confirmation is ON, when you sign up during testing you'll need to check your email inbox (and spam folder) for the confirmation link before you can log in.

**✅ CHECKPOINT:** 5 tables visible in Supabase Table Editor, storage bucket exists, auth configured with Site URL set.

---

## STEP 3: Supabase Clients + Auth + Login + Dashboard Layout

### 3a. Supabase Client Files

**File: `src/lib/supabase/server.ts`**

```typescript
import { createClient } from '@supabase/supabase-js';

export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
```

**File: `src/lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**File: `src/lib/supabase/auth-server.ts`**

```typescript
import { createServerClient as createSSRClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createAuthClient() {
  const cookieStore = await cookies();
  return createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* Server Component */ }
        },
      },
    }
  );
}
```

### 3b. Auth Middleware

**File: `src/middleware.ts`**

```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => { response.cookies.set(name, value, options); });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (user && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return response;
}

export const config = { matcher: ['/dashboard/:path*', '/login'] };
```

### 3c. Auth Callback Route

**File: `src/app/auth/callback/route.ts`**

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          },
        },
      }
    );
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
```

### 3d. Login Page

**File: `src/app/login/page.tsx`**

Build a simple login page with:
- CE branding (ce-navy background or white with ce-navy accents)
- Clara logo at top
- Email + password sign-up/sign-in form (two modes: "Sign In" and "Sign Up")
- Toggle between sign-in and sign-up modes
- Use Supabase client `supabase.auth.signInWithPassword()` and `supabase.auth.signUp()`
- On success, redirect to `/dashboard`
- Show error messages from Supabase
- "Powered by Cloud Employee" footer text
- Responsive (looks good on mobile)

**Do NOT use Supabase Auth UI package** — build a custom form. It's simpler and matches our branding.

### 3e. Dashboard Layout with Auth + Workspace Ensure

**File: `src/lib/workspace.ts`**

```typescript
import { createServerClient } from '@/lib/supabase/server';
import type { Workspace } from '@/types/workspace';

export async function ensureWorkspace(userId: string): Promise<Workspace> {
  const supabase = createServerClient();
  const { data: existing } = await supabase.from('workspaces').select('*').eq('owner_id', userId).single();
  if (existing) return mapWorkspace(existing);

  const { data: created, error } = await supabase.from('workspaces').insert({ owner_id: userId }).select().single();
  if (error) throw new Error(`Failed to create workspace: ${error.message}`);
  return mapWorkspace(created);
}

function mapWorkspace(row: any): Workspace {
  return {
    id: row.id, ownerId: row.owner_id, name: row.name,
    settings: row.settings, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
```

**File: `src/app/dashboard/layout.tsx`**

Build a dashboard layout that:
- Checks auth via `createAuthClient()` — if no user, redirect to `/login`
- Calls `ensureWorkspace(user.id)` to auto-create workspace on first visit
- For now, just renders `{children}` in a basic container (sidebar comes in Session 3)
- Pass workspace context down (or just ensure it exists — components will fetch their own data)

**File: `src/app/dashboard/page.tsx`**

Simple placeholder:
```typescript
export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-ce-navy">Welcome to Clara</h1>
      <p className="mt-2 text-ce-text-muted">Dashboard coming in Session 3.</p>
    </div>
  );
}
```

### 3f. Root Landing Page (Temporary)

**File: `src/app/page.tsx`**

Simple redirect or link to login for now (real landing page is Session 4):
```typescript
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ce-muted">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-ce-navy">Clara</h1>
        <p className="mt-2 text-ce-text-muted">Your AI-Powered Chatbot, Built in Minutes</p>
        <Link href="/login" className="mt-6 inline-block rounded-full bg-ce-lime px-8 py-3 font-semibold text-ce-navy hover:opacity-90">
          Get Started
        </Link>
      </div>
    </div>
  );
}
```

### 3g. Test Auth Flow

```bash
npm run dev
```

1. Go to `localhost:3000` → should see landing page
2. Click "Get Started" → should go to `/login`
3. Sign up with email + password
4. **Check email inbox (and spam) for confirmation link** — click it
5. Sign in with the confirmed email + password
6. Check Supabase Table Editor → `workspaces` table should have a new row
7. Dashboard page should show "Welcome to Clara"

**✅ CHECKPOINT:** Auth works, workspace auto-created, git commit.

```bash
git add .
git commit -m "feat: auth, supabase clients, login page, dashboard layout with workspace ensure"
git push
```

---

## STEP 4: Type Definitions

Create all type files. These are used by every lib function and API route.

**File: `src/types/workspace.ts`**

```typescript
export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  settings: WorkspaceSettings;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSettings {
  // Content
  display_name: string;
  welcome_message: string;
  placeholder_text: string;
  suggested_messages: string[];
  booking_url: string | null;

  // Style
  primary_color: string;
  bubble_color: string;
  bubble_position: 'left' | 'right';
  avatar_url: string | null;
  chat_icon_url: string | null;

  // AI
  personality_prompt: string;
  confidence_threshold: number;
  max_suggestion_chips: number;

  // Escalation
  escalation_enabled: boolean;

  // Widget
  powered_by_clara: boolean;
}

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  display_name: 'Clara',
  welcome_message: 'Hi! How can I help you today?',
  placeholder_text: 'Type your message...',
  suggested_messages: [],
  booking_url: null,
  primary_color: '#6366f1',
  bubble_color: '#000000',
  bubble_position: 'right',
  avatar_url: null,
  chat_icon_url: null,
  personality_prompt: `### Business Context
Describe what your company does, your key services, and your target audience.

### Role
You are Clara, a friendly and knowledgeable virtual assistant. Your primary role is to answer questions accurately using the knowledge base provided. Be conversational, helpful, and professional.

### Constraints
1. Only answer from the knowledge base context provided.
2. If you don't have enough information, be honest and suggest booking a call.
3. Never make up information or speculate beyond what the knowledge base contains.
4. Keep responses concise — 2-4 sentences for simple questions.`,
  confidence_threshold: 0.78,
  max_suggestion_chips: 3,
  escalation_enabled: true,
  powered_by_clara: true,
};
```

**File: `src/types/qa.ts`**

```typescript
export type QASource = 'manual' | 'csv_import' | 'transcript_extraction';

export interface QAPair {
  id: string;
  workspaceId: string;
  question: string;
  answer: string;
  category: string;
  source: QASource;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface QAPairFormData {
  question: string;
  answer: string;
  category: string;
}

export interface QAImportResult {
  imported: number;
  skipped: number;
  duplicates: number;
  errors: string[];
}

export interface ExtractedQAPair {
  question: string;
  answer: string;
  category: string;
  confidence: number;
  existingMatchId?: string;
  existingMatchScore?: number;
  isNew: boolean;
}

export interface TranscriptExtractionResult {
  pairs: ExtractedQAPair[];
  totalFound: number;
  newCount: number;
  overlapCount: number;
}

export const DEFAULT_CATEGORIES = [
  'pricing',
  'process',
  'developers',
  'retention',
  'case_studies',
  'comparisons',
  'general',
] as const;

export type DefaultCategory = typeof DEFAULT_CATEGORIES[number];
```

**File: `src/types/chat.ts`**

```typescript
export interface ChatMessage {
  message_id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestion_chips?: string[];
  gap_detected?: boolean;
  matched_qa_ids?: string[];
  confidence?: number;
  escalation_offered?: boolean;
}

export interface ChatSession {
  id: string;
  workspaceId: string;
  sessionToken: string;
  messages: ChatMessage[];
  metadata: Record<string, unknown>;
  visitorName: string | null;
  visitorEmail: string | null;
  escalated: boolean;
  escalatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatRequest {
  workspace_id: string;
  session_token: string;
  message: string;
  message_id: string;
}

export interface ChatResponse {
  answer: string;
  suggestion_chips: string[];
  confidence: number;
  gap_detected: boolean;
  escalation_offered: boolean;
  booking_url: string | null;
  matched_pairs: { id: string; question: string; similarity: number }[];
}
```

**File: `src/types/gaps.ts`**

```typescript
export type GapStatus = 'open' | 'resolved' | 'dismissed';

export interface QAGap {
  id: string;
  workspaceId: string;
  question: string;
  aiAnswer: string | null;
  bestMatchId: string | null;
  bestMatchQuestion?: string;
  similarityScore: number | null;
  sessionId: string | null;
  status: GapStatus;
  resolvedQaId: string | null;
  createdAt: string;
}

export interface GapResolveRequest {
  gapId: string;
  question: string;
  answer: string;
  category: string;
}
```

**File: `src/types/api-keys.ts`**

```typescript
export type LLMProvider = 'openai' | 'anthropic';

export interface LLMModel {
  id: string;
  name: string;
  provider: LLMProvider;
  description: string;
}

export const SUPPORTED_MODELS: LLMModel[] = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet', provider: 'anthropic', description: 'Best conversational quality' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku', provider: 'anthropic', description: 'Fast and affordable' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', description: 'Smart and capable' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', description: 'Cheapest option' },
  { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai', description: 'Latest OpenAI model' },
] as const;

export interface ApiKey {
  id: string;
  workspaceId: string;
  provider: LLMProvider;
  model: string;
  keyLast4: string;
  label: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyFormData {
  provider: LLMProvider;
  model: string;
  apiKey: string;
  label?: string;
  isDefault: boolean;
}
```

**✅ CHECKPOINT:** All type files created, no TypeScript errors.

```bash
git add .
git commit -m "feat: all TypeScript type definitions"
git push
```

---

## STEP 5: All Lib Functions

### 5a. Encryption

**File: `src/lib/encryption.ts`**

```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY not set');
  return Buffer.from(key, 'hex');
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedString: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, ciphertext] = encryptedString.split(':');
  if (!ivHex || !authTagHex || !ciphertext) {
    throw new Error('Invalid encrypted string format');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

### 5b. Embeddings

**File: `src/lib/embed.ts`**

```typescript
import OpenAI from 'openai';

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  const client = new OpenAI({ apiKey });
  const response = await client.embeddings.create({ model: 'text-embedding-3-small', input: text });
  return response.data[0].embedding;
}
```

### 5c. LLM Provider Abstraction

**File: `src/lib/llm/provider.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  provider: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export async function chatCompletion(
  provider: string,
  model: string,
  apiKey: string,
  messages: LLMMessage[],
  options: { maxTokens?: number; temperature?: number } = {}
): Promise<LLMResponse> {
  const { maxTokens = 1024, temperature = 0.7 } = options;
  switch (provider) {
    case 'anthropic':
      return callAnthropic(model, apiKey, messages, maxTokens, temperature);
    case 'openai':
      return callOpenAI(model, apiKey, messages, maxTokens, temperature);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

async function callAnthropic(model: string, apiKey: string, messages: LLMMessage[], maxTokens: number, temperature: number): Promise<LLMResponse> {
  const client = new Anthropic({ apiKey });
  const systemMessage = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  const response = await client.messages.create({ model, max_tokens: maxTokens, temperature, system: systemMessage?.content || '', messages: chatMessages });
  const textContent = response.content.find(c => c.type === 'text');
  return { content: textContent?.text ?? '', provider: 'anthropic', model, usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } };
}

async function callOpenAI(model: string, apiKey: string, messages: LLMMessage[], maxTokens: number, temperature: number): Promise<LLMResponse> {
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({ model, max_tokens: maxTokens, temperature, messages: messages.map(m => ({ role: m.role, content: m.content })) });
  return { content: response.choices[0]?.message?.content ?? '', provider: 'openai', model, usage: { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0 } };
}
```

### 5d. Chat Dedup

**File: `src/lib/chat/dedup.ts`**

```typescript
import { generateEmbedding } from '@/lib/embed';
import { createServerClient } from '@/lib/supabase/server';

export async function checkForDuplicate(
  question: string,
  workspaceId: string,
  threshold: number = 0.95
): Promise<{ isDuplicate: boolean; existingId?: string; similarity?: number }> {
  const embedding = await generateEmbedding(question);
  const supabase = createServerClient();
  const { data: matches } = await supabase.rpc('search_qa_pairs', {
    p_workspace_id: workspaceId, query_embedding: embedding, match_threshold: threshold, match_count: 1,
  });
  const topMatch = matches?.[0];
  if (topMatch && topMatch.similarity >= threshold) {
    return { isDuplicate: true, existingId: topMatch.id, similarity: topMatch.similarity };
  }
  return { isDuplicate: false };
}
```

### 5e. Chat Engine

**File: `src/lib/chat/engine.ts`**

This is the biggest file. Copy it EXACTLY from this brief.

```typescript
import { createServerClient } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/embed';
import { chatCompletion, type LLMMessage } from '@/lib/llm/provider';
import { decrypt } from '@/lib/encryption';
import type { ChatRequest, ChatResponse, ChatMessage } from '@/types/chat';
import type { WorkspaceSettings } from '@/types/workspace';
import { v4 as uuidv4 } from 'uuid';

interface MatchedPair {
  id: string;
  question: string;
  answer: string;
  category: string;
  similarity: number;
}

// ─── Rate Limiting (In-Memory) ──────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(sessionToken: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const maxMessages = 100;
  const entry = rateLimitMap.get(sessionToken);
  if (!entry || now - entry.windowStart > windowMs) {
    rateLimitMap.set(sessionToken, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= maxMessages) return false;
  entry.count++;
  return true;
}

export async function processChat(request: ChatRequest): Promise<ChatResponse> {
  const supabase = createServerClient();

  // 1. Rate limit
  if (!checkRateLimit(request.session_token)) {
    return {
      answer: "You've sent a lot of messages! Please wait a bit before sending more.",
      suggestion_chips: [], confidence: 0, gap_detected: false,
      escalation_offered: false, booking_url: null, matched_pairs: [],
    };
  }

  // 2. Get workspace
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces').select('*').eq('id', request.workspace_id).single();
  if (wsError || !workspace) throw new Error('Workspace not found');
  const settings: WorkspaceSettings = workspace.settings;

  // 3. Zero Q&A gate
  const { count } = await supabase
    .from('qa_pairs')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', request.workspace_id)
    .eq('is_active', true);

  if (count === 0) {
    return {
      answer: `I'm not set up yet! My knowledge base is empty — add some Q&A pairs in the dashboard to get ${settings.display_name} started.`,
      suggestion_chips: [], confidence: 0, gap_detected: false,
      escalation_offered: false, booking_url: null, matched_pairs: [],
    };
  }

  // 4. Get default API key
  const { data: apiKeyRow, error: keyError } = await supabase
    .from('api_keys').select('*')
    .eq('workspace_id', request.workspace_id)
    .eq('is_default', true).eq('is_active', true).single();

  if (keyError || !apiKeyRow) {
    throw new Error(`Add an API key in Settings to start chatting with ${settings.display_name}.`);
  }
  const rawApiKey = decrypt(apiKeyRow.encrypted_key);

  // 5. Embed question
  const questionEmbedding = await generateEmbedding(request.message);

  // 6. Vector search
  const { data: matches, error: searchError } = await supabase.rpc('search_qa_pairs', {
    p_workspace_id: request.workspace_id, query_embedding: questionEmbedding,
    match_threshold: 0.5, match_count: 5,
  });
  if (searchError) throw new Error(`Search failed: ${searchError.message}`);

  const matchedPairs: MatchedPair[] = (matches ?? []) as MatchedPair[];
  const topMatch = matchedPairs[0];
  const confidence = topMatch?.similarity ?? 0;
  const isConfident = confidence >= settings.confidence_threshold;

  // 7. Get conversation history
  const { data: existingSession } = await supabase
    .from('chat_sessions')
    .select('id, messages, escalated, escalated_at')
    .eq('workspace_id', request.workspace_id)
    .eq('session_token', request.session_token).single();

  const previousMessages: ChatMessage[] = existingSession?.messages ?? [];

  // Idempotency check
  if (request.message_id && previousMessages.some(m => m.message_id === request.message_id)) {
    const msgIndex = previousMessages.findIndex(m => m.message_id === request.message_id);
    const existingResponse = previousMessages[msgIndex + 1];
    if (existingResponse && existingResponse.role === 'assistant') {
      return {
        answer: existingResponse.content,
        suggestion_chips: existingResponse.suggestion_chips ?? [],
        confidence: existingResponse.confidence ?? 0,
        gap_detected: existingResponse.gap_detected ?? false,
        escalation_offered: existingResponse.escalation_offered ?? false,
        booking_url: existingResponse.escalation_offered ? appendUtmParams(settings.booking_url) : null,
        matched_pairs: [],
      };
    }
  }

  // 8. Build LLM messages (sliding window: last 10)
  const llmMessages = buildChatPrompt(settings, request.message, matchedPairs, previousMessages, isConfident);

  // 9. Call LLM
  const llmResponse = await chatCompletion(apiKeyRow.provider, apiKeyRow.model, rawApiKey, llmMessages, { maxTokens: 1024, temperature: 0.7 });

  // 10. Parse response
  const parsed = parseLLMResponse(llmResponse.content, settings);

  // 11. Gap detection with dedup
  const gapDetected = !isConfident;
  if (gapDetected) {
    const { data: existingGaps } = await supabase
      .from('qa_gaps').select('id, question')
      .eq('workspace_id', request.workspace_id).eq('status', 'open');

    const isDuplicateGap = (existingGaps ?? []).some(g =>
      g.question.toLowerCase().trim() === request.message.toLowerCase().trim()
    );

    if (!isDuplicateGap) {
      await supabase.from('qa_gaps').insert({
        workspace_id: request.workspace_id, question: request.message,
        ai_answer: parsed.answer, best_match_id: topMatch?.id ?? null,
        similarity_score: confidence, session_id: existingSession?.id ?? null, status: 'open',
      });
    }
  }

  // 12. Upsert chat session
  const userMessage: ChatMessage = {
    message_id: request.message_id || uuidv4(), role: 'user',
    content: request.message, timestamp: new Date().toISOString(),
  };
  const assistantMessage: ChatMessage = {
    message_id: uuidv4(), role: 'assistant', content: parsed.answer,
    timestamp: new Date().toISOString(), suggestion_chips: parsed.suggestion_chips,
    gap_detected: gapDetected, matched_qa_ids: matchedPairs.map(m => m.id),
    confidence, escalation_offered: parsed.escalation_offered,
  };

  const updatedMessages = [...previousMessages, userMessage, assistantMessage];

  await supabase.from('chat_sessions').upsert({
    workspace_id: request.workspace_id, session_token: request.session_token,
    messages: updatedMessages,
    escalated: parsed.escalation_offered || existingSession?.escalated || false,
    escalated_at: parsed.escalation_offered ? new Date().toISOString() : existingSession?.escalated_at ?? null,
  }, { onConflict: 'chat_sessions_workspace_token_unique' });

  // 13. Return response
  return {
    answer: parsed.answer, suggestion_chips: parsed.suggestion_chips, confidence,
    gap_detected: gapDetected, escalation_offered: parsed.escalation_offered,
    booking_url: parsed.escalation_offered ? appendUtmParams(settings.booking_url) : null,
    matched_pairs: matchedPairs.map(m => ({ id: m.id, question: m.question, similarity: m.similarity })),
  };
}

function appendUtmParams(url: string | null): string | null {
  if (!url) return null;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}utm_source=clara&utm_medium=chatbot`;
}

function buildChatPrompt(
  settings: WorkspaceSettings, userMessage: string, matchedPairs: MatchedPair[],
  previousMessages: ChatMessage[], isConfident: boolean
): LLMMessage[] {
  const contextBlock = matchedPairs.length > 0
    ? matchedPairs.map((m, i) =>
        `[Q${i + 1}] ${m.question}\n[A${i + 1}] ${m.answer}\n(Category: ${m.category}, Relevance: ${(m.similarity * 100).toFixed(0)}%)`
      ).join('\n\n')
    : 'No relevant Q&A pairs found in the knowledge base.';

  const systemPrompt = `${settings.personality_prompt}

## Knowledge Base Context
${contextBlock}

## Response Rules
1. Answer the user's question using ONLY the knowledge base context above. Do not make up information.
2. If the context doesn't fully answer the question, be honest: provide what you can and acknowledge what you don't know.
3. Keep responses concise and conversational — 2-4 sentences for simple questions, more for complex ones.

## Suggestion Chip Rules
Generate exactly ${settings.max_suggestion_chips} suggestion chips. These are NOT generic follow-ups. Each chip should do ONE of:
(a) Help the visitor clarify their specific needs
(b) Surface high-value information from the knowledge base that's related to their question
(c) Guide toward booking a call IF buying intent is present

${settings.escalation_enabled ? `## Escalation Rules
If the user shows buying intent (asking about pricing, timelines, team availability, "how do I get started", comparing options), include a booking suggestion and set escalation to true.` : ''}

## Response Format
Respond in this exact JSON format (no markdown fences, raw JSON only):
{
  "answer": "Your conversational answer here",
  "suggestion_chips": ["Strategic follow-up 1?", "Strategic follow-up 2?", "Strategic follow-up 3?"],
  "escalation_offered": false
}

${settings.escalation_enabled && settings.booking_url ? `When escalation_offered is true, naturally weave a booking suggestion into your answer.` : ''}`;

  const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

  // Sliding window: last 10 messages
  const recentHistory = previousMessages.slice(-10);
  for (const msg of recentHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({ role: 'user', content: userMessage });
  return messages;
}

interface ParsedResponse { answer: string; suggestion_chips: string[]; escalation_offered: boolean; }

function parseLLMResponse(rawContent: string, settings: WorkspaceSettings): ParsedResponse {
  try {
    const cleaned = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      answer: parsed.answer || rawContent,
      suggestion_chips: Array.isArray(parsed.suggestion_chips) ? parsed.suggestion_chips.slice(0, settings.max_suggestion_chips) : [],
      escalation_offered: Boolean(parsed.escalation_offered),
    };
  } catch {
    return { answer: rawContent, suggestion_chips: [], escalation_offered: false };
  }
}
```

### 5f. Transcript Extraction

**File: `src/lib/chat/extract-qa.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { generateEmbedding } from '@/lib/embed';
import { createServerClient } from '@/lib/supabase/server';
import type { ExtractedQAPair, TranscriptExtractionResult } from '@/types/qa';

export async function extractQAPairsFromTranscript(
  transcript: string,
  workspaceId: string
): Promise<TranscriptExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const client = new Anthropic({ apiKey });

  const extractionResponse = await client.messages.create({
    model: 'claude-sonnet-4-20250514', max_tokens: 4096, temperature: 0.3,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Here is the transcript:\n\n${transcript}` }],
  });

  const textContent = extractionResponse.content.find(c => c.type === 'text');
  const rawPairs = parseExtractionResponse(textContent?.text ?? '');

  if (rawPairs.length === 0) {
    return { pairs: [], totalFound: 0, newCount: 0, overlapCount: 0 };
  }

  const supabase = createServerClient();
  const enrichedPairs: ExtractedQAPair[] = [];

  for (const pair of rawPairs) {
    const embedding = await generateEmbedding(pair.question);
    const { data: matches } = await supabase.rpc('search_qa_pairs', {
      p_workspace_id: workspaceId, query_embedding: embedding, match_threshold: 0.85, match_count: 1,
    });

    const topMatch = matches?.[0];
    const isOverlap = topMatch && topMatch.similarity >= 0.85;

    enrichedPairs.push({
      ...pair,
      existingMatchId: isOverlap ? topMatch.id : undefined,
      existingMatchScore: isOverlap ? topMatch.similarity : undefined,
      isNew: !isOverlap,
    });
  }

  return {
    pairs: enrichedPairs, totalFound: enrichedPairs.length,
    newCount: enrichedPairs.filter(p => p.isNew).length,
    overlapCount: enrichedPairs.filter(p => !p.isNew).length,
  };
}

const EXTRACTION_SYSTEM_PROMPT = `You are an expert at extracting question-and-answer pairs from business call transcripts.

Your job:
1. Read the transcript carefully
2. Identify every question asked by prospects/clients AND the corresponding answer given
3. Also identify implied questions — topics discussed where the speaker provides information that answers a common question
4. Clean up the answers — they should be clear, professional, and self-contained
5. Categorize each Q&A pair

Rules:
- Answers must be CLEAN and PROFESSIONAL — rewrite transcript language into clear, readable responses
- Answers should be 2-5 sentences, self-contained
- Do NOT include filler words, stuttering, or conversation artifacts
- Each answer should sound like it could appear on a company FAQ page

Respond with a JSON array (no markdown fences):
[
  {
    "question": "What is your typical hiring timeline?",
    "answer": "Our typical hiring timeline is 2-4 weeks from briefing to candidate presentation.",
    "category": "process",
    "confidence": 0.95
  }
]

Categories to use: pricing, process, developers, retention, case_studies, comparisons, compliance, scaling, onboarding, general`;

function parseExtractionResponse(raw: string): ExtractedQAPair[] {
  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p: any) => p.question && p.answer)
      .map((p: any) => ({
        question: String(p.question).trim(), answer: String(p.answer).trim(),
        category: String(p.category || 'general').trim(),
        confidence: Number(p.confidence) || 0.5, isNew: true,
      }));
  } catch { return []; }
}
```

### 5g. Improve Q&A

**File: `src/lib/chat/improve-qa.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';

export async function improveQAPair(question: string, answer: string): Promise<{ question: string; answer: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514', max_tokens: 1024, temperature: 0.5,
    system: `You improve Q&A pairs for a company knowledge base / chatbot. Your job:
1. Make the question clearer and more natural
2. Make the answer professional, concise (2-5 sentences), and self-contained
3. Remove any transcript artifacts, filler words, or rambling
4. Maintain the factual content — do not add information that wasn't there
5. The answer should sound like it belongs on a company FAQ page

Respond with JSON (no markdown fences):
{"question": "...", "answer": "..."}`,
    messages: [{ role: 'user', content: `Please improve this Q&A pair:\n\nQuestion: ${question}\n\nAnswer: ${answer}` }],
  });

  const textContent = response.content.find(c => c.type === 'text');
  try {
    const cleaned = (textContent?.text ?? '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return { question: parsed.question || question, answer: parsed.answer || answer };
  } catch { return { question, answer }; }
}
```

### 5h. Test Encryption Roundtrip

After creating all lib files, test encryption works by creating a temporary test API route:

**File: `src/app/api/test-encryption/route.ts`** (temporary — delete after verification)

```typescript
import { NextResponse } from 'next/server';
import { encrypt, decrypt } from '@/lib/encryption';

export async function GET() {
  const testKey = 'sk-test-key-12345';
  const encrypted = encrypt(testKey);
  const decrypted = decrypt(encrypted);
  return NextResponse.json({
    match: testKey === decrypted,
    encrypted: encrypted.substring(0, 20) + '...',
  });
}
```

Test with: `curl http://localhost:3000/api/test-encryption`

Expected response: `{"match":true,"encrypted":"..."}`

Then **delete** the test route file.

**✅ CHECKPOINT:** All lib functions created, encryption verified, no TypeScript errors.

```bash
git add .
git commit -m "feat: all lib functions - encryption, embed, LLM provider, chat engine, extraction, improve, dedup"
git push
```

---

## SESSION 1 COMPLETE — Exit Criteria

After completing all 5 steps, verify:

- [ ] Project runs with `npm run dev` (no errors)
- [ ] CE brand tokens work in Tailwind (test with a colored div)
- [ ] CLAUDE.md, CONVENTIONS.md, CHANGELOG.md exist in repo root
- [ ] Clara logo SVGs are in `public/` directory
- [ ] .env.local has all 7 values set (and is gitignored)
- [ ] Supabase: Site URL set to `http://localhost:3000`
- [ ] Supabase: Redirect URL includes `http://localhost:3000/auth/callback`
- [ ] 5 tables visible in Supabase Table Editor
- [ ] Storage bucket `chatbot-assets` exists
- [ ] Auth: can sign up with email/password (check email for confirmation)
- [ ] Auth: workspace auto-created on first login (check workspaces table)
- [ ] Auth: middleware redirects unauthenticated users to /login
- [ ] All 5 type files in `src/types/` with no TS errors
- [ ] All 8 lib files in `src/lib/` with no TS errors
- [ ] Encryption roundtrip test passes (match: true)
- [ ] All code pushed to GitHub

**Next session:** Session 2 — All API Routes (Steps 6–9)
