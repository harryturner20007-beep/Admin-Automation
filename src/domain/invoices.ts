// Invoicing for completed jobs. Recording a job complete raises the invoice and drafts the invoice text;
// while it stays unpaid, payment reminders go 7 and 14 days after the invoice date. Texts use the same
// pipeline as follow-ups (Off / Draft / Automatic mode, opening hours, opt-outs, pause, provider claim).
import { AUTOMATIC_APPROVER, insertOutboundOnce, log, newId } from "./engine";
import { checkInvoiceGate, isSuppressed, type GateReason } from "./gate";
import { invoiceSendKey, invoiceWindow } from "./schedule";
import { formatPounds, templateValues } from "./templates";
import { addDaysYmd, formatLondon, formatLondonDate, ukDate } from "./time";
import { chargeErrors, netOfVat, totals } from "./money";
import type { AppState, FollowUpMode, Garage, Invoice, InvoiceContent, InvoiceStep, Message, Quote, Totals } from "./types";

export const PAYMENT_TERMS_DAYS = 7;
export const INVOICE_STEP_LABEL: Record<InvoiceStep, string> = { 0: "Invoice text", 1: "Payment reminder 1", 2: "Payment reminder 2" };

/** What an outbound text is, in staff terms ("Follow-up 1", "Invoice text", "Payment reminder 2"). */
export const messageLabel = (m: Message) => (m.invoiceId ? INVOICE_STEP_LABEL[m.invoiceStep ?? 0] : m.step ? `Follow-up ${m.step}` : "Text");

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

const invoiceOf = (state: AppState, invoiceId: string) => {
  const inv = state.invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new Error("Invoice not found");
  return inv;
};

/** Next unused number in the garage's series. Numbers are never reused, even for cancelled invoices. */
function allocateNumber(state: AppState, garage: Garage): string {
  const b = garage.business;
  const used = new Set(state.invoices.filter((i) => i.garageId === garage.id).map((i) => i.number));
  const fmt = (n: number) => `${b.invoicePrefix}${String(n).padStart(4, "0")}`;
  let n = b.nextInvoiceNumber;
  while (used.has(fmt(n))) n++;
  b.nextInvoiceNumber = n + 1;
  return fmt(n);
}

const sellerOf = (garage: Garage): InvoiceContent["seller"] => {
  const { nextInvoiceNumber: _n, invoicePrefix: _p, ...seller } = garage.business;
  return structuredClone(seller);
};

/**
 * Create the invoice draft for a completed job, filled from the job's final charges, the quote's customer
 * and vehicle, and the garage's business details. One per job: a second call returns the existing invoice.
 * Drafts are never chased.
 */
export function createInvoiceDraft(state: AppState, jobId: string, staffName: string): Invoice {
  const job = state.jobs.find((j) => j.id === jobId);
  if (!job || job.status !== "completed" || !job.final) throw new Error("Only completed jobs can be invoiced");
  const existing = state.invoices.find((i) => i.jobId === jobId && i.status !== "cancelled");
  if (existing) return existing;
  const q = state.quotes.find((x) => x.id === job.quoteId)!;
  const garage = state.garages.find((g) => g.id === job.garageId)!;
  const { extraWorkReason, extraWorkAuthorisation: _a, completionNotes: _c, ...charges } = job.final;
  const content: InvoiceContent = {
    ...structuredClone(charges),
    seller: sellerOf(garage),
    customer: { name: q.customerName, address: q.billingAddress ?? "", phone: q.phone, email: q.email ?? "" },
    vehicle: { registration: q.registration ?? "", description: q.vehicle },
    supplyDate: ukDate(job.completedAt!),
    currency: "GBP",
    paymentTermsDays: garage.business.paymentTermsDays,
    paymentInstructions: garage.business.paymentInstructions,
    notes: extraWorkReason ? `Includes additional work: ${extraWorkReason}` : "",
    jobNumber: job.number,
  };
  const t = totals(content);
  const inv: Invoice = {
    id: newId(state, "inv"),
    garageId: job.garageId,
    quoteId: q.id,
    jobId: job.id,
    number: "",
    amountPence: t.totalPence,
    issuedAt: state.now,
    dueDate: addDaysYmd(ukDate(state.now), content.paymentTermsDays),
    status: "draft",
    chasePaused: false,
    content,
    totals: t,
  };
  state.invoices.push(inv);
  log(state, job.garageId, "invoice_draft", `${staffName} created the invoice draft for ${job.number} (${formatPounds(t.totalPence)})`, q.id, { jobId: job.id, invoiceId: inv.id });
  return inv;
}

