"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { confirmBooking, formatPounds, reconcileSend, resolveTask } from "@/domain/engine";
import { formatLondon } from "@/domain/time";
import type { StaffTask, TaskKind } from "@/domain/types";
import { REPLY_PRESETS } from "@/demo/seed";
import { useAction, useDemo } from "@/demo/store";
import { ActionButton } from "./ActionButton";
import { quoteRow } from "./quoteRows";
import { Button, Icon, InlineFeedback, inputClass, Plate } from "./ui";

const KIND: Record<TaskKind, { label: string; handoff: string }> = {
  booking_request: { label: "Wants to book", handoff: "Agree a slot with the customer by phone or text. It only becomes a booking when you confirm it here." },
  price_question: { label: "Price question", handoff: "Pricing is the garage's decision. Reply to the customer yourself." },
  complaint: { label: "Complaint", handoff: "Handle it personally. No automated text goes to this customer meanwhile." },
  repair_or_safety: { label: "Repair or safety question", handoff: "A technician must answer this, never an automated text." },
  general_reply: { label: "Reply", handoff: "Read it and decide whether follow-ups should continue." },
  ambiguous_match: { label: "Which quote?", handoff: "This number has several open quotes. All are paused until you confirm which job the customer means." },
  unmatched_reply: { label: "Unknown number", handoff: "No open quote for this number. Check who it is." },
  opt_out_notice: { label: "Opted out", handoff: "Already applied. This number won't be texted again. No reply needed." },
  reconcile_send: { label: "Check send", handoff: "The SMS provider timed out. Check its log and record what happened. Nothing is resent automatically." },
};

// In-app links set this before navigating: the #hash isn't in the URL yet when Replies first renders.
let queuedReply: string | null = null;
export const queueReply = (taskId: string) => {
  queuedReply = taskId;
};

/** "Wants to book" is an open request (signal outline); "Booking confirmed" is a done fact (solid ink with a check). */
function KindMark({ t }: { t: StaffTask }) {
  const { state } = useDemo();
  const q = t.quoteIds.length === 1 ? state.quotes.find((x) => x.id === t.quoteIds[0]) : undefined;
  if (q?.booking === "confirmed") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-white">
        <Icon name="check" className="h-3 w-3" /> Booking confirmed
      </span>
    );
  }
  if (t.kind === "booking_request") {
    return <span className="inline-flex items-center gap-1 rounded border border-signal px-1.5 py-0.5 text-[11px] font-semibold text-signal"><Icon name="calendar" className="h-3 w-3" /> Wants to book</span>;
  }
  const red = t.kind === "opt_out_notice" || t.kind === "complaint" || t.kind === "repair_or_safety" || t.kind === "reconcile_send";
  return <span className={`text-[11px] font-semibold ${red ? "text-red-700" : "text-slate-600"}`}>{KIND[t.kind].label}</span>;
}

