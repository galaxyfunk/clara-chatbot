# SESSION 2 BRIEF — All API Routes

**Date:** February 22, 2026
**Session:** 2 of 4
**Steps:** 6–9
**Goal:** Every API route built, tested with curl, and committed
**Repo:** https://github.com/galaxyfunk/clara-chatbot
**Prerequisite:** Session 1 complete — all lib functions, types, auth, and Supabase clients exist

---

## IMPORTANT CONTEXT

You are building Clara — a multi-tenant AI chatbot SaaS. This is Session 2 of 4. Read CLAUDE.md and CONVENTIONS.md in the repo root FIRST. They contain architecture rules and code patterns you MUST follow.

**Session 1 already built:**
- Project scaffolded with CE brand tokens
- Supabase: 5 tables, indexes, RLS, `search_qa_pairs` function, storage bucket
- Auth: middleware, login page, dashboard layout with `ensureWorkspace`
- All type files in `src/types/` (workspace, qa, chat, gaps, api-keys)
- All lib functions in `src/lib/` (encryption, embed, llm/provider, workspace, chat/dedup, chat/engine, chat/extract-qa, chat/improve-qa)

**What you're building now:** Every API route. All routes are thin wrappers that delegate to lib functions. Follow the API Route Pattern in CONVENTIONS.md exactly.

**Key rules — do not violate:**
- Route files are THIN — all logic lives in `/lib`
- Always wrap in try-catch
- Always return `{ success: boolean, ...data }` or `{ success: false, error: string }`
- Workspace isolation — every authenticated query filters by workspace_id
- Never return raw API keys — only `keyLast4`
- Sequential embedding generation — never Promise.all
- Test each route with curl BEFORE moving to the next step

---

## AUTH HELPER PATTERN FOR AUTHENTICATED ROUTES

Every authenticated route needs to get the current user and their workspace. Use this pattern at the top of every authenticated route handler:

```typescript
import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';

export async function METHOD(request: Request) {
  try {
    // 1. Get authenticated user
    const authClient = await createAuthClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get user's workspace
    const supabase = createServerClient();
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .single();
    if (wsError || !workspace) {
      return NextResponse.json({ success: false, error: 'Workspace not found' }, { status: 404 });
    }
    const workspaceId = workspace.id;

    // 3. Route-specific logic here (delegate to lib functions)
    // ...

    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
```

**Important:** Use `createAuthClient()` (SSR with cookies) to get the user, then `createServerClient()` (service role) for data queries. This is the pattern — don't mix them up.

---

## STEP 6: Q&A CRUD Routes

### 6a. GET + POST `/api/qa-pairs/route.ts`

**File: `src/app/api/qa-pairs/route.ts`**

**GET** — List all Q&A pairs for the workspace.
- Auth required (use auth helper pattern above)
- Query params: `search` (optional text filter), `category` (optional filter), `active_only` (optional boolean, default true)
- Select: `id, question, answer, category, source, is_active, metadata, created_at, updated_at`
- Filter by `workspace_id`
- If `search` param exists, filter with `.or(`question.ilike.%${search}%,answer.ilike.%${search}%`)`
- If `category` param exists, filter with `.eq('category', category)`
- If `active_only` is not explicitly `false`, filter with `.eq('is_active', true)`
- Order by `created_at` descending
- Return `{ success: true, pairs: data }`

**POST** — Create a new Q&A pair with dedup check + auto-embed.
- Auth required
- Body: `{ question: string, answer: string, category?: string, source?: string, metadata?: object }`
- Validate: question and answer required, both non-empty after trim
- Call `checkForDuplicate(question, workspaceId)` from `@/lib/chat/dedup`
- If duplicate found (> 0.95 similarity), return `{ success: true, warning: 'Similar Q&A pair already exists', existingId, similarity, created: false }`
- If not duplicate:
  - Generate embedding: `const embedding = await generateEmbedding(question)` from `@/lib/embed`
  - Insert into `qa_pairs` with workspace_id, question, answer, category (default 'general'), source (default 'manual'), embedding, metadata
  - Return `{ success: true, pair: data, created: true }`

### 6b. PATCH + DELETE `/api/qa-pairs/[id]/route.ts`

