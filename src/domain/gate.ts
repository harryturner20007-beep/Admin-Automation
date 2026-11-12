import type { Garage, Invoice, InvoiceStep, Message, Quote, Suppression, Template } from "./types";
import { hasUnresolved } from "./templates";
import { DAY_MS, HOUR_MS, ukDate } from "./time";

export type GateInput = {
  now: string;
  garage: Garage;
  quote: Quote;
  template: Template | undefined;
  suppressions: Suppression[];
  window: { windowStart: string; windowEnd: string };
  /** The outbound record being sent. Omit when checking whether to draft. */
  message?: Message;
};

export type GateReason =
  | "garage_paused"
  | "quote_paused"
  | "status_not_open"
  | "status_stale"
  | "no_eligibility_evidence"
  | "template_not_approved"
  | "not_staff_approved"
  | "number_suppressed"
  | "quote_expired"
  | "unresolved_reply"
  | "before_window"
  | "window_expired"
  | "revision_changed"
  | "follow_ups_off"
  | "template_unresolved"
  | "reminder_pending"
  | "invoice_settled"
  | "invoice_not_issued"
  | "invoice_paused"
  | "invoice_texts_off";

export const GATE_REASON_TEXT: Record<GateReason, string> = {
  garage_paused: "Garage is paused",
  quote_paused: "Quote is paused",
  status_not_open: "Quote is no longer open",
  status_stale: "Open status not confirmed recently",
  no_eligibility_evidence: "No documented SMS eligibility",
  template_not_approved: "Template not approved",
  not_staff_approved: "Not approved by staff",
  number_suppressed: "Number has opted out",
  quote_expired: "Quote has expired",
  unresolved_reply: "Customer reply not yet resolved",
  before_window: "Send window not open yet",
  window_expired: "Send window has passed",
  revision_changed: "Quote was revised after drafting",
  follow_ups_off: "Follow-ups are switched off for this garage",
  template_unresolved: "Message has a field with no value",
  reminder_pending: "Staff set a reminder for a later date",
  invoice_settled: "Invoice is already paid",
  invoice_not_issued: "Invoice is a draft or was cancelled",
  invoice_paused: "Reminders are paused for this invoice",
  invoice_texts_off: "Invoice texts are switched off for this garage",
};

export function isSuppressed(suppressions: Suppression[], garageId: string, phone: string): boolean {
  return suppressions.some((s) => s.garageId === garageId && s.phone === phone && !s.liftedAt);
}

export function isQuoteExpired(quote: Quote, garage: Garage, now: string): boolean {
  return Date.parse(now) - Date.parse(quote.quoteSentAt) > garage.quoteValidityDays * DAY_MS;
}

/**
 * Pre-send gate. Run when drafting AND again immediately before the provider call.
 * Returns every reason the message must not go; an empty list means it may be sent.
 */
export function checkSendGate(input: GateInput): GateReason[] {
  const { now, garage, quote, template, suppressions, window, message } = input;
  const t = Date.parse(now);
  const reasons: GateReason[] = [];

  if (garage.paused) reasons.push("garage_paused");
  if (garage.mode === "off") reasons.push("follow_ups_off");
  if (quote.paused) reasons.push("quote_paused");
  if (quote.status !== "open") reasons.push("status_not_open");
  // Draft mode asks staff to confirm the quote is still open before a text goes. Automatic mode doesn't: the
  // garage chose hands-off sending, and bookings, declines and replies recorded in the app already stop the chase.
  if (garage.mode !== "automatic" && quote.status === "open" && t - Date.parse(quote.statusConfirmedAt) > garage.statusFreshHours * HOUR_MS)
    reasons.push("status_stale");
  if (!quote.eligibilityEvidenceRef?.trim()) reasons.push("no_eligibility_evidence");
  if (!template?.approved) reasons.push("template_not_approved");
  if (isSuppressed(suppressions, garage.id, quote.phone)) reasons.push("number_suppressed");
  if (isQuoteExpired(quote, garage, now)) reasons.push("quote_expired");
  if (quote.unresolvedReply) reasons.push("unresolved_reply");
  if (quote.reminderDate && ukDate(now) < quote.reminderDate) reasons.push("reminder_pending"); // staff will chase on that date
  if (t < Date.parse(window.windowStart)) reasons.push("before_window");
  if (t >= Date.parse(window.windowEnd)) reasons.push("window_expired");

  if (message) {
    if (!message.approvedAt || !message.approvedBy) reasons.push("not_staff_approved");
    if (hasUnresolved(message.body)) reasons.push("template_unresolved"); // never send a raw {{placeholder}}
    if (message.revision !== quote.revision) reasons.push("revision_changed");
  }
  return reasons;
}

/**
 * Pre-send gate for invoice texts (the invoice and its payment reminders). Same safety rules as follow-ups:
 * garage pause and mode, opt-outs, documented SMS consent, staff or automatic approval, opening-hours window.
 */
export function checkInvoiceGate(input: { now: string; garage: Garage; quote: Quote; invoice: Invoice; step: InvoiceStep; suppressions: Suppression[]; window: { windowStart: string; windowEnd: string }; message?: Message }): GateReason[] {
  const { now, garage, quote, invoice, step, suppressions, window, message } = input;
  const t = Date.parse(now);
  const reasons: GateReason[] = [];
  if (garage.paused) reasons.push("garage_paused");
  if (garage.invoiceMode === "off") reasons.push("invoice_texts_off");
  if (invoice.status === "paid") reasons.push("invoice_settled");
  else if (invoice.status !== "unpaid") reasons.push("invoice_not_issued"); // drafts are never chased
  if (invoice.chasePaused && step > 0) reasons.push("invoice_paused"); // pausing stops reminders, not the invoice itself
  if (quote.unresolvedReply) reasons.push("unresolved_reply"); // the customer replied: staff deal with it before more chasing
  if (!quote.eligibilityEvidenceRef?.trim()) reasons.push("no_eligibility_evidence");
  if (isSuppressed(suppressions, garage.id, quote.phone)) reasons.push("number_suppressed");
  if (t < Date.parse(window.windowStart)) reasons.push("before_window");
  if (t >= Date.parse(window.windowEnd)) reasons.push("window_expired");
  if (message && (!message.approvedAt || !message.approvedBy)) reasons.push("not_staff_approved");
  return reasons;
}
