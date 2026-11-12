"use client";

import Link from "next/link";
import { invoiceForJob, jobInTab } from "@/domain/jobs";
import { overview } from "@/domain/overview";
import { formatPounds } from "@/domain/templates";
import { formatLondonTime } from "@/domain/time";
import { useDemo } from "@/demo/store";
import { CountTo, Rise } from "./motion";
import { PlateLabel } from "./ui";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function OverviewView() {
  const { state, garageId } = useDemo();
  const garage = state.garages.find((g) => g.id === garageId)!;
  const items = overview(state, garageId);
  const today = state.jobs.filter((j) => j.garageId === garageId && (jobInTab(state, j, "today") || j.status === "in_progress")).sort((a, b) => a.startAt.localeCompare(b.startAt));
  const empty = !state.quotes.some((q) => q.garageId === garageId);
  const setupNeeded = !garage.business.address.trim() || !(garage.business.legalName || garage.business.tradingName).trim();

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-[28px] leading-tight font-[650] text-text">{garage.business.tradingName || garage.name}</h1>
      <p className="mt-1 text-sm text-muted">What needs doing now, from quote to payment.</p>

      {setupNeeded && (
        <p className="mt-4 rounded-xl border border-attention/30 bg-attention-bg px-4 py-3 text-sm text-attention">
          Add your business name and address before issuing invoices. <Link href="/settings" className="font-medium underline">Open Settings</Link>
        </p>
      )}

      <section aria-label="Work to do" className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 md:gap-4">
        {items.map((it, i) => (
          <Rise key={it.id} delay={200 + Math.min(i, 2) * 60}>
            <Link href={it.href} className={`block h-full rounded-xl border border-line bg-white px-4 py-4 transition-colors duration-150 hover:border-muted ${focusRing}`}>
              <span className="text-sm font-medium text-text">{it.label}</span>
              <span className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-text tabular-nums"><CountTo value={it.count} format={String} /></span>
                {it.amountPence !== undefined && <span className="text-xs text-muted tabular-nums">{formatPounds(it.amountPence)}</span>}
              </span>
              <span className="mt-1 block text-xs text-muted">{it.hint}</span>
            </Link>
          </Rise>
        ))}
      </section>

      <section aria-labelledby="today-h" className="mt-8">
        <h2 id="today-h" className="text-lg font-semibold text-text">In the workshop today</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-line bg-white">
          {today.length ? (
            <ul className="divide-y divide-line">
              {today.map((j) => {
                const q = state.quotes.find((x) => x.id === j.quoteId)!;
                return (
                  <li key={j.id}>
                    <Link href={`/jobs?job=${j.id}${j.status === "in_progress" ? "&tab=in_progress" : ""}`} className={`flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-canvas ${focusRing}`}>
                      <span className="w-12 text-sm text-muted tabular-nums">{formatLondonTime(j.startAt)}</span>
                      <PlateLabel reg={q.registration} />
                      <span className="min-w-0 flex-1 text-sm text-text"><span className="font-medium">{q.customerName}</span> · {q.customerJobDescription || q.job}</span>
                      <span className="text-xs font-medium text-muted">{j.status === "in_progress" ? "In progress" : invoiceForJob(state, j.id) ? "" : "Booked"}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-muted">{empty ? "No quotes yet. Add your first one on the Quotes page." : "Nothing booked in for today."}</p>
          )}
        </div>
      </section>

      <nav aria-label="More" className="mt-8 flex flex-wrap gap-2 text-sm">
        {[["/replies", "Replies"], ["/calendar", "Calendar"], ["/results", "Results"]].map(([href, label]) => (
          <Link key={href} href={href} className={`inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-accent ring-1 ring-line ring-inset hover:bg-white ${focusRing}`}>{label}</Link>
        ))}
      </nav>
    </div>
  );
}
