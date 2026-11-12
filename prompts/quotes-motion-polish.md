# Polish the Quotes workspace: layout precision and motion pass

You are an expert front-end developer working inside an existing **Next.js 16 App Router** app (React 19, Tailwind v4 `@theme` tokens, GSAP, Animate.css, Three.js). Before you write any Next.js code, read `node_modules/next/dist/docs` (see AGENTS.md). Polish the existing **Quotes workspace** (`/quotes`) so it feels as considered and alive as a premium editorial site. **Do not change what the app does.** Every control, label, data rule, keyboard path and saved result must work exactly as it does today. This is a visual and motion pass, not a redesign of the workflow.

Edit the existing components (`src/components/Shell.tsx`, `QuotesView.tsx`, `QuotePanel.tsx`, `AddQuoteDrawer.tsx`, `NoFollowUpsDue.tsx`, `Toast.tsx`, `ui.tsx`, `src/app/globals.css`). Do not create a standalone HTML file, and add no new dependencies. Leave `src/domain/*` and `src/demo/store.tsx` untouched. If a change seems to need them, stop and say why.

## What it is

A calm, light workspace for an independent UK garage's service desk. Staff use it to chase repair quotes and record what customers decided. **The queue is the work:** the page opens straight onto the list. It has no splash screen, hero or marketing copy. The tone is confident and quiet, like a well-made tool. The motion should feel precise and springy, but never slow staff down or move content they are about to click.

## Non-negotiables (from the project's Design DNA, `.design/` and `CLAUDE.md`)

- **Principles:** the queue is the work; say exactly what happens (real vs simulated vs external); quiet surfaces, clear state; never lose the user's place; readable numbers (tabular, right-aligned).
- **Forbidden:** gradients; shadows on in-page cards; a second accent colour; new icon or component libraries; autoplaying animation or carousels; proportional digits in money; a "Send" label on anything that doesn't send in-app.
- **No scroll hijacking.** Don't add Lenis or any smooth-scroll library. The table, the side panel and the native `<dialog>` sheet each scroll on their own and must keep native scrolling and scroll restoration.
- **No loader or curtain.** The skeleton (`LoadingSkeleton.tsx`) is the only loading state. It shows only while the app is actually loading and is never padded to a minimum time.
- **Reduced motion:** when `prefers-reduced-motion: reduce` is set, every animation in this brief is off. Elements appear in their final state at once, with no shortened version. Use the existing `motionAllowed()` helper in `QuotePanel.tsx`; don't use `gsap.matchMedia`, which caches its result.
- **Clean-up:** every GSAP tween or timeline is created inside an effect and reverted on unmount (`tween.revert()` or `ctx.revert()`).
- **No motion on mobile hover:** hover effects run only under `(hover: hover) and (pointer: fine)`.

## Tokens (already in `globals.css`; use these names only)

```
canvas #F5F7FA   page bg, hover row, plate fill
surface #FFFFFF  cards, panels
text #17212B     primary text
muted #596779    secondary text, icons
line #DCE3EA     borders
accent #0F6173   hover accent-hover #0B4C5B
selected #EAF4F6 selected bg
success #166534 / #ECFDF3   attention #92400E / #FFFBEB   danger #B42318 / #FEF3F2
shadow-float  0 8px 24px rgba(23,33,43,.08), 0 2px 6px rgba(23,33,43,.06)   drawer/sheet/toast only
```

- **Type:** Inter. h1 28px/650; section title 18px/600; summary count 24px/600 with tabular-nums; body 14px/400; meta 12px. Labels and buttons use 500.
- **Spacing:** 8px base (4 for dense labels only). Workspace padding is 32px at 768px and up, 16px below.
- **Radius:** cards and panels 12px; buttons, inputs and selects 8px with a 44px minimum height; status labels 6px; plate labels 4px.
- **Breakpoints:** `md` 768, `desk` 1200 (custom). Keep px/rem sizing as it is; no viewport-scaled root font size.

## Motion vocabulary (GSAP; use these four primitives everywhere)

1. **Line reveal:**
   - Wrap the text in an `overflow:hidden` box with `padding-bottom:0.12em` so descenders aren't clipped.
   - The inner span moves from `yPercent:100, opacity:0` to `0, 1`.
   - Duration 420ms, `expo.out`, 60ms stagger between words.
   - Runs **once per page load**, never again on re-render or filter change.
   - Screen readers read the whole text: put `aria-label` on the parent and `aria-hidden` on the split spans.
