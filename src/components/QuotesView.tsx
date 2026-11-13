"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { gsap } from "gsap";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatPounds } from "@/domain/engine";
import { bucketOf, canChase, followUpFor, priorityCompare, staffReason, updatedAt, type Bucket, type FollowUp } from "@/domain/queue";
import type { Quote } from "@/domain/types";
import { formatLondon } from "@/domain/time";
import { useAction, useDemo } from "@/demo/store";
import { AddQuoteDrawer } from "./AddQuoteDrawer";
import { CountTo, lineReveal, motionAllowed, RISE, Rise, Words } from "./motion";
import { QuotePanel } from "./QuotePanel";
import { statusOf } from "./quoteStatus";
import { Button, Icon, InlineFeedback, PlateLabel, StatusLabel } from "./ui";

// Loaded on demand: pulls in Animate.css and (lazily) Three.js only when this empty state shows.
const NoFollowUpsDue = dynamic(() => import("./NoFollowUpsDue").then((m) => m.NoFollowUpsDue), { ssr: false });

const CARDS: { id: Exclude<Bucket, "other">; label: string }[] = [
  { id: "staff_needed", label: "Staff needed" },
  { id: "awaiting_reply", label: "Follow-ups running" },
  { id: "accepted", label: "Accepted" },
];

type Sort = "priority" | "updated" | "value";
const SORTS: { id: Sort; label: string }[] = [
  { id: "priority", label: "Priority" },
  { id: "updated", label: "Recently updated" },
  { id: "value", label: "Quote value" },
];

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const followTone = (f: FollowUp) => (f.kind === "overdue" || f.kind === "today" || f.kind === "outcome_needed" || f.kind === "reply" ? "font-medium text-attention" : "text-muted");
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

// Header, cards and the first rows animate in once per page load, not on every visit back to /quotes.
let introPlayed = false;

const MODE_LABEL = { off: "Off", draft: "Draft for approval", automatic: "Automatic" } as const;

