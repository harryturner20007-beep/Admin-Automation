# Text messages (SMS): setup and operation

Provider: **Twilio Programmable Messaging** (official `twilio` Node SDK). One sending number per garage.
Nothing in this repo creates accounts, buys numbers or moves numbers: each step below is yours.

## How it works

| Part | Where |
|---|---|
| "Send follow-up" / "Send invoice text" (staff-written) | quote and invoice panels → server action `sendText` (`src/server/sms.ts`) |
| Approve & send a drafted text | `approveAndSendText` |
| Automatic follow-ups and payment reminders | Vercel Cron → `/api/cron/reminders` every 10 minutes, browser closed |
| Delivery updates | Twilio → `POST /api/sms/status` |
| Customer replies, STOP / START | Twilio → `POST /api/sms/inbound` |
| Sender per garage | `sms_numbers` table, set by the platform admin at `/admin` |
| At-most-once sending | `sms_sends` table: the send key is the primary key; claim → Twilio → record answer |

Every send, manual or automatic, runs the same steps:
1. Check the signed-in member and their garage on the server.
2. Look up the garage's number in `sms_numbers`; nothing comes from the browser.
3. Check the customer is a UK mobile, hasn't opted out, consent is on record, and the quote is open or the invoice unpaid.
4. Check the time: 08:00–20:00 for texts sent by hand, opening hours for automatic ones.
5. Save the text, then claim its send key in `sms_sends`. A double-click, retry, second tab or overlapping worker gets the stored result instead of a second text.
6. Send it to Twilio and store the message SID.
7. Show the status: Pending → Queued → Sent → Delivered (only with the network's receipt), or Failed (with the reason), or Delivery unknown.

A text sent by hand takes the place of the next scheduled text, so the automatic one can't also go. The next
step then waits the usual gap after the manual text.

**Delivery unknown**: a timeout after Twilio may have accepted the text. It is never resent automatically.
**Check with Twilio** looks it up in Twilio's log; if it isn't there, staff record it as not sent and can send again.

**Invoice PDF by text**: issuing an invoice texts the customer a link to its PDF (`https://<your domain>/i/<token>`),
straight away when Invoice texts are Automatic and the garage is open (otherwise when it next opens, or after your
approval in Draft mode; nothing if Off). UK numbers can't receive attachments by SMS (MMS isn't available on UK
numbers), so the PDF travels as a link. The link opens that one invoice's PDF without a login; its token is 128 random
bits, can't be guessed, and is saved with the issued invoice (migration `20261115000000_invoice_links.sql`).
Anyone who has the link can open that invoice, so it is only ever texted to the customer's own number. The reminders
carry the same link. Every text, including this one, shows in **Chats** under the customer.

**Chats**: the tab lists customers who need a person first, then every customer's text history, newest first.

**Replies**: a reply is matched by the garage's receiving number and the customer's number. It shows in the
customer's history and on Chats (unread badge). Chasing pauses for that customer, quotes and unpaid invoices alike,
until staff click **Handled: resume chasing**. If more than one quote or invoice could be meant, the reply stays at
customer level and all of them are held. **STOP** (and similar words) opts the number out of every text; Twilio
blocks it too (error 21610). **START** / **UNSTOP** opts back in; the opt-out stays on record.

**Limits**: UK mobiles only, at most 4 SMS parts per text, `SMS_DAILY_LIMIT` parts per garage per rolling 24 hours
(default 300), 5 test texts a day, and the same text can't go to the same customer twice within 10 minutes.

## Your number: what can be used

I don't know which number you want to use yet. Here's how each kind works with Twilio for UK texts.
Confirm with Twilio's Console before buying or porting.

