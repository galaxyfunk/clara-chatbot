# Chat Panel Design Reference
# Claude Code: READ THIS before building panel-chat.tsx and command-chat.tsx
# These are the EXACT visual specs. Don't improvise.

---

## PanelChat (Side Whisper) — src/components/chat/panel-chat.tsx

This renders inside a 380px-wide iframe panel that slides in from the right.
It is NOT the standard ChatWindow. Different layout entirely.

### Initial State (before user sends first message):

```
┌─────────────────────────────┐
│ Clara                    ✕  │  ← Header: primary_color bg, header_text_color text
│ Cloud Employee Assistant    │  ← Subtitle: header_text_color at 70% opacity
├─────────────────────────────┤
│                             │
│ I can help you find the     │  ← Welcome message: regular text, not a chat bubble
│ right developers, understand│     Font: 14-15px, line-height 1.6
│ pricing, or explain how we  │     Color: auto-detect with isDark(chat_background)
│ work. What would you like   │     Padding: 20-24px horizontal
│ to know?                    │
│                             │
│ ┌─────────────────────────┐ │
│ │ How does pricing work? →│ │  ← Full-width chip buttons
│ └─────────────────────────┘ │     Height: ~44-48px each
│ ┌─────────────────────────┐ │     Border: 1px solid (muted color based on bg)
│ │ What developers do you  →│ │     Background: transparent or very subtle
│ │ have?                    │ │     Text: left-aligned, 13-14px
│ └─────────────────────────┘ │     Arrow (→) right-aligned
│ ┌─────────────────────────┐ │     Border-radius: 8-10px
│ │ How is CE different from→│ │     Gap between chips: 8-10px
│ │ freelancers?             │ │     Padding: 20-24px horizontal (same as welcome)
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ Book a call            →│ │
│ └─────────────────────────┘ │
│                             │
│           (flex spacer)     │
│                             │
├─────────────────────────────┤
│ ┌────────────────────┐ [↑] │  ← Input bar at bottom
│ │ Type a message...   │     │     Input: rounded, subtle border
│ └────────────────────┘      │     Send button: primary_color circle with arrow icon
│        Powered by Clara     │  ← Footer: tiny, muted, centered
└─────────────────────────────┘
```

### Conversation State (after user sends first message):

```
┌─────────────────────────────┐
│ Clara                    ✕  │  ← Same header
│ Cloud Employee Assistant    │
├─────────────────────────────┤
│                             │
│  ┌──────────────────────┐   │  ← User message: right-aligned bubble
│  │ How does pricing work?│   │     Background: primary_color
│  └──────────────────────┘   │     Text: header_text_color
│                             │
│ ┌────────────────────────┐  │  ← Bot message: left-aligned bubble
│ │ We charge a flat monthly│  │     Background: subtle (dark or light based on bg)
│ │ fee per developer...   │  │     Text: auto-detect with isDark
│ └────────────────────────┘  │
│                             │
│     (scrollable area)       │
│                             │
├─────────────────────────────┤
│ ┌────────────────────┐ [↑] │  ← Same input bar
│ │ Type a message...   │     │
│ └────────────────────┘      │
│        Powered by Clara     │
└─────────────────────────────┘
```

The welcome text and chips DISAPPEAR when conversation starts. They are replaced by the message list.

### CSS specifics:
- Container: height 100vh, width 100%, background: chat_background
- Header: padding 16-20px, display flex, align-items center, gap 12px
- Header avatar: 32px circle, first letter of display_name, white bg at 20% opacity
- Welcome text: padding 20-24px, font-size 14-15px
- Chips container: padding 0 20-24px, display flex, flex-direction column, gap 8-10px
- Each chip: padding 12-14px 16px, border 1px solid, border-radius 8-10px, display flex, justify-content space-between, align-items center, cursor pointer
- Chip hover: background slightly changes (lighter on dark, darker on light)
- Input area: padding 12-16px, border-top 1px solid (subtle)
- Send button: 36px circle, primary_color background

---

## CommandChat (Command Bar) — src/components/chat/command-chat.tsx

This renders inside a centered modal iframe (~560px wide max, ~400-500px tall initially).
Compact, search-first UI. Like Spotlight or Raycast.

