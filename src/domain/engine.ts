// The follow-up engine. Pure TypeScript over an AppState so the same rules run in
// the in-browser demo (Phase 1), against Postgres (Phase 2) and with Twilio (Phase 3).

import type { SmsProvider } from "@/sms/provider";
import { checkInvoiceGate, checkSendGate, GATE_REASON_TEXT, isQuoteExpired, type GateReason } from "./gate";
import { draftInvoiceText, issueInvoice, messageLabel } from "./invoices";
import { classifyReply, CATEGORY_LABEL, isClearOptOut } from "./replies";
import { sendKey, stepWindow } from "./schedule";
import { formatPounds, renderSms, templateValues, type Rendered } from "./templates";
import { formatLondon, formatLondonTime } from "./time";
import type { AppState, Garage, Message, Quote, ReplyCategory, StaffTask, TaskKind, Template } from "./types";

// ---------- helpers ----------

export function newId(state: AppState, prefix: string): string {
  state.seq += 1;
  return `${prefix}_${state.seq}`;
}

export function log(state: AppState, garageId: string, kind: string, text: string, quoteId?: string) {
  state.events.push({ id: newId(state, "ev"), at: state.now, garageId, quoteId, kind, text });
}

function garageOf(state: AppState, garageId: string): Garage {
  const g = state.garages.find((x) => x.id === garageId);
  if (!g) throw new Error(`Unknown garage ${garageId}`);
  return g;
}

function quoteOf(state: AppState, quoteId: string): Quote {
  const q = state.quotes.find((x) => x.id === quoteId);
  if (!q) throw new Error(`Unknown quote ${quoteId}`);
  return q;
}

function templateFor(state: AppState, garageId: string, step: 1 | 2): Template | undefined {
  return state.templates.find((t) => t.garageId === garageId && t.step === step);
}

export { formatPounds };

export function renderTemplate(t: Template, quote: Quote, garage: Garage): Rendered {
  return renderSms(t.body, templateValues(quote, garage));
}

/** Who approved a message that Automatic mode sends without per-message approval. */
export const AUTOMATIC_APPROVER = "Automatic sending (garage setting)";

/**
 * Durable insert with the same contract as the Postgres unique constraint on
 * (garage_id, quote_id, revision, step): a second insert for the same key is rejected.
 */
export function insertOutboundOnce(state: AppState, msg: Message): boolean {
  if (msg.sendKey && state.messages.some((m) => m.sendKey === msg.sendKey)) return false;
  state.messages.push(msg);
  return true;
}

const PENDING: Message["status"][] = ["awaiting_approval", "approved"];

export function cancelPendingFor(state: AppState, quoteId: string, reason: string) {
  for (const m of state.messages) {
    if (m.direction === "outbound" && m.quoteId === quoteId && PENDING.includes(m.status)) {
      m.status = "cancelled";
      m.statusReasons = [reason];
    }
  }
}

function openTask(state: AppState, garageId: string, kind: TaskKind, quoteIds: string[], summary: string, messageId?: string): StaffTask {
  const task: StaffTask = {
    id: newId(state, "task"),
    garageId,
    kind,
    quoteIds,
    messageId,
    summary,
    status: "open",
    createdAt: state.now,
  };
  state.tasks.push(task);
  return task;
}

// ---------- follow-up check (scheduler/worker) ----------

export type CheckOutcome = "drafted" | "blocked" | "missed_window" | "draft_expired" | "quote_expired" | "already_handled";

export type CheckReportItem = {
  garageId: string;
  quoteId: string;
  customerName: string;
  step?: 1 | 2;
  outcome: CheckOutcome;
  reasons: GateReason[];
  messageId?: string;
};

// Reasons that stop a draft being created. A stale status does not stop drafting;
// staff can confirm the quote is still open before approving.
const DRAFT_BLOCKERS: GateReason[] = [
  "garage_paused",
  "follow_ups_off",
  "template_unresolved",
  "quote_paused",
  "status_not_open",
  "no_eligibility_evidence",
  "template_not_approved",
  "number_suppressed",
  "quote_expired",
  "unresolved_reply",
  "reminder_pending",
];

/**
 * The scheduled "follow-up check". It never sends anything: in the pilot every
 * outgoing message waits for staff approval. It:
 *  1. expires quotes past their validity,
 *  2. expires pending drafts whose send window has closed,
 *  3. drafts each due step once (unique send key), or records why it is blocked.
 */
