import Link from "next/link";
import { HeroPreview } from "@/components/landing/HeroPreview";
import { SiteFooter, SiteHeader, focusOnNavy, outline, primary } from "@/components/landing/Site";
import { FIRST_MONTH, FIRST_MONTH_DISCOUNT_PERCENT, PRICE, START_URL } from "@/lib/pricing";
import { Icon, PlateLabel, StatusLabel, type IconName } from "@/components/ui";

export const metadata = { title: "Revloop: quotes, jobs and invoices for independent garages" };


const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: "message", title: "Automatic follow-ups", text: "Two polite texts go out after each quote, inside your opening hours." },
  { icon: "alert", title: "Staff needed list", text: "Quotes with no reply after both follow-ups move to one list, each with the reason." },
  { icon: "calendar", title: "Bookings by text", text: "Offer dates, confirm the customer's pick, and a confirmation text goes out." },
  { icon: "doc", title: "Invoices and PDFs", text: "Completing a job creates the invoice. Issuing it texts the customer a PDF link." },
  { icon: "pound", title: "Payment reminders", text: "Unpaid invoices are chased for you until they're marked paid." },
  { icon: "check", title: "Your data stays yours", text: "Each garage has its own private workspace, and STOP replies are always respected." },
];

const STEPS = [
  { title: "Add the quote", text: "Enter the customer, vehicle and work once." },
  { title: "Follow-ups go out", text: "Two texts, spaced out, inside opening hours." },
  { title: "Book the job", text: "The customer picks a time; you confirm it." },
  { title: "Invoice and get paid", text: "Complete the job, issue the invoice, reminders chase late payers." },
];

function Tick({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <li className="flex gap-4">
      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-selected text-accent"><Icon name={icon} className="h-5 w-5" /></span>
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-base text-muted">{text}</p>
      </div>
    </li>
  );
}