### Initial State:

```
┌───────────────────────────────────────────┐
│ ● CLARA                               ✕  │  ← Header: dark bg (slightly lighter than chat_bg)
│                                           │     Green dot: #4ade80, 8px
│ ┌───────────────────────────────┐         │     Name: uppercase, letter-spaced, bold, 12px
│ │ Ask about developers, pricing,│  Send   │  ← Input: large, prominent
│ │ process...                    │         │     Full width minus Send button
│ └───────────────────────────────┘         │     Font: 15-16px
│                                           │     Border: 1px solid subtle
│ ┌──────────────┐ ┌────────────────────┐   │     Border-radius: 10-12px
│ │How does      │ │What developers do  │   │
│ │pricing work? │ │you have?           │   │  ← Chips: horizontal wrapping pills
│ └──────────────┘ └────────────────────┘   │     NOT full-width (unlike Side Whisper)
│ ┌──────────────────┐ ┌────────────┐       │     Padding: 8-10px 14-16px
│ │How is CE different│ │Book a call │       │     Border: 1px solid (muted, semi-transparent)
│ │from freelancers? │ │            │       │     Border-radius: 20px (pill shape)
│ └──────────────────┘ └────────────┘       │     Font: 13px
│                                           │     Wrap: flex-wrap: wrap, gap 8px
│                                           │
│ Powered by Clara              ESC to close│  ← Footer: tiny muted text
└───────────────────────────────────────────┘
```

### Conversation State:

```
┌───────────────────────────────────────────┐
│ ● CLARA                               ✕  │
│                                           │
│ ┌───────────────────────────────┐         │
│ │ Follow-up question here...    │  Send   │  ← Input stays at top
│ └───────────────────────────────┘         │
│                                           │
│  ┌──────────────────────┐                 │  ← Messages appear BELOW input
│  │ How does pricing work?│  (user, right) │     Area grows/scrolls as needed
│  └──────────────────────┘                 │
│ ┌────────────────────────┐                │
│ │ We charge a flat monthly│  (bot, left)  │
│ │ fee per developer...   │                │
│ └────────────────────────┘                │
│                                           │
│ Powered by Clara              ESC to close│
└───────────────────────────────────────────┘
```

Chips DISAPPEAR after first message. Input stays at top (not bottom like normal chat).

### CSS specifics:
- Container: min-height 300px, max-height 80vh, width 100%, background: chat_background
- Header: padding 14-16px 20px, display flex, align-items center, gap 10px
- Green dot: width 8px, height 8px, border-radius 50%, background #4ade80, box-shadow 0 0 6px #4ade80
- Name text: text-transform uppercase, letter-spacing 2px, font-weight 700, font-size 12px
- Input area: padding 0 20px 16px 20px
- Input field: width 100%, padding 14-16px, font-size 15-16px, border-radius 10-12px
- Send button: inside the input or next to it, muted until user types
- Chips container: padding 0 20px, display flex, flex-wrap wrap, gap 8px
- Each chip: padding 8-10px 14-16px, border-radius 20px, border 1px solid, font-size 13px, cursor pointer
- Chip hover: border color brightens or background subtle change
- Message area: padding 16px 20px, overflow-y auto, flex 1
- Footer: padding 12px 20px, display flex, justify-content space-between, font-size 11px, muted color

---

## Color Rules (both components):

- Always use isDark(chat_background) to determine text colors
- Dark background → light text (#e5e7eb), light borders (rgba(255,255,255,0.1)), light input bg (rgba(255,255,255,0.06))
- Light background → dark text (#374151), dark borders (#e5e7eb), white input bg
- User message bubbles: ALWAYS primary_color bg with header_text_color text
- Bot message bubbles: subtle contrast against chat_background
- Never hardcode "Clara" — use settings.display_name
- Never hardcode subtitle — use settings.personality_context or a sensible fallback

---

## What these are NOT:

- NOT the standard ChatWindow. Different layout, same API.
- NOT themed/skinned versions of ChatWindow. These are separate components.
- NOT terminals, command lines, or monospace. Standard clean UI, just arranged differently.
