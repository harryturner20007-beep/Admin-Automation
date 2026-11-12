import { beforeEach, describe, expect, it } from "vitest";
import { approveMessage, confirmStatus, dispatchApproved, receiveInbound, runFollowUpCheck } from "@/domain/engine";
import {
  addQuote,
  normaliseRegistration,
  normaliseUkMobile,
  parsePoundsToPence,
  QuoteValidationError,
  validateQuoteInput,
  type QuoteInput,
} from "@/domain/intake";
import { DAY_MS } from "@/domain/time";
import type { AppState } from "@/domain/types";
import { buildSeedState, DEMO_GARAGE_ID, DEMO_STAFF } from "@/demo/seed";
import { MockSmsProvider } from "@/sms/provider";
import { advanceDemoClock as advance } from "@/domain/automation";

const mock = new MockSmsProvider();
const advanceDemoClock = (state: AppState, ms: number) => advance(state, ms, mock);

describe("intake parsing", () => {
  it.each([
    ["07700 900123", "+447700900123"],
    ["+44 7700 900123", "+447700900123"],
    ["+44 (0)7700-900123", "+447700900123"],
    ["0044 7700 900123", "+447700900123"],
    ["447700900123", "+447700900123"],
  ])("normalises %j to E.164", (input, out) => expect(normaliseUkMobile(input)).toBe(out));

  it.each(["0207 946 0000", "07700 90012", "+1 415 555 0100", "hello"])("rejects %j as a UK mobile", (input) => {
    expect(normaliseUkMobile(input)).toBeNull();
  });

  it.each([["340", 34000], ["£340.5", 34050], ["1,234.56", 123456]])("parses %j to %d pence", (i, p) => expect(parsePoundsToPence(i)).toBe(p));
  it.each(["0", "-5", "12.345", "abc", ""])("rejects price %j", (i) => expect(parsePoundsToPence(i)).toBeNull());

  it("formats registrations", () => {
    expect(normaliseRegistration(" ab12cde ")).toBe("AB12 CDE");
    expect(normaliseRegistration("w123 abc")).toBe("W123ABC");
  });
});

let s: AppState;
const input = (over: Partial<QuoteInput> = {}): QuoteInput => ({
  customerName: "Sam Rivers",
  phone: "07700 900321",
  reference: "",
  job: "Front suspension arms",
  price: "340",
  vehicle: "2014 Honda Civic",
  registration: "ab14 xyz",
  sentAt: s.now,
  smsEligible: true,
  evidenceRef: "Phone call 11 Nov: agreed to SMS",
  ...over,
});

describe("adding a quote", () => {
  beforeEach(async () => {
    s = await buildSeedState();
  });

  it("stores E.164, integer pence, UTC and a generated reference", () => {
    const q = addQuote(s, DEMO_GARAGE_ID, input(), DEMO_STAFF);
    expect(q).toMatchObject({ phone: "+447700900321", amountPence: 34000, sourceQuoteId: "Q-1001", registration: "AB14 XYZ", quoteSentAt: s.now, status: "open" });
    expect(addQuote(s, DEMO_GARAGE_ID, input({ phone: "07700 900322" }), DEMO_STAFF).sourceQuoteId).toBe("Q-1002");
  });

  it("rejects a duplicate reference in the same garage and points at the existing quote", () => {
    const errors = validateQuoteInput(s, DEMO_GARAGE_ID, input({ reference: "nm-1042" }));
    expect(errors.duplicateOf).toBe("q_ava");
    expect(() => addQuote(s, DEMO_GARAGE_ID, input({ reference: "NM-1042" }), DEMO_STAFF)).toThrow(QuoteValidationError);
    expect(s.quotes.filter((q) => q.sourceQuoteId === "NM-1042")).toHaveLength(1);
  });

  it("requires evidence only when SMS follow-up is switched on", () => {
    expect(validateQuoteInput(s, DEMO_GARAGE_ID, input({ evidenceRef: "" })).evidenceRef).toBeDefined();
    expect(validateQuoteInput(s, DEMO_GARAGE_ID, input({ smsEligible: false, evidenceRef: "" }))).toEqual({});
  });

  it("rejects a send time in the future", () => {
    expect(validateQuoteInput(s, DEMO_GARAGE_ID, input({ sentAt: new Date(Date.parse(s.now) + DAY_MS).toISOString() })).sentAt).toBeDefined();
  });
});

describe("simulated automation (the meeting scenario)", () => {
  beforeEach(async () => {
    s = await buildSeedState();
  });

  it("drafts exactly one first follow-up when due, even when checks repeat", async () => {
    const q = addQuote(s, DEMO_GARAGE_ID, input(), DEMO_STAFF); // Wed 11 Nov 10:00 -> step 1 due Fri 13 Nov 10:00
    await advanceDemoClock(s, DAY_MS); // Thu: not due
    expect(s.messages.filter((m) => m.quoteId === q.id)).toHaveLength(0);
    const r = (await advanceDemoClock(s, DAY_MS))!; // ticks through to Fri 10:00
    expect(r.check.find((x) => x.quoteId === q.id)?.outcome).toBe("drafted");
    runFollowUpCheck(s);
    await advanceDemoClock(s, 3_600_000);
    expect(s.messages.filter((m) => m.quoteId === q.id && m.direction === "outbound")).toHaveLength(1);
    expect(s.garages[0].lastCheckAt).toBe(s.now);
  });

  it("a booking request after the first follow-up stops the second", async () => {
    const q = addQuote(s, DEMO_GARAGE_ID, input(), DEMO_STAFF);
    await advanceDemoClock(s, 2 * DAY_MS);
    const draft = s.messages.find((m) => m.quoteId === q.id)!;
    confirmStatus(s, q.id, "open", DEMO_STAFF); // 48h-old confirmation would (rightly) block the send
    approveMessage(s, draft.id, DEMO_STAFF);
    const sent = await dispatchApproved(s, new MockSmsProvider());
    expect(sent[0].outcome).toBe("sent");
    receiveInbound(s, { eventId: "SMin_t1", from: q.phone, to: s.garages[0].smsNumber, body: "Yes please, can I book it in?" });
    await advanceDemoClock(s, 5 * DAY_MS); // past step 2 on Wed 18 Nov
    expect(s.messages.filter((m) => m.quoteId === q.id && m.direction === "outbound" && m.step === 2)).toHaveLength(0);
    expect(s.tasks.some((t) => t.kind === "booking_request" && t.quoteIds.includes(q.id))).toBe(true);
  });

  it("never drafts for a quote saved without SMS eligibility", async () => {
    const q = addQuote(s, DEMO_GARAGE_ID, input({ smsEligible: false, evidenceRef: "" }), DEMO_STAFF);
    await advanceDemoClock(s, 6 * DAY_MS);
    expect(s.messages.filter((m) => m.quoteId === q.id)).toHaveLength(0);
  });

  it("does nothing on clock moves when follow-ups and invoice texts are off", async () => {
    s.garages[0].mode = "off";
    s.garages[0].invoiceMode = "off";
    const before = s.garages[0].lastCheckAt;
    expect(await advanceDemoClock(s, DAY_MS)).toBeNull();
    expect(s.garages[0].lastCheckAt).toBe(before);
  });
});

it("is a validation error, not a crash, for bad input", () => {
  expect(() => addQuote(s, DEMO_GARAGE_ID, input({ phone: "123", price: "x" }), DEMO_STAFF)).toThrowError(/highlighted/);
});
