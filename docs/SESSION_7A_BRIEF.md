# Clara v1.1 — Session 7A Brief
# Streaming + Live Preview + Onboarding + Auto-Resolve Fix

**Estimated time:** ~2.5–3 hours
**Reference:** CLAUDE.md and CONVENTIONS.md for architecture rules and patterns.

---

## Verified Codebase Facts (Pre-Flight Complete ✅)

These were verified against the actual codebase before writing this brief:

| Item | Verified Value |
|------|----------------|
| Next.js version | **16.1.6** — `after()` from `next/server` is available ✅ |
| LLM provider export | `chatCompletion(provider, model, apiKey, messages, options)` → `Promise<LLMResponse>` |
| Private helpers (engine.ts) | `checkRateLimit(sessionToken)`, `appendUtmParams(url)`, `buildChatPrompt(settings, userMessage, matchedPairs, previousMessages, _isConfident)`, `parseLLMResponse(rawContent, settings)` → `ParsedResponse` |
| Settings page state | **Already lifted** — `useState<WorkspaceSettings>` at page level with `handleSettingsChange`. Tabs receive `settings` + `onChange`. |
| ChatWindow fetch | Standard JSON POST to `/api/chat` with `workspace_id`, `session_token`, `message`, `message_id`. Response: `data.answer`, `data.suggestion_chips`, etc. |
| `autoResolveGaps` | **EXISTS** at `src/lib/chat/auto-resolve-gaps.ts`. Signature: `autoResolveGaps(workspaceId: string)` → `Promise<{ checked, resolved, errors }>`. **NO `newPairIds` param** — it checks ALL open gaps vs ALL active pairs. |
| Dashboard layout | Does NOT pass workspace down. Calls `ensureWorkspace(user.id)` only. Child pages fetch their own workspace via `/api/workspace`. |
| `onboarding_completed_steps` | **NOT in TypeScript types.** DB column exists (jsonb default `'[]'`), but `WorkspaceSettings` interface and `DEFAULT_WORKSPACE_SETTINGS` do NOT include it. Must be added. |
| Existing settings fields | `display_name`, `welcome_message`, `placeholder_text`, `suggested_messages`, `booking_url`, `primary_color`, `bubble_color`, `bubble_position`, `avatar_url`, `chat_icon_url`, `personality_prompt`, `confidence_threshold`, `max_suggestion_chips`, `escalation_enabled`, `powered_by_clara`, `custom_categories` |

---

## Build Order (4 features, commit after each)

| # | Feature | Complexity | Est. Time |
|---|---------|-----------|-----------|
| 1 | Streaming chat responses (SSE) | Heavy | 60-75 min |
| 2 | Settings live preview panel | Medium (state already lifted!) | 30-40 min |
| 3 | Onboarding wizard | Medium | 30-45 min |
| 4 | Auto-resolve on individual Q&A add | Trivial | 10 min |

**Git commits:**
```
feat: streaming chat responses via Server-Sent Events
feat: settings live preview panel with unsaved state indicator
feat: onboarding wizard for new users
fix: auto-resolve gaps on individual Q&A add
```

---

## Feature 1: Streaming Chat Responses (SSE)

### Problem
Current chat waits for full LLM response before showing anything. With typical 5-8 second LLM response times, users see a loading state with no content. This makes Clara feel broken.

### Solution
Switch `/api/chat` to support Server-Sent Events streaming. Tokens arrive as they're generated. Post-processing (gap detection, session logging) runs after the stream completes via `after()`.

### Step 1A: Add streaming to LLM provider

**File: `src/lib/llm/provider.ts`**

