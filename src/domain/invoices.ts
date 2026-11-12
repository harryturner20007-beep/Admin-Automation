// Invoicing for completed jobs. Recording a job complete raises the invoice and drafts the invoice text;
// while it stays unpaid, payment reminders go 7 and 14 days after the invoice date. Texts use the same
// pipeline as follow-ups (Off / Draft / Automatic mode, opening hours, opt-outs, pause, provider claim).
import { AUTOMATIC_APPROVER, insertOutboundOnce, log, newId } from "./engine";
import { checkInvoiceGate, isSuppressed, type GateReason } from "./gate";
import { invoiceSendKey, invoiceWindow } from "./schedule";
import { formatPounds, templateValues } from "./templates";
import { addDaysYmd, formatLondon, formatLondonDate, ukDate } from "./time";
import type { AppState, Invoice, InvoiceStep, Message, Quote } from "./types";

export const PAYMENT_TERMS_DAYS = 7;
export const INVOICE_STEP_LABEL: Record<InvoiceStep, string> = { 0: "Invoice text", 1: "Payment reminder 1", 2: "Payment reminder 2" };

/** What an outbound text is, in staff terms ("Follow-up 1", "Invoice text", "Payment reminder 2"). */
export const messageLabel = (m: Message) => (m.invoiceId ? INVOICE_STEP_LABEL[m.invoiceStep ?? 0] : `Follow-up ${m.step}`);

const PENDING = new Set(["awaiting_approval", "approved"]);
const SENT = new Set(["sent", "delivered"]);
const dayText = (ymd: string) => formatLondonDate(`${ymd}T12:00:00Z`);

export function invoiceText(inv: Invoice, q: Quote, garageName: string, step: InvoiceStep): string {
  const v = templateValues(q, { name: garageName });
  const amount = formatPounds(inv.amountPence);
  if (step === 0) return `Hi ${v.first_name}, thanks for choosing ${v.garage_name}. Your invoice ${inv.number} for ${v.job_description} is ${amount}, due by ${dayText(inv.dueDate)}. Reply here with any questions. Reply STOP to opt out.`;
  if (step === 1) return `Hi ${v.first_name}, ${v.garage_name} here. A reminder that invoice ${inv.number} (${amount}) was due on ${dayText(inv.dueDate)}. If you've already paid, thank you, and please ignore this. Reply STOP to opt out.`;
  return `Hi ${v.first_name}, ${v.garage_name} again. Invoice ${inv.number} (${amount}) is still unpaid. Please call us or reply here to arrange payment. Reply STOP to opt out.`;
}

/** Raise the invoice for a completed job (once per quote; a second call returns the existing invoice). */
export function issueInvoice(state: AppState, quoteId: string): Invoice {
  const existing = state.invoices.find((i) => i.quoteId === quoteId);
  if (existing) return existing;
  const q = state.quotes.find((x) => x.id === quoteId);
  if (!q || q.status !== "completed" || !q.jobValuePence) throw new Error("Only completed jobs with a value can be invoiced");
  const n = state.invoices.filter((i) => i.garageId === q.garageId).length + 1;
  const issuedAt = q.completedAt ?? state.now;
  const inv: Invoice = {
    id: newId(state, "inv"),
    garageId: q.garageId,
    quoteId: q.id,
    number: `INV-${String(n).padStart(4, "0")}`,
    amountPence: q.jobValuePence,
    issuedAt,
    dueDate: addDaysYmd(ukDate(issuedAt), PAYMENT_TERMS_DAYS),
    status: "unpaid",
    chasePaused: false,
  };
  state.invoices.push(inv);
  log(state, q.garageId, "invoice", `Invoice ${inv.number} raised for ${q.customerName} (${formatPounds(inv.amountPence)}), due ${dayText(inv.dueDate)}`, q.id);
  return inv;
}

export type InvoiceReportItem = { invoiceId: string; quoteId: string; customerName: string; step: InvoiceStep; outcome: "drafted" | "blocked"; reasons: GateReason[]; messageId?: string };

