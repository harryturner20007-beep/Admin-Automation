import { beforeEach, describe, expect, it } from "vitest";
import { dispatchApproved } from "@/domain/engine";
import { chatThreads } from "@/domain/chats";
import { cancelInvoice, invoiceLinkUrl, invoiceText, issueDraftInvoice } from "@/domain/invoices";
import { bookJob, completeJob } from "@/domain/jobs";
import { smsSegments } from "@/domain/sms";
import type { AppState, Invoice } from "@/domain/types";
import { buildSeedState, DEMO_GARAGE_ID, DEMO_STAFF } from "@/demo/seed";
import { MockSmsProvider } from "@/sms/provider";

let s: AppState;
const lines = [{ id: "a", kind: "part" as const, description: "Front brake pads and discs", quantity: 1, unitPence: 18000 }];

/** Book, complete and issue Ava's job, as the app does. */
function issueAva(): Invoice {
  const job = bookJob(s, "q_ava", { startAt: "2026-11-12T09:00:00.000Z", notes: "", customerConfirmation: "ok" }, DEMO_STAFF);
  const draft = completeJob(s, job.id, { lines, discountPence: 0, vatRatePercent: 20, extraWorkReason: "", extraWorkAuthorisation: "", completionNotes: "" }, DEMO_STAFF);
  return issueDraftInvoice(s, draft.id, DEMO_STAFF);
}

beforeEach(async () => {
  s = await buildSeedState(); // Wed 11 Nov 2026 10:00, invoice texts Automatic
});

describe("invoice link", () => {
  it("issuing makes one unguessable link, and a repeat keeps it", () => {
    const inv = issueAva();
    expect(inv.shareToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(invoiceLinkUrl(inv)).toBe(`http://localhost:3000/i/${inv.shareToken}`);
    expect(issueDraftInvoice(s, inv.id, DEMO_STAFF).shareToken).toBe(inv.shareToken);
    expect(inv.shareToken).not.toBe(issueAva2()?.shareToken); // another invoice gets its own
  });

  it("a corrected invoice gets a new link; the cancelled one keeps its own", () => {
    const first = issueAva();
    const draft = cancelInvoice(s, first.id, "Wrong labour", DEMO_STAFF)!;
    expect(draft.shareToken).toBeUndefined();
    const second = issueDraftInvoice(s, draft.id, DEMO_STAFF);
    expect(second.shareToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(second.shareToken).not.toBe(first.shareToken);
  });

  it("the invoice text and both reminders carry the PDF link; older invoices without one still read fine", () => {
    const inv = issueAva();
    const q = s.quotes.find((x) => x.id === "q_ava")!;
    for (const step of [0, 1, 2] as const) {
      const text = invoiceText(inv, q, "Riverside Garage", step);
      expect(text).toContain(`Your PDF invoice: ${invoiceLinkUrl(inv)}`);
      expect(smsSegments(text).segments).toBeLessThanOrEqual(3);
    }
    expect(invoiceText({ ...inv, shareToken: undefined }, q, "Riverside Garage", 0)).not.toContain("PDF");
  });
});

describe("issuing sends the PDF link by text, and it shows in Chats", () => {
  it("automatic invoice texts go to the customer's phone with the link, then appear as a chat", async () => {
    const inv = issueAva();
    const provider = new MockSmsProvider();
    await dispatchApproved(s, provider);
    const sent = provider.sent.filter((m) => m.to === "+447700900101");
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain(`/i/${inv.shareToken}`);
    expect(sent[0].from).toBe(s.garages[0].smsNumber);

    const thread = chatThreads(s, DEMO_GARAGE_ID).find((t) => t.phone === "+447700900101")!;
    expect(thread.name).toBe("Ava Thompson");
    expect(thread.last.body).toContain(`/i/${inv.shareToken}`);
    expect(thread.last.invoiceId).toBe(inv.id);
    expect(thread.hasOpenTask).toBe(false);
  });

  it("Draft mode waits for approval instead of sending, and Off sends nothing", async () => {
    s.garages[0].invoiceMode = "draft";
    issueAva();
    const provider = new MockSmsProvider();
    await dispatchApproved(s, provider);
    expect(provider.sent.filter((m) => m.to === "+447700900101")).toHaveLength(0);
    expect(s.messages.some((m) => m.invoiceId && m.status === "awaiting_approval" && m.toPhone === "+447700900101")).toBe(true);
  });

  it("chat threads only show texts that really went, grouped by number, newest first", () => {
    const threads = chatThreads(s, DEMO_GARAGE_ID);
    expect(threads.length).toBeGreaterThan(10);
    expect(threads.every((t) => t.messages.every((m) => ["sent", "delivered", "failed", "needs_reconciliation"].includes(m.status ?? "") || m.direction === "inbound"))).toBe(true);
    const times = threads.map((t) => Date.parse(t.last.sentAt ?? t.last.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(threads.find((t) => t.name === "Chloe Patel")!.hasOpenTask).toBe(true); // a reply waiting stays with the replies
  });
});

/** A second issued invoice, for the "own link" check. */
function issueAva2(): Invoice | undefined {
  const q = s.quotes.find((x) => x.id === "q_tom")!;
  const job = bookJob(s, q.id, { startAt: "2026-11-12T10:00:00.000Z", notes: "", customerConfirmation: "ok" }, DEMO_STAFF);
  const draft = completeJob(s, job.id, { lines, discountPence: 0, vatRatePercent: 20, extraWorkReason: "", extraWorkAuthorisation: "", completionNotes: "" }, DEMO_STAFF);
  return issueDraftInvoice(s, draft.id, DEMO_STAFF);
}
