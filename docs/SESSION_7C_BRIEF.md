# Session 7C: Simplify Layouts + Build Chat Panel Modes

**Goal:** 3 layouts (Classic, Command Bar, Side Whisper), each with the right chat UI. No fancy preview panel. Ship it.

**Estimated time:** ~45 mins

---

## STEP 0: Commit Current Work + Verify

Before anything else, commit the current state as a checkpoint:

```bash
git add -A
git commit -m "checkpoint: session 7A/7B widget layouts work before simplification"
```

Then verify: `npm run build` — must pass before proceeding.

---

## STEP 1: Remove Terminal Layout

**File: `src/types/workspace.ts`**

Remove the terminal entry from WIDGET_LAYOUTS:

```typescript
export const WIDGET_LAYOUTS = [
  { id: 'classic', name: 'Classic Bubble', description: 'Floating bubble in the corner' },
  { id: 'command_bar', name: 'Command Bar', description: 'Centered search overlay' },
  { id: 'side_whisper', name: 'Side Whisper', description: 'Slim edge panel' },
] as const;
```

Update the WidgetLayout type accordingly.

In `WorkspaceSettings` interface, update `widget_layout` to: `'classic' | 'command_bar' | 'side_whisper'`

**File: `src/components/settings/style-tab.tsx`**

Remove the terminal conditional section (the `status_messages` textarea). Remove any terminal-specific rendering.

**File: `public/widget.js`**

Remove `createTerminalTrigger()` function entirely. Remove its CSS from `injectStyles()`. Remove the `case 'terminal':` from the switch statement.

**Commit:** `refactor: remove terminal layout`

---

## STEP 2: Revert Settings Preview to Simple Chat

**File: `src/components/settings/settings-preview.tsx`**

The current version has interactive layout previews with fake host pages and clickable triggers. This is overbuilt and doesn't match what the real widget looks like.

Replace it with a simple preview that:
- Shows the standard chat panel preview (header, welcome message, suggestion chips, input)
- Applies the user's colors in real-time: primary_color, header_text_color, chat_background
- Shows the layout name badge in the top-right corner (e.g. "Side Whisper")
- That's it. No fake host pages, no trigger simulations, no click interactions.

The preview should look like the original SettingsPreview from before Session 7A, but with the new color fields applied.

**Commit:** `refactor: simplify settings preview to standard chat panel`

---

## STEP 3: Create Panel Chat Component (Side Whisper)

**Create: `src/components/chat/panel-chat.tsx`**

This is the chat UI that renders inside the iframe when Side Whisper opens. It's a different layout from the standard ChatWindow.

Layout (top to bottom):
- **Header:** display_name (bold, left) + subtitle text from settings (smaller, primary_color) + close button (X, top-right). Background: primary_color. Text: header_text_color.
- **Welcome section:** welcome_message text displayed as a paragraph, not as a bot message bubble
- **Suggestion chips:** Full-width stacked buttons, each with a 1px border in a muted color, text left-aligned, arrow (→) on the right. Use suggested_messages from settings.
- **Spacer** (flex: 1)
- **Input:** "Type a message..." input with send button at the very bottom

When user clicks a chip or sends a message:
- Chips and welcome text disappear
- Replace with standard conversation message list (bot messages left, user messages right)
- Input stays at bottom
- Use the SAME chat engine as ChatWindow: POST /api/chat, same session handling, same message format

**Important:** This component needs to reuse the existing chat logic. Look at how ChatWindow (src/components/chat/chat-window.tsx) handles:
- Session ID generation/storage
- Message sending (POST /api/chat)
- Message state management
- Streaming or polling for responses

Extract the shared logic or import the same hooks/functions. Don't duplicate the API integration.

Colors:
- Container background: chat_background
- Header background: primary_color
- Header text: header_text_color
- Bot message text: auto-detect with isDark(chat_background) — dark text on light bg, light on dark
- User message bubbles: primary_color background
- Chip borders: muted version of text color
- Input area: slightly different shade from chat_background

**Commit:** `feat: panel-chat component for side whisper layout`

---

## STEP 4: Create Command Chat Component (Command Bar)

**Create: `src/components/chat/command-chat.tsx`**

This is the chat UI for Command Bar. Compact, search-first layout.

Layout (top to bottom):
- **Header bar:** Green dot (online indicator) + display_name (uppercase, bold, small) + close button (X). Dark background.
- **Input field:** Large, prominent input. Placeholder: "Ask about developers, pricing, process..." (or placeholder_text from settings). Full width with "Send" text button on right.
- **Suggestion chips:** Horizontal wrapping pills with subtle borders. Use suggested_messages from settings.
- **Footer:** "Powered by Clara" (or powered_by text) on left, "ESC to close" on right, small muted text.

When user sends a message:
- The area between input and footer becomes a conversation area
- Messages appear below the input (input stays at top)
- Chips disappear after first interaction
- Conversation scrolls within the middle area

Same rule as panel-chat: reuse ChatWindow's API logic, don't duplicate it.

Colors:
- Container background: chat_background (default dark for command bar feel)
- Header: slightly lighter/darker than chat_background
- Input field: visible contrast against background
- Chip borders: muted, semi-transparent
- Text colors: auto-detect with isDark(chat_background)

