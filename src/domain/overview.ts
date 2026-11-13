// The Overview's counts, worked out from the saved records with the same rules as each list.
import { invoiceView } from "./invoices";
import { jobInTab } from "./jobs";
import { bucketOf } from "./queue";
import type { AppState } from "./types";

export type OverviewItem = { id: string; label: string; count: number; amountPence?: number; href: string; hint: string };

export function overview(state: AppState, garageId: string): OverviewItem[] {
  const quotes = state.quotes.filter((q) => q.garageId === garageId);
  const jobs = state.jobs.filter((j) => j.garageId === garageId);
  const invoices = state.invoices.filter((i) => i.garageId === garageId).map((inv) => ({ inv, st: invoiceView(state, inv).state }));
  const followUp = quotes.filter((q) => bucketOf(state, q) === "staff_needed");
  const drafts = invoices.filter((x) => x.st === "draft");
  const unpaid = invoices.filter((x) => x.st === "unpaid" || x.st === "overdue" || x.st === "needs_call");
  const overdue = invoices.filter((x) => x.st === "overdue" || x.st === "needs_call");
  const sum = (xs: { inv: { amountPence: number } }[]) => xs.reduce((s, x) => s + x.inv.amountPence, 0);
  return [
    { id: "follow_up", label: "Quotes needing staff", count: followUp.length, amountPence: followUp.reduce((s, q) => s + q.amountPence, 0), href: "/quotes?bucket=staff_needed", hint: "Replies to answer, or follow-ups used up" },
    { id: "today", label: "Jobs booked for today", count: jobs.filter((j) => jobInTab(state, j, "today")).length, href: "/jobs", hint: "Not started yet" },
    { id: "in_progress", label: "Jobs in progress", count: jobs.filter((j) => j.status === "in_progress").length, href: "/jobs?tab=in_progress", hint: "Complete them to create the invoice" },
    { id: "to_invoice", label: "Invoices to issue", count: drafts.length, amountPence: sum(drafts), href: "/invoices?filter=draft", hint: "Completed jobs with a draft invoice" },
    { id: "unpaid", label: "Unpaid invoices", count: unpaid.length, amountPence: sum(unpaid), href: "/invoices?filter=unpaid", hint: "Issued, not yet paid" },
    { id: "overdue", label: "Overdue invoices", count: overdue.length, amountPence: sum(overdue), href: "/invoices?filter=overdue", hint: "Past their due date" },
  ];
}