Add a new exported function alongside the existing `chatCompletion` (don't modify the existing function — other routes like improve and extract still use the non-streaming version):

```typescript
export async function chatCompletionStream(
  provider: string,
  model: string,
  apiKey: string,
  messages: LLMMessage[],
  options: { maxTokens?: number; temperature?: number } = {}
): Promise<{ stream: ReadableStream<string>; getFullResponse: () => Promise<string> }> {
  const { maxTokens = 1024, temperature = 0.7 } = options;
  switch (provider) {
    case 'anthropic':
      return streamAnthropic(model, apiKey, messages, maxTokens, temperature);
    case 'openai':
      return streamOpenAI(model, apiKey, messages, maxTokens, temperature);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
```

**Anthropic streaming:**
```typescript
async function streamAnthropic(
  model: string, apiKey: string, messages: LLMMessage[],
  maxTokens: number, temperature: number
): Promise<{ stream: ReadableStream<string>; getFullResponse: () => Promise<string> }> {
  const client = new Anthropic({ apiKey });
  const systemMessage = messages.find(m => m.role === 'system');
  const chatMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  let fullText = '';
  let resolveFullResponse: (value: string) => void;
  const fullResponsePromise = new Promise<string>((resolve) => {
    resolveFullResponse = resolve;
  });

  const anthropicStream = client.messages.stream({
    model, max_tokens: maxTokens, temperature,
    system: systemMessage?.content || '',
    messages: chatMessages,
  });

  const stream = new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const event of anthropicStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const text = event.delta.text;
            fullText += text;
            controller.enqueue(text);
          }
        }
        controller.close();
        resolveFullResponse!(fullText);
      } catch (error) {
        controller.error(error);
        resolveFullResponse!(fullText);
      }
    },
  });

  return { stream, getFullResponse: () => fullResponsePromise };
}
```

**OpenAI streaming:**
```typescript
async function streamOpenAI(
  model: string, apiKey: string, messages: LLMMessage[],
  maxTokens: number, temperature: number
): Promise<{ stream: ReadableStream<string>; getFullResponse: () => Promise<string> }> {
  const client = new OpenAI({ apiKey });

  let fullText = '';
  let resolveFullResponse: (value: string) => void;
  const fullResponsePromise = new Promise<string>((resolve) => {
    resolveFullResponse = resolve;
  });

  const openaiStream = await client.chat.completions.create({
    model, max_tokens: maxTokens, temperature, stream: true,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  });

  const stream = new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const chunk of openaiStream) {
          const text = chunk.choices[0]?.delta?.content || '';
          if (text) {
            fullText += text;
            controller.enqueue(text);
          }
        }
        controller.close();
        resolveFullResponse!(fullText);
      } catch (error) {
        controller.error(error);
        resolveFullResponse!(fullText);
      }
    },
  });

  return { stream, getFullResponse: () => fullResponsePromise };
}
```

### Step 1B: Add streaming chat engine function

**File: `src/lib/chat/engine.ts`**

**CRITICAL REFACTOR:** Extract shared pre-LLM logic from `processChat` into a private helper so both streaming and non-streaming paths stay in sync:

```typescript
interface ChatContext {
  settings: WorkspaceSettings;
  apiKeyRow: { provider: string; model: string; encrypted_key: string };
  rawApiKey: string;
  matchedPairs: MatchedPair[];
  isConfident: boolean;
  confidence: number;
  topMatch: MatchedPair | null;
  previousMessages: ChatMessage[];
  existingSession: any;
  llmMessages: LLMMessage[];
  fallbackAnswer?: string;   // Set if rate-limited, zero QA, or idempotent hit
}

async function prepareChatContext(request: ChatRequest): Promise<ChatContext> {
  // Extract steps 1-8 from existing processChat into here:
  // 1. Rate limit check (using existing checkRateLimit)
  // 2. Get workspace + settings
  // 3. Zero Q&A gate
  // 4. Get default API key + decrypt
  // 5. Embed user question
  // 6. Vector search qa_pairs
  // 7. Check for idempotent response in existing session
  // 8. Build LLM messages (using existing buildChatPrompt)
  //
  // If rate limited → set fallbackAnswer with rate limit message
  // If zero QA → set fallbackAnswer with not-set-up message
  // If idempotent hit → set fallbackAnswer with cached response
  // Otherwise → return full context with llmMessages ready to go
}
```

Then refactor `processChat` to use `prepareChatContext()` internally — keeps both paths in sync.

Add new export `processChatStream`:

```typescript
import { chatCompletionStream } from '@/lib/llm/provider';

export async function processChatStream(request: ChatRequest): Promise<{
  stream: ReadableStream<Uint8Array>;
  postProcess: () => Promise<void>;
}> {
  const encoder = new TextEncoder();
  const context = await prepareChatContext(request);

  // If context has a fallback answer (rate limit, zero QA, idempotent hit),
  // return it as a single SSE chunk
  if (context.fallbackAnswer) {
    const fallbackStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'token', content: context.fallbackAnswer })}\n\n`
        ));
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'done', suggestion_chips: [], escalation_offered: false, booking_url: null })}\n\n`
        ));
        controller.close();
      },
    });
    return {
      stream: fallbackStream,
      postProcess: async () => {},  // Nothing to post-process for fallbacks
    };
  }

  // Stream from LLM
  const { stream: llmStream, getFullResponse } = await chatCompletionStream(
    context.apiKeyRow.provider, context.apiKeyRow.model, context.rawApiKey,
    context.llmMessages, { maxTokens: 1024, temperature: 0.7 }
  );

  // Create SSE stream that wraps LLM tokens
  const sseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = llmStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'token', content: value })}\n\n`)
          );
        }

        // Stream complete — get full text and parse for metadata
        const fullText = await getFullResponse();
        const parsed = parseLLMResponse(fullText, context.settings);

        // Send final metadata event
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'done',
          suggestion_chips: parsed.suggestion_chips,
          escalation_offered: parsed.escalation_offered,
          booking_url: parsed.escalation_offered
            ? appendUtmParams(context.settings.booking_url)
            : null,
        })}\n\n`));

        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Stream interrupted' })}\n\n`)
        );
        controller.close();
      }
    },
  });

  // Return stream + a postProcess function for after()
  return {
    stream: sseStream,
    postProcess: async () => {
      // Wait for full response text
      const fullText = await getFullResponse();
      const parsed = parseLLMResponse(fullText, context.settings);

      // Gap detection (same logic as current processChat)
      const supabase = createServerClient();
      if (!context.isConfident) {
        const { data: existingGaps } = await supabase
          .from('qa_gaps').select('id, question')
          .eq('workspace_id', request.workspace_id).eq('status', 'open');

        const isDuplicateGap = (existingGaps ?? []).some(g =>
          g.question.toLowerCase().trim() === request.message.toLowerCase().trim()
        );

        if (!isDuplicateGap) {
          await supabase.from('qa_gaps').insert({
            workspace_id: request.workspace_id,
            question: request.message,
            ai_answer: parsed.answer,
            best_match_id: context.topMatch?.id ?? null,
            similarity_score: context.confidence,
            session_id: context.existingSession?.id ?? null,
            status: 'open',
          });
        }
      }

      // Session upsert (same logic as current processChat)
      const userMessage: ChatMessage = {
        message_id: request.message_id || uuidv4(),
        role: 'user',
        content: request.message,
        timestamp: new Date().toISOString(),
      };
      const assistantMessage: ChatMessage = {
        message_id: uuidv4(),
        role: 'assistant',
        content: parsed.answer,
        timestamp: new Date().toISOString(),
        suggestion_chips: parsed.suggestion_chips,
        gap_detected: !context.isConfident,
        matched_qa_ids: context.matchedPairs.map(m => m.id),
        confidence: context.confidence,
        escalation_offered: parsed.escalation_offered,
      };

      const updatedMessages = [...context.previousMessages, userMessage, assistantMessage];

      await supabase.from('chat_sessions').upsert({
        workspace_id: request.workspace_id,
        session_token: request.session_token,
        messages: updatedMessages,
        escalated: parsed.escalation_offered || context.existingSession?.escalated || false,
        escalated_at: parsed.escalation_offered
          ? new Date().toISOString()
          : context.existingSession?.escalated_at ?? null,
      }, { onConflict: 'chat_sessions_workspace_token_unique' });
    },
  };
}
```

**KEY DESIGN NOTE:** `postProcess` is a closure that captures everything it needs. The API route calls it inside `after()`. The `getFullResponse()` promise resolves once the stream finishes — calling it twice returns the same cached value (it's a promise, not a generator).

### Step 1C: Update the chat API route

**File: `src/app/api/chat/route.ts`**

```typescript
import { after } from 'next/server';
import { processChat, processChatStream } from '@/lib/chat/engine';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validation (same as before)
    if (!body.workspace_id || !body.session_token || !body.message) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }
    if (body.message.length > 2000) {
      return NextResponse.json({ success: false, error: 'Message too long' }, { status: 400 });
    }

    const wantsStream = body.stream === true
      || request.headers.get('accept')?.includes('text/event-stream');

    if (wantsStream) {
      const { stream, postProcess } = await processChatStream(body);

      // Post-processing (gap detection + session upsert) runs after response is sent
      after(postProcess);

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming fallback (existing behavior, unchanged)
    const response = await processChat(body);
    return NextResponse.json({ success: true, ...response });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const maxDuration = 30;
```

### Step 1D: Update frontend chat components

**Files to update:** The `ChatWindow` component (used by both `/dashboard/chat` and `/chat/[workspaceId]`).

Find the send message function and replace the fetch + JSON parse with a streaming reader. The `ChatWindow` component currently does:

```typescript
// CURRENT (replace this):
const res = await fetch('/api/chat', { ... });
const data = await res.json();
if (data.success) {
  // Create assistant message from data.answer
}
```

**Replace with:**

```typescript
const res = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workspace_id: workspaceId,
    session_token: sessionToken,
    message: content.trim(),
    message_id: userMessage.id,
    stream: true,  // NEW: request streaming
  }),
});

