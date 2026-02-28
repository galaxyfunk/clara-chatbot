# SESSION 5 BRIEF — Quick Wins + Infrastructure (v1.1 Session 1)

**Session:** 5 (overall) / 1 of 3 (v1.1)
**Focus:** 10 quick-win features — independent, low-risk, high-impact
**Estimated time:** 2-3 hours
**Pre-requisite:** v1.0 fully shipped and deployed

---

## Context

v1.0 is live at chatbot.jakevibes.dev. This session adds 10 independent features that don't depend on each other. Build in order, commit after each, test in browser after each UI change.

**Reference files in repo:** CLAUDE.md, CONVENTIONS.md, SCHEMA.md
**Architecture rules:** All existing v1.0 patterns remain. All logic in /lib, routes are thin wrappers, workspace isolation on every query, Tailwind only, dynamic display name.

---

## Build Order

### Feature 1: Deploy Fixes
**Files:** `next.config.ts`, `src/app/api/qa-pairs/improve/route.ts`

1. In `next.config.ts`, add `images.remotePatterns` for the Supabase storage host used in production. Find the exact hostname from the `NEXT_PUBLIC_SUPABASE_URL` env var — it will be something like `{project-ref}.supabase.co`. Add it:
```typescript
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: '*.supabase.co',
      pathname: '/storage/v1/object/public/**',
    },
  ],
},
```

2. Add `export const maxDuration = 30;` to the improve route if it's missing. Check if any other LLM-calling routes are missing it too.

**Commit:** `fix: deploy config — remotePatterns + maxDuration`

---

### Feature 2: Sliding Window Bump
**Files:** `src/lib/chat/engine.ts`

Find the line `const recentHistory = previousMessages.slice(-10);` (around line 227) and change to `slice(-20)`.

That's it. One line change.

**Commit:** `feat: bump sliding window 10 → 20 messages`

---

### Feature 3: "Powered by Clara" Toggle
**Files:** Content settings tab component, `/chat/[workspaceId]/page.tsx`, `public/widget.js`

`powered_by_clara` already exists in WorkspaceSettings with default `true`.

1. In the Content tab (`src/components/settings/` — find the content tab component), add a toggle/checkbox:
```
☑ Show "Powered by Clara" in widget footer
```

2. In the public chat page (`/chat/[workspaceId]/page.tsx`), conditionally render the "Powered by Clara" footer based on `settings.powered_by_clara`.

3. In `public/widget.js`, if the widget reads settings, respect this flag there too.

**Note:** "Powered by Clara" is the product brand — this is intentionally hardcoded as "Clara" (not `display_name`). It's the one exception to the "never hardcode Clara" rule.

**Commit:** `feat: powered-by-clara toggle in settings`

---

### Feature 4: Custom Categories + Fix Category Mismatch
**Files:** `src/types/workspace.ts`, `src/types/qa.ts`, `src/components/` (qa-pair-form, gap-resolve-form), `src/lib/chat/extract-qa.ts`

**Step 1 — Add to WorkspaceSettings type:**
```typescript
custom_categories: string[];   // New field
```

**Add to DEFAULT_WORKSPACE_SETTINGS:**
```typescript
custom_categories: [],
```

**Step 2 — Build a merged categories helper** (can go in `src/lib/categories.ts` or inline):
```typescript
export function getMergedCategories(customCategories: string[]): string[] {
  const all = [...DEFAULT_CATEGORIES, ...customCategories];
  // Deduplicate, lowercase, trim
  const unique = [...new Set(all.map(c => c.toLowerCase().trim()))];
  return unique.filter(Boolean);
}
```

**Step 3 — Update qa-pair-form.tsx:**
Replace the hardcoded category dropdown with a combo input (dropdown + type-to-add):
- Shows `getMergedCategories(settings.custom_categories)` as options
- User can type a new category — on save, it gets added to `settings.custom_categories`
- All new categories are normalized: lowercase + trimmed before saving
- The form needs access to workspace settings (fetch if not already available, or pass via props)

**Step 4 — Update gap-resolve-form.tsx:**
Same category dropdown update — use merged categories.

