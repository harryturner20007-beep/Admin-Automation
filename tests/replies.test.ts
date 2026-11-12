import { describe, expect, it } from "vitest";
import { classifyReply, isClearOptOut } from "@/domain/replies";

describe("reply handling rules", () => {
  it.each(["STOP", "stop", " Stop. ", "UNSUBSCRIBE", "please stop texting me", "Remove my number"])("treats %j as a clear opt-out", (b) => {
    expect(isClearOptOut(b)).toBe(true);
    expect(classifyReply(b)).toBe("opt_out");
  });

  it("does not treat ordinary words containing 'stop' as opt-outs", () => {
    expect(isClearOptOut("The car won't stop squealing when I brake")).toBe(false);
  });

  it("puts safety before price or booking", () => {
    expect(classifyReply("Is it safe to drive? How much to book it in sooner?")).toBe("repair_or_safety");
  });

  it.each([
    ["Yes please, can you fit me in Friday?", "booking_request"],
    ["Could you do it on Friday?", "booking_request"],
    ["Is £420 the best you can do?", "price_question"],
    ["Not happy with this at all", "complaint"],
    ["Thanks, will let you know", "general"],
  ])("classifies %j as %s", (body, cat) => {
    expect(classifyReply(body)).toBe(cat);
  });
});
