# Session 4 Brief — Widget + Landing + Deploy

**Steps:** 15–18
**Focus:** Public chat route, widget embed script, landing page, deploy + E2E test
**Estimated Time:** 3–4 hours Claude Code
**Prerequisite:** Sessions 1–3 complete (all API routes + dashboard UI working)

**References:** Follow patterns in `CLAUDE.md` and `CONVENTIONS.md` (already in repo).

---

## What This Session Builds

Session 4 takes Clara from "working dashboard" to "live product anyone can use." Four deliverables:

1. **Public Chat Page** (`/chat/[workspaceId]`) — The embeddable chat UI visitors interact with
2. **Widget Script** (`public/widget.js`) — Floating bubble that opens the chat in an iframe overlay
3. **Landing Page** (`/`) — CE-branded marketing page with login CTA
4. **Deploy** — Vercel project, env vars, custom domain, full E2E test

---

## Step 15: Public Chat Route

### New API Route: `GET /api/workspace/public`

The existing `/api/workspace` requires auth. The public chat page needs to fetch workspace settings without auth. Create a new public endpoint.

**File:** `src/app/api/workspace/public/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id');

    if (!workspaceId) {
      return NextResponse.json(
        { success: false, error: 'workspace_id is required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const { data: workspace, error } = await supabase
      .from('workspaces')
      .select('id, settings')
      .eq('id', workspaceId)
      .single();

    if (error || !workspace) {
      return NextResponse.json(
        { success: false, error: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Only return public-safe settings — never return owner_id or internal data
    // Filter out sensitive fields from settings before returning
    const publicSettings = { ...workspace.settings };
    delete publicSettings.personality_prompt; // Don't leak system prompt to public

    return NextResponse.json({
      success: true,
      workspace_id: workspace.id,
      settings: publicSettings,
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// Handle CORS preflight for widget.js cross-origin fetch
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
```

**Key decisions:**
- Uses `createServerClient()` (service role) — bypasses RLS since this is public
- Only returns `id` + filtered `settings` — never exposes `owner_id`, and `personality_prompt` is stripped (prevents competitors from scraping system prompts)
- No auth check — anyone with a workspace_id can fetch style/content settings (intentional for the embed widget to work)
- CORS headers with `Access-Control-Allow-Origin: *` — required because `widget.js` runs on the HOST site (e.g., cloudemployee.io) and fetches cross-origin to chatbot.jakevibes.dev
- OPTIONS handler for CORS preflight — browsers send preflight for cross-origin requests

### ⚠️ CRITICAL: Allow Iframe Embedding (X-Frame-Options)

The `/chat/[workspaceId]` page must be embeddable in iframes on ANY external website. By default, Next.js/Vercel may block this. Add response headers in `next.config.ts` to allow framing for the chat route ONLY (keep other routes protected):

```typescript
// next.config.ts — add headers config
const nextConfig = {
  async headers() {
    return [
      {
        // Allow the public chat route to be embedded in iframes on any site
        source: '/chat/:path*',
        headers: [
          {
            // Remove X-Frame-Options for this route (Vercel/Next.js may set SAMEORIGIN by default)
            // frame-ancestors * is the modern CSP replacement that allows embedding from any origin
            key: 'Content-Security-Policy',
            value: "frame-ancestors *;",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};
export default nextConfig;
```

**Why:** Without this, the widget iframe will show a blank white box on third-party sites. The `Content-Security-Policy: frame-ancestors *` directive is the modern standard for allowing cross-origin iframe embedding (it supersedes the older X-Frame-Options header). We apply it ONLY to `/chat/:path*` — dashboard routes remain protected by the browser's default behavior.

**Do this FIRST in Step 15, before building the chat page.** Also includes the Supabase image remote pattern (needed for avatar images in the chat header).

### Public Chat Page

**File:** `src/app/chat/[workspaceId]/page.tsx`

This is a **client component** that renders a full-page chat UI styled with the workspace's settings. It's the iframe target for the widget and also works as a standalone direct link.

