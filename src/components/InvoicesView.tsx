"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatPounds, reconcileSend } from "@/domain/engine";
import {
  cancelInvoice,
  INVOICE_MODE_LABEL,
  INVOICE_STEP_LABEL,
  invoiceContentFor,
  invoiceText,
  invoiceView,
  issueErrors,
  markInvoicePaid,
  messageLabel,
  setInvoiceChasePaused,
  setInvoiceMode,
  updateInvoiceDraft,
  type InvoiceState,
} from "@/domain/invoices";
import { INVOICE_REMINDER_DAYS } from "@/domain/schedule";
import { daysBetween, formatLondon, formatLondonDate, ukDate } from "@/domain/time";
import type { FollowUpMode, Invoice, InvoiceContent, Totals } from "@/domain/types";
import { useAction, useDemo } from "@/demo/store";
import { ActionButton } from "./ActionButton";
import { CountTo, Rise } from "./motion";
import { PanelSection, SidePanel } from "./SidePanel";
import { SmsComposer } from "./SmsComposer";
import { Button, Field, Icon, InlineFeedback, inputClass, PlateLabel, StatusLabel, type StatusTone } from "./ui";
import { chargesFromDraft, ChargesEditor, draftFromCharges, money, Progress, TotalsTable, type ChargesDraft } from "./workflow";
import { lineTotal } from "@/domain/money";
import { deliveryLabel } from "@/domain/sms";

