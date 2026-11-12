# Onboarding a garage, and the daily workflow

## First garage: about 15 minutes with the owner

1. **You (platform admin)**: sign in, open `/admin`, enter the garage's name and the owner's email, then
   **Create garage and invite owner**.
2. **Owner**: opens the invitation email within 24 hours, sets a password (10+ characters) and lands on
   **Overview**. Tick **Keep me signed in on this device** on their own computer only.
3. **Owner → Settings → Business details**: trading and legal name, address, phone, email, company number
   (limited companies), VAT number and rate (or "Not VAT registered"), payment terms, invoice prefix, payment
   instructions (bank details) and logo. Invoices can't be issued until the name and address are in, and the
   VAT number if VAT is charged.
   *Check with the garage's accountant that these match what they register with HMRC and Companies House.*
4. **Owner → Settings → Team**: invite each colleague by email. Everyone gets their own sign-in.
5. **Settings → Follow-up settings**: quote follow-ups and invoice texts start **Off** for a new garage. Leave
   them off until text sending is connected; staff can still chase from their own phone (the quote panel opens
   the phone's messages app with the text ready).

## The workflow: quote → job → invoice → payment

| Step | Where | What to do |
|---|---|---|
| Quote | **Quotes → + Add quote** | Customer, mobile, vehicle, work, price. Open the quote's **Billing details** to add the email and billing address (needed for the invoice). |
| Chase | **Quotes** (or Overview: "Quotes to follow up") | Record outcomes (Needs time, No reply, Declined) and reminders. |
| Book | Quote panel → **Book job** | Pick the date and time, add notes, tick that the customer accepted. Opens the new job; quote chasing stops. |
| Reschedule / cancel | Job panel → **Change booking** | Each change is recorded with its reason. |
| Start | **Jobs → Today → Start job** | When the car is in. |
| Complete | Job → **Complete & create invoice** | Adjust parts and labour, quantities, discount and VAT. If the total went up, record why and how the customer agreed. Saving creates the invoice draft and opens it. |
| Issue | **Invoices → Drafts to issue → Review & issue** | Check the bill-to details and lines (or **Preview**), then **Issue invoice**. This numbers it (e.g. INV-0001), fixes its content and starts payment chasing. |
| Send | Invoice → **Download PDF** | Email or print it. Texted invoice and reminders follow the "Invoice texts" setting once texting is connected. |
| Paid | Invoice → **Mark paid** | Reminders stop. **Undo** is offered straight after. |
| Mistake on an issued invoice | Invoice → **Cancel and correct this invoice** | The old number stays on record as cancelled; a corrected draft opens to issue under a new number. |

Every record shows **Quote → Job booked → Job completed → Invoice issued → Paid**, and each step links to the
related quote, job or invoice.

## Good to know

- Changes save automatically; the top bar shows "Saving…" then "All changes saved". If two people change the
  same garage at once, both changes are kept. If one no longer applies (for example the invoice was already
  marked paid), the app says so.
- Quotes from before itemised invoices hold only a description and total. Their job and invoice start with one
  summary line, which you can split into parts and labour on completion.
- Prices on invoice lines exclude VAT when the garage is VAT registered. VAT is worked out on the invoice
  total and rounded down to the penny (HMRC VAT Notice 700, section 17.5).