| Your number | Can it send and receive texts through Twilio? | What it takes |
|---|---|---|
| A new Twilio **UK mobile** number (+44 7…) | Yes, two-way | Buy it in Twilio. UK numbers need a Regulatory Bundle (business name, address, ID), which Twilio reviews. **Recommended.** |
| Your existing **mobile** (07…, on a SIM today) | Only by **porting** it to Twilio | Moves the number away from your SIM and network: calls and texts on that phone stop. **Needs your explicit approval; I haven't started anything.** Twilio checks whether the number is portable (Console → Phone Numbers → Port & Host). |
| Your existing **landline** (01…, 02…, 03…) | Generally no | UK geographic numbers are voice-only at Twilio, and many UK networks don't deliver texts to landlines. Porting it would move your calls too. |
| "Keep my number, move only the texts" (hosted SMS) | Not for UK numbers, as far as I found | Twilio documents Hosted SMS for US and Canadian numbers. |
| A name instead of a number (e.g. RIVERSIDE) | Sends only; customers can't reply | No registration needed for ordinary names in the UK. Replies are central here, so it isn't used. |

UK long codes need no sender registration like US 10DLC. Texts about a quote the customer asked for, or about
their invoice, are service messages; they still need the customer's agreement on record (the app requires it per quote),
and every template ends "Reply STOP to opt out". Check marketing-style wording with your adviser (PECR).

## Activation steps

1. **Twilio account**: sign up, verify, and **upgrade** (add billing). A trial account only texts verified numbers (error 21608).
2. **Geo permissions**: Messaging → Settings → Geo permissions → allow **United Kingdom** only. This blocks spending on other countries.
3. **Spending alert**: Console → Usage → Triggers, e.g. alert at £20 a day.
4. **Number**: Phone Numbers → Buy a number → United Kingdom → Mobile, SMS capability. Complete the Regulatory Bundle.
   (Or port your number, but only after you decide that, given it affects your phone service.)
5. **Credentials**: Console → Account info: Account SID and Auth Token. In Vercel → Settings → Environment Variables
   (Production; mark them Sensitive): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`. Also `NEXT_PUBLIC_SITE_URL` = your https
   address and `SMS_DAILY_LIMIT` if you want another limit. Never put these in code, URLs or chat.
6. **Database**: run `supabase/migrations/20261113000000_sms.sql` (`supabase db push`).
7. **Connect the number**: sign in as platform admin → `/admin` → the garage → "SMS number" → Connect. The app checks the
   number is in your Twilio account and SMS-capable, then sets its incoming-message webhook and fallback for you.
8. **Scheduler**: `vercel.json` runs `/api/cron/reminders` every 10 minutes (needs Vercel Pro) with `CRON_SECRET`.

### Webhook URLs (production)

| Twilio setting | URL | Method |
|---|---|---|
| Phone number → Messaging → "A message comes in" | `https://<your domain>/api/sms/inbound` | POST |
| Same number → "Primary handler fails" (fallback) | `https://<your domain>/api/sms/inbound` | POST |
| Delivery status callback | `https://<your domain>/api/sms/status`, sent with each message (nothing to set) | POST |

Both check Twilio's signature against `NEXT_PUBLIC_SITE_URL`, so that value must be exactly the address Twilio calls.

## Live test (with a handset you name)

1. Settings → Text messages → **Send test text** to your handset. Note the SID shown (SM…).
2. Add a quote with your handset's number, tick consent → open it → **Send follow-up**. Status: Queued → Sent → Delivered.
3. Reply "Yes please" from the handset: it appears in the quote's history and on Chats (unread).
4. Reply STOP: the next send is refused ("opted out"). Reply START to undo.
5. Set Quote follow-ups to Automatic, add a quote whose follow-up is due inside opening hours, close the browser, and
   wait up to 10 minutes: the text arrives from the garage number.
6. Book the quote, or mark its invoice paid: pending texts are cancelled.

## Development

Without Twilio credentials the hosted app shows **SMS setup required** and lists exactly what's missing; due texts wait.
`SMS_SIMULATE=1` (refused on the production deployment) uses a fake provider whose texts show "(simulated)".
The browser demo always uses the simulated provider and says so.
