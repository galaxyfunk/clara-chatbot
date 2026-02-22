# CONVENTIONS.md — Clara Chatbot

Patterns established during development. Updated after each version ships.

---

## File Structure
```
src/
├── app/              → Pages and API routes (App Router)
│   ├── api/          → API route handlers (thin wrappers)
│   ├── chat/         → Public chat route (/chat/[workspaceId])
│   └── dashboard/    → Dashboard pages
├── components/       → React components
│   └── settings/     → Settings-specific components (tabs, preview)
├── lib/              → Business logic (ALL logic lives here)
│   ├── supabase/     → Supabase client factories
│   ├── llm/          → LLM provider abstraction
│   └── chat/         → Chat engine, extraction, dedup, improve
└── types/            → TypeScript interfaces
```

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

```typescript
'use client'  // directive first, if needed

import { useState } from 'react'              // 1. React
import { useRouter } from 'next/navigation'   // 2. Next.js
import { LogOut } from 'lucide-react'         // 3. External libraries
import { createClient } from '@/lib/...'      // 4. Internal lib
import { SomeType } from '@/types/...'        // 5. Internal types
import { SomeComponent } from '@/components'  // 6. Internal components
```

---

## API Route Pattern
```typescript
export async function METHOD(request: Request) {
  try {
    // 1. Get authenticated user (auth routes only)
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

    // 3. Parse and validate input (if needed)
    // 4. Call lib function (ALL logic in lib/)
    // 5. Return NextResponse.json({ success: true, ...data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// For long-running routes (Vercel timeout)
export const maxDuration = 30; // 30s for chat, 60-120s for extraction/import
```

**Auth Helper Pattern:**
- `createAuthClient()` — SSR client to get current user via `auth.getUser()`
- `createServerClient()` — Service role client for data queries after auth check
- Use both in auth-required routes: auth check first, then data operations

**Rules:**
- Route files are thin — logic lives in `/lib`
- Always wrap in try-catch
- Always return `{ success: boolean, ...data }` or `{ success: false, error: string }`
- Extract error message via `error instanceof Error ? error.message : 'Unknown error'`
- Add `maxDuration` export for routes that may exceed 10s (extraction, import, chat)

---

## Lib Function Structure

Pattern: Private helpers first, main exported function last.

```typescript
// Private helpers first
function validateInput(data: unknown): boolean { ... }
function formatResponse(raw: any): FormattedResult { ... }

// Main exported function last
export async function processChat(request: ChatRequest): Promise<ChatResponse> {
  const supabase = createServerClient();
  // ... processing logic
  return response;
}
```

**Rules:**
- Create Supabase client at start of function
- Use typed result objects (define in `/types`)
- Collect errors in array rather than failing fast (for batch operations)
- Throw errors for fatal issues, push to `errors[]` for recoverable ones

---

## Type Definition Patterns

Location: `src/types/*.ts`

```typescript
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
```

---

## Supabase Client Usage
- `createServerClient()` — Service role, bypasses RLS. API routes for admin ops.
- `createClient()` — Browser client, respects RLS. Client components.
- `createAuthClient()` — SSR client with user auth context. Server Components.

### Query Pattern
```typescript
const { data, error } = await supabase
  .from('table_name')
  .select('col1, col2, col3')
  .eq('workspace_id', workspaceId)
  .order('created_at', { ascending: false })
  .limit(10);

if (error) {
  throw new Error(`Failed to fetch: ${error.message}`);
}
```

### Insert Pattern
```typescript
const { error: insertError } = await supabase
  .from('table_name')
  .insert({
    workspace_id: workspaceId,
    field1: value1,
  });

if (insertError) {
  result.errors.push(`Insert failed: ${insertError.message}`);
}
```

---

## Error Handling

**At route level:** Try-catch with standardized response.

**In lib functions:**
- Throw for fatal errors (missing env vars, API failures)
- Collect recoverable errors in result array

```typescript
// Fatal — throw
if (!apiKey) throw new Error('ENCRYPTION_KEY not set');

// Recoverable — collect
if (insertError) {
  result.errors.push(`Insert failed for "${question}": ${insertError.message}`);
  continue;
}
```

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

```typescript
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
```

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

```
src/app/
├── page.tsx               → Landing page (public, CE-branded)
├── login/page.tsx         → Login page (public)
├── layout.tsx             → Root layout (html, body, providers)
├── chat/
│   └── [workspaceId]/     → Public chat page (widget iframe target)
├── dashboard/
│   ├── layout.tsx         → Dashboard layout (sidebar + main, auth check)
│   ├── page.tsx           → Dashboard home (stats)
│   ├── knowledge/         → /dashboard/knowledge
│   ├── gaps/              → /dashboard/gaps
│   ├── sessions/          → /dashboard/sessions
│   ├── chat/              → /dashboard/chat (playground)
│   └── settings/          → /dashboard/settings
```

