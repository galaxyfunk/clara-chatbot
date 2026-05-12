# SCHEMA.md — Clara Chatbot

Canonical database schema reference. This is the single source of truth for all tables, columns, indexes, functions, RLS policies, and storage configuration.

**Database:** Supabase (Postgres + pgvector)
**Project:** Separate Supabase project (not shared with Insights Bank)
**Last updated:** May 2026

---

## Entity Relationship Diagram

```
┌─────────────────┐
│   auth.users    │  (Supabase Auth — managed)
│─────────────────│
│ id (PK)         │
│ email           │
└────────┬────────┘
         │ 1:1
         ▼
┌─────────────────────────────────────────────┐
│                workspaces                    │
│─────────────────────────────────────────────│
│ id (PK, uuid)                                │
│ owner_id (FK → auth.users, UNIQUE)           │
│ name (text)                                  │
│ settings (jsonb) ← content + style + AI      │
│ onboarding_completed_steps (jsonb) [v1.1]    │
│ created_at, updated_at                       │
└──┬──────────┬──────────────┬──────────────┬──────────────┐
   │ 1:many   │ 1:many       │ 1:many       │ 1:many       │
   ▼          ▼              ▼              ▼              │
┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────▼──────┐  ┌────────────────────┐
│ qa_pairs │  │chat_sessions │  │  api_keys    │  │ agent_prompts │  │sales_call_analyses │
│          │  │              │  │              │  │               │  │                    │
│ question │  │ session_token│  │ provider     │  │ slug          │  │ fireflies_meeting_id│
│ answer   │  │ messages     │  │ encrypted_key│  │ name          │  │ rep_email, rep_name │
│ category │  │ summary [v1.1]│ │ model        │  │ agent_type    │  │ call_title, date    │
│ embedding│  │ escalated    │  │ is_default   │  │ content       │  │ claude_output       │
│ source   │  │ metadata     │  │ is_active    │  │ metadata      │  │ slack_*_ts          │
│ metadata │  │              │  │              │  │ is_active     │  │ status, attendees   │
└──────────┘  └──────┬───────┘  └──────────────┘  └───────────────┘  └────────────────────┘
                     │ 1:many
                     ▼
                ┌──────────┐
                │ qa_gaps  │
                │          │
                │ question │
                │ status   │
                │ session_id│
                └──────────┘

+ Supabase Storage: chatbot-assets bucket (avatars, icons)
```

---

## Tables

### 1. workspaces

