# Quote list (summary cards, toolbar, table, mobile cards)

## Summary cards
Three equal cards: Needs follow-up, Awaiting reply, Accepted. White, 1px #DCE3EA, radius 12px, padding 16px, `aria-pressed`. Label 14px/500, count 24px/600 tabular, total value 12px #596779 tabular. Hover bg #F5F7FA. Selected: border #0F6173, bg #EAF4F6. "All quotes" clears the selection. Below 768px: full-width compact rows.

## Toolbar
Inside the white list container: search ("Search customer, registration or work"), status filter select, sort select. 44px controls. Search takes its own line below 768px.

## Table
Semantic `<table>` in a container with its own horizontal scroll. Columns: Customer & vehicle | Work | Quote value | Status | Follow-up | Action.
- Rows about 80px, 16px cell padding, 1px #DCE3EA rules.
- Customer & vehicle: plate label, then name (14px/500), then make/model (12px muted).
- Work: up to two lines (line clamp); full text in the detail panel.
- Quote value: right-aligned, tabular.
- Follow-up: explicit text: "Today", "2 days overdue", "18 Nov", "Outcome needed", "—".
- Action: "Chase quote" (primary) when eligible for follow-up; "View quote" (secondary) for completed outcomes.
- Hover: bg #F5F7FA. Selected: bg #EAF4F6 + 3px #0F6173 inset left edge.
- Default sort: overdue, then due today, then most recently updated.

## Mobile cards (< 768px)
Line 1: plate + price. Then customer and work. Then status + follow-up timing. Full-width primary action.
