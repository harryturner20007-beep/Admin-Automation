"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { invoiceForJob, jobInTab } from "@/domain/jobs";
import { invoiceView } from "@/domain/invoices";
import { overview, quoteTrend, type OverviewItem } from "@/domain/overview";
import { bucketOf, staffReason } from "@/domain/queue";
import { formatPounds } from "@/domain/templates";
import { formatLondonDate, formatLondonTime, LONDON } from "@/domain/time";
import type { AppState } from "@/domain/types";
import { useDemo } from "@/demo/store";
import { CountTo, Rise } from "./motion";
import { Icon, PlateLabel, type IconName } from "./ui";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const card = "rounded-2xl border border-white/70 bg-white shadow-card";
const label = "font-mono text-[11px] font-medium tracking-[0.14em] text-muted uppercase";

const ICON: Record<string, IconName> = { follow_up: "quotes", today: "calendar", in_progress: "wrench", to_invoice: "doc", unpaid: "pound", overdue: "alert" };

/** Short card label, in the dashboard's small capitals. */
const SHORT: Record<string, string> = { follow_up: "Staff needed", today: "Booked today", in_progress: "In progress", to_invoice: "To invoice", unpaid: "Unpaid", overdue: "Overdue" };

function greeting(now: string) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, hour: "numeric", hourCycle: "h23" }).format(new Date(now)));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Kpi({ it, i }: { it: OverviewItem; i: number }) {
  const alarm = it.id === "overdue" && it.count > 0;
  return (
    <Rise delay={200 + Math.min(i, 2) * 60}>
      <Link href={it.href} className={`group block h-full p-5 transition-colors duration-150 hover:border-accent/40 ${card} ${focusRing}`}>
        <span className="flex items-start justify-between gap-2">
          <span className={label}>{SHORT[it.id] ?? it.label}</span>
          <Icon name={ICON[it.id] ?? "bolt"} className="h-4 w-4 text-muted transition-colors group-hover:text-accent" />
        </span>
        <span className="mt-3 block text-[30px] leading-none font-semibold tracking-tight text-navy tabular-nums"><CountTo value={it.count} format={String} /></span>
        <span className={`mt-2 block text-xs tabular-nums ${alarm ? "font-medium text-danger" : it.amountPence ? "font-medium text-accent" : "text-muted"}`}>
          {it.amountPence !== undefined ? formatPounds(it.amountPence) : it.hint}
          {it.amountPence !== undefined && <span className="font-normal text-muted"> · {it.hint.toLowerCase()}</span>}
        </span>
      </Link>
    </Rise>
  );
}

/** Running totals of quoted and won value: a line with a soft area under it, as in the reference dashboard. */
function TrendChart({ state, garageId }: { state: AppState; garageId: string }) {
  const points = quoteTrend(state, garageId, 30);
  const W = 600;
  const H = 180;
  const max = Math.max(1, ...points.map((p) => p.quotedPence));
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - 8 - (v / max) * (H - 24);
  const line = (key: "quotedPence" | "wonPence") => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const last = points.at(-1)!;
  const rate = last.quotedPence ? Math.round((last.wonPence / last.quotedPence) * 100) : 0;
  const ticks = [0, 7, 14, 21, 29].map((i) => ({ i, text: formatLondonDate(`${points[i].day}T12:00:00Z`).replace(/^\w+ /, "") }));
  return (
    <section aria-labelledby="trend-h" className={`p-5 lg:col-span-2 ${card}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="trend-h" className="flex items-baseline gap-3 text-base font-semibold text-navy">
          Quoted <span className={label}>Last 30 days</span>
        </h2>
        <p className="flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 rounded bg-accent" />Quoted <b className="font-semibold text-text tabular-nums">{formatPounds(last.quotedPence)}</b></span>
          <span className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 rounded border-t-2 border-dashed border-navy" />Won <b className="font-semibold text-text tabular-nums">{formatPounds(last.wonPence)}</b> ({rate}%)</span>
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 20}`} role="img" aria-label={`Quoted ${formatPounds(last.quotedPence)} over the last 30 days, ${formatPounds(last.wonPence)} of it won`} className="mt-4 h-48 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--color-line)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />)}
        <path d={`${line("quotedPence")} L${W},${H} L0,${H} Z`} fill="url(#trend-fill)" />
        <path d={line("quotedPence")} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={line("wonPence")} fill="none" stroke="var(--color-navy)" strokeWidth="1.75" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
        <circle cx={x(points.length - 1)} cy={y(last.quotedPence)} r="5" fill="var(--color-brand)" stroke="white" strokeWidth="2" />
        {ticks.map((t) => (
          <text key={t.i} x={x(t.i)} y={H + 16} textAnchor={t.i === 0 ? "start" : t.i === points.length - 1 ? "end" : "middle"} className="fill-muted font-mono text-[10px] tracking-widest uppercase">{t.text}</text>
        ))}
      </svg>
    </section>
  );
}

