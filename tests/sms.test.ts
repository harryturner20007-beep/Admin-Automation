import { beforeEach, describe, expect, it } from "vitest";
import { applyDeliveryStatus, confirmBooking, dispatchApproved, receiveInbound, resolveTask, runFollowUpCheck } from "@/domain/engine";
import { markInvoicePaid } from "@/domain/invoices";
import { deliveryLabel, prepareManualSend, smsSegments } from "@/domain/sms";
import type { AppState } from "@/domain/types";
import { checkTransition } from "@/domain/workspace";
import { buildSeedState, DEMO_GARAGE_ID, DEMO_STAFF } from "@/demo/seed";
import { MockSmsProvider } from "@/sms/provider";

let s: AppState;
const q = (id: string) => s.quotes.find((x) => x.id === id)!;
const texts = (quoteId: string) => s.messages.filter((m) => m.direction === "outbound" && m.quoteId === quoteId && !m.invoiceId);
const reply = (from: string, body: string) => receiveInbound(s, { eventId: `SM_in_${s.seq}_${body}`, from, to: s.garages[0].smsNumber, body });

beforeEach(async () => {
  s = await buildSeedState(); // Wed 11 Nov 2026 10:00; Ava (q_ava) is due follow-up 1 today
});

describe("SMS size", () => {
  it("counts GSM parts at 160/153 and switches to 70/67 for emoji or curly quotes", () => {
    expect(smsSegments("a".repeat(160))).toMatchObject({ segments: 1, unicode: false });
    expect(smsSegments("a".repeat(161)).segments).toBe(2);
    expect(smsSegments("£ is fine").unicode).toBe(false);
    expect(smsSegments("Thanks 👍")).toMatchObject({ unicode: true, segments: 1 });
    expect(smsSegments("’".repeat(71)).segments).toBe(2);
  });
});

describe("texting by hand", () => {
  it("replaces the next scheduled follow-up, so the automatic one can't also go", async () => {
    runFollowUpCheck(s); // drafts Ava's follow-up 1 (Draft mode: waiting for approval)
    expect(texts("q_ava").map((m) => m.status)).toEqual(["awaiting_approval"]);
    const m = prepareManualSend(s, { quoteId: "q_ava" }, "Hi Ava, any questions about the brakes quote?", "key-1", DEMO_STAFF);
    expect(texts("q_ava")).toHaveLength(1); // the waiting draft was reused, not duplicated
    expect(m).toMatchObject({ status: "approved", manual: true, step: 1, approvedBy: DEMO_STAFF, fromPhone: s.garages[0].smsNumber });
    const provider = new MockSmsProvider();
    await dispatchApproved(s, provider);
    expect(provider.calls).toBe(1);
    runFollowUpCheck(s); // the scheduler runs again: step 1 is done
    expect(texts("q_ava")).toHaveLength(1);
    expect(deliveryLabel(texts("q_ava")[0]).label).toBe("Queued (simulated)");
  });

  it("a repeated click or retry returns the same text and sends once", async () => {
    const a = prepareManualSend(s, { quoteId: "q_ava" }, "Hello", "key-2", DEMO_STAFF);
    const b = prepareManualSend(s, { quoteId: "q_ava" }, "Hello", "key-2", DEMO_STAFF);
    expect(b).toBe(a);
    const provider = new MockSmsProvider();
    await Promise.all([dispatchApproved(s, provider), dispatchApproved(s, provider)]);
    expect(provider.calls).toBe(1);
  });

  it("a manual follow-up 1 moves follow-up 2 later", async () => {
    s.now = "2026-11-11T11:00:00.000Z";
    prepareManualSend(s, { quoteId: "q_ava" }, "Hi Ava", "key-3", DEMO_STAFF);
    await dispatchApproved(s, new MockSmsProvider());
    s.now = "2026-11-13T10:30:00.000Z"; // when follow-up 2 would normally be due (Fri)
    runFollowUpCheck(s);
    expect(texts("q_ava").filter((m) => m.step === 2)).toHaveLength(0);
  });

  it("refuses opted-out customers, quiet hours and closed quotes; START opts back in", () => {
    reply(q("q_ava").phone, "STOP");
    expect(() => prepareManualSend(s, { quoteId: "q_ava" }, "Hi", "k4", DEMO_STAFF)).toThrow(/opted out/);
    reply(q("q_ava").phone, "START");
    expect(() => prepareManualSend(s, { quoteId: "q_ava" }, "Hi", "k5", DEMO_STAFF)).not.toThrow();
    expect(s.suppressions.find((x) => x.phone === q("q_ava").phone)?.liftedAt).toBeTruthy(); // kept for the record
    s.now = "2026-11-11T21:30:00.000Z";
    expect(() => prepareManualSend(s, { quoteId: "q_tom" }, "Hi", "k6", DEMO_STAFF)).toThrow(/08:00 and 20:00/);
    s.now = "2026-11-11T11:00:00.000Z";
    confirmBooking(s, "q_tom", DEMO_STAFF);
    expect(() => prepareManualSend(s, { quoteId: "q_tom" }, "Hi", "k7", DEMO_STAFF)).toThrow(/open quotes/);
  });

  it("an opt-out recorded after drafting stops the send at the last moment", async () => {
    const m = prepareManualSend(s, { quoteId: "q_ava" }, "Hi", "k8", DEMO_STAFF);
    reply(q("q_ava").phone, "STOP");
    const provider = new MockSmsProvider();
    await dispatchApproved(s, provider);
    expect(provider.calls).toBe(0);
    expect(m.status).toBe("cancelled");
  });

  it("can text about an unpaid invoice, and paying stops any queued reminder", async () => {
    const inv = s.invoices.find((i) => i.number === "INV-0004")!; // Fay, overdue
    const m = prepareManualSend(s, { invoiceId: inv.id }, "Hi Fay, a reminder about INV-0004.", "k9", DEMO_STAFF);
    expect(m).toMatchObject({ invoiceId: inv.id, invoiceStep: 2 }); // takes the place of reminder 2
    markInvoicePaid(s, inv.id, DEMO_STAFF);
    const provider = new MockSmsProvider();
    await dispatchApproved(s, provider);
    expect(provider.calls).toBe(0);
  });
});