export function runFollowUpCheck(state: AppState, onlyGarageIds?: string[]): CheckReportItem[] {
  const report: CheckReportItem[] = [];
  const now = Date.parse(state.now);
  const included = (garageId: string) => !onlyGarageIds || onlyGarageIds.includes(garageId);
  for (const g of state.garages) if (included(g.id)) g.lastCheckAt = state.now;

  for (const quote of state.quotes) {
    if (!included(quote.garageId)) continue;
    const garage = garageOf(state, quote.garageId);

    if (quote.status === "open" && isQuoteExpired(quote, garage, state.now)) {
      quote.status = "expired";
      cancelPendingFor(state, quote.id, "quote_expired");
      log(state, garage.id, "quote_expired", `Quote ${quote.sourceQuoteId} expired after ${garage.quoteValidityDays} days`, quote.id);
      report.push({ garageId: garage.id, quoteId: quote.id, customerName: quote.customerName, outcome: "quote_expired", reasons: ["quote_expired"] });
    }
    if (garage.mode === "off") continue; // Off schedules nothing

    for (const step of [1, 2] as const) {
      const win = stepWindow(quote, garage, step);
      if (!win) continue;
      const key = sendKey(garage.id, quote.id, quote.revision, step);
      const existing = state.messages.find((m) => m.sendKey === key);

      if (existing) {
        if (PENDING.includes(existing.status) && now >= Date.parse(win.windowEnd)) {
          existing.status = "expired";
          existing.statusReasons = ["window_expired"];
          log(state, garage.id, "draft_expired", `Follow-up ${step} for ${quote.customerName} expired unsent (window closed ${formatLondon(win.windowEnd)})`, quote.id);
          report.push({ garageId: garage.id, quoteId: quote.id, customerName: quote.customerName, step, outcome: "draft_expired", reasons: ["window_expired"], messageId: existing.id });
        } else if (now >= Date.parse(win.windowStart) && now < Date.parse(win.windowEnd)) {
          report.push({ garageId: garage.id, quoteId: quote.id, customerName: quote.customerName, step, outcome: "already_handled", reasons: [], messageId: existing.id });
        }
        continue;
      }

      if (now < Date.parse(win.windowStart)) continue; // not due yet

      const template = templateFor(state, garage.id, step);
      const rendered = template ? renderTemplate(template, quote, garage) : null;
      const reasons = checkSendGate({ now: state.now, garage, quote, template, suppressions: state.suppressions, window: win });
      if (rendered?.unresolved.length) reasons.push("template_unresolved"); // never draft text with a hole in it
      const blockers = reasons.filter((r) => DRAFT_BLOCKERS.includes(r));
      const missed = reasons.includes("window_expired");

      if (blockers.length) {
        // Only report blocks for today's window; older steps are simply history.
        if (!missed) report.push({ garageId: garage.id, quoteId: quote.id, customerName: quote.customerName, step, outcome: "blocked", reasons: blockers });
        continue;
      }

      const base: Message = {
        id: newId(state, "msg"),
        garageId: garage.id,
        quoteId: quote.id,
        direction: "outbound",
        body: rendered?.text ?? "",
        createdAt: state.now,
        fromPhone: garage.smsNumber,
        toPhone: quote.phone,
        step,
        revision: quote.revision,
        sendKey: key,
        templateId: template?.id,
        windowStart: win.windowStart,
        windowEnd: win.windowEnd,
      };

      if (missed) {
        if (insertOutboundOnce(state, { ...base, status: "expired", statusReasons: ["window_expired"] })) {
          log(state, garage.id, "missed_window", `Follow-up ${step} for ${quote.customerName} missed its window (${formatLondon(win.windowStart)}–${formatLondonTime(win.windowEnd)}) and was expired, not sent late`, quote.id);
          report.push({ garageId: garage.id, quoteId: quote.id, customerName: quote.customerName, step, outcome: "missed_window", reasons: ["window_expired"], messageId: base.id });
        }
        continue;
      }

      // Automatic mode: the garage's saved setting stands in for per-message approval.
      // The full gate still runs again immediately before the provider call.
      const auto = garage.mode === "automatic";
      const draft: Message = auto
        ? { ...base, status: "approved", approvedBy: AUTOMATIC_APPROVER, approvedAt: state.now }
        : { ...base, status: "awaiting_approval" };
      if (insertOutboundOnce(state, draft)) {
        log(state, garage.id, "drafted", auto ? `Follow-up ${step} for ${quote.customerName} queued by automatic sending` : `Follow-up ${step} drafted for ${quote.customerName}; waiting for staff approval`, quote.id);
        report.push({ garageId: garage.id, quoteId: quote.id, customerName: quote.customerName, step, outcome: "drafted", reasons, messageId: base.id });
      } else {
        report.push({ garageId: garage.id, quoteId: quote.id, customerName: quote.customerName, step, outcome: "already_handled", reasons: [] });
      }
    }
  }
  return report;
}

