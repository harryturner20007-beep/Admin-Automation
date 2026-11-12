// Read model for the Quotes queue: what state each quote is in and the ONE thing staff should do next.
import { quoteFollowUpView, type QuoteFollowUpView } from "@/domain/engine";
import { GATE_REASON_TEXT, isSuppressed, type GateReason } from "@/domain/gate";
import { formatLondon, formatLondonTime } from "@/domain/time";
import type { AppState, Message, Quote, StaffTask } from "@/domain/types";

export type PrimaryKind = "reconcile" | "confirm" | "reply" | "review" | "preview" | "complete" | "view";

export type QuoteRow = {
  q: Quote;
  view: QuoteFollowUpView;
  draft?: Message;
  recon?: Message;
  replyTask?: StaffTask;
  suppressed: boolean;
  status: { label: string; tone: "green" | "amber" | "red" | "blue" | "neutral" };
  next: string;
  primary: { kind: PrimaryKind; label: string };
  needsAction: boolean;
  closed: boolean;
  dueToday: boolean; // a follow-up is drafted or due inside today's window
};

// The reason staff can act on comes first: a waiting reply matters more than a stale status.
const REASON_PRIORITY: GateReason[] = ["unresolved_reply", "quote_paused", "status_stale", "no_eligibility_evidence", "template_not_approved"];

const ACTION_KINDS: PrimaryKind[] = ["reconcile", "confirm", "reply", "review", "preview"];

export function quoteRow(state: AppState, q: Quote): QuoteRow {
  const view = quoteFollowUpView(state, q);
  const garage = state.garages.find((g) => g.id === q.garageId)!;
  const now = Date.parse(state.now);
  const out = state.messages.filter((m) => m.quoteId === q.id && m.direction === "outbound" && !m.invoiceId); // invoice texts live on Invoices
  const draft = out.find((m) => m.status === "awaiting_approval");
  const recon = out.find((m) => m.status === "needs_reconciliation");
  const replyTask = state.tasks.find((t) => t.status === "open" && t.quoteIds.includes(q.id) && t.kind !== "opt_out_notice" && t.kind !== "reconcile_send");
  const suppressed = isSuppressed(state.suppressions, q.garageId, q.phone);
  const dueNow = !!view.nextWindow && !view.pending && view.blockers.length === 0 && now >= Date.parse(view.nextWindow.windowStart) && now < Date.parse(view.nextWindow.windowEnd);

  const status: QuoteRow["status"] =
    q.status === "completed" ? { label: "Job completed", tone: "green" }
    : q.status === "booked" ? { label: "Booked", tone: "green" }
    : q.status === "declined" ? { label: "Declined", tone: "neutral" }
    : q.status === "expired" ? { label: "Expired", tone: "neutral" }
    : suppressed ? { label: "Opted out", tone: "red" }
    : q.booking === "requested" ? { label: "Booking requested", tone: "amber" }
    : q.unresolvedReply ? { label: "Reply waiting", tone: "amber" }
    : { label: "Open", tone: "neutral" };

  let next: string;
  if (suppressed) next = "No more texts: customer opted out";
  else if (q.status !== "open") next = "No follow-ups: quote closed";
  else if (garage.paused) next = "On hold: all sending paused";
  else if (garage.mode === "off") next = "Follow-ups are off for this garage";
  else if (!q.eligibilityEvidenceRef) next = "Follow-ups off: no SMS consent recorded";
  else if (draft) next = `Follow-up ${draft.step} drafted. Approve by ${formatLondonTime(draft.windowEnd!)}`;
  else if (!view.nextStep || !view.nextWindow) next = "No follow-ups left";
  else if (view.blockers.length) next = `Follow-up ${view.nextStep} on hold: ${GATE_REASON_TEXT[REASON_PRIORITY.find((r) => view.blockers.includes(r)) ?? view.blockers[0]].toLowerCase()}`;
  else if (dueNow) next = `Follow-up ${view.nextStep} due today until ${formatLondonTime(view.nextWindow.windowEnd)}`;
  else next = `Follow-up ${view.nextStep} ${garage.mode === "automatic" ? "sends" : "due"} ${formatLondon(view.nextWindow.windowStart)}`;

  const primary: QuoteRow["primary"] =
    recon ? { kind: "reconcile", label: "Check send" }
    : q.status === "open" && q.booking === "requested" ? { kind: "confirm", label: "Confirm booking" }
    : replyTask ? { kind: "reply", label: "Open reply" }
    : draft ? { kind: "review", label: "Review & send" }
    : dueNow ? { kind: "preview", label: "Preview follow-up" }
    : q.status === "booked" ? { kind: "complete", label: "Record job" }
    : { kind: "view", label: "View" };

  return {
    q, view, draft, recon, replyTask, suppressed, status, next, primary,
    needsAction: ACTION_KINDS.includes(primary.kind),
    closed: q.status !== "open" || suppressed,
    dueToday: !!draft || dueNow,
  };
}

export const FILTERS = [
  { id: "action", label: "Needs action", test: (r: QuoteRow) => r.needsAction },
  { id: "due", label: "Due today", test: (r: QuoteRow) => r.dueToday },
  { id: "upcoming", label: "Upcoming", test: (r: QuoteRow) => !r.needsAction && !r.closed },
  { id: "closed", label: "Closed", test: (r: QuoteRow) => !r.needsAction && r.closed },
  { id: "all", label: "All", test: () => true },
] as const;

export type FilterId = (typeof FILTERS)[number]["id"];

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** Search by customer, quote reference or registration; spaces and case are ignored. */
export function matchesSearch(r: QuoteRow, term: string): boolean {
  const t = squash(term);
  return !t || [r.q.customerName, r.q.sourceQuoteId, r.q.registration ?? ""].some((v) => squash(v).includes(t));
}
