// Status label for the Quotes workspace: the existing status names, plus the staff outcome while a quote stays open.
import { isSuppressed } from "@/domain/gate";
import { OUTCOME_LABEL } from "@/domain/queue";
import type { AppState, Quote } from "@/domain/types";
import type { StatusTone } from "./ui";

export function statusOf(state: AppState, q: Quote): { label: string; tone: StatusTone } {
  if (q.status === "completed") return { label: "Job completed", tone: "success" };
  if (q.status === "booked") return { label: "Booked", tone: "success" };
  if (q.status === "declined") return { label: "Declined", tone: "neutral" };
  if (q.status === "cancelled") return { label: "Cancelled", tone: "neutral" };
  if (q.status === "expired") return { label: "Expired", tone: "neutral" };
  if (isSuppressed(state.suppressions, q.garageId, q.phone)) return { label: "Opted out", tone: "danger" };
  if (q.booking === "requested") return { label: "Booking requested", tone: "attention" };
  if (q.unresolvedReply) return { label: "Reply waiting", tone: "attention" };
  if (q.outcome) return { label: OUTCOME_LABEL[q.outcome], tone: "attention" };
  return { label: "Open", tone: "neutral" };
}
