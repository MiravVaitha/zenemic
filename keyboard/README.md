# Handoff: Zenemic AI Keyboard

## Overview

Zenemic is a custom keyboard for an event-organising app. Visually and behaviourally it's an **iOS-style dark keyboard**, with one addition: a circular brand button in the top-left of the suggestion bar (where Google's "G" would be on Gboard).

Tapping that button puts the keyboard into a "listening" mode — the keyboard expands vertically, opens a prompt panel, and the user describes an event in natural language ("Friday 8pm dinner at Bottega with Sam, Alex, Priya — split the $180 bill"). When the user hits Generate, the prompt is sent to a backend that:

1. Parses it with the **Anthropic API** into a structured event payload
2. Creates a **Google Calendar** event
3. Sets up a **Stripe payment-split** request among the named attendees
4. Generates a **Google Maps** directions link to the venue

The result is shown as a bottom sheet with three cards (Calendar / Split / Map). Each card drills into a full-screen detail view where the user can review and adjust before confirming.

Aside from the Zenemic button, the keyboard behaves identically to the stock iOS keyboard — typing works normally into whatever text field the host app exposes.

---

## About the Design Files

The files in this bundle are **design references created in HTML/React** — they're a visual + behavioural prototype, not production code to copy verbatim. The task is to **recreate this design inside the target codebase's existing environment** using its established patterns and libraries.

The realistic delivery target is one of:
- **iOS custom keyboard extension** (Swift + UIKit/SwiftUI). The whole component tree should map cleanly to native views; the prompt panel and result sheet would live in the keyboard's input view container.
- **React Native** if the app is RN-based — the JSX here will translate fairly directly with `View`/`Text`/`Pressable`.
- **Web** if this is meant as a chat-widget keyboard inside a web app — the code is closer to drop-in.

If no framework is chosen yet, **iOS keyboard extension in Swift** is the most likely production target given the description ("mobile keyboard like the iPhone keyboard").

---

## Fidelity

**High-fidelity.** Final colours, type, spacing, gradients, animations, and interaction states are all specified. The dev should recreate it pixel-perfectly using the target platform's primitives. Hex values, durations, and pixel measurements in this README are the source of truth.

---

## Screens / Views

### 1. Idle keyboard

The default state. From bottom to top of the keyboard container:

- **Home-bar gesture line** — 134×5px white pill (95% opacity), centred, 8px margin top
- **Bottom row** — 6px horizontal gaps:
  - `123` key — flex 1.5, 16px font, bg `#3a3a3c`
  - Globe icon key — flex 1.1, bg `#3a3a3c`
  - `space` key — flex 5, 16px font, bg `#6b6b6e` (lighter — main key colour)
  - `return` key — flex 2, 16px font, bg `#3a3a3c`
- **Row 3 (z–m + shift + delete)** — 6px gaps:
  - Shift key — flex 1.4, bg `#3a3a3c` when off / `#ffffff` when on. Icon: outlined up-arrow with stem when off; filled black up-arrow on white when on.
  - Letter keys `z x c v b n m` — flex 1 each, bg `#6b6b6e`, 24px white text
  - Delete key — flex 1.4, bg `#3a3a3c`, outline-X-in-arrow icon
- **Row 2 (a–l)** — 18px horizontal padding on the whole row, 6px gaps between keys, all `#6b6b6e`
- **Row 1 (q–p)** — 6px gaps, all `#6b6b6e`
- **Suggestion bar** — 40px tall, in order:
  - 40px-wide slot containing the **Zenemic logo button** (30px circle, see Brand)
  - 1px vertical divider (16px tall, `rgba(255,255,255,0.18)`)
  - Three predictive-text suggestions, evenly split by `flex: 1`, 16px white text, dividers between
- The whole keyboard sits on background `#1c1c1e` with a 0.5px top border at `rgba(255,255,255,0.06)`

All keys have:
- 5px border-radius
- 42px height
- `box-shadow: 0 1px 0 rgba(0,0,0,0.85)` to fake the iOS bevel
- Press-down state changes bg to `#8a8a8c` with 50ms transition
- SF Pro Display / -apple-system font

### 2. Listening (prompt panel expanded)

Replaces the suggestion bar with a taller panel. Slides in from above the keys with the `zen-expand` animation (280ms, cubic-bezier(.2,.7,.2,1)).

Panel background: vertical gradient `linear-gradient(180deg, #232325 0%, #1c1c1e 100%)`, 12px padding, 0.5px top border.

