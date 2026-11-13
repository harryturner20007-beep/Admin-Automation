// Booked jobs: quote → job → completed job → invoice draft. One job per quote; the accepted work is a
// snapshot that never changes, and the final charges are kept separately so differences stay visible.
import { confirmBooking, log, newId } from "./engine";
import { createInvoiceDraft } from "./invoices";
import { chargeErrors, lineTotal, netOfVat, totals } from "./money";
import { formatPounds } from "./templates";
import { formatLondon, ukDate } from "./time";
import type { AppState, Charges, Invoice, Job, JobStatus, Line, Quote } from "./types";

export const JOB_STATUS_LABEL: Record<JobStatus, string> = { booked: "Booked", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };

const jobOf = (state: AppState, jobId: string) => {
  const j = state.jobs.find((x) => x.id === jobId);
  if (!j) throw new Error("Job not found");
  return j;
};
const quoteOf = (state: AppState, quoteId: string) => {
  const q = state.quotes.find((x) => x.id === quoteId);
  if (!q) throw new Error("Quote not found");
  return q;
};
export const jobForQuote = (state: AppState, quoteId: string) => state.jobs.find((j) => j.quoteId === quoteId);
/** Accepted quotes from the earlier workflow still need a scheduled job. */
export const quotesAwaitingJob = (state: AppState, garageId: string) =>
  state.quotes.filter((q) => q.garageId === garageId && q.status === "booked" && !jobForQuote(state, q.id));
export const invoiceForJob = (state: AppState, jobId: string) => state.invoices.find((i) => i.jobId === jobId && i.status !== "cancelled");

const validStart = (iso: string) => !!iso && Number.isFinite(Date.parse(iso));

/** The quote's agreed work as lines. Older quotes hold only a description and total: one summary line. */
export function acceptedLinesFromQuote(state: AppState, q: Quote): Charges {
  if (q.charges) return structuredClone(q.charges);
  const vat = state.garages.find((g) => g.id === q.garageId)!.business.vatRatePercent;
  const line: Line = { id: "l1", kind: "other", description: q.customerJobDescription || q.job, quantity: 1, unitPence: vat ? netOfVat(q.amountPence, vat) : q.amountPence };
  return { lines: [line], discountPence: 0, vatRatePercent: vat };
}

export type BookingInput = { startAt: string; durationMins?: number; notes: string; customerConfirmation: string };

export function bookingErrors(input: BookingInput): Partial<Record<keyof BookingInput, string>> {
  const e: Partial<Record<keyof BookingInput, string>> = {};
  if (!validStart(input.startAt)) e.startAt = "Choose the booking date and time";
  if (input.durationMins !== undefined && (!Number.isInteger(input.durationMins) || input.durationMins <= 0 || input.durationMins > 7 * 24 * 60)) e.durationMins = "Enter a duration in minutes, or leave it empty";
  if (!input.customerConfirmation.trim()) e.customerConfirmation = "Confirm how the customer accepted the quote";
  if (input.notes.length > 2000) e.notes = "Keep notes under 2,000 characters";
  return e;
}

/**
 * Book a quote in as a job. Records the customer's acceptance, snapshots the agreed work and takes the
 * quote out of follow-ups. Safe to repeat: a quote that already has a job returns that job unchanged.
 */
export function bookJob(state: AppState, quoteId: string, input: BookingInput, staffName: string): Job {
  const existing = jobForQuote(state, quoteId);
  if (existing) return existing;
  const q = quoteOf(state, quoteId);
  if (q.status !== "open" && q.status !== "booked") throw new Error("Only open or accepted quotes can be booked in");
  const errors = Object.values(bookingErrors(input));
  if (errors.length) throw new Error(errors[0]);
  if (q.status === "open") confirmBooking(state, q.id, staffName); // records acceptance, stops follow-ups, resolves reply tasks
  q.bookedFor = ukDate(input.startAt);
  q.offeredSlots = undefined;
  const charges = acceptedLinesFromQuote(state, q);
  const job: Job = {
    id: newId(state, "job"),
    garageId: q.garageId,
    quoteId: q.id,
    number: `JOB-${String(state.jobs.filter((j) => j.garageId === q.garageId).length + 1).padStart(4, "0")}`,
    status: "booked",
    startAt: new Date(input.startAt).toISOString(),
    durationMins: input.durationMins,
    notes: input.notes.trim(),
    accepted: { ...charges, totalPence: q.amountPence, acceptedAt: state.now, acceptedBy: staffName, customerConfirmation: input.customerConfirmation.trim() },
    createdAt: state.now,
    createdBy: staffName,
  };
  state.jobs.push(job);
  log(state, q.garageId, "job_booked", `${staffName} booked ${q.customerName} in for ${formatLondon(job.startAt, { withDay: true })} (${job.number}; ${formatPounds(q.amountPence)} accepted: ${job.accepted.customerConfirmation})`, q.id, { jobId: job.id });
  return job;
}

