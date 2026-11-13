import { beforeEach, describe, expect, it } from "vitest";
import { addCatalogueItem, addQuote, quoteValidity, removeCatalogueItem, updateQuoteCharges, validateQuoteInput, type QuoteInput } from "@/domain/intake";
import { acceptedLinesFromQuote } from "@/domain/jobs";
import type { AppState, Charges } from "@/domain/types";
import { buildSeedState, DEMO_GARAGE_ID, DEMO_STAFF } from "@/demo/seed";

let s: AppState;
beforeEach(async () => {
  s = await buildSeedState();
});

const charges: Charges = {
  lines: [
    { id: "a", kind: "labour", description: "Labour, one hour", quantity: 1.5, unitPence: 6500 },
    { id: "b", kind: "part", description: "Rear wiper motor", quantity: 1, unitPence: 8600 },
  ],
  discountPence: 0,
  vatRatePercent: 20,
};
const input = (over: Partial<QuoteInput> = {}): QuoteInput => ({
  customerName: "Sample Customer", phone: "07700 900555", reference: "", job: "Rear wiper motor", price: "",
  vehicle: "", registration: "", sentAt: s.now, smsEligible: false, evidenceRef: "", ...over,
});

describe("quote builder", () => {
  it("an itemised quote's price is its total including VAT, and the job starts from the same lines", () => {
    const q = addQuote(s, DEMO_GARAGE_ID, input({ charges }), DEMO_STAFF);
    expect(q.amountPence).toBe(22020); // 97.50 + 86.00 = 183.50 net, VAT 36.70
    expect(acceptedLinesFromQuote(s, q).lines.map((l) => l.description)).toEqual(["Labour, one hour", "Rear wiper motor"]);
  });

  it("rejects a quote with a blank line or a zero total, but a plain price still works without lines", () => {
    expect(validateQuoteInput(s, DEMO_GARAGE_ID, input({ charges: { ...charges, lines: [{ ...charges.lines[0], description: "" }] } })).charges).toMatch(/description/);
    expect(validateQuoteInput(s, DEMO_GARAGE_ID, input({ charges: { ...charges, lines: [{ ...charges.lines[0], unitPence: 0 }] } })).charges).toMatch(/more than £0/);
    expect(validateQuoteInput(s, DEMO_GARAGE_ID, input({ price: "340" }))).toEqual({});
  });

  it("editing the work on an open quote updates its price and logs it; closed quotes can't change", () => {
    const q = addQuote(s, DEMO_GARAGE_ID, input({ charges }), DEMO_STAFF);
    updateQuoteCharges(s, q.id, { ...charges, discountPence: 1000 }, DEMO_STAFF);
    expect(q.amountPence).toBe(20820);
    expect(s.events.at(-1)!.text).toContain("£220.20 → £208.20");
    q.status = "declined";
    expect(() => updateQuoteCharges(s, q.id, charges, DEMO_STAFF)).toThrow("Only open quotes");
  });

  it("validity counts down from when the quote was sent", () => {
    const q = addQuote(s, DEMO_GARAGE_ID, input({ price: "100" }), DEMO_STAFF);
    expect(quoteValidity(q, 30, s.now).daysLeft).toBe(30);
    expect(quoteValidity(q, 30, new Date(Date.parse(s.now) + 31 * 86_400_000).toISOString()).daysLeft).toBeLessThan(0);
  });

  it("saved services can be added and removed; bad ones are refused", () => {
    const item = addCatalogueItem(s, DEMO_GARAGE_ID, { kind: "part", description: " Air filter ", unitPence: 1450 });
    expect(s.garages[0].catalogue!.at(-1)).toEqual({ ...item, description: "Air filter" });
    expect(() => addCatalogueItem(s, DEMO_GARAGE_ID, { kind: "part", description: "", unitPence: 100 })).toThrow("Describe");
    removeCatalogueItem(s, DEMO_GARAGE_ID, item.id);
    expect(s.garages[0].catalogue!.some((c) => c.id === item.id)).toBe(false);
  });
});