if (!res.ok) {
  // Error handling (same as before)
  return;
}

// Create placeholder assistant message with empty content
const assistantId = generateId();
const assistantMessage: Message = {
  id: assistantId,
  role: 'assistant',
  content: '',  // Will be filled by stream
  suggestion_chips: [],
};
setMessages((prev) => [...prev, assistantMessage]);

// Read SSE stream
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';
let fullContent = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n\n');
  buffer = lines.pop() || '';  // Keep incomplete line in buffer

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    try {
      const data = JSON.parse(line.slice(6));

      if (data.type === 'token') {
        fullContent += data.content;
        // Update assistant message content in-place
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: fullContent } : m
          )
        );
      }

      if (data.type === 'done') {
        // Update with final metadata
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: fullContent,
                  suggestion_chips: data.suggestion_chips || [],
                  escalation_offered: data.escalation_offered || false,
                  booking_url: data.booking_url || null,
                }
              : m
          )
        );
      }

      if (data.type === 'error') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: 'Sorry, something went wrong. Please try again.' }
              : m
          )
        );
      }
    } catch {
      // Malformed SSE line — skip
    }
  }
}
```

**UX details:**
- Show a typing/pulsing indicator while `content === ''` (waiting for first token)
- Once first token arrives, show the streaming text
- Suggestion chips appear AFTER stream completes (on `done` event)
- Disable send button while streaming (track with `isStreaming` state)
- Auto-scroll to bottom as tokens arrive

⚠️ **PAUSE POINT:** After implementing streaming, test BOTH paths:
1. **Streaming:** Dashboard playground + public chat page — tokens should appear progressively
2. **Non-streaming:** Any caller that doesn't set `stream: true` should get the old JSON response
3. **Fallbacks:** Rate limited message, zero Q&A message — should still work as instant responses
4. **Post-processing:** After a streamed response, check that the session was logged and any gap was created

---

## Feature 2: Settings Live Preview Panel

### Good News
Settings state is **already lifted** to the page level with `useState<WorkspaceSettings>` and `handleSettingsChange`. No refactoring needed — we just add the preview panel and split layout.

### Layout
- **Desktop (>1024px):** Split — 60% settings form / 40% live chat preview
- **Tablet (768-1024px):** Collapsible preview below settings
- **Mobile (<768px):** No preview panel

### Step 2A: Create settings preview component

**New file: `src/components/settings/settings-preview.tsx`**

```typescript
'use client'