Header row (28px tall, 10px gap):
- **Zenemic logo** (26px, no glow)
- Text column: "Zenemic" (13px, 600, white) followed by an inline gradient badge "AI" (9px, 700, white text on `linear-gradient(90deg, #8B5CF6, #EC4899)`, 99px radius). Below: "Describe your event — Anthropic will handle the rest" (10.5px, `#a8a8ad`).
- **Waveform** — 7 vertical bars, 2.5px wide, gradient `#8B5CF6 → #EC4899`, each animating with `zen-wave` 700ms infinite, staggered 80ms per bar.
- **Close button** — 26×26px circle, `rgba(255,255,255,0.08)` bg, dim X icon.

Prompt input area:
- 14px border-radius card, `#0f0f10` bg, 1px divider border
- Subtle radial gradient overlay in the corners using brand colours at 12% alpha
- 42px min-height text area showing either the placeholder (`#a8a8ad`) or live transcription (`#fff`, 15px, line-height 1.4)
- Blinking caret: 2×16px, `#EC4899`, animated via `zen-blink`
- Footer row:
  - Three chips: "📅 Calendar", "💸 Split", "📍 Map" — 11px, 500, `#a8a8ad`, 99px radius, 4×8px padding, faint white bg + divider border
  - "Generate" CTA — 30px tall, 99px radius, padding `0 13px`, gradient `linear-gradient(90deg, #8B5CF6, #EC4899)`, white 13px/600 text + sparkle icon. Disabled state: `#2a2a2c` bg, 0.5 opacity.

### 3. Generating overlay

Full-bleed overlay (`position: absolute, inset: 0`), `rgba(0,0,0,0.7)` with `backdrop-filter: blur(8px)`. Fades in 200ms.

Contents centred, 22px gap:
- 72px Zenemic logo with glow, plus a rotating border ring (2px, top edge `#EC4899`, right edge `#8B5CF6`), `zen-spin` 1.1s linear infinite
- "Analyzing your event…" (18px, 600, white) + subtitle "Parsing date, venue, attendees and bill total." (13px, `#888`, max-width 260)
- Quoted prompt in a faint card
- 4-step pipeline list (12px text, 14px circle indicators):
  1. "Sending to Anthropic API" — done (green check on `#22C55E`)
  2. "Creating Google Calendar event" — active (pulsing pink dot on `#EC4899` ring)
  3. "Setting up Stripe payment split" — pending (grey `#555`)
  4. "Generating Google Maps directions" — pending

In production this should update progressively as each backend step completes.

### 4. Result bottom sheet

Slides up over the host app (`zen-slideup`, 320ms). Backdrop is `rgba(0,0,0,0.55)` + 6px blur. Sheet hugs the bottom 92% of the screen, 20px top corners, `#0f0f10` bg.

Structure:
- 36×4px grey drag handle, centred
- Header (8px padding, 10px gap): 32px Zenemic logo, label "ZENEMIC · GENERATED" (11px/600 dim caps), title (17px/600 white), close button
- Scrollable section list (10px gap):
  - **Calendar card** — tint `#4285F4`. Icon, label, "Event created" title, when/where lines.
  - **Stripe card** — tint `#635BFF`. Title `$<total> ÷ <n>`, per-person amount summary, overlapping avatar stack (22px circles, -7px overlap, 2px `#18181a` border).
  - **Map card** — tint `#34A853`. Same header, then a 90px stylised map SVG with a route line in brand pink, a place-label pill, then text rows.
  - Each card has 16px radius, `#18181a` bg, 1px divider border, chevron-right at the right edge, brand-tinted "READY" pill, and press feedback (`background: #222225`, 99% scale).
- Hint line: "Tap any card to review or edit before confirming" (11px dim, centred)
- Footer (1px top divider, `#0f0f10` bg, 10px gap):
  - "Discard" — outlined 44px button
  - "Confirm all" — primary gradient button with sparkle icon

### 5. Detail screens (Calendar / Stripe / Map)

Each card opens a full-screen sub-view that slides in from the right (`zen-slidein`, 280ms). Layout shared by all three:

- **Header** — 14px padding, 1px bottom divider. Background gradient: `linear-gradient(180deg, <tint>1a 0%, transparent 100%)`. Contents: back button (32px circle), tint-coloured icon tile (30×30, 8px radius, `<tint>22` bg), small caps label + 16px/600 title.
- **Scrollable content** — 14px padding, 12px gap, organised as `<Field label="...">` sections (11px caps label + `#18181a` 12px-radius card)
- **Footer** — 1px top divider, two-button row (secondary outlined + primary tinted with `0 6px 18px <tint>55` shadow)

