# Design DNA: Quote Follow-up

> A calm, light workspace for an independent UK garage's service desk to chase quotes and record customer decisions.

This file is the index for the `.design/` directory. Read the linked files for implementation details.

### Directory structure

```
.design/
  DNA.md              <- You are here. Overview and index.
  principles.md       <- Design principles with examples and counter-examples
  primitives.md       <- Color, typography, spacing, sizing, shape, elevation, motion
  scales.md           <- Responsive, grid, density, color modes
  semantics.md        <- Semantic mappings and usage rules
  behaviors.md        <- Interaction feedback, motion patterns, state communication
  components/
    controls.md       <- Button, input, status label, plate label
    quote-list.md     <- Summary cards, toolbar, table, mobile cards
    detail-panel.md   <- Side panel / drawer / sheet, composer
  patterns/
    shell-and-states.md <- Sidebar shell, empty states, outcome recording
```

---

## 1. Product Mental Model

### What is this product?
A managed quote follow-up service for independent UK garages. Service-desk staff see which sent quotes need chasing, contact customers and record outcomes, while scheduled SMS follow-ups run alongside.

### Information Architecture
Quotes (main workspace) · Replies (staff inbox) · Results (reporting) · Follow-up settings.

### Core Objects
Garage → Quotes → Messages (follow-ups, replies) · Staff tasks · Suppressions (opt-outs). Each quote has a status, an optional outcome and an optional reminder date.

### Navigation Model
Sidebar (desktop), icon rail (tablet), top bar (mobile). Quote details open beside or over the list.

---

## 2. Design Principles

1. **The queue is the work** -- the list decides who to chase next.
2. **Say exactly what happens** -- labels name real, simulated or external effects.
3. **Quiet surfaces, clear state** -- borders separate; colour signals state.
4. **Never lose the user's place** -- actions preserve filters, selection and scroll.
5. **Readable numbers** -- tabular, right-aligned money and counts.

-> Full principles: **[principles.md](principles.md)**

---

## 3. Primitives
Inter on #F5F7FA with white 12px-radius surfaces, one teal accent #0F6173, 8px spacing, 44px controls, shadow only on floating panels, motion only in response to actions.

-> **[primitives.md](primitives.md)**

---

## 4. Scales & Systems
Mobile-first; 768px and 1200px breakpoints; single comfortable density; light mode only.

-> **[scales.md](scales.md)**

---

## 5. Semantics
Hierarchy by weight and colour (#17212B vs #596779); success and attention tints carry state.

-> **[semantics.md](semantics.md)**

---

## 6. Components

- **[Controls](components/controls.md)** -- button, input, status label, plate label.
- **[Quote list](components/quote-list.md)** -- summary cards, toolbar, table, mobile cards.
- **[Detail panel](components/detail-panel.md)** -- side panel, drawer, sheet, composer.

---

## 7. Patterns

- **[Shell and states](patterns/shell-and-states.md)** -- sidebar shell, three empty states, outcome recording.

---

## 8. Behaviors
Four GSAP primitives (line reveal, rise-in, hover nudge, panel slide) with fixed durations and stagger caps, plus count tweens and a saved-row flash; Animate.css once in the empty state; never on filter/sort/search; reduced motion removes all of it; saving and errors shown inline.

-> **[behaviors.md](behaviors.md)**

---

## 9. Signature Components
**Registration-first rows**: every quote leads with its plate label before the customer's name, matching how garages talk about jobs.

---

## 10. Tech Stack & Libraries

### Required Libraries
Next.js 16 App Router, Tailwind v4 (`@theme` tokens in `src/app/globals.css`), GSAP (panel and highlight), Animate.css (empty-state entrance only), Three.js (empty-state vehicle only, loaded on demand). Icons: in-house `Icon` in `src/components/ui.tsx`.

### Import Conventions
`@/components/*`, `@/domain/*`, `@/demo/*`.

### Forbidden
No new icon or component libraries · no gradients · no shadow on in-page cards · no autoplay animation.

---

## 11. References
- **Linear**: list density and keyboard-first selection. <!-- default: no reference given -->
