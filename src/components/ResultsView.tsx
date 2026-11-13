"use client";

import { useState } from "react";
import { formatPounds } from "@/domain/engine";
import { computeResults, type Range } from "@/domain/reporting";
import { DAY_MS, formatLondon, londonParts, londonToUtc } from "@/domain/time";
import { useDemo } from "@/demo/store";
import { quoteRow } from "./quoteRows";
import { Plate } from "./ui";
import { ResetDemo } from "./ResetDemo";

type Period = "7d" | "30d" | "month" | "all";
const PERIODS: { id: Period; label: string }[] = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "month", label: "This month" },
  { id: "all", label: "All time" },
];

// Periods run up to and including "now" (open-ended): nothing can have happened after the clock.
function rangeFor(period: Period, now: string): Range {
  const t = Date.parse(now);
  if (period === "7d") return { from: new Date(t - 7 * DAY_MS).toISOString() };
  if (period === "30d") return { from: new Date(t - 30 * DAY_MS).toISOString() };
  if (period === "month") {
    const p = londonParts(now);
    return { from: londonToUtc({ y: p.y, m: p.m, d: 1 }, 0, 0).toISOString() };
  }
  return {};
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

export function ResultsView() {
  const { state, garageId } = useDemo();
  const [period, setPeriod] = useState<Period>("30d");
  const range = rangeFor(period, state.now);
  const r = computeResults(state, garageId, range);
  const rows = state.quotes.filter((q) => q.garageId === garageId).map((q) => quoteRow(state, q)).reverse();
  const periodLabel = PERIODS.find((p) => p.id === period)!.label.toLowerCase();

  const figures = [
    { label: "Quotes followed up", value: String(r.quotesFollowedUp), sub: `${r.followUpsSent} ${plural(r.followUpsSent, "text")} sent` },
    { label: "Replies", value: String(r.replies), sub: `${r.optOuts} ${plural(r.optOuts, "opt-out")}` },
    { label: "Booking requests", value: String(r.bookingRequests), sub: "customer asked to book" },
    { label: "Confirmed bookings", value: String(r.bookedTotal), sub: `${r.confirmedBookings} after a follow-up`, signal: r.bookedTotal > 0 },
    { label: "Completed job value", value: formatPounds(r.observedJobValuePence), sub: `${r.completedJobs} ${plural(r.completedJobs, "job")} after a follow-up` },
  ];

  return (
    <>
      <section aria-labelledby="results-title" className="mx-4 mt-4 rounded-2xl bg-navy/90 text-white shadow-card md:mx-8">
        <div className="mx-auto max-w-6xl px-4 pt-6 pb-7 sm:pt-10">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded border border-dashed border-white/35 px-1.5 py-0.5 text-xs text-white">Demo data</span>
            <span className="text-sm text-steel">Invented garage and customers. Texts go to a mock provider.</span>
          </div>
          <h1 id="results-title" className="mt-4 max-w-[20ch] text-[clamp(2rem,5vw,3.5rem)] leading-[0.95] font-extrabold tracking-[-0.02em] [font-stretch:125%]">
            {r.bookedTotal} {plural(r.bookedTotal, "booking")} confirmed, {periodLabel}
          </h1>
          <p className="mt-3 max-w-[62ch] text-steel">
            Bookings and jobs here are observed outcomes: they happened after a follow-up, which doesn&apos;t prove the text caused them.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Period" className="flex flex-wrap gap-x-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                role="tab"
                aria-selected={period === p.id}
                onClick={() => setPeriod(p.id)}
                className={`border-b-2 px-2.5 pt-1 pb-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-signal ${period === p.id ? "border-signal text-ink" : "border-transparent text-slate-500 hover:text-ink"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            {range.from ? `${formatLondon(range.from)} to ${formatLondon(state.now)}` : `Everything up to ${formatLondon(state.now)}`}
          </span>
        </div>

        {/* The figures: one readout strip, large tabular numbers, no cards. */}
        <dl className="grid grid-cols-2 overflow-hidden rounded-md border border-steel-line bg-white sm:grid-cols-3 lg:grid-cols-5">
          {figures.map((f, i) => (
            <div key={f.label} className={`border-steel-line/70 px-4 py-4 ${i > 0 ? "border-t sm:border-t-0" : ""} ${i % 2 === 1 ? "border-l" : ""} sm:border-l sm:first:border-l-0 ${i === 4 ? "col-span-2 sm:col-span-1" : ""}`}>
              <dt className="text-sm text-slate-600">{f.label}</dt>
              <dd className={`mt-1 text-[2rem] leading-none font-extrabold tabular-nums [font-stretch:115%] ${f.signal ? "text-signal" : "text-ink"}`}>{f.value}</dd>
              <dd className="mt-1.5 text-xs text-slate-500">{f.sub}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-8">
          <section aria-labelledby="outcomes-title">
            <h2 id="outcomes-title" className="mb-2 text-base font-semibold text-ink [font-stretch:110%]">Quote outcomes</h2>
            <ul className="overflow-hidden rounded-md border border-steel-line bg-white">
              {rows.map(({ q, status }) => (
                <li key={q.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-steel-line/70 px-4 py-2.5 last:border-0">
                  <Plate reg={q.registration} ghost />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{q.customerName}</span>
                    <span className={`block text-xs ${status.tone === "red" ? "text-red-700" : "text-slate-600"}`}>
                      {status.label}
                      {q.jobValuePence !== undefined && `, ${formatPounds(q.jobValuePence)} job`}
                    </span>
                  </span>
                  <span className="text-right text-sm font-semibold tabular-nums">{formatPounds(q.amountPence)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-steel-line pt-4 text-sm text-slate-600">
          <span>Repeating the demo? Reset puts every quote, reply and figure back to the start.</span>
          <ResetDemo />
        </div>
      </div>
    </>
  );
}
