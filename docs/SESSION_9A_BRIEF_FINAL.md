# Session 9a Brief — Clara CE Go-Live Infrastructure
**Version:** v1.1 Session 9a (CE Integration)  
**Estimated time:** 3–4 hours  
**Goal:** Email capture in widget → HubSpot contact creation → Calendly escalation → CORS fix  

Read CLAUDE.md and CONVENTIONS.md before starting. This brief is additive — no existing workflows are modified.

---

## Confirmed Inputs (Do Not Hardcode — Use Env Vars)

| Input | Value |
|-------|-------|
| Calendly URL | `https://calendly.com/d/cwwf-6k5-2qy/intro-call-cloud-employee` |
| Slack channel | `#aa-leads-channel` (ID: `C074USTDWTC`) — **NOT used by Clara directly** |
| HubSpot API key | Stored as `HUBSPOT_API_KEY` env var — Jake provides value |
| HubSpot contact property 1 | `clara_chat_summary` (multi-line text — created in Session B) |
| HubSpot contact property 2 | `clara_session_url` (single-line text — created in Session B) |

---

## Architecture Rules (Locked)

**Clara does NOT call Slack.** The HubSpot "Notification of Website Book A Call" workflow handles all Slack notifications to `#aa-leads-channel` automatically when a Calendly meeting is booked. Clara's only job is to create/update the HubSpot contact with rich data before that booking happens.

**Do NOT modify any existing HubSpot workflows.** Clara is purely additive — it writes contact data via API only.

**Session B dependency — do not flip `hubspot_enabled: true` until Session B is complete.** The two custom HubSpot contact properties (`clara_chat_summary`, `clara_session_url`) are created manually by Jake in Session B. If Clara tries to write these properties before they exist in HubSpot, every upsert call will return a 400 error. The toggle stays `false` until Session B is confirmed done.

**Lead flow:**
```
Visitor chats → Clara captures email → Clara creates/updates HubSpot contact
  (name, email, company, lead_source, clara_chat_summary, clara_session_url)
→ Visitor clicks Calendly link → Books meeting
→ HubSpot workflow fires → Slack notification to #aa-leads-channel (automatic)
```

---

## Step 1 — Environment Variables

Add to `.env.local` only — it is already set in Vercel:

```bash
HUBSPOT_API_KEY=pat-na1-...   # The access token from the Clara Chatbot private app
```

---

## Step 2 — Types: `src/types/workspace.ts`

Add to `WorkspaceSettings` interface:

```typescript
// ── Integrations ──
hubspot_enabled: boolean          // Master toggle — gates all HubSpot calls
```

Add a new dedicated interface file `src/types/integrations.ts`:

```typescript
// src/types/integrations.ts
export interface HubSpotContactPayload {
  email: string
  firstname?: string
  lastname?: string
  company?: string
  lead_source?: string             // "Clara Chatbot"
  lifecyclestage?: string          // "marketingqualifiedlead"
  clara_chat_summary?: string      // AI summary of conversation (max 500 chars)
  clara_session_url?: string       // Direct link to Clara session dashboard
}
```

Note: `booking_url` already exists in `WorkspaceSettings` and is already fully wired into the escalation system. No new field needed for Calendly.

---

## Step 3 — New File: `src/lib/integrations/hubspot.ts`

Create this file from scratch. All HubSpot logic lives here.

```typescript
// src/lib/integrations/hubspot.ts
import type { HubSpotContactPayload } from '@/types/integrations'

const HUBSPOT_API_BASE = 'https://api.hubapi.com'

// Creates or updates a HubSpot contact by email (upsert).
// Safe to call multiple times — same email = update, not duplicate.
export async function upsertHubSpotContact(
  payload: HubSpotContactPayload,
  apiKey: string
): Promise<{ success: boolean; contactId?: string; error?: string }> {
  try {
    const properties: Record<string, string> = {
      email: payload.email,
      lead_source: payload.lead_source ?? 'Clara Chatbot',
      lifecyclestage: payload.lifecyclestage ?? 'marketingqualifiedlead',
    }

    if (payload.firstname) properties.firstname = payload.firstname
    if (payload.lastname) properties.lastname = payload.lastname
    if (payload.company) properties.company = payload.company
    if (payload.clara_chat_summary) {
      properties.clara_chat_summary = payload.clara_chat_summary.slice(0, 500)
    }
    if (payload.clara_session_url) {
      properties.clara_session_url = payload.clara_session_url
    }

    // Correct endpoint: POST /crm/v3/objects/contacts/batch/upsert
    const response = await fetch(
      `${HUBSPOT_API_BASE}/crm/v3/objects/contacts/batch/upsert`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: [{
            idProperty: 'email',
            id: payload.email,       // Required: the identifier value to match on
            properties,
          }],
        }),
      }
    )

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('[HubSpot] Contact upsert failed:', response.status, errorBody)
      return { success: false, error: `HubSpot API error: ${response.status}` }
    }

    const data = await response.json()
    const contactId = data?.results?.[0]?.id
    console.log('[HubSpot] Contact upserted:', contactId)
    return { success: true, contactId }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[HubSpot] upsertHubSpotContact error:', message)
    return { success: false, error: message }
  }
}
```