/** Public front door. Two ways in: the garage login (or demo) and the admin login. */
export default function Home() {
  return (
    <div className="min-h-screen bg-white font-sans text-text">
      <SiteHeader />

      <main id="main">
        <section className="mx-auto max-w-6xl px-4 pt-16 text-center md:px-8 md:pt-24">
          <h1 className="mx-auto max-w-4xl text-[40px] leading-[1.05] font-extrabold tracking-tight text-navy md:text-[72px]">Turn more repair quotes into booked jobs</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
            Revloop follows up your quotes by text, tells you when a customer replies, books the work in and invoices it. Built for independent UK garages.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/demo" prefetch={false} className={primary}>Try the live demo</Link>
            <Link href="/login" className={outline}>Login</Link>
          </div>
          <p className="mt-4 text-sm text-muted">Free, no account needed. Sample data only.</p>
          <dl className="mx-auto mt-12 grid max-w-3xl gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
            {[
              [`${PRICE}`, "a month, everything included"],
              ["£0", "setup fee"],
              [`${FIRST_MONTH_DISCOUNT_PERCENT}% off`, `your first month (${FIRST_MONTH})`],
            ].map(([v, l]) => (
              <div key={l} className="bg-white px-4 py-5">
                <dt className="text-2xl font-extrabold tracking-tight text-navy tabular-nums">{v}</dt>
                <dd className="mt-1 text-sm text-muted">{l}</dd>
              </div>
            ))}
          </dl>

          <div className="relative mx-auto mt-16 max-w-4xl pb-16 text-left md:mt-20">
            <HeroPreview />
            <div aria-hidden className="absolute -top-5 left-1/4 hidden items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium lg:flex">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-success-bg text-success"><Icon name="check" className="h-3.5 w-3.5" /></span>
              Follow-up delivered
            </div>
            <div aria-hidden className="absolute -right-8 bottom-24 hidden items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium lg:flex">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-selected text-accent"><Icon name="calendar" className="h-3.5 w-3.5" /></span>
              Job booked: Thu 09:00
            </div>
          </div>
        </section>

        <section aria-label="The workflow" className="bg-navy text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 py-12 md:grid-cols-[1fr_2fr] md:px-8">
            <p className="text-2xl font-bold tracking-tight">One place for the whole job, from quote to paid</p>
            <ol className="flex flex-wrap items-center gap-x-4 gap-y-3 text-lg font-semibold md:justify-end">
              {["Quote", "Follow-ups", "Booked", "Invoiced", "Paid"].map((s, i) => (
                <li key={s} className="flex items-center gap-4">
                  {i > 0 && <span aria-hidden className="text-white/40">→</span>}
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="how" className="mx-auto grid max-w-6xl scroll-mt-20 items-center gap-12 px-4 py-20 md:grid-cols-2 md:px-8 md:py-28">
          <div aria-hidden className="rounded-2xl border border-line bg-canvas p-6">
            <div className="rounded-xl border border-line bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <PlateLabel reg="CP19 XWE" />
                <StatusLabel tone="attention">Reply waiting</StatusLabel>
              </div>
              <p className="mt-3 font-semibold">Chloe Patel</p>
              <p className="mt-3 max-w-[85%] rounded-lg rounded-tl-none bg-canvas px-3 py-2 text-sm">Yes please, could you fit it in next week?</p>
              <p className="mt-2 ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-accent px-3 py-2 text-sm text-white">We can do Tue 10:00 or Thu 09:00. Which suits you?</p>
              <p className="mt-3 text-xs text-muted">Automatic texts paused until you reply</p>
            </div>
          </div>
          <div>
            <h2 className="text-[36px] leading-tight font-extrabold tracking-tight md:text-[48px]">Know the moment a customer replies</h2>
            <p className="mt-4 text-lg text-muted">Replies show on the Quotes page and in Chats, and you answer from the app. Chasing pauses for that customer until you do.</p>
            <ul className="mt-8 space-y-6">
              <Tick icon="inbox" title="Every text in one place" text="Each customer's follow-ups, replies and invoice links, newest first." />
              <Tick icon="calendar" title="Book from the reply" text="Offer dates in a tap; the job lands in your Jobs list." />
            </ul>
          </div>
        </section>

        <section id="features" className="scroll-mt-16 bg-canvas py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4 md:px-8">
            <h2 className="mx-auto max-w-2xl text-center text-[36px] leading-tight font-extrabold tracking-tight md:text-[48px]">Everything the service desk does, done for you</h2>
            <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <li key={f.title} className="rounded-xl border border-line bg-white p-8 text-center">
                  <span aria-hidden className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-selected text-accent"><Icon name={f.icon} className="h-5 w-5" /></span>
                  <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-base text-muted">{f.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="steps" className="mx-auto grid max-w-6xl scroll-mt-20 items-center gap-12 px-4 py-20 md:grid-cols-2 md:px-8 md:py-28">
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className={`rounded-xl border p-5 ${i === 0 ? "border-navy bg-navy text-white" : "border-line bg-white"}`}>
                <h3 className="flex items-center gap-3 text-lg font-semibold">
                  <span className={`grid h-7 w-7 place-items-center rounded-full text-sm tabular-nums ${i === 0 ? "bg-white text-navy" : "bg-selected text-accent"}`}>{i + 1}</span>
                  {s.title}
                </h3>
                <p className={`mt-1 pl-10 text-base ${i === 0 ? "text-white/80" : "text-muted"}`}>{s.text}</p>
              </li>
            ))}
          </ol>
          <div>
            <h2 className="text-[36px] leading-tight font-extrabold tracking-tight md:text-[48px]">From quote to paid in four steps</h2>
            <p className="mt-4 text-lg text-muted">You enter the quote. Revloop does the chasing, and puts anything that needs a person in front of you.</p>
            <Link href="/demo" prefetch={false} className={`${primary} mt-8`}>Try the live demo</Link>
          </div>
        </section>

        <section id="pricing" aria-labelledby="price-title" className="bg-canvas py-20 md:py-28">
          <div className="mx-auto max-w-3xl px-4 text-center md:px-8">
            <h2 id="price-title" className="text-[36px] leading-tight font-extrabold tracking-tight md:text-[48px]">One plan. Everything included.</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted">One price for your whole garage and your whole team.</p>
            <div className="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-white p-8">
              <p className="flex items-baseline justify-center gap-1">
                <span className="text-6xl font-extrabold tracking-tight text-navy tabular-nums">{PRICE}</span>
                <span className="text-lg text-muted">/month</span>
              </p>
              <p className="mt-3 text-base text-muted">{FIRST_MONTH_DISCOUNT_PERCENT}% off your first month: <b className="font-semibold text-text tabular-nums">{FIRST_MONTH}</b>. No setup fee.</p>
              <div className="mt-6 flex flex-col gap-3">
                {START_URL && <a href={START_URL} className={`${primary} w-full`}>Start for {FIRST_MONTH}</a>}
                <Link href="/demo" prefetch={false} className={`${START_URL ? outline : primary} w-full`}>Try the live demo</Link>
                <Link href="/pricing" className="text-sm font-medium text-accent underline underline-offset-2 hover:text-accent-hover">See everything that&apos;s included</Link>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-20 md:px-8">
          <div className="mx-auto max-w-6xl rounded-2xl bg-navy px-6 py-14 text-center text-white md:py-20">
            <h2 className="text-[32px] leading-tight font-extrabold tracking-tight md:text-[48px]">Clear the quote queue today</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">See it with sample data first. It&apos;s free and needs no account.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/demo" prefetch={false} className={`inline-flex min-h-11 items-center rounded-lg bg-white px-6 text-base font-medium text-navy hover:bg-canvas ${focusOnNavy}`}>Try the live demo</Link>
              <Link href="/login" className={`inline-flex min-h-11 items-center rounded-lg border border-white/40 px-6 text-base font-medium text-white hover:bg-white/10 ${focusOnNavy}`}>Login</Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
