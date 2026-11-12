// Everything due, by day: quote follow-ups and staff reminders, booked-in work, invoice due dates and
// invoice texts. Built from the same rules the Quotes and Invoices screens use, so the dates always agree.
import { quoteFollowUpView } from "./engine";
import { isSuppressed } from "./gate";
import { INVOICE_STEP_LABEL, invoiceView } from "./invoices";
import { followUpFor } from "./queue";
import { formatPounds } from "./templates";
import { formatLondonTime, ukDate } from "./time";
import type { AppState, JobStatus, Quote } from "./types";

export type CalendarKind = "follow_up" | "booking" | "invoice";
export type CalendarItem = {
  date: string; // "YYYY-MM-DD" UK date
  at?: string; // exact time, when there is one
  kind: CalendarKind;
  title: string; // customer
  detail: string; // what is due
  quoteId: string;
  jobId?: string;
  jobStatus?: JobStatus;
  invoiceId?: string;
  overdue: boolean;
};

export function calendarItemHref(item: CalendarItem, today: string): string {
  if (item.kind === "booking") {
    if (!item.jobId) return `/jobs?quote=${encodeURIComponent(item.quoteId)}`;
    const tab = item.jobStatus === "in_progress" ? "in_progress" : item.date > today ? "upcoming" : "today";
    return `/jobs?tab=${tab}&job=${encodeURIComponent(item.jobId)}`;
  }
  return item.kind === "invoice" ? "/invoices" : `/quotes?quote=${encodeURIComponent(item.quoteId)}`;
}

/** Items dated from `from` to `to` (inclusive UK dates), plus booked jobs that have no date yet. */
export function calendarItems(state: AppState, garageId: string, from: string, to: string): { items: CalendarItem[]; unscheduled: Quote[] } {
  const garage = state.garages.find((g) => g.id === garageId)!;
  const today = ukDate(state.now);
  const items: CalendarItem[] = [];
  const quotes = state.quotes.filter((q) => q.garageId === garageId);

  for (const q of quotes) {
    if (q.status === "open" && !isSuppressed(state.suppressions, garageId, q.phone)) {
      const f = followUpFor(state, q);
      if (f.kind === "reply" || f.kind === "outcome_needed") {
        const detail = f.kind === "outcome_needed" ? "Record the outcome of your call or text" : q.booking === "requested" ? "Booking request waiting" : "Customer reply waiting";
        items.push({ date: today, kind: "follow_up", title: q.customerName, detail, quoteId: q.id, overdue: false });
      } else if (f.date) {
        const view = quoteFollowUpView(state, q);
        const timed = !q.reminderDate && view.nextWindow && !view.pending ? view.nextWindow.windowStart : undefined;
        const detail = q.reminderDate
          ? "Chase quote (your reminder)"
          : view.pending
            ? `Follow-up ${view.nextStep} ${view.pending.status === "awaiting_approval" ? "waiting for approval" : "queued"}`
            : `Follow-up ${view.nextStep} ${garage.mode === "automatic" ? "sends" : "due"}${timed ? ` ${formatLondonTime(timed)}` : ""}${garage.mode === "automatic" ? "" : " for approval"}`;
        items.push({ date: f.date, at: timed, kind: "follow_up", title: q.customerName, detail, quoteId: q.id, overdue: f.kind === "overdue" });
      }
    }
    const job = state.jobs.find((j) => j.quoteId === q.id);
    if (job && (job.status === "booked" || job.status === "in_progress")) {
      const date = ukDate(job.startAt);
      const detail = `${job.status === "in_progress" ? "In progress" : "Booked in"}: ${q.customerJobDescription || q.job}`;
      items.push({ date, at: job.startAt, kind: "booking", title: q.customerName, detail, quoteId: q.id, jobId: job.id, jobStatus: job.status, overdue: job.status === "booked" && date < today });
    } else if (!job && q.status === "booked" && q.bookedFor) {
      items.push({ date: q.bookedFor, kind: "booking", title: q.customerName, detail: `Booked in: ${q.customerJobDescription || q.job}`, quoteId: q.id, overdue: q.bookedFor < today });
    }
  }

  for (const inv of state.invoices.filter((i) => i.garageId === garageId && i.status === "unpaid")) {
    const q = quotes.find((x) => x.id === inv.quoteId)!;
    const v = invoiceView(state, inv);
    items.push({ date: inv.dueDate, kind: "invoice", title: q.customerName, detail: `Invoice ${inv.number} due (${formatPounds(inv.amountPence)})`, quoteId: q.id, invoiceId: inv.id, overdue: inv.dueDate < today });
    if (v.scheduled) {
      const date = ukDate(v.scheduled.at);
      items.push({ date, at: v.scheduled.at, kind: "invoice", title: q.customerName, detail: `${INVOICE_STEP_LABEL[v.scheduled.step]} ${garage.invoiceMode === "automatic" ? "sends" : "due"} ${formatLondonTime(v.scheduled.at)} (${inv.number})`, quoteId: q.id, invoiceId: inv.id, overdue: false });
    }
  }

  return {
    items: items.filter((i) => i.date >= from && i.date <= to).sort((a, b) => a.date.localeCompare(b.date) || (a.at ?? "").localeCompare(b.at ?? "")),
    unscheduled: quotes.filter((q) => q.status === "booked" && !q.bookedFor && !state.jobs.some((j) => j.quoteId === q.id)),
  };
}
