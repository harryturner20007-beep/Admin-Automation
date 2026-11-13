import { describe, expect, it } from "vitest";
import { quoteTrend } from "@/domain/overview";
import { buildSeedState, DEMO_GARAGE_ID } from "@/demo/seed";

describe("overview trend", () => {
  it("is a running total of quoted and won value, one point per day, never going down", async () => {
    const s = await buildSeedState();
    const t = quoteTrend(s, DEMO_GARAGE_ID, 30);
    expect(t).toHaveLength(30);
    expect(t.at(-1)!.day).toBe(s.now.slice(0, 10));
    for (let i = 1; i < t.length; i++) {
      expect(t[i].quotedPence).toBeGreaterThanOrEqual(t[i - 1].quotedPence);
      expect(t[i].wonPence).toBeGreaterThanOrEqual(t[i - 1].wonPence);
    }
    const inRange = s.quotes.filter((q) => q.status !== "cancelled" && q.quoteSentAt.slice(0, 10) >= t[0].day);
    expect(t.at(-1)!.quotedPence).toBe(inRange.reduce((a, q) => a + q.amountPence, 0));
    expect(t.at(-1)!.wonPence).toBeLessThanOrEqual(t.at(-1)!.quotedPence);
  });
});