/**
 * The printable content of any invoice. Invoices raised before itemised invoices existed hold only a
 * total: they print as one summary line from the quote, with the garage's details as they are now.
 */
export function invoiceContentFor(state: AppState, inv: Invoice): { content: InvoiceContent; totals: Totals; legacy: boolean } {
  if (inv.content) return { content: inv.content, totals: inv.totals ?? totals(inv.content), legacy: false };
  const q = state.quotes.find((x) => x.id === inv.quoteId)!;
  const garage = state.garages.find((g) => g.id === inv.garageId)!;
  const vat = garage.business.vatRatePercent;
  const content: InvoiceContent = {
    lines: [{ id: "l1", kind: "other", description: q.customerJobDescription || q.job, quantity: 1, unitPence: vat ? netOfVat(inv.amountPence, vat) : inv.amountPence }],
    discountPence: 0,
    vatRatePercent: vat,
    seller: sellerOf(garage),
    customer: { name: q.customerName, address: q.billingAddress ?? "", phone: q.phone, email: q.email ?? "" },
    vehicle: { registration: q.registration ?? "", description: q.vehicle },
    supplyDate: ukDate(q.completedAt ?? inv.issuedAt),
    currency: "GBP",
    paymentTermsDays: garage.business.paymentTermsDays,
    paymentInstructions: garage.business.paymentInstructions,
    notes: "",
    jobNumber: "",
  };
  return { content, totals: totals(content), legacy: true };
}

/** Edit a draft. Issued invoices are frozen; correct them by cancelling and re-drafting. */
export function updateInvoiceDraft(state: AppState, invoiceId: string, content: InvoiceContent, staffName: string) {
  const inv = invoiceOf(state, invoiceId);
  if (inv.status !== "draft") throw new Error("Only drafts can be edited. Cancel the invoice to correct it.");
  const errors = chargeErrors(content);
  if (errors.length) throw new Error(errors.join(". "));
  inv.content = structuredClone(content);
  inv.totals = totals(content);
  inv.amountPence = inv.totals.totalPence;
  log(state, inv.garageId, "invoice_edit", `${staffName} edited the invoice draft (${formatPounds(inv.amountPence)})`, inv.quoteId, { jobId: inv.jobId, invoiceId: inv.id });
}

/**
 * What must be filled in before a draft can be issued (GOV.UK invoice rules; VAT Notice 700 s.16 when VAT
 * is charged). Checked against the garage's current business details, which are copied in on issue.
 */
export function issueErrors(state: AppState, inv: Invoice): string[] {
  const c = inv.content;
  if (!c) return ["This invoice has no content to issue"];
  const b = state.garages.find((g) => g.id === inv.garageId)!.business;
  const errors = chargeErrors(c);
  if (!b.tradingName.trim() && !b.legalName.trim()) errors.push("Add your business name in Settings");
  if (!b.address.trim()) errors.push("Add your business address in Settings");
  if (c.vatRatePercent > 0 && !b.vatNumber.trim()) errors.push("Add your VAT registration number in Settings, or set VAT to 0%");
  if (!c.customer.name.trim()) errors.push("Add the customer's name");
  if (!c.customer.address.trim()) errors.push("Add the customer's billing address");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.supplyDate)) errors.push("Add the date the work was done");
  return errors;
}

/**
 * Issue a draft: copy in the current business details, allocate the next number, fix the totals and due
 * date, and freeze the content. Chasing starts here (the invoice text, if invoice texts are on).
 * Safe to repeat: an invoice that is already issued is returned unchanged.
 */