export function OverviewView() {
  const { state, garageId } = useDemo();
  const router = useRouter();
  const garage = state.garages.find((g) => g.id === garageId)!;
  const items = overview(state, garageId);
  const today = state.jobs.filter((j) => j.garageId === garageId && (jobInTab(state, j, "today") || j.status === "in_progress")).sort((a, b) => a.startAt.localeCompare(b.startAt));
  const empty = !state.quotes.some((q) => q.garageId === garageId);
  const setupNeeded = !garage.business.address.trim() || !(garage.business.legalName || garage.business.tradingName).trim();

  // The few things that need a person, most urgent first: replies, then quotes out of follow-ups, then late invoices.
  const quotes = state.quotes.filter((q) => q.garageId === garageId && bucketOf(state, q) === "staff_needed");
  const actions = [
    ...quotes.filter((q) => q.unresolvedReply || q.booking === "requested").map((q) => ({ id: q.id, text: `Reply to ${q.customerName}`, href: `/quotes?quote=${q.id}` })),
    ...quotes.filter((q) => !(q.unresolvedReply || q.booking === "requested")).map((q) => ({ id: q.id, text: `Chase ${q.customerName}: ${(staffReason(state, q) ?? "").split(",")[0].toLowerCase()}`, href: `/quotes?quote=${q.id}` })),
    ...state.invoices
      .filter((i) => i.garageId === garageId && ["overdue", "needs_call"].includes(invoiceView(state, i).state))
      .map((i) => ({ id: i.id, text: `Chase overdue invoice ${i.number}`, href: "/invoices?filter=overdue" })),
  ];

  return (
    <div className="p-4 md:p-8 md:pt-6">
      <p className={label}>{formatLondonDate(state.now)}</p>
      <h1 className="mt-1 text-[28px] leading-tight font-[650] text-navy">
        {greeting(state.now)}, {garage.business.tradingName || garage.name}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {actions.length ? <>{actions.length} {actions.length === 1 ? "thing needs" : "things need"} you today.</> : "Nothing needs you right now."}
      </p>

      {setupNeeded && (
        <p className="mt-4 rounded-xl border border-attention/30 bg-attention-bg px-4 py-3 text-sm text-attention">
          Add your business name and address before issuing invoices. <Link href="/settings" className="font-medium underline">Open Settings</Link>
        </p>
      )}

      <section aria-label="Work to do" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 md:gap-4">
        {items.map((it, i) => <Kpi key={it.id} it={it} i={i} />)}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <TrendChart state={state} garageId={garageId} />

        <section aria-labelledby="actions-h" className={`flex flex-col p-5 ${card}`}>
          <h2 id="actions-h" className="flex items-center gap-2 text-base font-semibold text-navy">
            Action items <span className="rounded-md bg-canvas px-1.5 text-xs font-medium text-muted tabular-nums">{actions.length}</span>
          </h2>
          {actions.length ? (
            <ul className="mt-3 space-y-0.5">
              {actions.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <Link href={a.href} className={`flex min-h-10 items-center gap-3 rounded-lg px-2 text-sm text-text hover:bg-canvas ${focusRing}`}>
                    <span aria-hidden className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-muted/60" />
                    <span className="min-w-0 truncate">{a.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">All clear. New replies and late invoices show up here.</p>
          )}
          {actions.length > 6 && <Link href="/quotes?bucket=staff_needed" className="mt-auto pt-3 text-sm font-medium text-accent hover:text-accent-hover">See all {actions.length}</Link>}
        </section>

        <section aria-labelledby="today-h" className={`overflow-hidden lg:col-span-2 ${card}`}>
          <h2 id="today-h" className="flex items-baseline gap-3 px-5 pt-5 text-base font-semibold text-navy">
            In the workshop <span className={label}>Today</span>
          </h2>
          {today.length ? (
            <ul className="mt-3 divide-y divide-line">
              {today.map((j) => {
                const q = state.quotes.find((x) => x.id === j.quoteId)!;
                return (
                  <li key={j.id}>
                    <Link href={`/jobs?job=${j.id}${j.status === "in_progress" ? "&tab=in_progress" : ""}`} className={`flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-canvas ${focusRing}`}>
                      <span className="w-12 font-mono text-xs text-muted tabular-nums">{formatLondonTime(j.startAt)}</span>
                      <PlateLabel reg={q.registration} />
                      <span className="min-w-0 flex-1 text-sm text-text"><span className="font-medium">{q.customerName}</span> · {q.customerJobDescription || q.job}</span>
                      <span className="text-xs font-medium text-muted">{j.status === "in_progress" ? "In progress" : invoiceForJob(state, j.id) ? "" : "Booked"}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-muted">{empty ? "No quotes yet. Add your first one on the Quotes page." : "Nothing booked in for today."}</p>
          )}
        </section>

        <section aria-labelledby="links-h" className={`p-5 ${card}`}>
          <h2 id="links-h" className="text-base font-semibold text-navy">Quick links</h2>
          <ul className="mt-3 space-y-2">
            <li>
              <button type="button" onClick={() => router.push(`/quotes?add=${Date.now()}`)} className={`flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-canvas text-sm font-medium text-text hover:bg-selected hover:text-accent ${focusRing}`}>
                <Icon name="plus" className="h-4 w-4" /> Add quote
              </button>
            </li>
            {([
              ["/jobs", "calendar", "Today's jobs"],
              ["/invoices?filter=draft", "doc", "Invoices to issue"],
              ["/chats", "inbox", "Chats"],
              ["/settings", "sliders", "Settings"],
            ] as const).map(([href, icon, text]) => (
              <li key={href}>
                <Link href={href} className={`flex min-h-10 items-center justify-center gap-2 rounded-lg bg-canvas text-sm font-medium text-text hover:bg-selected hover:text-accent ${focusRing}`}>
                  <Icon name={icon} className="h-4 w-4" /> {text}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