**File: `src/app/api/qa-pairs/[id]/route.ts`**

**PATCH** — Update a Q&A pair. Re-embed if question changes.
- Auth required
- Get pair ID from route params: `{ params }: { params: Promise<{ id: string }> }` — use `const { id } = await params;`
- Body: `{ question?: string, answer?: string, category?: string, is_active?: boolean }`
- Verify the pair belongs to the user's workspace: query `qa_pairs` where `id = pairId AND workspace_id = workspaceId`
- If not found, return 404
- Build update object from provided fields only
- **If question changed:** regenerate embedding and include in update
- Update the row, set `updated_at` to `new Date().toISOString()`
- Return `{ success: true, pair: updatedData }`

**DELETE** — Soft-delete a Q&A pair (set `is_active = false`).
- Auth required
- Get pair ID from route params (same pattern as PATCH)
- Verify pair belongs to workspace
- Update `is_active = false`, `updated_at = now`
- Return `{ success: true, deleted: true }`

### 6c. Test Step 6 with curl

```bash
# Start dev server
npm run dev

# GET all pairs (should be empty)
curl -b cookies.txt http://localhost:3000/api/qa-pairs

# POST a new pair
curl -X POST -b cookies.txt -H "Content-Type: application/json" \
  -d '{"question":"What is Cloud Employee?","answer":"Cloud Employee is a B2B staff augmentation company.","category":"general"}' \
  http://localhost:3000/api/qa-pairs

# GET again (should have 1 pair)
curl -b cookies.txt http://localhost:3000/api/qa-pairs

# PATCH the pair (use the id from the POST response)
curl -X PATCH -b cookies.txt -H "Content-Type: application/json" \
  -d '{"answer":"Cloud Employee is an 11-year-old B2B staff augmentation company based in the UK and Philippines."}' \
  http://localhost:3000/api/qa-pairs/{PAIR_ID}

# DELETE (soft) the pair
curl -X DELETE -b cookies.txt http://localhost:3000/api/qa-pairs/{PAIR_ID}
```

**Note on curl auth:** Cookie-based auth with curl can be tricky with Supabase SSR. If curl doesn't work for auth, test via the browser console with `fetch()` instead:

```javascript
// In browser console while logged in at localhost:3000/dashboard
const res = await fetch('/api/qa-pairs');
const data = await res.json();
console.log(data);
```

**✅ CHECKPOINT:** Q&A CRUD routes working. Commit.

```bash
git add .
git commit -m "feat: Q&A CRUD routes - GET/POST qa-pairs, PATCH/DELETE qa-pairs/[id]"
git push
```

---

## STEP 7: Q&A Import + Extraction Routes

### 7a. Install papaparse

```bash
npm install papaparse
npm install -D @types/papaparse
```

### 7b. POST `/api/qa-pairs/import/route.ts`

**File: `src/app/api/qa-pairs/import/route.ts`**

