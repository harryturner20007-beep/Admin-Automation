// Phase 1 versions of the acceptance tests, run against the in-memory store and
// the mock SMS provider. Phase 2/3 re-run the same scenarios against Postgres.
import { beforeEach, describe, expect, it } from "vitest";
import {
  approveMessage,
  confirmBooking,
  confirmStatus,
  dispatchApproved,
  receiveInbound,
  reconcileSend,
  resolveTask,
  runFollowUpCheck,
  setGaragePaused,
  applyDeliveryStatus,
} from "@/domain/engine";
import { computeResults } from "@/domain/reporting";
import type { AppState, Quote } from "@/domain/types";
import { MockSmsProvider } from "@/sms/provider";
import { buildSeedState, DEMO_GARAGE_ID, DEMO_STAFF, emptyState } from "@/demo/seed";

const GARAGE_NO = "+447700900999";
let s: AppState;

const q = (id: string) => s.quotes.find((x) => x.id === id)!;
const outbound = (quoteId: string) => s.messages.filter((m) => m.direction === "outbound" && m.quoteId === quoteId);
const draftFor = (quoteId: string, step: 1 | 2) => outbound(quoteId).find((m) => m.step === step);

async function approveAndSend(quoteId: string, step: 1 | 2, provider = new MockSmsProvider()) {
  approveMessage(s, draftFor(quoteId, step)!.id, DEMO_STAFF);
  return dispatchApproved(s, provider);
}