One workspace per user. The multi-tenant isolation unit. All queries in the app filter by `workspace_id`.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `owner_id` | uuid | NOT NULL | — | FK → auth.users(id) ON DELETE CASCADE. **UNIQUE** — one workspace per user. |
| `name` | text | NOT NULL | `'My Chatbot'` | Workspace label (internal, not visitor-facing) |
| `settings` | jsonb | NOT NULL | See [Settings JSONB Structure](#settings-jsonb-structure) | All content, style, and AI configuration |
| `onboarding_completed_steps` | jsonb | NOT NULL | `'[]'::jsonb` | **v1.1 forward-compat.** Not used in v1.0. |
| `created_at` | timestamptz | NOT NULL | `now()` | |
| `updated_at` | timestamptz | NOT NULL | `now()` | Auto-updated via trigger |

**Column count:** 7

---

### 2. api_keys

User-provided LLM API keys, encrypted at rest with AES-256-GCM. Only `key_last4` is ever returned in GET responses — never the encrypted key.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `workspace_id` | uuid | NOT NULL | — | FK → workspaces(id) ON DELETE CASCADE |
| `provider` | text | NOT NULL | — | CHECK: `'openai'` or `'anthropic'` |
| `model` | text | NOT NULL | — | e.g. `claude-sonnet-4-20250514`, `gpt-4o` |
| `encrypted_key` | text | NOT NULL | — | AES-256-GCM encrypted. Format: `iv:authTag:ciphertext` (hex-encoded) |
| `key_last4` | text | NOT NULL | — | Last 4 characters of the raw key (for display) |
| `label` | text | YES | — | User-defined label (e.g. "Production Key") |
| `is_default` | boolean | NOT NULL | `false` | The key used for chat. One default per workspace. |
| `is_active` | boolean | NOT NULL | `true` | Soft disable without deleting |
| `created_at` | timestamptz | NOT NULL | `now()` | |
| `updated_at` | timestamptz | NOT NULL | `now()` | Auto-updated via trigger |

**Column count:** 10

**Supported providers and models:**

| Provider | Model ID | Display Name |
|----------|----------|-------------|
| anthropic | `claude-sonnet-4-20250514` | Claude Sonnet |
| anthropic | `claude-haiku-4-5-20251001` | Claude Haiku |
| openai | `gpt-4o` | GPT-4o |
| openai | `gpt-4o-mini` | GPT-4o Mini |
| openai | `gpt-4.1` | GPT-4.1 |

---

### 3. qa_pairs

Knowledge base entries with vector embeddings for semantic search.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `workspace_id` | uuid | NOT NULL | — | FK → workspaces(id) ON DELETE CASCADE |
| `question` | text | NOT NULL | — | The question (used for embedding + display) |
| `answer` | text | NOT NULL | — | The answer (injected into LLM context) |
| `category` | text | NOT NULL | `'general'` | Tagging category for filtering |
| `embedding` | vector(1536) | YES | — | OpenAI text-embedding-3-small output |
| `source` | text | NOT NULL | `'manual'` | CHECK: `'manual'`, `'csv_import'`, `'transcript_extraction'` |
| `is_active` | boolean | NOT NULL | `true` | Soft delete. Inactive pairs excluded from search. |
| `metadata` | jsonb | YES | `'{}'` | Flexible store (import_batch_id, extraction details, etc.) |
| `created_at` | timestamptz | NOT NULL | `now()` | |
| `updated_at` | timestamptz | NOT NULL | `now()` | Auto-updated via trigger |

**Column count:** 10

**Default categories:** `pricing`, `process`, `developers`, `retention`, `case_studies`, `comparisons`, `general`

**Dedup rule:** Before creating a new Q&A pair, check for existing pairs with > 0.95 cosine similarity. Warn if duplicate found.

---

### 4. chat_sessions

Conversation logs. Each visitor session is identified by a client-generated UUID (`session_token`). All messages stored in a JSONB array.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `workspace_id` | uuid | NOT NULL | — | FK → workspaces(id) ON DELETE CASCADE |
| `session_token` | text | NOT NULL | — | Client-generated UUID (stored in sessionStorage) |
| `messages` | jsonb | NOT NULL | `'[]'` | Array of ChatMessage objects (see below) |
| `summary` | jsonb | YES | `NULL` | **v1.1 forward-compat.** AI-generated session summary. Not used in v1.0. |
| `metadata` | jsonb | YES | `'{}'` | Flexible store |
| `visitor_name` | text | YES | — | Optional visitor identification |
| `visitor_email` | text | YES | — | Optional visitor identification |
| `escalated` | boolean | NOT NULL | `false` | Whether escalation was offered |
| `escalated_at` | timestamptz | YES | — | Timestamp of first escalation |
| `created_at` | timestamptz | NOT NULL | `now()` | |
| `updated_at` | timestamptz | NOT NULL | `now()` | Auto-updated via trigger |

**Column count:** 11

**Unique constraint:** `(workspace_id, session_token)` — one session per workspace per token.

**ChatMessage JSONB structure** (each element in the `messages` array):

```jsonc
{
  "message_id": "uuid",          // Unique per message — used for idempotency
  "role": "user" | "assistant",
  "content": "string",
  "timestamp": "ISO 8601",
  "gap_detected": false,           // Assistant messages only
  "matched_qa_ids": ["uuid"],      // Assistant messages only
  "confidence": 0.85,              // Assistant messages only
  "escalation_offered": false      // Assistant messages only
}
```

---

### 5. qa_gaps

Low-confidence questions flagged for human review. Created automatically when the chat engine's top match falls below the workspace's `confidence_threshold`.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `workspace_id` | uuid | NOT NULL | — | FK → workspaces(id) ON DELETE CASCADE |
| `question` | text | NOT NULL | — | The visitor's original question |
| `ai_answer` | text | YES | — | The answer Clara gave despite low confidence |
| `best_match_id` | uuid | YES | — | FK → qa_pairs(id) ON DELETE SET NULL. Closest existing Q&A. |
| `similarity_score` | float | YES | — | Cosine similarity of best match (0–1) |
| `session_id` | uuid | YES | — | FK → chat_sessions(id) ON DELETE SET NULL |
| `status` | text | NOT NULL | `'open'` | CHECK: `'open'`, `'resolved'`, `'dismissed'` |
| `resolved_qa_id` | uuid | YES | — | FK → qa_pairs(id) ON DELETE SET NULL. The Q&A pair created when resolving. |
| `created_at` | timestamptz | NOT NULL | `now()` | |

**Column count:** 9 (note: no `updated_at` — gaps are created once and status-transitioned)

**Dedup rule:** Before inserting a gap, check if an open gap already exists with the same question (case-insensitive exact match).

---

### 6. agent_prompts

Workspace-scoped, slug-keyed prompt store usable by any Clara agent. Edits invalidate the in-process loader cache immediately on the editing instance; other Vercel instances pick up changes within 60 seconds (cache TTL).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `workspace_id` | uuid | NOT NULL | — | FK → workspaces(id) ON DELETE CASCADE |
| `slug` | text | NOT NULL | — | CHECK: `^[a-z0-9-]+$`. Looked up by agents at runtime. |
| `name` | text | NOT NULL | — | Human-readable label shown in the dashboard |
| `description` | text | YES | — | Optional notes about what this prompt does |
| `agent_type` | text | NOT NULL | — | Tags which agent owns this prompt (e.g. `sales_coach`). New agents = new value, no schema change. |
| `content` | text | NOT NULL | — | The prompt body. CHECK: `length(trim(content)) > 0`. Supports `{{variable}}` placeholders, interpolated by agents at runtime. |
| `metadata` | jsonb | NOT NULL | `'{}'` | Flexible store (variable schemas, version notes, etc.) |
| `is_active` | boolean | NOT NULL | `true` | Inactive prompts throw on load — used to soft-disable an agent without deleting its prompt |
| `created_at` | timestamptz | NOT NULL | `now()` | |
| `updated_at` | timestamptz | NOT NULL | `now()` | Auto-updated via trigger |

**Column count:** 11

**Unique constraint:** `(workspace_id, slug)` — slugs are unique per workspace.

**Seeded prompts (CE workspace):**

| Slug | Name | Agent Type | Notes |
|------|------|------------|-------|
| `sales-coach` | Sales Coach | `sales_coach` | Generic discovery-call coaching prompt. Applies to all sales reps. Output destined for Slack in sales-coach-2. |

**Adding new prompts:** Insert via SQL (seed-style) — no POST endpoint exists. Self-service creation is intentionally out of scope until there's a real use case for it.

---

### 7. sales_call_analyses

Per-call Sales Coach output. One row per Fireflies meeting that the orchestrator has processed (successfully analyzed or intentionally skipped). Failed runs do NOT insert a row — that lets the next run retry naturally.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | Primary key |
| `workspace_id` | uuid | NOT NULL | — | FK → workspaces(id) ON DELETE CASCADE |
| `fireflies_meeting_id` | text | NOT NULL | — | Fireflies transcript ID. UNIQUE per workspace (idempotency key). |
| `rep_email` | text | NOT NULL | — | Snapshot of `SALES_COACH_REP_EMAIL` at the time of analysis |
| `rep_name` | text | NOT NULL | — | Snapshot of `SALES_COACH_REP_NAME` at the time of analysis |
| `call_title` | text | YES | — | Fireflies meeting title |
| `call_date` | timestamptz | YES | — | Meeting start time (converted from Fireflies unix ms) |
| `duration_seconds` | integer | YES | — | Call length in seconds (Fireflies returns minutes; converted on write) |
| `prospect_domain` | text | YES | — | Most common external email domain among attendees. `NULL` for skipped/internal-only calls. |
| `attendees` | jsonb | NOT NULL | `'[]'` | Array of `{ email, name }` — snapshot of Fireflies `meeting_attendees` |
| `fireflies_url` | text | YES | — | Direct link to the Fireflies recording |
| `prompt_slug` | text | NOT NULL | — | Always `'sales-coach'` in v1 (in `agent_prompts.slug`) |
| `claude_output` | text | YES | — | Full Claude response. NULL for skipped rows. Used for re-analyze + debugging. |
| `slack_channel_id` | text | YES | — | The `SLACK_SALES_COACH_CHANNEL` ID the message was posted to |
| `slack_parent_ts` | text | YES | — | Slack timestamp of the parent message |
| `slack_thread_ts` | text | YES | — | Slack timestamp of the thread reply with the full coaching |
| `status` | text | NOT NULL | — | CHECK: `'analyzed'`, `'failed'`, or `'skipped'`. (`failed` reserved — failures don't currently insert, but kept in the CHECK for forward-compat.) |
| `error_message` | text | YES | — | For `skipped` rows: the filter reason (`no_external_attendee` / `no_attendees`). Reserved for `failed` if we ever start persisting them. |
| `analyzed_at` | timestamptz | NOT NULL | `now()` | When this analysis was produced. Re-analyze writes a new value. |
| `created_at` | timestamptz | NOT NULL | `now()` | First-insert timestamp |

**Column count:** 20

**Unique constraint:** `(workspace_id, fireflies_meeting_id)` — one analysis per meeting per workspace (re-analyze deletes the old row before inserting the new one).

**No `updated_at` trigger** — this table is insert-only from a row-lifecycle perspective. Re-analyze deletes + inserts rather than updating in place.

**Idempotency rules:**
- `analyzed` rows: skipped by next run (no re-processing)
- `skipped` rows: skipped by next run (internal-only calls won't become external)
- Failures: NO row written — natural retry on next click

---

## Settings JSONB Structure

The `settings` column on `workspaces` stores all customizable configuration as a single JSONB object. This avoids a separate settings table and keeps workspace reads as one query.

```jsonc
{
  // ── Content ──
  "display_name": "Clara",                     // What visitors see as the bot name
  "welcome_message": "Hi! How can I help you today?",
  "placeholder_text": "Type your message...",
  "suggested_messages": [],                     // Array of strings, max 5 in UI
  "booking_url": null,                          // Calendly or similar URL for escalation

  // ── Style ──
  "primary_color": "#6366f1",                   // Header, accents (default: indigo)
  "bubble_color": "#000000",                    // Floating widget button color
  "bubble_position": "right",                   // "left" or "right"
  "avatar_url": null,                           // Supabase Storage URL
  "chat_icon_url": null,                        // Supabase Storage URL

  // ── AI ──
  "personality_prompt": "...",                   // System prompt for LLM (see default below)
  "confidence_threshold": 0.78,                 // Below this → gap detected (range: 0.5–0.95)

  // ── Escalation ──
  "escalation_enabled": true,                   // Whether to offer booking link on intent

  // ── Widget ──
  "powered_by_clara": true                      // v1.0: hardcoded true. v1.1: toggle in settings.
}
```

**Default personality prompt:**

```
### Business Context
Describe what your company does, your key services, and your target audience.

### Role
You are Clara, a friendly and knowledgeable virtual assistant. Your primary role is to answer questions accurately using the knowledge base provided. Be conversational, helpful, and professional.

### Constraints
1. Only answer from the knowledge base context provided.
2. If you don't have enough information, be honest and suggest booking a call.
3. Never make up information or speculate beyond what the knowledge base contains.
4. Keep responses concise — 2-4 sentences for simple questions.
```

**Important:** The display name in the personality prompt should match `settings.display_name`. The default says "Clara" but users can change both.

---

## Indexes

| Index Name | Table | Type | Columns / Expression | Notes |
|------------|-------|------|----------------------|-------|
| `idx_qa_pairs_embedding` | qa_pairs | IVFFlat | `embedding vector_cosine_ops` WITH (lists = 50) | Rebuild with lists=300 at ~100K rows |
| `idx_qa_pairs_workspace` | qa_pairs | B-tree | `workspace_id` | |
| `idx_qa_pairs_workspace_active` | qa_pairs | B-tree | `workspace_id, is_active` | Composite for active-only queries |
| `idx_chat_sessions_workspace` | chat_sessions | B-tree | `workspace_id` | |
| `idx_chat_sessions_token` | chat_sessions | B-tree | `session_token` | |
| `idx_qa_gaps_workspace` | qa_gaps | B-tree | `workspace_id` | |
| `idx_qa_gaps_workspace_status` | qa_gaps | B-tree | `workspace_id, status` | Composite for status-filtered queries |
| `idx_api_keys_workspace` | api_keys | B-tree | `workspace_id` | |
| `idx_agent_prompts_workspace` | agent_prompts | B-tree | `workspace_id` | |
| `idx_sales_call_analyses_workspace_created` | sales_call_analyses | B-tree | `workspace_id, created_at DESC` | History queries (newest first) |
| `idx_sales_call_analyses_workspace_status` | sales_call_analyses | B-tree | `workspace_id, status` | Filter by status (analyzed/skipped) |

**Scaling note:** The IVFFlat vector index is optimal up to ~100K rows with `lists = 50`. At that scale, rebuild with `lists = 300` (one SQL command). At 500K+ rows, consider switching to HNSW.

---

## Functions

### search_qa_pairs

The core semantic search function called by the chat engine.

```sql
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
```

**Usage in code:**
```typescript
const { data: matches } = await supabase.rpc('search_qa_pairs', {
  p_workspace_id: workspaceId,
  query_embedding: embedding,
  match_threshold: 0.5,  // Chat engine default
  match_count: 5,
});
```

**Threshold reference:**
- `0.5` — Chat engine search (broad, return top matches)
- `0.78` — Default confidence threshold (below this → gap detected)
- `0.85` — Transcript extraction overlap check
- `0.95` — Q&A creation dedup check (near-exact duplicate)

### set_updated_at

Trigger function to auto-set `updated_at` on row updates.

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
```

---

## Triggers

| Trigger Name | Table | Event | Function |
|-------------|-------|-------|----------|
| `set_updated_at_workspaces` | workspaces | BEFORE UPDATE | `set_updated_at()` |
| `set_updated_at_api_keys` | api_keys | BEFORE UPDATE | `set_updated_at()` |
| `set_updated_at_qa_pairs` | qa_pairs | BEFORE UPDATE | `set_updated_at()` |
| `set_updated_at_chat_sessions` | chat_sessions | BEFORE UPDATE | `set_updated_at()` |
| `set_updated_at_agent_prompts` | agent_prompts | BEFORE UPDATE | `set_updated_at()` |

**Note:** `qa_gaps` has no `updated_at` column and no trigger — gaps are insert-once and status is transitioned via direct update.

---

## Row Level Security (RLS)

All seven tables have RLS enabled. Policies enforce workspace ownership.

| Table | Policy Name | Operation | Rule |
|-------|-------------|-----------|------|
| workspaces | `workspace_owner` | ALL | `owner_id = auth.uid()` |
| api_keys | `api_keys_owner` | ALL | `workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())` |
| qa_pairs | `qa_pairs_owner` | ALL | `workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())` |
| chat_sessions | `chat_sessions_owner` | ALL | `workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())` |
| qa_gaps | `qa_gaps_owner` | ALL | `workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())` |
| agent_prompts | `agent_prompts_owner` | ALL | `workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())` |
| sales_call_analyses | `sales_call_analyses_owner` | ALL | `workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())` |

**Important:** The API routes that need to bypass RLS (e.g., `POST /api/chat` which is public) use the service role client (`createServerClient()`). Dashboard routes that go through user auth use the auth client.

---

## Supabase Storage

### Bucket: chatbot-assets

| Setting | Value |
|---------|-------|
| Bucket ID | `chatbot-assets` |
| Public | `true` (public read) |
| Purpose | User-uploaded avatars and chat icons |

**Path convention:**
```
chatbot-assets/{workspace_id}/avatar.{ext}
chatbot-assets/{workspace_id}/icon.{ext}
```

### Storage Policies

| Policy | Operation | Scope | Rule |
|--------|-----------|-------|------|
| Users can upload chatbot assets | INSERT | authenticated | Folder name matches user's workspace ID |
| Public read chatbot assets | SELECT | public | `bucket_id = 'chatbot-assets'` |
| Users can delete own chatbot assets | DELETE | authenticated | Folder name matches user's workspace ID |

---

## Migration SQL

### Migration 5A-1: Core Tables

Run this first in the Supabase SQL Editor on the new project.

```sql
-- ============================================
-- Migration 5A-1: Core tables for Clara chatbot
-- Run in Supabase SQL Editor on the NEW project
-- Schema is forward-compatible: includes v1.1 columns
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
-- summary column included for v1.1 (unused in v1.0)
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

