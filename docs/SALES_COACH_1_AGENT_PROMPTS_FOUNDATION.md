# Sales Coach — Session 1 — Agent Prompts Foundation (v2)

**Track:** `sales-coach`
**Session:** 1 of 2
**Brief version:** v2 (audit fixes applied — see "Brief history" at end)
**Goal:** Generic, workspace-scoped prompt store + Agent Settings UI to edit prompts. The Sales Coach engine itself is **not** in scope — that's `sales-coach-2`.
**Outcome of this session:** Jake (and later Molly) can log into Clara, navigate to Agent Settings → Prompts, click "Sales Coach — Shawnee", edit the prompt, save. Nothing else has changed visibly. No Slack output, no Fireflies polling, no scheduled jobs.

---

## Step 0 — Pre-flight diagnostic (REQUIRED FIRST)

**Do not write any code in this step.** Read-only. Report back the answers below as a single message in your response. Use code blocks for file contents. After reporting, proceed to Step 1.

### 0.1 — Next.js version

Run:
```bash
cat package.json | grep '"next"'
```
Report: exact version string. **This determines the syntax used for dynamic route params throughout this brief.**

### 0.2 — Confirm `agent_prompts` does not exist

In Supabase SQL Editor, run:
```sql
SELECT to_regclass('public.agent_prompts');
```
Expected: `NULL`. If it returns a value, stop and surface to Jake.

### 0.3 — Confirm trigger function exists

```sql
SELECT proname FROM pg_proc WHERE proname = 'set_updated_at';
```
Expected: 1 row.

### 0.4 — Confirm CE workspace exists

```sql
SELECT id, name FROM workspaces WHERE id = '09aa62df-5af6-4cec-b565-c335e907327d';
```
Expected: 1 row.

### 0.5 — Sidebar component

Open `src/app/dashboard/layout.tsx`. Identify the sidebar component it renders.

Report:
- Exact file path of the sidebar component
- Full file contents

This file will be modified in Step 8.

### 0.6 — Existing list-table reference component

Find the component that renders the Q&A pairs table on `/dashboard/knowledge`. Likely path is `src/components/qa-pairs-table.tsx` or similar.

Report:
- Exact file path
- Full file contents

Used as the styling pattern reference for the new `prompt-list` component in Step 7.

### 0.7 — Build / lint / typecheck commands

Run:
```bash
cat package.json | grep -A 20 '"scripts"'
```
Report the scripts block. The names of `build`, `lint`, and `typecheck` (or equivalent) commands will be used in Step 10.

### 0.8 — Database type usage

```bash
grep -rn "from '@/types/database'" src/ || echo "no matches"
grep -rn "Database>" src/lib/supabase/ || echo "no matches"
```
Report both results. If either has matches, regenerate `Database` types after Step 1's migration. If neither matches, skip.

---

## Architecture decisions (locked)

- **Generic by design.** `agent_prompts` is keyed by `(workspace_id, slug)` and tagged with `agent_type`. Future agents (lead enrichment, marketing, etc.) plug in by inserting a row with a new `agent_type` value. No schema changes needed for new agents.
- **No POST/DELETE in this session.** Prompts are seeded via SQL. The UI only reads + updates. Adding new prompts is a developer task (new INSERT) until self-service creation has a real use case.
- **In-memory cache, 60s TTL.** Edits invalidate immediately on the editing process. Other Vercel instances pick up changes within 60 seconds. Acceptable latency.
- **Workspace isolation.** Every query filters by `workspace_id`. RLS policy mirrors the application-level check.
- **Slug format.** Lowercase letters, digits, hyphens only. Enforced via Postgres CHECK constraint.
- **CE brand styling.** Use existing CE Tailwind tokens — `ce-navy`, `ce-lime`, `ce-teal`, `ce-surface`, `ce-muted`, `ce-text`, `ce-text-muted`, `ce-border`. Match button patterns from existing dashboard pages. Do not introduce raw hex codes.

---

## Files to create / modify