**Rules:**
- Put all authenticated pages inside `dashboard/`
- Never import `<Sidebar>` or `<MobileNav>` into page components
- Login and auth callback live outside the dashboard group (public routes)
- Public chat route lives at `/chat/[workspaceId]` (outside dashboard)

---

## Discriminated Union API Responses

For routes that return variable response shapes, use discriminated unions:

```typescript
// When response type varies by context
export type ChatEngineResponse =
  | { type: 'answer'; answer: string; chips: string[]; confidence: number }
  | { type: 'escalation'; answer: string; booking_url: string }
  | { type: 'gap'; answer: string; gap_detected: true };
```

**Frontend contract:** Gate on `res.ok` before parsing typed response:
```typescript
if (!res.ok) {
  const err = await res.json();
  showError(err.error);
  return;
}
const data: SomeResponse = await res.json();
```

---

## Security Rules
- Never return `encrypted_key` from GET endpoints — only `key_last4`
- AES-256-GCM encryption via `src/lib/encryption.ts`
- Service role key in env vars only — never exposed to client
- Workspace isolation enforced at application level + RLS policies
- Two API key layers: app-level (env vars) + user-level (encrypted in DB)

---

## API Key Validation Pattern

When saving user API keys, validate with a live provider test before storing:

```typescript
// 1. Test the key with provider
if (provider === 'anthropic') {
  const anthropic = new Anthropic({ apiKey: key });
  await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 5,
    messages: [{ role: 'user', content: 'test' }],
  });
} else if (provider === 'openai') {
  const openai = new OpenAI({ apiKey: key });
  await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 5,
    messages: [{ role: 'user', content: 'test' }],
  });
}

// 2. Encrypt and store only if test passes
const encrypted = encrypt(key);
await supabase.from('api_keys').insert({
  encrypted_key: encrypted,
  key_last4: key.slice(-4),
  // ...
});
```

---

## Settings Merge Pattern

When updating workspace settings, merge with existing (don't replace):

```typescript
// WRONG: Replaces entire settings object
updateData.settings = body.settings;

// CORRECT: Merge with existing settings
const currentSettings = workspace.settings || {};
updateData.settings = { ...currentSettings, ...body.settings };
```

---

## Deletion Patterns

**Soft Delete (Q&A Pairs):**
```typescript
// Mark as inactive, don't delete row
await supabase
  .from('qa_pairs')
  .update({ is_active: false, updated_at: new Date().toISOString() })
  .eq('id', id);
```

**Hard Delete (API Keys):**
```typescript
// Actually remove row — encrypted keys shouldn't linger
await supabase
  .from('api_keys')
  .delete()
  .eq('id', id);
```

Use soft delete for user content (Q&A pairs), hard delete for credentials (API keys).

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
- **No hardcoded "Clara"** — always use `settings.display_name`

---

## Flexible Input Detection Pattern

For user-provided data (CSV imports, forms), accept multiple column/field name variations:

```typescript
const getColumn = (row: Record<string, string>, ...names: string[]): string | undefined => {
  for (const name of names) {
    if (row[name]?.trim()) return row[name].trim();
  }
  return undefined;
};

// Usage: accepts "question", "questions", or "q"
const question = getColumn(row, 'question', 'questions', 'q');
const answer = getColumn(row, 'answer', 'answers', 'a', 'response');
```

---

## Custom Model Option Pattern

When providing model selection, always include a "Custom Model" option for flexibility:

```typescript
export const SUPPORTED_MODELS: LLMModel[] = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', ... },
  { id: 'custom-anthropic', name: 'Custom Model', provider: 'anthropic', description: 'Enter any model ID' },
  // ...
];

// In form: detect custom and show text input
const isCustomModel = form.model.startsWith('custom-');
const modelToUse = isCustomModel ? form.customModel : form.model;
```

---

## Version History

| Version | Status | Key Patterns Established |
|---------|--------|-------------------------|
| v1.0 Session 1 | Complete | File structure, Supabase clients, encryption, LLM provider abstraction, workspace isolation, idempotency, dedup, type definitions, lib function structure |
| v1.0 Session 2 | Complete | Auth helper pattern, API route pattern, API key validation, settings merge, soft/hard delete, maxDuration exports |
| v1.0 Session 3 | Complete | Component patterns, settings tabs, skeleton variants, flexible input detection, custom model option, dynamic suggestion chips |
| v1.0 Session 4 | Next | Widget embed system, public chat page |