// ---------- staff approval + sending ----------

export function approveMessage(state: AppState, messageId: string, staffName: string) {
  const m = state.messages.find((x) => x.id === messageId);
  if (!m || m.status !== "awaiting_approval") throw new Error("Message is not awaiting approval");
  m.status = "approved";
  m.approvedBy = staffName;
  m.approvedAt = state.now;
  m.statusReasons = undefined;
  log(state, m.garageId, "approved", `${staffName} approved ${messageLabel(m).toLowerCase()} for ${m.quoteId ? quoteOf(state, m.quoteId).customerName : "?"}`, m.quoteId ?? undefined);
}

export type SendReportItem = {
  messageId: string;
  quoteId: string;
  outcome: "sent" | "blocked" | "failed" | "needs_reconciliation" | "skipped_already_claimed";
  reasons?: GateReason[];
  error?: string;
};

const TERMINAL_BLOCKS: Partial<Record<GateReason, Message["status"]>> = {
  window_expired: "expired",
  status_not_open: "cancelled",
  number_suppressed: "cancelled",
  quote_expired: "cancelled",
  revision_changed: "cancelled",
  invoice_settled: "cancelled",
};

/**
 * Send every staff-approved message. Each record is claimed atomically
 * (approved -> sending, done synchronously before any await, matching
 * `UPDATE ... WHERE status = 'approved' RETURNING` in Postgres), then the full
 * gate runs again immediately before the provider call.
 */
export async function dispatchApproved(state: AppState, provider: SmsProvider): Promise<SendReportItem[]> {
  const report: SendReportItem[] = [];
  const candidates = state.messages.filter((m) => m.direction === "outbound" && m.status === "approved");

  for (const m of candidates) {
    // --- atomic claim ---
    if (m.status !== "approved") {
      report.push({ messageId: m.id, quoteId: m.quoteId!, outcome: "skipped_already_claimed" });
      continue;
    }
    m.status = "sending";
    m.claimedAt = state.now;

    const quote = quoteOf(state, m.quoteId!);
    const garage = garageOf(state, m.garageId);
    const window = { windowStart: m.windowStart!, windowEnd: m.windowEnd! };
    const invoice = m.invoiceId ? state.invoices.find((i) => i.id === m.invoiceId) : undefined;
    const reasons = invoice
      ? checkInvoiceGate({ now: state.now, garage, quote, invoice, step: m.invoiceStep ?? 0, suppressions: state.suppressions, window, message: m })
      : checkSendGate({ now: state.now, garage, quote, template: state.templates.find((t) => t.id === m.templateId), suppressions: state.suppressions, window, message: m });

    // Invoice texts outside opening hours stay queued for the next opening instead of expiring.
    if (invoice && reasons.length && reasons.every((r) => r === "before_window" || r === "window_expired")) {
      m.status = "approved";
      m.claimedAt = undefined;
      report.push({ messageId: m.id, quoteId: quote.id, outcome: "blocked", reasons });
      continue;
    }

    if (reasons.length) {
      const terminal = reasons.map((r) => TERMINAL_BLOCKS[r]).find(Boolean);
      m.status = terminal ?? "awaiting_approval";
      if (!terminal) {
        m.approvedAt = undefined;
        m.approvedBy = undefined;
      }
      m.statusReasons = reasons;
      log(state, garage.id, "send_blocked", `Send blocked for ${quote.customerName}: ${reasons.map((r) => GATE_REASON_TEXT[r]).join("; ")}`, quote.id);
      report.push({ messageId: m.id, quoteId: quote.id, outcome: "blocked", reasons });
      continue;
    }

    const result = await provider.send({ from: m.fromPhone, to: m.toPhone, body: m.body, idempotencyKey: m.sendKey! });

    if (result.kind === "accepted") {
      m.status = "sent";
      m.sentAt = state.now;
      m.providerMessageId = result.providerMessageId;
      m.deliveryStatus = result.status;
      log(state, garage.id, "sent", `${messageLabel(m)} sent to ${quote.customerName} via ${provider.name} (${result.providerMessageId})`, quote.id);
      report.push({ messageId: m.id, quoteId: quote.id, outcome: "sent" });
    } else if (result.kind === "rejected") {
      m.status = "failed";
      m.statusReasons = [];
      m.deliveryStatus = result.error;
      log(state, garage.id, "send_failed", `Provider rejected ${messageLabel(m).toLowerCase()} for ${quote.customerName}: ${result.error}`, quote.id);
      report.push({ messageId: m.id, quoteId: quote.id, outcome: "failed", error: result.error });
    } else {
      // Ambiguous: the provider may have accepted it. Never retry blindly.
      m.status = "needs_reconciliation";
      m.deliveryStatus = result.error;
      openTask(state, garage.id, "reconcile_send", [quote.id], `Check the provider log: ${messageLabel(m).toLowerCase()} to ${quote.customerName} may or may not have been sent. Do not resend until reconciled.`, m.id);
      log(state, garage.id, "needs_reconciliation", `Send to ${quote.customerName} timed out; marked for reconciliation, no retry`, quote.id);
      report.push({ messageId: m.id, quoteId: quote.id, outcome: "needs_reconciliation", error: result.error });
    }
  }
  return report;
}

