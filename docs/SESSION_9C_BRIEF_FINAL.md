# SESSION 9C BRIEF (CORRECTED) — Calendly Webhook + HubSpot Lifecycle Upgrade + Clickable Link Fix

**Production URL:** https://chatbot.jakevibes.dev  
**CE Workspace ID:** a9b1d9f7-bbc0-4714-b311-78967bd8aa84  
**Calendly Booking URL:** https://calendly.com/d/cwwf-6k5-2qy/discovery-call-cloud-employee  
**References:** CLAUDE.md, CONVENTIONS.md

---

## Context

HubSpot already has a workflow called "Notification of Website Book A Call" that fires a Slack message to `#aa-leads-channel` whenever someone books via Calendly. Clara is not replacing or duplicating this.

Clara already writes `clara_chat_summary` and `clara_session_url` to every HubSpot contact. Jake has already added `{{contact.clara_chat_summary}}` and `{{contact.clara_session_url}}` to the existing HubSpot Slack message template — no code needed for Slack.

**Clara's only job this session:**
1. Make the Calendly link clickable in the widget
2. Receive the Calendly booking webhook
3. Upgrade the HubSpot contact lifecycle to SQL on confirmed booking

**Env vars already in Vercel (confirmed):**
- `HUBSPOT_API_KEY` — app-level HubSpot key, already present
- `CALENDLY_ACCESS_TOKEN` — Calendly personal access token, already present

---

## Audit Findings (already run — do not re-audit)

These were confirmed before this brief was written:

1. **`booking_url` in engine.ts** — Never appended to message text. It is returned as a separate field in the API response alongside the message content. The widget receives it as data and renders it separately. **Nothing to change in engine.ts for the clickable link fix.**

2. **Widget message rendering** — All three layouts (Command Bar, Side Whisper, Classic) use `textContent` for assistant messages. `innerHTML` is never used for message text. The clickable link fix belongs entirely in widget.js.

3. **`upsertHubSpotContact` signature** — Requires two arguments: `(payload: HubSpotContactPayload, apiKey: string)`. Returns `{ success: boolean; contactId?: string; error?: string }`. Already returns `contactId`. The Calendly lib must pass `process.env.HUBSPOT_API_KEY` as the second argument.

4. **HubSpot payload type** — Uses `lifecyclestage` (all lowercase), not `lifecycleStage`. This must be exact or TypeScript will error.

5. **No Calendly code exists yet** — Zero Calendly integration in `src/`. The webhook route, lib file, and link fix are all net-new.

---

## What Claude Code Builds This Session

### Step 1 — Fix Calendly Link (widget.js only)

**File:** `widget.js`

The `booking_url` field is already returned by the API in the SSE `done` event and non-streaming response. The widget receives it but renders it as plain text. 

Find where `booking_url` is received from the API response in each layout and replace plain text rendering with a clickable anchor. The safe approach — construct the anchor element in JS, never concatenate raw HTML:

```javascript
function renderBookingUrl(bookingUrl, containerEl) {
  if (!bookingUrl) return;
  const a = document.createElement('a');
  a.href = bookingUrl;
  a.textContent = bookingUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.color = 'inherit';
  a.style.textDecoration = 'underline';
  containerEl.appendChild(a);
}
```

Apply this to all three layouts (Command Bar, Side Whisper, Classic) wherever `booking_url` is currently rendered. Do not use `innerHTML` anywhere for message content.

**Commit:** `fix: render Calendly booking URL as clickable link in widget`

---

### Step 2 — Create Calendly Webhook Receiver

**New file:** `src/app/api/webhooks/calendly/route.ts`

Public route — no auth required (Calendly calls it directly). Thin wrapper per CONVENTIONS.md. All logic in the lib file (Step 3).

```typescript
import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { handleCalendlyBooking } from '@/lib/integrations/calendly';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Only process booking confirmations
    if (body.event !== 'invitee.created') {
      return NextResponse.json({ received: true });
    }

    const email = body.payload?.invitee?.email as string | undefined;
    const name = body.payload?.invitee?.name as string | undefined;
    const eventName = (body.payload?.scheduled_event?.name as string | undefined) ?? 'Discovery Call';
    const startTime = body.payload?.scheduled_event?.start_time as string | undefined;

    if (!email) {
      return NextResponse.json({ error: 'No email in payload' }, { status: 400 });
    }

    after(async () => {
      await handleCalendlyBooking({
        email: email!,
        name: name ?? null,
        eventName,
        startTime: startTime ?? null,
      });
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Commit:** `feat: add Calendly webhook receiver route`

---

### Step 3 — Create Calendly Integration Lib

**New file:** `src/lib/integrations/calendly.ts`

Key requirements:
- Pull `HUBSPOT_API_KEY` from `process.env` — this is the app-level key, not per-workspace
- Pass it as the second argument to `upsertHubSpotContact`
- Use `lifecyclestage` (all lowercase) — matches the actual `HubSpotContactPayload` type
- Fail silently — never throw, never block anything. Use `[Calendly]` log prefix.

```typescript
import { upsertHubSpotContact } from '@/lib/integrations/hubspot';