**Step 5 — Fix the extraction prompt mismatch:**
In `src/lib/chat/extract-qa.ts` (around line 91), the LLM prompt has a hardcoded category list that includes `compliance`, `scaling`, `onboarding` which aren't in `DEFAULT_CATEGORIES`.

Fix: The extract function needs to accept a `categories: string[]` parameter. Update the prompt to use the passed categories array instead of hardcoded values. The caller (API route) should pass `getMergedCategories(settings.custom_categories)`.

**Step 6 — Update the extract API route** to pass categories from workspace settings into the extract function.

**Commit:** `feat: custom categories with combo input + fix extraction prompt mismatch`

---

### Feature 5: Gap Export
**Files:** `src/app/dashboard/gaps/page.tsx` (or the gaps page component)

Add a "Export CSV" button to the gaps page. Client-side only — no new API route needed.

```typescript
function exportGapsToCSV(gaps: QAGap[]) {
  const headers = ['Question', 'AI Answer', 'Similarity Score', 'Status', 'Created At'];
  const rows = gaps.map(g => [
    `"${g.question.replace(/"/g, '""')}"`,
    `"${(g.aiAnswer || '').replace(/"/g, '""')}"`,
    g.similarityScore?.toFixed(3) || '',
    g.status,
    g.createdAt,
  ]);
  
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gaps-export-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

Button placement: near the top of the gaps page, next to any existing filter/action buttons. Only show when there are gaps to export.

**Commit:** `feat: gap export as CSV download`

---

### Feature 6: Improve with Persistent Revert
**Files:** `src/app/api/qa-pairs/improve/route.ts` (or the improve lib function), `src/app/api/qa-pairs/[id]/route.ts`, Q&A table component

**Step 1 — Store originals before improving:**
In the improve flow, BEFORE overwriting the question/answer with the improved version, save the originals in the pair's metadata:

```typescript
// Before updating with improved content:
const updateData = {
  question: improvedQuestion,
  answer: improvedAnswer,
  metadata: {
    ...existingMetadata,
    original_question: currentQuestion,   // Save current before overwrite
    original_answer: currentAnswer,       // Save current before overwrite
    improved_at: new Date().toISOString(),
  }
};
```

**Step 2 — Add revert capability:**
In `PATCH /api/qa-pairs/[id]` — when the request body includes `action: 'revert'`, check if `metadata.original_question` and `metadata.original_answer` exist. If so, restore them and clear the originals from metadata:

```typescript
if (body.action === 'revert') {
  const metadata = pair.metadata || {};
  if (!metadata.original_question || !metadata.original_answer) {
    return NextResponse.json({ success: false, error: 'No original to revert to' }, { status: 400 });
  }
  updateData = {
    question: metadata.original_question,
    answer: metadata.original_answer,
    metadata: {
      ...metadata,
      original_question: undefined,
      original_answer: undefined,
      improved_at: undefined,
      reverted_at: new Date().toISOString(),
    }
  };
}
```

**Step 3 — Add revert button to Q&A table:**
If a pair has `metadata.original_question`, show a small "Revert" button/link. Calls PATCH with `{ action: 'revert' }`.

**Commit:** `feat: improve with persistent revert`

---

### Feature 7: Session Search
**Files:** `src/app/api/sessions/route.ts`, session list component

**Step 1 — Update GET /api/sessions:**
Accept a `search` query parameter. If present, filter sessions:

```typescript
const searchParam = new URL(request.url).searchParams.get('search');

let query = supabase
  .from('chat_sessions')
  .select('*')
  .eq('workspace_id', workspace.id)
  .order('created_at', { ascending: false })
  .limit(50);  // Cap for performance — ILIKE on JSONB is expensive

if (searchParam?.trim()) {
  // NOTE: Supabase PostgREST client may not support ::text casting in .ilike().
  // If .ilike('messages::text', ...) doesn't work, use one of these alternatives:
  //   Option A: .filter('messages::text', 'ilike', `%${searchParam.trim()}%`)
  //   Option B: Create a small RPC function that does the cast in SQL
  //   Option C: .textSearch('messages', searchParam.trim()) if full-text works on JSONB
  // Test with curl first to confirm which syntax the Supabase client accepts.
  query = query.filter('messages::text', 'ilike', `%${searchParam.trim()}%`);
}
```