/** Automation at a glance: mode, last check, drafts waiting, and a manual check. All simulated in the demo. */
function AutomationStrip({ play }: { play: boolean }) {
  const { state, garageId, runCheck } = useDemo();
  const garage = state.garages.find((g) => g.id === garageId)!;
  const check = useAction();
  const drafts = state.messages.filter((m) => m.garageId === garageId && m.status === "awaiting_approval").length;
  return (
    <Rise play={play} delay={160} className="mt-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-line bg-white px-4 py-2 text-sm text-muted">
        <span>
          Follow-ups: <span className="font-medium text-text">{MODE_LABEL[garage.mode]}</span>
        </span>
        {/* Dashed outline = simulated, everywhere in the app. */}
        <span className="rounded border border-dashed border-muted/60 px-1.5 py-0.5 text-xs text-text" title="In this demo, checks run every 15 minutes of demo-clock time and texts go to the mock SMS provider.">
          {garage.mode === "automatic" ? "Simulated sending" : "Simulated checks"}
        </span>
        <span>
          Last check <span className="text-text tabular-nums">{garage.lastCheckAt ? formatLondon(garage.lastCheckAt) : "never"}</span>
        </span>
        <span>
          <span className="text-text tabular-nums">{drafts}</span> {drafts === 1 ? "draft" : "drafts"} awaiting approval
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <InlineFeedback feedback={check.feedback?.ok ? null : check.feedback} />
          <Link href="/settings" className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-accent hover:bg-canvas hover:text-accent-hover ${focusRing}`}>
            Settings
          </Link>
          <Button size="sm" disabled={check.pending || garage.mode === "off"} aria-busy={check.pending} onClick={() => check.run(runCheck, "done")}>
            <Icon name="refresh" className="h-3.5 w-3.5" />
            {check.pending ? "Checking…" : "Run check now"}
          </Button>
        </span>
      </div>
    </Rise>
  );
}

export function QuotesView() {
  const { state, garageId } = useDemo();
  const params = useSearchParams();
  const fromLink = params.get("bucket"); // Overview links straight to a filtered list
  const [bucket, setBucket] = useState<Exclude<Bucket, "other"> | null>(fromLink === "staff_needed" || fromLink === "awaiting_reply" || fromLink === "accepted" ? fromLink : null);
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<Sort>("priority");
  const [search, setSearch] = useState("");
  // ?quote=<id> (from the Calendar) opens that quote's panel on arrival.
  const linked = params.get("quote");
  const [selected, setSelected] = useState<string | null>(() => (linked && state.quotes.some((q) => q.id === linked && q.garageId === garageId) ? linked : null));
  const [openIndex, setOpenIndex] = useState(0); // where the open quote sat, so "Next quote" works after it leaves the filter
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null);
  const [enter, setEnter] = useState(true); // panel slides in when it opens, not when switching quotes
  const [intro] = useState(() => !introPlayed);
  const addBtn = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  const quotes = state.quotes.filter((q) => q.garageId === garageId);
  // Keep the chosen status listed even when no quote has it any more, so the select never misstates the filter.
  const statuses = [...new Set([...quotes.map((q) => statusOf(state, q).label), ...(status === "all" ? [] : [status])])].sort();
  const term = squash(search);
  const compare = sort === "priority" ? priorityCompare(state) : sort === "updated" ? (a: Quote, b: Quote) => updatedAt(state, b).localeCompare(updatedAt(state, a)) : (a: Quote, b: Quote) => b.amountPence - a.amountPence;
  const visible = quotes
    .filter((q) => !bucket || bucketOf(state, q) === bucket)
    .filter((q) => status === "all" || statusOf(state, q).label === status)
    .filter((q) => !term || [q.customerName, q.registration ?? "", q.job, q.customerJobDescription ?? "", q.vehicle].some((v) => squash(v).includes(term)))
    .sort(compare);
  const filtered = !!bucket || status !== "all" || !!term;
  // Customers whose text is waiting for an answer: shown at the top of the page until someone deals with it.
  const replied = quotes.filter((q) => q.status === "open" && (q.unresolvedReply || q.booking === "requested"));

  const open = (id: string) => {
    setOpenIndex(Math.max(0, visible.findIndex((q) => q.id === id)));
    setAdding(false);
    setEnter(selected === null);
    setSelected(id);
  };
  // Back to the row that opened the panel, once the panel is gone; the page never scrolled, so the user's place is unchanged.
  const returnTo = useRef<string | null>(null);
  const close = useCallback(() => {
    returnTo.current = selected;
    setSelected(null);
  }, [selected]);
  useEffect(() => {
    if (selected !== null || !returnTo.current) return;
    [...document.querySelectorAll<HTMLElement>(`[data-row-open="${returnTo.current}"]`)].find((el) => el.offsetParent)?.focus({ preventScroll: true });
    returnTo.current = null;
  }, [selected]);
  const nextIndex = (() => {
    const i = visible.findIndex((q) => q.id === selected);
    return i >= 0 ? i + 1 : openIndex; // if the saved quote left the filter, the next one now sits in its old slot
  })();
  const next = visible[nextIndex];
  const clearFilters = () => {
    setBucket(null);
    setStatus("all");
    setSearch("");
  };

  // First load only: h1 line reveal and the first 8 visible rows rising in. Filtering, sorting and searching never animate.
  useLayoutEffect(() => {
    introPlayed = true;
    if (!intro || !motionAllowed()) return;
    const tweens = [title.current && lineReveal(title.current)];
    const rows = [...document.querySelectorAll<HTMLElement>("[data-row]")].filter((el) => el.offsetParent).slice(0, 8);
    if (rows.length) tweens.push(gsap.from(rows, { ...RISE, delay: 0.2, stagger: 0.03 }));
    return () => tweens.forEach((t) => t?.revert());
  }, [intro]);

  // Brief highlight on the row whose status was just saved (skipped for reduced motion).
  useEffect(() => {
    if (!flash || !motionAllowed()) return;
    const tween = gsap.fromTo(`[data-row="${flash.id}"]`, { backgroundColor: "#EAF4F6" }, { backgroundColor: "rgba(234,244,246,0)", duration: 0.9, ease: "power1.out", clearProps: "backgroundColor" });
    return () => {
      tween.revert();
    };
  }, [flash]);

  const action = (q: Quote, full = false) => {
    const chase = canChase(state, q);
    return (
      <Button variant={chase ? "primary" : "secondary"} size="sm" className={full ? "w-full" : ""} onClick={() => open(q.id)} aria-label={`${chase ? "Chase quote" : "View quote"} for ${q.customerName}`}>
        {chase ? "Chase quote" : "View quote"} <Icon name="next" className="nudge-icon h-3.5 w-3.5" />
      </Button>
    );
  };

  const empty =
    quotes.length === 0 ? (
      <Rise className="px-6 py-12 text-center">
        <h2 className="text-lg font-semibold text-text">No quotes yet</h2>
        <p className="mt-1 text-sm text-muted">Add a quote the garage has sent, and it appears here ready to chase.</p>
        <Button className="hover-turn mt-4" variant="primary" onClick={() => setAdding(true)}><Icon name="plus" className="nudge-icon h-4 w-4" /> Add quote</Button>
      </Rise>
    ) : bucket === "staff_needed" && !term && status === "all" ? (
      <NoFollowUpsDue onViewAll={clearFilters} />
    ) : (
      <Rise className="px-6 py-12 text-center">
        <h2 className="text-lg font-semibold text-text">No quotes match</h2>
        <p className="mt-1 text-sm text-muted">{term ? `Nothing matches “${search}” with these filters.` : "No quotes fit these filters."}</p>
        <Button className="mt-4" variant="secondary" onClick={clearFilters}>Clear search and filters</Button>
      </Rise>
    );

  return (
    <div className="desk:flex desk:items-start">
      <div className="min-w-0 flex-1 p-4 md:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 ref={title} aria-label="Quotes" className="text-[28px] leading-tight font-[650] text-text"><Words text="Quotes" /></h1>
            <Rise play={intro} delay={120}>
              <p className="mt-1 text-sm text-muted">Follow up with customers and record their decisions.</p>
            </Rise>
          </div>
          <Button ref={addBtn} variant="primary" className="hover-turn" onClick={() => { setSelected(null); setAdding(true); }}>
            <Icon name="plus" className="nudge-icon h-4 w-4" /> Add quote
          </Button>
        </div>

        <AutomationStrip play={intro} />

        {replied.length > 0 && (
          <div role="alert" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-accent bg-selected px-4 py-3 text-sm text-text">
            <Icon name="inbox" className="h-5 w-5 text-accent" />
            <span className="font-semibold">{replied.length === 1 ? "1 customer has replied and needs an answer:" : `${replied.length} customers have replied and need an answer:`}</span>
            {replied.map((q) => (
              <button key={q.id} onClick={() => open(q.id)} className={`inline-flex min-h-11 items-center rounded-lg bg-white px-3 font-medium text-accent ring-1 ring-line ring-inset hover:bg-canvas ${focusRing}`}>
                {q.customerName}
              </button>
            ))}
          </div>
        )}

        {/* Summary cards (filters) */}
        <section aria-label="Summary" className="mt-6">
          <div className="grid gap-2 md:grid-cols-3 md:gap-4">
            {CARDS.map((c, i) => {
              const members = quotes.filter((q) => bucketOf(state, q) === c.id);
              const on = bucket === c.id;
              return (
                <Rise key={c.id} play={intro} delay={200 + i * 60}>
                  <button
                    aria-pressed={on}
                    onClick={() => setBucket(on ? null : c.id)}
                    className={`flex h-full w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-150 md:block md:py-4 ${focusRing} ${on ? "border-accent bg-selected" : "border-line bg-white hover:border-muted"}`}
                  >
                    <span className="text-sm font-medium text-text">{c.label}</span>
                    <span className="flex items-baseline gap-2 md:mt-1 md:block">
                      <span className="block text-lg font-semibold text-text tabular-nums md:text-2xl"><CountTo value={members.length} format={String} /></span>
                      <span className="text-xs text-muted tabular-nums"><CountTo value={members.reduce((s, q) => s + q.amountPence, 0)} format={formatPounds} step={100} /></span>
                    </span>
                  </button>
                </Rise>
              );
            })}
          </div>
          <div className="mt-2 flex justify-end">
            <button aria-pressed={!bucket} onClick={() => setBucket(null)} className={`min-h-11 rounded-lg px-3 text-sm font-medium ${focusRing} ${!bucket ? "text-accent" : "text-muted hover:bg-white hover:text-text"}`}>
              All quotes <span className="tabular-nums">({quotes.length})</span>
            </button>
          </div>
        </section>

        {/* List */}
        <div className="mt-2 overflow-hidden rounded-xl border border-line bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
            <label className="relative w-full md:w-auto md:flex-1">
              <span className="sr-only">Search quotes</span>
              <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer, registration or work"
                className={`min-h-11 w-full rounded-lg border border-line bg-white pr-3 pl-9 text-sm text-text placeholder:text-muted hover:border-muted transition-[border-color,box-shadow] duration-[120ms] focus:border-accent focus:ring-2 focus:ring-accent/15 focus:outline-none`}
              />
            </label>
            <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted md:flex-none">
              <span className="sr-only md:not-sr-only">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={`min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-text md:w-auto ${focusRing}`}>
                <option value="all">All statuses</option>
                {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted md:flex-none">
              <span className="sr-only md:not-sr-only">Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-text md:w-auto ${focusRing}`}>
                {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          </div>
          <p className="sr-only" aria-live="polite">{visible.length} {visible.length === 1 ? "quote" : "quotes"} shown{filtered ? " with filters" : ""}</p>

          {visible.length === 0 ? (
            empty
          ) : (
            <>
              {/* Table (≥768px). Scrolls sideways inside its own container if needed. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="border-b border-line text-left text-xs text-muted">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">Customer &amp; vehicle</th>
                      <th scope="col" className="px-4 py-3 font-medium">Work</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Quote value</th>
                      <th scope="col" className="px-4 py-3 font-medium">Status</th>
                      <th scope="col" className="px-4 py-3 font-medium">Follow-up</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((q) => {
                      const st = statusOf(state, q);
                      const fu = followUpFor(state, q);
                      const on = selected === q.id;
                      return (
                        <tr
                          key={q.id}
                          data-row={q.id}
                          onClick={(e) => !(e.target as HTMLElement).closest("button, a") && open(q.id)}
                          className={`hover-x4 h-20 cursor-pointer border-b border-line transition-colors last:border-0 ${on ? "bg-selected shadow-[inset_3px_0_0_var(--color-accent)]" : "hover:bg-canvas"}`}
                        >
                          <td className="px-4 py-3 align-middle">
                            <PlateLabel reg={q.registration} />
                            <button data-row-open={q.id} aria-current={on ? "true" : undefined} onClick={() => open(q.id)} className={`mt-1 block max-w-[220px] truncate text-left font-medium text-text hover:underline ${focusRing}`} title={q.customerName}>
                              {q.customerName}
                            </button>
                            <div className="max-w-[220px] truncate text-xs text-muted">{q.vehicle || "Vehicle not recorded"}</div>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <span className="line-clamp-2 max-w-[320px] text-text">{q.job}</span>
                            {staffReason(state, q) && <span className="mt-1 block max-w-[320px] text-xs text-attention">{staffReason(state, q)}</span>}
                          </td>
                          <td className="px-4 py-3 text-right align-middle font-medium text-text tabular-nums">{formatPounds(q.amountPence)}</td>
                          <td className="px-4 py-3 align-middle"><StatusLabel tone={st.tone}>{st.label}</StatusLabel></td>
                          <td className={`px-4 py-3 align-middle whitespace-nowrap ${followTone(fu)}`}>{fu.label}</td>
                          <td className="px-4 py-3 text-right align-middle">{action(q)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Cards (<768px) */}
              <ul className="divide-y divide-line md:hidden">
                {visible.map((q) => {
                  const st = statusOf(state, q);
                  const fu = followUpFor(state, q);
                  const on = selected === q.id;
                  return (
                    <li key={q.id} data-row={q.id} className={`hover-x4 p-4 ${on ? "bg-selected shadow-[inset_3px_0_0_var(--color-accent)]" : ""}`}>
                      <div className="flex items-center justify-between gap-3">
                        <PlateLabel reg={q.registration} />
                        <span className="font-semibold text-text tabular-nums">{formatPounds(q.amountPence)}</span>
                      </div>
                      <button data-row-open={q.id} aria-current={on ? "true" : undefined} onClick={() => open(q.id)} className={`mt-2 block max-w-full truncate text-left font-medium text-text ${focusRing}`}>{q.customerName}</button>
                      <p className="line-clamp-2 text-sm text-muted">{q.job}</p>
                      {staffReason(state, q) && <p className="mt-1 text-xs text-attention">{staffReason(state, q)}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <StatusLabel tone={st.tone}>{st.label}</StatusLabel>
                        <span className={followTone(fu)}>{fu.label === "—" ? "No follow-up scheduled" : fu.label}</span>
                      </div>
                      <div className="mt-3">{action(q, true)}</div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>

      {selected && (
        <QuotePanel
          key={selected}
          quoteId={selected}
          animateIn={enter}
          onClose={close}
          onSaved={(id) => setFlash({ id, n: (flash?.n ?? 0) + 1 })}
          hasNext={!!next}
          onNext={() => next && open(next.id)}
        />
      )}
      <AddQuoteDrawer
        open={adding}
        onClose={() => {
          setAdding(false);
          addBtn.current?.focus({ preventScroll: true });
        }}
        onSaved={(q) => {
          setAdding(false);
          clearFilters();
          setFlash({ id: q.id, n: (flash?.n ?? 0) + 1 });
          requestAnimationFrame(() => [...document.querySelectorAll<HTMLElement>(`[data-row-open="${q.id}"]`)].find((el) => el.offsetParent)?.focus());
        }}
        onShowExisting={open}
      />
    </div>
  );
}
