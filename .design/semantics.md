# Semantics

---

## Color Semantics

### Brand Colors
accent `--color-accent` #0F6173: primary buttons, selected borders, active nav, focus ring. accent-hover `--color-accent-hover` #0B4C5B.

### Feedback Colors
success #166534 on #ECFDF3: Booked, Job completed, Accepted confirmations.
attention #92400E on #FFFBEB: Booking requested, Reply waiting, Needs time, No reply, Outcome needed, overdue follow-ups.
danger #B42318 on #FEF3F2: Opted out, failed sends. <!-- default -->
neutral #596779 on #F5F7FA: Open, Declined, Expired.

### Neutral Assignments
Backgrounds: page #F5F7FA | surface #FFFFFF | hover row #F5F7FA | selected #EAF4F6.
Borders: default #DCE3EA | selected/interactive #0F6173.
Text: primary #17212B | secondary #596779 | disabled #596779 at 50% opacity.

### Interactive Colors
Link #0F6173, underline on hover · focus ring 2px #0F6173 with 2px offset · selection #EAF4F6 plus 3px #0F6173 left edge.

### Cross-Mode Mapping
Not applicable (light only).

---

## Typography Semantics

### Heading Levels
h1 28px/650 #17212B (page) · h2 18px/600 (panel, section) · h3 14px/600 (panel subsections). No h4–h6.

### Body Variants
Default 14px/400/1.5 #17212B · small 12px/400 #596779.

### UI Text
Labels 14px/500 · helper and metadata 12px #596779 · money and counts `tabular-nums`.

### Code Usage
Not used.

---

## Spacing Semantics

### Component Internal Padding
Buttons 0 16px (min-height 44px) · inputs 0 12px · cards 16px · table cells 16px horizontal · panel sections 24px.

### Component External Margins
Components do not own margins; parents set gaps.

### Section Spacing
24px between header, summaries and list.

### Layout Gaps
8px inline, 16px between cards.

---

## Elevation Semantics

### Level Meanings
flat = in-page content · float = drawer, sheet, toast above content.

### Component-to-Elevation Mapping
Summary cards, list container, desktop side panel: flat (border). Tablet drawer, mobile sheet, toast: float.
