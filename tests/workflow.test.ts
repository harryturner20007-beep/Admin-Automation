import { beforeEach, describe, expect, it } from "vitest";
import { runScheduledCheck } from "@/domain/automation";
import { cancelInvoice, invoiceView, issueDraftInvoice, markInvoicePaid, runInvoiceCheck, updateInvoiceDraft } from "@/domain/invoices";
import { bookJob, cancelJob, completeJob, jobChanges, progressFor, rescheduleJob, startJob, type CompletionInput } from "@/domain/jobs";
import { lineTotal, netOfVat, totals } from "@/domain/money";
import { followUpFor } from "@/domain/queue";
import type { AppState } from "@/domain/types";
import { checkTransition, migrateState } from "@/domain/workspace";
import { buildSeedState, DEMO_GARAGE_ID, DEMO_STAFF } from "@/demo/seed";
import { MockSmsProvider } from "@/sms/provider";

describe("money", () => {
  it("works in pence, with 2-decimal quantities and VAT rounded down once on the net total", () => {
    expect(lineTotal({ quantity: 1.5, unitPence: 5500 })).toBe(8250);
    expect(lineTotal({ quantity: 0.33, unitPence: 1000 })).toBe(330); // no float drift
    const t = totals({ lines: [{ id: "a", kind: "labour", description: "x", quantity: 1, unitPence: 1001 }], discountPence: 0, vatRatePercent: 20 });
    expect(t).toEqual({ subtotalPence: 1001, discountPence: 0, netPence: 1001, vatPence: 200, totalPence: 1201 }); // 200.2 → 200
    expect(totals({ lines: [{ id: "a", kind: "part", description: "x", quantity: 2, unitPence: 1000 }], discountPence: 500, vatRatePercent: 0 }).totalPence).toBe(1500);
  });

  it("splits an older quote's VAT-inclusive total back to a net that gives the same total", () => {
    for (const gross of [51250, 24000, 89000, 39500, 12345]) { // (a few totals, like 11p, have no exact net under round-down VAT)
      const n = netOfVat(gross, 20);
      expect(n + Math.floor((n * 20) / 100)).toBe(gross);
    }
  });
});

