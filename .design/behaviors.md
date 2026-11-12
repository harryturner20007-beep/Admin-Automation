# Behaviors

---

## Interaction Feedback

### Hover
Rows and cards: background to #F5F7FA (120ms). Buttons: accent to accent-hover. Summary cards: border to muted, no lift, no shadow. Hover nudges (pointer devices only, 180ms): sidebar link icon x:2; row action arrow x:4 on row hover; create "+" and close "X" rotate 90°.

### Click / Tap
No press animation; the state change is the feedback.

### Keyboard Navigation
Tab reaches each row's open control and action; Enter or Space opens details. Visible 2px accent focus ring.

### Focus Management
Opening details moves focus to the panel's first useful control. Closing returns focus to the row that opened it. The tablet drawer and mobile sheet are modal (`<dialog>`): focus stays inside and Escape closes.

---

## Motion

### Enter / Exit Animations
Detail panel and add-quote drawer: panel slide (x 24px→0 + fade, 200ms `power1.out`); dialog backdrop fades in 200ms. Exit is immediate. Panel sections rise in on open (40ms stagger, cap 6); switching quote re-runs only the header line reveal. Page h1 line reveal once per load; subtitle rise-in at 120ms, automation strip at 160ms, summary cards from 200ms (60ms stagger), first 8 rows/cards on first load (30ms stagger). Toast: y 12→0 + fade 200ms in, 150ms fade out. Empty states (no quotes, no matches) rise in.

### State Transitions
A saved status change flashes the row with the selected tint (GSAP, 900ms). Hover colours transition in 120ms. Summary counts/values tween old→new (400ms `power2.out`, formatted every frame so widths hold). Selected card border, outcome chip background: 150ms. Sidebar active edge slides between links (200ms `power2.out`, not on first paint). Composer text cross-fades 150ms when an option is picked; focus never moves. Reminder choices and the saved confirmation rise in. Search focus ring animates in 120ms. Filtering, sorting and searching never animate.

### Scroll-Linked Behaviors
Panel header is sticky inside the panel; the mobile sheet action bar is sticky at the bottom.

### Micro-Interactions
The "no follow-ups currently due" text uses one Animate.css `fadeIn`. The Three.js vehicle moves only while dragged.

### Reduced Motion
`prefers-reduced-motion: reduce` turns every GSAP tween off (checked per call with `motionAllowed()`, not `gsap.matchMedia`, which caches) and Animate.css (its built-in media query). Elements render in their final state; numbers swap. Nothing auto-animates.

---

## State Communication

### Loading
List skeleton on first load; "Saving…" on the affected button, disabled while saving.

### Errors
Inline next to the control that failed, saying what to do next; entered values are kept.

### Success
Inline confirmation in the panel's outcome section with Undo and Next quote; the row flashes.

### Validation Timing
On submit, then live after the first failed attempt.