type Filter = "draft" | "unpaid" | "overdue" | "paid";
const CARDS: { id: Filter; label: string; match: (s: InvoiceState) => boolean }[] = [
  { id: "draft", label: "Drafts to issue", match: (s) => s === "draft" },
  { id: "unpaid", label: "Unpaid", match: (s) => s === "unpaid" || s === "overdue" || s === "needs_call" },
  { id: "overdue", label: "Overdue", match: (s) => s === "overdue" || s === "needs_call" },
  { id: "paid", label: "Paid", match: (s) => s === "paid" },
];
const STATUS: Record<InvoiceState, { label: string; tone: StatusTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  unpaid: { label: "Unpaid", tone: "neutral" },
  overdue: { label: "Overdue", tone: "attention" },
  needs_call: { label: "Call customer", tone: "attention" },
  paid: { label: "Paid", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};
const RANK: Record<InvoiceState, number> = { needs_call: 0, overdue: 1, draft: 2, unpaid: 3, paid: 4, cancelled: 5 };
const MODE_HINT: Record<FollowUpMode, string> = {
  off: "No invoice texts or reminders go out.",
  draft: "Each invoice text and reminder waits for your approval.",
  automatic: "Invoice texts and reminders go on schedule, inside opening hours.",
};
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const dayLabel = (ymd: string) => formatLondonDate(`${ymd}T12:00:00Z`).replace(/^\w+ /, ""); // "18 Nov"
const longDay = (ymd: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ymd}T12:00:00Z`));

export function InvoicesView() {
  const { state, garageId, staff, act, hosted } = useDemo();
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const filter = (CARDS.find((c) => c.id === params.get("filter"))?.id ?? null) as Filter | null;
  const selected = params.get("invoice");
  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
      router.replace(`${path}?${next.toString()}`, { scroll: false });
    },
    [params, path, router],
  );
  const garage = state.garages.find((g) => g.id === garageId)!;
  const all = state.invoices
    .filter((i) => i.garageId === garageId)
    .map((inv) => ({ inv, st: invoiceView(state, inv).state }))
    .sort((a, b) => RANK[a.st] - RANK[b.st] || b.inv.issuedAt.localeCompare(a.inv.issuedAt));
  const card = CARDS.find((c) => c.id === filter);
  const shown = card ? all.filter((x) => card.match(x.st)) : all.filter((x) => x.st !== "cancelled");
  const open = all.find((x) => x.inv.id === selected)?.inv;

  return (
    <div className="desk:flex desk:items-start">
      <div className="min-w-0 flex-1 p-4 md:p-8">
        <h1 className="text-[28px] leading-tight font-[650] text-text">Invoices</h1>
        <p className="mt-1 text-sm text-muted">
          Completing a job creates its invoice draft. Check it and issue it: issuing numbers the invoice, fixes its content and starts payment chasing. Unpaid invoices get reminders {INVOICE_REMINDER_DAYS[1]} and {INVOICE_REMINDER_DAYS[2]} days after the invoice date.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-line bg-white px-4 py-2 text-sm text-muted">
          <label className="flex items-center gap-2">
            Invoice texts
            <select value={garage.invoiceMode} onChange={(e) => act((s) => setInvoiceMode(s, garageId, e.target.value as FollowUpMode, staff))} className={`min-h-11 rounded-lg border border-line bg-white px-3 text-sm font-medium text-text ${focusRing}`}>
              {(Object.keys(INVOICE_MODE_LABEL) as FollowUpMode[]).map((m) => <option key={m} value={m}>{INVOICE_MODE_LABEL[m]}</option>)}
            </select>
          </label>
          <span>{MODE_HINT[garage.invoiceMode]}</span>
          <span className="rounded border border-dashed border-muted/60 px-1.5 py-0.5 text-xs text-text">
            {hosted ? "Text sending not connected: approved texts wait in the queue" : "Simulated sending: no real texts"}
          </span>
        </div>

        <section aria-label="Summary" className="mt-6 grid gap-2 md:grid-cols-4 md:gap-4">
          {CARDS.map((c, i) => {
            const members = all.filter((x) => c.match(x.st));
            const on = filter === c.id;
            return (
              <Rise key={c.id} delay={i * 60}>
                <button
                  aria-pressed={on}
                  onClick={() => setParams({ filter: on ? null : c.id })}
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
        <div className="mt-2 flex justify-end gap-2">
          <button aria-pressed={filter === null} onClick={() => setParams({ filter: null })} className={`min-h-11 rounded-lg px-3 text-sm font-medium ${focusRing} ${!filter ? "text-accent" : "text-muted hover:bg-white hover:text-text"}`}>
            All open and paid <span className="tabular-nums">({all.filter((x) => x.st !== "cancelled").length})</span>
          </button>
        </div>

        <div className="mt-2 overflow-hidden rounded-xl border border-line bg-white">
          {shown.length ? (
            <ul className="divide-y divide-line">
              {shown.map(({ inv, st }) => <InvoiceRow key={inv.id} inv={inv} st={st} selected={inv.id === selected} onOpen={() => setParams({ invoice: inv.id })} />)}
            </ul>
          ) : all.length ? (
            <div className="px-6 py-12 text-center">
              <h2 className="text-lg font-semibold text-text">No invoices here</h2>
              <p className="mt-1 text-sm text-muted">Nothing fits this filter right now.</p>
              <Button className="mt-4" variant="secondary" onClick={() => setParams({ filter: null })}>View all invoices</Button>
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <h2 className="text-lg font-semibold text-text">No invoices yet</h2>
              <p className="mt-1 text-sm text-muted">Complete a job on the Jobs page and its invoice draft appears here.</p>
              <Link href="/jobs" className={`mt-4 inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-medium text-text ring-1 ring-line ring-inset hover:bg-canvas ${focusRing}`}>Go to Jobs</Link>
            </div>
          )}
        </div>
      </div>
      {open && <InvoicePanel key={open.id} inv={open} onClose={() => setParams({ invoice: null })} />}
    </div>
  );
}

function InvoiceRow({ inv, st, selected, onOpen }: { inv: Invoice; st: InvoiceState; selected: boolean; onOpen: () => void }) {
  const { state } = useDemo();
  const q = state.quotes.find((x) => x.id === inv.quoteId)!;
  const v = invoiceView(state, inv);
  const today = ukDate(state.now);
  const late = inv.status === "unpaid" && today > inv.dueDate ? daysBetween(inv.dueDate, today) : 0;
  const action = st === "draft" ? "Review & issue" : v.pending?.status === "awaiting_approval" ? "Approve text" : inv.status === "unpaid" ? "Record payment" : "View";
  return (
    <li className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 md:px-6 ${selected ? "bg-selected shadow-[inset_3px_0_0_var(--color-accent)]" : ""}`}>
      <button onClick={onOpen} className={`min-w-0 flex-1 text-left ${focusRing}`}>
        <span className="flex flex-wrap items-center gap-2">
          <PlateLabel reg={q.registration} />
          <span className="text-sm font-semibold text-text">{inv.number || "Draft"}</span>
          <StatusLabel tone={STATUS[st].tone}>{STATUS[st].label}</StatusLabel>
        </span>
        <span className="mt-1.5 block text-sm text-text"><span className="font-medium">{q.customerName}</span> · {q.customerJobDescription || q.job}</span>
        <span className="mt-0.5 block text-xs text-muted tabular-nums">
          {inv.status === "draft" ? v.next : inv.status === "paid" ? `Paid ${formatLondon(inv.paidAt!)}` : late ? `Due ${dayLabel(inv.dueDate)}, ${late} day${late === 1 ? "" : "s"} overdue` : `Due ${dayLabel(inv.dueDate)}`}
        </span>
      </button>
      <span className="text-lg font-semibold text-text tabular-nums">{formatPounds(inv.amountPence)}</span>
      <Button size="sm" variant={action === "View" ? "ghost" : "primary"} onClick={onOpen}>{action}</Button>
    </li>
  );
}

