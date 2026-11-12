import { describe, expect, it } from "vitest";
import { stepWindow } from "@/domain/schedule";
import type { Garage } from "@/domain/types";
import { addBusinessDays, londonToUtc, londonParts } from "@/domain/time";

const weekdayHours = {
  1: { open: "09:00", close: "17:00" },
  2: { open: "09:00", close: "17:00" },
  3: { open: "09:00", close: "17:00" },
  4: { open: "09:00", close: "17:00" },
  5: { open: "09:00", close: "17:00" },
} as const;

// Preferred time before opening, so the window opens at 09:00 like the older fixed schedule.
const fu = (over: Partial<Garage["followUps"][1]> = {}): Garage["followUps"] => [
  { enabled: true, businessDays: 2, sendTime: "08:00" },
  { enabled: true, businessDays: 5, sendTime: "08:00", ...over },
];

describe("London business-day scheduling", () => {
  it("skips weekends", () => {
    // Thu 5 Nov 2026 + 2 business days = Mon 9 Nov
    expect(addBusinessDays({ y: 2026, m: 11, d: 5 }, 2)).toEqual({ y: 2026, m: 11, d: 9 });
  });

  it("skips England & Wales bank holidays (Christmas 2026 substitute day)", () => {
    // Thu 24 Dec + 2 = (Fri 25 hol, Mon 28 hol) Tue 29, Wed 30
    expect(addBusinessDays({ y: 2026, m: 12, d: 24 }, 2)).toEqual({ y: 2026, m: 12, d: 30 });
  });

  it("schedules step 1 at +2 and step 2 at +5 business days inside garage hours", () => {
    const q = { quoteSentAt: "2026-11-09T14:20:00.000Z" }; // Mon
    const s1 = stepWindow(q, { hours: weekdayHours, followUps: fu() }, 1)!;
    const s2 = stepWindow(q, { hours: weekdayHours, followUps: fu() }, 2)!;
    expect(s1.windowStart).toBe("2026-11-11T09:00:00.000Z"); // Wed, GMT
    expect(s1.windowEnd).toBe("2026-11-11T17:00:00.000Z");
    expect(s2.windowStart).toBe("2026-11-16T09:00:00.000Z"); // Mon
  });

  it("handles British Summer Time", () => {
    // 10:00 London on 1 July = 09:00 UTC
    expect(londonToUtc({ y: 2026, m: 7, d: 1 }, 10, 0).toISOString()).toBe("2026-07-01T09:00:00.000Z");
    // Quote sent 23:30 UTC on Tue 30 Jun is already Wed 1 Jul in London
    expect(londonParts("2026-06-30T23:30:00.000Z").d).toBe(1);
  });

  it("rolls forward when the garage is closed on the due day", () => {
    const closedWed = { ...weekdayHours, 3: undefined };
    const w = stepWindow({ quoteSentAt: "2026-11-09T10:00:00.000Z" }, { hours: closedWed, followUps: fu() }, 1)!;
    expect(w.windowStart).toBe("2026-11-12T09:00:00.000Z"); // Thu
  });
});

describe("datetime-local round trip in London time", () => {
  it("shows GMT and BST instants as UK wall-clock time and stores UTC", async () => {
    const { toLondonInput, fromLondonInput } = await import("@/domain/time");
    expect(toLondonInput("2026-11-11T10:00:00.000Z")).toBe("2026-11-11T10:00");
    expect(toLondonInput("2026-07-01T09:00:00.000Z")).toBe("2026-07-01T10:00");
    expect(fromLondonInput("2026-07-01T10:00")).toBe("2026-07-01T09:00:00.000Z");
    expect(fromLondonInput("nonsense")).toBe("");
  });
});

describe("garage follow-up settings", () => {
  const q = { quoteSentAt: "2026-11-09T14:20:00.000Z" }; // Mon
  const g = (followUps: Garage["followUps"]) => ({ hours: weekdayHours, followUps });

  it("sends at the preferred UK time on the due day", () => {
    const w = stepWindow(q, g([{ enabled: true, businessDays: 2, sendTime: "11:30" }, fu()[1]]), 1)!;
    expect(w.windowStart).toBe("2026-11-11T11:30:00.000Z");
    expect(w.windowEnd).toBe("2026-11-11T17:00:00.000Z");
  });

  it("keeps a preferred time inside opening hours", () => {
    expect(stepWindow(q, g([{ enabled: true, businessDays: 2, sendTime: "07:15" }, fu()[1]]), 1)!.windowStart).toBe("2026-11-11T09:00:00.000Z");
    expect(stepWindow(q, g([{ enabled: true, businessDays: 2, sendTime: "18:00" }, fu()[1]]), 1)!.windowStart).toBe("2026-11-11T09:00:00.000Z");
  });

  it("uses the configured business days and lets staff switch off the second follow-up", () => {
    expect(stepWindow(q, g(fu({ businessDays: 4 })), 2)!.windowStart).toBe("2026-11-13T09:00:00.000Z"); // Fri
    expect(stepWindow(q, g(fu({ enabled: false })), 2)).toBeNull();
  });
});
