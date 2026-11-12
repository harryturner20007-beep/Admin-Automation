# Build plan — Quote Follow-up (independent UK garages)

Stack: Next.js 16 (App Router) + TypeScript, Supabase Auth + Postgres (RLS),
Twilio Programmable Messaging, a cloud scheduler calling a protected worker route.
No Airtable or Make.

## Design principle
All follow-up rules live in `src/domain/` as pure TypeScript that takes **state + clock + SMS provider**.
- Phase 1 runs it against an in-browser synthetic store, so the demo is static and needs no accounts.
- Phase 2 swaps the store for Postgres. The gate checks stay the same, and the DB backs them up with
  constraints, RLS and atomic claims.
- Phase 3 swaps `MockSmsProvider` for `TwilioSmsProvider` behind the same `SmsProvider` interface.

## Phase 1 — Clickable sales demo (this session)
- Domain: London business-day scheduler (+2 / +5 business days, garage hours, window expiry),
  pre-send gate, opt-out detection before classification, rule-based reply classifier,
  ambiguous-match handling, idempotent draft keys `garage:quote:revision:step`, ambiguous-timeout → reconciliation.
- Mock SMS provider with modes: accept / reject / timeout.
- UI: Quotes, Replies, Results screens. Demo clock, "Run follow-up check", staff approve-and-send,
  simulate reply, garage pause, staff-marked booking confirmation, a "synthetic data" banner.
- Five seeded cases (see `src/demo/seed.ts`).
- Vitest tests for the domain rules (in-memory versions of the acceptance tests).

## Phase 2 — Staff pilot
- Supabase project and SQL migrations: `garages, garage_members, quotes, messages, suppressions, staff_tasks`
  (plus `templates`, `audit_events`, `inbound_events`).
- Supabase Auth logins. RLS on every table via `garage_members`, so two garages cannot read or mutate
  each other's rows. pgTAP or SQL tests run as two different users.
- CSV import with preview, field mapping and row-level errors. Upsert on `(garage_id, source_quote_id)`.
  Never touch messages, suppressions or replies.
- Manual status update ("still open" / booked / declined) to refresh `status_confirmed_at`.
- Worker route `POST /api/worker/run`, protected by a bearer secret and invoked by a cloud scheduler
  (e.g. Supabase Cron or Vercel Cron; to be chosen at deploy time).
- Bank holidays: load from gov.uk `bank-holidays.json` into a table. Phase 1 uses a hard-coded 2026–27 list.

## Phase 3 — Live SMS and deployment
- `TwilioSmsProvider` (official `twilio` Node SDK). One reply-capable number per garage.
- Inbound and status webhooks: `twilio.validateRequest` signature check, dedupe on MessageSid + status.
- Unique `(garage_id, quote_id, revision, step)`. Claim with `UPDATE … WHERE status='approved' RETURNING`.
  On an ambiguous provider result, set `needs_reconciliation` before any retry.
- Heartbeat table and alerting when the worker or webhook intake goes quiet.
- Deploy steps, `.env.example`, rollback runbook. `LIVE_SMS_ENABLED=false` by default.

## Phase 4 — Reporting and optional AI
- Results from SQL views. Bookings are reported as *observed outcomes after a follow-up*, not attributed.
- Optional Claude classifier behind a flag: redacted text in, JSON-schema-validated label out, no tools.
  Any failure falls back to the staff inbox.

## Still needs a real account or live verification (owner: you)
Supabase project and keys, Twilio account and per-garage numbers, UK sender/A2P-style registration if
required, live webhook URLs, scheduler setup, Anthropic key, and garage sign-off on templates and
eligibility evidence.