/**
 * Draft the next invoice text that is due, at most one per call. Unlike follow-ups, a text whose window
 * was missed moves to the next opening rather than expiring: the bill still needs to reach the customer.
 */
export function draftInvoiceText(state: AppState, inv: Invoice): InvoiceReportItem | null {
  const garage = state.garages.find((g) => g.id === inv.garageId)!;
  const q = state.quotes.find((x) => x.id === inv.quoteId)!;
  if (inv.status !== "unpaid" || garage.mode === "off") return null;
  const now = Date.parse(state.now);
  const keyOf = (step: InvoiceStep) => invoiceSendKey(garage.id, inv.id, step);
  const item = (step: InvoiceStep, outcome: InvoiceReportItem["outcome"], reasons: GateReason[], messageId?: string): InvoiceReportItem => ({ invoiceId: inv.id, quoteId: q.id, customerName: q.customerName, step, outcome, reasons, messageId });

  for (const step of [0, 1, 2] as const) {
    const existing = state.messages.find((m) => m.sendKey === keyOf(step));
    if (existing) {
      if (PENDING.has(existing.status ?? "") && now >= Date.parse(existing.windowEnd!)) {
        const w = invoiceWindow(state.now, garage, 0)!;
        existing.windowStart = w.windowStart;
        existing.windowEnd = w.windowEnd;
      }
      if (!SENT.has(existing.status ?? "")) return null; // wait for this one before the next step
      continue;
    }
    const win = invoiceWindow(inv.issuedAt, garage, step);
    if (!win || (step > 0 && now < Date.parse(win.windowStart))) return null; // reminder not due yet; the invoice text is drafted at once and waits for opening
    const next = step === 1 ? invoiceWindow(inv.issuedAt, garage, 2) : null;
    if (next && now >= Date.parse(next.windowStart)) continue; // both reminders overdue: send only the later one
    const live = now >= Date.parse(win.windowEnd) ? invoiceWindow(state.now, garage, 0)! : win;
    const reasons = checkInvoiceGate({ now: state.now, garage, quote: q, invoice: inv, step, suppressions: state.suppressions, window: live }).filter((r) => r !== "before_window");
    if (reasons.length) return item(step, "blocked", reasons);

    const auto = garage.mode === "automatic";
    const msg: Message = {
      id: newId(state, "msg"),
      garageId: garage.id,
      quoteId: q.id,
      direction: "outbound",
      body: invoiceText(inv, q, garage.name, step),
      createdAt: state.now,
      fromPhone: garage.smsNumber,
      toPhone: q.phone,
      invoiceId: inv.id,
      invoiceStep: step,
      revision: q.revision,
      sendKey: keyOf(step),
      windowStart: live.windowStart,
      windowEnd: live.windowEnd,
      ...(auto ? { status: "approved" as const, approvedBy: AUTOMATIC_APPROVER, approvedAt: state.now } : { status: "awaiting_approval" as const }),
    };
    if (!insertOutboundOnce(state, msg)) return null;
    log(state, garage.id, "drafted", `${INVOICE_STEP_LABEL[step]} for ${q.customerName} (${inv.number}) ${auto ? "queued by automatic sending" : "drafted; waiting for staff approval"}`, q.id);
    return item(step, "drafted", [], msg.id);
  }
  return null;
}

/** Scheduler part for invoices: raise any missing invoices for completed jobs, then draft whatever is due. */
export function runInvoiceCheck(state: AppState, onlyGarageIds?: string[]): InvoiceReportItem[] {
  const included = (garageId: string) => !onlyGarageIds || onlyGarageIds.includes(garageId);
  for (const q of state.quotes) {
    if (included(q.garageId) && q.status === "completed" && q.jobValuePence && !state.invoices.some((i) => i.quoteId === q.id)) issueInvoice(state, q.id);
  }
  return state.invoices.filter((i) => included(i.garageId)).flatMap((i) => draftInvoiceText(state, i) ?? []);
}