### Migration 5A-2: Storage Bucket

Run this after Migration 5A-1.

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

### Migration: agent_prompts (sales-coach-1)

Run in the Supabase SQL Editor for the Clara project. Adds the generic, workspace-scoped prompt store used by all Clara agents.

```sql
-- ============================================
-- Migration: agent_prompts
-- Workspace-scoped, slug-keyed prompt store usable by any Clara agent.
-- ============================================

CREATE TABLE agent_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  agent_type text NOT NULL,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_prompts_workspace_slug_unique UNIQUE (workspace_id, slug),
  CONSTRAINT agent_prompts_slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
  CONSTRAINT agent_prompts_content_nonempty CHECK (length(trim(content)) > 0)
);

CREATE INDEX idx_agent_prompts_workspace ON agent_prompts(workspace_id);

CREATE TRIGGER set_updated_at_agent_prompts
  BEFORE UPDATE ON agent_prompts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE agent_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_prompts_owner ON agent_prompts
  FOR ALL USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );
```

**Seed (CE workspace) — Sales Coach (generic, applies to all sales reps):**

The prompt content is a discovery-call coaching template with `{{company}}`, `{{attendees}}`, `{{transcript}}`, etc. placeholders that will be interpolated by the Sales Coach engine in sales-coach-2. Insert via SQL — there is no POST endpoint.

