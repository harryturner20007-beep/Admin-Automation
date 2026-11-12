# Primitives

The foundational design values. Every component and pattern references these.

---

## Color

### Palette
| Name | Hex | Usage |
|---|---|---|
| accent | #0F6173 | Primary actions, selected borders, focus ring, links |
| accent-hover | #0B4C5B | Hover/pressed state of accent surfaces |
| selected | #EAF4F6 | Selected rows, selected summary card, active nav item |
| success | #166534 on #ECFDF3 | Accepted / booked status labels, positive confirmations |
| attention | #92400E on #FFFBEB | Needs follow-up, overdue, reply waiting |
| danger | #B42318 on #FEF3F2 | Opted out, failed send <!-- default: brief has no error colour; WCAG-AA red pair --> |

### Neutral Scale
| Step | Hex | Role |
|---|---|---|
| ink | #17212B | Main text, headings |
| muted | #596779 | Secondary text, metadata, icons |
| line | #DCE3EA | Borders, dividers, table rules |
| canvas | #F5F7FA | Page background, plate-label fill, hover row |
| surface | #FFFFFF | Cards, panels, list container |

### Generation Method
Hand-picked (client specification, 2026-11-12).

---

## Typography

### Font Families
- Body / UI / headings: `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
- Mono: not used in the Quotes workspace. <!-- default: no code display in product -->

### Font Weights
400 body · 500 labels and buttons · 600 table emphasis, card counts · 650 main heading only.

### Base Size
16px root; UI text is 14px.

### Type Scale
| Name | Size | Use |
|---|---|---|
| heading | 28px | Page heading ("Quotes"), weight 650 |
| title | 18px | Panel and section titles |
| count | 24px | Summary card counts |
| body | 14px | Body copy, table cells, controls |
| meta | 12px | Secondary metadata, timestamps, helper text |

### Line Heights
Heading 1.2 · body 1.5 · table cells 1.4 · meta 1.4.

### Letter Spacing
None (default tracking). Plate labels +0.04em. <!-- default -->

### Paragraph Spacing
8px inside panels; 16px between sections.

---

## Spacing

### Base Unit
8px (4px only inside dense labels).

### Scale
Linear: 4, 8, 12, 16, 24, 32, 40, 48.

### Named Steps
xs=4 · sm=8 · md=16 · lg=24 · xl=32 · 2xl=48.

---

## Sizing

### Component Size Scale
Single size: 44px minimum height for buttons and inputs. Table rows about 80px, growing with content.

### Icon Sizes
16px inline, 20px navigation. Stroke icons from `src/components/ui.tsx` (`Icon`).

### Touch Targets
44 × 44px minimum (WCAG 2.5.5).

---

## Shape

### Border Radius Scale
Cards, list container, panels: 12px · buttons, inputs, selects: 8px · status labels: 6px · plate labels: 4px.

### Border Width Scale
1px default · 3px selected-row accent edge · 2px focus ring.

### Philosophy
Soft but precise: rounded containers, square-ish small labels.

---

## Elevation

### Shadow Definitions
- flat: none (cards, table, desktop side panel).
- float: `0 8px 24px rgba(23,33,43,0.08), 0 2px 6px rgba(23,33,43,0.06)` (drawer, sheet, toast).
- backdrop: `rgba(23,33,43,0.32)` behind the tablet drawer.

### Number of Levels
Two (flat, float).

### Usage Philosophy
Separation by 1px #DCE3EA borders; shadow only for floating panels.

---

## Motion

### Duration Scale
fast 120ms (hover colour, focus ring) · state 150ms (chip/border tweens, toast out, composer cross-fade) · hover 180ms (hover nudge) · default 200ms (panel/drawer slide, sidebar edge slide, toast in) · rise 260ms (rise-in) · count 400ms (summary number tween) · reveal 420ms (line reveal) · highlight 900ms (saved-status flash).

### Easing Functions
Line reveal `expo.out` · rise-in `power3.out` · hover nudge, count tween, sidebar edge `power2.out` · panel/drawer `power1.out` · colour hover linear.

### Motion Primitives
1. **Line reveal**: words in an `overflow:hidden` box (`padding-bottom:0.12em`); inner span `yPercent:100, opacity:0` → `0, 1`, 420ms `expo.out`, 60ms word stagger. Once per page load. Parent has `aria-label`, split spans `aria-hidden`.
2. **Rise-in**: `y:12, opacity:0` → `0, 1`, 260ms `power3.out`. IntersectionObserver, once per element; plays at once if already on screen. Delays by index per block.
3. **Hover nudge**: small transform on pointer enter, reversed on leave, 180ms `power2.out`. Only under `(hover: hover) and (pointer: fine)`. Transform/opacity only.
4. **Panel slide**: `x:24, opacity:0` → `0, 1`, 200ms `power1.out`.

### Stagger Caps
Summary cards 3 (60ms each, starting at 200ms) · table rows/mobile cards first 8, first load only (30ms) · panel sections 6 (40ms).

### Motion Philosophy
Motion is transform/opacity only, never delays a click, and never runs on filter, sort or search changes. Entrances run once per page load (or once per panel open). No autoplay. Every tween is created in an effect and reverted on unmount. Everything is off under `prefers-reduced-motion: reduce` (elements appear in their final state).