/** Customer billing details, kept on the quote and copied onto its invoice draft. */
export function setCustomerBilling(state: AppState, quoteId: string, input: { email: string; billingAddress: string }, staffName: string) {
  const q = quoteOf(state, quoteId);
  const email = input.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email address doesn't look right");
  if (input.billingAddress.length > 500) throw new Error("Keep the address under 500 characters");
  q.email = email;
  q.billingAddress = input.billingAddress.trim();
  log(state, q.garageId, "customer", `${staffName} updated ${q.customerName}'s billing details`, q.id);
}

export function startJob(state: AppState, jobId: string, staffName: string) {
  const j = jobOf(state, jobId);
  if (j.status === "in_progress") return;
  if (j.status !== "booked") throw new Error("Only booked jobs can be started");
  j.status = "in_progress";
  j.startedAt = state.now;
  log(state, j.garageId, "job_started", `${staffName} started ${j.number}`, j.quoteId, { jobId: j.id });
}

export function rescheduleJob(state: AppState, jobId: string, startAt: string, durationMins: number | undefined, reason: string, staffName: string) {
  const j = jobOf(state, jobId);
  if (j.status !== "booked" && j.status !== "in_progress") throw new Error("Only open jobs can be rescheduled");
  if (!validStart(startAt)) throw new Error("Choose the new date and time");
  const was = j.startAt;
  j.startAt = new Date(startAt).toISOString();
  j.durationMins = durationMins;
  quoteOf(state, j.quoteId).bookedFor = ukDate(j.startAt);
  log(state, j.garageId, "job_rescheduled", `${staffName} moved ${j.number} from ${formatLondon(was, { withDay: true })} to ${formatLondon(j.startAt, { withDay: true })}${reason.trim() ? ` (${reason.trim()})` : ""}`, j.quoteId, { jobId: j.id });
}

export function cancelJob(state: AppState, jobId: string, reason: string, staffName: string) {
  const j = jobOf(state, jobId);
  if (j.status === "cancelled") return;
  if (j.status === "completed") throw new Error("A completed job can't be cancelled. Cancel its invoice instead.");
  if (!reason.trim()) throw new Error("Give a reason for cancelling");
  j.status = "cancelled";
  j.cancelledAt = state.now;
  j.cancelReason = reason.trim();
  log(state, j.garageId, "job_cancelled", `${staffName} cancelled ${j.number}: ${j.cancelReason}`, j.quoteId, { jobId: j.id });
}

export type CompletionInput = Charges & { extraWorkReason: string; extraWorkAuthorisation: string; completionNotes: string };

export function completionErrors(job: Job, input: CompletionInput): string[] {
  const errors = chargeErrors(input);
  if (!errors.length && totals(input).totalPence > job.accepted.totalPence) {
    if (!input.extraWorkReason.trim()) errors.push("Say why the final price is more than the accepted quote");
    if (!input.extraWorkAuthorisation.trim()) errors.push("Record how the customer authorised the extra work");
  }
  return errors;
}

/**
 * Complete the job and create its invoice draft as one change. Safe to repeat: a job that is already
 * completed returns its existing draft (or invoice) instead of making another.
 */
export function completeJob(state: AppState, jobId: string, input: CompletionInput, staffName: string): Invoice {
  const j = jobOf(state, jobId);
  if (j.status === "completed") {
    const inv = invoiceForJob(state, j.id);
    if (inv) return inv;
  } else {
    if (j.status === "cancelled") throw new Error("This job was cancelled");
    const errors = completionErrors(j, input);
    if (errors.length) throw new Error(errors.join(". "));
    const t = totals(input);
    j.final = {
      lines: input.lines.map((l, i) => ({ ...l, id: l.id || `f${i + 1}`, description: l.description.trim() })),
      discountPence: input.discountPence,
      vatRatePercent: input.vatRatePercent,
      extraWorkReason: input.extraWorkReason.trim(),
      extraWorkAuthorisation: input.extraWorkAuthorisation.trim(),
      completionNotes: input.completionNotes.trim(),
    };
    j.status = "completed";
    j.completedAt = state.now;
    j.completedBy = staffName;
    const q = quoteOf(state, j.quoteId);
    q.status = "completed";
    q.completedAt = state.now;
    q.jobValuePence = t.totalPence;
    q.statusConfirmedAt = state.now;
    log(state, j.garageId, "completed", `${staffName} completed ${j.number} for ${q.customerName} (${formatPounds(t.totalPence)})`, q.id, { jobId: j.id });
  }
  return createInvoiceDraft(state, j.id, staffName);
}

export type LineChange = { kind: "added" | "removed" | "changed"; description: string; fromPence?: number; toPence?: number };

