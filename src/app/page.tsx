import { Hero } from "@/components/landing/Hero";
import { PressLink, Reveal } from "@/components/landing/reveal";
import { HOSTED } from "@/lib/mode";

export const metadata = { title: "Garage desk: quotes, jobs and invoices for independent garages" };

const POINTS = [
  { title: "Quotes that chase themselves", text: "Two polite follow-up texts go out automatically. When a customer replies, your team is alerted and answers from the app." },
  { title: "Book it in with one click", text: "Offer dates by text, confirm the one the customer picks, and the job lands in your Jobs list with a confirmation text sent." },
  { title: "Invoices and payment reminders", text: "Completing a job creates the invoice. Issue it, download the PDF, and let reminders chase late payers." },
];

// The real workflow, in the order the garage works through it.
const STEPS = [
  { n: 1, title: "Add the quote", text: "Enter the customer, vehicle and work once." },
  { n: 2, title: "Follow-ups go out", text: "Two texts, spaced out, inside opening hours." },
  { n: 3, title: "Book the job", text: "The customer picks a time; you confirm it." },
  { n: 4, title: "Invoice and get paid", text: "Complete the job, issue the invoice, chase if it's late." },
];

// Plain statements about how the product behaves, not marketing claims. Each one is enforced in the app.
const SAFEGUARDS = [
  "Every garage has its own private workspace. One garage can never see another's customers.",
  "Staff sign in with their own accounts. Accounts are by invitation only.",
  "Texts only go to customers recorded as agreeing to them, and anyone who replies STOP is never texted again.",
  "A customer's reply pauses automatic texts until your team has answered.",
];

/** Public front door. Garages sign in from here; nothing about any garage is shown before sign-in. */
export default function Home() {
  const href = "/login"; // the demo has its own sign-in screen too (demo / demo)
  const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  const cta = `inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-accent px-5 text-base font-medium text-white transition-colors duration-150 hover:bg-accent-hover ${focus}`;
  return (
    <div className="min-h-screen bg-canvas font-sans text-text">
      {/* Without JavaScript the entrances can't play, so show everything. */}
      <noscript>
        <style>{"[data-reveal]{opacity:1!important;transform:none!important}"}</style>
      </noscript>
      <a href="#main" className={`sr-only z-50 rounded-lg bg-white px-4 py-2 font-medium text-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2 ${focus}`}>Skip to content</a>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 md:px-8">
        <span className="flex items-center gap-2 text-base font-semibold">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white">G</span>
          Garage desk
        </span>
        <PressLink href={href} className={cta}>{HOSTED ? "Garage login" : "Login"}</PressLink>
      </header>

      <main id="main">
        <Hero
          href={href}
          label={HOSTED ? "Log in to your garage" : "Login"}
          note={HOSTED ? "Accounts are by invitation. Ask us to set your garage up." : "Sample data only. Nothing here is a real customer."}
          ctaClass={cta}
        />

        <div className="mx-auto max-w-5xl space-y-16 px-4 pt-14 pb-16 md:space-y-20 md:px-8 md:pt-20">
          <section aria-labelledby="what-title">
            <h2 id="what-title" className="sr-only">What it does</h2>
            <Reveal>
              <ul className="grid gap-4 md:grid-cols-3">
                {POINTS.map((p) => (
                  <li key={p.title} className="rounded-xl border border-line bg-white p-6">
                    <h3 className="text-lg font-semibold">{p.title}</h3>
                    <p className="mt-2 text-base text-muted">{p.text}</p>
                  </li>
                ))}
              </ul>
            </Reveal>
          </section>

          <section aria-labelledby="how-title">
            <Reveal>
              <h2 id="how-title" className="text-[28px] leading-tight font-[650]">How a job goes through</h2>
            </Reveal>
            <ol className="mt-6 grid gap-4 md:grid-cols-4">
              {STEPS.map((s, i) => (
                <Reveal as="li" key={s.n} stagger={i} className="rounded-xl border border-line bg-white p-6">
                  <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-selected text-base font-semibold text-accent tabular-nums">{s.n}</span>
                  <h3 className="mt-3 text-lg font-semibold"><span className="sr-only">Step {s.n}: </span>{s.title}</h3>
                  <p className="mt-1 text-base text-muted">{s.text}</p>
                </Reveal>
              ))}
            </ol>
          </section>

          <Reveal as="section" labelledBy="safe-title" className="rounded-xl border border-line bg-white p-6 md:p-8">
            <h2 id="safe-title" className="text-[28px] leading-tight font-[650]">Your customers&apos; details stay yours</h2>
            <ul className="mt-4 space-y-3">
              {SAFEGUARDS.map((t) => (
                <li key={t} className="flex gap-3 text-base text-text">
                  <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 shrink-0 text-accent"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal as="section" labelledBy="start-title" className="text-center">
            <h2 id="start-title" className="text-[28px] leading-tight font-[650]">Ready when you are</h2>
            <p className="mx-auto mt-2 max-w-md text-base text-muted">{HOSTED ? "Log in to your garage's dashboard, or ask us to set your garage up." : "Have a look around with sample data."}</p>
            <PressLink href={href} className={`${cta} mt-6`}>{HOSTED ? "Garage login" : "Login"}</PressLink>
          </Reveal>
        </div>
      </main>

      <footer className="border-t border-line bg-white">
        <p className="mx-auto max-w-5xl px-4 py-6 text-sm text-muted md:px-8">Garage desk · Quotes, jobs and invoices for independent UK garages.</p>
      </footer>
    </div>
  );
}
