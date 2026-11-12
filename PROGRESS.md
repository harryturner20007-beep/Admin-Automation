# Progress

_Read this first in a new session. Then read PLAN.md and README.md._

## Status: Phase 1 done (2026-11-11), Phase 2 not started
Branch `phase-1-demo`. Next.js 16.4.6 · React 19.3 · Tailwind 4 · Vitest 5.1. Node 24.
Next 16 has breaking changes from older versions: check `node_modules/next/dist/docs/` before writing Next code (see AGENTS.md).

### Done in Phase 1
- Domain rules in `src/domain/` (no framework or IO):
  - `schedule.ts`: steps at +2 and +5 business days in Europe/London, inside garage hours; closed days roll forward.
  - `gate.ts`: `checkSendGate`, which runs at draft time and again immediately before the provider call.
  - `replies.ts`: opt-out detection before classification, then the rule-based labels. Every category goes to staff.
  - `engine.ts`: follow-up check, approve, `dispatchApproved` (synchronous claim before any await), inbound handling
    (dedupe → opt-out → pause all candidates → ambiguous → task), delivery callbacks, staff actions, reconciliation.
  - `reporting.ts`: Results metrics. Bookings are counted only when booked after the first sent follow-up.
- `src/sms/provider.ts`: `SmsProvider` interface. `MockSmsProvider` modes are accept, reject and timeout (timeout returns an ambiguous result).
- The demo seed replays the past week through the real engine, so its history follows the same rules.
- UI: Quotes, Replies and Results screens, plus a demo clock, garage pause, mock-provider mode and a "Synthetic demo" label (see the redesign notes below).
- Tests: 60 passing, 3 `todo` (they need Postgres).

### Verified on 2026-11-11
`npm test` (30 passed), `npm run lint`, `tsc --noEmit` and `next build` all clean. Clicked through in the browser:
check → draft, approve → sent/delivered, simulated reply → task, confirm booking, timeout → reconciliation task,
garage pause banner.
Phone width (375px) checked during the redesign: no horizontal scroll, and the panel goes full screen.

### UI redesign (2026-11-11, same branch)
- Quotes: compact table (stacked rows on narrow screens), filters Needs action / Scheduled / Closed / All, defaulting to Needs action.
  Each row has one primary action, chosen in `src/components/quoteRows.ts`. A side panel (`QuoteDetails.tsx`) shows the next action,
  message preview, status actions, a reply simulator and the timeline. Escape closes it and focus returns to the opening button.
- Rows staff act on stay visible until the filter changes. Results appear in the row or panel section, errors next to the button.
- `useAction` (in `src/demo/store.tsx`) ignores repeat clicks while a save is running. `ActionButton` shows "Saving…".
- Replies: inbox with quote context, unread dots (`StaffTask.readAt`) and a handoff box. "Booking requested, not confirmed" is shown separately from "Booking confirmed".
- Results: four headline tiles, a synthetic-data notice, and a two-step `ResetDemo`. Reset also clears filters, panels and other on-screen state (`epoch`).
- Table skeleton while loading, an error screen if the seed can't be built, and empty states per filter.
- The desktop header is a fixed 86px tall. `QuoteDetails`, `AddQuoteDrawer` (`lg:top-[86px]`) and `LoadingSkeleton` depend on that.

### Product redesign, quote intake and simulated automation (2026-11-11, same branch)
- Visual system: navy nav (`slate-950`), cool off-white workspace, blue = primary action, amber = attention,
  green = confirmed, red = failure or stopped sending. The roles are documented at the top of `src/components/ui.tsx`.
  Line icons are drawn in-house in `ui.tsx` (no icon package). Drawer and fade animations sit inside a
  `prefers-reduced-motion: no-preference` block in `globals.css`; the skeleton uses `motion-safe:animate-pulse`.
- Quotes: four metrics (open quote value, follow-ups due today, unread replies, bookings this calendar month in London time),
  "+ Add quote", filters Needs action / Upcoming / Closed / All, search by customer, reference or registration, and clickable rows.
  The panel and drawer overlay the table below 1536px and reserve space beside it at 2xl.
- Intake (`src/domain/intake.ts` + `AddQuoteDrawer.tsx`):
  - UK mobile normalised to E.164; price stored as integer pence; sent time entered in UK time, stored as UTC.
  - `Q-1001`-style reference generated when left blank. Duplicate references are rejected case-insensitively, with a link to the existing quote.
  - SMS consent is off by default and needs an evidence reference when switched on.
  - The form stays mounted, so input survives closing it or a failed save. Focus goes to the first invalid field.
- Automation: `Garage.autoDraft` and `lastCheckAt`. `runFollowUpCheck(state, onlyGarageIds?)`.
  `advanceDemoClock` stands in for the scheduler in demo mode: every demo-clock move runs the check for garages with drafting on.
  It's labelled "Simulated automation" in the UI. Drafts still need staff approval.
- Quote detail panel: "Send checks" lists every safeguard as pass or fail, with an inline "Confirm still open" when the status is stale.
- Storage key bumped to `quote-followup-demo-v3`.

### Known limitations (deliberate for Phase 1)
- State lives in the browser (localStorage), with a single demo garage. There is no auth.
- Uniqueness and the atomic claim are simulated in memory. The real guarantees come from Postgres in Phase 2/3.
- Bank holidays are hard-coded for 2026–27 (`src/domain/time.ts`).
- `CANCEL` and `END` count as opt-outs, matching common carrier keywords. Confirm with the garage that this is acceptable.