/** What changed between the accepted quote and the final charges, line by line (matched on description). */
export function jobChanges(accepted: Charges, final: Charges): { lines: LineChange[]; fromPence: number; toPence: number } {
  const key = (l: Line) => l.description.trim().toLowerCase();
  const out: LineChange[] = [];
  for (const l of final.lines) {
    const was = accepted.lines.find((a) => key(a) === key(l));
    if (!was) out.push({ kind: "added", description: l.description, toPence: lineTotal(l) });
    else if (lineTotal(was) !== lineTotal(l)) out.push({ kind: "changed", description: l.description, fromPence: lineTotal(was), toPence: lineTotal(l) });
  }
  for (const a of accepted.lines) if (!final.lines.some((l) => key(l) === key(a))) out.push({ kind: "removed", description: a.description, fromPence: lineTotal(a) });
  return { lines: out, fromPence: totals(accepted).totalPence, toPence: totals(final).totalPence };
}

// ---------- read models ----------

export type JobTab = "today" | "upcoming" | "in_progress" | "completed" | "cancelled";
export const JOB_TABS: { id: JobTab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

export function jobInTab(state: AppState, j: Job, tab: JobTab): boolean {
  const today = ukDate(state.now);
  const day = ukDate(j.startAt);
  if (tab === "today") return j.status === "booked" && day <= today; // includes booked jobs left over from earlier days
  if (tab === "upcoming") return j.status === "booked" && day > today;
  return j.status === tab;
}

/** The one next thing to do on a job, for its row button. */
export function jobNextAction(state: AppState, j: Job): { id: "start" | "complete" | "invoice" | "view"; label: string } {
  if (j.status === "booked") return { id: "start", label: "Start job" };
  if (j.status === "in_progress") return { id: "complete", label: "Complete & create invoice" };
  const inv = invoiceForJob(state, j.id);
  if (j.status === "completed" && inv?.status === "draft") return { id: "invoice", label: "Review invoice" };
  return { id: "view", label: "View job" };
}

export type ProgressStep = { id: "quote" | "booked" | "completed" | "issued" | "paid"; label: string; done: boolean };

/** Quote → Job booked → Job completed → Invoice issued → Paid, for any record in the chain. */
export function progressFor(state: AppState, quoteId: string): { steps: ProgressStep[]; jobId?: string; invoiceId?: string } {
  const q = state.quotes.find((x) => x.id === quoteId);
  const job = jobForQuote(state, quoteId);
  const inv = job ? invoiceForJob(state, job.id) : state.invoices.find((i) => i.quoteId === quoteId && i.status !== "cancelled");
  const issued = !!inv && inv.status !== "draft";
  return {
    jobId: job?.id,
    invoiceId: inv?.id,
    steps: [
      { id: "quote", label: "Quote", done: !!q },
      { id: "booked", label: "Job booked", done: !!job || q?.status === "booked" || q?.status === "completed" },
      { id: "completed", label: "Job completed", done: job?.status === "completed" || q?.status === "completed" },
      { id: "issued", label: "Invoice issued", done: issued },
      { id: "paid", label: "Paid", done: inv?.status === "paid" },
    ],
  };
}

/** Record the booking times staff are offering the customer (1 to 3, all in the future). */
export function offerSlots(state: AppState, quoteId: string, slots: string[], staffName: string) {
  const q = quoteOf(state, quoteId);
  if (q.status !== "open") throw new Error("Only open quotes can be offered dates");
  const clean = [...new Set(slots.filter(Boolean))].sort();
  if (!clean.length || clean.length > 3) throw new Error("Offer one to three dates");
  if (clean.some((x) => !validStart(x) || Date.parse(x) <= Date.parse(state.now))) throw new Error("Choose dates in the future");
  q.offeredSlots = clean.map((x) => new Date(x).toISOString());
  log(state, q.garageId, "slots_offered", `${staffName} offered ${q.customerName} ${q.offeredSlots.map((x) => formatLondon(x, { withDay: true })).join(" or ")}`, q.id);
}

/** The text that offers those times. */
export function offerText(q: Quote, slots: string[]): string {
  const first = q.customerName.split(" ")[0];
  const when = slots.map((x) => formatLondon(x, { withDay: true }));
  const list = when.length > 1 ? `${when.slice(0, -1).join(", ")} or ${when.at(-1)}` : when[0];
  return `Hi ${first}, we can book your ${q.customerJobDescription || q.job} in for ${list}. Reply with ${when.length > 1 ? "the one that suits" : "YES to confirm"} and we'll book you in.`;
}

export const confirmationText = (q: Quote, slot: string) =>
  `Hi ${q.customerName.split(" ")[0]}, you're booked in for your ${q.customerJobDescription || q.job} on ${formatLondon(slot, { withDay: true })}. See you then. Reply here if you need to change it.`;