export function issueDraftInvoice(state: AppState, invoiceId: string, staffName: string): Invoice {
  const inv = invoiceOf(state, invoiceId);
  if (inv.status !== "draft") {
    if (inv.status === "cancelled") throw new Error("This invoice was cancelled");
    return inv;
  }
  const errors = issueErrors(state, inv);
  if (errors.length) throw new Error(errors.join(". "));
  const garage = state.garages.find((g) => g.id === inv.garageId)!;
  inv.content = { ...inv.content!, seller: sellerOf(garage) };
  inv.totals = totals(inv.content);
  inv.amountPence = inv.totals.totalPence;
  inv.number = allocateNumber(state, garage);
  inv.issuedAt = state.now;
  inv.issuedBy = staffName;
  inv.dueDate = addDaysYmd(ukDate(state.now), inv.content.paymentTermsDays);
  inv.status = "unpaid";
  log(state, inv.garageId, "invoice", `${staffName} issued invoice ${inv.number} to ${inv.content.customer.name} (${formatPounds(inv.amountPence)}), due ${dayText(inv.dueDate)}`, inv.quoteId, { jobId: inv.jobId, invoiceId: inv.id });
  draftInvoiceText(state, inv);
  return inv;
}

/**
 * Withdraw an unpaid issued invoice with a reason. It keeps its number and history, pending texts stop,
 * and (by default) a new draft with the same content is created to correct and re-issue.
 */
export function cancelInvoice(state: AppState, invoiceId: string, reason: string, staffName: string, redraft = true): Invoice | null {
  const inv = invoiceOf(state, invoiceId);
  if (inv.status === "paid") throw new Error("A paid invoice can't be cancelled. Record a refund or credit note with your accountant.");
  if (inv.status === "draft") throw new Error("Drafts don't need cancelling. Edit the draft instead.");
  if (inv.status === "cancelled") return null;
  if (!reason.trim()) throw new Error("Give a reason for cancelling");
  inv.status = "cancelled";
  inv.cancelledAt = state.now;
  inv.cancelReason = reason.trim();
  for (const m of state.messages) {
    if (m.invoiceId === inv.id && PENDING.has(m.status ?? "")) {
      m.status = "cancelled";
      m.statusReasons = ["invoice_not_issued"];
    }
  }
  log(state, inv.garageId, "invoice_cancelled", `${staffName} cancelled invoice ${inv.number}: ${inv.cancelReason}`, inv.quoteId, { jobId: inv.jobId, invoiceId: inv.id });
  if (!redraft || !inv.content) return null;
  const draft: Invoice = {
    ...structuredClone(inv),
    id: newId(state, "inv"),
    number: "",
    status: "draft",
    issuedAt: state.now,
    issuedBy: undefined,
    cancelledAt: undefined,
    cancelReason: undefined,
    chasePaused: false,
    replacesId: inv.id,
  };
  state.invoices.push(draft);
  log(state, inv.garageId, "invoice_draft", `${staffName} created a corrected draft to replace ${inv.number}`, inv.quoteId, { jobId: inv.jobId, invoiceId: draft.id });
  return draft;
}

export type InvoiceReportItem = { invoiceId: string; quoteId: string; customerName: string; step: InvoiceStep; outcome: "drafted" | "blocked"; reasons: GateReason[]; messageId?: string };

/**
 * Draft the next invoice text that is due, at most one per call. Unlike follow-ups, a text whose window
 * was missed moves to the next opening rather than expiring: the bill still needs to reach the customer.
 */
