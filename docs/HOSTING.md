# Hosting and handover

How to run Garage desk for real garages: one website, a private workspace per garage.
Stack: Next.js 16 on **Vercel**, **Supabase** (Auth, Postgres, private Storage), Vercel Cron for reminders.

Without Supabase settings the same code runs as the browser-only sales demo with sample data.

## 1. Accounts you need (and costs, checked November 2026; confirm on each pricing page)

| Service | What for | Plan | Cost |
|---|---|---|---|
| Supabase | Sign-in, database, PDF/logo storage | Free to try; **Pro** for real customers (daily backups, no pausing, 7-day backups, custom SMTP limits) | Free / about $25 a month |
| Vercel | Hosting, HTTPS, scheduled reminders | Hobby is for non-commercial use, so use **Pro** for a paid service | about $20 per member a month |
| Email sender (SMTP) | Invitation and password-reset emails | Supabase's built-in sender is for testing only (a few emails an hour). Use Resend, Postmark, SES or similar | Free tier to about $15 a month |
| Domain | e.g. `app.yourbusiness.co.uk` | Any registrar | about £10 to £20 a year |
| SMS provider (later) | Sending the texts | Not connected. Texts queue and the app says so | per message |

Nothing here was created for you: sign up, add payment details and keep the keys yourself.

## 2. Create the Supabase project

1. New project, region **London (eu-west-2)**. Keep the database password in your password manager.
2. **Database → SQL editor**: run `supabase/migrations/20261112000000_garage_workspaces.sql`, or with the CLI:
   `supabase link --project-ref <ref>` then `supabase db push`. This creates the tables, row-level security,
   the save function and the private `garage-files` bucket.
3. **Project Settings → API**: copy the URL, the `anon` key and the `service_role` key (server only).

### Auth settings (Authentication → …)

- **Sign In / Providers → Email**: enabled. Turn **off** "Allow new users to sign up". Accounts only come from
  invitations, made by the platform admin or a garage owner.
- **URL Configuration**: Site URL `https://<your domain>`. Redirect URLs: `https://<your domain>/auth/confirm`
  (plus `http://localhost:3000/auth/confirm` for development and your Vercel preview URL if you use one).
- **Emails → SMTP settings**: add your email provider. Without this, invitations and resets will hit the
  built-in sender's limit.