#### Calendar detail
- Event title (17px/600)
- When + repeat/timezone secondary line
- Where + tappable "📍 Open in Maps" chip
- Guests list — 30px avatars, name, RSVP status pill that cycles Pending → Going → Declined on tap (amber / green / red 18%-alpha pills)
- AI-generated notes — italic body inside a violet-tinted card
- Reminders — `RowItem` list with right-aligned values, "+ Add reminder" muted row

#### Stripe detail
- Big total card — 18px padding, gradient bg `linear-gradient(135deg, #635BFF22, #635BFF08)` with `rgba(99,91,255,0.25)` border. 36px/700 dollar amount. Live balance status under it (✓ Balanced or "Over by $X").
- Split-method segmented control — `Equal / By share / By item` (active = `#2a2a2c`, inactive = transparent text dim)
- Per-person rows — avatar, name, sub-text (email / payment method / "Host · already paid"), `−` button, amount pill (`#0f0f10` bg, 64px min width), `+` button. Stepper bumps are ±$1.
- Options — RowItems with mini iOS toggles (32×18px pill, 14px knob, brand-pink when on / `#3a3a3c` when off)

#### Map detail
- Larger 200px map preview at top
- Transport mode picker — 4 cells (Drive / Transit / Walk / Bike) with emoji, big duration, small label. Active cell uses `rgba(52,168,83,0.18)` bg + green border.
- Turn-by-turn list — 28px direction badges (`↑ ↱ ↰ ●`), step text, distance subtext. Final "Arrive at <venue>" row uses green tint.
- Place card — venue name, "Italian · $$ · ★ 4.6", address, hours status (green if open).

Footer: "Share link" (secondary) + "Open in Google Maps" (green primary).

---

## Interactions & Behavior

### Keyboard input
- **Tap a letter key** → emits that character via `onKey(char)`. Parent appends to the active text buffer.
- **Tap shift** → cycles single-shift / caps-lock (double-tap within 300ms enables caps-lock). Letter casing updates instantly.
- **Tap delete** → emits `__back`. Parent removes the last character.
- **Tap 123 / globe** → reserved hooks; emit `__123` / `__globe` (no-op in this draft). The dev should wire these to a numeric/symbol layout and language switcher respectively.
- **Tap space after period** → re-enables shift for next sentence.
- **Tap return** → emits `__enter`. In listening mode this submits the prompt; in compose mode the host decides what return means (send message, newline, etc.).

### Zenemic flow
1. **Idle**. Suggestion bar with the logo. Tapping the logo → `startListening()` clears the prompt buffer, sets shift, transitions to `listening`. The keyboard expands with `zen-expand`.
2. **Listening**. Typing now writes to the prompt buffer instead of the host text field. The waveform animates. The user can dismiss via the close button (returns to idle) or hit Generate.
3. **Generating**. The prompt is POSTed to the backend. Generating overlay shows the 4-step pipeline. On success, transition to `done`; on failure, return to `listening` with an error toast.
4. **Done**. Result bottom sheet slides up. User can:
   - Tap any of the 3 cards → drill into the detail screen (`zen-slidein`)
   - Tap back inside a detail → return to the sheet
   - Tap Discard → reset to idle
   - Tap Confirm all → fire the real calendar/stripe/maps commits, then reset

### Animation tokens
- **zen-expand** — 280ms cubic-bezier(.2,.7,.2,1). For the prompt panel.
- **zen-slideup** — 320ms cubic-bezier(.2,.7,.2,1). For the result sheet.
- **zen-slidein** — 280ms cubic-bezier(.2,.7,.2,1). For detail screens.
- **zen-fadein** — 200ms ease. For overlays.
- **zen-blink** — 900ms infinite. Caret in prompt + compose.
- **zen-wave** — 700ms infinite ease-in-out, staggered 80ms per bar.
- **zen-spin** — 1.1s linear infinite. Loading ring.
- **zen-pulse** — 1s infinite. Active step indicator.

---

## State Management

State lives in the `ZenemicController` (see `src/app.jsx`):

| State           | Type                                            | Owned by      |
|-----------------|-------------------------------------------------|---------------|
| `mode`          | `'idle' \| 'listening' \| 'generating' \| 'done'` | Controller    |
| `text`          | `string` — AI prompt buffer                      | Controller    |
| `composeText`   | `string` — host app text field                   | Host (passed) |
| `result`        | `EventPayload \| null`                           | Controller    |
| `shift`         | `boolean`                                        | Controller    |
| `capsLock`      | `boolean`                                        | Controller    |

The keyboard component is **controlled** — it doesn't own any of the above. Every key tap goes through `onKey` which the controller dispatches.

The host app gives the controller `composeText` + `onComposeChange`. The controller routes typing to either the host or its own prompt buffer based on `mode`.

---

## Backend integration

Two seams to implement (placeholders in `src/app.jsx`):

