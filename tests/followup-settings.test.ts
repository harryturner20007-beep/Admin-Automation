import { beforeEach, describe, expect, it } from "vitest";
import { advanceDemoClock } from "@/domain/automation";
import { approveMessage, dispatchApproved, receiveInbound, setGaragePaused } from "@/domain/engine";
import { addQuote, type QuoteInput } from "@/domain/intake";
import { applyFollowUpSettings, previewScheduleChanges, validateSettings, type SettingsInput } from "@/domain/settings";
import { DEFAULT_TEMPLATES, renderSms, templateValues } from "@/domain/templates";
import { HOUR_MS, DAY_MS } from "@/domain/time";
import type { AppState, Quote } from "@/domain/types";
import { buildSeedState, DEMO_GARAGE_ID, DEMO_STAFF } from "@/demo/seed";
import { MockSmsProvider } from "@/sms/provider";

const sample = { customerName: "Ben Carter", job: "front brake pads", vehicle: "Ford Fiesta", sourceQuoteId: "Q-2001", amountPence: 18000 };

describe("SMS templates", () => {
  it("renders the default first message deterministically", () => {
    const r = renderSms(DEFAULT_TEMPLATES[1], templateValues(sample, { name: "Riverside Garage" }));
    expect(r.unresolved).toEqual([]);
    expect(r.text).toBe(
      "Hi Ben, it's Riverside Garage. Just checking in on the quote for front brake pads on your Ford Fiesta. Reply here if you'd like to book or have a question. Reply STOP to opt out.",
    );
  });

  it("omits the whole 'on your vehicle' phrase when there is no vehicle", () => {
    const r = renderSms(DEFAULT_TEMPLATES[1], templateValues({ ...sample, vehicle: "" }, { name: "Riverside Garage" }));
    expect(r.text).toContain("the quote for front brake pads. Reply here");
    expect(r.unresolved).toEqual([]);
  });

  it("reports a placeholder it can't fill instead of sending it", () => {
    const r = renderSms("Your {{vehicle}} is ready. {{colour}}", templateValues({ ...sample, vehicle: "" }, { name: "x" }));
    expect(r.unresolved).toEqual(["vehicle", "colour"]);
    expect(r.text).toContain("{{vehicle}}");
  });

  it("uses the customer-facing job wording when staff provide one", () => {
    const v = templateValues({ ...sample, job: "F/P+D, N/S cal seized - quote incl. fitting", customerJobDescription: "front brake pads and discs" }, { name: "x" });
    expect(v.job_description).toBe("front brake pads and discs");
    expect(v.quoted_price).toBe("£180");
  });
});

describe("settings validation", () => {
  const base: SettingsInput = {
    mode: "draft",
    followUps: [{ enabled: true, businessDays: 2, sendTime: "10:00" }, { enabled: true, businessDays: 5, sendTime: "10:00" }],
    templates: DEFAULT_TEMPLATES,
  };
  it("accepts the defaults", () => expect(validateSettings(base)).toEqual({}));
  it("keeps the second follow-up after the first", () => {
    expect(validateSettings({ ...base, followUps: [base.followUps[0], { ...base.followUps[1], businessDays: 2 }] }).days2).toBeDefined();
  });
  it("rejects unknown fields and messages without an opt-out", () => {
    expect(validateSettings({ ...base, templates: { 1: "Hi {{name}} Reply STOP", 2: base.templates[2] } }).template1).toMatch(/Unknown field/);
    expect(validateSettings({ ...base, templates: { 1: "Hi {{first_name}}", 2: base.templates[2] } }).template1).toMatch(/opt out/);
  });
});

