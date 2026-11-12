// The follow-up engine. Pure TypeScript over an AppState so the same rules run in
// the in-browser demo (Phase 1), against Postgres (Phase 2) and with Twilio (Phase 3).

import type { SmsProvider } from "@/sms/provider";
import { checkInvoiceGate, checkSendGate, GATE_REASON_TEXT, isQuoteExpired, type GateReason } from "./gate";
import { issueDraftInvoice, messageLabel } from "./invoices";
import { acceptedLinesFromQuote, bookJob, completeJob, jobForQuote } from "./jobs";
import { netOfVat } from "./money";
import { classifyReply, CATEGORY_LABEL, isClearOptIn, isClearOptOut, normaliseReply } from "./replies";
import { nextOpening, sendKey, stepWindow } from "./schedule";
import { formatPounds, renderSms, templateValues, type Rendered } from "./templates";
import { formatLondon, formatLondonTime } from "./time";
import type { AppState, Garage, Message, Quote, ReplyCategory, StaffTask, TaskKind, Template } from "./types";

// ---------- helpers ----------

export function newId(state: AppState, prefix: string): string {
  state.seq += 1;
  return `${prefix}_${state.seq}`;
}

export function log(state: AppState, garageId: string, kind: string, text: string, quoteId?: string, refs: { jobId?: string; invoiceId?: string } = {}) {
  state.events.push({ id: newId(state, "ev"), at: state.now, garageId, quoteId, ...refs, kind, text });
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

export type CheckOutcome = "drafted" | "blocked" | "missed_window" | "draft_expired" | "moved" | "quote_expired" | "already_handled";

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
    if (quote.status !== "open") {
      // Never chased once closed. Cheap path (no template or gate): just say why a step due today won't go.
      for (const step of [1, 2] as const) {
        const win = followUpWindow(state, quote, garage, step);
        if (win && now >= Date.parse(win.windowStart) && now < Date.parse(win.windowEnd) && !state.messages.some((m) => m.sendKey === sendKey(garage.id, quote.id, quote.revision, step)))
          report.push({ garageId: garage.id, quoteId: quote.id, customerName: quote.customerName, step, outcome: "blocked", reasons: ["status_not_open"] });
      }
      continue;
    }

    let earlierWaiting = false; // never two follow-ups at once: step 2 waits until step 1 has gone
    for (const step of [1, 2] as const) {
      const win = followUpWindow(state, quote, garage, step);
      if (!win) continue;
      if (earlierWaiting) continue;
      const key = sendKey(garage.id, quote.id, quote.revision, step);
      const existing = state.messages.find((m) => m.sendKey === key);
      const template = templateFor(state, garage.id, step);
      const blockersAt = (w: { windowStart: string; windowEnd: string }) => {
        const r = checkSendGate({ now: state.now, garage, quote, template, suppressions: state.suppressions, window: w });
        if (template && renderTemplate(template, quote, garage).unresolved.length) r.push("template_unresolved"); // never draft text with a hole in it
        return r.filter((x) => DRAFT_BLOCKERS.includes(x));
      };

      if (existing) {
        // A follow-up that missed its time (closed, paused, waiting on staff) goes at the next opening instead of
        // being dropped, unless a later follow-up has already gone.
        const laterGone = step === 1 && state.messages.some((m) => m.sendKey === sendKey(garage.id, quote.id, quote.revision, 2) && !["expired", "cancelled", "blocked"].includes(m.status ?? ""));
        const missed = existing.status === "expired" && existing.statusReasons?.includes("window_expired") && !laterGone;
        const next = nextOpening(state.now, garage);
        if (next && (PENDING.includes(existing.status) || missed) && now >= Date.parse(existing.windowEnd ?? win.windowEnd)) {
          if (missed && blockersAt(next).length) continue; // still held (reply, opt-out, reminder date…): look again next check
          existing.windowStart = next.windowStart;
          existing.windowEnd = next.windowEnd;
          if (missed) {
            const auto = garage.mode === "automatic";
            Object.assign(existing, auto ? { status: "approved", approvedBy: AUTOMATIC_APPROVER, approvedAt: state.now } : { status: "awaiting_approval", approvedBy: undefined, approvedAt: undefined });
            existing.statusReasons = undefined;
          }
          log(state, garage.id, "follow_up_moved", `Follow-up ${step} for ${quote.customerName} missed its time; it now goes at the next opening (${formatLondon(next.windowStart)})`, quote.id);
          report.push({ garageId: garage.id, quoteId: quote.id, customerName: quote.customerName, step, outcome: "moved", reasons: [], messageId: existing.id });
        } else if (now >= Date.parse(win.windowStart) && now < Date.parse(win.windowEnd)) {
          report.push({ garageId: garage.id, quoteId: quote.id, customerName: quote.customerName, step, outcome: "already_handled", reasons: [], messageId: existing.id });
        }
        if (PENDING.includes(existing.status) || existing.status === "sending") earlierWaiting = true;
        continue;
      }

      if (now < Date.parse(win.windowStart)) continue; // not due yet

      // Missed its own time (garage closed, check didn't run, held): it goes at the next opening rather than never.
      const live = now >= Date.parse(win.windowEnd) ? nextOpening(state.now, garage) : win;
      if (!live) continue;
      const rendered = template ? renderTemplate(template, quote, garage) : null;
      const reasons = checkSendGate({ now: state.now, garage, quote, template, suppressions: state.suppressions, window: live });
      const blockers = blockersAt(live);

      if (blockers.length) {
        report.push({ garageId: garage.id, quoteId: quote.id, customerName: quote.customerName, step, outcome: "blocked", reasons: blockers });
        earlierWaiting = true; // step 2 doesn't jump the queue while step 1 is held
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
        windowStart: live.windowStart,
        windowEnd: live.windowEnd,
      };
      earlierWaiting = true;

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

const MANUAL_CHECKS: GateReason[] = ["garage_paused", "status_not_open", "no_eligibility_evidence", "number_suppressed", "not_staff_approved", "before_window", "window_expired", "invoice_settled", "invoice_not_issued", "template_unresolved"];

const TERMINAL_BLOCKS: Partial<Record<GateReason, Message["status"]>> = {
  window_expired: "expired",
  status_not_open: "cancelled",
  number_suppressed: "cancelled",
  quote_expired: "cancelled",
  revision_changed: "cancelled",
  invoice_settled: "cancelled",
  invoice_not_issued: "cancelled",
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
    const all = invoice
      ? checkInvoiceGate({ now: state.now, garage, quote, invoice, step: m.invoiceStep ?? 0, suppressions: state.suppressions, window, message: m })
      : checkSendGate({ now: state.now, garage, quote, template: state.templates.find((t) => t.id === m.templateId), suppressions: state.suppressions, window, message: m });
    // A text staff typed and sent on purpose skips the automation-only rules (template, schedule, mode, pauses
    // for automatic texts, a waiting reply) but never the safety ones (opt-out, consent, status, quiet hours).
    const reasons = m.manual ? all.filter((r) => MANUAL_CHECKS.includes(r)) : all;

    // Outside opening hours, or waiting on something staff can fix (a stale status, a reply on an invoice
    // customer): the text stays queued and goes at the next opportunity, rather than expiring or losing approval.
    const hold: GateReason[] = invoice ? ["before_window", "window_expired", "unresolved_reply"] : ["before_window", "window_expired", "status_stale"];
    if (reasons.length && reasons.every((r) => hold.includes(r))) {
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

    m.fromPhone = garage.smsNumber; // always the garage's current sending number, not the one when drafted
    const result = await provider.send({ from: m.fromPhone, to: m.toPhone, body: m.body, idempotencyKey: m.sendKey!, messageId: m.id });

    if (result.kind === "in_flight") {
      m.status = "approved"; // someone else holds the claim; their result is saved with the message
      m.claimedAt = undefined;
      report.push({ messageId: m.id, quoteId: quote.id, outcome: "skipped_already_claimed" });
      continue;
    }
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
      m.deliveryStatus = "failed";
      m.deliveryError = result.error;
      log(state, garage.id, "send_failed", `Provider rejected ${messageLabel(m).toLowerCase()} for ${quote.customerName}: ${result.error}`, quote.id);
      report.push({ messageId: m.id, quoteId: quote.id, outcome: "failed", error: result.error });
    } else {
      // Ambiguous: the provider may have accepted it. Never retry blindly.
      m.status = "needs_reconciliation";
      m.deliveryError = result.error;
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

/** Provider statuses in the order they can happen; the last three are final. */
const DELIVERY_RANK: Record<string, number> = { accepted: 1, scheduled: 1, queued: 1, sending: 2, sent: 3, delivered: 4, undelivered: 4, failed: 4, canceled: 4 };

/** Remember a provider event id; the list keeps the newest 5,000 (providers retry within hours, not weeks). */
function seen(state: AppState, eventId: string): boolean {
  if (state.processedProviderEvents.includes(eventId)) return true;
  state.processedProviderEvents.push(eventId);
  if (state.processedProviderEvents.length > 5000) state.processedProviderEvents.splice(0, state.processedProviderEvents.length - 5000);
  return false;
}

/**
 * Delivery status callback. Deduplicated by provider event id, and only ever moves forward: a late
 * "sent" never overwrites "delivered", and a final result (delivered / undelivered / failed) is never replaced.
 */
export function applyDeliveryStatus(state: AppState, e: { eventId: string; providerMessageId: string; status: string; error?: string }): "applied" | "duplicate" | "unknown_message" | "stale" {
  if (seen(state, e.eventId)) return "duplicate";
  const m = state.messages.find((x) => x.providerMessageId === e.providerMessageId);
  if (!m) return "unknown_message";
  const rank = DELIVERY_RANK[e.status] ?? 0;
  const current = DELIVERY_RANK[m.deliveryStatus ?? ""] ?? 0;
  if (!rank || current === 4 || rank < current) return "stale";
  m.deliveryStatus = e.status;
  if (e.status === "delivered") m.status = "delivered";
  if (rank === 4 && e.status !== "delivered") {
    m.status = "failed";
    m.deliveryError = e.error ?? "The network couldn't deliver it";
    const q = m.quoteId ? state.quotes.find((x) => x.id === m.quoteId) : undefined;
    log(state, m.garageId, "send_failed", `${messageLabel(m)} to ${q?.customerName ?? m.toPhone} was not delivered: ${m.deliveryError}`, m.quoteId ?? undefined);
  }
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
  const garage = state.garages.find((g) => g.smsNumber === e.to);
  if (!garage) return { outcome: "unknown_garage" };
  if (seen(state, e.eventId)) return { outcome: "duplicate" };

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

  if (isClearOptIn(e.body)) {
    const sup = state.suppressions.find((s) => s.garageId === garage.id && s.phone === e.from && !s.liftedAt);
    msg.category = "general";
    msg.matchedQuoteIds = phoneQuotes.map((q) => q.id);
    if (sup) {
      sup.liftedAt = state.now;
      const who = phoneQuotes[0]?.customerName ?? e.from;
      openTask(state, garage.id, "general_reply", msg.matchedQuoteIds, `${who} texted ${normaliseReply(e.body)}: they can receive texts again. Automatic follow-ups stay as they were.`, msg.id);
      log(state, garage.id, "opt_in", `${who} opted back in to texts`, phoneQuotes.length === 1 ? phoneQuotes[0].id : undefined);
      return { outcome: "matched", messageId: msg.id, category: "general", quoteIds: msg.matchedQuoteIds };
    }
  }

  const category = classifyReply(e.body);
  msg.category = category;
  // Anything still being chased for this customer: open quotes, and completed jobs with an unpaid invoice.
  const owing = (q: Quote) => state.invoices.some((i) => i.quoteId === q.id && i.status === "unpaid");
  const candidates = phoneQuotes.filter((q) => q.status === "open" || owing(q));
  msg.matchedQuoteIds = candidates.map((q) => q.id);

  if (candidates.length === 0) {
    openTask(state, garage.id, "unmatched_reply", phoneQuotes.map((q) => q.id), `Reply from ${e.from} does not match an open quote: "${e.body}"`, msg.id);
    log(state, garage.id, "unmatched_reply", `Reply from ${e.from} matched no open quote; sent to staff`);
    return { outcome: "unmatched", messageId: msg.id, category };
  }

  for (const q of candidates) {
    q.unresolvedReply = true;
    if (q.status === "open") cancelPendingFor(state, q.id, "unresolved_reply"); // invoice texts are held by the gate instead, so they resume
  }

  if (candidates.length > 1) {
    openTask(state, garage.id, "ambiguous_match", msg.matchedQuoteIds, `Reply could be about ${candidates.length} quotes or invoices (${candidates.map((q) => q.sourceQuoteId).join(", ")}). Chasing is paused for all of them. Check which job the customer means: "${e.body}"`, msg.id);
    log(state, garage.id, "ambiguous_match", `Reply from ${e.from} matched ${candidates.length} open quotes; all paused and sent to staff`);
    return { outcome: "ambiguous", messageId: msg.id, category, quoteIds: msg.matchedQuoteIds };
  }

  const quote = candidates[0];
  msg.quoteId = quote.id;
  if (category === "booking_request" && quote.status === "open") {
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

/**
 * One-step completion for a booked quote recorded with a single final total (quotes booked before jobs
 * existed, and the demo history): makes its job if needed, completes it and issues the invoice at once.
 */
export function markCompleted(state: AppState, quoteId: string, jobValuePence: number, staffName: string) {
  const q = quoteOf(state, quoteId);
  if (q.status !== "booked") throw new Error("Only booked quotes can be completed");
  const job = jobForQuote(state, q.id) ?? bookJob(state, q.id, { startAt: q.bookedFor ? `${q.bookedFor}T09:00:00.000Z` : state.now, notes: "", customerConfirmation: "Booked before jobs were recorded" }, staffName);
  const charges = acceptedLinesFromQuote(state, q);
  const vat = charges.vatRatePercent;
  charges.lines[0].unitPence = vat ? netOfVat(jobValuePence, vat) : jobValuePence;
  const note = jobValuePence > q.amountPence ? "Final total recorded as a single amount" : "";
  const inv = completeJob(state, job.id, { ...charges, extraWorkReason: note, extraWorkAuthorisation: note, completionNotes: "" }, staffName);
  issueDraftInvoice(state, inv.id, staffName); // the invoice is issued and its text drafted (or queued) straight away
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

/**
 * When a follow-up step may go. A step sent by hand moves the next step on: it waits the same number of
 * business days after the manual text as the schedule puts between the two steps.
 */
export function followUpWindow(state: AppState, quote: Quote, garage: Garage, step: 1 | 2) {
  const win = stepWindow(quote, garage, step);
  if (!win || step === 1) return win;
  const prev = state.messages.find((m) => m.sendKey === sendKey(garage.id, quote.id, quote.revision, 1));
  if (!prev?.manual || !prev.sentAt) return win;
  const gap = Math.max(1, garage.followUps[1].businessDays - garage.followUps[0].businessDays);
  const after = stepWindow({ quoteSentAt: prev.sentAt }, { ...garage, followUps: [{ ...garage.followUps[0], businessDays: gap }, garage.followUps[1]] }, 1);
  return after && Date.parse(after.windowStart) > Date.parse(win.windowStart) ? { ...after, step } : win;
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
    const win = followUpWindow(state, quote, garage, step);
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