```sql
INSERT INTO agent_prompts (workspace_id, slug, name, description, agent_type, content)
VALUES (
  '09aa62df-5af6-4cec-b565-c335e907327d',
  'sales-coach',
  'Sales Coach',
  'Coaches sales reps on discovery calls. Output posts to Slack.',
  'sales_coach',
  $PROMPT$<full prompt body — see live row>$PROMPT$
);
```

### Migration: sales_call_analyses (sales-coach-2)

Run in the Supabase SQL Editor. Stores Sales Coach output per Fireflies meeting.

```sql
-- ============================================
-- Migration: sales_call_analyses
-- Per-call Sales Coach output. Failures do NOT insert (allow natural retry).
-- ============================================

CREATE TABLE sales_call_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  fireflies_meeting_id text NOT NULL,
  rep_email text NOT NULL,
  rep_name text NOT NULL,
  call_title text,
  call_date timestamptz,
  duration_seconds integer,
  prospect_domain text,
  attendees jsonb NOT NULL DEFAULT '[]',
  fireflies_url text,
  prompt_slug text NOT NULL,
  claude_output text,
  slack_channel_id text,
  slack_parent_ts text,
  slack_thread_ts text,
  status text NOT NULL,
  error_message text,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_call_analyses_meeting_unique UNIQUE (workspace_id, fireflies_meeting_id),
  CONSTRAINT sales_call_analyses_status_check CHECK (status IN ('analyzed', 'failed', 'skipped'))
);

CREATE INDEX idx_sales_call_analyses_workspace_created
  ON sales_call_analyses(workspace_id, created_at DESC);

CREATE INDEX idx_sales_call_analyses_workspace_status
  ON sales_call_analyses(workspace_id, status);

ALTER TABLE sales_call_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY sales_call_analyses_owner ON sales_call_analyses
  FOR ALL USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );
```