describe("delivery updates", () => {
  it("only move forward; duplicates and late updates are ignored", async () => {
    const m = prepareManualSend(s, { quoteId: "q_ava" }, "Hi", "k10", DEMO_STAFF);
    await dispatchApproved(s, new MockSmsProvider());
    const sid = m.providerMessageId!;
    const ev = (status: string, n = status) => applyDeliveryStatus(s, { eventId: `${sid}:${n}`, providerMessageId: sid, status });
    expect(ev("sent")).toBe("applied");
    expect(deliveryLabel(m).label).toBe("Sent (simulated)");
    expect(ev("delivered")).toBe("applied");
    expect(ev("delivered")).toBe("duplicate");
    expect(ev("sent", "sent-late")).toBe("stale");
    expect(ev("failed")).toBe("stale"); // a final result is never replaced
    expect(m.status).toBe("delivered");
  });

  it("a failure says why", async () => {
    const m = prepareManualSend(s, { quoteId: "q_ava" }, "Hi", "k11", DEMO_STAFF);
    await dispatchApproved(s, new MockSmsProvider());
    applyDeliveryStatus(s, { eventId: "x", providerMessageId: m.providerMessageId!, status: "undelivered", error: "The customer's phone is switched off or unreachable" });
    expect(deliveryLabel(m)).toEqual({ label: "Failed", tone: "danger" });
    expect(m.deliveryError).toMatch(/switched off/);
  });
});

describe("customer replies", () => {
  it("a reply from someone with an unpaid invoice holds their reminders until staff resume", async () => {
    const fay = q("q_fay");
    const inv = s.invoices.find((i) => i.quoteId === "q_fay")!;
    const r = reply(fay.phone, "I'll pay on Friday");
    expect(r.outcome).toBe("matched");
    expect(fay.unresolvedReply).toBe(true);
    s.now = "2026-11-17T10:30:00.000Z"; // reminder 2 is due
    const { runInvoiceCheck } = await import("@/domain/invoices");
    runInvoiceCheck(s);
    const provider = new MockSmsProvider();
    await dispatchApproved(s, provider);
    expect(provider.sent.filter((x) => x.to === fay.phone)).toHaveLength(0); // other customers' reminders still go
    const task = s.tasks.find((t) => t.status === "open" && t.quoteIds.includes("q_fay"))!;
    resolveTask(s, task.id, "resume", DEMO_STAFF);
    runInvoiceCheck(s);
    await dispatchApproved(s, provider);
    expect(s.messages.filter((m) => m.invoiceId === inv.id && m.invoiceStep === 2 && m.status === "sent")).toHaveLength(1);
  });

  it("when a reply could be about several quotes or invoices, it stays at customer level and holds all", () => {
    const fay = q("q_fay");
    s.quotes.push({ ...structuredClone(q("q_ava")), id: "q_fay2", phone: fay.phone, customerName: fay.customerName, sourceQuoteId: "NM-2000" });
    const r = reply(fay.phone, "Is that the right amount?");
    expect(r.outcome).toBe("ambiguous");
    expect(r.quoteIds?.sort()).toEqual(["q_fay", "q_fay2"]);
    expect(s.messages.find((m) => m.id === r.messageId)!.quoteId).toBeNull(); // no guess
  });
});

describe("browser saves can't fake texting", () => {
  it("refuses a browser marking a text sent, or removing an opt-out", async () => {
    const prev = await buildSeedState();
    const next = structuredClone(prev);
    const m = next.messages.find((x) => x.direction === "outbound" && x.status === "expired") ?? next.messages.find((x) => x.direction === "outbound")!;
    m.status = "delivered";
    m.providerMessageId = "SMfake";
    expect(checkTransition(prev, next, DEMO_GARAGE_ID)).toMatch(/marked sent by the server/);
    const n2 = structuredClone(prev);
    n2.suppressions.push({ id: "sup_x", garageId: DEMO_GARAGE_ID, phone: "+447700900150", reason: "opt_out", sourceMessageId: "m", createdAt: prev.now });
    const p2 = structuredClone(n2);
    n2.suppressions = [];
    expect(checkTransition(p2, n2, DEMO_GARAGE_ID)).toMatch(/Opt-outs/);
  });
});

describe("repeat sends", () => {
  it("the same words to the same customer within 10 minutes are refused, even with a new request key", () => {
    prepareManualSend(s, { quoteId: "q_ava" }, "Hi Ava", "r1", DEMO_STAFF);
    expect(() => prepareManualSend(s, { quoteId: "q_ava" }, "Hi Ava", "r2", DEMO_STAFF)).toThrow(/just sent/);
    s.now = "2026-11-11T10:11:00.000Z";
    expect(() => prepareManualSend(s, { quoteId: "q_ava" }, "Hi Ava", "r3", DEMO_STAFF)).not.toThrow();
  });
});
