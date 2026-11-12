"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { confirmBooking, formatPounds } from "@/domain/engine";
import { formatLondon, londonParts } from "@/domain/time";
import type { Quote } from "@/domain/types";
import { useAction, useDemo } from "@/demo/store";
import { ActionButton } from "./ActionButton";
import { AddQuoteDrawer } from "./AddQuoteDrawer";
import { QuoteDetails } from "./QuoteDetails";
import { FILTERS, matchesSearch, quoteRow, type FilterId, type QuoteRow } from "./quoteRows";
import { queueReply } from "./RepliesView";
import { Button, Icon, InlineFeedback, Plate } from "./ui";

const EMPTY: Record<FilterId, string> = {
  action: "Nothing needs you right now. Drafts, replies and booking requests land here.",
  due: "No follow-ups due today. The next ones appear here on the morning they're due.",
  upcoming: "No follow-ups coming up. Quotes with SMS consent get two, 2 and 5 business days after they're sent.",
  closed: "No closed quotes yet. Booked, declined, expired and opted-out quotes end up here.",
  all: "No quotes yet. Add one the garage has already sent.",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Inline link-button used inside the headline's "Today" sentence. */
const countLink = "font-semibold text-white underline decoration-signal decoration-2 underline-offset-4 transition-colors hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

const MODE_LABEL = { off: "Off", draft: "Draft for approval", automatic: "Automatic" } as const;

function AutomationReadout({ onShowDrafts }: { onShowDrafts: () => void }) {
  const { state, garageId, runCheck } = useDemo();
  const garage = state.garages.find((g) => g.id === garageId)!;
  const check = useAction();
  const drafts = state.messages.filter((m) => m.garageId === garageId && m.status === "awaiting_approval").length;
  const light = garage.mode === "off" ? "bg-white/25" : garage.mode === "automatic" ? "bg-signal" : "bg-white";
  return (
    <div className="border-t border-white/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 text-sm text-steel">
        <span className="flex items-center gap-2.5 text-white">
          <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${light}`} />
          <span>
            Follow-ups: <span className="font-semibold">{MODE_LABEL[garage.mode]}</span>
          </span>
        </span>
        {/* Dashed outline = simulated, everywhere in the app. */}
        <span className="rounded border border-dashed border-white/35 px-1.5 py-0.5 text-xs text-white" title="Checks run every 15 minutes of demo-clock time, standing in for the scheduler. Texts go to the mock SMS provider.">
          {garage.mode === "automatic" ? "Simulated sending" : "Simulated checks"}
        </span>
        <span>
          Last run <span className="text-white tabular-nums">{garage.lastCheckAt ? formatLondon(garage.lastCheckAt) : "never"}</span>
        </span>
        {drafts > 0 ? (
          <button onClick={onShowDrafts} className={countLink}>{plural(drafts, "draft")} awaiting approval</button>
        ) : (
          <span>No drafts awaiting approval</span>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <InlineFeedback feedback={check.feedback?.ok ? null : check.feedback} onDark />
          <Link href="/settings" className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-slate-200 ring-1 ring-white/20 ring-inset transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-signal">
            <Icon name="sliders" className="h-3.5 w-3.5" />
            Follow-up settings
          </Link>
          <Button size="sm" variant="onDark" disabled={check.pending || garage.mode === "off"} aria-busy={check.pending} onClick={() => check.run(runCheck, "done")}>
            <Icon name="refresh" className="h-3.5 w-3.5" />
            {check.pending ? "Checking…" : "Run check now"}
          </Button>
        </span>
      </div>
    </div>
  );
}

/** Status in words, not a pill: urgent states in ink, stopped in red, confirmed with a check. */
function StatusText({ r }: { r: QuoteRow }) {
  const tone = r.status.tone === "red" ? "text-red-700" : r.status.tone === "green" ? "text-ink" : r.needsAction ? "text-ink" : "text-slate-600";
  return (
    <span className={`flex items-center gap-1.5 text-sm font-medium ${tone}`}>
      {r.status.tone === "green" && <Icon name="check" className="h-3.5 w-3.5 text-signal" />}
      {r.status.tone === "red" && <Icon name="pause" className="h-3.5 w-3.5" />}
      {r.status.label}
    </span>
  );
}

function PrimaryAction({ row, onOpen }: { row: QuoteRow; onOpen: () => void }) {
  const { act, staff, notify } = useDemo();
  const { kind, label } = row.primary;
  if (kind === "confirm") {
    return (
      <ActionButton
        variant="primary"
        label={label}
        onRun={() => act((s) => confirmBooking(s, row.q.id, staff))}
        success="Booking confirmed"
        onDone={() => notify(`Booking confirmed for ${row.q.customerName}. Follow-ups stopped.`, [row.q.id])}
      />
    );
  }
  if (kind === "reply" && row.replyTask) {
    return (
      <Link
        href={`/replies#${row.replyTask.id}`}
        onClick={() => queueReply(row.replyTask!.id)}
        className="inline-flex items-center rounded-md bg-signal px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white transition-colors hover:bg-signal-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
      >
        {label}
      </Link>
    );
  }
  return row.needsAction ? (
    <Button size="sm" variant="primary" onClick={onOpen}>{label}</Button>
  ) : (
    <Button size="sm" variant="ghost" onClick={onOpen}>Open</Button>
  );
}