import type { WorkspaceSettings } from '@/types/workspace';

interface SettingsPreviewProps {
  settings: WorkspaceSettings;
  hasUnsavedChanges: boolean;
}

export function SettingsPreview({ settings, hasUnsavedChanges }: SettingsPreviewProps) {
  // Render a mini chat widget preview using the CURRENT (unsaved) settings values.
  // This should visually match the real widget.
  //
  // Layout:
  // - Header bar: avatar (settings.avatar_url) + display_name + primary_color background
  // - Welcome message
  // - Suggested message chips (settings.suggested_messages)
  // - Chat input with placeholder_text
  // - "Powered by Clara" footer (if settings.powered_by_clara)
  //
  // Style:
  // - Use settings.primary_color for header/accents
  // - Use settings.bubble_color for chat bubbles (show a sample message)
  // - Round corners, shadow, max-height to look like the actual widget
  //
  // This is VISUAL ONLY — no actual chat functionality.
  // Shows a sample conversation:
  //   - Bot: welcome_message
  //   - User: "What services do you offer?" (sample)
  //   - Bot: "I'd be happy to help! ..." (sample, using bubble_color)
  //
  // Add a "Preview" label at the top.
  // If hasUnsavedChanges, show a small amber dot/badge.
}
```

### Step 2B: Add split layout to settings page

**File: `src/app/dashboard/settings/page.tsx`**

The existing state management (`settings`, `hasChanges`, `handleSettingsChange`) stays as-is. Wrap the content in a split layout:

```tsx
{/* Existing "Unsaved changes" indicator — already have hasChanges state */}
{hasChanges && (
  <div className="flex items-center gap-2 text-amber-600 text-sm">
    <span className="w-2 h-2 bg-amber-500 rounded-full" />
    Unsaved changes
  </div>
)}

