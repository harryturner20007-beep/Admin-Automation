import type { AppState } from "./types";

export type Results = {
  quotesFollowedUp: number; // unique quotes with at least one follow-up accepted by the provider
  followUpsSent: number;
  replies: number;
  quotesReplied: number;
  bookingRequests: number;
  bookedTotal: number; // every quote staff have marked booked
  confirmedBookings: number; // of those, booked after a follow-up was sent (observed, not attributed)
  completedJobs: number;
  observedJobValuePence: number;
  optOuts: number;
  awaitingApproval: number;
  needsReconciliation: number;
  openTasks: number;
};

const SENT = new Set(["sent", "delivered"]);

/** Optional reporting period (ISO instants, `to` exclusive). Each event counts in the period it happened. */
export type Range = { from?: string; to?: string };

export function computeResults(state: AppState, garageId: string, range: Range = {}): Results {
  const within = (at?: string) =>
    !!at && (!range.from || Date.parse(at) >= Date.parse(range.from)) && (!range.to || Date.parse(at) < Date.parse(range.to));
  const msgs = state.messages.filter((m) => m.garageId === garageId && !m.invoiceId); // invoice texts aren't follow-ups
  const allSent = msgs.filter((m) => m.direction === "outbound" && SENT.has(m.status ?? ""));
  const outbound = allSent.filter((m) => within(m.sentAt ?? m.createdAt));
  const firstFollowUp = new Map<string, number>();
  for (const m of allSent) {
    const t = Date.parse(m.sentAt ?? m.createdAt);
    const prev = firstFollowUp.get(m.quoteId!);
    if (prev === undefined || t < prev) firstFollowUp.set(m.quoteId!, t);
  }
  const inbound = msgs.filter((m) => m.direction === "inbound" && within(m.createdAt));
  const quotes = state.quotes.filter((q) => q.garageId === garageId);
  const afterFollowUp = (quoteId: string, at?: string) => {
    const f = firstFollowUp.get(quoteId);
    return f !== undefined && at !== undefined && Date.parse(at) >= f;
  };
  const bookedAfter = quotes.filter((q) => within(q.bookedAt) && afterFollowUp(q.id, q.bookedAt));
  const completedAfter = quotes.filter((q) => q.status === "completed" && within(q.completedAt) && afterFollowUp(q.id, q.bookedAt));

  return {
    quotesFollowedUp: [...firstFollowUp.values()].filter((t) => within(new Date(t).toISOString())).length,
    followUpsSent: outbound.length,
    replies: inbound.filter((m) => m.category !== "opt_out").length,
    quotesReplied: new Set(inbound.filter((m) => m.category !== "opt_out").flatMap((m) => m.matchedQuoteIds ?? [])).size,
    bookingRequests: quotes.filter((q) => within(q.bookingRequestedAt)).length,
    bookedTotal: quotes.filter((q) => within(q.bookedAt)).length,
    confirmedBookings: bookedAfter.length,
    completedJobs: completedAfter.length,
    observedJobValuePence: completedAfter.reduce((s, q) => s + (q.jobValuePence ?? 0), 0),
    optOuts: state.suppressions.filter((s) => s.garageId === garageId && within(s.createdAt)).length,
    awaitingApproval: msgs.filter((m) => m.status === "awaiting_approval").length,
    needsReconciliation: msgs.filter((m) => m.status === "needs_reconciliation").length,
    openTasks: state.tasks.filter((t) => t.garageId === garageId && t.status === "open").length,
  };
}
