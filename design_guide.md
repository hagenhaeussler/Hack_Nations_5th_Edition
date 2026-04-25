# Claude.ai — Design Guide

> A comprehensive, LLM-readable design specification for replicating the Claude.ai aesthetic.
> Intended for use as a design reference by engineers, designers, and AI systems.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Color System](#2-color-system)
3. [Typography](#3-typography)
4. [Spacing & Sizing](#4-spacing--sizing)
5. [Layout & Structure](#5-layout--structure)
6. [Chat Interface](#6-chat-interface)
7. [Input Area](#7-input-area)
8. [Components](#8-components)
9. [Iconography](#9-iconography)
10. [Motion & Animation](#10-motion--animation)
11. [Responsive Behavior](#11-responsive-behavior)
12. [Accessibility](#12-accessibility)
13. [Brand Identity](#13-brand-identity)
14. [CSS Variables Reference](#14-css-variables-reference)

---

## 1. Design Philosophy

Claude.ai follows a **warm minimalism** aesthetic. The interface is quiet, focused, and text-first — designed to keep attention on the conversation, not the surrounding chrome.

**Core principles:**

- **Text-first**: The conversation is the product. UI chrome is secondary.
- **Warmth over sterility**: Cream, parchment, and terracotta tones instead of cold grays or blue-whites.
- **Calm, not clinical**: Transitions are slow and gentle. Nothing flashes or pulses aggressively.
- **Literary, not techy**: The overall personality communicates "thoughtful" and "considered," not "fast" or "corporate."
- **Organic softness**: Rounded corners, generous line-height, and off-white backgrounds give a paper-like reading experience.

**What this is NOT:**
- No heavy gradients
- No neon accent colors
- No chat bubble walls (assistant messages are not bubbled)
- No aggressive animations or bouncing loaders
- No purple-on-white AI clichés

---

## 2. Color System

### 2.1 Light Mode

| Token                  | Hex         | Usage                                      |
|------------------------|-------------|--------------------------------------------|
| `--bg-primary`         | `#FAF9F6`   | Main chat background — warm off-white/cream |
| `--bg-sidebar`         | `#F0EDE8`   | Sidebar background — slightly darker warm gray |
| `--bg-surface`         | `#FFFFFF`   | Cards, modals, dropdowns                   |
| `--bg-user-message`    | `#EFEBE4`   | User message bubble fill — warm parchment  |
| `--bg-input`           | `#FFFFFF`   | Textarea/input background                  |
| `--bg-hover`           | `rgba(0,0,0,0.04)` | Hover state on list items, buttons   |
| `--bg-code`            | `#F0EDE8`   | Code block background                      |
| `--border-default`     | `#E5E0D8`   | Dividers, input borders — warm light gray  |
| `--border-strong`      | `#CEC8BE`   | Stronger borders for cards/modals          |
| `--text-primary`       | `#1A1A1A`   | Main content text — near-black             |
| `--text-secondary`     | `#6B6460`   | Labels, metadata, placeholders — warm gray |
| `--text-tertiary`      | `#9C9490`   | Disabled text, subtle labels               |
| `--accent`             | `#C96442`   | Primary CTA, logo mark — muted terracotta  |
| `--accent-hover`       | `#B5573A`   | Accent on hover — darker terracotta        |
| `--accent-subtle`      | `rgba(201,100,66,0.08)` | Accent tint for backgrounds       |

### 2.2 Dark Mode

| Token                  | Hex         | Usage                                      |
|------------------------|-------------|--------------------------------------------|
| `--bg-primary`         | `#1C1917`   | Main background — very dark warm brown-black |
| `--bg-sidebar`         | `#141210`   | Sidebar — deeper dark                      |
| `--bg-surface`         | `#242220`   | Cards, modals, dropdowns                   |
| `--bg-user-message`    | `#2E2A26`   | User message bubble                        |
| `--bg-input`           | `#242220`   | Input background                           |
| `--bg-hover`           | `rgba(255,255,255,0.05)` | Hover state on list items         |
| `--bg-code`            | `#2A2520`   | Code block background                      |
| `--border-default`     | `#3A3530`   | Dividers, borders                          |
| `--border-strong`      | `#4A4540`   | Stronger borders                           |
| `--text-primary`       | `#F5F0E8`   | Main text — warm off-white                 |
| `--text-secondary`     | `#A09890`   | Secondary text                             |
| `--text-tertiary`      | `#706860`   | Tertiary, disabled                         |
| `--accent`             | `#C96442`   | Same terracotta — unchanged across modes   |
| `--accent-hover`       | `#D4714E`   | Slightly brighter on dark bg               |
| `--accent-subtle`      | `rgba(201,100,66,0.12)` | Accent tint                       |

### 2.3 Color Usage Rules

- The **accent color** (`#C96442`) is used **sparingly**: primary CTA buttons, the logo mark, and active state indicators only. Never use it as a large background fill.
- **Both modes use warm undertones** (brown, cream, terracotta). Never use cool gray (`#F5F5F5`, `#E0E0E0`) or blue-tinted neutrals.
- **No pure black or pure white** in backgrounds. Always use the warm variants.
- Code syntax highlighting should use a warm-toned theme (Atom One Dark warm variant for dark mode, a cream-based theme for light mode).

---

## 3. Typography

### 3.1 Font Stack

```css
/* Primary UI font */
font-family: 'Söhne', ui-sans-serif, system-ui, -apple-system, sans-serif;

/* Code / monospace */
font-family: 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', monospace;
```

> **Note:** Söhne is a commercial typeface by Klim Type Foundry. If unavailable, `ui-sans-serif` produces an acceptable system fallback. Do NOT substitute Inter, Roboto, or Arial — these undermine the warm personality.

### 3.2 Type Scale

| Role                   | Size    | Weight | Line Height | Letter Spacing |
|------------------------|---------|--------|-------------|----------------|
| Chat body / prose      | `15px`  | 400    | `1.75`      | `0`            |
| Assistant response     | `15px`  | 400    | `1.75`      | `0`            |
| H1 in response         | `22px`  | 600    | `1.3`       | `-0.01em`      |
| H2 in response         | `18px`  | 600    | `1.4`       | `-0.01em`      |
| H3 in response         | `15px`  | 600    | `1.5`       | `0`            |
| Sidebar nav labels     | `13px`  | 400    | `1.4`       | `0`            |
| Section dividers       | `11px`  | 500    | `1`         | `0.06em`       |
| Code inline            | `13px`  | 400    | `1.5`       | `0`            |
| Code block             | `13px`  | 400    | `1.6`       | `0`            |
| Input / textarea       | `15px`  | 400    | `1.6`       | `0`            |
| Placeholder text       | `15px`  | 400    | `1.6`       | `0`            |
| Button label           | `14px`  | 500    | `1`         | `0`            |
| Tooltip                | `12px`  | 400    | `1.4`       | `0`            |
| Metadata / timestamps  | `12px`  | 400    | `1`         | `0`            |
| Model name badge       | `11px`  | 500    | `1`         | `0.04em`       |

### 3.3 Typography Rules

- Text rendering: always use `-webkit-font-smoothing: antialiased; moz-osx-font-smoothing: grayscale;`
- Paragraph max-width in chat: `65ch` — never let prose run full viewport width.
- No underlines on links within responses unless hovered. Use `--text-secondary` color to differentiate links softly.
- Section divider labels in sidebar ("Today", "Yesterday") are uppercase with `0.06em` tracking, `--text-tertiary` color.

---

## 4. Spacing & Sizing

### 4.1 Base Unit

The spacing system uses a **4px base unit**. All spacing values are multiples of 4.

```
4px   →  xs    (tight internal padding)
8px   →  sm    (component internal gaps)
12px  →  sm+   (compact padding)
16px  →  md    (standard padding)
20px  →  md+
24px  →  lg    (section gaps)
32px  →  xl    (large section padding)
48px  →  2xl   (layout-level spacing)
64px  →  3xl   (hero/full-bleed spacing)
```

### 4.2 Border Radius Scale

| Token            | Value    | Usage                                     |
|------------------|----------|-------------------------------------------|
| `--radius-xs`    | `4px`    | Tags, small badges                        |
| `--radius-sm`    | `6px`    | Buttons, dropdowns, tooltips              |
| `--radius-md`    | `10px`   | Input areas, code blocks, small cards     |
| `--radius-lg`    | `14px`   | Modals, large cards                       |
| `--radius-xl`    | `18px`   | User message bubbles                      |
| `--radius-full`  | `9999px` | Pills, avatar circles, tags               |

### 4.3 Key Dimensional Constants

| Element                    | Value       |
|----------------------------|-------------|
| Sidebar width              | `260px`     |
| Chat column max-width      | `720px`     |
| Chat column side padding   | `24–32px`   |
| Message vertical gap       | `24–32px`   |
| Input area min-height      | `52px`      |
| Input area max-height      | `200px`     |
| Avatar size (assistant)    | `20px`      |
| Avatar size (user)         | `28px`      |
| Icon size (standard)       | `16–20px`   |
| Icon size (primary action) | `24px`      |
| Icon button touch target   | `32–36px`   |

---

## 5. Layout & Structure

### 5.1 Top-Level Layout

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ┌───────────┐  ┌───────────────────────────────────────────┐  │
│  │           │  │                                           │  │
│  │  SIDEBAR  │  │           MAIN CHAT AREA                  │  │
│  │  260px    │  │   (centered column, max-width 720px)      │  │
│  │  fixed    │  │                                           │  │
│  │           │  │                                           │  │
│  │           │  │                                           │  │
│  │           │  ├───────────────────────────────────────────┤  │
│  │           │  │            INPUT BAR (fixed bottom)       │  │
│  └───────────┘  └───────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- Sidebar: `position: fixed`, full viewport height, `z-index` above content.
- Main area: `margin-left: 260px`, full remaining width, centered column inside.
- No global top navbar. The model selector lives near the top of the chat column.
- Input bar: `position: fixed`, bottom of viewport, width matches main area.

### 5.2 Sidebar Anatomy

From top to bottom:

1. **Logo / wordmark** — top-left, `~40px` height area, padded `16px`.
2. **New Chat button** — below logo, full sidebar width minus padding, primary CTA style.
3. **Search conversations** — optional, icon + label, collapses to icon on narrow.
4. **Conversation list** — scrollable, fills remaining height.
   - Items: `36px` tall, left-padded `12px`, full-width clickable.
   - Hover: `--bg-hover` background fill.
   - Active: slightly darker fill, no heavy left-border indicator (subtle distinction).
   - Text truncation: `text-overflow: ellipsis` on single line.
5. **Section date labels** — above grouped conversations. Uppercase, `11px`, `--text-tertiary`.
6. **User profile section** — pinned to sidebar bottom. Contains: circular avatar `28px`, display name `13px`, settings gear icon.

### 5.3 Chat Column

- Horizontally centered within the main area.
- `max-width: 720px`, `padding: 0 24px` minimum, `0 32px` on wider viewports.
- Messages flow vertically with `gap: 24–32px`.
- Model selector: small pill/dropdown, centered or left-aligned near the top of the column.
- No sticky header over the chat; the model selector may scroll away on long conversations.

---

## 6. Chat Interface

### 6.1 Message Types

#### User Messages
- Displayed as a **rounded pill/card**: `border-radius: 18px`, background `--bg-user-message`.
- Right-aligned within the column OR full-width on short messages (implementation varies).
- Max-width: `85%` of column.
- Padding: `12px 16px`.
- No avatar for user messages by default (avatar lives in sidebar profile only).

#### Assistant Messages
- **No bubble.** Claude's responses render as **flowing prose directly on the page background**.
- Full column width.
- Left-side: small assistant logo mark (`~20px` diamond icon), top-aligned with the first line.
- No card, no border, no background fill — this is intentional. It signals "document" rather than "chat bubble."
- Vertical padding above/below the message block: `16px`.

### 6.2 Markdown Rendering

All standard Markdown is fully rendered in assistant messages:

| Element          | Rendering Details                                                                 |
|------------------|-----------------------------------------------------------------------------------|
| `# H1`           | `22px`, weight `600`, `margin-bottom: 12px`, `margin-top: 20px`                  |
| `## H2`          | `18px`, weight `600`, `margin-bottom: 8px`, `margin-top: 16px`                   |
| `### H3`         | `15px`, weight `600`, `margin-bottom: 6px`, `margin-top: 12px`                   |
| `**bold**`       | `font-weight: 600`                                                                |
| `*italic*`       | `font-style: italic`                                                              |
| `[link](url)`    | `--text-secondary` color, no underline at rest, underline on hover               |
| `- bullet`       | Standard disc bullets, `padding-left: 20px`, `gap: 4px` between items            |
| `1. numbered`    | Standard decimal, same indent                                                     |
| `> blockquote`   | Left border `3px solid --border-strong`, `padding-left: 16px`, italic, muted color |
| `---` rule       | `1px solid --border-default`, `margin: 16px 0`                                   |
| Tables           | Clean borders `1px --border-default`, zebra striping `--bg-hover` on odd rows    |
| `\`inline code\``| Small pill: `background: --bg-code`, `border-radius: 4px`, `padding: 2px 6px`, monospace |
| Code block       | See section 6.3 below                                                             |

### 6.3 Code Blocks

```
┌─────────────────────────────────────────────────────────┐
│ javascript                              [Copy] [Button] │  ← header bar
├─────────────────────────────────────────────────────────┤
│                                                         │
│   const x = 1;                                         │
│   console.log(x);                                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- Background: `--bg-code`
- `border-radius: --radius-md` (`10px`)
- `border: 1px solid --border-default`
- Header bar: `8px 12px` padding, flex row, space-between.
  - Left: language label, `11px`, `--text-tertiary`, uppercase.
  - Right: "Copy" button — text + icon, `12px`, ghost style.
- Code area: `padding: 16px`, overflow-x scroll.
- Font: monospace stack, `13px`, line-height `1.6`.
- Syntax highlighting: warm-toned theme. NOT Dracula, NOT Monokai. Prefer themes like "One Light" (light mode) and a warm dark variant (dark mode).

### 6.4 Streaming State

- Text appears token-by-token.
- A blinking cursor `|` follows the last character during streaming.
- Cursor: `1px wide`, `--text-primary` color, `animation: blink 1s step-end infinite`.
- No skeleton loaders, no spinner — just the cursor.
- Once streaming completes, the cursor disappears immediately.

### 6.5 Message Actions (on hover)

Hovering an assistant message reveals a subtle action toolbar:

- Appears below the message, left-aligned with the content.
- Icons: Copy, Thumbs Up, Thumbs Down, Retry/Regenerate.
- Icon size: `16px`, color `--text-tertiary` at rest, `--text-primary` on hover.
- Transition: `opacity 0 → 1` over `150ms` on message hover.
- No visible toolbar at rest (zero opacity).

---

## 7. Input Area

### 7.1 Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  [📎]  Type a message...                              [↑ Send]      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

- Outer container: `position: fixed; bottom: 0; left: 260px; right: 0;`
- Inner wrapper: centered, `max-width: 720px`, `padding: 12px 24px 20px`.
- Textarea element: auto-expanding, `min-height: 52px`, `max-height: 200px`, then scrollable.
- `border-radius: --radius-md` (`10–12px`)
- `border: 1px solid --border-default`
- `background: --bg-input`
- `box-shadow: 0 0 0 1px --border-default` (subtle focus ring when active)
- Padding inside textarea: `14px 48px 14px 16px` (right padding reserves space for send button)

### 7.2 Buttons Inside Input

**Attachment button (left):**
- Paperclip icon, `20px`, positioned `left: 12px`, vertically centered.
- Color: `--text-secondary`, hover: `--text-primary`.

**Send button (right):**
- Arrow-up icon, `20px`, positioned `right: 12px`, vertically centered.
- Disabled state (empty input): `--text-tertiary`, `cursor: not-allowed`.
- Active state: `--accent` color background circle (`32px` circle), white arrow icon.
- Transition: `background-color 150ms ease`, `color 150ms ease`.

### 7.3 Above Input

- **Model selector pill**: appears just above the input area, left-aligned.
  - Pill shape: `border-radius: --radius-full`, `border: 1px solid --border-default`.
  - Contains: current model name + chevron-down icon.
  - `font-size: 13px`, `padding: 4px 10px`.
  - On click: popover list of available models.
- **Stop generation button**: appears in place of send button during streaming.
  - Square stop icon (`■`), same position and size as send.

---

## 8. Components

### 8.1 Buttons

#### Primary Button
```css
background: var(--accent);          /* #C96442 */
color: #FFFFFF;
border: none;
border-radius: var(--radius-sm);    /* 6px */
padding: 8px 16px;
font-size: 14px;
font-weight: 500;
cursor: pointer;
transition: background-color 150ms ease;

&:hover { background: var(--accent-hover); }
&:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
&:disabled { opacity: 0.4; cursor: not-allowed; }
```

#### Ghost / Secondary Button
```css
background: transparent;
color: var(--text-primary);
border: 1px solid var(--border-default);
border-radius: var(--radius-sm);
padding: 7px 15px;
font-size: 14px;
font-weight: 400;

&:hover { background: var(--bg-hover); }
```

#### Icon Button
```css
background: transparent;
border: none;
border-radius: var(--radius-sm);
padding: 6px;
color: var(--text-secondary);
cursor: pointer;
width: 32px; height: 32px;
display: flex; align-items: center; justify-content: center;

&:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
```

### 8.2 Dropdowns / Popovers

- Background: `--bg-surface`
- `border: 1px solid --border-default`
- `border-radius: --radius-md` (`10px`)
- `box-shadow: 0 4px 16px rgba(0,0,0,0.08)` (light mode) / `0 4px 16px rgba(0,0,0,0.3)` (dark)
- `padding: 6px`
- Items: `32–36px` tall, `border-radius: --radius-sm`, full-width, `padding: 0 10px`.
- Hover on items: `--bg-hover` fill.
- Animation: `opacity + translateY(-4px → 0)` over `150ms ease`.

### 8.3 Modals / Dialogs

- Backdrop: `rgba(0,0,0,0.4)`, covers full viewport.
- Card: `background: --bg-surface`, `border-radius: --radius-lg` (`14px`), `padding: 24px`.
- Max-width: `480px` for standard, `600px` for content-heavy.
- Shadow: `0 20px 60px rgba(0,0,0,0.15)`.
- Close button: `×` icon, top-right corner, `--radius-sm`, icon button style.
- Animation: `opacity 0→1` + `scale(0.97→1.0)` over `200ms ease`.

### 8.4 Tooltips

- Background: `#1A1A1A` (light mode) / `#F5F0E8` (dark mode) — inverted.
- Color: inverse of above.
- `border-radius: --radius-sm` (`6px`)
- `padding: 5px 10px`
- `font-size: 12px`
- Appear after `400ms` hover delay.
- Fade in over `100ms`.

### 8.5 Avatars

- Shape: circle (`border-radius: 50%`)
- Assistant mark: `20px` — diamond/flame logo mark SVG, `--accent` color.
- User avatar: `28px` — photo or initials. Initials: `--bg-user-message` background, `--text-primary` text, `font-size: 11px`, `font-weight: 600`.

### 8.6 Artifacts Panel (Split View)

When a code or HTML artifact is generated:

- Chat column shrinks to ~`50%` of available width.
- Artifact panel occupies the other `~50%`.
- Divider: `1px solid --border-default`, draggable.
- Panel toolbar (top): Copy, Download, Open in browser icons — right-aligned, `16px` icons.
- Panel background: `--bg-surface`.
- Content rendered in a sandboxed iframe.
- Toggle button: collapses/expands panel, fixed to the divider.

---

## 9. Iconography

### 9.1 Style

- **Line icons** — not filled, not flat-filled.
- Stroke weight: `1.5px` at `20px` size (scales proportionally).
- Line caps: `round`.
- Line joins: `round`.
- Closest public libraries: **Lucide** or **Phosphor** (Regular weight).

### 9.2 Sizing

| Context              | Size  |
|----------------------|-------|
| Sidebar nav          | `18px` |
| Standard UI icons    | `16–18px` |
| Primary action icons | `20–24px` |
| Input area icons     | `20px` |
| Tooltip / badge      | `14px` |

### 9.3 Color States

| State    | Color                  |
|----------|------------------------|
| Default  | `--text-secondary`     |
| Hover    | `--text-primary`       |
| Active   | `--accent`             |
| Disabled | `--text-tertiary`      |

---

## 10. Motion & Animation

### 10.1 Timing Tokens

```css
--duration-instant:  100ms;
--duration-fast:     150ms;
--duration-normal:   200ms;
--duration-slow:     250ms;
--duration-xslow:    350ms;

--ease-default:      ease;
--ease-in-out:       ease-in-out;
--ease-out:          cubic-bezier(0.0, 0.0, 0.2, 1);
```

### 10.2 Specific Animations

| Element              | Animation                                         | Duration   |
|----------------------|---------------------------------------------------|------------|
| Hover states         | `background-color`, `color` transition            | `150ms ease` |
| Button press         | `scale(0.97)` on `:active`                        | `100ms ease` |
| Sidebar collapse     | `width` slide + `opacity`                         | `250ms ease-in-out` |
| Dropdown/popover     | `opacity 0→1` + `translateY(-4px→0)`              | `150ms ease` |
| Modal open           | `opacity 0→1` + `scale(0.97→1.0)`                | `200ms ease` |
| Modal close          | Reverse of open                                   | `150ms ease` |
| Message appearance   | `opacity 0→1`                                     | `150ms ease` |
| Cursor blink         | `opacity 1→0→1` step function                    | `1s step-end infinite` |
| Message action reveal| `opacity 0→1`                                     | `150ms ease` |

### 10.3 Rules

- **No decorative animations.** Motion is always functional (state change, reveal, transition).
- **No bouncing, elastic, or spring animations** on UI chrome.
- Respect `@media (prefers-reduced-motion: reduce)` — disable all transitions and animations.
- Never animate `box-shadow` directly (expensive). Use `opacity` on a shadow pseudo-element if needed.

---

## 11. Responsive Behavior

### 11.1 Breakpoints

```css
--bp-mobile:  767px;   /* max-width for mobile */
--bp-tablet:  1023px;  /* max-width for tablet */
--bp-desktop: 1024px;  /* min-width for desktop */
```

### 11.2 Per-Breakpoint Behavior

| Feature                    | Desktop (≥1024px) | Tablet (768–1023px)     | Mobile (<768px)       |
|----------------------------|--------------------|-------------------------|-----------------------|
| Sidebar                    | Always visible, `260px` | Collapsible, hamburger icon | Off-canvas drawer |
| Chat column max-width      | `720px`            | Full width, `32px` padding | Full width, `16px` padding |
| Input area                 | Fixed bottom, offset by sidebar | Fixed bottom, full width | Fixed bottom, full width |
| Artifact split view        | 50/50 split        | Disabled (full overlay)  | Disabled              |
| Message action buttons     | On hover           | On hover / tap           | Always visible        |
| Model selector             | Visible above input| Visible                  | Accessible via menu   |

---

## 12. Accessibility

### 12.1 Color Contrast

All text/background combinations meet **WCAG AA** (4.5:1 for normal text, 3:1 for large text) in both light and dark mode.

Do not rely on color alone to convey state — always pair with shape, icon, or text.

### 12.2 Focus Management

```css
/* Visible focus ring for all interactive elements */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-xs);
}

/* Remove focus ring for mouse users */
:focus:not(:focus-visible) {
  outline: none;
}
```

### 12.3 Interactive Element Requirements

- All icon-only buttons must have `aria-label` describing the action.
- Streaming response region: `aria-live="polite"` or `aria-live="off"` (to avoid screen reader floods).
- Modal: `role="dialog"`, `aria-modal="true"`, focus trap on open, return focus on close.
- Sidebar: `role="navigation"`, `aria-label="Conversation history"`.
- Input: `aria-label="Message input"` or associated `<label>`.

### 12.4 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 13. Brand Identity

### 13.1 Logo Mark

- Abstract diamond/flame SVG shape.
- Color: `--accent` (`#C96442`) or monochrome white on dark backgrounds.
- Usage: sidebar header, loading states, favicon.
- Minimum size: `20px`. Never distort aspect ratio.

### 13.2 Wordmark

- "Claude" in a clean, slightly humanist sans-serif.
- Color: `--text-primary`.
- Never use the wordmark at angles or with effects.

### 13.3 Brand Voice in UI

The brand personality — calm, thoughtful, literary — should influence microcopy:

- Button labels: "New chat" not "Start chatting!" No exclamation marks.
- Empty states: short, direct, warm. "What's on your mind?" not "Let's get started! 🚀"
- Error messages: honest and helpful. "Something went wrong. Try again." not "Oops!"
- Placeholder text: conversational, not instructional. "Ask anything" not "Enter your prompt here."

### 13.4 Accent Color Usage Rules

The terracotta `#C96442` is used only for:
1. Primary CTA button fill
2. Logo mark
3. Active navigation indicator (if any)
4. Focus ring

**Never use it as:**
- A page background
- A section fill
- Decorative gradients
- Text color (except on accent-colored backgrounds)

---

## 14. CSS Variables Reference

Full set of CSS custom properties to implement in `:root` and `[data-theme="dark"]`:

```css
:root {
  /* Backgrounds */
  --bg-primary:       #FAF9F6;
  --bg-sidebar:       #F0EDE8;
  --bg-surface:       #FFFFFF;
  --bg-user-message:  #EFEBE4;
  --bg-input:         #FFFFFF;
  --bg-hover:         rgba(0, 0, 0, 0.04);
  --bg-code:          #F0EDE8;

  /* Borders */
  --border-default:   #E5E0D8;
  --border-strong:    #CEC8BE;

  /* Text */
  --text-primary:     #1A1A1A;
  --text-secondary:   #6B6460;
  --text-tertiary:    #9C9490;

  /* Accent */
  --accent:           #C96442;
  --accent-hover:     #B5573A;
  --accent-subtle:    rgba(201, 100, 66, 0.08);

  /* Border Radius */
  --radius-xs:        4px;
  --radius-sm:        6px;
  --radius-md:        10px;
  --radius-lg:        14px;
  --radius-xl:        18px;
  --radius-full:      9999px;

  /* Spacing */
  --space-xs:         4px;
  --space-sm:         8px;
  --space-md:         16px;
  --space-lg:         24px;
  --space-xl:         32px;
  --space-2xl:        48px;
  --space-3xl:        64px;

  /* Layout */
  --sidebar-width:    260px;
  --chat-max-width:   720px;
  --chat-padding:     24px;

  /* Motion */
  --duration-fast:    150ms;
  --duration-normal:  200ms;
  --duration-slow:    250ms;
  --ease-default:     ease;
  --ease-in-out:      ease-in-out;

  /* Shadows */
  --shadow-sm:        0 1px 3px rgba(0, 0, 0, 0.06);
  --shadow-md:        0 4px 16px rgba(0, 0, 0, 0.08);
  --shadow-lg:        0 20px 60px rgba(0, 0, 0, 0.12);
}

[data-theme="dark"] {
  --bg-primary:       #1C1917;
  --bg-sidebar:       #141210;
  --bg-surface:       #242220;
  --bg-user-message:  #2E2A26;
  --bg-input:         #242220;
  --bg-hover:         rgba(255, 255, 255, 0.05);
  --bg-code:          #2A2520;

  --border-default:   #3A3530;
  --border-strong:    #4A4540;

  --text-primary:     #F5F0E8;
  --text-secondary:   #A09890;
  --text-tertiary:    #706860;

  --accent:           #C96442;
  --accent-hover:     #D4714E;
  --accent-subtle:    rgba(201, 100, 66, 0.12);

  --shadow-sm:        0 1px 3px rgba(0, 0, 0, 0.2);
  --shadow-md:        0 4px 16px rgba(0, 0, 0, 0.3);
  --shadow-lg:        0 20px 60px rgba(0, 0, 0, 0.5);
}
```

---

## Quick Reference Cheat Sheet

| Decision               | Answer                                      |
|------------------------|---------------------------------------------|
| Assistant bubble?      | **No.** Prose flows directly on background. |
| User bubble?           | **Yes.** Warm parchment, `border-radius: 18px`. |
| Primary accent color?  | `#C96442` — muted terracotta.              |
| Background tone?       | **Warm.** Never cool gray or blue-white.    |
| Primary font?          | Söhne → fallback `ui-sans-serif`.           |
| Icon style?            | Line icons, `1.5px` stroke, rounded caps.  |
| Animation philosophy?  | Functional only. Slow and gentle.           |
| Chat column width?     | `max-width: 720px`, centered.               |
| Sidebar width?         | `260px`, fixed.                             |
| Code block style?      | Warm-toned bg, language label, copy button. |
| Accent usage?          | Sparingly — CTA buttons and logo only.     |