export function draftInvoiceText(state: AppState, inv: Invoice): InvoiceReportItem | null {
  const garage = state.garages.find((g) => g.id === inv.garageId)!;
  const q = state.quotes.find((x) => x.id === inv.quoteId)!;
  if (inv.status !== "unpaid" || garage.invoiceMode === "off") return null;
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

    const auto = garage.invoiceMode === "automatic";
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

/** Scheduler part for invoices: draft whatever text is due on issued, unpaid invoices. Drafts are skipped. */
export function runInvoiceCheck(state: AppState, onlyGarageIds?: string[]): InvoiceReportItem[] {
  const included = (garageId: string) => !onlyGarageIds || onlyGarageIds.includes(garageId);
  return state.invoices.filter((i) => included(i.garageId)).flatMap((i) => draftInvoiceText(state, i) ?? []);
}

export function markInvoicePaid(state: AppState, invoiceId: string, staffName: string) {
  const inv = state.invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new Error("Invoice not found");
  if (inv.status === "paid") throw new Error("This invoice is already marked paid");
  if (inv.status !== "unpaid") throw new Error("Only issued invoices can be marked paid");
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

export const INVOICE_MODE_LABEL: Record<FollowUpMode, string> = { off: "Off", draft: "Draft for approval", automatic: "Automatic" };

/**
 * How invoice texts and payment reminders go out, separately from quote follow-ups.
 * Automatic approves invoice texts already waiting. Off holds them (the send gate blocks them) without
 * cancelling, so turning texts back on picks up where it left off. Sent texts are untouched.
 */
export function setInvoiceMode(state: AppState, garageId: string, mode: FollowUpMode, staffName: string) {
  const garage = state.garages.find((g) => g.id === garageId)!;
  garage.invoiceMode = mode;
  for (const m of state.messages) {
    if (m.garageId !== garageId || !m.invoiceId || !PENDING.has(m.status ?? "")) continue;
    if (mode === "automatic" && m.status === "awaiting_approval") {
      m.status = "approved";
      m.approvedBy = AUTOMATIC_APPROVER;
      m.approvedAt = state.now;
    }
  }
  log(state, garageId, "settings", `${staffName} set invoice texts to ${INVOICE_MODE_LABEL[mode]}`);
}

// ---------- read model ----------

export type InvoiceState = "draft" | "cancelled" | "paid" | "unpaid" | "overdue" | "needs_call";
export type InvoiceView = {
  state: InvoiceState;
  pending?: Message;
  recon?: Message;
  next: string;
  texts: Message[];
  scheduled?: { step: InvoiceStep; at: string }; // the next invoice text and when it is due (for the calendar)
};

/** Where an invoice stands and what happens next, in staff terms. */
export function invoiceView(state: AppState, inv: Invoice): InvoiceView {
  const garage = state.garages.find((g) => g.id === inv.garageId)!;
  const q = state.quotes.find((x) => x.id === inv.quoteId)!;
  const texts = state.messages.filter((m) => m.invoiceId === inv.id).sort((a, b) => (a.invoiceStep ?? 0) - (b.invoiceStep ?? 0));
  const sent = (step: InvoiceStep) => texts.some((m) => m.invoiceStep === step && SENT.has(m.status ?? ""));
  const pending = texts.find((m) => PENDING.has(m.status ?? ""));
  const recon = texts.find((m) => m.status === "needs_reconciliation");
  if (inv.status === "paid") return { state: "paid", next: `Paid ${formatLondon(inv.paidAt!)}`, texts };
  if (inv.status === "draft") return { state: "draft", next: issueErrors(state, inv)[0] ?? "Ready to issue", texts };
  if (inv.status === "cancelled") return { state: "cancelled", next: `Cancelled ${formatLondon(inv.cancelledAt!)}: ${inv.cancelReason}`, texts };

  const st: InvoiceState = sent(2) ? "needs_call" : ukDate(state.now) > inv.dueDate ? "overdue" : "unpaid";
  const base = { state: st, pending, recon, texts };
  if (isSuppressed(state.suppressions, garage.id, q.phone)) return { ...base, next: "Opted out of texts. Call the customer." };
  const failed = texts.find((m) => m.status === "failed" || m.status === "cancelled" || m.status === "expired");
  if (failed) return { ...base, next: `${INVOICE_STEP_LABEL[failed.invoiceStep ?? 0]} wasn't sent. Call the customer.` };
  if (recon) return { ...base, next: `${INVOICE_STEP_LABEL[recon.invoiceStep ?? 0]} may not have sent. Check the provider log.` };
  if (pending) {
    const label = INVOICE_STEP_LABEL[pending.invoiceStep ?? 0];
    const scheduled = { step: pending.invoiceStep ?? 0, at: pending.windowStart! };
    return { ...base, scheduled, next: pending.status === "awaiting_approval" ? `${label} waiting for your approval` : `${label} queued to send ${formatLondon(pending.windowStart!)}` };
  }
  if (sent(2)) return { ...base, next: "Both reminders sent. Call the customer." };
  if (garage.invoiceMode === "off") return { ...base, next: "Invoice texts are off" };
  if (garage.paused) return { ...base, next: "Sending is paused for the garage" };
  if (!sent(0)) return { ...base, next: "Invoice text goes at the next check" };
  if (inv.chasePaused) return { ...base, next: "Reminders paused" };
  const step = sent(1) ? 2 : 1;
  const w = invoiceWindow(inv.issuedAt, garage, step);
  if (!w) return { ...base, next: "No reminder can be scheduled (garage never open)" };
  return { ...base, scheduled: { step, at: w.windowStart }, next: `${INVOICE_STEP_LABEL[step]} due ${formatLondon(w.windowStart)}` };
}