---

## Step 4 — Email Capture Logic: `src/lib/chat/engine.ts`

The engine needs to detect when a visitor provides their email during conversation and store it on the session.

**Where to add this:** Inside `processChatStream` (and the non-streaming path), after the session is upserted, check if the latest user message contains an email. If it does, and the session doesn't already have `visitor_email` set, extract it and update the session.

Add a private helper:

```typescript
// Extract email from text — returns null if none found
function extractEmail(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)
  return match ? match[0].toLowerCase() : null
}
```

**In the `postProcess` function** (runs via `after()` after response is sent), add this block **after** the existing session upsert (which gives you `upsertedSession.id`):

```typescript
// ── Email capture + HubSpot upsert ──
// Use request.messages for the current turn — guaranteed to contain the message just sent.
// context.previousMessages is the DB history and may not include the current message.
const lastUserMessage = [...request.messages]
  .reverse()
  .find((m: { role: string; content: string }) => m.role === 'user')

if (lastUserMessage) {
  const detectedEmail = extractEmail(
    typeof lastUserMessage.content === 'string'
      ? lastUserMessage.content
      : JSON.stringify(lastUserMessage.content)
  )

  if (detectedEmail) {
    // Fresh query required — visitor_email is NOT in context or upsertedSession
    // Find the variable name holding the upserted session result (has { id, metadata })
    const { data: sessionCheck } = await supabase
      .from('chat_sessions')
      .select('visitor_email')
      .eq('id', upsertedSession.id)   // use the actual upserted session id variable
      .single()

    if (!sessionCheck?.visitor_email) {
      // Save email to session
      await supabase
        .from('chat_sessions')
        .update({ visitor_email: detectedEmail })
        .eq('id', upsertedSession.id)

      // Fire HubSpot upsert if integration enabled
      if (context.settings.hubspot_enabled) {
        const { upsertHubSpotContact } = await import('@/lib/integrations/hubspot')
        const apiKey = process.env.HUBSPOT_API_KEY
        if (apiKey) {
          const summaryText = upsertedSession.metadata?.summary?.summary_text ?? undefined
          const sessionUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/sessions`

          await upsertHubSpotContact({
            email: detectedEmail,
            lead_source: 'Clara Chatbot',
            lifecyclestage: 'marketingqualifiedlead',
            clara_chat_summary: summaryText,
            clara_session_url: sessionUrl,
          }, apiKey)
        }
      }
    }
  }
}
```

**Key points:**
- `request.messages` is in scope — use it for the current user message (guaranteed to be there)
- `upsertedSession` (`{ id, metadata }`) is already in scope from the existing session upsert — check the actual variable name in the code at line ~520 and use it
- `supabase` should be in scope — if not, create it with `createServerClient()` at the top of postProcess
- Fresh query on `visitor_email` is required — it is NOT in context or upsertedSession
- Gate on `!sessionCheck?.visitor_email` — fires once per session only
- `context.settings.hubspot_enabled` is in scope via the `context` object

---

## Step 5 — Calendly Escalation: No Code Change Needed

Pre-check confirmed `booking_url` is already fully wired in `engine.ts`:
- Used as a boolean gate in `buildChatPrompt()` at lines 613, 649, 673
- Actual URL injected via `appendUtmParams()` at lines 336 and 443–444

**Action required:** Set the value in Supabase only (included in Step 8 SQL below). No engine code changes.

---

## Step 6 — CORS Fix: `src/app/api/chat/route.ts`

This is a known outstanding issue. The widget on external sites posts to `chatbot.jakevibes.dev/api/chat`. Without CORS headers, cross-origin requests fail silently.

Add CORS headers to the chat route:

```typescript
const ALLOWED_ORIGINS = [
  'https://chatbot.jakevibes.dev',
  'https://cloudemployee.com',
  'https://www.cloudemployee.com',
  'http://localhost:3000',
]