| Path | Action |
|---|---|
| Supabase SQL Editor | Run migration SQL (Step 1) |
| `SCHEMA.md` | Update — add `agent_prompts` table reference (Step 11) |
| `src/types/agent-prompts.ts` | Create |
| `src/lib/agent-prompts/loader.ts` | Create |
| `src/app/api/agent-prompts/route.ts` | Create |
| `src/app/api/agent-prompts/[slug]/route.ts` | Create |
| `src/app/dashboard/agent-settings/prompts/page.tsx` | Create |
| `src/app/dashboard/agent-settings/prompts/[slug]/page.tsx` | Create |
| `src/components/agent-prompts/prompt-list.tsx` | Create |
| `src/components/agent-prompts/prompt-editor.tsx` | Create |
| `<sidebar component from Step 0.5>` | Modify (add nav entry) |
| `CLAUDE.md`, `CONVENTIONS.md`, `CHANGELOG.md`, `FEATURE_MAP.md` | Update at end (Step 11) |

---

## Step 1 — Migration

Clara applies migrations by pasting SQL into the Supabase SQL Editor (no `supabase/migrations/` folder). Paste the SQL below into the editor for the Clara project and run it. After it succeeds, update `SCHEMA.md` (Step 11).

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

Then run the seed insert separately (so the dollar-quoted block is isolated in case the editor mangles long strings):

```sql
INSERT INTO agent_prompts (workspace_id, slug, name, description, agent_type, content)
VALUES (
  '09aa62df-5af6-4cec-b565-c335e907327d',
  'sales-coach-shawnee',
  'Sales Coach — Shawnee',
  'Coaches Shawnee on discovery calls. Output posts to Slack.',
  'sales_coach',
$PROMPT$You are a senior sales coach reviewing a recorded discovery call between a Cloud Employee sales rep and a prospect. Your job is to give the rep tactical, specific feedback they can use on their next call.

CONTEXT
Company: {{company}}
Attendees: {{attendees}}
Duration: {{duration}}
Talk ratios: {{talk_ratios}}
Longest monologue: {{longest_monologue}}
Questions asked by rep: {{questions_asked}}

TRANSCRIPT
{{transcript}}

OUTPUT FORMAT
Return your analysis in exactly these numbered sections. No preamble, no closing remarks.

1. SNAPSHOT
One line summarising the call. Include talk ratio (rep vs prospect) and total length.

2. KEEP
Two or three things the rep did well. Be specific. Quote a phrase or describe a moment. No generic praise.

3. ONE THING
The single highest-leverage change the rep should make next time. Pick the change that, if applied, would most increase the chance of moving this deal forward. Be specific and tactical.

4. CHECKLIST FOR NEXT CALL
Three to five concrete actions for the next conversation with this prospect. Reference what was said in this call.

5. NOTABLE MOMENTS
Two or three short bullets noting key buying signals, objections, or gaps in discovery. Quote phrases where useful.

GUARDRAILS
Never use em dashes. Use commas, periods, or "and" instead.
Use plain language. No corporate sales jargon, no buzzwords.
Be honest. If the call went poorly, say so.
Reference specific moments from the transcript. Generic advice is failure.
Output the five sections only. No introduction, no conclusion.$PROMPT$
);
```

Verify:
```sql
SELECT slug, name, agent_type, length(content) FROM agent_prompts;
-- expect 1 row, content length > 1000
```

---

## Step 2 — TypeScript types

Create `src/types/agent-prompts.ts`:

```typescript
export const AGENT_TYPES = ['sales_coach'] as const;

export type AgentType = typeof AGENT_TYPES[number];

export interface AgentPrompt {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  description: string | null;
  agentType: AgentType;
  content: string;
  metadata: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentPromptListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  agentType: AgentType;
  isActive: boolean;
  updatedAt: string;
}

export interface AgentPromptUpdate {
  name?: string;
  description?: string | null;
  content?: string;
  isActive?: boolean;
}
```

> Note: `AGENT_TYPES` starts with only `sales_coach`. New agent types are added as they ship — no speculative entries.

---

## Step 3 — Lib loader

Create `src/lib/agent-prompts/loader.ts`. Follows Clara's lib structure pattern (private helpers first, exports last).