/** Staff resolve an ambiguous send after checking the provider's own log. */
export function reconcileSend(state: AppState, messageId: string, outcome: "was_sent" | "not_sent", providerMessageId?: string) {
  const m = state.messages.find((x) => x.id === messageId);
  if (!m || m.status !== "needs_reconciliation") throw new Error("Message does not need reconciliation");
  if (outcome === "was_sent") {
    m.status = "sent";
    m.sentAt = m.claimedAt;
    m.providerMessageId = providerMessageId ?? m.providerMessageId;
  } else {
    m.status = "failed";
  }
  for (const t of state.tasks) {
    if (t.kind === "reconcile_send" && t.messageId === m.id && t.status === "open") {
      t.status = "resolved";
      t.resolvedAt = state.now;
      t.resolution = outcome === "was_sent" ? "Confirmed sent in provider log" : "Confirmed not sent";
    }
  }
  log(state, m.garageId, "reconciled", `Send reconciled as ${outcome === "was_sent" ? "sent" : "not sent"}`, m.quoteId ?? undefined);
}

// ---------- provider callbacks ----------

/** Delivery status callback. Deduplicated by provider event id. */
export function applyDeliveryStatus(state: AppState, e: { eventId: string; providerMessageId: string; status: string }): "applied" | "duplicate" | "unknown_message" {
  if (state.processedProviderEvents.includes(e.eventId)) return "duplicate";
  state.processedProviderEvents.push(e.eventId);
  const m = state.messages.find((x) => x.providerMessageId === e.providerMessageId);
  if (!m) return "unknown_message";
  m.deliveryStatus = e.status;
  if (e.status === "delivered") m.status = "delivered";
  if (e.status === "undelivered" || e.status === "failed") m.status = "failed";
  return "applied";
}

export type InboundResult = {
  outcome: "duplicate" | "unknown_garage" | "opt_out" | "matched" | "ambiguous" | "unmatched";
  messageId?: string;
  category?: ReplyCategory;
  quoteIds?: string[];
};

const CATEGORY_TASK: Record<ReplyCategory, TaskKind> = {
  opt_out: "opt_out_notice",
  booking_request: "booking_request",
  price_question: "price_question",
  complaint: "complaint",
  repair_or_safety: "repair_or_safety",
  general: "general_reply",
};

/**
 * Inbound SMS. Order matters:
 *  1. dedupe by provider event id
 *  2. store the message
 *  3. apply clear opt-outs BEFORE any classification
 *  4. pause every candidate quote (any reply pauses follow-ups)
 *  5. several open quotes for the number -> pause all, one staff task
 *  6. otherwise label it and hand it to staff. Nothing is ever auto-answered.
 */
