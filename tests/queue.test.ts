import { beforeEach, describe, expect, it } from "vitest";
import { advanceDemoClock } from "@/domain/automation";
import { applyFollowUpSettings } from "@/domain/settings";
import { DEFAULT_TEMPLATES } from "@/domain/templates";
import { bucketOf, composeMessage, followUpFor, priorityCompare, recordContactAttempt, recordOutcome, reminderDate } from "@/domain/queue";
import { DAY_MS } from "@/domain/time";
import type { AppState } from "@/domain/types";
import { buildSeedState, DEMO_GARAGE_ID, DEMO_STAFF } from "@/demo/seed";
import { MockSmsProvider } from "@/sms/provider";

let s: AppState;
const ORIGINAL = ["q_ava", "q_ben", "q_chloe", "q_dan", "q_emma", "q_fay"]; // the walkthrough cases; the rest is background
const q = (id: string) => s.quotes.find((x) => x.id === id)!;

describe("chase queue", () => {
  beforeEach(async () => {
    s = await buildSeedState(); // Wed 11 Nov 2026 10:00
  });

  it("buckets the seeded quotes from the real records", () => {
    const b = Object.fromEntries(s.quotes.filter((x) => ORIGINAL.includes(x.id)).map((x) => [x.id, bucketOf(s, x)]));
    expect(b).toEqual({
      q_ava: "needs_follow_up", // follow-up 1 due today
      q_ben: "needs_follow_up", // booking request waiting
      q_chloe: "needs_follow_up", // price question waiting
      q_dan: "other", // opted out
      q_emma: "accepted", // booked
      q_fay: "accepted", // job completed and invoiced
    });
    expect(followUpFor(s, q("q_ava"))).toMatchObject({ kind: "today", label: "Today" });
  });

  it("Needs time sets a reminder that becomes overdue, and holds automatic follow-ups until then", async () => {
    recordOutcome(s, "q_ava", "needs_time", DEMO_STAFF, reminderDate(s, "tomorrow")); // Thu 12 Nov
    expect(q("q_ava")).toMatchObject({ outcome: "needs_time", reminderDate: "2026-11-12" });
    expect(bucketOf(s, q("q_ava"))).toBe("awaiting_reply");
    expect(followUpFor(s, q("q_ava")).label).toBe("12 Nov");
    applyFollowUpSettings(s, DEMO_GARAGE_ID, { mode: "automatic", followUps: s.garages[0].followUps, templates: DEFAULT_TEMPLATES }, DEMO_STAFF);
    const provider = new MockSmsProvider();
    s.now = new Date(Date.parse(s.now) + 3 * DAY_MS).toISOString(); // Sat 14 Nov, no checks run in between
    expect(followUpFor(s, q("q_ava"))).toMatchObject({ kind: "overdue", label: "2 days overdue" });
    expect(bucketOf(s, q("q_ava"))).toBe("needs_follow_up");
    await advanceDemoClock(s, 15 * 60 * 1000, provider);
    expect(provider.sent.filter((m) => m.to === q("q_ava").phone)).toHaveLength(0); // step 1 window long gone; nothing sent late
  });

  it("a future reminder blocks an automatic send that would otherwise go today", async () => {
    applyFollowUpSettings(s, DEMO_GARAGE_ID, { mode: "automatic", followUps: [{ enabled: true, businessDays: 2, sendTime: "11:30" }, s.garages[0].followUps[1]], templates: DEFAULT_TEMPLATES }, DEMO_STAFF);
    recordOutcome(s, "q_ava", "no_reply", DEMO_STAFF, reminderDate(s, "3days"));
    const provider = new MockSmsProvider();
    await advanceDemoClock(s, 3 * 60 * 60 * 1000, provider); // past 11:30
    expect(provider.sent.filter((m) => m.to === q("q_ava").phone)).toHaveLength(0);
  });

  it("Accepted books the quote and resolves the waiting reply; Declined closes it", () => {
    recordOutcome(s, "q_ben", "accepted", DEMO_STAFF);
    expect(q("q_ben")).toMatchObject({ status: "booked", booking: "confirmed", unresolvedReply: false });
    expect(s.tasks.filter((t) => t.quoteIds.includes("q_ben") && t.status === "open")).toHaveLength(0);
    recordOutcome(s, "q_chloe", "declined", DEMO_STAFF);
    expect(q("q_chloe").status).toBe("declined");
    expect(() => recordOutcome(s, "q_chloe", "accepted", DEMO_STAFF)).toThrow(/closed/);
  });

  it("rejects a reminder in the past or missing", () => {
    expect(() => recordOutcome(s, "q_ava", "needs_time", DEMO_STAFF)).toThrow(/choose when/);
    expect(() => recordOutcome(s, "q_ava", "no_reply", DEMO_STAFF, "2026-11-10")).toThrow(/later date/);
  });

  it("opening an external app leaves the quote waiting for an outcome; copying does not", () => {
    recordContactAttempt(s, "q_ava", "copy", DEMO_STAFF);
    expect(q("q_ava").contactPendingAt).toBeUndefined();
    recordContactAttempt(s, "q_ava", "messages_app", DEMO_STAFF);
    expect(followUpFor(s, q("q_ava")).kind).toBe("outcome_needed");
    recordOutcome(s, "q_ava", "no_reply", DEMO_STAFF, reminderDate(s, "3days"));
    expect(q("q_ava").contactPendingAt).toBeUndefined();
    expect(() => recordContactAttempt(s, "q_dan", "messages_app", DEMO_STAFF)).toThrow(/opted out/);
  });

  it("sorts overdue first, then due today, then most recently updated", () => {
    recordOutcome(s, "q_chloe", "needs_time", DEMO_STAFF, "2026-11-11"); // today
    s.quotes.find((x) => x.id === "q_ava")!.reminderDate = "2026-11-09"; // 2 days overdue
    const order = s.quotes.filter((x) => x.status === "open").sort(priorityCompare(s)).map((x) => x.id);
    expect(order[0]).toBe("q_ava");
    expect(followUpFor(s, q("q_ava")).label).toBe("2 days overdue");
    expect(order[1]).toBe("q_olivia"); // seeded reminder, 1 day overdue
    expect(order.slice(2, 7).sort()).toEqual(["q_ben", "q_chloe", "q_liam", "q_mo", "q_tom"]); // due today / reply waiting
    expect(order.indexOf("q_dan")).toBeGreaterThan(6); // nothing to chase
  });

  it("composes the friendly reminder from the quote's details", () => {
    expect(composeMessage({ ...q("q_ava"), customerJobDescription: "front brake pads" }, "reminder")).toBe(
      "Hi Ava, just checking whether you'd like to go ahead with the £285 quote for front brake pads. Happy to answer any questions.",
    );
  });
});
