"use client";
// Pieces shared by Quotes, Jobs and Invoices: the progress strip that links the records of one piece of
// work, the itemised charges editor and its totals.

import Link from "next/link";
import { Fragment, useState } from "react";
import { progressFor } from "@/domain/jobs";
import { chargeErrors, lineTotal, totals } from "@/domain/money";
import { formatPounds } from "@/domain/templates";
import type { AppState, Charges, Line, LineKind, Totals } from "@/domain/types";
import { Button, Icon, inputClass } from "./ui";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
export const money = (p: number) => `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Quote → Job booked → Job completed → Invoice issued → Paid, with links to whichever records exist. */
export function Progress({ state, quoteId, here }: { state: AppState; quoteId: string; here: "quote" | "job" | "invoice" }) {
  const p = progressFor(state, quoteId);
  const href = (id: string) =>
    id === "quote" ? `/quotes?quote=${quoteId}` : id === "booked" || id === "completed" ? (p.jobId ? `/jobs?job=${p.jobId}` : null) : p.invoiceId ? `/invoices?invoice=${p.invoiceId}` : null;
  const isHere = (id: string) => (here === "quote" ? id === "quote" : here === "job" ? id === "booked" || id === "completed" : id === "issued" || id === "paid");
  return (
    <nav aria-label="Progress" className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs">
      {p.steps.map((s, i) => {
        const to = href(s.id);
        const body = (
          <>
            <span aria-hidden className={`grid h-4 w-4 place-items-center rounded-full ${s.done ? "bg-accent text-white" : "border border-line bg-white"}`}>{s.done && <Icon name="check" className="h-3 w-3" />}</span>
            <span className={s.done ? "font-medium text-text" : "text-muted"}>{s.label}</span>
            <span className="sr-only">{s.done ? " (done)" : " (not yet)"}</span>
          </>
        );
        return (
          <Fragment key={s.id}>
            {i > 0 && <span aria-hidden className={`h-px w-3 ${s.done ? "bg-accent" : "bg-line"}`} />}
            {to && !isHere(s.id) ? (
              <Link href={to} className={`inline-flex min-h-8 items-center gap-1 rounded px-1 underline-offset-2 hover:underline ${focusRing}`}>{body}</Link>
            ) : (
              <span className="inline-flex min-h-8 items-center gap-1 px-1" aria-current={isHere(s.id) ? "step" : undefined}>{body}</span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

export function TotalsTable({ t, vatRatePercent }: { t: Totals; vatRatePercent: number }) {
  const row = (k: string, v: string, strong = false) => (
    <div className={`flex justify-between gap-4 ${strong ? "border-t border-line pt-2 text-base font-semibold text-text" : "text-muted"}`}>
      <dt>{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
  return (
    <dl className="ml-auto w-full max-w-64 space-y-1 text-sm">
      {row("Subtotal", money(t.subtotalPence))}
      {t.discountPence > 0 && row("Discount", `−${money(t.discountPence)}`)}
      {vatRatePercent > 0 && row(`VAT at ${vatRatePercent}%`, money(t.vatPence))}
      {row("Total", money(t.totalPence), true)}
    </dl>
  );
}

// ---------- charges editor ----------

type Row = { id: string; kind: LineKind; description: string; quantity: string; unit: string };
const toRow = (l: Line): Row => ({ id: l.id, kind: l.kind, description: l.description, quantity: String(l.quantity), unit: (l.unitPence / 100).toFixed(2) });
const pence = (s: string) => {
  const v = s.trim().replace(/^£/, "").replace(/,/g, "");
  return /^\d+(\.\d{1,2})?$/.test(v) ? Math.round(Number(v) * 100) : NaN;
};

export type ChargesDraft = { rows: Row[]; discount: string; vat: number };
export const draftFromCharges = (c: Charges): ChargesDraft => ({ rows: c.lines.map(toRow), discount: c.discountPence ? (c.discountPence / 100).toFixed(2) : "", vat: c.vatRatePercent });
/** Parse the editor's text fields. Invalid numbers become NaN and are reported by chargeErrors. */
export const chargesFromDraft = (d: ChargesDraft): Charges => ({
  lines: d.rows.map((r) => ({ id: r.id, kind: r.kind, description: r.description, quantity: Number(r.quantity), unitPence: pence(r.unit) })),
  discountPence: d.discount.trim() ? pence(d.discount) : 0,
  vatRatePercent: d.vat,
});

/** Itemised parts and labour with quantities, prices, discount and VAT. The caller keeps the draft, so
 *  nothing typed is lost when a save fails. */
export function ChargesEditor({ value, onChange, idPrefix }: { value: ChargesDraft; onChange: (d: ChargesDraft) => void; idPrefix: string }) {
  const [n, setN] = useState(value.rows.length + 1);
  const set = (i: number, patch: Partial<Row>) => onChange({ ...value, rows: value.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const charges = chargesFromDraft(value);
  const ok = chargeErrors(charges).length === 0;
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {value.rows.map((r, i) => {
          const id = `${idPrefix}-${r.id}`;
          const amount = lineTotal({ quantity: Number(r.quantity), unitPence: pence(r.unit) });
          return (
            <li key={r.id} className="min-w-0 space-y-3 rounded-lg border border-line p-3">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-sm font-medium text-text" htmlFor={`${id}-kind`}><span className="sr-only">Line {i + 1} </span>Type</label>
                  <select id={`${id}-kind`} value={r.kind} onChange={(e) => set(i, { kind: e.target.value as LineKind })} className={`${inputClass()} min-w-0`}>
                    <option value="labour">Labour</option>
                    <option value="part">Part</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <button
                  type="button"
                  aria-label={`Remove line ${i + 1}`}
                  disabled={value.rows.length === 1}
                  onClick={() => onChange({ ...value, rows: value.rows.filter((_, j) => j !== i) })}
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-canvas disabled:opacity-40 ${focusRing}`}
                >
                  <Icon name="close" />
                </button>
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-medium text-text" htmlFor={`${id}-desc`}><span className="sr-only">Line {i + 1} </span>Description</label>
                <textarea id={`${id}-desc`} rows={3} value={r.description} placeholder="Describe the work or part" onChange={(e) => set(i, { description: e.target.value })} className={`${inputClass()} block min-w-0 resize-y py-2`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label className="mb-1 block text-sm font-medium text-text" htmlFor={`${id}-qty`}><span className="sr-only">Line {i + 1} </span>Quantity</label>
                  <input id={`${id}-qty`} inputMode="decimal" value={r.quantity} onChange={(e) => set(i, { quantity: e.target.value })} className={`${inputClass()} min-w-0 text-right tabular-nums`} />
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block text-sm font-medium text-text" htmlFor={`${id}-unit`}><span className="sr-only">Line {i + 1} </span>Unit price (£{value.vat ? ", ex VAT" : ""})</label>
                  <input id={`${id}-unit`} inputMode="decimal" value={r.unit} onChange={(e) => set(i, { unit: e.target.value })} className={`${inputClass()} min-w-0 text-right tabular-nums`} />
                </div>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-muted">Line total{value.vat ? " (ex VAT)" : ""}</span>
                <span className="font-medium text-text tabular-nums">{Number.isFinite(amount) ? money(amount) : "—"}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          onChange({ ...value, rows: [...value.rows, { id: `n${n}`, kind: "part", description: "", quantity: "1", unit: "" }] });
          setN(n + 1);
        }}
      >
        <Icon name="plus" /> Add line
      </Button>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm text-text">
          <span className="mb-1 block font-medium">Discount (£)</span>
          <input inputMode="decimal" value={value.discount} placeholder="0.00" onChange={(e) => onChange({ ...value, discount: e.target.value })} className={`${inputClass()} w-32 text-right tabular-nums`} />
        </label>
        <label className="text-sm text-text">
          <span className="mb-1 block font-medium">VAT</span>
          <select value={value.vat} onChange={(e) => onChange({ ...value, vat: Number(e.target.value) })} className={`${inputClass()} w-44`}>
            <option value={20}>20% standard</option>
            <option value={5}>5% reduced</option>
            <option value={0}>No VAT</option>
          </select>
        </label>
      </div>
      {ok ? <TotalsTable t={totals(charges)} vatRatePercent={charges.vatRatePercent} /> : <p className="text-sm text-muted">Totals show once every line has a description, quantity and price.</p>}
    </div>
  );
}

export { formatPounds };
