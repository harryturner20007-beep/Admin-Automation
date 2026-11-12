// The staff chase queue: follow-up timing, summary membership, outcomes and contact attempts.
// Pure functions over AppState, like the rest of the engine.
import { cancelPendingFor, confirmBooking, confirmStatus, log, quoteFollowUpView } from "./engine";
import { isSuppressed } from "./gate";
import { formatPounds, templateValues } from "./templates";
import { addDaysYmd, daysBetween, formatLondonDate, ukDate } from "./time";
import type { AppState, Quote } from "./types";

export type FollowUpKind = "overdue" | "today" | "upcoming" | "outcome_needed" | "reply" | "none";
export type FollowUp = { kind: FollowUpKind; label: string; date?: string; overdueDays?: number };

/**
 * When this quote should next be chased, in staff terms.
 * Staff reminder dates win; otherwise the next scheduled follow-up (or a draft waiting today).
 * Only explicit reminder dates can become overdue: missed automatic windows expire instead.
 */
export function followUpFor(state: AppState, q: Quote): FollowUp {
  if (q.status !== "open" || isSuppressed(state.suppressions, q.garageId, q.phone)) return { kind: "none", label: "—" };
  if (q.contactPendingAt) return { kind: "outcome_needed", label: "Outcome needed" };
  if (q.unresolvedReply || q.booking === "requested") return { kind: "reply", label: "Today" }; // a waiting reply is handled today; the status column says why
  const today = ukDate(state.now);
  const view = quoteFollowUpView(state, q);
  // A scheduled follow-up counts unless something means it won't happen at all (a stale status is fixable).
  const wontRun = view.blockers.some((b) => b === "no_eligibility_evidence" || b === "follow_ups_off" || b === "garage_paused" || b === "quote_paused");
  const date = q.reminderDate ?? (view.pending ? today : view.nextWindow && !wontRun ? ukDate(view.nextWindow.windowStart) : undefined);
  if (!date) return { kind: "none", label: "—" };
  const diff = daysBetween(date, today);
  if (diff > 0) return { kind: "overdue", label: `${diff} day${diff === 1 ? "" : "s"} overdue`, date, overdueDays: diff };
  if (diff === 0) return { kind: "today", label: "Today", date };
  return { kind: "upcoming", label: formatLondonDate(`${date}T12:00:00Z`).replace(/^\w+ /, ""), date }; // "18 Nov"
}

export type Bucket = "needs_follow_up" | "awaiting_reply" | "accepted" | "other";

/** Summary-card membership. Every open, contactable quote is either needing follow-up or awaiting the customer. */
export function bucketOf(state: AppState, q: Quote): Bucket {
  if (q.status === "booked" || q.status === "completed") return "accepted";
  if (q.status !== "open" || isSuppressed(state.suppressions, q.garageId, q.phone)) return "other";
  const k = followUpFor(state, q).kind;
  return k === "overdue" || k === "today" || k === "outcome_needed" || k === "reply" ? "needs_follow_up" : "awaiting_reply";
}

/** Open, contactable quotes can be chased; everything else is a completed outcome to view. */
export const canChase = (state: AppState, q: Quote) => q.status === "open" && !isSuppressed(state.suppressions, q.garageId, q.phone);

/** Most recent activity on the quote (for "most recently updated"). */
export function updatedAt(state: AppState, q: Quote): string {
  let latest = q.statusConfirmedAt > q.quoteSentAt ? q.statusConfirmedAt : q.quoteSentAt;
  for (const e of state.events) if (e.quoteId === q.id && e.at > latest) latest = e.at;
  return latest;
}

/** Default order: overdue (most overdue first), then due today, then most recently updated. */
export function priorityCompare(state: AppState) {
  const rank = (f: FollowUp) => (f.kind === "overdue" ? 0 : f.kind === "today" || f.kind === "outcome_needed" || f.kind === "reply" ? 1 : 2);
  return (a: Quote, b: Quote) => {
    const fa = followUpFor(state, a);
    const fb = followUpFor(state, b);
    return rank(fa) - rank(fb) || (fb.overdueDays ?? 0) - (fa.overdueDays ?? 0) || updatedAt(state, b).localeCompare(updatedAt(state, a));
  };
}

// ---------- outcomes ----------

export type Outcome = "accepted" | "needs_time" | "no_reply" | "declined";
export const OUTCOME_LABEL: Record<Outcome, string> = { accepted: "Accepted", needs_time: "Needs time", no_reply: "No reply", declined: "Declined" };

/** Reminder choices, as UK dates relative to the demo/garage clock. */
export const reminderDate = (state: AppState, choice: "tomorrow" | "3days") => addDaysYmd(ukDate(state.now), choice === "tomorrow" ? 1 : 3);

