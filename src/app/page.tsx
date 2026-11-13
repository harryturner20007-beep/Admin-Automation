import Link from "next/link";
import { HOSTED } from "@/lib/mode";

export const metadata = { title: "Garage desk: quotes, jobs and invoices for independent garages" };

const POINTS = [
  { title: "Quotes that chase themselves", text: "Two polite follow-up texts go out automatically. When a customer replies, your team is alerted and answers from the app." },
  { title: "Book it in with one click", text: "Offer dates by text, confirm the one the customer picks, and the job lands in your Jobs list with a confirmation text sent." },
  { title: "Invoices and payment reminders", text: "Completing a job creates the invoice. Issue it, download the PDF, and let reminders chase late payers." },
];

/** Public front door. Garages sign in from here; nothing about any garage is shown before sign-in. */
export default function Home() {
  const cta = "inline-flex min-h-11 items-center rounded-lg bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  return (
    <div className="min-h-screen bg-canvas font-sans text-text">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 md:px-8">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white">G</span>
          Garage desk
        </span>
        <Link href={HOSTED ? "/login" : "/overview"} className={cta}>{HOSTED ? "Garage login" : "Open the demo"}</Link>
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-12 pb-16 md:px-8 md:pt-20">
        <h1 className="max-w-2xl text-[28px] leading-tight font-[650] md:text-[40px]">From quote to paid invoice, without the chasing.</h1>
        <p className="mt-4 max-w-xl text-base text-muted">Garage desk follows up your quotes by text, books accepted work into your diary and chases unpaid invoices, so your team can stay on the tools.</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href={HOSTED ? "/login" : "/overview"} className={cta}>{HOSTED ? "Log in to your garage" : "Open the demo"}</Link>
          <span className="text-sm text-muted">{HOSTED ? "Accounts are by invitation. Ask us to set your garage up." : "Sample data only. Nothing here is a real customer."}</span>
        </div>
        <ul className="mt-12 grid gap-4 md:grid-cols-3">
          {POINTS.map((p) => (
            <li key={p.title} className="rounded-xl border border-line bg-white p-6">
              <h2 className="text-lg font-semibold">{p.title}</h2>
              <p className="mt-2 text-sm text-muted">{p.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-sm text-muted">Each garage has its own private workspace. Staff sign in with their own account, and one garage can never see another&apos;s customers.</p>
      </main>
    </div>
  );
}