```typescript
import { createServerClient } from '@/lib/supabase/server';
import type {
  AgentPrompt,
  AgentPromptListItem,
  AgentPromptUpdate,
} from '@/types/agent-prompts';

interface CacheEntry {
  content: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function cacheKey(workspaceId: string, slug: string): string {
  return `${workspaceId}:${slug}`;
}

function rowToPrompt(row: Record<string, unknown>): AgentPrompt {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    slug: row.slug as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    agentType: row.agent_type as AgentPrompt['agentType'],
    content: row.content as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToListItem(row: Record<string, unknown>): AgentPromptListItem {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    agentType: row.agent_type as AgentPromptListItem['agentType'],
    isActive: row.is_active as boolean,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Load just the prompt content. Used by agents at runtime. Cached 60s.
 * Throws if not found or inactive.
 */
export async function loadPromptContent(
  workspaceId: string,
  slug: string
): Promise<string> {
  const key = cacheKey(workspaceId, slug);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.content;
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agent_prompts')
    .select('content, is_active')
    .eq('workspace_id', workspaceId)
    .eq('slug', slug)
    .single();

  if (error || !data) {
    throw new Error(`[AgentPrompts] Prompt not found: ${slug}`);
  }
  if (!data.is_active) {
    throw new Error(`[AgentPrompts] Prompt inactive: ${slug}`);
  }

  cache.set(key, {
    content: data.content,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return data.content;
}

/** Drop a single cached entry. Called from update flow. */
export function invalidatePrompt(workspaceId: string, slug: string): void {
  cache.delete(cacheKey(workspaceId, slug));
}

/** List all prompts for a workspace, ordered by name. */
export async function listPrompts(
  workspaceId: string
): Promise<AgentPromptListItem[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agent_prompts')
    .select('id, slug, name, description, agent_type, is_active, updated_at')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`[AgentPrompts] Failed to list: ${error.message}`);
  }
  return (data ?? []).map(rowToListItem);
}

/** Fetch a single prompt with full content. */
export async function getPromptBySlug(
  workspaceId: string,
  slug: string
): Promise<AgentPrompt | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agent_prompts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('slug', slug)
    .single();

  if (error || !data) return null;
  return rowToPrompt(data);
}

/** Update editable fields. Invalidates cache on success. */
export async function updatePrompt(
  workspaceId: string,
  slug: string,
  update: AgentPromptUpdate
): Promise<AgentPrompt> {
  const supabase = createServerClient();
  const patch: Record<string, unknown> = {};
  if (update.name !== undefined) patch.name = update.name;
  if (update.description !== undefined) patch.description = update.description;
  if (update.content !== undefined) patch.content = update.content;
  if (update.isActive !== undefined) patch.is_active = update.isActive;

  if (Object.keys(patch).length === 0) {
    throw new Error('[AgentPrompts] No fields to update');
  }

  const { data, error } = await supabase
    .from('agent_prompts')
    .update(patch)
    .eq('workspace_id', workspaceId)
    .eq('slug', slug)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`[AgentPrompts] Update failed: ${error?.message ?? 'not found'}`);
  }
  invalidatePrompt(workspaceId, slug);
  return rowToPrompt(data);
}
```

---

## Step 4 — API routes

Both routes follow the standard auth pattern from `CONVENTIONS.md` (auth client → user check → workspace lookup → lib call → standard `{ success, ... }` response). Don't reinvent.

### `src/app/api/agent-prompts/route.ts`

`GET` — list prompts for the authenticated user's workspace.

Response shape:
```typescript
{ success: true, prompts: AgentPromptListItem[] }
```

Logic: auth check → workspace lookup → `await listPrompts(workspace.id)` → return.

### `src/app/api/agent-prompts/[slug]/route.ts`

**Dynamic route params syntax — depends on Next.js version reported in Step 0.1:**
- If Next.js **>= 15.0**: use `params: Promise<{ slug: string }>` and `await context.params`
- If Next.js **< 15.0**: use `params: { slug: string }` and access `context.params.slug` directly

Two handlers:

**`GET`** — fetch single prompt.

```typescript
{ success: true, prompt: AgentPrompt }
// or
{ success: false, error: 'Prompt not found' }  // 404
```

**`PATCH`** — update prompt.

Request body (all fields optional):
```typescript
{
  name?: string;
  description?: string | null;
  content?: string;       // must be non-empty after trim
  isActive?: boolean;
}
```

Validation in the route handler before calling `updatePrompt`:
- If `content` is provided and `content.trim().length === 0`, return 400 with `{ success: false, error: 'Content cannot be empty' }`.
- Coerce types defensively — only pass through fields that match expected primitive types.
- Map camelCase request body to the lib's `AgentPromptUpdate` shape.

Response: `{ success: true, prompt: AgentPrompt }` on success, standard error envelope on failure.

Both handlers wrap in try/catch per `CONVENTIONS.md` and return `NextResponse.json` with the standard envelope.

---

## Step 5 — Page routes (server components)

