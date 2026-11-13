import Link from "next/link";
import { SiteFooter, SiteHeader, focus, focusOnNavy, outline, primary } from "@/components/landing/Site";
import { Icon } from "@/components/ui";
import { FIRST_MONTH, FIRST_MONTH_DISCOUNT_PERCENT, PRICE, START_URL } from "@/lib/pricing";

export const metadata = { title: "Pricing · Revloop", description: `One plan, ${PRICE} a month, no setup fee. ${FIRST_MONTH_DISCOUNT_PERCENT}% off your first month.` };

const INCLUDED = [
  { group: "Win the work", items: ["Quotes with labour, parts, discount and VAT", "Saved services for quick quoting", "Two automatic follow-up texts, inside opening hours", "A staff needed list with the reason for each quote"] },
  { group: "Do the work", items: ["Offer dates by text and book the job in one click", "Booking confirmation texts", "Jobs list and calendar", "Completed jobs become invoices"] },
  { group: "Get paid", items: ["Invoices with automatic VAT and PDF", "The PDF link texted to the customer", "Payment reminders for late invoices", "Chats with every text in one place, searchable"] },
  { group: "For everyone", items: ["Your whole team, each with their own login", "Your own private workspace", "Phone, tablet and laptop", "Every future update"] },
];

const STEPS = [
  { title: "Today", head: `${FIRST_MONTH} for your first month`, text: "Full access to everything from day one. Nothing is held back." },
  { title: "We set you up", head: "No setup fee", text: "We create your garage and your team's logins, and you can start adding quotes straight away." },
  { title: "After your first month", head: `${PRICE} a month`, text: "Every feature stays included, with no extras to add." },
];

const FAQ = [
  { q: "What is the first month?", a: `${FIRST_MONTH_DISCOUNT_PERCENT}% off: ${FIRST_MONTH} instead of ${PRICE}, with every feature included.` },
  { q: "Is there a setup fee?", a: "No. We set up your garage and your team's logins for you at no charge." },
  { q: "Do you charge per user?", a: "No. The price covers your whole team, and each person gets their own login." },
  { q: "Can I see it before I pay?", a: "Yes. The live demo is free, needs no account, and runs on sample data so you can click through every screen." },
  { q: "What happens to my customers' details?", a: "Each garage has its own private workspace. One garage can never see another's customers, and customers who reply STOP are never texted again." },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-text">
      <SiteHeader />
      <main id="main">
        <section className="mx-auto max-w-3xl px-4 pt-16 text-center md:px-8 md:pt-24">
          <p className="text-sm font-medium text-accent">Pricing</p>
          <h1 className="mt-3 text-[40px] leading-[1.05] font-extrabold tracking-tight text-navy md:text-[64px]">One plan. Everything included.</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">One simple price for your whole garage, however many people work in it.</p>
        </section>

        <section aria-label="The plan" className="mx-auto max-w-md px-4 pt-12 md:px-8">
          <div className="rounded-2xl border border-line bg-white p-8 text-center">
            <p className="text-lg font-semibold">Revloop</p>
            <p className="mt-3 flex items-baseline justify-center gap-1">
              <span className="text-6xl font-extrabold tracking-tight text-navy tabular-nums">{PRICE}</span>
              <span className="text-lg text-muted">/month</span>
            </p>
            <p className="mt-3 text-base text-muted">Your first month is <b className="font-semibold text-text tabular-nums">{FIRST_MONTH}</b> ({FIRST_MONTH_DISCOUNT_PERCENT}% off). Then {PRICE} a month, every feature included.</p>
            <div className="mt-6 flex flex-col gap-3">
              {START_URL && <a href={START_URL} className={`${primary} w-full`}>Start for {FIRST_MONTH}</a>}
              <Link href="/demo" prefetch={false} className={`${START_URL ? outline : primary} w-full`}>Try the live demo</Link>
            </div>
            <ul className="mt-6 space-y-2 border-t border-line pt-6 text-left text-sm">
              {["No setup fee", "No charge per user", "Free live demo, no account needed"].map((t) => (
                <li key={t} className="flex items-center gap-2"><Icon name="check" className="h-4 w-4 shrink-0 text-accent" />{t}</li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="how-title" className="mx-auto max-w-6xl px-4 py-20 md:px-8 md:py-28">
          <h2 id="how-title" className="text-center text-[32px] leading-tight font-extrabold tracking-tight md:text-[44px]">How your first month works</h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-line bg-canvas p-6">
                <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-accent text-sm font-semibold text-white tabular-nums">{i + 1}</span>
                <p className="mt-4 text-sm text-muted">{s.title}</p>
                <h3 className="mt-1 text-lg font-semibold">{s.head}</h3>
                <p className="mt-2 text-base text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="inc-title" className="bg-canvas py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4 md:px-8">
            <h2 id="inc-title" className="text-center text-[32px] leading-tight font-extrabold tracking-tight md:text-[44px]">Everything in the plan</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-lg text-muted">No tiers and no add-ons. Every garage gets all of it.</p>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {INCLUDED.map((g) => (
                <div key={g.group} className="rounded-xl border border-line bg-white p-6">
                  <h3 className="text-base font-semibold">{g.group}</h3>
                  <ul className="mt-4 space-y-3">
                    {g.items.map((t) => (
                      <li key={t} className="flex gap-2 text-sm text-muted"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{t}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="faq-title" className="mx-auto max-w-3xl px-4 py-20 md:px-8 md:py-28">
          <h2 id="faq-title" className="text-center text-[32px] leading-tight font-extrabold tracking-tight md:text-[44px]">Questions about pricing</h2>
          <div className="mt-10 divide-y divide-line rounded-xl border border-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold ${focus}`}>
                  {f.q}
                  <span aria-hidden className="text-xl text-muted group-open:rotate-45">+</span>
                </summary>
                <p className="pb-2 text-base text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="px-4 pb-20 md:px-8">
          <div className="mx-auto max-w-6xl rounded-2xl bg-navy px-6 py-14 text-center text-white md:py-20">
            <h2 className="text-[32px] leading-tight font-extrabold tracking-tight md:text-[48px]">{START_URL ? `Start for ${FIRST_MONTH}` : "See it running first"}</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">Then {PRICE} a month. No setup fee.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {START_URL && <a href={START_URL} className={`inline-flex min-h-11 items-center rounded-lg bg-white px-6 text-base font-medium text-navy hover:bg-canvas ${focusOnNavy}`}>Start for {FIRST_MONTH}</a>}
              <Link href="/demo" prefetch={false} className={`inline-flex min-h-11 items-center rounded-lg border border-white/40 px-6 text-base font-medium text-white hover:bg-white/10 ${focusOnNavy}`}>Try the live demo</Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