interface CalendlyBookingPayload {
  email: string;
  name: string | null;
  eventName: string;
  startTime: string | null;
}

export async function handleCalendlyBooking(payload: CalendlyBookingPayload): Promise<void> {
  const { email, name, eventName, startTime } = payload;

  try {
    console.log('[Calendly] Booking confirmed for:', email);

    const apiKey = process.env.HUBSPOT_API_KEY;
    if (!apiKey) {
      console.error('[Calendly] HUBSPOT_API_KEY not set — cannot upgrade contact');
      return;
    }

    const note = `Booked: ${eventName}${startTime ? ` — ${new Date(startTime).toLocaleString()}` : ''}`;

    // Build payload — lifecyclestage is all lowercase (matches HubSpotContactPayload type)
    const hubspotPayload = {
      email,
      ...(name ? { firstname: name.split(' ')[0], lastname: name.split(' ').slice(1).join(' ') || undefined } : {}),
      lifecyclestage: 'salesqualifiedlead',
      lead_source: 'Website',
    };

    const result = await upsertHubSpotContact(hubspotPayload, apiKey);

    if (result.success && result.contactId) {
      console.log('[Calendly] HubSpot contact upgraded to SQL. contactId:', result.contactId);
      // Add booking note via HubSpot Engagements API
      await addHubSpotNote(result.contactId, note, apiKey);
    } else {
      console.error('[Calendly] HubSpot upsert failed:', result.error);
    }
  } catch (error) {
    // Never throw — integrations fail silently per CONVENTIONS.md
    console.error('[Calendly] Failed to handle booking:', error);
  }
}

async function addHubSpotNote(contactId: string, note: string, apiKey: string): Promise<void> {
  try {
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          hs_note_body: note,
          hs_timestamp: new Date().toISOString(),
        },
        associations: [
          {
            to: { id: contactId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[Calendly] Failed to add HubSpot note:', response.status, err);
    } else {
      console.log('[Calendly] Booking note added to HubSpot contact:', contactId);
    }
  } catch (error) {
    console.error('[Calendly] addHubSpotNote error:', error);
  }
}
```

**Commit:** `feat: add Calendly integration lib — upgrades HubSpot contact to SQL on booking`

---

### Step 4 — Final Build Check

```bash
npx next build
```

Fix any TypeScript errors before pushing. Then:

```bash
git add .
git commit -m "feat(9C): Calendly webhook, HubSpot SQL upgrade on booking, clickable Calendly link"
git push
```

---

## After Deploy — Register Webhook with Calendly

Jake runs these in Terminal. Replace `YOUR_TOKEN` with the `CALENDLY_ACCESS_TOKEN` value.

**Command 1 — Get your org URI:**
```bash
curl --request GET \
  --url https://api.calendly.com/users/me \
  --header 'Authorization: Bearer YOUR_TOKEN'
```
Find `current_organization` in the response. Copy the full URL value.

**Command 2 — Register the webhook:**
```bash
curl --request POST \
  --url https://api.calendly.com/webhook_subscriptions \
  --header 'Authorization: Bearer YOUR_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "url": "https://chatbot.jakevibes.dev/api/webhooks/calendly",
    "events": ["invitee.created"],
    "organization": "PASTE_YOUR_ORG_URI_HERE",
    "scope": "organization"
  }'
```
A `201` response means it worked.

---

## End-to-End Test Checklist

- [ ] Widget loads — Calendly link is clickable (not plain text)
- [ ] Chat with Clara, drop email
- [ ] Click Calendly link → book a test slot using an existing HubSpot contact email
- [ ] HubSpot contact upgraded from MQL → SQL ✅
- [ ] Booking note added to HubSpot contact record ✅
- [ ] Slack fires in `#aa-leads-channel` via HubSpot workflow with chat summary + session link ✅
- [ ] Clara session visible in dashboard ✅