**Step 2 — Add search input to session list component:**
- Text input at the top of the sessions page
- Debounced (300ms) — triggers refetch with search param
- Clear button to reset
- Show "Searching..." state while loading

**Commit:** `feat: session search across messages`

---

### Feature 8: Iframe Responsiveness
**Files:** `src/app/chat/[workspaceId]/page.tsx`

The public chat page needs to detect when it's inside an iframe and adapt.

**Client-side detection:**
```typescript
const [isIframe, setIsIframe] = useState(false);

useEffect(() => {
  setIsIframe(window.self !== window.top);
}, []);
```

**Adaptations when `isIframe` is true:**
- Remove any outer padding/margins on the page container
- Set the container to `h-screen w-full` (fill the iframe)
- "Powered by Clara" — keep the text, remove the `<a>` link (clicking links inside iframes navigates the iframe, not the parent)
- Ensure the message input stays at the bottom of the container (not `fixed` to viewport — use `sticky` or flex layout)

**Optional nice-to-have:** Send height to parent via `postMessage` for dynamic iframe sizing:
```typescript
useEffect(() => {
  if (isIframe) {
    const height = document.body.scrollHeight;
    window.parent.postMessage({ type: 'clara-resize', height }, '*');
  }
}, [messages, isIframe]);
```