2. **Rise-in:** `y:12, opacity:0` to `0, 1`, duration 260ms, `power3.out`. Trigger with an IntersectionObserver, once per element, and delay by index as stated per block. If the element is already on screen at mount, it plays immediately.
3. **Hover nudge:** a small transform on pointer enter, reversed on leave. Duration 180ms, `power2.out`. Hover only (see non-negotiables). Transform and opacity only, never layout properties.
4. **Panel slide:** `x:24, opacity:0` to `0, 1`, duration 200ms, `power1.out`. This is the DNA default and stays as it is.

The only motion beyond these four is the existing **saved-row flash** (900ms, selected tint) and the **Animate.css `fadeIn` once** on the "No follow-ups currently due" text. Keep both unchanged.

## Layout and blocks, in order

### 1) Shell (`Shell.tsx`)

- **Sidebar and rail:**
  - At 1200px and up: a 208px white sidebar with a right border in `line`.
  - From 768 to 1199px: a 64px icon rail.
  - The garage name (16px/600) sits at the top. The links are Quotes, Replies and Results; settings and the pause button sit at the bottom.
- **Active link:** `selected` background, `accent` text, and a 3px accent left edge. The edge slides between links with a 200ms `power2.out` tween of its `y` and `height`, and doesn't animate on first paint.
- **Hover:** the link icon nudges `x:2`.
- **Below 768px:** keep the mobile header exactly as it is. No new fullscreen menu.
- **Demo strip and paused banner:** keep both. The demo strip must keep saying the clock and SMS are simulated.

### 2) Page header

- **h1:** "Quotes" with a line reveal at page load.
- **Subtitle:** "Follow up with customers and record their decisions." in 14px `muted`. It uses rise-in with a 120ms delay.
- **Create action:** the primary button, labelled as it is today. Its leading "+" rotates 90° on hover.

### 3) Automation strip

This is one quiet row under the header, inside a 12px-radius white card with a `line` border. It holds:
- the follow-up mode (Off, Draft or Automatic);
- the last check time, in UK time;
- the number of drafts awaiting approval;
- a secondary **"Run check now"** button, which shows "Checking…" and is disabled while busy;
- a link to Settings.

It uses rise-in with a 160ms delay. Its wording says plainly that checks are simulated in the demo.

### 4) Summary cards (Needs follow-up · Awaiting reply · Accepted)

- **Layout:** three `aria-pressed` buttons in a grid, 3 columns at 768px and up, stacked rows below. Each shows a 24px/600 count and a 12px `muted` total value, both tabular.
- **Entrance:** rise-in staggered by `index × 60ms`, starting at 200ms.
- **Count changes:**
  - When a count or value changes after a save or undo, tween the number from old to new over 400ms with `power2.out`.
  - Format every frame with the existing pound formatter so digits never change width.
  - Under reduced motion the number just swaps.
- **States:**
  - Selected: `accent` border and `selected` background. The border colour tweens over 150ms; nothing moves.
  - Hover: the border changes to `muted`. **No lift and no shadow.**
- **"All quotes (N)":** keep it exactly as it works now.

### 5) List toolbar

- **Controls:** search ("Search customer, registration or work"), status filter and sort, with today's behaviour and defaults. Below 768px, search goes on its own line.
- **Motion:** none, except that focusing the search input animates the focus ring in over 120ms.

### 6) Quote table (768px and up) and quote cards (below 768px)

- **Table columns:** Customer & vehicle (plate first) · Work (2-line clamp) · Quote value (right-aligned, tabular) · Status (tinted label) · Follow-up · Action.
- **Rows:** about 80px high, `canvas` background on hover.
- **Selected row:** `selected` background plus a 3px accent left edge. Keep the existing `aria-current` on the row button.
- **Entrance:**
  - On first load only, the first 8 visible rows rise in, staggered `index × 30ms`.
  - Rows don't animate when filtering, sorting or searching. They swap at once so staff never wait on the list.
- **Action button:**
  - The labels stay "Chase quote" and "View quote".
  - Its trailing arrow (the existing `next` icon) nudges `x:4` on row hover.
- **Mobile cards:** plate + price / customer + work / status + timing / full-width action. They follow the same first-load-only rise-in rule.
- **Saved-row flash:** unchanged.