describe("seeded demo (five cases at Wed 11 Nov 10:00)", () => {
  beforeEach(async () => {
    s = await buildSeedState();
  });

  it("drafts only Ava's step 1; the four others are blocked for the right reason", () => {
    const report = runFollowUpCheck(s);
    const byQuote = Object.fromEntries(report.map((r) => [r.quoteId, r]));
    expect(byQuote.q_ava).toMatchObject({ outcome: "drafted", step: 1 });
    expect(byQuote.q_chloe).toMatchObject({ outcome: "blocked", reasons: ["unresolved_reply"] }); // ordinary reply before 2nd reminder
    expect(byQuote.q_dan).toMatchObject({ outcome: "blocked", reasons: ["number_suppressed"] }); // STOP
    expect(byQuote.q_emma).toMatchObject({ outcome: "blocked", reasons: ["status_not_open"] }); // booked before send
    expect(byQuote.q_ben).toBeUndefined(); // step 2 not due until Thu
    expect(draftFor("q_ava", 1)?.status).toBe("awaiting_approval");
  });

  it("does not send anything without staff approval", async () => {
    runFollowUpCheck(s);
    const provider = new MockSmsProvider();
    await dispatchApproved(s, provider);
    expect(provider.calls).toBe(0);
    await approveAndSend("q_ava", 1, provider);
    expect(provider.calls).toBe(1);
    expect(draftFor("q_ava", 1)).toMatchObject({ status: "sent" });
    expect(draftFor("q_ava", 1)!.providerMessageId).toMatch(/^SMmock/);
  });

  it("simultaneous worker runs create one draft and make one provider call per step", async () => {
    // Two scheduler invocations at the same moment
    runFollowUpCheck(s);
    const second = runFollowUpCheck(s);
    expect(second.find((r) => r.quoteId === "q_ava")?.outcome).toBe("already_handled");
    expect(outbound("q_ava").filter((m) => m.step === 1)).toHaveLength(1);

    approveMessage(s, draftFor("q_ava", 1)!.id, DEMO_STAFF);
    const provider = new MockSmsProvider("accept", 5);
    const [a, b] = await Promise.all([dispatchApproved(s, provider), dispatchApproved(s, provider)]);
    expect(provider.calls).toBe(1);
    expect([...a, ...b].filter((r) => r.outcome === "sent")).toHaveLength(1);
  });

  it("STOP suppresses the number before classification and cancels pending drafts", () => {
    runFollowUpCheck(s);
    const r = receiveInbound(s, { eventId: "SMin_x1", from: q("q_ava").phone, to: GARAGE_NO, body: "Stop" });
    expect(r.outcome).toBe("opt_out");
    expect(s.suppressions.some((x) => x.phone === q("q_ava").phone)).toBe(true);
    expect(draftFor("q_ava", 1)!.status).toBe("cancelled");
    expect(q("q_ava").booking).toBe("none");
  });

  it("an ordinary reply pauses the quote so the second reminder never goes", async () => {
    runFollowUpCheck(s);
    await approveAndSend("q_ava", 1);
    receiveInbound(s, { eventId: "SMin_x2", from: q("q_ava").phone, to: GARAGE_NO, body: "Thanks, I'll think about it" });
    expect(q("q_ava").unresolvedReply).toBe(true);
    s.now = "2026-11-16T10:00:00.000Z"; // step 2 day
    confirmStatus(s, "q_ava", "open", DEMO_STAFF);
    const report = runFollowUpCheck(s);
    expect(report.find((x) => x.quoteId === "q_ava")).toMatchObject({ outcome: "blocked", reasons: ["unresolved_reply"] });
    expect(draftFor("q_ava", 2)).toBeUndefined();
  });

  it("a quote booked after approval but before send is blocked at the final gate", async () => {
    runFollowUpCheck(s);
    approveMessage(s, draftFor("q_ava", 1)!.id, DEMO_STAFF);
    q("q_ava").status = "booked"; // e.g. status feed update that bypassed the UI
    const provider = new MockSmsProvider();
    const report = await dispatchApproved(s, provider);
    expect(provider.calls).toBe(0);
    expect(report[0]).toMatchObject({ outcome: "blocked" });
    expect(draftFor("q_ava", 1)!.status).toBe("cancelled");
  });

  it("an ambiguous SMS timeout is marked for reconciliation and never auto-retried", async () => {
    runFollowUpCheck(s);
    const provider = new MockSmsProvider("timeout");
    const r = await approveAndSend("q_ava", 1, provider);
    expect(r[0].outcome).toBe("needs_reconciliation");
    expect(draftFor("q_ava", 1)!.status).toBe("needs_reconciliation");
    expect(s.tasks.some((t) => t.kind === "reconcile_send" && t.status === "open")).toBe(true);

    provider.mode = "accept";
    await dispatchApproved(s, provider); // later worker run
    expect(provider.calls).toBe(1); // still only the original attempt
    runFollowUpCheck(s);
    expect(outbound("q_ava").filter((m) => m.step === 1)).toHaveLength(1);

    reconcileSend(s, draftFor("q_ava", 1)!.id, "was_sent", "SMfromLog");
    expect(draftFor("q_ava", 1)!.status).toBe("sent");
  });

  it("the garage pause switch blocks drafting and sending", async () => {
    runFollowUpCheck(s);
    approveMessage(s, draftFor("q_ava", 1)!.id, DEMO_STAFF);
    setGaragePaused(s, DEMO_GARAGE_ID, true, DEMO_STAFF);
    const provider = new MockSmsProvider();
    const r = await dispatchApproved(s, provider);
    expect(provider.calls).toBe(0);
    expect(r[0].reasons).toContain("garage_paused");
    expect(draftFor("q_ava", 1)!.status).toBe("awaiting_approval"); // back to staff, not lost

    setGaragePaused(s, DEMO_GARAGE_ID, false, DEMO_STAFF);
    await approveAndSend("q_ava", 1, provider);
    expect(provider.calls).toBe(1);
  });

  it("a booking request only becomes a booking when staff confirm it", () => {
    expect(q("q_ben")).toMatchObject({ booking: "requested", status: "open" });
    expect(computeResults(s, DEMO_GARAGE_ID).confirmedBookings).toBe(4); // booked after a follow-up: Emma, Zara, Hannah, James
    confirmBooking(s, "q_ben", DEMO_STAFF);
    expect(q("q_ben")).toMatchObject({ booking: "confirmed", status: "booked", unresolvedReply: false });
    expect(computeResults(s, DEMO_GARAGE_ID).confirmedBookings).toBe(5);
  });

  it("a draft not sent by closing time moves to the next opening instead of being dropped", () => {
    runFollowUpCheck(s);
    s.now = "2026-11-11T17:30:00.000Z"; // Wed closing time
    const r = runFollowUpCheck(s);
    expect(r.find((x) => x.quoteId === "q_ava")?.outcome).toBe("moved");
    expect(draftFor("q_ava", 1)).toMatchObject({ status: "awaiting_approval", windowStart: "2026-11-12T08:30:00.000Z" }); // Thu opening
    expect(runFollowUpCheck(s).find((x) => x.quoteId === "q_ava")?.outcome).not.toBe("moved"); // moved once, not every check
  });

  it("a follow-up whose time passed with no check at all still goes, at the next opening, one step at a time", () => {
    s.now = "2026-11-18T09:00:00.000Z"; // a week with no checks: both of Ava's steps are past
    runFollowUpCheck(s);
    expect(s.messages.filter((m) => m.quoteId === "q_ava" && m.direction === "outbound").map((m) => [m.step, m.status, m.windowStart])).toEqual([[1, "awaiting_approval", "2026-11-18T09:00:00.000Z"]]);
  });

  it("a stale status confirmation blocks the send until staff re-confirm", async () => {
    runFollowUpCheck(s);
    approveMessage(s, draftFor("q_ava", 1)!.id, DEMO_STAFF);
    q("q_ava").statusConfirmedAt = "2026-11-10T08:00:00.000Z";
    const r = await dispatchApproved(s, new MockSmsProvider());
    expect(r[0].reasons).toContain("status_stale");
    expect(draftFor("q_ava", 1)!.status).toBe("approved"); // held, not sent back for approval
    confirmStatus(s, "q_ava", "open", DEMO_STAFF);
    const r2 = await dispatchApproved(s, new MockSmsProvider());
    expect(r2[0].outcome).toBe("sent");
  });

  it("deduplicates repeated inbound and delivery events", async () => {
    runFollowUpCheck(s);
    await approveAndSend("q_ava", 1);
    const pmid = draftFor("q_ava", 1)!.providerMessageId!;
    expect(applyDeliveryStatus(s, { eventId: "e1", providerMessageId: pmid, status: "delivered" })).toBe("applied");
    expect(applyDeliveryStatus(s, { eventId: "e1", providerMessageId: pmid, status: "delivered" })).toBe("duplicate");
    const before = s.tasks.length;
    receiveInbound(s, { eventId: "SMin_dup", from: q("q_ava").phone, to: GARAGE_NO, body: "Can I book?" });
    receiveInbound(s, { eventId: "SMin_dup", from: q("q_ava").phone, to: GARAGE_NO, body: "Can I book?" });
    expect(s.tasks.length).toBe(before + 1);
  });
});