### Workshop-console redesign of Quotes (2026-11-12, same branch). Replies and Results not yet restyled
- Identity: Archivo only (variable width: 125% headline, 100% UI, 72% plates). Tokens are in `globals.css` `@theme`:
  graphite, graphite-2, steel, steel-line, work, ink, and `signal` (#1f6bff, the only accent).
- The memorable detail is `Plate` in `ui.tsx`: the registration as a UK front plate, whose blue band is the signal accent.
  It leads every queue row (a dashed "No reg" placeholder keeps alignment), sits in the drawer header and previews live in the form.
- Quotes: a full-bleed graphite headline ("£X open across N quotes") with a "Today" line of live links (due → Due today filter,
  unread → Replies), an automation readout (switch, a dashed "Simulated" tag, last run, drafts awaiting approval),
  then the queue as rows. Urgent rows get a signal edge and a filled action; routine rows are compact.
- `Toast.tsx` plus `notice` in the store are the single confirmation channel (saved, drafted, booking confirmed), and rows
  named in a notice flash (`.row-flash`; reduced motion is respected). Dashed outline = simulated, everywhere.
- The detail drawer focuses the first useful control (`primaryFocus` on `ActionButton`) and returns focus to the row on close.
- `export const instant = false` on each page: the client-only demo has nothing to prerender. Remove it in Phase 2.
- `screenshots/` holds the review captures.

### Follow-up settings, automatic sending, Replies and Results redesign (2026-11-12)
- `Garage.mode` is `off`, `draft` or `automatic`. `Garage.followUps` sets business days and a UK send time per step;
  step 2 can be switched off. Times are kept inside opening hours (`schedule.ts`), and a quote shows its exact next send time.
- Templates use `{{first_name}} {{garage_name}} {{job_description}} {{vehicle}} {{quote_ref}} {{quoted_price}}`
  (`templates.ts`). Rendering is deterministic. With no vehicle, the "on your {{vehicle}}" phrase is dropped.
  Any unfilled field blocks drafting, and the gate also blocks sending any `{{…}}`.
- `Quote.customerJobDescription` is optional customer-facing wording used instead of workshop shorthand.
  It can be set in the add-quote form or the quote drawer.
- `settings.ts`: `validateSettings`, `previewScheduleChanges` (shown before saving) and `applyFollowUpSettings`.
  Applying moves and re-renders unsent drafts only. Sent steps keep their unique send key, so nothing replays.
- `automation.ts`: `runScheduledCheck` is the worker body (check, then dispatch approved). `advanceDemoClock` runs it every
  15 minutes of demo time, so Automatic sends at the exact set time. Labelled "Simulated sending" in the UI.
- `/settings` page (graphite band, mode chooser, two follow-up cards with clickable fields, live SMS preview against a sample
  or a real quote, and the list of moves before save). Replies is a two-pane inbox with a mobile drill-down; Results has period
  tabs and one readout strip. A trend chart was not added because the demo data spans only a few days.
- Default first message is 178 characters, which is 2 SMS parts.
- Storage key is `quote-followup-demo-v5`.

## Still required for live, unattended follow-ups
Nothing sends while the dashboard is closed: there is no server, database, scheduler or real SMS provider yet. In order:
1. **Database (Phase 2):** Supabase Postgres tables and migrations for garages, quotes, messages, suppressions, staff tasks
   and templates. Include the unique `(garage_id, quote_id, revision, step)` constraint and RLS per garage.
2. **Worker:** `POST /api/worker/run` behind a bearer secret, running `runScheduledCheck` per garage inside a transaction.
   Claim each send with `UPDATE … SET status='sending' WHERE status='approved' RETURNING`.
3. **Scheduler:** a cloud cron (Supabase Cron or Vercel Cron) calling the worker every 15 minutes, plus a heartbeat and
   an alert if it goes quiet.
4. **SMS:** `TwilioSmsProvider` behind the existing interface, inbound and status webhooks with signature checks, and
   `LIVE_SMS_ENABLED=false` until the garage signs off on templates, eligibility and handoff.
5. **Accounts and secrets (you):** Supabase project, scheduler, a Twilio account and UK number with its regulatory
   bundle, and the webhook URLs.
6. **Freshness:** the 24-hour status-freshness rule will hold back most Automatic sends unless staff confirm quotes daily
   or the garage system feeds status. Decide the window with the garage.

## Next: Phase 2 (staff pilot)
1. Add the Supabase client and SQL migrations under `supabase/migrations/` for garages, garage_members, quotes,
   messages, suppressions, staff_tasks (+ templates, audit_events, provider_events).
   Constraints: `unique(garage_id, source_quote_id)` on quotes; `unique(garage_id, quote_id, revision, step)` on outbound messages.
2. RLS on every table via `garage_members`. Write SQL tests that run as two users from different garages and
   prove they can neither read nor write the other garage's rows.
3. Add a Postgres-backed store implementing the same operations as `engine.ts`. Keep the engine pure: load rows,
   run the rule, write back in a transaction. The claim is `UPDATE … SET status='sending' WHERE id=$1 AND status='approved' RETURNING`.
4. CSV import: preview, field mapping, row-level errors. Upsert by (garage, source_quote_id) and never touch messages,
   suppressions or replies. Turn the `todo` tests in `tests/engine.test.ts` into real ones.
5. Worker route `POST /api/worker/run` with a bearer secret, invoked by a cloud scheduler.
6. Garage login, and a per-quote manual status update (the UI already exists).

Before using any Supabase, Twilio or Anthropic SDK feature, check the current official docs.

## Needs you (not doable by Claude)
Supabase project and keys, Twilio account and numbers, scheduler, Anthropic key, any sender registration,
garage approval of templates, eligibility process and staff handoff, and live activation.