If implementing postMessage, keep security in mind — this is send-only (we're telling the parent our height), not receiving commands.

**Commit:** `feat: iframe-responsive public chat page`

---

### Feature 9: Bulk Q&A Operations
**Files:** Q&A table component, new `src/components/knowledge/bulk-action-bar.tsx`, new `src/app/api/qa-pairs/bulk-action/route.ts`

**Step 1 — New API route: POST /api/qa-pairs/bulk-action**

```typescript
export async function POST(request: Request) {
  // 1. Auth + workspace (standard pattern)
  // 2. Parse body
  const { ids, action, category } = await request.json();
  
  // 3. Validate
  if (!ids?.length || !action) {
    return NextResponse.json({ success: false, error: 'Missing ids or action' }, { status: 400 });
  }
  
  // 4. CRITICAL: Verify all IDs belong to this workspace
  const { data: ownedPairs } = await supabase
    .from('qa_pairs')
    .select('id')
    .in('id', ids)
    .eq('workspace_id', workspace.id);
  
  const ownedIds = (ownedPairs || []).map(p => p.id);
  if (ownedIds.length !== ids.length) {
    return NextResponse.json({ success: false, error: 'Some IDs do not belong to your workspace' }, { status: 403 });
  }
  
  // 5. CRITICAL: If categorize, validate category against allowed list
  if (action === 'categorize') {
    const settings = workspace.settings || {};
    const allowedCategories = getMergedCategories(settings.custom_categories || []);
    const normalizedCategory = category?.toLowerCase().trim();
    if (!normalizedCategory || !allowedCategories.includes(normalizedCategory)) {
      return NextResponse.json({ success: false, error: 'Invalid category' }, { status: 400 });
    }
  }
  
  // 6. Execute action — use a single UPDATE for atomicity
  let updateData: Record<string, unknown> = {};
  switch (action) {
    case 'delete':     updateData = { is_active: false }; break;  // Soft delete
    case 'activate':   updateData = { is_active: true }; break;
    case 'deactivate': updateData = { is_active: false }; break;
    case 'categorize': updateData = { category: category.toLowerCase().trim() }; break;
    default:
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  }
  
  const { error: updateError, count } = await supabase
    .from('qa_pairs')
    .update(updateData)
    .in('id', ownedIds)
    .eq('workspace_id', workspace.id);  // Belt and suspenders
  
  if (updateError) throw updateError;
  
  return NextResponse.json({ success: true, affected: count || ownedIds.length });
}
```

**Note on atomicity:** Supabase's `.update().in()` is a single SQL UPDATE statement — it's inherently atomic for single-operation bulk updates like delete/activate/deactivate/categorize. This satisfies the scope doc's "transaction-wrapped" requirement because one UPDATE cannot partially succeed. If this route ever grows to require multiple separate DB operations (e.g., update pairs AND update a log table), wrap them in an explicit transaction at that point.

**Step 2 — Bulk action bar component:**
Floating bar that appears at the bottom when 1+ rows are selected. Shows:
- "{N} selected" count
- Action buttons: Delete, Activate, Deactivate, Set Category (opens a mini category dropdown)
- "Clear selection" link

**Step 3 — Update Q&A table:**
- Add checkbox column (leftmost)
- "Select all" checkbox in header
- Track selected IDs in state
- Show bulk action bar when selection is non-empty
- Clear selection after successful action

**Commit:** `feat: bulk Q&A operations (delete/activate/categorize)`

---

### Feature 10: Test-This-Pair
**Files:** Q&A table component, new `src/components/knowledge/test-match-dialog.tsx`, new `src/app/api/qa-pairs/test-match/route.ts`

**Step 1 — New API route: POST /api/qa-pairs/test-match**

```typescript
export async function POST(request: Request) {
  // 1. Auth + workspace (standard pattern)
  // 2. Parse body
  const { question } = await request.json();
  if (!question?.trim()) {
    return NextResponse.json({ success: false, error: 'Question required' }, { status: 400 });
  }
  
  // 3. Generate embedding for the test question
  const { generateEmbedding } = await import('@/lib/embed');
  const embedding = await generateEmbedding(question);
  
  // 4. Search against knowledge base
  const { data: matches } = await supabase.rpc('search_qa_pairs', {
    p_workspace_id: workspace.id,
    query_embedding: embedding,
    match_threshold: 0.3,   // Low threshold to show range of matches
    match_count: 5,
  });
  
  return NextResponse.json({
    success: true,
    matches: (matches || []).map((m: any) => ({
      id: m.id,
      question: m.question,
      answer: m.answer,
      similarity: m.similarity,
    })),
  });
}
```

**Step 2 — Test match dialog:**
- Modal/dialog that opens when user clicks "Test" on a Q&A pair
- Pre-fills with the pair's question (editable — user can modify to test variations)
- "Run Test" button → calls the API
- Shows results as a list: question, answer snippet, similarity score (color-coded: green >0.8, yellow 0.6-0.8, red <0.6)
- Helps users understand how their Q&A pairs match against real questions

**Step 3 — Add "Test" button to Q&A table:**
Small button per row (or in the row actions menu). Opens the test dialog with that pair's question pre-filled.

**Commit:** `feat: test-this-pair similarity check`

---

## Post-Session Tasks

After all 10 features are built and committed:

1. **Update CLAUDE.md** — Add v1.1 Session 1 status as complete, note new patterns established (bulk ops, category normalization, iframe detection)
2. **Update CONVENTIONS.md** if new patterns emerged (category normalization helper, bulk action route pattern)
3. **Push to GitHub**
4. **Deploy to Vercel** — verify all features work in production

---

## Checklist

- [ ] `next.config.ts` has remotePatterns for Supabase storage
- [ ] maxDuration on improve route (and any other LLM routes missing it)
- [ ] Chat engine: `slice(-20)` sliding window
- [ ] "Powered by Clara" toggle in Content tab → reflected in widget + public chat
- [ ] Custom categories: combo input, deduplicated, lowercase + trimmed
- [ ] `extract-qa.ts` prompt uses dynamic categories (not hardcoded)
- [ ] Gap export: CSV download button on gaps page
- [ ] Improve stores originals in metadata, revert button works
- [ ] Session search: text input filters sessions, 50-session cap
- [ ] Public chat detects iframe and adapts layout
- [ ] Bulk ops: workspace-verified, category-validated, single atomic UPDATE
- [ ] Test-this-pair: dialog shows top 5 matches with similarity scores
- [ ] All 10 features committed individually
- [ ] Tested in browser
