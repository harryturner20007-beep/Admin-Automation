import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { invoiceContentFor, issueDraftInvoice } from "@/domain/invoices";
import { bookJob, completeJob } from "@/domain/jobs";
import { buildSeedState, DEMO_STAFF } from "@/demo/seed";
import { buildInvoicePdf } from "@/lib/invoicePdf";

const pages = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

describe("invoice PDF", () => {
  it("prints an issued invoice, and long itemised work runs onto further pages", async () => {
    const s = await buildSeedState();
    const job = bookJob(s, "q_ava", { startAt: "2026-11-12T09:00:00.000Z", notes: "", customerConfirmation: "ok" }, DEMO_STAFF);
    const long = "Replace front brake discs and pads, clean and lubricate slider pins, bleed system with DOT 4 fluid, road test and re-check torque settings on all wheel nuts. Part no. ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ (no spaces) ";
    const lines = Array.from({ length: 40 }, (_, i) => ({ id: `l${i}`, kind: i % 2 ? ("labour" as const) : ("part" as const), description: `${i + 1}. ${long}`, quantity: 1.5, unitPence: 1234 + i }));
    const draft = completeJob(s, job.id, { lines, discountPence: 500, vatRatePercent: 20, extraWorkReason: "Extra items", extraWorkAuthorisation: "Agreed in writing 😀", completionNotes: "" }, DEMO_STAFF);
    const inv = issueDraftInvoice(s, draft.id, DEMO_STAFF);
    const bytes = await buildInvoicePdf({ number: inv.number, issuedAt: inv.issuedAt, dueDate: inv.dueDate, status: "unpaid", content: inv.content!, totals: inv.totals! });
    expect(await pages(bytes)).toBeGreaterThan(3);
    if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/long-invoice.pdf`, bytes);
  });

  it("prints an invoice from before itemised invoices as one summary line", async () => {
    const s = await buildSeedState();
    const old = s.invoices.find((i) => i.number === "INV-0004")!;
    const { content, totals, legacy } = invoiceContentFor(s, { ...old, content: undefined, totals: undefined });
    expect(legacy).toBe(true);
    expect(totals.totalPence).toBe(old.amountPence);
    const bytes = await buildInvoicePdf({ number: old.number, issuedAt: old.issuedAt, dueDate: old.dueDate, status: "unpaid", content, totals });
    expect(await pages(bytes)).toBe(1);
    if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/short-invoice.pdf`, bytes);
  });
});