// Clicks on buttons/links inside a row shouldn't also open the drawer.
const fromControl = (e: React.MouseEvent) => !!(e.target as HTMLElement).closest("button, a, input, select, textarea");

export function QuotesView() {
  const { state, garageId, notice, notify } = useDemo();
  const [filter, setFilter] = useState<FilterId>("action");
  const [search, setSearch] = useState("");
  // Rows staff touched (or just added) stay put until the filter changes, so the queue doesn't jump mid-task.
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const queueRef = useRef<HTMLDivElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);

  const rows = state.quotes.filter((q) => q.garageId === garageId).map((q) => quoteRow(state, q)).reverse(); // newest first
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, rows.filter(f.test).length])) as Record<FilterId, number>;
  const test = FILTERS.find((f) => f.id === filter)!.test;
  const visible = rows.filter((r) => (test(r) || kept.has(r.q.id)) && matchesSearch(r, search));
  const elsewhere = search ? rows.filter((r) => matchesSearch(r, search)).length - visible.length : 0;

  const now = londonParts(state.now);
  const open = rows.filter((r) => r.q.status === "open" && !r.suppressed);
  const openValue = open.reduce((s, r) => s + r.q.amountPence, 0);
  const due = counts.due;
  const unread = state.tasks.filter((t) => t.garageId === garageId && t.status === "open" && !t.readAt).length;
  const booked = rows.filter((r) => r.q.bookedAt && londonParts(r.q.bookedAt).y === now.y && londonParts(r.q.bookedAt).m === now.m).length;
  const month = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "Europe/London" }).format(new Date(state.now));

  const keep = (id: string) => setKept((k) => (k.has(id) ? k : new Set(k).add(id)));
  const changeFilter = (id: FilterId) => {
    setFilter(id);
    setKept(new Set());
  };
  const jumpTo = (id: FilterId) => {
    changeFilter(id);
    setSearch("");
    queueRef.current?.scrollIntoView({ block: "start" });
  };
  const openQuote = (id: string) => {
    keep(id);
    setAdding(false);
    setSelected(id);
  };
  // Back to the row that was opened; the page itself never scrolled, so the queue position is unchanged.
  const close = useCallback(() => {
    const id = selected;
    setSelected(null);
    const target = [...document.querySelectorAll<HTMLElement>(`[data-row-open="${id}"]`)].find((el) => el.offsetParent);
    target?.focus({ preventScroll: true });
  }, [selected]);
  const closeDrawer = useCallback(() => {
    setAdding(false);
    addBtn.current?.focus({ preventScroll: true });
  }, []);
  const onSaved = (q: Quote) => {
    keep(q.id);
    setSearch("");
    setAdding(false);
    const r = quoteRow(state, q); // state is one render behind, but this quote's own row is computed from it fine
    notify(`Quote ${q.sourceQuoteId} saved for ${q.customerName}. ${q.eligibilityEvidenceRef ? r.next.replace(/^Follow-up 1 on/, "First follow-up on") : "SMS follow-ups are off."}`, [q.id]);
    requestAnimationFrame(() => {
      const btn = [...document.querySelectorAll<HTMLElement>(`[data-row-open="${q.id}"]`)].find((el) => el.offsetParent);
      btn?.closest("li")?.scrollIntoView({ block: "nearest" });
      btn?.focus({ preventScroll: true }); // keyboard users land on the quote they just added
    });
  };
  const flashKey = (id: string) => (notice?.quoteIds.includes(id) ? notice.id : null);

  return (
    <>
      {/* Graphite band: the headline is the open value as a sentence, then today's work as links. */}
      <section aria-labelledby="board-title" className="bg-graphite text-white">
        <div className="mx-auto max-w-6xl px-4 pt-6 pb-6 sm:pt-12 sm:pb-7">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <h1 id="board-title" className="max-w-[16ch] text-[clamp(2.4rem,7vw,4.75rem)] leading-[0.95] font-extrabold tracking-[-0.025em] [font-stretch:125%]">
              <span className="tabular-nums">{formatPounds(openValue)}</span> open across {plural(open.length, "quote")}
            </h1>
            <Button ref={addBtn} variant="signalOnDark" className="px-4 py-2.5 text-[15px]" onClick={() => { setSelected(null); setAdding(true); }}>
              <Icon name="plus" />
              Add quote
            </Button>
          </div>
          <p className="mt-5 max-w-[62ch] text-base leading-relaxed text-steel sm:mt-6 sm:text-lg">
            Today:{" "}
            {due > 0 ? <button className={countLink} onClick={() => jumpTo("due")}>{plural(due, "follow-up")} due</button> : <span className="text-white">no follow-ups due</span>},{" "}
            {unread > 0 ? <Link className={countLink} href="/replies">{plural(unread, "unread reply", "unread replies")}</Link> : <span className="text-white">no unread replies</span>}
            . <span className="text-white tabular-nums">{plural(booked, "booking")}</span> confirmed in {month}.
          </p>
        </div>
        <AutomationReadout onShowDrafts={() => jumpTo("due")} />
      </section>

      {/* Work area: quiet, high-contrast, the queue is the main surface. */}
      <div ref={queueRef} className={`mx-auto max-w-6xl scroll-mt-24 px-4 py-6 ${selected || adding ? "2xl:pr-[496px]" : ""}`}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Filter quotes" className="flex flex-wrap gap-x-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => changeFilter(f.id)}
                className={`shrink-0 border-b-2 px-2.5 pt-1 pb-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-signal ${filter === f.id ? "border-signal text-ink" : "border-transparent text-slate-500 hover:text-ink"}`}
              >
                {f.label} <span className="text-slate-500 tabular-nums">{counts[f.id]}</span>
              </button>
            ))}
          </div>
          <label className="relative ml-auto w-full sm:w-72">
            <span className="sr-only">Search quotes</span>
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Customer, reference or registration"
              className="w-full rounded-md border border-steel-line bg-white py-1.5 pr-3 pl-8 text-sm placeholder:text-slate-400 hover:border-steel focus:border-signal focus:ring-2 focus:ring-signal/15 focus:outline-none"
            />
          </label>
        </div>

        {visible.length === 0 ? (
          <div className="rounded-md border border-dashed border-steel-line bg-white px-6 py-12 text-center text-sm text-slate-600">
            {search ? (
              <>
                Nothing in {FILTERS.find((f) => f.id === filter)!.label} matches “{search}”.
                {elsewhere > 0 && (
                  <button className="ml-1 font-medium text-signal underline underline-offset-2" onClick={() => setFilter("all")}>
                    Show {elsewhere} in All
                  </button>
                )}
              </>
            ) : (
              EMPTY[filter]
            )}
          </div>
        ) : (
          <ul aria-label="Quotes" className="overflow-hidden rounded-md border border-steel-line bg-white">
            {visible.map((r) => {
              const urgent = r.needsAction;
              const fk = flashKey(r.q.id);
              return (
                <li
                  key={r.q.id}
                  onClick={(e) => !fromControl(e) && openQuote(r.q.id)}
                  onClickCapture={() => keep(r.q.id)}
                  className={`relative cursor-pointer border-b border-l-[3px] border-b-steel-line/70 transition-colors last:border-b-0 ${urgent ? "border-l-signal" : "border-l-transparent"} ${selected === r.q.id ? "bg-signal/[0.06]" : "hover:bg-work"}`}
                >
                  {fk !== null && <span key={fk} aria-hidden className="row-flash pointer-events-none absolute inset-0" />}
                  <div
                    className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 px-4 md:grid-cols-[6.75rem_minmax(0,1fr)_6rem_minmax(0,15rem)_9rem] md:items-center md:gap-y-0 ${urgent ? "py-3.5" : "py-2.5"}`}
                  >
                    {/* Plate first, as on a workshop job board (desktop column) */}
                    <div className="hidden md:block"><Plate reg={r.q.registration} ghost /></div>
                    {/* Customer and job */}
                    <div className="min-w-0">
                      {r.q.registration && <div className="mb-1 md:hidden"><Plate reg={r.q.registration} /></div>}
                      <button
                        data-row-open={r.q.id}
                        onClick={() => openQuote(r.q.id)}
                        className={`block max-w-full truncate text-left text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${urgent ? "font-semibold" : "font-medium"}`}
                        title={r.q.customerName}
                      >
                        {r.q.customerName}
                      </button>
                      <div className="mt-0.5 flex min-w-0 items-baseline gap-2 text-sm text-slate-600">
                        <span className="truncate" title={r.q.job}>{r.q.job}</span>
                        <span className="shrink-0 text-xs text-slate-500">{r.q.sourceQuoteId}</span>
                      </div>
                    </div>
                    <div className="row-span-2 self-start text-right text-[17px] font-semibold tabular-nums [font-stretch:110%] md:row-span-1 md:self-center">
                      {formatPounds(r.q.amountPence)}
                    </div>
                    {/* Status and next action */}
                    <div className="min-w-0">
                      <StatusText r={r} />
                      <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{r.next}</div>
                    </div>
                    {/* Routine rows on phones: the whole row opens the quote, so skip the extra "Open" line. */}
                    <div className={urgent ? "col-span-2 mt-1 md:col-span-1 md:mt-0 md:text-right" : "hidden md:block md:text-right"}>
                      <PrimaryAction row={r} onOpen={() => openQuote(r.q.id)} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AddQuoteDrawer open={adding} onClose={closeDrawer} onSaved={onSaved} onShowExisting={openQuote} />
      {selected && <QuoteDetails key={selected} quoteId={selected} onClose={close} />}
    </>
  );
}