<div className="flex flex-col lg:flex-row gap-6">
  {/* Settings form — 60% on desktop */}
  <div className="w-full lg:w-3/5">
    {/* Existing tabs + save button — unchanged */}
  </div>

  {/* Preview — 40% on desktop, collapsible on tablet, hidden on mobile */}
  <div className="hidden md:block lg:w-2/5">
    <div className="sticky top-6">
      <SettingsPreview
        settings={settings}
        hasUnsavedChanges={hasChanges}
      />
    </div>
  </div>
</div>
```

On tablet (md to lg): add a "Show Preview" / "Hide Preview" toggle button above the preview.

### Settings merge safety reminder
PATCH `/api/workspace` does JSONB merge (existing convention), never full replace. This is already implemented — don't break it.

⚠️ **PAUSE POINT:** After implementing live preview, test:
1. Change display name → preview header updates instantly
2. Change primary_color → preview header color updates
3. Change welcome message → preview welcome text updates
4. Save → indicator disappears, values persist
5. Reload → saved values persist, preview matches
6. Mobile → no preview visible
7. Tablet → preview collapsible

---

## Feature 3: Onboarding Wizard

### Pre-req: Add `onboarding_completed_steps` to TypeScript

**⚠️ DO THIS FIRST — before building any wizard components.**

The DB column `workspaces.onboarding_completed_steps` (jsonb, default `'[]'`) exists, but the TypeScript types don't know about it.

**File: `src/types/workspace.ts`**

Add new interface:
```typescript
export interface OnboardingStepRecord {
  step: 'name_bot' | 'add_knowledge' | 'connect_ai' | 'preview';
  status: 'completed' | 'skipped';
  completed_at: string;  // ISO timestamp
}
```

Add to `WorkspaceSettings` interface:
```typescript
export interface WorkspaceSettings {
  // ... existing fields ...