**What it does:**
1. Fetches workspace settings from `GET /api/workspace/public?workspace_id={workspaceId}`
2. Renders a full-screen chat interface using the workspace's style settings
3. Manages its own session token (UUID in sessionStorage)
4. Sends messages to `POST /api/chat`
5. Shows "Powered by Clara" footer (hardcoded visible in v1.0)

**Component structure:**
```
/chat/[workspaceId]/page.tsx
  └── Reuses existing components from /components/chat/:
      ├── message-bubble.tsx (already built in Session 3)
      └── suggestion-chips.tsx (already built in Session 3)
```

**IMPORTANT — Reuse vs. rebuild decision:** The chat playground at `/dashboard/chat` already has a working `ChatWindow` component. However, the public chat page has different requirements:
- No auth — no dashboard layout, no sidebar
- Full-screen layout (100vh)
- Loads settings via public API (not from dashboard context)
- Has "Powered by Clara" footer
- Has header bar with avatar + display name
- Mobile-first responsive

**Recommended approach:** Build the public chat page as its own self-contained client component that reuses `MessageBubble` and `SuggestionChips` from `/components/chat/` but handles its own layout, state, and API calls. Don't try to make the dashboard ChatWindow work for both — the contexts are too different.

**Page layout (top to bottom):**

```
┌──────────────────────────────┐
│  [Avatar] Display Name       │  ← Header bar (primary_color background, white text)
├──────────────────────────────┤
│                              │
│  Welcome message             │  ← First message from assistant
│                              │
│  [Suggestion chips]          │  ← Initial suggested_messages from settings
│                              │
│  ... conversation ...        │  ← Messages scroll here
│                              │
├──────────────────────────────┤
│  [Type your message...]  [→] │  ← Input bar (placeholder_text from settings)
├──────────────────────────────┤
│  Powered by Clara            │  ← Footer (small, centered, muted text)
└──────────────────────────────┘
```

**Styling rules:**
- Header: `background-color: {primary_color}`, white text, avatar image (or fallback icon)
- Message bubbles: assistant uses `{primary_color}` background with white text, user uses light gray
- Suggestion chips: outlined with `{primary_color}` border, `{primary_color}` text
- Input bar: white background, `{placeholder_text}` as placeholder
- Footer: small muted text "Powered by Clara" — links to `chatbot.jakevibes.dev` with `target="_blank" rel="noopener noreferrer"` (IMPORTANT: without target="_blank", clicking inside an iframe navigates the iframe away from the chat)
- Full height: `min-h-screen` or `h-screen` with flex column layout
- Mobile: full screen, no overflow issues, keyboard-aware input