export function receiveInbound(state: AppState, e: { eventId: string; from: string; to: string; body: string }): InboundResult {
  if (state.processedProviderEvents.includes(e.eventId)) return { outcome: "duplicate" };
  const garage = state.garages.find((g) => g.smsNumber === e.to);
  if (!garage) return { outcome: "unknown_garage" };
  state.processedProviderEvents.push(e.eventId);

  const msg: Message = {
    id: newId(state, "msg"),
    garageId: garage.id,
    quoteId: null,
    direction: "inbound",
    body: e.body,
    createdAt: state.now,
    fromPhone: e.from,
    toPhone: e.to,
    providerInboundId: e.eventId,
  };
  state.messages.push(msg);

  const phoneQuotes = state.quotes.filter((q) => q.garageId === garage.id && q.phone === e.from);

  if (isClearOptOut(e.body)) {
    msg.category = "opt_out";
    msg.matchedQuoteIds = phoneQuotes.map((q) => q.id);
    msg.quoteId = phoneQuotes.length === 1 ? phoneQuotes[0].id : null;
    if (!state.suppressions.some((s) => s.garageId === garage.id && s.phone === e.from)) {
      state.suppressions.push({ id: newId(state, "sup"), garageId: garage.id, phone: e.from, reason: "opt_out", sourceMessageId: msg.id, createdAt: state.now });
    }
    for (const q of phoneQuotes) cancelPendingFor(state, q.id, "number_suppressed");
    const who = phoneQuotes[0]?.customerName ?? e.from;
    openTask(state, garage.id, "opt_out_notice", msg.matchedQuoteIds, `${who} opted out. No further texts will be sent to this number. No reply needed.`, msg.id);
    log(state, garage.id, "opt_out", `Opt-out from ${who}: number suppressed before any classification`, msg.quoteId ?? undefined);
    return { outcome: "opt_out", messageId: msg.id, category: "opt_out", quoteIds: msg.matchedQuoteIds };
  }

  const category = classifyReply(e.body);
  msg.category = category;
  const candidates = phoneQuotes.filter((q) => q.status === "open");
  msg.matchedQuoteIds = candidates.map((q) => q.id);

  if (candidates.length === 0) {
    openTask(state, garage.id, "unmatched_reply", phoneQuotes.map((q) => q.id), `Reply from ${e.from} does not match an open quote: "${e.body}"`, msg.id);
    log(state, garage.id, "unmatched_reply", `Reply from ${e.from} matched no open quote; sent to staff`);
    return { outcome: "unmatched", messageId: msg.id, category };
  }

  for (const q of candidates) {
    q.unresolvedReply = true;
    cancelPendingFor(state, q.id, "unresolved_reply");
  }

  if (candidates.length > 1) {
    openTask(state, garage.id, "ambiguous_match", msg.matchedQuoteIds, `Reply matches ${candidates.length} open quotes (${candidates.map((q) => q.sourceQuoteId).join(", ")}). All paused. Check which job the customer means: "${e.body}"`, msg.id);
    log(state, garage.id, "ambiguous_match", `Reply from ${e.from} matched ${candidates.length} open quotes; all paused and sent to staff`);
    return { outcome: "ambiguous", messageId: msg.id, category, quoteIds: msg.matchedQuoteIds };
  }

  const quote = candidates[0];
  msg.quoteId = quote.id;
  if (category === "booking_request") {
    quote.booking = "requested";
    quote.bookingRequestedAt = state.now;
  }
  openTask(state, garage.id, CATEGORY_TASK[category], [quote.id], `${CATEGORY_LABEL[category]} from ${quote.customerName}: "${e.body}"`, msg.id);
  log(state, garage.id, "reply", `Reply from ${quote.customerName} (${CATEGORY_LABEL[category]}); follow-ups paused, task created for staff`, quote.id);
  return { outcome: "matched", messageId: msg.id, category, quoteIds: [quote.id] };
}

// ---------- staff actions ----------

/** A booking request only becomes a booking when staff mark it confirmed. */
export function confirmBooking(state: AppState, quoteId: string, staffName: string) {
  const q = quoteOf(state, quoteId);
  if (q.status !== "open") throw new Error("Only open quotes can be booked");
  q.booking = "confirmed";
  q.status = "booked";
  q.bookedAt = state.now;
  q.statusConfirmedAt = state.now;
  q.statusSource = "manual";
  q.unresolvedReply = false;
  cancelPendingFor(state, q.id, "status_not_open");
  for (const t of state.tasks) {
    if (t.status === "open" && t.quoteIds.includes(q.id) && t.kind !== "opt_out_notice") {
      t.status = "resolved";
      t.resolvedAt = state.now;
      t.resolution = `Booking confirmed by ${staffName}`;
    }
  }
  log(state, q.garageId, "booking_confirmed", `${staffName} confirmed the booking for ${q.customerName}`, q.id);
}