/** The invoice as the customer will see it (also the draft preview). */
function InvoiceDocument({ content: c, totals, number, issuedAt, dueDate }: { content: InvoiceContent; totals: Totals; number: string; issuedAt: string; dueDate: string }) {
  return (
    <article aria-label="Invoice preview" className="space-y-4 rounded-lg border border-line p-4 text-sm text-text">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-accent">{c.seller.tradingName || c.seller.legalName || "Your business name"}</p>
          <p className="whitespace-pre-line text-xs text-muted">{[c.seller.legalName, c.seller.address, c.seller.vatNumber && `VAT no. ${c.seller.vatNumber}`].filter(Boolean).join("\n") || "Add your business details in Settings"}</p>
        </div>
        <p className="font-semibold">{c.vatRatePercent > 0 ? "VAT invoice" : "Invoice"} {number || "(draft)"}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div><p className="text-muted">Bill to</p><p className="whitespace-pre-line">{[c.customer.name, c.customer.address || "Billing address needed"].join("\n")}</p></div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-2">
          <dt className="text-muted">Date</dt><dd>{longDay(issuedAt.slice(0, 10))}</dd>
          <dt className="text-muted">Supplied</dt><dd>{longDay(c.supplyDate)}</dd>
          <dt className="text-muted">Due</dt><dd>{longDay(dueDate)}</dd>
          {c.vehicle.registration && (<><dt className="text-muted">Vehicle</dt><dd>{c.vehicle.registration}</dd></>)}
        </dl>
      </div>
      <ul className="divide-y divide-line">
        {c.lines.map((l) => (
          <li key={l.id} className="flex justify-between gap-3 py-1.5"><span>{l.description}{l.quantity !== 1 && ` × ${l.quantity}`}</span><span className="tabular-nums">{money(lineTotal(l))}</span></li>
        ))}
      </ul>
      <TotalsTable t={totals} vatRatePercent={c.vatRatePercent} />
      {c.paymentInstructions && <p className="text-xs text-muted">{c.paymentInstructions}</p>}
      {c.notes && <p className="text-xs">{c.notes}</p>}
    </article>
  );
}