export function markInvoicePaid(state: AppState, invoiceId: string, staffName: string) {
  const inv = state.invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new Error("Invoice not found");
  if (inv.status === "paid") throw new Error("This invoice is already marked paid");
  inv.status = "paid";
  inv.paidAt = state.now;
  for (const m of state.messages) {
    if (m.invoiceId === inv.id && PENDING.has(m.status ?? "")) {
      m.status = "cancelled";
      m.statusReasons = ["invoice_settled"];
    }
  }
  const q = state.quotes.find((x) => x.id === inv.quoteId);
  log(state, inv.garageId, "invoice_paid", `${staffName} marked invoice ${inv.number} paid (${formatPounds(inv.amountPence)}, ${q?.customerName ?? "customer"})`, inv.quoteId);
}

export function setInvoiceChasePaused(state: AppState, invoiceId: string, paused: boolean, staffName: string) {
  const inv = state.invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new Error("Invoice not found");
  inv.chasePaused = paused;
  log(state, inv.garageId, "invoice_pause", `${staffName} ${paused ? "paused" : "resumed"} payment reminders for invoice ${inv.number}`, inv.quoteId);
}

// ---------- read model ----------

export type InvoiceState = "paid" | "unpaid" | "overdue" | "needs_call";
export type InvoiceView = { state: InvoiceState; pending?: Message; recon?: Message; next: string; texts: Message[] };

/** Where an invoice stands and what happens next, in staff terms. */
export function invoiceView(state: AppState, inv: Invoice): InvoiceView {
  const garage = state.garages.find((g) => g.id === inv.garageId)!;
  const q = state.quotes.find((x) => x.id === inv.quoteId)!;
  const texts = state.messages.filter((m) => m.invoiceId === inv.id).sort((a, b) => (a.invoiceStep ?? 0) - (b.invoiceStep ?? 0));
  const sent = (step: InvoiceStep) => texts.some((m) => m.invoiceStep === step && SENT.has(m.status ?? ""));
  const pending = texts.find((m) => PENDING.has(m.status ?? ""));
  const recon = texts.find((m) => m.status === "needs_reconciliation");
  if (inv.status === "paid") return { state: "paid", next: `Paid ${formatLondon(inv.paidAt!)}`, texts };

  const st: InvoiceState = sent(2) ? "needs_call" : ukDate(state.now) > inv.dueDate ? "overdue" : "unpaid";
  const base = { state: st, pending, recon, texts };
  if (isSuppressed(state.suppressions, garage.id, q.phone)) return { ...base, next: "Opted out of texts. Call the customer." };
  const failed = texts.find((m) => m.status === "failed" || m.status === "cancelled" || m.status === "expired");
  if (failed) return { ...base, next: `${INVOICE_STEP_LABEL[failed.invoiceStep ?? 0]} wasn't sent. Call the customer.` };
  if (recon) return { ...base, next: `${INVOICE_STEP_LABEL[recon.invoiceStep ?? 0]} may not have sent. Check the provider log.` };
  if (pending) {
    const label = INVOICE_STEP_LABEL[pending.invoiceStep ?? 0];
    return { ...base, next: pending.status === "awaiting_approval" ? `${label} waiting for your approval` : `${label} queued to send ${formatLondon(pending.windowStart!)}` };
  }
  if (sent(2)) return { ...base, next: "Both reminders sent. Call the customer." };
  if (garage.mode === "off") return { ...base, next: "Texts are off for this garage" };
  if (garage.paused) return { ...base, next: "Sending is paused for the garage" };
  if (!sent(0)) return { ...base, next: "Invoice text goes at the next check" };
  if (inv.chasePaused) return { ...base, next: "Reminders paused" };
  const step = sent(1) ? 2 : 1;
  const w = invoiceWindow(inv.issuedAt, garage, step);
  return { ...base, next: w ? `${INVOICE_STEP_LABEL[step]} due ${formatLondon(w.windowStart)}` : "No reminder can be scheduled (garage never open)" };
}