/**
 * Record what the customer decided. Accepted books the quote and Declined closes it (existing rules);
 * Needs time / No reply keep it open with a reminder date that also holds automatic follow-ups.
 * Any reply waiting on this quote counts as handled.
 */
export function recordOutcome(state: AppState, quoteId: string, outcome: Outcome, staffName: string, reminder?: string) {
  const q = state.quotes.find((x) => x.id === quoteId);
  if (!q) throw new Error("Quote not found");
  if (q.status !== "open") throw new Error("This quote is already closed");
  const today = ukDate(state.now);
  if (outcome === "needs_time" || outcome === "no_reply") {
    if (!reminder || !/^\d{4}-\d{2}-\d{2}$/.test(reminder)) throw new Error("choose when to follow up");
    if (reminder < today) throw new Error("choose today or a later date");
  }
  for (const t of state.tasks) {
    if (t.status === "open" && t.quoteIds.includes(q.id) && t.kind !== "opt_out_notice" && t.kind !== "reconcile_send") {
      t.status = "resolved";
      t.resolvedAt = state.now;
      t.resolution = `${staffName} recorded the outcome: ${OUTCOME_LABEL[outcome]}`;
    }
  }
  q.unresolvedReply = false;
  q.contactPendingAt = undefined;
  if (outcome === "accepted") {
    confirmBooking(state, q.id, staffName);
    q.outcome = q.reminderDate = undefined;
  } else if (outcome === "declined") {
    confirmStatus(state, q.id, "declined", staffName);
    q.outcome = q.reminderDate = undefined;
  } else {
    q.outcome = outcome;
    q.reminderDate = reminder;
    q.statusConfirmedAt = state.now; // staff just checked: the quote is still open
    q.statusSource = "manual";
    if (reminder! > today) cancelPendingFor(state, q.id, "reminder_pending");
    log(state, q.garageId, "outcome", `${staffName} recorded ${OUTCOME_LABEL[outcome]} for ${q.customerName}; follow up ${formatLondonDate(`${reminder}T12:00:00Z`)}`, q.id);
  }
}

/** The day a booked job is booked in for (shown on the calendar). Empty clears it. */
export function setBookedFor(state: AppState, quoteId: string, ymd: string, staffName: string) {
  const q = state.quotes.find((x) => x.id === quoteId);
  if (!q) throw new Error("Quote not found");
  if (q.status !== "booked") throw new Error("Only booked jobs can be given a date");
  if (ymd && !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error("choose a date");
  q.bookedFor = ymd || undefined;
  log(state, q.garageId, "booked_for", ymd ? `${staffName} booked ${q.customerName}'s job in for ${formatLondonDate(`${ymd}T12:00:00Z`)}` : `${staffName} cleared the booked-in date for ${q.customerName}`, q.id);
}

export type ContactChannel = "messages_app" | "call" | "copy";

/**
 * Opening an external app (Messages, phone) records an attempt and leaves the quote waiting
 * for staff to record the outcome; this app can't know whether the message was sent or the call answered.
 */
export function recordContactAttempt(state: AppState, quoteId: string, channel: ContactChannel, staffName: string) {
  const q = state.quotes.find((x) => x.id === quoteId);
  if (!q) throw new Error("Quote not found");
  if (isSuppressed(state.suppressions, q.garageId, q.phone)) throw new Error("this customer opted out of texts");
  const text = { messages_app: "opened the Messages app to text", call: "started a call to", copy: "copied a follow-up message for" }[channel];
  if (channel !== "copy") q.contactPendingAt = state.now;
  log(state, q.garageId, "contact", `${staffName} ${text} ${q.customerName}${channel === "copy" ? "" : " (outside this app)"}`, q.id);
}

// ---------- message composer ----------

export type MessageOption = "reminder" | "questions" | "book";
export const MESSAGE_OPTIONS: { id: MessageOption; label: string }[] = [
  { id: "reminder", label: "Friendly reminder" },
  { id: "questions", label: "Any questions?" },
  { id: "book", label: "Ready to book?" },
];

/** Prefilled, editable message using the selected quote's details. */
export function composeMessage(q: Quote, option: MessageOption): string {
  const v = templateValues(q, { name: "" });
  const name = v.first_name || "there";
  const work = v.job_description;
  const amount = formatPounds(q.amountPence);
  if (option === "reminder") return `Hi ${name}, just checking whether you'd like to go ahead with the ${amount} quote for ${work}. Happy to answer any questions.`;
  if (option === "questions") return `Hi ${name}, do you have any questions about the ${amount} quote for ${work}? Just reply and we'll help.`;
  return `Hi ${name}, are you ready to book in the ${work} (${amount})? Reply with a day that suits and we'll confirm a slot.`;
}