  // Onboarding
  onboarding_completed_steps: OnboardingStepRecord[];
}
```

Add to `DEFAULT_WORKSPACE_SETTINGS`:
```typescript
export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  // ... existing defaults ...
  onboarding_completed_steps: [],
};
```

### Trigger
Show wizard when `workspace.onboarding_completed_steps` is empty array OR has fewer than 4 entries where not all steps are completed/skipped.

### 4 Steps
1. **Name Your Bot** — Display name input + welcome message textarea. Pre-filled with defaults.
2. **Add Knowledge** — Three options: paste a Q&A pair manually, upload CSV, or paste transcript text. Complete when any ONE method adds at least 1 pair.
3. **Connect AI** — API key input with provider/model selector. "Test" button verifies key. Complete when a valid key is saved.
4. **Preview** — Embedded chat playground. "Send a test message" prompt. Complete when user sends at least 1 message.

### UX
- **Full-screen overlay** — z-index: 50+ (above sidebar, chat widget preview, everything)
- `className="fixed inset-0 z-50 bg-white"`
- **Progress bar** showing steps 1-4 with current step highlighted
- **"Skip" link** per step — marks step as `skipped` not `completed`
- **"Complete Setup"** on final step → writes all step records to `onboarding_completed_steps` via PATCH `/api/workspace`
- **Resumes where left off** — on next load, check which steps are done, jump to first incomplete

### Data Format

`onboarding_completed_steps` is `OnboardingStepRecord[]` — NOT a plain string array:

```typescript
[
  { step: "name_bot", status: "completed", completed_at: "2026-03-01T..." },
  { step: "add_knowledge", status: "skipped", completed_at: "2026-03-01T..." },
  { step: "connect_ai", status: "completed", completed_at: "2026-03-01T..." },
]
```

### New Components

**`src/components/onboarding/onboarding-wizard.tsx`**
- Full-screen overlay container
- Progress bar (4 steps with labels)
- Step navigation (back/next/skip)
- Manages which step is active
- Saves progress on complete or skip via PATCH `/api/workspace`

**`src/components/onboarding/onboarding-step.tsx`**
- Step wrapper with title, description, content slot, skip link

Each step uses **existing** API routes:
- Step 1: PATCH `/api/workspace` (update display_name, welcome_message)
- Step 2: POST `/api/qa-pairs` or POST `/api/qa-pairs/bulk-save`
- Step 3: POST `/api/api-keys`
- Step 4: POST `/api/chat` (simplified chat or reuse ChatWindow component)

### Wizard Trigger Location

The dashboard layout does NOT pass workspace down — it only calls `ensureWorkspace()`. Child pages fetch their own workspace.

**Best approach:** Create a client component `<OnboardingGate>` that:
1. Fetches workspace settings from `/api/workspace` on mount
2. Checks if onboarding is needed
3. If yes: renders the wizard overlay
4. If no: renders nothing (children show through)

**Place in: `src/app/dashboard/layout.tsx`** — wrap `{children}` with `<OnboardingGate>`:

```tsx
return (
  <DashboardShell userEmail={userEmail}>
    <OnboardingGate>
      {children}
    </OnboardingGate>
  </DashboardShell>
);
```

Or alternatively, add the check in `DashboardShell` since it's likely already a client component.

### z-index Rule
The wizard overlay MUST be z-index 50+ — above the sidebar (typically z-30-40), above any modals, above the chat preview.

⚠️ **PAUSE POINT:** After implementing onboarding, test:
1. New user → wizard appears automatically
2. Complete step 1 → progress bar advances
3. Skip step 2 → recorded as `{ step: "add_knowledge", status: "skipped" }`
4. Refresh mid-wizard → resumes at correct step
5. Complete all 4 → wizard never shows again
6. Existing users with data → wizard should NOT appear
7. Check: does the wizard overlay cover the sidebar? (z-index 50+)

---

## Feature 4: Auto-Resolve Gaps on Individual Q&A Add

### Problem
Gap auto-resolution currently only triggers in the bulk-save route. When a user manually adds a single Q&A pair via the Add Q&A modal, matching open gaps are NOT resolved.

### Verified Function Signature

The existing function is:
```typescript
// src/lib/chat/auto-resolve-gaps.ts
export async function autoResolveGaps(workspaceId: string): Promise<{ checked: number; resolved: number; errors: string[] }>
```

**⚠️ It takes ONLY `workspaceId`** — no `newPairIds` parameter. It checks ALL open gaps against ALL active pairs. This is fine for our use case.

### Fix

**File: `src/app/api/qa-pairs/route.ts`** — In the POST handler, after successfully creating a Q&A pair:

```typescript
import { autoResolveGaps } from '@/lib/chat/auto-resolve-gaps';
import { after } from 'next/server';

// ... existing POST handler code ...

// After successful insert of new Q&A pair:
after(async () => {
  try {
    await autoResolveGaps(workspace.id);
  } catch (error) {
    console.error('Auto-resolve failed:', error);
    // Non-fatal — don't break the Q&A creation response
  }
});

return NextResponse.json({ success: true, ... });
```

**That's it.** The `after()` callback runs after the response is sent, so the user gets their immediate "pair created" response while gap resolution happens in the background.

⚠️ **PAUSE POINT:** Test by:
1. Create a chat message that generates a gap (low confidence question)
2. Check gaps page — gap should appear
3. Add a Q&A pair that answers that gap's question
4. Check gaps page — gap should be auto-resolved

---

## Build Discipline Reminders

1. **Commit after every working feature** (4 commits this session)
2. **Test each feature before the next** (use the pause points above)
3. **Workspace isolation on every query**
4. **Sequential AI calls** — never Promise.all
5. **Dynamic display name** — never hardcode "Clara", use settings.display_name
6. **`after()` for background work** — never `void asyncFn()` (Next.js 16 has `after()` ✅)
7. **Responsive as you build** — Tailwind responsive classes on every component
8. **`maxDuration` on LLM routes** — `export const maxDuration = 30`