CSV import with overlap detection. This is a **preview** endpoint — it parses CSV, checks for overlaps, and returns results. It does NOT save yet (that's bulk-save).

- Auth required
- Body: `{ csv_text: string }` — raw CSV content (the UI will read the file and send text)
- Parse CSV with papaparse:
  ```typescript
  import Papa from 'papaparse';
  const parsed = Papa.parse(body.csv_text, { header: true, skipEmptyLines: true });
  ```
- Expect columns: `question`, `answer`, `category` (category optional, defaults to 'general')
- Validate each row: question and answer must be non-empty
- Collect parse errors from `parsed.errors` into the errors array
- For each valid row, check overlap: generate embedding, run `search_qa_pairs` with threshold 0.85
- Build result array with overlap info per pair (same shape as `ExtractedQAPair` from types/qa.ts)
- Return `{ success: true, pairs: ExtractedQAPair[], totalFound, newCount, overlapCount, errors: string[] }`
- **Sequential processing** — loop through rows one at a time, never Promise.all for embedding calls

```typescript
export const maxDuration = 60; // CSV import can be slow with many rows
```

### 7c. POST `/api/qa-pairs/extract/route.ts`

**File: `src/app/api/qa-pairs/extract/route.ts`**

Transcript extraction via Claude.

- Auth required
- Body: `{ text: string }` — raw transcript text
- Validate: text must be non-empty, max 50,000 characters
- Call `extractQAPairsFromTranscript(text, workspaceId)` from `@/lib/chat/extract-qa`
- Return `{ success: true, ...result }` (result is `TranscriptExtractionResult`)

```typescript
export const maxDuration = 60; // Extraction can be slow
```

### 7d. POST `/api/qa-pairs/improve/route.ts`

**File: `src/app/api/qa-pairs/improve/route.ts`**

AI improve a single Q&A pair.

- Auth required
- Body: `{ question: string, answer: string }`
- Validate: both non-empty
- Call `improveQAPair(question, answer)` from `@/lib/chat/improve-qa`
- Return `{ success: true, improved: { question, answer } }`

### 7e. POST `/api/qa-pairs/bulk-save/route.ts`

**File: `src/app/api/qa-pairs/bulk-save/route.ts`**

Save multiple Q&A pairs from import or extraction.

- Auth required
- Body: `{ pairs: Array<{ question: string, answer: string, category?: string }>, source: 'csv_import' | 'transcript_extraction', import_batch_id?: string }`
- Validate: pairs array non-empty
- For each pair:
  - Generate embedding (sequential — for loop, NOT Promise.all)
  - Insert into `qa_pairs` with workspace_id, source, metadata including `import_batch_id` if provided
  - Collect successes and errors
- Return `{ success: true, imported: number, errors: string[] }`

```typescript
export const maxDuration = 120; // Bulk save with embeddings can be very slow
```

### 7f. Test Step 7

```javascript
// Test in browser console while logged in

// Test extract
const extractRes = await fetch('/api/qa-pairs/extract', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: 'Interviewer: How long does it take to hire someone?\nGuest: Our typical timeline is about 2 to 4 weeks from initial briefing to presenting candidates.\n\nInterviewer: What about retention rates?\nGuest: We have a 97% retention rate across all our developers.' })
});
console.log(await extractRes.json());

// Test improve
const improveRes = await fetch('/api/qa-pairs/improve', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question: 'how long does hiring take', answer: 'um so its usually like 2 to 4 weeks from when we get the brief to showing candidates' })
});
console.log(await improveRes.json());

// Test CSV import (preview)
const importRes = await fetch('/api/qa-pairs/import', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ csv_text: 'question,answer,category\n"What is your pricing?","Our pricing starts at $2,500/month per developer.","pricing"\n"Where are your developers?","Our developers are based in the Philippines.","developers"' })
});
console.log(await importRes.json());

// Test bulk save (save the extracted or imported pairs)
const bulkRes = await fetch('/api/qa-pairs/bulk-save', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pairs: [
      { question: 'What is your typical hiring timeline?', answer: 'Our typical timeline is 2-4 weeks from briefing to candidate presentation.', category: 'process' },
      { question: 'What is your retention rate?', answer: 'We maintain a 97% retention rate across all developers.', category: 'retention' }
    ],
    source: 'transcript_extraction'
  })
});
console.log(await bulkRes.json());
```

**✅ CHECKPOINT:** Import, extract, improve, bulk-save all working. Commit.

```bash
git add .
git commit -m "feat: Q&A import, extraction, improve, and bulk-save routes"
git push
```

---

## STEP 8: Keys + Upload + Gaps + Sessions + Workspace + Stats Routes

This step has many routes but they're all simple CRUD. Build them all, then test.

### 8a. GET + POST `/api/api-keys/route.ts`

**File: `src/app/api/api-keys/route.ts`**

**GET** — List all API keys for workspace.
- Auth required
- Select: `id, provider, model, key_last4, label, is_default, is_active, created_at, updated_at`
- **NEVER select `encrypted_key`** — only return `key_last4`
- Filter by workspace_id
- Return `{ success: true, keys: data }`

**POST** — Add a new API key.
- Auth required
- Body: `{ provider: string, model: string, api_key: string, label?: string, is_default?: boolean }`
- Validate: provider must be 'openai' or 'anthropic', model must be in SUPPORTED_MODELS (`SUPPORTED_MODELS.some(m => m.id === model)`), api_key non-empty
- **Validate the API key works** — make a minimal test call:
  - For anthropic: `new Anthropic({ apiKey }).messages.create({ model, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] })`
  - For openai: `new OpenAI({ apiKey }).chat.completions.create({ model, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] })`
  - If validation fails, return `{ success: false, error: 'Invalid API key — could not connect to provider' }`
- Encrypt the key: `const encrypted = encrypt(api_key)` from `@/lib/encryption`
- Extract last 4 chars: `const key_last4 = api_key.slice(-4)`
- If `is_default` is true, first unset any existing default: update all keys for this workspace to `is_default = false`
- Insert into `api_keys`
- Return `{ success: true, key: { id, provider, model, key_last4, label, is_default, is_active } }` — **NO encrypted_key in response**

### 8b. PATCH + DELETE `/api/api-keys/[id]/route.ts`

**File: `src/app/api/api-keys/[id]/route.ts`**

**PATCH** — Update key settings (toggle default, toggle active, update label).
- Auth required
- Params: `{ params: Promise<{ id: string }> }` — `const { id } = await params;`
- Body: `{ is_default?: boolean, is_active?: boolean, label?: string }`
- Verify key belongs to workspace
- If setting `is_default = true`, first unset all other defaults for workspace
- Update the key
- Return `{ success: true, key: updatedData }` — no encrypted_key

**DELETE** — Hard delete the key.
- Auth required
- Verify key belongs to workspace
- Delete from `api_keys`
- Return `{ success: true, deleted: true }`

### 8c. POST `/api/upload/route.ts`

**File: `src/app/api/upload/route.ts`**

Image upload to Supabase Storage.

- Auth required
- Parse multipart form data: `const formData = await request.formData()`
- Get file: `const file = formData.get('file') as File`
- Get type: `const type = formData.get('type') as string` — either 'avatar' or 'icon'
- Validate: file exists, file size < 2MB, file type is image (jpeg, png, gif, webp, svg+xml)
- Extract extension from filename: `const ext = file.name.split('.').pop() || 'png'`
- Generate path: `const path = \`${workspaceId}/${type}-${Date.now()}.${ext}\``
- **Convert File to Buffer and upload via Supabase Storage:**
  ```typescript
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from('chatbot-assets')
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
  
  const { data: urlData } = supabase.storage
    .from('chatbot-assets')
    .getPublicUrl(path);
  ```
- Return `{ success: true, url: urlData.publicUrl }`

### 8d. GET `/api/gaps/route.ts`

**File: `src/app/api/gaps/route.ts`**

- Auth required
- Query param: `status` (optional, default 'open')
- Select all gap fields plus the best match question via a join or separate query
- Filter by workspace_id and status
- Order by `created_at` descending
- For each gap, if `best_match_id` exists, fetch the matching Q&A pair's question
- Return `{ success: true, gaps: data }`

### 8e. POST `/api/gaps/resolve/route.ts`

**File: `src/app/api/gaps/resolve/route.ts`**

Resolve a gap by creating a new Q&A pair.

- Auth required
- Body: `{ gap_id: string, question: string, answer: string, category?: string }`
- Validate: gap_id, question, answer all required
- Verify gap belongs to workspace and status is 'open'
- Generate embedding for the question
- Insert new Q&A pair (source: 'manual', include embedding)
- Update gap: set `status = 'resolved'`, `resolved_qa_id = newPair.id`
- Return `{ success: true, pair: newPair, gap: updatedGap }`

### 8f. POST `/api/gaps/dismiss/route.ts`

**File: `src/app/api/gaps/dismiss/route.ts`**

- Auth required
- Body: `{ gap_id: string }`
- Verify gap belongs to workspace and status is 'open'
- Update gap: set `status = 'dismissed'`
- Return `{ success: true, dismissed: true }`

### 8g. GET `/api/sessions/route.ts`

**File: `src/app/api/sessions/route.ts`**

- Auth required
- Select: `id, session_token, messages, escalated, escalated_at, created_at, updated_at`
- Filter by workspace_id
- Order by `updated_at` descending
- For each session, compute: `message_count` (length of messages array)
- Return `{ success: true, sessions: data }`

### 8h. GET + PATCH `/api/workspace/route.ts`

**File: `src/app/api/workspace/route.ts`**

**⚠️ NOTE:** Unlike other routes, this route needs the FULL workspace row (not just `id`). When getting the workspace for auth, select `*` instead of just `id`:
```typescript
const { data: workspace, error: wsError } = await supabase
  .from('workspaces')
  .select('*')
  .eq('owner_id', user.id)
  .single();
```

**GET** — Get workspace and settings.
- Auth required (with full workspace select as shown above)
- Return `{ success: true, workspace: data }`

**PATCH** — Update workspace settings.
- Auth required (with full workspace select as shown above)
- Body: `{ name?: string, settings?: Partial<WorkspaceSettings> }`
- If settings provided, **merge** with existing settings (don't replace):
  ```typescript
  const currentSettings = workspace.settings;
  const mergedSettings = { ...currentSettings, ...body.settings };
  ```
- Update workspace row
- Return `{ success: true, workspace: updatedData }`

### 8i. GET `/api/dashboard/stats/route.ts`

**File: `src/app/api/dashboard/stats/route.ts`**

Aggregate dashboard stats.

- Auth required
- Run these queries (all filtered by workspace_id):
  - `qa_pairs` count where `is_active = true`
  - `chat_sessions` count
  - `qa_gaps` count where `status = 'open'`
  - `chat_sessions` count where `escalated = true`
- Return `{ success: true, stats: { totalPairs, totalSessions, openGaps, escalations } }`

### 8j. Test Step 8

```javascript
// Test in browser console while logged in

// Test workspace GET
const wsRes = await fetch('/api/workspace');
console.log(await wsRes.json());

// Test workspace PATCH (update display name)
const wsPatchRes = await fetch('/api/workspace', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ settings: { display_name: 'TestBot' } })
});
console.log(await wsPatchRes.json());

// Test stats
const statsRes = await fetch('/api/dashboard/stats');
console.log(await statsRes.json());

// Test add API key (use a real key or expect validation error)
const keyRes = await fetch('/api/api-keys', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    api_key: 'sk-ant-test-key-here',
    label: 'My Claude Key',
    is_default: true
  })
});
console.log(await keyRes.json());

// Test list keys (should NOT contain encrypted_key)
const keysRes = await fetch('/api/api-keys');
const keysData = await keysRes.json();
console.log(keysData);
// VERIFY: no key in response has an 'encrypted_key' field

// Test gaps (should be empty or have gaps from chat testing)
const gapsRes = await fetch('/api/gaps');
console.log(await gapsRes.json());

// Test sessions
const sessionsRes = await fetch('/api/sessions');
console.log(await sessionsRes.json());

// Test upload (use browser file input or skip — UI will test this)
```

**✅ CHECKPOINT:** All supporting routes working. Commit.

```bash
git add .
git commit -m "feat: api-keys, upload, gaps, sessions, workspace, stats routes"
git push
```

---

## STEP 9: Chat Endpoint

### 9a. POST `/api/chat/route.ts`

**File: `src/app/api/chat/route.ts`**

This route is PUBLIC (no auth required — workspace_id is passed in the body). The code is already in the scope doc:

```typescript
import { NextResponse } from 'next/server';
import { processChat } from '@/lib/chat/engine';
import type { ChatRequest } from '@/types/chat';

export async function POST(request: Request) {
  try {
    const body: ChatRequest = await request.json();
    if (!body.workspace_id || !body.session_token || !body.message) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }
    if (body.message.length > 2000) {
      return NextResponse.json({ success: false, error: 'Message too long (max 2000 characters)' }, { status: 400 });
    }
    const response = await processChat(body);
    return NextResponse.json({ success: true, ...response });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const maxDuration = 30;
```

### 9b. Full Flow Test — The Hero Moment 🎬

This is the critical test. Clara speaks for the first time.

**Prerequisites for this test:**
1. You must have at least 2-3 Q&A pairs in the database (created via Step 6)
2. You must have a valid API key added (created via Step 8)
3. That API key must be set as default

**Test script:**

```javascript
// Get your workspace ID first
const wsRes = await fetch('/api/workspace');
const wsData = await wsRes.json();
const workspaceId = wsData.workspace.id;

// Generate a session token
const sessionToken = crypto.randomUUID();

// Send a chat message
const chatRes = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workspace_id: workspaceId,
    session_token: sessionToken,
    message: 'What is Cloud Employee?',
    message_id: crypto.randomUUID()
  })
});
const chatData = await chatRes.json();
console.log('🦞 Clara says:', chatData);

// Verify response has expected shape
console.log('Answer:', chatData.answer);
console.log('Chips:', chatData.suggestion_chips);
console.log('Confidence:', chatData.confidence);
console.log('Gap detected:', chatData.gap_detected);

// Test a question that should trigger a gap
const gapRes = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workspace_id: workspaceId,
    session_token: sessionToken,
    message: 'Do you offer a free trial?',
    message_id: crypto.randomUUID()
  })
});
const gapData = await gapRes.json();
console.log('Gap test:', gapData);
console.log('Gap detected:', gapData.gap_detected);

// Check that a gap was created
const gapsCheck = await fetch('/api/gaps');
console.log('Gaps:', await gapsCheck.json());

// Check that a session was created
const sessionsCheck = await fetch('/api/sessions');
console.log('Sessions:', await sessionsCheck.json());
```

**Expected results:**
- First message returns a confident answer based on your Q&A pairs
- `suggestion_chips` array has 1-3 relevant follow-up questions
- `confidence` is > 0.78 (the default threshold)
- Second message (unknown question) has `gap_detected: true`
- A new gap appears in `/api/gaps`
- A session with 4 messages (2 user, 2 assistant) appears in `/api/sessions`

**✅ CHECKPOINT:** Chat engine working end-to-end. Commit.

```bash
git add .
git commit -m "feat: chat endpoint - Clara speaks! Full flow verified"
git push
```

---

## REFERENCE: Type Interfaces Used by Routes

These already exist in your `src/types/` directory from Session 1. Listed here for quick reference — **do NOT recreate them**.

**From `src/types/qa.ts`:**
- `QAPair` — full pair shape
- `QAPairFormData` — `{ question, answer, category }`
- `QAImportResult` — `{ imported, skipped, duplicates, errors }`
- `ExtractedQAPair` — `{ question, answer, category, confidence, existingMatchId?, existingMatchScore?, isNew }`
- `TranscriptExtractionResult` — `{ pairs, totalFound, newCount, overlapCount }`
- `DEFAULT_CATEGORIES` — readonly array of category strings

**From `src/types/chat.ts`:**
- `ChatRequest` — `{ workspace_id, session_token, message, message_id }`
- `ChatResponse` — `{ answer, suggestion_chips, confidence, gap_detected, escalation_offered, booking_url, matched_pairs }`
- `ChatMessage` — full message shape with optional fields

**From `src/types/api-keys.ts`:**
- `LLMProvider` — `'openai' | 'anthropic'`
- `SUPPORTED_MODELS` — readonly array of supported models
- `ApiKey` — full key shape (with keyLast4, NOT encrypted_key)
- `ApiKeyFormData` — `{ provider, model, apiKey, label?, isDefault }`

**From `src/types/gaps.ts`:**
- `GapStatus` — `'open' | 'resolved' | 'dismissed'`
- `QAGap` — full gap shape
- `GapResolveRequest` — `{ gapId, question, answer, category }`

**From `src/types/workspace.ts`:**
- `Workspace` — full workspace shape
- `WorkspaceSettings` — all settings fields

---

## REFERENCE: Lib Functions Called by Routes

These already exist in `src/lib/`. Listed here so you know the exact function signatures — **do NOT recreate them**.

| Function | Import | Signature |
|----------|--------|-----------|
| `encrypt` | `@/lib/encryption` | `(plaintext: string) => string` |
| `decrypt` | `@/lib/encryption` | `(encrypted: string) => string` |
| `generateEmbedding` | `@/lib/embed` | `(text: string) => Promise<number[]>` |
| `chatCompletion` | `@/lib/llm/provider` | `(provider, model, apiKey, messages, options?) => Promise<LLMResponse>` |
| `checkForDuplicate` | `@/lib/chat/dedup` | `(question, workspaceId, threshold?) => Promise<{ isDuplicate, existingId?, similarity? }>` |
| `processChat` | `@/lib/chat/engine` | `(request: ChatRequest) => Promise<ChatResponse>` |
| `extractQAPairsFromTranscript` | `@/lib/chat/extract-qa` | `(transcript, workspaceId) => Promise<TranscriptExtractionResult>` |
| `improveQAPair` | `@/lib/chat/improve-qa` | `(question, answer) => Promise<{ question, answer }>` |
| `ensureWorkspace` | `@/lib/workspace` | `(userId: string) => Promise<Workspace>` |
| `createServerClient` | `@/lib/supabase/server` | `() => SupabaseClient` |
| `createAuthClient` | `@/lib/supabase/auth-server` | `() => Promise<SupabaseClient>` |

---

## REFERENCE: File Structure After Session 2

```
src/app/api/
├── chat/
│   └── route.ts                    POST (public)
├── qa-pairs/
│   ├── route.ts                    GET + POST (auth)
│   ├── [id]/
│   │   └── route.ts                PATCH + DELETE (auth)
│   ├── import/
│   │   └── route.ts                POST (auth)
│   ├── extract/
│   │   └── route.ts                POST (auth)
│   ├── improve/
│   │   └── route.ts                POST (auth)
│   └── bulk-save/
│       └── route.ts                POST (auth)
├── api-keys/
│   ├── route.ts                    GET + POST (auth)
│   └── [id]/
│       └── route.ts                PATCH + DELETE (auth)
├── upload/
│   └── route.ts                    POST (auth)
├── gaps/
│   ├── route.ts                    GET (auth)
│   ├── resolve/
│   │   └── route.ts                POST (auth)
│   └── dismiss/
│       └── route.ts                POST (auth)
├── sessions/
│   └── route.ts                    GET (auth)
├── workspace/
│   └── route.ts                    GET + PATCH (auth)
└── dashboard/
    └── stats/
        └── route.ts                GET (auth)
```

**Total: 14 route files, 20 HTTP methods**

---

## SESSION 2 COMPLETE — Exit Criteria

After completing all 4 steps, verify:

- [ ] Project runs with `npm run dev` (no errors)
- [ ] No TypeScript errors across all route files
- [ ] GET `/api/qa-pairs` returns pairs filtered by workspace
- [ ] POST `/api/qa-pairs` creates pair with dedup check + embedding
- [ ] PATCH `/api/qa-pairs/[id]` updates pair, re-embeds if question changed
- [ ] DELETE `/api/qa-pairs/[id]` soft-deletes (is_active = false)
- [ ] POST `/api/qa-pairs/import` parses CSV and returns overlap preview
- [ ] POST `/api/qa-pairs/extract` sends text to Claude, returns extracted pairs
- [ ] POST `/api/qa-pairs/improve` returns improved question + answer
- [ ] POST `/api/qa-pairs/bulk-save` saves multiple pairs with embeddings
- [ ] GET `/api/api-keys` returns keys with keyLast4 only (NO encrypted_key)
- [ ] POST `/api/api-keys` validates key with provider, encrypts, saves
- [ ] PATCH `/api/api-keys/[id]` toggles default/active, updates label
- [ ] DELETE `/api/api-keys/[id]` hard deletes key
- [ ] POST `/api/upload` uploads image to Supabase Storage, returns URL
- [ ] GET `/api/gaps` returns gap queue filtered by status
- [ ] POST `/api/gaps/resolve` creates Q&A pair + updates gap status
- [ ] POST `/api/gaps/dismiss` updates gap to dismissed
- [ ] GET `/api/sessions` returns session list with message counts
- [ ] GET/PATCH `/api/workspace` reads and updates workspace settings (merge, not replace)
- [ ] GET `/api/dashboard/stats` returns aggregate counts
- [ ] POST `/api/chat` — **FULL FLOW WORKS:** question → embedding → vector search → LLM response → suggestion chips → gap detection → session logging
- [ ] Chat: idempotency works (same message_id returns cached response)
- [ ] Chat: gap dedup works (same question doesn't create duplicate gaps)
- [ ] Chat: rate limiting works (100 msg/session/hour)
- [ ] All code pushed to GitHub

**Next session:** Session 3 — All Dashboard UI (Steps 10–14)
