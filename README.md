# Garage desk

Quotes, jobs, invoices and payment chasing for independent UK garages, as one connected workflow:
**quote → booked job → completed job → invoice → payment / chasing**.

- **Hosted** (with Supabase configured): one website, a private workspace per garage, invitation-only sign-in.
  Setup, accounts, costs, security model and backups: [docs/HOSTING.md](docs/HOSTING.md).
  Onboarding a garage and the daily workflow: [docs/ONBOARDING.md](docs/ONBOARDING.md).
- **Demo** (no settings): the same screens in the browser over synthetic sample data, for sales demos.

Checks: `npm test` (domain, workflow, save queue, PDF, and the database migration with row-level security on
an in-process Postgres), `npm run lint`, `npm run typecheck`, `npm run build`.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. It redirects to the Quotes screen.

Other commands: `npm test` (Vitest), `npm run lint`, `npm run typecheck`, `npm run build`.

Demo state lives in the browser's localStorage. **Reset demo** (header, or the Results page) asks once,
then puts everything back to the same starting point. A test checks the seed is identical every time.

## Walkthrough (about five minutes)

The demo clock starts at **Wed 11 Nov 2026, 10:00** (London). **Automatic drafting** is on in simulated mode:
each time the demo clock moves, the follow-up check runs, just as the scheduler would in production.

1. **+ Add quote**: sample name, an `07700 900xxx` number, a job and **340**. Tick SMS consent and give an evidence
   reference. The quote appears straight away with its next check ("Follow-up 1 on Fri 13 Nov").
2. Reload. The quote is still there (saved in this browser).
3. **+1 day** twice, to Fri 13 Nov. The automation drafts exactly one follow-up. **Run check now** doesn't add another.
4. **Review & send** → **Confirm still open** (its status is 48 hours old) → **Approve & send**. Then in the panel,
   **Simulate a customer reply → Wants to book → Receive reply**. Follow-up 2 is now on hold and the request is on **Replies**.
5. **Confirm booking**. Open quote value drops, and Bookings this month goes up.
6. **+ Add quote** with SMS consent left off. "Follow-ups off: no SMS consent recorded", and no draft is ever created.

**Reset demo** (header or Results) asks once, then puts everything back.

## Layout

```
src/domain/     pure rules: London business days, scheduling, pre-send gate, reply rules, engine, intake, reporting
src/sms/        SmsProvider interface + MockSmsProvider (Twilio adapter comes in Phase 3)
src/demo/       synthetic seed (replayed through the real engine) + in-browser store
src/components/ Shell, Quotes (metrics, automation bar, table, AddQuoteDrawer, QuoteDetails), Replies, Results; ui.tsx holds colour roles + icons
tests/          Vitest tests for the rules and the acceptance scenarios that can run in memory
```

See `PLAN.md` for all four phases and `PROGRESS.md` for where things stand.