Two server components. Both run the auth + workspace lookup, then render a child component. Both use `force-dynamic` to opt out of static rendering (these are auth-gated dashboard pages).

### `src/app/dashboard/agent-settings/prompts/page.tsx`

```typescript
import { redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';
import { listPrompts } from '@/lib/agent-prompts/loader';
import { PromptList } from '@/components/agent-prompts/prompt-list';

export const dynamic = 'force-dynamic';

export default async function AgentPromptsPage() {
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) redirect('/login');

  const supabase = createServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_id', user.id)
    .single();
  if (!workspace) redirect('/login');

  const prompts = await listPrompts(workspace.id);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ce-text">Agent Prompts</h1>
        <p className="text-sm text-ce-text-muted mt-1">
          Edit prompts for Clara&apos;s agents. Saved changes apply within 60 seconds.
        </p>
      </div>
      <PromptList prompts={prompts} />
    </div>
  );
}
```

### `src/app/dashboard/agent-settings/prompts/[slug]/page.tsx`

Apply the Next.js version-correct params syntax from Step 4 to `PageProps`:

```typescript
import { notFound, redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServerClient } from '@/lib/supabase/server';
import { getPromptBySlug } from '@/lib/agent-prompts/loader';
import { PromptEditor } from '@/components/agent-prompts/prompt-editor';

export const dynamic = 'force-dynamic';

// PageProps params shape conditional on Next.js version (see Step 4)
interface PageProps {
  params: Promise<{ slug: string }>;  // Next 15+; for Next 14 use { slug: string }
}

export default async function AgentPromptEditPage({ params }: PageProps) {
  const { slug } = await params;  // Drop the await for Next 14
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) redirect('/login');

  const supabase = createServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_id', user.id)
    .single();
  if (!workspace) redirect('/login');

  const prompt = await getPromptBySlug(workspace.id, slug);
  if (!prompt) notFound();

  return (
    <div className="max-w-4xl mx-auto p-6">
      <PromptEditor prompt={prompt} />
    </div>
  );
}
```

---

## Step 6 — `prompt-list` (server component)

Create `src/components/agent-prompts/prompt-list.tsx`. **No `'use client'` directive** — read-only render with `<Link>` only.

Style this to match the Q&A pairs table reported in Step 0.6 — same row spacing, same border style, same hover state, same typography. Use CE brand tokens.

```typescript
import Link from 'next/link';
import type { AgentPromptListItem } from '@/types/agent-prompts';

interface PromptListProps {
  prompts: AgentPromptListItem[];
}

export function PromptList({ prompts }: PromptListProps) {
  if (prompts.length === 0) {
    return (
      <div className="border border-ce-border rounded-xl p-8 text-center text-ce-text-muted bg-ce-surface">
        No agent prompts yet.
      </div>
    );
  }

  return (
    <div className="border border-ce-border rounded-xl overflow-hidden bg-ce-surface">
      <table className="w-full">
        <thead className="bg-ce-muted border-b border-ce-border">
          <tr>
            <th className="text-left px-4 py-3 text-sm font-medium text-ce-text">Name</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-ce-text">Type</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-ce-text">Status</th>
            <th className="text-left px-4 py-3 text-sm font-medium text-ce-text">Last edited</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {prompts.map((p) => (
            <tr key={p.id} className="border-b border-ce-border last:border-b-0 hover:bg-ce-muted">
              <td className="px-4 py-3">
                <div className="font-medium text-ce-text">{p.name}</div>
                {p.description && (
                  <div className="text-xs text-ce-text-muted mt-0.5">{p.description}</div>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-ce-text-muted">
                {p.agentType.replace(/_/g, ' ')}
              </td>
              <td className="px-4 py-3 text-sm">
                {p.isActive ? (
                  <span className="text-ce-teal font-medium">Active</span>
                ) : (
                  <span className="text-ce-text-muted">Inactive</span>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-ce-text-muted">
                {new Date(p.updatedAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/dashboard/agent-settings/prompts/${p.slug}`}
                  className="text-sm text-ce-teal hover:underline font-medium"
                >
                  Edit →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

If the Q&A pairs table reported in Step 0.6 uses a meaningfully different structure (e.g. a card grid instead of a table), adapt this component to match — consistency with existing dashboard pages is more important than the table layout above.

---

## Step 7 — `prompt-editor` (client component)

