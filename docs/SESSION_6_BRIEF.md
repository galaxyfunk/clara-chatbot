# SESSION 6 BRIEF — Intelligence Features (v1.1 Session 2)

**Builds on:** Session 5 complete (v1.1 Quick Wins — deploy fixes, sliding window, powered-by toggle, custom categories, gap export, improve revert, session search, iframe responsiveness, bulk ops, test-this-pair)
**Estimated time:** ~2-3 hours Claude Code
**Reference:** CLAUDE.md, CONVENTIONS.md for architecture rules and code patterns

---

## What This Session Ships

4 intelligence features that make Clara significantly smarter:

1. **.docx/.pdf transcript upload** — File upload alongside paste for transcript extraction
2. **Gap auto-resolution** — Bulk-saving Q&A pairs auto-resolves matching open gaps
3. **Conversation summaries** — AI-powered structured analysis after each chat response
4. **Visitor intent cards** — Summary data displayed on sessions page

**⚠️ Build order matters:** Visitor intent cards (#4) depend on conversation summaries (#3) — they read the same `summary` JSONB column.

---

## New Dependencies

```bash
npm install mammoth pdf-parse
```

- `mammoth` — .docx → plain text (does NOT support legacy .doc binary format)
- `pdf-parse` — .pdf → plain text. **Import as `pdf-parse/lib/pdf-parse.js`** to avoid Vercel bundling issues

---

## Feature 1: .docx/.pdf Transcript Upload

### New Lib: `src/lib/files/parse.ts`

```typescript
export async function parseFileToText(
  buffer: Buffer,
  mimeType: string
): Promise<{ text: string; pageCount?: number }>
```

**Supported MIME types:**
- `application/pdf` → use `pdf-parse`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` → use `mammoth`

**Rejected:**
- `application/msword` (.doc) → Return clear error: "Please convert your .doc file to .docx and try again."

**Rules:**
- 4MB file size limit — check before processing
- Wrap in try-catch for OOM protection on large PDFs
- PDF import path: `import pdf from 'pdf-parse/lib/pdf-parse.js'` (Vercel bundling fix)

### Modified Route: `POST /api/qa-pairs/extract`

**Changes:**
- Accept multipart form data (.docx/.pdf upload) IN ADDITION to existing JSON body (paste text)
- Add `export const runtime = 'nodejs'` — Buffer/pdf-parse are NOT Edge-compatible
- If file uploaded: parse file → extract text → feed to existing extraction pipeline
- If text pasted: existing behavior unchanged
- Reject .doc with clear message

### New Component: `src/components/knowledge/file-upload-zone.tsx`

Drag-and-drop zone for .docx and .pdf files. Add as a tab option on the transcript extraction page alongside the existing paste textarea.

**Accepted extensions:** `.docx`, `.pdf`
**Max size:** 4MB
**UX:** Drag-drop zone with accepted formats listed. Show filename after selection. Error state for wrong format or too large.

### Modified Component: Extraction page (`src/app/dashboard/knowledge/extract/page.tsx` or `extraction-results.tsx`)

The existing extraction page currently only has a paste textarea. Add a **tab interface** (e.g., "Paste Text" | "Upload File") so users can switch between paste and file upload. The `file-upload-zone.tsx` component renders in the "Upload File" tab. Both paths feed into the same extraction pipeline and results display.

### Git commit: `feat: .docx/.pdf transcript upload with mammoth + pdf-parse`

---

## Feature 2: Gap Auto-Resolution

### New Lib: `src/lib/chat/auto-resolve-gaps.ts`

```typescript
export async function autoResolveGaps(
  workspaceId: string,
  newPairIds: string[]
): Promise<{ resolvedCount: number; resolvedGapIds: string[] }>
```

**How it works:**
1. Fetch the newly saved Q&A pairs and their embeddings by ID (direct query — NOT vector search)
2. Query open gaps for the workspace — **cap at 50 most recent open gaps** to prevent cost explosion
3. For each open gap: generate embedding, compare against the new pair embeddings directly
4. If similarity > workspace `confidence_threshold` → resolve the gap
5. Update gap status to `'resolved'`, link via `resolved_qa_id`

**Critical rules:**
- Query new pairs by ID directly, not vector search
- Cap at 50 gaps max per run
- Use workspace's confidence_threshold setting
- Sequential embedding generation (never Promise.all)

### Modified Route: `POST /api/qa-pairs/bulk-save`

**Change:** After successfully saving pairs, call `autoResolveGaps()` with the new pair IDs. Return resolved count in response.

### Git commit: `feat: gap auto-resolution on bulk save`

---

## Feature 3: Conversation Summaries

### New Type: Add to `src/types/chat.ts`

```typescript
export interface ConversationSummary {
  summary: string;
  visitor_intent: string;
  topics_discussed: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  buying_stage: 'awareness' | 'consideration' | 'decision' | 'unknown';
  contact_info: {
    name: string | null;
    email: string | null;
    company: string | null;
  };
  action_items: string[];
  generated_at: string;
}
```

Also update the existing `ChatSession` interface to include:
```typescript
summary: ConversationSummary | null;
```
(The DB column already exists from v1.0 — `chat_sessions.summary` jsonb DEFAULT NULL)

### New Lib: `src/lib/chat/summarize.ts`

```typescript
export async function generateConversationSummary(
  messages: ChatMessage[],
  workspaceId: string,
  displayName: string    // Injected so prompt uses bot's name, not "Clara"
): Promise<ConversationSummary | null>
```

**Rules:**
- Uses **app-level** `ANTHROPIC_API_KEY` (not user key)
- **Model:** `claude-haiku-4-5-20251001` (summaries don't need Sonnet — Haiku is cheaper and fast enough for structured extraction)
- **Graceful degradation:** If `ANTHROPIC_API_KEY` not set → log warning, return `null`
- **JSON validation:** Parse LLM response, validate all required fields exist and enum values match. If malformed → log warning, return `null`. Never store garbage in DB. Use manual validation or zod.
- **`generated_at` added by code, NOT by the LLM.** The prompt does not ask for `generated_at`. After parsing and validating the LLM JSON, append `generated_at: new Date().toISOString()` before returning the `ConversationSummary` object.
- Called via `after()` pattern — never blocks chat response

**Summary prompt:**

```typescript
const SUMMARY_SYSTEM_PROMPT = (displayName: string) => `You are analyzing a conversation with ${displayName}, an AI assistant chatbot. Extract structured data from the messages.

Respond with JSON only (no markdown fences):
{
  "summary": "2-3 sentence overview of the conversation",
  "visitor_intent": "Primary intent in 3-6 words",
  "topics_discussed": ["topic1", "topic2"],
  "sentiment": "positive" | "neutral" | "negative",
  "buying_stage": "awareness" | "consideration" | "decision" | "unknown",
  "contact_info": {
    "name": "extracted name or null",
    "email": "extracted email or null",
    "company": "extracted company or null"
  },
  "action_items": ["Suggested follow-up 1", "Suggested follow-up 2"]
}

Rules:
1. Extract ONLY what is explicitly stated — never infer contact info
2. buying_stage: "awareness" = learning, "consideration" = comparing, "decision" = ready to buy/book
3. Keep summary factual and concise
4. action_items are suggestions for the business owner, not the visitor`;
```

### New Route: `POST /api/sessions/summarize`

```typescript
export const maxDuration = 30;
// Auth required. Manually triggers summary for a session.
// Request: { session_id: string }
// Response: { success: boolean, summary: ConversationSummary | null }
```

### Modified Route: `POST /api/chat`

**Add summary generation via `after()` pattern:**

```typescript
import { after } from 'next/server';

// AFTER building the response, BEFORE returning:
const totalMessages = updatedMessages.length;
const lastSummaryCount = existingSession?.metadata?.last_summary_message_count ?? 0;
const shouldSummarize = totalMessages >= 6 && (totalMessages - lastSummaryCount) >= 3;

// Build response first
const response = NextResponse.json({ success: true, ...responseData });

// Register background work
if (shouldSummarize) {
  after(async () => {
    const summary = await generateConversationSummary(
      updatedMessages,
      request.workspace_id,
      settings.display_name
    );
    if (summary) {
      // NOTE: Re-read current metadata inside after() to avoid race condition.
      // Between the main response and after() executing, another message could
      // have updated the session. Don't spread stale existingSession.metadata.
      const { data: currentSession } = await supabase.from('chat_sessions')
        .select('metadata')
        .eq('workspace_id', request.workspace_id)
        .eq('session_token', request.session_token)
        .single();

      await supabase.from('chat_sessions').update({
        summary,
        metadata: { ...(currentSession?.metadata ?? {}), last_summary_message_count: totalMessages }
      }).eq('workspace_id', request.workspace_id)
        .eq('session_token', request.session_token);
    }
  });
}

return response;
```

**Summary cooldown logic:**
- Only runs when session has 6+ total messages
- Only runs when 3+ new messages since last summary was generated
- Tracked via `metadata.last_summary_message_count`

**⚠️ CRITICAL: Use `after()` from `next/server`, NOT `void asyncFn()`.**
Vercel serverless functions freeze immediately after returning a response. Floating promises get killed. `after()` (Next.js 14.1+) runs work after response is sent but before lambda freezes.

If `after()` is not available in the project's Next.js version, do the summary BEFORE returning the response (accept the latency). Never fire-and-forget.

### Git commit: `feat: AI conversation summaries with structured extraction`

---

## Feature 4: Visitor Intent Cards

### New Component: `src/components/sessions/visitor-intent-card.tsx`

Displays the `ConversationSummary` data as a card on the session detail view.

**Card sections:**
- **Summary** — 2-3 sentence overview
- **Visitor Intent** — Badge/pill showing intent in 3-6 words
- **Topics** — Pill badges for each topic discussed
- **Sentiment** — Color-coded badge (green=positive, gray=neutral, red=negative)
- **Buying Stage** — Badge (awareness/consideration/decision/unknown)
- **Contact Info** — Name, email, company (only show if not null)
- **Action Items** — Bulleted list of follow-up suggestions

**Null handling:** If `session.summary` is null, show nothing (or a subtle "No summary yet" text). Don't show an empty card.

### Modified Component: `src/components/sessions/sessions-list.tsx`

- Add summary preview text (first ~80 chars of `summary.summary`) next to each session row
- Add intent badge (from `summary.visitor_intent`) as a pill on each session row
- Add sentiment indicator (small colored dot or icon)
- These only show when summary exists — graceful null handling

### Modified Route: `GET /api/sessions`

The sessions list endpoint must include `summary` in its SELECT query. If it currently only selects `id, session_token, messages, created_at, ...`, the frontend will get null for every session regardless of whether a summary exists. Ensure `summary` is in the select and returned in the response.

### Modified Component: Session detail view

- Add the `visitor-intent-card.tsx` component at the top of the session detail
- Show below the session messages/metadata

### Git commit: `feat: visitor intent cards on sessions page`

---

## Exit Criteria Checklist

- [ ] `npm install mammoth pdf-parse` — both installed
- [ ] .docx upload → text extraction → Q&A extraction pipeline works
- [ ] .pdf upload → text extraction → Q&A extraction pipeline works
- [ ] .doc upload → clear rejection message ("convert to .docx")
- [ ] 4MB file size check before processing
- [ ] Extract route has `export const runtime = 'nodejs'`
- [ ] File upload zone component with drag-drop on extraction page
- [ ] Extraction page has **tab UI** (paste text vs. upload file)
- [ ] Gap auto-resolution runs after bulk-save
- [ ] Auto-resolution capped at 50 gaps per run
- [ ] Auto-resolution queries by pair ID directly, not vector search
- [ ] Resolved gaps get `status: 'resolved'` + `resolved_qa_id` linked
- [ ] `ConversationSummary` type added to `src/types/chat.ts`
- [ ] `ChatSession` type updated with `summary: ConversationSummary | null`
- [ ] `generateConversationSummary()` in `src/lib/chat/summarize.ts`
- [ ] Summary uses **Haiku** model (`claude-haiku-4-5-20251001`) with app-level key
- [ ] `generated_at` added by **code** post-parse, NOT by LLM
- [ ] Graceful null if `ANTHROPIC_API_KEY` not set
- [ ] Summary JSON **validated** — malformed → null, not stored
- [ ] Summary **cooldown**: 6+ msgs total AND 3+ new msgs since last summary
- [ ] Summary runs via `after()` pattern, NOT `void`
- [ ] Metadata update inside `after()` re-reads current session (no stale spread)
- [ ] `POST /api/sessions/summarize` route works (manual trigger)
- [ ] `POST /api/chat` triggers summary in background when conditions met
- [ ] `GET /api/sessions` SELECT includes `summary` column
- [ ] Visitor intent card renders on session detail view
- [ ] Session list shows summary preview + intent badges
- [ ] Null summaries handled gracefully (no empty cards)

---

## Build Order (paste into Claude Code)

"Build Session 6 features (v1.1 Session 2: Intelligence). Work in this order:

1. **Install deps:** `npm install mammoth pdf-parse`
2. **File parsing lib:** Create `src/lib/files/parse.ts` with .docx/.pdf support, .doc rejection, 4MB check
3. **File upload zone:** Create `src/components/knowledge/file-upload-zone.tsx` — drag-drop for .docx/.pdf
4. **Modify extraction page:** Add tab UI (paste text vs. upload file) so file-upload-zone is wired in
5. **Modify extract route:** Accept multipart upload alongside paste. Add `runtime = 'nodejs'`. Parse file → extract text → existing pipeline
6. **Test file upload end-to-end** (upload .docx → extract Q&A pairs)
7. **Commit:** `feat: .docx/.pdf transcript upload with mammoth + pdf-parse`
8. **Auto-resolve lib:** Create `src/lib/chat/auto-resolve-gaps.ts` — cap 50 gaps, query by ID, sequential embeddings
9. **Modify bulk-save route:** Call `autoResolveGaps()` after saving pairs. Return resolved count.
10. **Test auto-resolution** (save pairs → verify matching gaps resolved)
11. **Commit:** `feat: gap auto-resolution on bulk save`
12. **Summary type:** Add `ConversationSummary` to `src/types/chat.ts`, update `ChatSession` interface
13. **Summary lib:** Create `src/lib/chat/summarize.ts` — Haiku model, app-level key, JSON validation, `generated_at` added post-parse, graceful null
14. **Summary route:** Create `POST /api/sessions/summarize` with `maxDuration = 30`
15. **Modify chat route:** Add `after()` summary generation with cooldown logic. Re-read metadata inside `after()` to avoid race condition.
16. **Test summaries** (chat 6+ messages → verify summary stored in DB with `generated_at`)
17. **Commit:** `feat: AI conversation summaries with structured extraction`
18. **Modify sessions GET route:** Ensure `summary` column is in SELECT query
19. **Intent card component:** Create `src/components/sessions/visitor-intent-card.tsx`
20. **Modify session list:** Add summary preview, intent badges, sentiment dots
21. **Modify session detail:** Add visitor intent card at top
22. **Test intent cards** (view session with summary → verify card renders)
23. **Commit:** `feat: visitor intent cards on sessions page`

Reference CLAUDE.md and CONVENTIONS.md for patterns. Commit after each feature."

---

## Reminders for Claude Code

- **`export const runtime = 'nodejs'`** on the extract route (pdf-parse needs Node, not Edge)
- **`export const maxDuration = 30`** on the summarize route (LLM call)
- **Summary model:** `claude-haiku-4-5-20251001` — cheaper than Sonnet, sufficient for structured extraction
- **`generated_at` is code-generated, NOT LLM-generated.** Append `generated_at: new Date().toISOString()` after parsing LLM JSON.
- **Re-read metadata inside `after()`** before writing — don't spread stale `existingSession.metadata`
- **Sequential embedding generation** — never `Promise.all` for AI/embedding calls
- **Workspace isolation** on every DB query
- **`after()` for background work** — never `void asyncFn()`
- **Validate LLM JSON output** — never trust raw parse. Check all required fields exist and enum values match. If malformed → return null. Use manual validation or zod.
- **Dynamic display name** — pass `settings.display_name` into the summary prompt, never hardcode "Clara"
- **Responsive as you build** — Tailwind responsive classes on all new components
- **Sessions GET route** must SELECT the `summary` column or intent cards will always show null
