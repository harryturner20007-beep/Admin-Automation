"use client";

import Link from "next/link";
import { useState } from "react";
import { formatPounds, reconcileSend } from "@/domain/engine";
import { GATE_REASON_TEXT, type GateReason } from "@/domain/gate";
import { INVOICE_STEP_LABEL, invoiceView, markInvoicePaid, PAYMENT_TERMS_DAYS, setInvoiceChasePaused, type InvoiceState } from "@/domain/invoices";
import { INVOICE_REMINDER_DAYS } from "@/domain/schedule";
import { daysBetween, formatLondon, formatLondonDate, ukDate } from "@/domain/time";
import type { Invoice } from "@/domain/types";
import { useAction, useDemo } from "@/demo/store";
import { ActionButton } from "./ActionButton";
import { CountTo, Rise } from "./motion";
import { Button, Icon, InlineFeedback, PlateLabel, StatusLabel, type StatusTone } from "./ui";

type Filter = "unpaid" | "overdue" | "paid";
const CARDS: { id: Filter; label: string; match: (s: InvoiceState) => boolean }[] = [
  { id: "unpaid", label: "Unpaid", match: (s) => s !== "paid" },
  { id: "overdue", label: "Overdue", match: (s) => s === "overdue" || s === "needs_call" },
  { id: "paid", label: "Paid", match: (s) => s === "paid" },
];
const STATUS: Record<InvoiceState, { label: string; tone: StatusTone }> = {
  unpaid: { label: "Unpaid", tone: "neutral" },
  overdue: { label: "Overdue", tone: "attention" },
  needs_call: { label: "Call customer", tone: "attention" },
  paid: { label: "Paid", tone: "success" },
};
const RANK: Record<InvoiceState, number> = { needs_call: 0, overdue: 1, unpaid: 2, paid: 3 };
const MODE_TEXT = { off: "Off: no invoice texts", draft: "Draft: you approve each text", automatic: "Automatic: texts send on schedule" } as const;
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const dayLabel = (ymd: string) => formatLondonDate(`${ymd}T12:00:00Z`).replace(/^\w+ /, ""); // "18 Nov"