**⚠️ INLINE STYLES EXCEPTION:** CONVENTIONS.md says "Tailwind only — no inline styles." This page is an explicit exception. Dynamic colors from `settings.primary_color` and `settings.bubble_color` CANNOT be done with Tailwind classes (they're runtime values, not build-time). Use `style={{ backgroundColor: settings.primary_color }}` inline for any setting-driven color. Use Tailwind for everything else (spacing, layout, typography, responsive).

**State management:**
- `settings` — fetched once on mount from `/api/workspace/public`
- `messages` — local array of `ChatMessage[]`
- `sessionToken` — UUID from sessionStorage (create if not exists, key: `clara-session-{workspaceId}`)
- `isLoading` — boolean for send button disabled state
- `error` — string for error display

**Session token pattern (same as dashboard chat playground):**
```typescript
const getSessionToken = (workspaceId: string): string => {
  const key = `clara-session-${workspaceId}`;
  try {
    let token = sessionStorage.getItem(key);
    if (!token) {
      token = crypto.randomUUID();
      sessionStorage.setItem(key, token);
    }
    return token;
  } catch {
    // sessionStorage blocked (private browsing, strict cookie settings, iframe restrictions)
    // Fall back to in-memory token — session won't persist across page refreshes
    return crypto.randomUUID();
  }
};
```

**Message sending flow:**
```typescript
const sendMessage = async (content: string) => {
  const messageId = crypto.randomUUID();

  // Add user message to UI immediately
  const userMsg: ChatMessage = {
    message_id: messageId,
    role: 'user',
    content,
    timestamp: new Date().toISOString(),
  };
  setMessages(prev => [...prev, userMsg]);
  setIsLoading(true);

  // Send to API
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspace_id: workspaceId,
      session_token: sessionToken,
      message: content,
      message_id: messageId,
    }),
  });

  const data = await res.json();
  if (data.success) {
    const assistantMsg: ChatMessage = {
      message_id: crypto.randomUUID(),
      role: 'assistant',
      content: data.answer,
      timestamp: new Date().toISOString(),
      suggestion_chips: data.suggestion_chips,
      gap_detected: data.gap_detected,
      confidence: data.confidence,
      escalation_offered: data.escalation_offered,
    };
    setMessages(prev => [...prev, assistantMsg]);
    // Store latest chips for display
    setCurrentChips(data.suggestion_chips || []);
  } else {
    // Show error in chat as system message
    setMessages(prev => [...prev, {
      message_id: crypto.randomUUID(),
      role: 'assistant',
      content: data.error || 'Something went wrong. Please try again.',
      timestamp: new Date().toISOString(),
    }]);
  }
  setIsLoading(false);
};
```

**Escalation handling:** When `data.escalation_offered === true` and `data.booking_url` exists, show a "Book a Call" button below the assistant message. Style it as a prominent CTA button with the workspace's `primary_color`.

**Loading state:** Show a typing indicator (three animated dots) while waiting for the API response.

**Error states:**
- Workspace not found → Show "This chatbot doesn't exist" centered message
- Settings loading → Show skeleton/spinner
- API error → Show error message inline in chat

**Auto-scroll:** Scroll to bottom when new messages are added.

**Test after building:** Open `/chat/{your-workspace-id}` in a browser. Verify:
- [ ] Settings load (display name, colors, avatar show correctly)
- [ ] Welcome message appears
- [ ] Suggested messages show as clickable chips
- [ ] Sending a message works
- [ ] Response appears with suggestion chips
- [ ] "Powered by Clara" footer visible
- [ ] Mobile responsive (test in dev tools)
- [ ] Session persists on page refresh (same session_token)

**Commit:** `feat: public chat route at /chat/[workspaceId]`

---

## Step 16: Widget Script + Embed Tab

### Widget Script: `public/widget.js`

This is a standalone JavaScript file that website owners add to their site. It creates a floating chat bubble that opens Clara in an iframe overlay.

**File:** `public/widget.js`

**How it works:**
1. Website owner adds `<script src="https://chatbot.jakevibes.dev/widget.js" data-workspace="WORKSPACE_ID"></script>` to their site
2. Script reads `data-workspace` from the script tag
3. Creates a floating button (circle) in the corner of the page
4. On click, opens an iframe overlay pointing to `/chat/{workspace_id}`
5. Close button dismisses the iframe
6. Settings fetched once on init to get `bubble_color`, `bubble_position`, `chat_icon_url`

**Key requirements:**
- **Lightweight** (~5KB target)
- **No dependencies** — vanilla JS only
- **No conflicts** — all CSS scoped, no global pollution
- **Self-contained** — single file, creates its own DOM elements
- **IIFE pattern** — wrapped in immediately-invoked function expression
- **Settings cached** — fetch once on load, reuse for all interactions

**Widget.js pseudocode structure:**

```javascript
(function() {
  'use strict';

  // 1. Find script tag and extract workspace ID
  const script = document.currentScript;
  const workspaceId = script?.getAttribute('data-workspace');
  if (!workspaceId) {
    console.error('Clara widget: Missing data-workspace attribute');
    return;
  }

  // Guard against double-initialization (SPA re-renders, duplicate script tags)
  if (document.getElementById('clara-widget-container')) {
    return;
  }

  // 2. Configuration
  const BASE_URL = script.src.replace('/widget.js', '');
  let settings = null;
  let isOpen = false;

  // 3. Fetch workspace settings (for bubble styling)
  async function fetchSettings() {
    try {
      const res = await fetch(`${BASE_URL}/api/workspace/public?workspace_id=${workspaceId}`);
      const data = await res.json();
      if (data.success) {
        settings = data.settings;
        applyBubbleStyles();
      }
    } catch (e) {
      console.error('Clara widget: Failed to load settings', e);
    }
  }

  // 4. Create DOM elements
  function createWidget() {
    // Container (scoped)
    const container = document.createElement('div');
    container.id = 'clara-widget-container';

    // Bubble button
    const bubble = document.createElement('button');
    bubble.id = 'clara-widget-bubble';
    bubble.innerHTML = '💬'; // Default — replaced with chat_icon_url if available
    bubble.setAttribute('aria-label', 'Open chat');
    bubble.onclick = toggleChat;

    // Iframe container (hidden by default)
    const iframeContainer = document.createElement('div');
    iframeContainer.id = 'clara-widget-iframe-container';
    iframeContainer.style.display = 'none';

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.id = 'clara-widget-close';
    closeBtn.innerHTML = '✕';
    closeBtn.setAttribute('aria-label', 'Close chat');
    closeBtn.onclick = toggleChat;

    // Iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'clara-widget-iframe';
    iframe.src = `${BASE_URL}/chat/${workspaceId}`;
    iframe.setAttribute('title', 'Chat widget');
    iframe.setAttribute('allow', 'clipboard-write');

    iframeContainer.appendChild(closeBtn);
    iframeContainer.appendChild(iframe);
    container.appendChild(bubble);
    container.appendChild(iframeContainer);
    document.body.appendChild(container);

    injectStyles();
  }

  // 5. Toggle open/close
  function toggleChat() {
    isOpen = !isOpen;
    const iframeContainer = document.getElementById('clara-widget-iframe-container');
    const bubble = document.getElementById('clara-widget-bubble');
    if (iframeContainer) iframeContainer.style.display = isOpen ? 'flex' : 'none';
    if (bubble) bubble.style.display = isOpen ? 'none' : 'flex';
  }

  // 6. Apply settings to bubble
  function applyBubbleStyles() {
    const bubble = document.getElementById('clara-widget-bubble');
    if (!bubble || !settings) return;

    bubble.style.backgroundColor = settings.bubble_color || '#000000';

    // Position
    if (settings.bubble_position === 'left') {
      bubble.style.left = '20px';
      bubble.style.right = 'auto';
      const iframeContainer = document.getElementById('clara-widget-iframe-container');
      if (iframeContainer) {
        iframeContainer.style.left = '20px';
        iframeContainer.style.right = 'auto';
      }
    }

    // Custom icon
    if (settings.chat_icon_url) {
      bubble.innerHTML = `<img src="${settings.chat_icon_url}" alt="Chat" style="width:28px;height:28px;border-radius:50%;" />`;
    }
  }

  // 7. Inject scoped styles
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #clara-widget-container {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        position: fixed;
        z-index: 99999;
      }
      #clara-widget-bubble {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background-color: #000000;
        color: white;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        z-index: 99999;
      }
      #clara-widget-bubble:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 20px rgba(0,0,0,0.25);
      }
      #clara-widget-iframe-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 400px;
        height: 600px;
        max-height: calc(100vh - 40px);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        display: flex;
        flex-direction: column;
        z-index: 99999;
        background: white;
      }
      #clara-widget-close {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: rgba(0,0,0,0.3);
        color: white;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        z-index: 100000;
        transition: background 0.2s ease;
      }
      #clara-widget-close:hover {
        background: rgba(0,0,0,0.5);
      }
      #clara-widget-iframe {
        width: 100%;
        height: 100%;
        border: none;
      }
      /* Mobile: full screen */
      @media (max-width: 480px) {
        #clara-widget-iframe-container {
          bottom: 0;
          right: 0;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          max-height: 100vh;
          border-radius: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // 8. Initialize
  createWidget();
  fetchSettings();
})();
```

**Test:** Add widget script to the landing page temporarily, or create a test HTML file and verify the bubble appears and opens the chat.

### Update Embed Tab

The embed tab component (`src/components/settings/embed-tab.tsx`) was built in Session 3 but may have placeholder snippets. Update it to generate real, working embed code.

**Three snippets to generate (all use the user's actual workspace ID):**

**1. Iframe Embed:**
```html
<iframe
  src="https://chatbot.jakevibes.dev/chat/WORKSPACE_ID"
  width="400"
  height="600"
  style="border: none; border-radius: 16px;"
  title="Chat with us"
></iframe>
```

**2. Script Tag (Floating Bubble):**
```html
<script
  src="https://chatbot.jakevibes.dev/widget.js"
  data-workspace="WORKSPACE_ID"
></script>
```

**3. Direct Link:**
```
https://chatbot.jakevibes.dev/chat/WORKSPACE_ID
```

**Each snippet needs:**
- A copy button that copies to clipboard with "Copied!" feedback
- The workspace ID dynamically inserted (not hardcoded)
- Code displayed in a monospace `<pre>` block with light gray background

**⚠️ IMPORTANT — Base URL handling:** During development, the base URL is `http://localhost:3000`. In production, it's `https://chatbot.jakevibes.dev`. Use `window.location.origin` to generate the correct base URL dynamically:

```typescript
const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
```

**Commit:** `feat: widget script and embed tab with real snippets`

---

## Step 17: Landing Page

**File:** `src/app/page.tsx`

Replace the placeholder landing page (created in Session 1) with a proper CE-branded marketing page.

**This is a server component** — no `'use client'` needed. Static content with a link to `/login`.

**Add metadata export for SEO:**
```typescript
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Clara — Your AI-Powered Chatbot, Built in Minutes',
  description: 'Turn your knowledge base into an intelligent chatbot. Import Q&A pairs, connect your own AI provider, customize the look and feel, and embed it on your website — all for free. Built by Cloud Employee.',
  openGraph: {
    title: 'Clara — Your AI-Powered Chatbot, Built in Minutes',
    description: 'Free AI chatbot builder. Import knowledge, connect your own LLM, embed on any website.',
    url: 'https://chatbot.jakevibes.dev',
    siteName: 'Clara by Cloud Employee',
    type: 'website',
  },
};
```

**Page sections (top to bottom):**

### 1. Navigation Bar
- Clara logo (left) — use the CE interlocking-C icon + "CLARA" text from `public/`
- "Sign In" button (right) → links to `/login`
- CE brand styling: `bg-ce-navy` nav bar, white logo, `bg-ce-lime text-ce-navy` for the sign-in button

### 2. Hero Section
- Headline: **"Your AI-Powered Chatbot, Built in Minutes"**
- Subheadline: "Turn your knowledge base into an intelligent chatbot. Import Q&A pairs, connect your own AI provider, customize the look and feel, and embed it on your website — all for free."
- Primary CTA button: **"Get Started Free"** → `/login`
- Secondary CTA: **"See How It Works"** → scrolls to features section
- Background: `bg-ce-muted` (light gray) or a subtle gradient

### 3. Features Section (3-4 cards)
Use the CE card pattern: `bg-ce-surface rounded-xl shadow-sm p-6`

**Card 1: Knowledge Base**
- Icon: BookOpen (lucide-react)
- Title: "Smart Knowledge Management"
- Description: "Create Q&A pairs manually, import from CSV, or extract them from transcripts using AI. Clara's overlap detection keeps your knowledge base clean."

**Card 2: AI Chat Engine**
- Icon: MessageSquare (lucide-react)
- Title: "Multi-Provider AI Chat"
- Description: "Bring your own API key — Claude or GPT. Vector search finds the right answers, suggestion chips guide conversations, and smart escalation connects hot leads to your team."

**Card 3: Customizable Widget**
- Icon: Palette (lucide-react)
- Title: "Your Brand, Your Style"
- Description: "Customize colors, personality, avatar, and welcome messages. Embed as an iframe or floating bubble on any website with a single line of code."

**Card 4: Gap Detection**
- Icon: Target (lucide-react)
- Title: "Never Miss a Question"
- Description: "Clara flags questions it can't confidently answer. Review gaps, add missing knowledge, and watch your chatbot get smarter over time."

### 4. How It Works (3 steps)
Simple numbered steps, horizontal on desktop, stacked on mobile:

1. **Add Your Knowledge** — "Import Q&A pairs or extract them from transcripts"
2. **Connect Your AI** — "Add your Claude or GPT API key — you own the costs"
3. **Embed & Go** — "Copy the embed code and paste it on your website"

### 5. Open Source CTA
- "Clara is free and open source"
- Brief sentence: "Built by Cloud Employee. No monthly fees. No per-message charges. Bring your own AI key and deploy in minutes."
- GitHub link button (secondary style)
- "Get Started Free" button (primary style) → `/login`

### 6. Footer
- "Built by Cloud Employee" with link to cloudemployee.io
- © 2026 Cloud Employee
- Simple, minimal — CE navy background, white/muted text

**Responsive rules:**
- Hero text: `text-4xl md:text-5xl lg:text-6xl`
- Feature cards: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6`
- How It Works: `flex flex-col md:flex-row gap-8`
- All sections: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
- Section spacing: `py-16 md:py-24`

**Test:** Open `localhost:3000/` and verify:
- [ ] Logo displays correctly
- [ ] Sign In button links to `/login`
- [ ] "Get Started Free" links to `/login`
- [ ] All sections render with correct CE brand colors
- [ ] Mobile responsive
- [ ] No broken images or missing icons

**Commit:** `feat: CE-branded landing page`

---

## Step 18: Deploy + E2E Test

### 18a: Vercel Deployment

**⏸️ PAUSE — Manual steps for Jake:**

1. **Create Vercel project:**
   - Go to vercel.com → "Add New Project"
   - Import `ce-chatbot` repo from GitHub
   - Framework preset: Next.js
   - Root directory: `./` (default)

2. **Add environment variables in Vercel dashboard:**

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ENCRYPTION_KEY=<32-byte hex string>
   OPENAI_API_KEY=sk-...
   ANTHROPIC_API_KEY=sk-ant-...
   ```

   **Copy these exact values from your local `.env.local` file.** Every variable in `.env.local` needs to be in Vercel.

3. **Add custom domain:**
   - In Vercel project settings → Domains
   - Add `chatbot.jakevibes.dev`
   - Add the DNS records Vercel tells you to (CNAME or A record) in your domain registrar

4. **Deploy:**
   - Push to `main` branch → Vercel auto-deploys
   - Or click "Deploy" in Vercel dashboard

5. **Update Supabase auth config:**
   - Go to Supabase → Authentication → URL Configuration
   - Add `https://chatbot.jakevibes.dev` to Site URL
   - Add `https://chatbot.jakevibes.dev/auth/callback` to Redirect URLs
   - Keep localhost entries for development

6. **Google OAuth (if using):**
   - Update authorized redirect URIs in Google Cloud Console
   - Add `https://chatbot.jakevibes.dev/auth/callback`

**Resume Claude Code after Vercel deploys successfully and the domain resolves.**

### 18b: Post-Deploy Fixes

After deployment, Claude Code should check for common Vercel issues:

1. **next.config.ts** — Already configured in Step 15 (X-Frame-Options + image remote patterns). Verify it's committed and deployed. If not, ensure it includes:
   ```typescript
   // next.config.ts — should already have headers() and images.remotePatterns from Step 15
   ```

2. **Widget script CORS** — The widget.js file is served from `public/`, so it's static on Vercel. No CORS issues. The iframe also works cross-origin by default. ✅

3. **API route timeouts** — Verify `maxDuration` exports exist on long-running routes:
   - `POST /api/chat` → `maxDuration = 30`
   - `POST /api/qa-pairs/extract` → `maxDuration = 120`
   - `POST /api/qa-pairs/import` → `maxDuration = 60`
   - `POST /api/qa-pairs/improve` → `maxDuration = 30`
   - `POST /api/qa-pairs/bulk-save` → `maxDuration = 60`

### 18c: End-to-End Test Checklist

Run through this complete flow on the deployed site (not localhost):

**Auth Flow:**
- [ ] Sign up with email/password → verify email → login works
- [ ] Sign up with Google OAuth → redirect back → lands on dashboard
- [ ] Dashboard shows empty state for new user

**Knowledge Base:**
- [ ] Add a Q&A pair manually → appears in table
- [ ] Edit the Q&A pair → changes save
- [ ] Import a CSV → overlap detection works → pairs saved
- [ ] Extract from transcript → Q&A pairs generated → review → save
- [ ] Improve a Q&A pair → improved version shown → accept

**API Keys:**
- [ ] Add an API key (Claude or GPT) → validation passes → key saved → shows keyLast4
- [ ] Set as default → checkmark appears

**Chat:**
- [ ] Open chat playground → sends message → gets response with suggestion chips
- [ ] Click suggestion chip → sends that message
- [ ] Low-confidence response → gap created (check gaps page)
- [ ] Escalation trigger → booking link shown

**Settings:**
- [ ] Change display name → save → chat playground reflects new name
- [ ] Change primary color → save → chat playground updates
- [ ] Upload avatar → appears in playground
- [ ] All 5 tabs load and save correctly

**Public Chat (the big one):**
- [ ] Open `https://chatbot.jakevibes.dev/chat/{workspace_id}` → loads with correct styling
- [ ] Welcome message matches settings
- [ ] Suggestion chips match settings
- [ ] Send message → get response → chips update
- [ ] "Powered by Clara" footer visible
- [ ] Mobile responsive (test on phone or dev tools)
- [ ] Refreshing page keeps same session (sessionStorage token)

**Widget Embed:**
- [ ] Copy script tag from Embed tab
- [ ] Paste into a test HTML file, open in browser
- [ ] Floating bubble appears in correct position (left/right)
- [ ] Bubble uses correct color
- [ ] Click bubble → iframe opens with chat
- [ ] Chat works inside iframe
- [ ] Close button dismisses iframe, bubble reappears
- [ ] Mobile → iframe goes full screen

**Gaps:**
- [ ] Gap appears after low-confidence chat
- [ ] Resolve gap → Q&A pair created
- [ ] Dismiss gap → status changes

**Sessions:**
- [ ] Sessions page shows conversations
- [ ] Click session → see full message history

### 18d: Update Documentation

After all tests pass:

**Update CLAUDE.md:**
- Change Session 4 status to ✅ COMPLETE
- Update "Current Session" to say "v1.0 SHIPPED"
- Add deployment URL

**Update CHANGELOG.md:**
Add a v1.0 entry:

```markdown
## v1.0 — Ship by Friday (February 27, 2026)

Clara v1.0 is live at chatbot.jakevibes.dev. Full product launch with dashboard,
chat engine, widget embed, and CE-branded landing page. Five capabilities shipped:
Q&A knowledge management (manual + CSV + transcript extraction + AI improve),
multi-provider chat engine (Claude + GPT) with vector search, suggestion chips,
gap detection, and smart escalation, embeddable widget (iframe + floating bubble),
dashboard with stats/gaps/sessions, and 5-tab settings. Built in 4 sessions,
18 steps, across one week.
```

**Update PHASE_HISTORY.md:**
Add Session 4 entry with files created and key patterns.

**Update FEATURE_MAP.md:**
Add entries for:
- Public Workspace Settings (`GET /api/workspace/public`) — public endpoint, no auth
- Public Chat Page (`/chat/[workspaceId]`) — widget iframe target
- Widget Script (`public/widget.js`) — floating bubble embed
- Landing Page (`/`) — CE-branded marketing page

**Commit:** `feat: Clara v1.0 — deployed and live! 🦞`

---

## Files Created in This Session

```
src/app/
├── page.tsx                              → Landing page (REPLACE existing placeholder)
├── chat/
│   └── [workspaceId]/
│       └── page.tsx                      → Public chat page (NEW)
└── api/
    └── workspace/
        └── public/
            └── route.ts                  → Public workspace settings endpoint (NEW)

public/
└── widget.js                             → Floating bubble widget script (NEW)
```

**Files modified:**
```
src/components/settings/embed-tab.tsx     → Update with real embed snippets
next.config.ts (or .js)                   → X-Frame-Options + Supabase image remote pattern
CLAUDE.md                                 → Update status
CHANGELOG.md                              → Add v1.0 entry
PHASE_HISTORY.md                          → Add Session 4 entry
FEATURE_MAP.md                            → Add widget/public endpoint entries
```

---

## Build Order Summary

| # | What | File(s) | Depends On |
|---|------|---------|------------|
| 1 | next.config.ts (iframe headers + image patterns) | `next.config.ts` | Nothing — do this FIRST |
| 2 | Public workspace settings API | `api/workspace/public/route.ts` | Nothing |
| 3 | Public chat page | `chat/[workspaceId]/page.tsx` | Steps 1-2 (needs headers + settings endpoint) |
| 4 | Test public chat | Browser | Steps 1-3 |
| 5 | Widget script | `public/widget.js` | Step 3 (loads chat page in iframe) |
| 6 | Update embed tab | `components/settings/embed-tab.tsx` | Step 5 |
| 7 | Test widget | Test HTML file | Steps 5-6 |
| 8 | Landing page | `app/page.tsx` | Nothing |
| 9 | **⏸️ PAUSE: Vercel deploy** | Manual | Steps 1-8 |
| 10 | Post-deploy verification | Browser | Step 9 |
| 11 | E2E test | Browser | Everything |
| 12 | Update docs | CLAUDE.md, CHANGELOG.md, PHASE_HISTORY.md, FEATURE_MAP.md | Step 11 |
| 13 | Final commit | Git | Step 12 |

**Commit after every working step.** Don't batch commits.

---

## Hero Moments 🎬

Two recording opportunities in this session:

1. **First public chat** — After build order Step 4, open `/chat/{workspaceId}` in a fresh browser window. Record sending a message and getting a styled response. This is the "it works outside the dashboard" moment.

2. **Clara is live** — After build order Step 11, open `chatbot.jakevibes.dev` on your phone. Record the landing page → sign in → dashboard → chat → widget embed. Full product tour. This is the video closer.

---

**LET'S GO. Session 4. Final session. Ship by Friday. 🦞**

---

## Audit Findings (Applied)

| # | Severity | Finding | Fix Applied |
|---|----------|---------|-------------|
| A | 🔴 Critical | X-Frame-Options blocks widget iframe on third-party sites | Added `headers()` config in `next.config.ts` with `Content-Security-Policy: frame-ancestors *` for `/chat/:path*` only. Moved to first build step. |
| B | 🔴 Critical | CORS blocks widget.js cross-origin fetch to `/api/workspace/public` | Added `Access-Control-Allow-Origin: *` headers + OPTIONS handler on public workspace endpoint |
| C | 🟡 Important | Public settings endpoint leaks `personality_prompt` (system prompt) | Added `delete publicSettings.personality_prompt` before returning. Chat engine still reads full settings from DB directly. |
| D | 🟡 Important | Dynamic colors require inline styles, contradicts CONVENTIONS.md | Added explicit exception callout so Claude Code doesn't fight it |
| E | 🟡 Important | Landing page missing metadata export (title, description, OG tags) | Added `export const metadata` with SEO-friendly content |
| F | 🟡 Important | "Powered by Clara" link navigates iframe instead of opening new tab | Added `target="_blank" rel="noopener noreferrer"` instruction |
| G | 🟡 Important | Widget.js can be initialized multiple times (SPA re-renders) | Added `document.getElementById('clara-widget-container')` guard |
| H | 🟢 Minor | next.config image patterns in post-deploy too late, needed during dev | Moved to Step 15 (first build step), merged with iframe headers config |
| I | 🟢 Minor | sessionStorage throws in private browsing / strict cookie settings | Added try-catch with in-memory UUID fallback |
| J | 🟢 Minor | FEATURE_MAP.md missing from documentation update list | Added to update list and files modified |
| K | 🟢 Minor | No UUID validation on public workspace endpoint | Accepted — Supabase handles gracefully, returns 404 |

**Dismissed:**
- CSP restrictions on host sites blocking widget script/iframe — outside our control, documented as known limitation for users with strict CSP policies