**Commit:** `feat: command-chat component for command bar layout`

---

## STEP 5: Route Chat Modes via Query Parameter

**File: `src/app/chat/[workspaceId]/page.tsx`**

Currently this always renders ChatWindow (or whatever the standard component is). Add mode detection:

```typescript
// Read query param
const searchParams = // however Next.js App Router provides search params
const mode = searchParams?.mode || 'default';

// Render based on mode
switch (mode) {
  case 'panel':
    return <PanelChat settings={...} workspaceId={...} />;
  case 'command':
    return <CommandChat settings={...} workspaceId={...} />;
  default:
    return <ChatWindow settings={...} workspaceId={...} />; // existing
}
```

IMPORTANT: Check how this file currently works before modifying. It may be a server component that fetches settings and passes them down as props. Follow the existing pattern. The new components receive the same props as ChatWindow.

**Commit:** `feat: chat route supports ?mode=panel and ?mode=command`

---

## STEP 6: Update Widget.js Iframe URLs

**File: `public/widget.js`**

Currently all layouts open the iframe to `/chat/{workspaceId}`. Change:

- Classic Bubble: `/chat/{workspaceId}` (no change — default mode)
- Command Bar: `/chat/{workspaceId}?mode=command`
- Side Whisper: `/chat/{workspaceId}?mode=panel`

Find where `openChat()` or `createFrame()` constructs the iframe src URL. The layout type is already known from settings. Add the mode param based on layout.

**Commit:** `feat: widget.js passes mode param to chat iframe`

---

## STEP 7: Polish Side Whisper Trigger

**File: `public/widget.js`**

The Side Whisper trigger (createSideWhisperTrigger + CSS) needs these specific changes:

- Tab dimensions: 34-38px wide, 120-140px tall (the current 130px height is good)
- Vertically centered on right edge
- primary_color background
- Rounded corners on left side only (12px 0 0 12px)
- Chat bubble icon (white, small SVG) near top center
- "ASK CLARA" text (or first hint_message, uppercase) written vertically with writing-mode: vertical-rl
- Small green online dot (4px, #4ade80 with subtle glow) below the text
- On hover: widen to ~46px, slightly enhanced box-shadow
- Subtle fade-in animation on page load (1.5s delay)
- On click: opens 380px panel overlay from right (existing behavior, don't change)

The strip should NOT start at 6px and expand. It should always show at its full width with icon and text visible. Hover is just a subtle emphasis, not a reveal.

**Commit:** `fix: polish side whisper trigger styling`

---

## TEST CHECKLIST

After all steps, test each layout:

```javascript
// Destroy previous widget if exists, then inject fresh
if (window.ClaraWidget) window.ClaraWidget.destroy();
var s = document.createElement('script');
s.src = 'http://localhost:3000/widget.js';
s.setAttribute('data-workspace-id', '09aa62df-5af6-4cec-b565-c335e907327d');
document.body.appendChild(s);
```

Change layout in Settings → Save → Refresh localhost:3000 → Inject widget → Test:

- [ ] **Classic Bubble:** Bubble appears bottom-right. Click opens standard chat overlay.
- [ ] **Side Whisper:** Tab appears on right edge with icon + "ASK CLARA" + green dot. Hover widens slightly. Click opens 380px side panel with PanelChat inside (welcome text + stacked chips + input).
- [ ] **Command Bar:** Pill bar at bottom center with typewriter text + ⌘K badge. Click opens centered modal with CommandChat inside (input at top + chips below + "ESC to close" footer). ⌘K keyboard shortcut works.
- [ ] **All layouts:** Mobile (<768px) opens full-screen iframe.
- [ ] **Colors:** chat_background and header_text_color applied correctly in all three chat modes.
- [ ] **Settings preview:** Shows simple chat panel with colors applied. No fake host pages.

**Final commit:** `feat: session 7C complete — 3 layouts with dedicated chat modes`

---

## FILES SUMMARY

| File | Action | What |
|------|--------|------|
| src/types/workspace.ts | Modify | Remove terminal from WIDGET_LAYOUTS |
| src/components/settings/style-tab.tsx | Modify | Remove terminal conditional section |
| src/components/settings/settings-preview.tsx | Rewrite | Simple chat preview with colors, no fake host pages |
| src/components/chat/panel-chat.tsx | **Create** | Side Whisper chat UI (welcome + stacked chips + input) |
| src/components/chat/command-chat.tsx | **Create** | Command Bar chat UI (input at top + chips + ESC hint) |
| src/app/chat/[workspaceId]/page.tsx | Modify | Read ?mode param, render correct component |
| public/widget.js | Modify | Remove terminal, add ?mode to iframe URLs, polish Side Whisper trigger CSS |

**Files NOT touched:** content-tab.tsx, ai-tab.tsx, api-keys-tab.tsx, embed-tab.tsx, chat-window.tsx, color-utils.ts, any API routes, any database


**Design Reference:** Read docs/CHAT_PANEL_DESIGNS.md BEFORE building Steps 3 and 4. It has exact ASCII layouts and CSS specs for both components. Follow them precisely.