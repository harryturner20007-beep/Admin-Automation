# Workflow components (quote → job → invoice)

Shared by Quotes, Jobs and Invoices so the three screens read as one process. Code: `src/components/workflow.tsx`,
`SidePanel.tsx`, `JobsView.tsx`, `InvoicesView.tsx`, `BookJobForm.tsx`.

## Progress strip
- Steps: **Quote → Job booked → Job completed → Invoice issued → Paid**.
- Done step: 16px accent dot with white check, label 12px/500 ink; not done: 1px `line` ring, label muted.
- 12px connector lines between steps, accent when the step is done.
- Each step that has a record **links to it** (quote panel, job panel, invoice panel), except the record you are on
  (`aria-current="step"`). Screen readers hear "(done)" / "(not yet)".
- Placed under the amount and status in every record panel.

## Record panel (`SidePanel`)
- Same shape as the quote detail panel: ≥1200px in-flow 420px aside (list stays usable); 768–1199 modal drawer
  with backdrop; <768 full-screen sheet with a sticky action bar.
- Sticky header: plate label, "Customer · record number", Close. Body scrolls; footer holds **one** primary action.
- After an action that replaces the footer's primary button, the footer shows a confirmation (with Done) rather than
  another action, so a double-click can never trigger a second, different action.
- Open record and list filters live in the URL (`?job=`, `?invoice=`, `?tab=`, `?filter=`, `?q=`).

## Jobs list
- Tabs: Today (default; includes booked jobs left from earlier days), Upcoming, In progress, Completed, Cancelled,
  each with a tabular count. Search: customer, registration, job number.
- Desktop table, ~80px rows: Customer & vehicle (plate first) | Work (2-line clamp + job no.) | Booked | Status | Action.
- Phone: cards with plate + status, customer, work, time, then a full-width action.
- One next action per row: Start job → Complete & create invoice → Review invoice → View job.

## Charges editor
- One bordered row per line: type (Labour/Part/Other), description (textarea, grows), qty (2 dp), unit price (£, ex
  VAT when registered), amount (right, tabular), remove (disabled on the last line).
- Then discount (£) and VAT (20 / 5 / none), then the totals table (Subtotal, Discount, VAT, **Total**; tabular,
  right-aligned). Totals appear only once every line is valid.
- The parent owns the draft, so typed values survive a failed save.
- Changes from the accepted quote appear in a bordered box: "£18.00 more than the accepted £285.00" (attention
  colour when higher), then added / removed / changed lines. Higher totals open an "Additional work" fieldset
  (reason + how the customer authorised it), both required.

## Invoice states
| State | Label tone | Row action |
|---|---|---|
| Draft | neutral | Review & issue |
| Unpaid | neutral | Approve text / Record payment |
| Overdue | attention | Record payment |
| Call customer | attention | Record payment |
| Paid | success | View |
| Cancelled | neutral (hidden from the default list) | View |

Issue button: "Issue invoice · £total", disabled with a bulleted list of what's missing (unsaved edits first).

## Auth card
- Centred 384px white card on canvas, 12px radius, h1 28/650, one primary full-width button.
- Errors in a danger-tint box (`role="alert"`), confirmations in a success-tint box (`role="status"`).
- Messages never reveal whether an email has an account.
