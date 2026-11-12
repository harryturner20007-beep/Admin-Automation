import { beforeEach, describe, expect, it } from "vitest";
import { advanceDemoClock, runScheduledCheck } from "@/domain/automation";
import { markCompleted, receiveInbound } from "@/domain/engine";
import { invoiceView, markInvoicePaid, runInvoiceCheck, setInvoiceChasePaused } from "@/domain/invoices";
import { computeResults } from "@/domain/reporting";
import { DAY_MS, HOUR_MS } from "@/domain/time";
import type { AppState } from "@/domain/types";
import { buildSeedState, DEMO_GARAGE_ID, DEMO_STAFF } from "@/demo/seed";
import { MockSmsProvider } from "@/sms/provider";

let s: AppState;
const provider = () => new MockSmsProvider("accept");
const invoiceFor = (quoteId: string) => s.invoices.find((i) => i.quoteId === quoteId)!;
const textsFor = (quoteId: string) => s.messages.filter((m) => m.invoiceId === invoiceFor(quoteId).id);
const garage = () => s.garages.find((g) => g.id === DEMO_GARAGE_ID)!;

describe("invoices", () => {
  beforeEach(async () => {
    s = await buildSeedState(); // Wed 11 Nov 2026 10:00; follow-ups in Draft, invoice texts Automatic
  });

  it("seed: Fay's invoice went out on completion and reminder 1 after 7 days; it is now overdue", () => {
    const inv = invoiceFor("q_fay");
    expect(inv).toMatchObject({ number: "INV-0004", amountPence: 51250, dueDate: "2026-11-10", status: "unpaid" });
    expect(textsFor("q_fay").map((m) => [m.invoiceStep, m.status, m.sentAt])).toEqual([
      [0, "delivered", "2026-11-03T15:30:00.000Z"],
      [1, "delivered", "2026-11-10T10:00:00.000Z"],
    ]);
    expect(invoiceView(s, inv)).toMatchObject({ state: "overdue", next: expect.stringContaining("Payment reminder 2 due") });
  });

  it("recording a job complete raises the invoice and drafts its text once", () => {
    garage().invoiceMode = "draft";
    s.now = "2026-11-11T11:00:00.000Z";
    markCompleted(s, "q_emma", 24000, DEMO_STAFF);
    const inv = invoiceFor("q_emma");
    expect(inv).toMatchObject({ number: "INV-0006", amountPence: 24000, dueDate: "2026-11-18" });
    expect(textsFor("q_emma")).toHaveLength(1);
    expect(textsFor("q_emma")[0]).toMatchObject({ invoiceStep: 0, status: "awaiting_approval", toPhone: "+447700900105" });
    expect(textsFor("q_emma")[0].body).toContain("INV-0006 for exhaust back box replacement is £240");
    runInvoiceCheck(s);
    expect(textsFor("q_emma")).toHaveLength(1); // no duplicate
  });

  it("a job completed after closing is texted at the next opening, not overnight", () => {
    s.now = "2026-11-11T18:30:00.000Z"; // Wed, garage closed at 17:30
    markCompleted(s, "q_emma", 24000, DEMO_STAFF);
    expect(textsFor("q_emma")[0].windowStart).toBe("2026-11-12T08:30:00.000Z");
  });

  it("automatic mode: invoice goes, reminder 1 at 7 days, then paying stops the chase", { timeout: 20_000 }, async () => {
    garage().invoiceMode = "automatic";
    s.now = "2026-11-11T11:00:00.000Z";
    markCompleted(s, "q_emma", 24000, DEMO_STAFF);
    await runScheduledCheck(s, provider());
    expect(textsFor("q_emma").map((m) => m.status)).toEqual(["delivered"]);

    await advanceDemoClock(s, 7 * DAY_MS, provider()); // to Wed 18 Nov 11:00
    expect(textsFor("q_emma").map((m) => [m.invoiceStep, m.sentAt])).toEqual([
      [0, "2026-11-11T11:00:00.000Z"],
      [1, "2026-11-18T10:00:00.000Z"],
    ]);

    markInvoicePaid(s, invoiceFor("q_emma").id, DEMO_STAFF);
    await advanceDemoClock(s, 10 * DAY_MS, provider());
    expect(textsFor("q_emma")).toHaveLength(2);
    expect(invoiceView(s, invoiceFor("q_emma")).state).toBe("paid");
  });

  it("after the 14-day reminder the invoice is flagged for a call", async () => {
    garage().invoiceMode = "automatic";
    await advanceDemoClock(s, 6 * DAY_MS + 2 * HOUR_MS, provider()); // past Tue 17 Nov 10:00
    expect(textsFor("q_fay").map((m) => m.invoiceStep)).toEqual([0, 1, 2]);
    expect(invoiceView(s, invoiceFor("q_fay"))).toMatchObject({ state: "needs_call", next: "Both reminders sent. Call the customer." });
  });

  it("paused reminders, opt-outs and Off mode all stop invoice texts", async () => {
    garage().invoiceMode = "automatic";
    setInvoiceChasePaused(s, invoiceFor("q_fay").id, true, DEMO_STAFF);
    await advanceDemoClock(s, 7 * DAY_MS, provider());
    expect(textsFor("q_fay")).toHaveLength(2);

    setInvoiceChasePaused(s, invoiceFor("q_fay").id, false, DEMO_STAFF);
    receiveInbound(s, { eventId: "stop-fay", from: "+447700900106", to: garage().smsNumber, body: "STOP" });
    await advanceDemoClock(s, DAY_MS, provider());
    expect(textsFor("q_fay")).toHaveLength(2);
    expect(invoiceView(s, invoiceFor("q_fay")).next).toBe("Opted out of texts. Call the customer.");
  });

  it("invoice texts don't count as follow-ups in Results", () => {
    const r = computeResults(s, DEMO_GARAGE_ID);
    const followUps = s.messages.filter((m) => m.direction === "outbound" && !m.invoiceId && ["sent", "delivered"].includes(m.status ?? "")).length;
    expect(r.followUpsSent).toBe(followUps);
  });
});
