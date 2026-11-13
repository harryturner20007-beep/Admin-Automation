# Design System

This project uses DESIGN DNA for design system enforcement.

<!-- dna:begin -->
## Design DNA Reference

> Revloop: a calm, light workspace for an independent UK garage's service desk to chase quotes and record customer decisions.

### Principles
1. The queue is the work 2. Say exactly what happens (real vs simulated vs external) 3. Quiet surfaces, clear state 4. Never lose the user's place 5. Readable numbers (tabular, right-aligned)

### Colors
Revloop brand. Accent (deep teal) #00766F (hover #005E58), selected #E6F3F2. Bright teal #00A99D: logo mark and small accents on navy only.
| Step | Hex | Role |
|---|---|---|
| navy | #0B1730 | headlines, main text, app sidebar, closing CTA |
| muted | #475569 | secondary text, icons (slate) |
| line | #DCE3EA | borders |
| canvas | #F5F7FA | page bg, hover row, plate fill |
| surface | #FFFFFF | cards, panels, tables, forms |

### Semantic Colors
Bg: page=#F5F7FA | surface=#FFFFFF | hover=#F5F7FA | selected=#E6F3F2 | sidebar=#0B1730
Borders: default=#DCE3EA | selected=#00766F
Text: primary=#0B1730 | secondary=#475569
Status: success=#166534/#ECFDF3 | attention=#92400E/#FFFBEB | danger=#B42318/#FEF3F2 | neutral=#475569/#F5F7FA
Focus: 2px #00766F ring, 2px offset (#00A99D on navy). Selected row: #E6F3F2 + 3px #00766F left edge.
Elevation: borders in-page; float shadow `0 8px 24px rgba(11,23,48,.08), 0 2px 6px rgba(11,23,48,.06)` only for drawer/sheet/toast.

### Typography
Inter, ui-sans-serif, system-ui, sans-serif. Weights 400 body | 500 labels/buttons | 600 emphasis/counts | 650 h1 only.
| Name | Size | Use |
|---|---|---|
| heading | 28px | page h1, 650 |
| title | 18px | panel/section h2 |
| count | 24px | summary counts |
| body | 14px | body, cells, controls |
| meta | 12px | metadata |
Money and counts: tabular-nums.

### Spacing
8px base: 4 (dense labels only) | 8 | 16 | 24 | 32 (workspace padding ≥768) | 16 page padding <768.

### Shape
Cards/containers/panels 12px | buttons/inputs/selects 8px, min-height 44px | status labels 6px | plate labels 4px.

### Motion
GSAP primitives: line reveal (yPercent 100→0+fade, 420ms expo.out, 60ms word stagger, once/load) | rise-in (y12→0+fade, 260ms power3.out, IO once) | hover nudge (180ms power2.out, hover:hover+pointer:fine only) | panel slide (x24→0+fade, 200ms power1.out). Count tween 400ms power2.out; chip/border 150ms; toast 200 in/150 out; sidebar edge 200ms. Staggers: cards 3×60ms from 200ms, rows first 8×30ms first load only, panel sections 6×40ms. Saved status: 900ms selected-tint row flash. Animate.css fadeIn once in "no follow-ups due". Transform/opacity only; never on filter/sort/search; revert on unmount. Reduced motion: none. No autoplay.

### Layout
≥1200: 208px sidebar + workspace (32px pad) + 420px side panel, list usable beside it. 768–1199: 64px icon rail, modal drawer with backdrop. <768: top nav, 16px pad, summary rows, search on own line, quote cards, full-screen sheet with sticky action bar.

### Components
**Button**: 44px min, 8px radius; primary accent bg/white → hover #0B4C5B | secondary white + #DCE3EA border | ghost muted | busy "Saving…" disabled.
**Summary card**: white, 12px, border; count 24/600, value 12 muted; aria-pressed; selected border accent + bg #EAF4F6.
**Quote table**: semantic table, ~80px rows, cols Customer & vehicle | Work (2-line clamp) | Quote value (right) | Status | Follow-up | Action ("Chase quote" eligible, "View quote" done).
**Plate label**: #F5F7FA bg, 1px border, 4px radius, 12px/600 uppercase, first in row.
**Status label**: tinted text label, 6px radius, 12px/500.
**Detail panel**: 420px, sticky header (plate, customer, Close), then amount+status, work+line items, contact, composer, history, outcome+reminder.
**Progress strip**: Quote → Job booked → Job completed → Invoice issued → Paid; done = accent dot+check; each step links to its record; in every record panel.
**Record panel**: SidePanel = detail-panel shape; one primary footer action; after it fires show a confirmation, never another action in the same spot; record + filters in URL.
**Jobs list**: tabs Today|Upcoming|In progress|Completed|Cancelled; cols Customer & vehicle | Work | Booked | Status | Action (Start job → Complete & create invoice → Review invoice → View job).
**Charges editor**: rows type|description|qty|unit (ex VAT)|amount|remove; discount, VAT 20/5/0; totals right/tabular; diff vs accepted; extra work needs reason + authorisation.

### Patterns
Outcomes Accepted | Needs time | No reply | Declined; reminders Tomorrow | In 3 days | Choose date with date shown; inline confirmation + Undo + Next quote. Three empty states: no quotes | no matches | none due.

### Forbidden
No gradients except the app backdrop glows and chart area fill | Cards: white, 16px radius, --shadow-card only (frosted window look) | No second accent colour | No new icon/component library | No autoplay animation | No proportional digits in money | No "Send" label for actions that don't send in-app

### Tech Stack
Next.js 16 App Router, Tailwind v4 `@theme` tokens, GSAP, Animate.css, Three.js (on demand).

### Deep Reference
Full component CSS/states: .design/components/*.md
Full pattern specs: .design/patterns/*.md
Detailed principles + examples: .design/principles.md
Detailed behaviors + states: .design/behaviors.md
Product context and mental model: .design/DNA.md
<!-- dna:end -->

Run `/dna:check` after making UI changes to verify compliance.