describe("quote → job → invoice → payment", () => {
  let s: AppState;
  const booking = { startAt: "2026-11-12T09:00:00.000Z", durationMins: 120, notes: "Customer waiting", customerConfirmation: "Accepted by phone" };
  const final = (extra = false): CompletionInput => ({
    vatRatePercent: 20,
    discountPence: 0,
    lines: [
      { id: "f1", kind: "part", description: "Front brake pads and discs", quantity: 1, unitPence: 18000 },
      { id: "f2", kind: "labour", description: "Labour", quantity: 1.5, unitPence: 3500 },
      ...(extra ? [{ id: "f3", kind: "part" as const, description: "Brake fluid", quantity: 1, unitPence: 1500 }] : []),
    ],
    extraWorkReason: extra ? "Fluid failed the boiling point test" : "",
    extraWorkAuthorisation: extra ? "Ava agreed by phone 11:40" : "",
    completionNotes: "",
  });
  const texts = (invoiceId: string) => s.messages.filter((m) => m.invoiceId === invoiceId);

  beforeEach(async () => {
    s = await buildSeedState(); // Wed 11 Nov 2026 10:00
  });

  it("booking records acceptance, stops quote chasing, and repeats return the same job", async () => {
    await runScheduledCheck(s, new MockSmsProvider()); // Ava's follow-up 1 is drafted at 10:00
    expect(s.messages.some((m) => m.quoteId === "q_ava" && m.status === "awaiting_approval")).toBe(true);

    const job = bookJob(s, "q_ava", booking, DEMO_STAFF);
    const again = bookJob(s, "q_ava", { ...booking, startAt: "2026-11-20T09:00:00.000Z" }, DEMO_STAFF); // double-click / retry
    expect(again).toBe(job);
    expect(s.jobs.filter((j) => j.quoteId === "q_ava")).toHaveLength(1);
    expect(s.quotes.find((q) => q.id === "q_ava")).toMatchObject({ status: "booked", booking: "confirmed" });
    expect(s.messages.filter((m) => m.quoteId === "q_ava").map((m) => m.status)).toEqual(["cancelled"]);
    expect(followUpFor(s, s.quotes.find((q) => q.id === "q_ava")!).kind).toBe("none");
    expect(job.accepted).toMatchObject({ totalPence: 28500, customerConfirmation: "Accepted by phone" });
    expect(totals(job.accepted).totalPence).toBe(28500); // summary line for an older quote keeps its total
    expect(progressFor(s, "q_ava").steps.map((x) => x.done)).toEqual([true, true, false, false, false]);
  });

  it("full journey: reschedule, start, complete with extra work, issue, chase, pay", async () => {
    const job = bookJob(s, "q_ava", booking, DEMO_STAFF);
    rescheduleJob(s, job.id, "2026-11-11T13:00:00.000Z", 90, "Parts arrived early", DEMO_STAFF);
    expect(s.events.at(-1)!.text).toContain("Parts arrived early");
    startJob(s, job.id, DEMO_STAFF);
    expect(() => completeJob(s, job.id, final(true), DEMO_STAFF)).not.toThrow();

    const draft = s.invoices.find((i) => i.jobId === job.id)!;
    expect(draft).toMatchObject({ status: "draft", number: "" });
    expect(draft.content).toMatchObject({ customer: { name: "Ava Thompson" }, vehicle: { registration: "YK17 FHD" }, jobNumber: job.number, currency: "GBP" });
    expect(draft.totals).toEqual({ subtotalPence: 24750, discountPence: 0, netPence: 24750, vatPence: 4950, totalPence: 29700 });
    expect(job.accepted.lines).toHaveLength(1); // accepted snapshot is kept apart from final charges
    expect(jobChanges(job.accepted, job.final!).toPence - jobChanges(job.accepted, job.final!).fromPence).toBe(1200);

    // Retry of the completion returns the same draft; drafts are never chased.
    expect(completeJob(s, job.id, final(true), DEMO_STAFF)).toBe(draft);
    expect(s.invoices.filter((i) => i.jobId === job.id)).toHaveLength(1);
    runInvoiceCheck(s);
    expect(texts(draft.id)).toHaveLength(0);

    const issued = issueDraftInvoice(s, draft.id, DEMO_STAFF);
    expect(issued).toMatchObject({ status: "unpaid", number: "INV-0006", amountPence: 29700, dueDate: "2026-11-18", issuedBy: DEMO_STAFF });
    expect(issueDraftInvoice(s, draft.id, DEMO_STAFF).number).toBe("INV-0006"); // retry: same number
    expect(texts(draft.id)).toHaveLength(1); // invoice text queued (Automatic invoice texts in the demo)

    // Later edits to the garage or quote don't touch the issued copy.
    s.garages[0].business.address = "New address";
    s.quotes.find((q) => q.id === "q_ava")!.customerName = "Ava T";
    expect(issued.content!.seller.address).toContain("Mill Lane");
    expect(issued.content!.customer.name).toBe("Ava Thompson");
    expect(() => updateInvoiceDraft(s, issued.id, issued.content!, DEMO_STAFF)).toThrow(/Only drafts/);

    await runScheduledCheck(s, new MockSmsProvider());
    expect(texts(issued.id).map((m) => m.status)).toEqual(["delivered"]);
    markInvoicePaid(s, issued.id, DEMO_STAFF);
    expect(invoiceView(s, issued).state).toBe("paid");
    expect(progressFor(s, "q_ava").steps.every((x) => x.done)).toBe(true);
  });

  it("extra work needs a reason and the customer's authorisation", () => {
    const job = bookJob(s, "q_ava", booking, DEMO_STAFF);
    expect(() => completeJob(s, job.id, { ...final(true), extraWorkAuthorisation: "" }, DEMO_STAFF)).toThrow(/authorised/);
    expect(job.status).toBe("booked"); // failed completion leaves the job as it was
    expect(s.invoices.some((i) => i.jobId === job.id)).toBe(false);
  });

  it("issue is refused until billing details are there, and the draft keeps its edits", () => {
    const job = bookJob(s, "q_ava", booking, DEMO_STAFF);
    const draft = completeJob(s, job.id, final(), DEMO_STAFF);
    const next = s.garages[0].business.nextInvoiceNumber;
    updateInvoiceDraft(s, draft.id, { ...draft.content!, customer: { ...draft.content!.customer, address: "" } }, DEMO_STAFF);
    expect(() => issueDraftInvoice(s, draft.id, DEMO_STAFF)).toThrow(/billing address/);
    expect(draft).toMatchObject({ status: "draft", number: "" });
    expect(s.garages[0].business.nextInvoiceNumber).toBe(next); // no number used up by the failure
  });

  it("cancelling an issued invoice keeps it, stops its texts, and the corrected draft gets a new number", () => {
    const job = bookJob(s, "q_ava", booking, DEMO_STAFF);
    const first = issueDraftInvoice(s, completeJob(s, job.id, final(), DEMO_STAFF).id, DEMO_STAFF);
    const redraft = cancelInvoice(s, first.id, "Wrong labour rate", DEMO_STAFF)!;
    expect(first).toMatchObject({ status: "cancelled", number: "INV-0006", cancelReason: "Wrong labour rate" });
    expect(texts(first.id).every((m) => m.status === "cancelled" || m.status === "delivered")).toBe(true);
    expect(redraft).toMatchObject({ status: "draft", replacesId: first.id, jobId: job.id });
    expect(issueDraftInvoice(s, redraft.id, DEMO_STAFF).number).toBe("INV-0007");
    expect(() => cancelInvoice(s, first.id, "again", DEMO_STAFF)).not.toThrow(); // already cancelled: no-op
  });

  it("a cancelled job can't be completed", () => {
    const job = bookJob(s, "q_ava", booking, DEMO_STAFF);
    expect(() => cancelJob(s, job.id, "", DEMO_STAFF)).toThrow(/reason/);
    cancelJob(s, job.id, "Customer sold the car", DEMO_STAFF);
    expect(() => completeJob(s, job.id, final(), DEMO_STAFF)).toThrow(/cancelled/);
  });
});