function Conversation({ task }: { task: StaffTask }) {
  const { state } = useDemo();
  const trigger = task.messageId ? state.messages.find((m) => m.id === task.messageId) : undefined;
  const msgs = state.messages
    .filter(
      (m) =>
        (m.direction === "outbound" && m.quoteId && task.quoteIds.includes(m.quoteId) && ["sent", "delivered", "needs_reconciliation"].includes(m.status ?? "")) ||
        (m.direction === "inbound" && (m.id === trigger?.id || (m.matchedQuoteIds ?? []).some((id) => task.quoteIds.includes(id)))),
    )
    .sort((a, b) => Date.parse(a.sentAt ?? a.createdAt) - Date.parse(b.sentAt ?? b.createdAt));
  if (!msgs.length) return <p className="text-sm text-slate-500">No messages yet.</p>;
  return (
    <ol className="space-y-3">
      {msgs.map((m) => {
        const out = m.direction === "outbound";
        return (
          <li key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%]">
              <div className={`rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug ${out ? "rounded-br-sm bg-graphite text-white" : "rounded-bl-sm border border-steel-line bg-white text-ink"}`}>{m.body}</div>
              <div className={`mt-1 text-[11px] text-slate-500 tabular-nums ${out ? "text-right" : ""}`}>
                {formatLondon(m.sentAt ?? m.createdAt)}, {out ? `follow-up ${m.step}${m.approvedBy?.startsWith("Automatic") ? ", sent automatically" : ""}` : "customer"}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Detail({ t, onBack }: { t: StaffTask; onBack: () => void }) {
  const { state, staff, act, notify } = useDemo();
  const heading = useRef<HTMLHeadingElement>(null);
  const quotes = t.quoteIds.map((id) => state.quotes.find((q) => q.id === id)!).filter(Boolean);
  const q = quotes.length === 1 ? quotes[0] : undefined;
  const row = q ? quoteRow(state, q) : undefined;
  const reply = t.messageId ? state.messages.find((m) => m.id === t.messageId && m.direction === "inbound") : undefined;
  const who = [...new Set(quotes.map((x) => x.customerName))].join(", ") || reply?.fromPhone || "Unknown number";
  const paused = quotes.some((x) => x.unresolvedReply && x.status === "open");

  useEffect(() => heading.current?.focus({ preventScroll: true }), [t.id]);

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-steel-line/70 px-5 pt-4 pb-4">
        <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-ink focus-visible:outline-2 focus-visible:outline-signal lg:hidden">
          <Icon name="back" className="h-3.5 w-3.5" /> All replies
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 ref={heading} tabIndex={-1} className="text-xl leading-tight font-bold break-words text-ink outline-none [font-stretch:115%]">{who}</h2>
            <div className="mt-1.5"><KindMark t={t} /></div>
          </div>
          {q && (
            <div className="text-right">
              <div className="text-2xl font-extrabold text-ink tabular-nums [font-stretch:115%]">{formatPounds(q.amountPence)}</div>
              <div className="text-xs text-slate-500">quoted</div>
            </div>
          )}
        </div>
        {quotes.map((x) => (
          <Link key={x.id} href="/quotes" className="mt-3 flex items-center gap-3 rounded-md border border-steel-line px-3 py-2 text-sm transition-colors hover:border-steel focus-visible:outline-2 focus-visible:outline-signal">
            <Plate reg={x.registration} ghost />
            <span className="min-w-0 flex-1 truncate text-ink">{x.customerJobDescription || x.job}</span>
            <span className="shrink-0 text-xs text-slate-500">{x.sourceQuoteId}</span>
          </Link>
        ))}
      </div>

      {/* Follow-up state for the linked quote(s). */}
      {paused ? (
        <div role="status" className="flex items-center gap-2 bg-graphite px-5 py-2.5 text-sm text-white">
          <Icon name="pause" className="h-4 w-4 text-signal" />
          <span className="font-semibold">Follow-ups paused</span>
          <span className="text-steel">until this reply is handled.</span>
        </div>
      ) : row ? (
        <div className="bg-work px-5 py-2.5 text-sm text-slate-700">{row.next}</div>
      ) : null}

      <div className="flex-1 px-5 py-5"><Conversation task={t} /></div>

      <div className="border-t border-steel-line/70 bg-work px-5 py-4">
        <div className={`border-l-[3px] pl-3 ${t.status === "open" ? "border-signal" : "border-ink"}`}>
          <div className="text-sm font-semibold text-ink">{t.status === "open" ? `Handed to staff: ${KIND[t.kind].label.toLowerCase()}` : "Handled"}</div>
          <p className="mt-0.5 text-sm text-slate-600">{t.status === "open" ? KIND[t.kind].handoff : t.resolution}</p>
        </div>
        {t.status === "open" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {t.kind === "booking_request" && q?.status === "open" && (
              <ActionButton
                variant="primary"
                label="Slot agreed: confirm booking"
                onRun={() => act((s) => confirmBooking(s, q.id, staff))}
                success="Booking confirmed"
                onDone={() => notify(`Booking confirmed for ${q.customerName}. Follow-ups stopped.`, [q.id])}
              />
            )}
            {t.kind === "reconcile_send" && (
              <>
                <ActionButton label="Provider log shows it was sent" onRun={() => act((s) => reconcileSend(s, t.messageId!, "was_sent"))} success="Recorded as sent" />
                <ActionButton label="It was not sent" onRun={() => act((s) => reconcileSend(s, t.messageId!, "not_sent"))} success="Recorded as not sent" />
              </>
            )}
            {t.kind === "opt_out_notice" && <ActionButton label="Acknowledge" onRun={() => act((s) => resolveTask(s, t.id, "resume", staff))} success="Acknowledged" />}
            {t.kind !== "opt_out_notice" && t.kind !== "reconcile_send" && (
              <>
                <ActionButton variant={t.kind === "booking_request" ? "secondary" : "primary"} label="Handled: resume follow-ups" onRun={() => act((s) => resolveTask(s, t.id, "resume", staff))} success="Follow-ups resumed" />
                <ActionButton label="Handled: stop follow-ups" onRun={() => act((s) => resolveTask(s, t.id, "stop", staff))} success="Follow-ups stopped" />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SimulateInbound() {
  const { state, garageId, simulateReply } = useDemo();
  const [from, setFrom] = useState(state.quotes[0]?.phone ?? "");
  const [body, setBody] = useState("");
  const send = useAction();
  return (
    <details className="group border-t border-steel-line/70">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-700 hover:text-ink focus-visible:outline-2 focus-visible:outline-signal">
        <span className="rounded border border-dashed border-steel px-1.5 py-0.5 text-[11px] text-slate-600">Demo</span> Simulate an incoming text
      </summary>
      <div className="space-y-2 px-4 pb-4">
        <label htmlFor="sim-from" className="sr-only">From</label>
        <select id="sim-from" className={inputClass()} value={from} onChange={(e) => setFrom(e.target.value)}>
          {state.quotes.filter((q) => q.garageId === garageId).map((q) => (
            <option key={q.id} value={q.phone}>{q.customerName} ({q.phone})</option>
          ))}
          <option value="+447700900199">Unknown number (+447700900199)</option>
        </select>
        <div className="flex flex-wrap gap-1.5">
          {REPLY_PRESETS.map((p) => (
            <Button key={p.label} size="sm" onClick={() => setBody(p.body)}>{p.label}</Button>
          ))}
        </div>
        <label htmlFor="sim-body" className="sr-only">Message text</label>
        <textarea id="sim-body" className={inputClass()} rows={2} placeholder="Message text" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" disabled={send.pending} onClick={() => send.run(() => { if (!body.trim()) throw new Error("type or pick a message first"); simulateReply(from, body.trim()); setBody(""); }, "Received")}>
            Receive text
          </Button>
          <InlineFeedback feedback={send.feedback} />
        </div>
      </div>
    </details>
  );
}

export function RepliesView() {
  const { state, garageId, act } = useDemo();
  const [selected, setSelected] = useState<string | null>(() => queuedReply ?? (window.location.hash.slice(1) || null));
  const tasks = state.tasks.filter((t) => t.garageId === garageId);
  // Newest first; reading one doesn't re-sort the list under the cursor.
  const open = tasks.filter((t) => t.status === "open").sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const handled = tasks.filter((t) => t.status === "resolved").sort((a, b) => Date.parse(b.resolvedAt!) - Date.parse(a.resolvedAt!));
  const unread = open.filter((t) => !t.readAt).length;
  const paused = state.quotes.filter((q) => q.garageId === garageId && q.status === "open" && q.unresolvedReply).length;
  const current = tasks.find((t) => t.id === selected);

  const select = (id: string) => {
    setSelected(id);
    const t = state.tasks.find((x) => x.id === id);
    if (t && !t.readAt) act((s) => (s.tasks.find((x) => x.id === id)!.readAt = s.now));
  };

  useEffect(() => {
    queuedReply = null;
    if (selected) {
      const t = state.tasks.find((x) => x.id === selected);
      if (t && !t.readAt) act((s) => (s.tasks.find((x) => x.id === selected)!.readAt = s.now));
    }
    // Only on arrival from a link, not on every selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const item = (t: StaffTask) => {
    const q = t.quoteIds.length === 1 ? state.quotes.find((x) => x.id === t.quoteIds[0]) : undefined;
    const msg = t.messageId ? state.messages.find((m) => m.id === t.messageId) : undefined;
    const isUnread = t.status === "open" && !t.readAt;
    const on = selected === t.id;
    return (
      <li key={t.id}>
        <button
          onClick={() => select(t.id)}
          aria-current={on ? "true" : undefined}
          className={`relative block w-full border-l-[3px] px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal ${on ? "border-l-signal bg-signal/[0.06]" : "border-l-transparent hover:bg-work"}`}
        >
          <span className="flex items-baseline gap-2">
            <span aria-hidden className={`h-2 w-2 shrink-0 self-center rounded-full ${isUnread ? "bg-signal" : "bg-transparent"}`} />
            <span className={`min-w-0 flex-1 truncate text-[15px] text-ink ${isUnread ? "font-semibold" : "font-medium"}`}>{q?.customerName ?? msg?.fromPhone ?? "Unknown"}</span>
            {isUnread && <span className="sr-only">(unread)</span>}
            <span className="shrink-0 text-xs text-slate-500 tabular-nums">{formatLondon(t.createdAt)}</span>
          </span>
          <span className="mt-0.5 block truncate pl-4 text-sm text-slate-600">{msg?.direction === "inbound" ? `“${msg.body}”` : t.summary}</span>
          <span className="mt-1 block pl-4"><KindMark t={t} /></span>
        </button>
      </li>
    );
  };

  return (
    <>
      <section aria-labelledby="replies-title" className="bg-graphite text-white">
        <div className="mx-auto max-w-6xl px-4 pt-6 pb-7 sm:pt-10">
          <h1 id="replies-title" className="text-[clamp(2rem,5vw,3.5rem)] leading-[0.95] font-extrabold tracking-[-0.02em] [font-stretch:125%]">
            {open.length ? `${open.length} ${open.length === 1 ? "reply needs" : "replies need"} a person` : "Inbox clear"}
          </h1>
          <p className="mt-3 max-w-[62ch] text-steel">
            <span className="text-white tabular-nums">{unread}</span> unread. Follow-ups paused for <span className="text-white tabular-nums">{paused}</span> {paused === 1 ? "quote" : "quotes"} while replies wait. STOP is applied before anything else.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-0 py-0 sm:px-4 sm:py-6">
        <div className="grid min-h-[560px] grid-cols-[minmax(0,1fr)] overflow-hidden border-steel-line bg-white sm:rounded-md sm:border lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* List: always on desktop; on phones only when nothing is open (drill-down). */}
          <nav aria-label="Conversations" className={`border-steel-line/70 lg:border-r ${current ? "hidden lg:block" : ""}`}>
            {open.length === 0 && <p className="px-4 py-6 text-sm text-slate-600">No replies waiting. When a customer texts back, it lands here and their follow-ups pause.</p>}
            <ul className="divide-y divide-steel-line/70">{open.map(item)}</ul>
            {handled.length > 0 && (
              <>
                <h2 className="border-y border-steel-line/70 bg-work px-4 py-1.5 text-xs font-medium text-slate-600">Handled</h2>
                <ul className="divide-y divide-steel-line/70">{handled.map(item)}</ul>
              </>
            )}
            <SimulateInbound />
          </nav>

          <section aria-label="Conversation" className={current ? "" : "hidden lg:block"}>
            {current ? (
              <Detail key={current.id} t={current} onBack={() => setSelected(null)} />
            ) : (
              <div className="grid h-full place-items-center px-6 py-16 text-center text-sm text-slate-500">Choose a conversation to read it and take the next step.</div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