function getCorsHeaders(requestOrigin: string | null) {
  const origin = ALLOWED_ORIGINS.includes(requestOrigin ?? '')
    ? requestOrigin!
    : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

// Add OPTIONS handler for preflight
export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin')
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  })
}

// In POST handler, add CORS headers to every response:
// return NextResponse.json({ ... }, { headers: getCorsHeaders(request.headers.get('origin')) })
// AND for SSE stream response:
// return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', ...getCorsHeaders(origin) } })
```

---

## Step 7 — Settings UI: `hubspot_enabled` Toggle

Add `hubspot_enabled` as an editable setting in the workspace settings UI. Add it to the **Integrations** section (or the bottom of the AI tab if no Integrations tab exists yet) as a simple boolean toggle. When OFF, the HubSpot lib function is never called.

`booking_url` already exists in settings and already has UI — no changes needed there.

---

## Step 8 — Supabase Settings Update (Run After Deployment — Jake Runs This)

No schema migrations needed. All new fields land in the existing `settings` JSONB column.

Jake runs this in Supabase SQL Editor after code is deployed and build is green:

```sql
-- Run this in Supabase SQL Editor after code is deployed
-- Sets HubSpot toggle OFF (safe for testing) and Calendly booking URL
UPDATE workspaces
SET settings = settings || jsonb_build_object(
  'hubspot_enabled', false,
  'booking_url', 'https://calendly.com/d/cwwf-6k5-2qy/intro-call-cloud-employee'
)
WHERE id = '09aa62df-5af6-4cec-b565-c335e907327d';
```

---

## Step 9 — Testing Protocol

Once built, test in this exact order:

**Test 1 — CORS**
- Open browser console on cloudemployee.com (or any external page)
- Send a fetch POST to `https://chatbot.jakevibes.dev/api/chat`
- Confirm no CORS errors

**Test 2 — Email capture (hubspot_enabled: false)**
- Chat with the CE workspace widget
- Give an email in conversation
- Check Supabase `chat_sessions` table — confirm `visitor_email` is populated
- Confirm NO HubSpot API call was made (check Vercel logs for `[HubSpot]` prefix)

**Test 3 — HubSpot upsert (hubspot_enabled: true)**
- **Only run this after Session B is complete** (custom HubSpot properties must exist first)
- Flip `hubspot_enabled` to `true` via SQL:
  ```sql
  UPDATE workspaces SET settings = settings || '{"hubspot_enabled": true}'::jsonb
  WHERE id = '09aa62df-5af6-4cec-b565-c335e907327d';
  ```
- Chat with the widget, provide Jake's own email
- Check HubSpot contacts — confirm contact created with `lead_source = "Clara Chatbot"`
- Confirm `[HubSpot] Contact upserted:` log in Vercel
- Note: `clara_chat_summary` will likely be empty on the first test — summaries require several messages to generate. This is expected. Test with a longer conversation to verify it populates

**Test 4 — Calendly escalation**
- Chat with the widget, express high buying intent
- Confirm Clara surfaces the Calendly link in its response

---

## Commit Sequence

```
feat: add hubspot integration lib with upsert function
feat: add email capture to engine postProcess with hubspot trigger
fix: add CORS headers to chat API route
feat: add hubspot_enabled toggle to workspace settings type and UI
```

---

## HubSpot Safety Rules (Non-Negotiable)

1. **Never modify existing HubSpot workflows** — Clara writes contacts only
2. **All calls gated by `hubspot_enabled`** — off by default, CE flips on at go-live
3. **Upsert only** — never delete or overwrite contacts via Clara
4. **Email is the idempotency key** — same email = update existing contact, not create duplicate
5. **Truncate `clara_chat_summary` to 500 chars** — HubSpot property limit safety
6. **Log all HubSpot calls** with `[HubSpot]` prefix — makes Vercel log debugging fast
7. **Fail silently on HubSpot errors** — a HubSpot API failure must never break the chat response

---

## Files Touched This Session

| File | Action |
|------|--------|
| `src/types/integrations.ts` | NEW — HubSpotContactPayload interface |
| `src/lib/integrations/hubspot.ts` | NEW — upsertHubSpotContact function |
| `src/lib/chat/engine.ts` | EDIT — email capture + HubSpot trigger in postProcess |
| `src/app/api/chat/route.ts` | EDIT — CORS headers + OPTIONS handler |
| `src/types/workspace.ts` | EDIT — add hubspot_enabled to WorkspaceSettings |
| `.env.local` | EDIT — add HUBSPOT_API_KEY |

`widget.js` — **do not touch** this session. Email is extracted from conversation text by the engine, not captured via a widget form field.