describe("saved workspaces", () => {
  it("upgrades a copy saved before jobs existed; its invoices keep working", async () => {
    const s = await buildSeedState();
    const old = JSON.parse(JSON.stringify(s));
    delete old.jobs;
    for (const g of old.garages) delete g.business;
    for (const i of old.invoices) {
      delete i.jobId;
      delete i.content;
      delete i.totals;
    }
    const m = migrateState(old);
    expect(m.jobs).toEqual([]);
    expect(m.garages[0].business.nextInvoiceNumber).toBe(m.invoices.filter((i) => i.number).length + 1); // James's draft has no number yet
    expect(m.invoices.some((i) => i.status === "draft")).toBe(true);
    expect(invoiceView(m, m.invoices.find((i) => i.number === "INV-0004")!).state).toBe("overdue");
    markInvoicePaid(m, m.invoices.find((i) => i.number === "INV-0004")!.id, DEMO_STAFF);
    expect(() => migrateState({ hello: 1 })).toThrow();
  });

  describe("server check on browser saves", () => {
    let prev: AppState;
    let next: AppState;
    beforeEach(async () => {
      prev = await buildSeedState();
      next = structuredClone(prev);
    });
    const check = () => checkTransition(prev, next, DEMO_GARAGE_ID);

    it("accepts normal work", () => {
      bookJob(next, "q_ava", { startAt: "2026-11-12T09:00:00.000Z", notes: "", customerConfirmation: "ok" }, DEMO_STAFF);
      markInvoicePaid(next, next.invoices.find((i) => i.status === "unpaid")!.id, DEMO_STAFF);
      expect(check()).toBeNull();
    });
    it("refuses rewriting history or issued invoices", () => {
      next.events[0].text = "edited";
      expect(check()).toMatch(/History/);
      next = structuredClone(prev);
      next.events.pop();
      expect(check()).toMatch(/removed/);
      next = structuredClone(prev);
      next.invoices.find((i) => i.status === "unpaid")!.amountPence = 1;
      expect(check()).toMatch(/can't be changed/);
    });
    it("refuses invoices issued in the browser, a second job for a quote, and other garages' records", () => {
      const job = bookJob(next, "q_ava", { startAt: "2026-11-12T09:00:00.000Z", notes: "", customerConfirmation: "ok" }, DEMO_STAFF);
      const draft = completeJob(next, job.id, { lines: [{ id: "a", kind: "other", description: "x", quantity: 1, unitPence: 100 }], discountPence: 0, vatRatePercent: 20, extraWorkReason: "", extraWorkAuthorisation: "", completionNotes: "" }, DEMO_STAFF);
      expect(check()).toBeNull();
      issueDraftInvoice(next, draft.id, DEMO_STAFF);
      expect(check()).toMatch(/issued by the server/);
      next = structuredClone(prev);
      next.jobs.push({ ...next.jobs[0], id: "job_dupe" });
      expect(check()).toMatch(/one job per quote/);
      next = structuredClone(prev);
      next.quotes[0].garageId = "g_other";
      expect(check()).toMatch(/belong/);
    });
  });
});

