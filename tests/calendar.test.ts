import { beforeEach, describe, expect, it } from "vitest";
import { calendarItemHref, calendarItems } from "@/domain/calendar";
import { bookJob, cancelJob, jobInTab, quotesAwaitingJob, rescheduleJob, startJob } from "@/domain/jobs";
import { confirmStatus } from "@/domain/engine";
import { recordOutcome, setBookedFor } from "@/domain/queue";
import type { AppState } from "@/domain/types";
import { buildSeedState, DEMO_GARAGE_ID, DEMO_STAFF } from "@/demo/seed";

let s: AppState;
const nov = () => calendarItems(s, DEMO_GARAGE_ID, "2026-11-01", "2026-11-30");
const ORIGINAL = ["Ava Thompson", "Ben Okafor", "Chloe Patel", "Daniel Hughes", "Emma Clarke", "Fay Morgan"]; // walkthrough cases
const brief = () => nov().items.filter((i) => ORIGINAL.includes(i.title)).map((i) => `${i.date} ${i.kind} ${i.title}: ${i.detail}${i.overdue ? " [overdue]" : ""}`);

describe("calendar", () => {
  beforeEach(async () => {
    s = await buildSeedState(); // Wed 11 Nov 2026 10:00
  });

  it("shows follow-ups, booked-in work and invoices on their days", () => {
    expect(brief()).toEqual([
      "2026-11-10 invoice Fay Morgan: Invoice INV-0004 due (£512.50) [overdue]",
      "2026-11-11 follow_up Ben Okafor: Booking request waiting", // to-dos without a time come first
      "2026-11-11 follow_up Chloe Patel: Customer reply waiting",
      "2026-11-11 follow_up Ava Thompson: Follow-up 1 due 10:00 for approval",
      "2026-11-11 booking Emma Clarke: Booked in: exhaust back box replacement", // her job, at 14:00
      "2026-11-17 invoice Fay Morgan: Payment reminder 2 sends 10:00 (INV-0004)",
    ]);
  });

  it("a staff reminder date moves the follow-up to that day", () => {
    s.now = "2026-11-11T11:00:00.000Z";
    recordOutcome(s, "q_ava", "needs_time", DEMO_STAFF, "2026-11-16");
    expect(brief().filter((x) => x.includes("Ava"))).toEqual(["2026-11-16 follow_up Ava Thompson: Chase quote (your reminder)"]);
  });

  it("quotes marked booked without a job or date are listed separately until they get one", () => {
    confirmStatus(s, "q_ava", "booked", DEMO_STAFF);
    expect(nov().unscheduled.map((q) => q.id)).toEqual(["q_ava"]); // every booked job has a date and time
    setBookedFor(s, "q_ava", "2026-11-20", DEMO_STAFF);
    expect(brief().filter((x) => x.includes("Ava"))).toEqual(["2026-11-20 booking Ava Thompson: Booked in: front brake pads and discs"]);
  });

  it("moves a previously accepted quote through Jobs into a single linked calendar booking", () => {
    recordOutcome(s, "q_ava", "accepted", DEMO_STAFF);
    expect(quotesAwaitingJob(s, DEMO_GARAGE_ID).map((q) => q.id)).toEqual(["q_ava"]);
    expect(quotesAwaitingJob(s, "another_garage")).toEqual([]);
    const input = { startAt: "2026-11-20T09:30:00.000Z", notes: "", customerConfirmation: "Accepted by phone" };
    const job = bookJob(s, "q_ava", input, DEMO_STAFF);
    expect(bookJob(s, "q_ava", input, DEMO_STAFF).id).toBe(job.id);
    expect(quotesAwaitingJob(s, DEMO_GARAGE_ID)).toEqual([]);
    expect(jobInTab(s, job, "upcoming")).toBe(true);
    const bookings = nov().items.filter((i) => i.quoteId === "q_ava");
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({ date: "2026-11-20", at: input.startAt, kind: "booking", jobId: job.id });
    expect(calendarItemHref(bookings[0], "2026-11-11")).toBe(`/jobs?tab=upcoming&job=${job.id}`);

    rescheduleJob(s, job.id, "2026-11-11T14:00:00.000Z", 60, "Earlier slot", DEMO_STAFF);
    const moved = nov().items.filter((i) => i.quoteId === "q_ava");
    expect(moved).toHaveLength(1);
    expect(moved[0].date).toBe("2026-11-11");
    expect(calendarItemHref(moved[0], "2026-11-11")).toBe(`/jobs?tab=today&job=${job.id}`);
    startJob(s, job.id, DEMO_STAFF);
    expect(calendarItemHref(nov().items.find((i) => i.jobId === job.id)!, "2026-11-11")).toBe(`/jobs?tab=in_progress&job=${job.id}`);
    cancelJob(s, job.id, "Customer cancelled", DEMO_STAFF);
    expect(nov().items.some((i) => i.jobId === job.id)).toBe(false);
    expect(quotesAwaitingJob(s, DEMO_GARAGE_ID)).toEqual([]);
  });
});