function PdfButton({ inv }: { inv: Invoice }) {
  const { state, hosted } = useDemo();
  const make = useAction();
  if (hosted) {
    return (
      <a href={`/api/invoices/${inv.id}/pdf`} className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-text ring-1 ring-line ring-inset hover:bg-canvas ${focusRing}`}>
        <Icon name="download" /> Download PDF
      </a>
    );
  }
  const download = async () => {
    const { buildInvoicePdf } = await import("@/lib/invoicePdf");
    const { content, totals } = invoiceContentFor(state, inv);
    const bytes = await buildInvoicePdf({ number: inv.number, issuedAt: inv.issuedAt, dueDate: inv.dueDate, status: inv.status === "cancelled" ? "cancelled" : "unpaid", content, totals });
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: "application/pdf" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${inv.number}.pdf` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  return (
    <span className="inline-flex items-center gap-2">
      <Button disabled={make.pending} onClick={() => make.run(download, "PDF downloaded")}>
        <Icon name="download" /> {make.pending ? "Making PDF…" : "Download PDF"}
      </Button>
      <InlineFeedback feedback={make.feedback?.ok ? null : make.feedback} />
    </span>
  );
}

function InvoicePanel({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const { state, staff, act, actUndoable, undo, approveAndSend, issueInvoice } = useDemo();
  const q = state.quotes.find((x) => x.id === inv.quoteId)!;
  const v = invoiceView(state, inv);
  const { content, totals, legacy } = invoiceContentFor(state, inv);
  const [paidHere, setPaidHere] = useState(false);
  const [justIssued, setJustIssued] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const undoPaid = useAction();
  const issue = useAction();
  const draftMsg = v.pending?.status === "awaiting_approval" ? v.pending : undefined;
  const isDraft = inv.status === "draft";
  const problems = isDraft ? [...(unsaved ? ["Save your changes to the draft first"] : []), ...issueErrors(state, inv)] : [];
  const replaced = inv.replacesId ? state.invoices.find((i) => i.id === inv.replacesId) : undefined;

  const footer = isDraft ? (
    <div className="space-y-2">
      {problems.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-attention" aria-label="Needed before issue">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <InlineFeedback feedback={issue.feedback?.ok ? null : issue.feedback} />
        <Button variant="primary" data-autofocus disabled={issue.pending || problems.length > 0} onClick={() => issue.run(async () => { await issueInvoice(inv.id); setJustIssued(true); }, "Issued")}>
          {issue.pending ? "Issuing…" : `Issue invoice · ${money(totals.totalPence)}`}
        </Button>
      </div>
    </div>
  ) : justIssued && inv.status === "unpaid" ? (
    // A confirmation, not another action, where the Issue button was: a double-click can't record a payment.
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span role="status" className="mr-auto text-sm font-medium text-success">Issued as {inv.number}. Payment chasing has started.</span>
      <Button size="sm" onClick={() => setJustIssued(false)}>Done</Button>
    </div>
  ) : inv.status === "unpaid" ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <ActionButton variant="primary" size="md" label="Mark paid" onRun={() => { actUndoable((s) => markInvoicePaid(s, inv.id, staff)); setPaidHere(true); }} success="Marked paid. Reminders stopped." />
    </div>
  ) : inv.status === "paid" && paidHere ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span role="status" className="mr-auto text-sm font-medium text-success">Marked paid. Reminders stopped.</span>
      <InlineFeedback feedback={undoPaid.feedback?.ok ? null : undoPaid.feedback} />
      <Button size="sm" disabled={undoPaid.pending} onClick={() => undoPaid.run(() => { undo(); setPaidHere(false); }, "Undone")}><Icon name="undo" /> Undo</Button>
    </div>
  ) : undefined;

  return (
    <SidePanel id="invoice-panel" reg={q.registration} title={`${q.customerName} · ${inv.number || "Invoice draft"}`} onClose={onClose} footer={footer}>
      <div className="space-y-3 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusLabel tone={STATUS[v.state].tone}>{STATUS[v.state].label}</StatusLabel>
          <span className="text-2xl font-semibold text-text tabular-nums">{money(totals.totalPence)}</span>
        </div>
        <Progress state={state} quoteId={q.id} here="invoice" />
        <p className={`text-sm ${v.state === "needs_call" ? "font-medium text-attention" : "text-muted"}`}>{v.next}</p>
        {replaced && <p className="text-xs text-muted">Corrected draft replacing {replaced.number} (cancelled: {replaced.cancelReason}).</p>}
        {legacy && <p className="text-xs text-muted">Issued before itemised invoices: printed as one summary line from the quote.</p>}
        {!isDraft && inv.issuedBy && <p className="text-xs text-muted">Issued {formatLondon(inv.issuedAt)} by {inv.issuedBy}. The issued content can&apos;t be edited.</p>}
        <div className="flex flex-wrap gap-2">{!isDraft && <PdfButton inv={inv} />}</div>
      </div>

      {isDraft ? <DraftEditor inv={inv} onDirty={setUnsaved} /> : (
        <PanelSection title="Invoice">
          <InvoiceDocument content={content} totals={totals} number={inv.number} issuedAt={inv.issuedAt} dueDate={inv.dueDate} />
        </PanelSection>
      )}

      {inv.status === "unpaid" && (
        <PanelSection title="Texts and reminders">
          {draftMsg && (
            <div className="mb-3 rounded-lg bg-canvas px-3 py-2 text-sm text-text">
              <span className="mb-1 block text-xs font-medium text-muted">{INVOICE_STEP_LABEL[draftMsg.invoiceStep ?? 0]} to {q.customerName}</span>
              {draftMsg.body}
              <div className="mt-2">
                <ActionButton
                  variant="primary"
                  label="Approve & send"
                  onRun={() => approveAndSend(draftMsg.id)}
                  success={(r) => {
                    const o = r as { status: string; detail?: string };
                    return o.status === "Pending" ? `Approved. ${o.detail ?? "It sends when the garage next opens."}` : `${o.status}${o.detail ? `: ${o.detail}` : ""}`;
                  }}
                />
              </div>
            </div>
          )}
          {v.recon && (
            <div className="mb-3 flex flex-wrap gap-2">
              <ActionButton label="It was sent" onRun={() => act((s) => reconcileSend(s, v.recon!.id, "was_sent"))} success="Recorded as sent" />
              <ActionButton label="It was not sent" onRun={() => act((s) => reconcileSend(s, v.recon!.id, "not_sent"))} success="Recorded as not sent" />
            </div>
          )}
          <ul className="space-y-1 text-sm">
            {v.texts.map((m) => <li key={m.id} className="text-text">{messageLabel(m)}: <span className="text-muted">{deliveryLabel(m).label}{m.sentAt ? `, ${formatLondon(m.sentAt)}` : ""}{m.deliveryError ? ` (${m.deliveryError})` : ""}</span></li>)}
            {!v.texts.length && <li className="text-muted">No texts yet.</li>}
          </ul>
          <InvoiceTextComposer inv={inv} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => act((s) => setInvoiceChasePaused(s, inv.id, !inv.chasePaused, staff))}><Icon name="pause" /> {inv.chasePaused ? "Resume reminders" : "Pause reminders"}</Button>
            <a href={`tel:${q.phone}`} className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted hover:bg-canvas hover:text-text ${focusRing}`}><Icon name="phone" /> Call customer</a>
          </div>
        </PanelSection>
      )}

      {inv.status === "unpaid" && inv.content && <CancelInvoice inv={inv} />}

      <PanelSection title="History">
        <ol className="space-y-2 text-sm">
          {state.events.filter((e) => e.invoiceId === inv.id || (e.quoteId === q.id && /invoice|payment/i.test(e.kind))).sort((a, b) => b.at.localeCompare(a.at)).map((e) => (
            <li key={e.id}><span className="text-xs text-muted tabular-nums">{formatLondon(e.at)}</span><span className="block text-text">{e.text}</span></li>
          ))}
        </ol>
      </PanelSection>
    </SidePanel>
  );
}

/** Text the customer about this invoice now. It takes the place of the next scheduled invoice text or reminder. */
function InvoiceTextComposer({ inv }: { inv: Invoice }) {
  const { state } = useDemo();
  const q = state.quotes.find((x) => x.id === inv.quoteId)!;
  const garage = state.garages.find((g) => g.id === inv.garageId)!;
  const sent = (step: number) => state.messages.some((m) => m.invoiceId === inv.id && m.invoiceStep === step && ["sent", "delivered"].includes(m.status ?? ""));
  const step = !sent(0) ? 0 : !sent(1) ? 1 : 2;
  const [text, setText] = useState(() => invoiceText(inv, q, garage.business.tradingName || garage.name, step));
  return (
    <details className="mt-3 rounded-lg border border-line p-3">
      <summary className={`min-h-11 cursor-pointer py-2 text-sm font-medium text-accent ${focusRing}`}>Send a text now ({INVOICE_STEP_LABEL[step as 0 | 1 | 2].toLowerCase()})</summary>
      <label htmlFor={`inv-text-${inv.id}`} className="sr-only">Message</label>
      <textarea id={`inv-text-${inv.id}`} rows={4} value={text} onChange={(e) => setText(e.target.value)} className={`${inputClass()} mb-2 leading-relaxed`} />
      <SmsComposer target={{ invoiceId: inv.id }} to={q.phone} value={text} label="Send invoice text" />
    </details>
  );
}

/** Edit the draft. Text the user typed stays in the form if saving fails. */
function DraftEditor({ inv, onDirty }: { inv: Invoice; onDirty: (dirty: boolean) => void }) {
  const { state, staff, act } = useDemo();
  const c = inv.content!;
  const [charges, setCharges] = useState<ChargesDraft>(() => draftFromCharges(c));
  const [customer, setCustomer] = useState(c.customer);
  const [notes, setNotes] = useState(c.notes);
  const [pay, setPay] = useState(c.paymentInstructions);
  const [supply, setSupply] = useState(c.supplyDate);
  const [preview, setPreview] = useState(false);
  const save = useAction();
  const next: InvoiceContent = { ...c, ...chargesFromDraft(charges), customer, notes, paymentInstructions: pay, supplyDate: supply };
  const dirty = JSON.stringify(next) !== JSON.stringify(c);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  const preTotals = invoiceContentFor(state, { ...inv, content: next, totals: undefined }).totals;
  return (
    <>
      <div className="flex gap-1 border-t border-line px-6 pt-4" role="tablist" aria-label="Draft">
        {["Edit draft", "Preview"].map((t, i) => (
          <button key={t} role="tab" aria-selected={preview === !!i} onClick={() => setPreview(!!i)} className={`min-h-11 rounded-lg px-3 text-sm font-medium ${focusRing} ${preview === !!i ? "bg-selected text-accent" : "text-muted hover:bg-canvas"}`}>{t}</button>
        ))}
      </div>
      {preview ? (
        <div className="px-6 py-4"><InvoiceDocument content={next} totals={preTotals} number="" issuedAt={state.now} dueDate={inv.dueDate} /></div>
      ) : (
        <form
          className="space-y-5 px-6 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.run(() => act((s) => updateInvoiceDraft(s, inv.id, next, staff)), "Draft saved");
          }}
        >
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold text-text">Bill to</legend>
            <Field id="bill-name" label="Name"><input id="bill-name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} className={inputClass()} /></Field>
            <Field id="bill-address" label="Billing address" error={customer.address.trim() ? undefined : "Needed before the invoice can be issued"}>
              <textarea id="bill-address" rows={3} value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} className={inputClass(customer.address.trim() ? undefined : "x")} />
            </Field>
            <Field id="bill-email" label="Email" optional><input id="bill-email" type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} className={inputClass()} /></Field>
          </fieldset>
          <Field id="supply-date" label="Date the work was done"><input id="supply-date" type="date" value={supply} onChange={(e) => setSupply(e.target.value)} className={`${inputClass()} w-48 tabular-nums`} /></Field>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-text">Work, parts and labour</h3>
            <ChargesEditor value={charges} onChange={setCharges} idPrefix="inv" />
          </div>
          <Field id="pay-how" label="Payment instructions" hint="Defaults from Settings."><textarea id="pay-how" rows={3} value={pay} onChange={(e) => setPay(e.target.value)} className={inputClass()} /></Field>
          <Field id="inv-notes" label="Notes on the invoice" optional><textarea id="inv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass()} /></Field>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <InlineFeedback feedback={save.feedback} />
            <Button type="submit" disabled={!dirty || save.pending}>{save.pending ? "Saving…" : dirty ? "Save draft" : "Draft saved"}</Button>
          </div>
        </form>
      )}
    </>
  );
}

function CancelInvoice({ inv }: { inv: Invoice }) {
  const { staff, act } = useDemo();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const save = useAction();
  return (
    <PanelSection title="Correct or cancel">
      {!asking ? (
        <Button size="sm" variant="ghost" onClick={() => setAsking(true)}>Cancel and correct this invoice…</Button>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted">{inv.number} stays on record as cancelled and its reminders stop. A new draft with the same details opens for you to correct and issue under a new number.</p>
          <Field id="inv-cancel" label="Reason"><input id="inv-cancel" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass()} /></Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="danger" disabled={save.pending} onClick={() => save.run(() => act((s) => cancelInvoice(s, inv.id, reason, staff)), "Cancelled. Corrected draft created.")}>Cancel invoice</Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>Keep it</Button>
            <InlineFeedback feedback={save.feedback} />
          </div>
        </div>
      )}
    </PanelSection>
  );
}
