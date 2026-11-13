import { beforeEach, describe, expect, it } from "vitest";
import { bucketOf, cancelQuote, restoreQuote } from "@/domain/queue";
import type { AppState, Quote } from "@/domain/types";
import { buildSeedState, DEMO_STAFF } from "@/demo/seed";

let s: AppState;
let q: Quote;
beforeEach(async () => {
  s = await buildSeedState();
  q = s.quotes.find((x) => x.status === "open" && x.unresolvedReply)!; // an open quote with a reply waiting
});

describe("cancel and restore a quote", () => {
  it("cancelling moves it to the Cancelled bucket, settles its waiting reply and withdraws pending texts", () => {
    cancelQuote(s, q.id, DEMO_STAFF);
    expect(q.status).toBe("cancelled");
    expect(bucketOf(s, q)).toBe("cancelled");
    expect(q.unresolvedReply).toBe(false);
    expect(s.tasks.some((t) => t.status === "open" && t.quoteIds.includes(q.id))).toBe(false);
    expect(s.messages.some((m) => m.quoteId === q.id && ["awaiting_approval", "approved"].includes(m.status ?? ""))).toBe(false);
    expect(s.quotes).toContain(q); // nothing is deleted
  });

  it("only open quotes can be cancelled", () => {
    const booked = s.quotes.find((x) => x.status === "booked")!;
    expect(() => cancelQuote(s, booked.id, DEMO_STAFF)).toThrow("Only open quotes");
  });

  it("restoring brings it back open with automatic texts paused, and only works on cancelled quotes", () => {
    expect(() => restoreQuote(s, q.id, DEMO_STAFF)).toThrow("isn't cancelled");
    cancelQuote(s, q.id, DEMO_STAFF);
    restoreQuote(s, q.id, DEMO_STAFF);
    expect(q.status).toBe("open");
    expect(q.paused).toBe(true);
    expect(q.cancelledAt).toBeUndefined();
    expect(bucketOf(s, q)).not.toBe("cancelled");
  });
});