describe("ambiguous quote matching", () => {
  it("pauses every open quote for the number and creates one staff task", () => {
    s = emptyState("2026-11-11T10:00:00.000Z");
    const base = s.quotes[0];
    const second: Quote = { ...base, id: "q_ava_2", sourceQuoteId: "NM-1050", job: "MOT and service" };
    s.quotes = [base, second];
    const r = receiveInbound(s, { eventId: "SMin_amb", from: base.phone, to: GARAGE_NO, body: "Yes please book it in" });
    expect(r.outcome).toBe("ambiguous");
    expect(s.quotes.every((x) => x.unresolvedReply)).toBe(true);
    expect(s.quotes.every((x) => x.booking === "none")).toBe(true); // no guessing
    const tasks = s.tasks.filter((t) => t.kind === "ambiguous_match");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].quoteIds.sort()).toEqual(["q_ava", "q_ava_2"]);

    resolveTask(s, tasks[0].id, "resume", DEMO_STAFF);
    expect(s.quotes.every((x) => !x.unresolvedReply)).toBe(true);
  });
});

describe("not covered in Phase 1 (need Postgres)", () => {
  it.todo("duplicate CSV imports upsert by garage + source quote ID and preserve sends/replies/suppressions");
  it.todo("cross-garage access: garage A cannot read or mutate garage B rows (RLS)");
  it.todo("simultaneous worker runs against Postgres: unique (garage, quote, revision, step) + atomic claim");
});

describe("demo reset", () => {
  it("rebuilds the same starting point every time, so the walkthrough repeats exactly", async () => {
    // Mock provider message IDs are random by design; everything else must match.
    const strip = (s: AppState) => JSON.stringify(s).replace(/SMmock[0-9a-f]+/g, "SMmock");
    expect(strip(await buildSeedState())).toBe(strip(await buildSeedState()));
  });
});

describe("results date filter", () => {
  it("counts each event in the period it happened", async () => {
    const st = await buildSeedState();
    const all = computeResults(st, DEMO_GARAGE_ID);
    const thisWeek = computeResults(st, DEMO_GARAGE_ID, { from: "2026-11-09T00:00:00.000Z", to: "2026-11-12T00:00:00.000Z" });
    expect(all.quotesFollowedUp).toBe(13); // every seeded quote that got at least one follow-up since 15 Oct
    expect(thisWeek.quotesFollowedUp).toBe(3); // first follow-ups this week: Ben and Grace (Mon), Mohammed (Tue)
    expect(thisWeek.optOuts).toBe(0); // Daniel's STOP was on Fri 6 Nov
    expect(all.optOuts).toBe(1);
    expect(thisWeek.bookingRequests).toBe(2); // Ben (Mon 9 Nov), Liam (Tue 10 Nov)
  });
});