```js
async function callZenemicAPI(prompt: string): Promise<EventPayload>
async function confirmZenemicEvent(event: EventPayload): Promise<void>
```

`EventPayload` shape:

```ts
type EventPayload = {
  title:   string;            // "Dinner at Bottega"
  when:    string;            // "Fri, May 30 · 8:00 – 10:30 PM"
  where:   string;            // "Venue · Address"
  guests:  string[];          // ["Sam","Alex","Priya"]
  total:   number;            // 180

  calendarEventId?: string;
  stripeRequestIds?: string[];
  mapsUrl?: string;
};
```

Suggested backend flow:
1. Receive `prompt`, forward to Anthropic Messages API with a system prompt that extracts the structured fields above.
2. Validate, then in parallel:
   - Create the Google Calendar event (don't commit invites yet — pending user confirm).
   - Create Stripe PaymentIntents or PaymentLinks for each guest's share.
   - Construct a Google Maps directions URL for the venue.
3. Return the merged payload to the client.
4. On `confirmZenemicEvent`, actually send Calendar invites + Stripe payment requests.

---

## Design Tokens

### Colours
| Token              | Hex                          | Use                            |
|--------------------|------------------------------|--------------------------------|
| Keyboard bg        | `#1c1c1e`                    | Outer chrome                   |
| Letter key         | `#6b6b6e`                    | Q–P, A–L, Z–M, space           |
| Special key        | `#3a3a3c`                    | Shift / delete / 123 / return  |
| Key press          | `#8a8a8c`                    | Tap feedback                   |
| Key shadow         | `rgba(0,0,0,0.85)`           | 1px bottom (iOS bevel)         |
| Text               | `#ffffff`                    | Key labels                     |
| Text dim           | `#a8a8ad`                    | Secondary copy                 |
| Divider            | `rgba(255,255,255,0.08)`     | Card borders                   |
| Brand violet       | `#8B5CF6`                    | Logo / accent A                |
| Brand pink         | `#EC4899`                    | Logo / accent B / caret        |
| Brand amber        | `#F59E0B`                    | Logo / accent C                |
| Calendar tint      | `#4285F4`                    | Google Calendar card           |
| Stripe tint        | `#635BFF`                    | Stripe card                    |
| Maps tint          | `#34A853`                    | Google Maps card               |
| Success            | `#22C55E` / `#4ade80`        | RSVP "Going", pipeline done    |
| Warn               | `#F59E0B` / `#fbbf24`        | "Pending"                      |
| Danger             | `#FF4D4D` / `#FF8585`        | "Declined"                     |

### Spacing
Keys: 6px horizontal gap, 11px vertical gap between rows, 18px side padding on the A–L row. Card padding 12–14px. Detail screen padding 14px. Bottom sheet inner gap 10px.

### Type
Family: `-apple-system, "SF Pro Display", BlinkMacSystemFont, system-ui, sans-serif`.

| Use                  | Size | Weight |
|----------------------|------|--------|
| Key letter           | 24px | 400    |
| Key (space/return)   | 16px | 400    |
| Suggestion text      | 16px | 400    |
| Sheet title          | 17px | 600    |
| Card title           | 15px | 600    |
| Caps label           | 11px | 600    |
| Body                 | 13–14px | 400 |
| Big total ($)        | 36px | 700    |

### Border radius
- Keys: 5px
- Chips / pills / toggle track: 99px (full)
- Cards: 12–16px
- Sheet top: 20px
- Buttons: 12px (CTA), 99px (Generate / pill CTAs)
- Logo: circle

### Shadows
- Key bevel: `0 1px 0 rgba(0,0,0,0.85)`
- Primary CTA: `0 8px 24px <tint>44` (pink for brand, calendar-blue / stripe-violet / maps-green for tinted CTAs)

---

## Assets

All visuals are inline SVG — no image files. The Zenemic logo is a generated mark (gradient circle + stylised Z + sparkle dot). The dev can either keep this generated form or swap in a final logo asset; if the latter, replace `<ZenemicLogo />` with an `<Image>` wrapping the asset and keep the gradient glow halo as a separate layer.

---

## Files

- `index.html` — minimal browser preview harness
- `src/keyboard.jsx` — `<ZenemicKeyboard />`, `<ZenemicLogo />`, suggestion bar, prompt panel, keys, icons, colour tokens
- `src/result.jsx` — `<EventResultCard />` bottom sheet + three detail screens (`CalendarDetail`, `PaymentDetail`, `MapDetail`) + shared helpers (Avatar, Field, RowItem, MapPreview, brand icons)
- `src/app.jsx` — `<ZenemicController />` orchestrator + backend integration seams + generating overlay