---

## Column Count Summary

| Table | Columns |
|-------|---------|
| workspaces | 7 |
| api_keys | 10 |
| qa_pairs | 10 |
| chat_sessions | 11 |
| qa_gaps | 9 |
| agent_prompts | 11 |
| sales_call_analyses | 20 |
| **Total** | **78** |

---

## Forward-Compatibility Notes (v1.1)

These columns exist in the v1.0 schema but are not used by v1.0 code. They are included to avoid future migrations.

| Column | Table | v1.0 Behavior | v1.1 Purpose |
|--------|-------|---------------|-------------|
| `onboarding_completed_steps` | workspaces | Always `[]`, never read | Tracks which onboarding wizard steps are complete |
| `summary` | chat_sessions | Always `NULL`, never written | AI-generated conversation summary + visitor intent |
| `powered_by_clara` | workspaces.settings | Always `true`, hardcoded in UI | Toggle in Settings to show/hide "Powered by Clara" footer |

---

## Security Rules (Schema-Level)

1. **Never return `encrypted_key`** from any GET endpoint — only `key_last4`
2. **Service role client** (`createServerClient()`) for public endpoints and admin operations — bypasses RLS
3. **Auth client** (`createAuthClient()`) for dashboard server components — respects RLS
4. **Browser client** (`createClient()`) for client-side operations — respects RLS
5. **Workspace isolation** enforced at both application level (every query includes `workspace_id`) AND RLS policy level
6. **Storage paths** scoped to workspace ID — users can only upload to their own folder