export function resolveTask(state: AppState, taskId: string, action: "resume" | "stop", staffName: string) {
  const t = state.tasks.find((x) => x.id === taskId);
  if (!t || t.status !== "open") throw new Error("Task is not open");
  t.status = "resolved";
  t.resolvedAt = state.now;
  t.resolution = action === "resume" ? `${staffName}: handled, follow-ups may continue` : `${staffName}: handled, follow-ups stopped`;
  for (const id of t.quoteIds) {
    const q = quoteOf(state, id);
    const stillOpenTasks = state.tasks.some((x) => x.status === "open" && x.quoteIds.includes(id) && x.kind !== "opt_out_notice");
    if (!stillOpenTasks) q.unresolvedReply = false;
    if (action === "stop") q.paused = true;
  }
  log(state, t.garageId, "task_resolved", t.resolution, t.quoteIds[0]);
}

/** Manual status update for garages without a reliable status feed. */
export function confirmStatus(state: AppState, quoteId: string, status: Quote["status"], staffName: string) {
  const q = quoteOf(state, quoteId);
  const was = q.status;
  q.status = status;
  q.statusConfirmedAt = state.now;
  q.statusSource = "manual";
  if (status === "booked" && !q.bookedAt) q.bookedAt = state.now;
  if (status !== "open") cancelPendingFor(state, q.id, "status_not_open");
  log(state, q.garageId, "status", was === status ? `${staffName} confirmed ${q.customerName}'s quote is still ${status}` : `${staffName} changed ${q.customerName}'s quote from ${was} to ${status}`, q.id);
}

export function markCompleted(state: AppState, quoteId: string, jobValuePence: number, staffName: string) {
  const q = quoteOf(state, quoteId);
  if (q.status !== "booked") throw new Error("Only booked quotes can be completed");
  q.status = "completed";
  q.completedAt = state.now;
  q.jobValuePence = jobValuePence;
  q.statusConfirmedAt = state.now;
  log(state, q.garageId, "completed", `${staffName} marked ${q.customerName}'s job complete (${formatPounds(jobValuePence)})`, q.id);
  draftInvoiceText(state, issueInvoice(state, q.id)); // invoice raised now; its text is drafted (or queued) straight away
}

export function setGaragePaused(state: AppState, garageId: string, paused: boolean, staffName: string) {
  const g = garageOf(state, garageId);
  g.paused = paused;
  log(state, g.id, "garage_pause", `${staffName} ${paused ? "PAUSED" : "resumed"} all follow-ups for ${g.name}`);
}

export function setQuotePaused(state: AppState, quoteId: string, paused: boolean, staffName: string) {
  const q = quoteOf(state, quoteId);
  q.paused = paused;
  log(state, q.garageId, "quote_pause", `${staffName} ${paused ? "paused" : "resumed"} follow-ups for ${q.customerName}`, q.id);
}

// ---------- read models for the UI ----------

export type QuoteFollowUpView = {
  nextStep: 1 | 2 | null;
  nextWindow: { windowStart: string; windowEnd: string } | null;
  pending?: Message;
  blockers: GateReason[];
};

export function quoteFollowUpView(state: AppState, quote: Quote): QuoteFollowUpView {
  const garage = garageOf(state, quote.garageId);
  const now = Date.parse(state.now);
  for (const step of [1, 2] as const) {
    const win = stepWindow(quote, garage, step);
    if (!win) continue;
    const existing = state.messages.find((m) => m.sendKey === sendKey(garage.id, quote.id, quote.revision, step));
    if (existing && !PENDING.includes(existing.status)) continue;
    if (!existing && now >= Date.parse(win.windowEnd)) continue; // window passed
    const reasons = checkSendGate({
      now: state.now,
      garage,
      quote,
      template: templateFor(state, garage.id, step),
      suppressions: state.suppressions,
      window: win,
      message: existing,
    }).filter((r) => r !== "before_window" && r !== "not_staff_approved");
    return { nextStep: step, nextWindow: win, pending: existing, blockers: reasons };
  }
  return { nextStep: null, nextWindow: null, blockers: [] };
}