### 7) Detail panel (`QuotePanel.tsx`)

- **Container:**
  - At 1200px and up: a 420px panel beside the list.
  - From 768 to 1199px: a modal `<dialog>` drawer with a backdrop.
  - Below 768px: a full-screen sheet with a sticky action bar that never covers fields.
- **Open:** panel slide. The `dialog` backdrop fades in over 200ms.
- **Close button:** the X rotates 90° on hover. Closing must keep the search, filters, selection, scroll position and focus return working exactly as they do today.
- **Section order (unchanged):**
  1. Sticky header: plate, customer, labelled Close.
  2. Amount and status.
  3. Work and line items.
  4. Contact.
  5. Message composer.
  6. Scheduled texts.
  7. Activity.
  8. Outcome and reminder.
- **Section entrance:** each section rises in on panel open, staggered `index × 40ms`, capped at 6 sections. Switching to another quote while the panel is open re-runs only the header's line reveal (plate and name), not the whole stagger.
- **Composer:** the option chips (Friendly reminder / Any questions? / Ready to book?) cross-fade the textarea text over 150ms. The text stays editable at all times, and focus never moves.
- **Contact button labels** stay truthful: "Open Messages app", "Call customer", "Copy message", "Approve & send (mock SMS)". Don't rename them for style.
- **Outcome choices:**
  - Accepted / Needs time / No reply / Declined.
  - The selected chip's background tweens to `selected` over 150ms.
  - Reminder choices (Tomorrow / In 3 days / Choose date) appear with rise-in when Needs time or No reply is chosen, always showing the actual date.
- **Saving:**
  - The button reads "Saving…" and is disabled while saving. Keep the duplicate-click guard.
  - On success, the confirmation line (outcome + Undo + Next quote) rises in.
  - On failure, the user's input stays and the error shows inline.

### 8) Add quote drawer (`AddQuoteDrawer.tsx`)

- Same 200ms panel slide from the right, with the `shadow-float` shadow.
- The plate preview rises in as soon as a registration is typed.
- Fields, validation and labels are unchanged.

### 9) Empty states

| State | Behaviour |
|---|---|
| No quotes yet | Rise-in, plus the create action |
| No matches | Rise-in, plus "Clear search and filters" |
| No follow-ups currently due | Unchanged |

For "No follow-ups currently due", keep the existing:
- 160px Three.js car, loaded on demand;
- drag or arrow keys to rotate;
- rendering only on interaction and resize;
- SVG fallback without WebGL;
- Animate.css `fadeIn` once on the text.

Don't add more Three.js anywhere.

### 10) Toast (`Toast.tsx`)

- Slides up `y:12` to `0` with a fade over 200ms, using `shadow-float`.
- Leaves with a 150ms fade.
- Keeps its existing text and Undo behaviour.

## Fixed parameters

- **Durations:** line reveal 420ms (60ms stagger); rise-in 260ms; hover 180ms; panel and drawer 200ms; count tween 400ms; chip and border tweens 150ms; toast 200ms in, 150ms out; saved flash 900ms.
- **Easings:** reveals `expo.out`; rise-in `power3.out`; hovers and counts `power2.out`; panel `power1.out`.
- **Stagger caps:**
  - Rows: first 8 only, first load only.
  - Panel sections: 6.
  - Summary cards: 3.
- **Every animation:**
  - is transform or opacity only;
  - is off under reduced motion;
  - is reverted on unmount;
  - never runs on filter, sort or search changes.

## Before and after

1. Run `/dna:update` to add the four motion primitives and the durations above to `.design/behaviors.md` and `.design/primitives.md`. Then build against them.
2. After building, run `/dna:check`, `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build`. Fix anything that fails.
3. Check at 1440, 1024 and 390 px wide, and confirm:
   - search and filters combine correctly;
   - summary counts and values match the rows;
   - the panel keeps your place on close;
   - Undo works;
   - persistence survives a refresh;
   - keyboard focus order and focus return are right;
   - nothing moves under reduced motion;
   - the mobile sheet's action bar never covers a field;
   - no animation delays a click (pick a row immediately after load and after a filter change).
4. Finish with the local URL (`http://localhost:3000/quotes`) and any remaining limitations.

Use synthetic data only. Live SMS sending stays off.