// Ben's front brake pads on a Ford Fiesta, sent Mon 9 Nov so follow-up 1 is due today (Wed 11 Nov).
let s: AppState;
let ben: Quote;
let provider: MockSmsProvider;
const benInput = (over: Partial<QuoteInput> = {}): QuoteInput => ({
  customerName: "Ben Carter",
  phone: "07700 900555",
  reference: "Q-2001",
  job: "front brake pads",
  price: "180",
  vehicle: "Ford Fiesta",
  registration: "",
  sentAt: "2026-11-09T10:00:00.000Z",
  smsEligible: true,
  evidenceRef: "Job card 2001: SMS consent ticked",
  ...over,
});
const settings = (over: Partial<SettingsInput> = {}): SettingsInput => ({
  mode: "automatic",
  followUps: [{ enabled: true, businessDays: 2, sendTime: "11:30" }, { enabled: true, businessDays: 5, sendTime: "11:30" }],
  templates: DEFAULT_TEMPLATES,
  ...over,
});
const toBen = () => provider.sent.filter((m) => m.to === ben.phone);
const outboundFor = (q: Quote) => s.messages.filter((m) => m.quoteId === q.id && m.direction === "outbound");

describe("automatic sending (simulated)", () => {
  beforeEach(async () => {
    s = await buildSeedState(); // Wed 11 Nov 10:00
    provider = new MockSmsProvider();
    ben = addQuote(s, DEMO_GARAGE_ID, benInput(), DEMO_STAFF);
    applyFollowUpSettings(s, DEMO_GARAGE_ID, settings(), DEMO_STAFF);
  });

  it("sends exactly one text at the configured time, however often the scheduler runs", async () => {
    await advanceDemoClock(s, HOUR_MS, provider); // 11:00: not yet
    expect(toBen()).toHaveLength(0);
    await advanceDemoClock(s, HOUR_MS, provider); // passes 11:30
    await advanceDemoClock(s, 2 * HOUR_MS, provider); // more runs the same day
    expect(toBen()).toHaveLength(1);
    expect(toBen()[0].body).toBe("Hi Ben, it's Riverside Garage. Just checking in on the quote for front brake pads on your Ford Fiesta. Reply here if you'd like to book or have a question. Reply STOP to opt out.");
    const m = outboundFor(ben)[0];
    expect(m).toMatchObject({ status: "delivered", sentAt: "2026-11-11T11:30:00.000Z", approvedBy: expect.stringMatching(/Automatic/) });
  });

  it("a reply pauses the second follow-up", async () => {
    await advanceDemoClock(s, 2 * HOUR_MS, provider);
    receiveInbound(s, { eventId: "in1", from: ben.phone, to: s.garages[0].smsNumber, body: "Thanks, will let you know" });
    await advanceDemoClock(s, 7 * DAY_MS, provider); // well past follow-up 2 (Mon 16 Nov)
    expect(toBen()).toHaveLength(1);
    expect(outboundFor(ben).some((m) => m.step === 2)).toBe(false);
  });

  it("STOP before the send time means nothing is sent", async () => {
    receiveInbound(s, { eventId: "in2", from: ben.phone, to: s.garages[0].smsNumber, body: "STOP" });
    await advanceDemoClock(s, 8 * DAY_MS, provider);
    expect(toBen()).toHaveLength(0);
  });

  it("a quote with no vehicle sends without the vehicle phrase", async () => {
    const noVehicle = addQuote(s, DEMO_GARAGE_ID, benInput({ reference: "Q-2002", phone: "07700 900556", vehicle: "" }), DEMO_STAFF);
    await advanceDemoClock(s, 2 * HOUR_MS, provider);
    const sent = provider.sent.find((m) => m.to === noVehicle.phone)!;
    expect(sent.body).toContain("quote for front brake pads. Reply here");
    expect(sent.body).not.toMatch(/\{\{|on your/);
  });

  it("never sends a template field that can't be filled", async () => {
    applyFollowUpSettings(s, DEMO_GARAGE_ID, settings({ templates: { 1: "Hi {{first_name}}, your {{vehicle}} quote is ready. Reply STOP to opt out.", 2: DEFAULT_TEMPLATES[2] } }), DEMO_STAFF);
    const noVehicle = addQuote(s, DEMO_GARAGE_ID, benInput({ reference: "Q-2003", phone: "07700 900557", vehicle: "" }), DEMO_STAFF);
    const r = await advanceDemoClock(s, 2 * HOUR_MS, provider);
    expect(provider.sent.some((m) => m.to === noVehicle.phone)).toBe(false);
    expect(r!.check.find((c) => c.quoteId === noVehicle.id)?.reasons).toContain("template_unresolved");
  });

  it("Draft for approval prepares the text but sends nothing", async () => {
    applyFollowUpSettings(s, DEMO_GARAGE_ID, settings({ mode: "draft" }), DEMO_STAFF);
    await advanceDemoClock(s, 3 * HOUR_MS, provider);
    expect(provider.calls).toBe(0);
    expect(outboundFor(ben)[0]).toMatchObject({ status: "awaiting_approval", windowStart: "2026-11-11T11:30:00.000Z" });
  });

  it("the garage pause switch stops automatic sending", async () => {
    setGaragePaused(s, DEMO_GARAGE_ID, true, DEMO_STAFF);
    await advanceDemoClock(s, 3 * HOUR_MS, provider);
    expect(provider.calls).toBe(0);
  });

  it("a timed-out send is reconciled, never retried by later runs", async () => {
    const flaky = new MockSmsProvider("timeout");
    await advanceDemoClock(s, 2 * HOUR_MS, flaky);
    flaky.mode = "accept";
    await advanceDemoClock(s, 3 * HOUR_MS, flaky);
    const benCalls = outboundFor(ben).filter((m) => m.step === 1);
    expect(benCalls).toHaveLength(1);
    expect(benCalls[0].status).toBe("needs_reconciliation");
    expect(flaky.sent.filter((m) => m.to === ben.phone)).toHaveLength(0);
  });

  it("a schedule change after a send moves only unsent follow-ups and never replays the first", async () => {
    await advanceDemoClock(s, 2 * HOUR_MS, provider); // follow-up 1 sent 11:30
    expect(toBen()).toHaveLength(1);
    const next = settings({ followUps: [{ enabled: true, businessDays: 1, sendTime: "09:00" }, { enabled: true, businessDays: 3, sendTime: "14:00" }] });
    const { changes, alreadySent } = previewScheduleChanges(s, DEMO_GARAGE_ID, next);
    const benChanges = changes.filter((c) => c.quoteId === ben.id);
    expect(benChanges).toEqual([{ quoteId: ben.id, customerName: "Ben Carter", step: 2, from: "2026-11-16T11:30:00.000Z", to: "2026-11-12T14:00:00.000Z" }]);
    expect(alreadySent).toBeGreaterThanOrEqual(1);
    applyFollowUpSettings(s, DEMO_GARAGE_ID, next, DEMO_STAFF);
    await advanceDemoClock(s, 2 * DAY_MS, provider);
    // Step 1 is not sent again; step 2 goes at its new time (Thu 12 Nov 14:00). Automatic mode needs no daily
    // "still open" confirmation from staff.
    expect(outboundFor(ben).filter((m) => m.step === 1)).toHaveLength(1);
    expect(toBen()).toHaveLength(2);
    expect(outboundFor(ben).find((m) => m.step === 2)).toMatchObject({ status: "delivered", sentAt: "2026-11-12T14:00:00.000Z" });
  });

  it("switching follow-up 2 off cancels its pending draft and schedules nothing", async () => {
    applyFollowUpSettings(s, DEMO_GARAGE_ID, settings({ mode: "draft" }), DEMO_STAFF);
    await advanceDemoClock(s, 2 * HOUR_MS, provider); // Wed 12:00: follow-up 1 drafted
    approveMessage(s, outboundFor(ben).find((m) => m.step === 1)!.id, DEMO_STAFF);
    await dispatchApproved(s, provider);
    s.now = "2026-11-16T11:45:00.000Z"; // jump to follow-up 2 day without running checks
    ben.statusConfirmedAt = s.now;
    s.quotes.find((q) => q.id === ben.id)!.statusConfirmedAt = s.now;
    await advanceDemoClock(s, 15 * 60 * 1000, provider);
    expect(outboundFor(ben).find((m) => m.step === 2)?.status).toBe("awaiting_approval");
    applyFollowUpSettings(s, DEMO_GARAGE_ID, settings({ mode: "draft", followUps: [settings().followUps[0], { enabled: false, businessDays: 5, sendTime: "11:30" }] }), DEMO_STAFF);
    expect(outboundFor(ben).find((m) => m.step === 2)?.status).toBe("cancelled");
  });
});