- **Emails → Templates**: point the links at the app, so the server can swap the token for a session:
  - Invite user: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/reset-password">Accept the invitation</a>`
  - Reset password: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Set a new password</a>`
- **Emails / Providers → Email OTP expiry**: 86400 seconds (24 hours) means invitation links expire after a day.
  Reset emails use the same setting; 3600 (1 hour) is safer if you can live with shorter invitations. The
  sign-in page's reset message says 1 hour, so change that text if you choose otherwise.
- **Passwords**: minimum length 10. Turn on leaked-password protection (Pro).
- **Rate limits**: keep the defaults or lower them (sign-ins and emails per hour per IP). Optionally add
  **Attack Protection → CAPTCHA** (hCaptcha or Turnstile). It then needs a widget on the sign-in form, which isn't built yet.
- **Sessions** (Pro): **Time-box user sessions** (for example 30 days) and **Inactivity timeout** (for example 7 days).
  Refresh-token rotation is on by default.

### How "Keep me signed in on this device" works

- **Ticked**: Supabase's session cookies are stored by the browser (up to 400 days) and refreshed as the app is
  used. The session ends at the time-box or inactivity limit above, at sign-out, or when revoked.
- **Unticked**: the same cookies are written without an expiry, so the browser drops them when it closes.
  (Some browsers restore session cookies with "continue where you left off"; that's the browser's choice.)
- **Sign out** ends this device's session. "Sign out everywhere" (`signOut` with `everywhere=on`; not yet in the
  UI) revokes every refresh token. To revoke one person, delete them, or sign them out from
  **Authentication → Users**. Access tokens are short-lived (1 hour by default), and every page and action checks the session.
- Expired session: the next page load goes to the sign-in page with "Your session ended". Changes still saving
  in the open tab show "You've been signed out. Sign in again" and stay on screen until you do (don't close the tab).

## 3. Deploy on Vercel

1. Import the repository. Framework: Next.js. HTTPS is automatic.
2. **Environment variables** (Production, and separately Preview/Development with a separate Supabase project
   if you can): see `.env.example`. `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` must **not** have the
   `NEXT_PUBLIC_` prefix.
3. **Domains**: add your domain and follow the DNS instructions. Then update `NEXT_PUBLIC_SITE_URL` and the
   Supabase Site URL and redirect URL to match.
4. **Cron**: `vercel.json` runs `/api/cron/reminders` every 10 minutes (Vercel Pro; Hobby only allows daily).
   Vercel sends `CRON_SECRET` as a bearer token; the route refuses anything else. It runs while every browser is
   closed and is safe to repeat or overlap. shortcut: garages are processed one after another in one run; split
   into batches if a run nears the function time limit (roughly 100+ garages).

## 4. Make yourself platform admin, onboard the first garage

1. Invite yourself: **Supabase → Authentication → Users → Invite user**, accept the email and set a password.
2. In the SQL editor: `insert into public.platform_admins (user_id) select id from auth.users where email = 'you@…';`
3. Sign in and go to `/admin`. Enter the garage's name and the owner's email. They get an invitation.
4. Then follow `docs/ONBOARDING.md` with the owner.

## 5. Security model (what protects what)

- **Isolation**: each garage's records are one row in `workspaces`; members read only their garage's rows
  through row-level security. Browsers can't write any table. Every write goes through the app server, which
  takes the garage from the signed-in user's membership (never from the request), checks the change
  (`checkTransition`: history append-only, issued invoices frozen, invoices only issued on the server, one job
  per quote, one invoice per job, owner-only business details) and calls `save_workspace`. That function
  re-checks membership in the database and refuses stale versions.
- **Invoices**: numbers, totals and the frozen copy are made on the server at issue, stored in
  `issued_invoices` (unique number per garage; a trigger refuses any change except the PDF path).
- **Files**: PDFs and logos live in the private `garage-files` bucket under `<garage id>/…`. Downloads go
  through `/api/invoices/<id>/pdf`, which reads the invoice with the user's session (RLS).
- **Caching**: every response carries `Cache-Control: private, no-store`.
- **Secrets**: only in Vercel/Supabase settings. Logs hold error messages and ids, never records or tokens.

## 6. Backups and restore

- Supabase Pro takes **daily backups** (kept 7 days; Point-in-Time Recovery is an add-on).
  Restore from **Database → Backups**. A restore replaces the whole database, so restore into a new project
  first if you only need one garage's data.
- Your own extra copy (recommended weekly):
  `pg_dump "$SUPABASE_DB_URL" --schema=public --data-only -Fc -f garage-desk-$(date +%F).dump`
  (connection string from Project Settings → Database). Restore with `pg_restore --data-only -d <url> <file>`
  into a database that has the migration applied.
- One garage only: `select doc from workspaces where garage_id = '<id>'` is the whole workspace as JSON.
  The issued invoices are in `issued_invoices`.
- Storage files (PDFs can be regenerated from `issued_invoices`; logos can't): download the bucket with the
  Supabase CLI or dashboard.

## 7. Errors and monitoring

`src/instrumentation.ts` logs server errors as one JSON line (message, route, digest; no customer data).
See them in Vercel → Logs. Add a log drain (Sentry, Better Stack) for alerts. The cron route returns a summary
(`garages`, `changed`, `skipped`, `failed`) visible in Vercel → Cron Jobs.

## 8. Known limits

- Whole-workspace saves: fine up to a few MB per garage (years for a small garage). Move to per-record
  tables beyond about 5 MB (marked `shortcut:` in the migration).
- UK only: GBP, Europe/London and England and Wales bank holidays.
- Texts go through Twilio once it's set up: see [SMS.md](SMS.md). Until then due texts wait in the queue.
- No card payment link on invoices; payments are recorded by hand.
- The browser demo data (localStorage) is sample data only. There's nothing to import into a real garage.