Create `src/components/agent-prompts/prompt-editor.tsx`. Client component (uses `useState`, `useRouter`, fetch).

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { AgentPrompt } from '@/types/agent-prompts';

interface PromptEditorProps {
  prompt: AgentPrompt;
}

export function PromptEditor({ prompt }: PromptEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(prompt.name);
  const [description, setDescription] = useState(prompt.description ?? '');
  const [content, setContent] = useState(prompt.content);
  const [isActive, setIsActive] = useState(prompt.isActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const hasChanges =
    name !== prompt.name ||
    description !== (prompt.description ?? '') ||
    content !== prompt.content ||
    isActive !== prompt.isActive;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent-prompts/${prompt.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description.trim() === '' ? null : description,
          content,
          isActive,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Save failed');
      setSavedAt(new Date());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/agent-settings/prompts"
          className="text-sm text-ce-teal hover:underline"
        >
          ← All prompts
        </Link>
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-2xl font-semibold text-ce-text">{prompt.name}</h1>
          <span className="text-xs text-ce-text-muted font-mono">{prompt.slug}</span>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ce-text mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-ce-border focus:ring-2 focus:ring-ce-lime focus:outline-none text-sm bg-ce-surface"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ce-text mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional notes about what this prompt does"
            className="w-full px-3 py-2 rounded-lg border border-ce-border focus:ring-2 focus:ring-ce-lime focus:outline-none text-sm bg-ce-surface"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ce-text mb-1">Prompt content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={24}
            className="w-full px-3 py-2 rounded-lg border border-ce-border focus:ring-2 focus:ring-ce-lime focus:outline-none font-mono text-sm leading-relaxed bg-ce-surface"
          />
          <p className="text-xs text-ce-text-muted mt-1">
            Variables in <code>{'{{double_braces}}'}</code> are interpolated by the agent at runtime.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-ce-text">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-ce-border"
          />
          <span>Active</span>
        </label>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-ce-border">
        <div className="text-sm text-ce-text-muted">
          {savedAt && `Saved at ${savedAt.toLocaleTimeString()}`}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="px-5 py-2 bg-ce-lime text-ce-navy rounded-full text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
```

---

## Step 8 — Sidebar nav

Open the sidebar component identified in Step 0.5. Add a new section.

**Where to place it:** directly above the existing "Settings" entry (sibling configuration item).

**What to add:**
- Section/group label: **Agent Settings**
- Sub-item: **Prompts** → `/dashboard/agent-settings/prompts`

**Match existing patterns:**
- Use the same icon vocabulary as the rest of the sidebar (`lucide-react`). Suggestions: `Sparkles`, `Bot`, `Wand2`. Pick whichever matches the existing visual weight.
- Use the same active-state class logic (the sidebar likely uses `usePathname()` and toggles a `text-ce-lime` or `bg-ce-lime` class).
- Active-route detection should match the prefix `/dashboard/agent-settings`.
- If the sidebar has nested/collapsible groups, treat "Agent Settings" as a group with one child for now. If it has flat entries only, add a flat entry titled "Agent Prompts".

Confirm the change with Jake before merging — sidebar UX is high-visibility.

---

## Step 9 — Testing

### UI smoke test (primary verification)

1. Run dev server (`pnpm dev` or equivalent).
2. Log in as the CE workspace owner.
3. Sidebar shows the new "Agent Settings → Prompts" entry. Click it.
4. Page lists one row: **Sales Coach — Shawnee**, type `sales coach`, status Active.
5. Click "Edit →".
6. Editor loads with the full prompt content visible in the textarea.
7. Edit the description field. Save button enables. Click save.
8. "Saved at HH:MM:SS" appears. Reload — change persisted.
9. Clear the content textarea entirely and try to save. Save fails with "Content cannot be empty" banner. Content stays in the textarea.
10. Toggle Active off, save, then back on, save. Status pill updates on the list page.
11. Visit `/dashboard/agent-settings/prompts/does-not-exist` — Next.js 404 page renders.

### API smoke (optional)

If verifying the API directly (skip if UI is green):

```bash
# List
curl -s http://localhost:3000/api/agent-prompts \
  -H "Cookie: <session cookie>" | jq

# Patch description
curl -s -X PATCH http://localhost:3000/api/agent-prompts/sales-coach-shawnee \
  -H "Content-Type: application/json" \
  -H "Cookie: <session cookie>" \
  -d '{"description":"Updated via curl"}' | jq

# Reject empty content
curl -s -X PATCH http://localhost:3000/api/agent-prompts/sales-coach-shawnee \
  -H "Content-Type: application/json" \
  -H "Cookie: <session cookie>" \
  -d '{"content":"   "}' | jq
# Expect: status 400, { success: false, error: "Content cannot be empty" }
```

---

## Step 10 — Build verification

Before committing, run all three:

```bash
<typecheck command from Step 0.7>
<lint command from Step 0.7>
<build command from Step 0.7>
```

All three must pass with zero errors. If any fail, fix before committing — do not push broken builds.

---

## Step 11 — Documentation updates

Per Clara's `DEVELOPMENT_PROCESS.md`, update these files at the end of the session:

1. **`SCHEMA.md`** — Add `agent_prompts` to the table list, full column reference, indexes, RLS policy, seed note. Bump table count from 5 → 6.
2. **`CLAUDE.md`** — Update "Database Tables" line to reflect 6 tables. Add `/dashboard/agent-settings/prompts` and `/dashboard/agent-settings/prompts/[slug]` to the Pages table. Add `/api/agent-prompts` and `/api/agent-prompts/[slug]` to the API Routes table.
3. **`CONVENTIONS.md`** — If any new patterns emerged (in-memory caching pattern, agent-prompt loader pattern), add them. If nothing new, no change needed.
4. **`CHANGELOG.md`** — One paragraph: "Sales Coach Session 1: Added `agent_prompts` table and Agent Settings → Prompts UI. Generic, workspace-scoped prompt store usable by any future agent. Seeded with the Sales Coach — Shawnee prompt for the CE workspace."
5. **`FEATURE_MAP.md`** — Add a new feature entry under "Agent Infrastructure" (create the section if it doesn't exist):

```markdown
### Agent Prompts
- **Description:** Workspace-scoped, slug-keyed prompt store editable from the dashboard. Used by all Clara agents.
- **Pages:** `/dashboard/agent-settings/prompts`, `/dashboard/agent-settings/prompts/[slug]`
- **API Routes:** `GET /api/agent-prompts`, `GET/PATCH /api/agent-prompts/[slug]`
- **Components:** `src/components/agent-prompts/prompt-list.tsx`, `src/components/agent-prompts/prompt-editor.tsx`
- **Lib Modules:** `src/lib/agent-prompts/loader.ts`
- **DB Tables:** `agent_prompts`
- **Types:** `src/types/agent-prompts.ts`
- **Track / Session:** sales-coach-1
```

---

## Step 12 — Commit cadence

Per `CONVENTIONS.md` (commit after every working step):

1. `feat(db): add agent_prompts table and seed sales-coach-shawnee`
2. `feat(types): add AgentPrompt types`
3. `feat(lib): add agent-prompts loader with cache`
4. `feat(api): add agent-prompts list/get/update endpoints`
5. `feat(ui): add agent prompts list and editor pages`
6. `feat(nav): add Agent Settings section to sidebar`
7. `docs: update SCHEMA, CLAUDE, CHANGELOG, FEATURE_MAP for agent_prompts`

Each commit must leave the build green.

---

## Out of scope (sales-coach-2)

For clarity on what is **deliberately not in this session**:

- Slack bot setup and posting
- Fireflies polling / API client
- `sales_call_analyses` idempotency table
- Filter logic (rep email match, external attendee check)
- Prompt variable interpolation (`{{transcript}}` etc.)
- "Run Sales Coach Now" trigger button
- Vercel cron config

All of the above lands in `sales-coach-2` once Session 1 is shipped.

---

## Brief history

| Version | Date | Changes |
|---|---|---|
| v1 | initial | First draft |
| v2 | this version | Audit fixes: corrected Supabase client import paths (`auth-server` not `auth`), removed migrations folder framing (Clara uses Supabase SQL Editor + `SCHEMA.md`), switched generic Tailwind colors to CE brand tokens (ce-navy, ce-lime, ce-teal, etc.), embedded Step 0 diagnostic for unknowns, made dynamic route params syntax conditional on Next.js version, trimmed `AGENT_TYPES` to `['sales_coach']` only, reduced indexes from 3 to 1, added full code for `prompt-list` (server component), added `force-dynamic` exports, added Step 10 build verification, added Step 11 documentation updates per `DEVELOPMENT_PROCESS.md`, renamed track to `sales-coach` and updated all references (no "Otis"). |