function InvoiceItem({ inv }: { inv: Invoice }) {
  const { state, staff, act, actUndoable, undo, approveAndSend } = useDemo();
  const [paidHere, setPaidHere] = useState(false);
  const undoPaid = useAction();
  const q = state.quotes.find((x) => x.id === inv.quoteId)!;
  const v = invoiceView(state, inv);
  const status = STATUS[v.state];
  const today = ukDate(state.now);
  const late = inv.status === "unpaid" && today > inv.dueDate ? daysBetween(inv.dueDate, today) : 0;
  const draft = v.pending?.status === "awaiting_approval" ? v.pending : undefined;

  return (
    <li className="p-4 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <PlateLabel reg={q.registration} />
            <span className="text-sm font-semibold text-text">{inv.number}</span>
            <StatusLabel tone={status.tone}>{status.label}</StatusLabel>
          </div>
          <p className="mt-1.5 text-sm text-text">
            <span className="font-medium">{q.customerName}</span> · {q.customerJobDescription || q.job}
          </p>
          <p className="mt-0.5 text-xs text-muted tabular-nums">
            Issued {formatLondon(inv.issuedAt)} · {inv.status === "paid" ? `Paid ${formatLondon(inv.paidAt!)}` : late ? `Due ${dayLabel(inv.dueDate)}, ${late} day${late === 1 ? "" : "s"} overdue` : `Due ${dayLabel(inv.dueDate)}`}
          </p>
        </div>
        <span className="text-lg font-semibold text-text tabular-nums">{formatPounds(inv.amountPence)}</span>
      </div>

      {inv.status === "unpaid" && <p className={`mt-2 text-sm ${v.state === "needs_call" ? "font-medium text-attention" : "text-muted"}`}>{v.next}</p>}

      {draft && (
        <div className="mt-2 rounded-lg bg-canvas px-3 py-2 text-sm text-text">
          <span className="mb-1 block text-xs font-medium text-muted">{INVOICE_STEP_LABEL[draft.invoiceStep ?? 0]} to {q.customerName}</span>
          {draft.body}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {draft && (
          <ActionButton
            variant="primary"
            label="Approve & send (mock SMS)"
            onRun={() => approveAndSend(draft.id)}
            success={(r) => {
              const s = (r as { outcome: string; reasons?: GateReason[] }[])[0];
              if (s?.outcome === "sent") return "Sent through the mock SMS provider";
              if (s?.outcome === "needs_reconciliation") return "Provider timed out; marked for checking";
              const reasons = s?.reasons ?? [];
              if (reasons.includes("before_window")) return "Approved. It sends when the garage next opens.";
              return `Held back: ${reasons.map((x) => GATE_REASON_TEXT[x]?.toLowerCase()).join(", ")}`;
            }}
          />
        )}
        {v.recon && (
          <>
            <ActionButton label="It was sent" onRun={() => act((s) => reconcileSend(s, v.recon!.id, "was_sent"))} success="Recorded as sent" />
            <ActionButton label="It was not sent" onRun={() => act((s) => reconcileSend(s, v.recon!.id, "not_sent"))} success="Recorded as not sent" />
          </>
        )}
        {inv.status === "unpaid" && (
          <>
            <ActionButton
              label="Mark paid"
              onRun={() => {
                actUndoable((s) => markInvoicePaid(s, inv.id, staff));
                setPaidHere(true);
              }}
              success="Marked paid. Reminders stopped."
            />
            <Button variant="ghost" size="sm" onClick={() => act((s) => setInvoiceChasePaused(s, inv.id, !inv.chasePaused, staff))}>
              <Icon name="pause" /> {inv.chasePaused ? "Resume reminders" : "Pause reminders"}
            </Button>
            <a href={`tel:${q.phone}`} className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted hover:bg-canvas hover:text-text ${focusRing}`}>
              <Icon name="phone" /> Call customer
            </a>
          </>
        )}
        {inv.status === "paid" && paidHere && (
          <>
            <span role="status" className="text-sm font-medium text-success">Marked paid.</span>
            <Button size="sm" disabled={undoPaid.pending} onClick={() => undoPaid.run(() => { undo(); setPaidHere(false); }, "Undone")}>
              <Icon name="undo" /> Undo
            </Button>
            <InlineFeedback feedback={undoPaid.feedback?.ok ? null : undoPaid.feedback} />
          </>
        )}
      </div>
    </li>
  );
}

export function InvoicesView() {
  const { state, garageId } = useDemo();
  const [filter, setFilter] = useState<Filter | null>(null);
  const garage = state.garages.find((g) => g.id === garageId)!;
  const all = state.invoices
    .filter((i) => i.garageId === garageId)
    .map((inv) => ({ inv, st: invoiceView(state, inv).state }))
    .sort((a, b) => RANK[a.st] - RANK[b.st] || b.inv.issuedAt.localeCompare(a.inv.issuedAt));
  const card = CARDS.find((c) => c.id === filter);
  const shown = card ? all.filter((x) => card.match(x.st)) : all;

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-[28px] leading-tight font-[650] text-text">Invoices</h1>
      <p className="mt-1 text-sm text-muted">
        Recording a job complete raises its invoice and texts it to the customer. Unpaid invoices get reminders {INVOICE_REMINDER_DAYS[1]} and {INVOICE_REMINDER_DAYS[2]} days after the invoice date. Payment is due in {PAYMENT_TERMS_DAYS} days.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-line bg-white px-4 py-2 text-sm text-muted">
        <span>
          Texts: <span className="font-medium text-text">{MODE_TEXT[garage.mode]}</span>
        </span>
        <span className="rounded border border-dashed border-muted/60 px-1.5 py-0.5 text-xs text-text" title="In this demo, invoice texts go to the mock SMS provider. No real texts are sent and no payment is taken.">Simulated sending</span>
        <span>Mark invoices paid here when the customer pays at the garage or by transfer.</span>
        <Link href="/settings" className={`ml-auto inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-accent hover:bg-canvas hover:text-accent-hover ${focusRing}`}>Settings</Link>
      </div>

      <section aria-label="Summary" className="mt-6 grid gap-2 md:grid-cols-3 md:gap-4">
        {CARDS.map((c, i) => {
          const members = all.filter((x) => c.match(x.st));
          const on = filter === c.id;
          return (
            <Rise key={c.id} delay={i * 60}>
              <button
                aria-pressed={on}
                onClick={() => setFilter(on ? null : c.id)}
                className={`flex h-full w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-150 md:block md:py-4 ${focusRing} ${on ? "border-accent bg-selected" : "border-line bg-white hover:border-muted"}`}
              >
                <span className="text-sm font-medium text-text">{c.label}</span>
                <span className="flex items-baseline gap-2 md:mt-1 md:block">
                  <span className="block text-lg font-semibold text-text tabular-nums md:text-2xl"><CountTo value={members.length} format={String} /></span>
                  <span className="text-xs text-muted tabular-nums"><CountTo value={members.reduce((s, x) => s + x.inv.amountPence, 0)} format={formatPounds} step={100} /></span>
                </span>
              </button>
            </Rise>
          );
        })}
      </section>
      <div className="mt-2 flex justify-end">
        <button aria-pressed={!filter} onClick={() => setFilter(null)} className={`min-h-11 rounded-lg px-3 text-sm font-medium ${focusRing} ${!filter ? "text-accent" : "text-muted hover:bg-white hover:text-text"}`}>
          All invoices <span className="tabular-nums">({all.length})</span>
        </button>
      </div>

      <div className="mt-2 overflow-hidden rounded-xl border border-line bg-white">
        {shown.length ? (
          <ul className="divide-y divide-line">
            {shown.map(({ inv }) => <InvoiceItem key={inv.id} inv={inv} />)}
          </ul>
        ) : all.length ? (
          <Rise className="px-6 py-12 text-center">
            <h2 className="text-lg font-semibold text-text">No invoices here</h2>
            <p className="mt-1 text-sm text-muted">Nothing fits this filter right now.</p>
            <Button className="mt-4" variant="secondary" onClick={() => setFilter(null)}>View all invoices</Button>
          </Rise>
        ) : (
          <Rise className="px-6 py-12 text-center">
            <h2 className="text-lg font-semibold text-text">No invoices yet</h2>
            <p className="mt-1 text-sm text-muted">Invoices appear here when a booked job is recorded complete on the Quotes page.</p>
            <Link href="/quotes" className={`mt-4 inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-medium text-text ring-1 ring-line ring-inset hover:bg-canvas ${focusRing}`}>Go to Quotes</Link>
          </Rise>
        )}
      </div>
    </div>
  );
}
