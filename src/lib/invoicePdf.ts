// Invoice PDF (A4) from an invoice's content and totals. The same code runs on the server (hosted
// downloads) and in the browser (demo). Long descriptions wrap; the item table continues onto further
// pages with its header repeated, and every page is numbered.
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { lineTotal } from "@/domain/money";
import type { InvoiceContent, Totals } from "@/domain/types";

export type PdfInput = {
  number: string;
  issuedAt: string; // ISO
  dueDate: string; // YYYY-MM-DD
  status: "unpaid" | "paid" | "cancelled" | "draft";
  content: InvoiceContent;
  totals: Totals;
  logo?: { bytes: Uint8Array; type: "png" | "jpg" };
};

const A4 = { w: 595.28, h: 841.89 };
const M = 48; // margin
const INK = rgb(0.09, 0.13, 0.17);
const MUTED = rgb(0.35, 0.4, 0.47);
const LINE = rgb(0.86, 0.89, 0.92);
const ACCENT = rgb(0.06, 0.38, 0.45);

/** Standard PDF fonts only cover Windows-1252; replace anything else so a stray emoji can't break the PDF. */
const safe = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF€…\n]/g, "?");
const money = (p: number) => `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ukDay = (ymd: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ymd}T12:00:00Z`));
const qty = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/0$/, ""));

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of safe(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      // Break words longer than the column (part numbers, URLs) rather than overflow.
      let w = word;
      while (font.widthOfTextAtSize(w, size) > width) {
        let i = w.length;
        while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
        if (line) {
          out.push(line);
          line = "";
        }
        out.push(w.slice(0, i));
        w = w.slice(i);
      }
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = w;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

export async function buildInvoicePdf(inv: PdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const c = inv.content;
  const s = c.seller;
  doc.setTitle(`Invoice ${inv.number}`);
  doc.setAuthor(s.legalName || s.tradingName);

  let page: PDFPage = doc.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const text = (t: string, x: number, size = 9.5, font = reg, color = INK) => page.drawText(safe(t), { x, y, size, font, color });
  const right = (t: string, xRight: number, size = 9.5, font = reg, color = INK) => page.drawText(safe(t), { x: xRight - font.widthOfTextAtSize(safe(t), size), y, size, font, color });
  const block = (lines: string[], x: number, size = 9.5, font = reg, color = INK) => {
    for (const l of lines) {
      text(l, x, size, font, color);
      y -= size + 3.5;
    }
  };

  // Header: logo or trading name, then the seller's details (VAT Notice 700 16.3: registered name and address).
  if (inv.logo) {
    const img = inv.logo.type === "png" ? await doc.embedPng(inv.logo.bytes) : await doc.embedJpg(inv.logo.bytes);
    const scale = Math.min(140 / img.width, 48 / img.height, 1);
    page.drawImage(img, { x: M, y: y - img.height * scale + 10, width: img.width * scale, height: img.height * scale });
    y -= img.height * scale + 6;
  } else {
    text(s.tradingName || s.legalName, M, 18, bold, ACCENT);
    y -= 24;
  }
  const top = A4.h - M;
  const sellerLines = [s.legalName && s.legalName !== s.tradingName ? s.legalName : "", ...s.address.split("\n"), s.phone, s.email, s.companyNumber && `Company no. ${s.companyNumber}`, s.vatNumber && `VAT no. ${s.vatNumber}`].filter(Boolean);
  const keepY = y;
  y = top;
  right(inv.status === "draft" ? "DRAFT INVOICE" : c.vatRatePercent > 0 ? "VAT INVOICE" : "INVOICE", A4.w - M, 16, bold);
  y -= 22;
  for (const l of sellerLines) {
    right(l, A4.w - M, 9, reg, MUTED);
    y -= 12.5;
  }
  y = Math.min(y, keepY) - 18;

  // Bill to + invoice facts
  const factsX = 340;
  const startY = y;
  text("Bill to", M, 8.5, bold, MUTED);
  y -= 13;
  block([c.customer.name, ...c.customer.address.split("\n"), c.customer.email].filter(Boolean), M);
  const leftEnd = y;
  y = startY;
  const facts: [string, string][] = [
    ["Invoice number", inv.number || "Not issued"],
    ["Invoice date", ukDay(inv.issuedAt.slice(0, 10))],
    ["Date of supply", ukDay(c.supplyDate)],
    ["Payment due", ukDay(inv.dueDate)],
    ...(c.vehicle.registration ? [["Vehicle", `${c.vehicle.registration}${c.vehicle.description ? `, ${c.vehicle.description}` : ""}`] as [string, string]] : []),
    ...(c.jobNumber ? [["Job", c.jobNumber] as [string, string]] : []),
  ];
  for (const [k, v] of facts) {
    text(k, factsX, 9, reg, MUTED);
    right(v.length > 34 ? `${v.slice(0, 33)}…` : v, A4.w - M, 9, bold);
    y -= 13;
  }
  y = Math.min(y, leftEnd) - 16;

  // Items
  const cols = { desc: M, qty: 360, unit: 440, amount: A4.w - M };
  const descWidth = cols.qty - 40 - M;
  const header = () => {
    page.drawRectangle({ x: M - 6, y: y - 5, width: A4.w - 2 * M + 12, height: 18, color: rgb(0.96, 0.97, 0.98) });
    text("Description", cols.desc, 8.5, bold, MUTED);
    right("Qty", cols.qty, 8.5, bold, MUTED);
    right(c.vatRatePercent > 0 ? "Unit (ex VAT)" : "Unit price", cols.unit + 30, 8.5, bold, MUTED);
    right(c.vatRatePercent > 0 ? "Amount (ex VAT)" : "Amount", cols.amount, 8.5, bold, MUTED);
    y -= 20;
  };
  const newPage = () => {
    page = doc.addPage([A4.w, A4.h]);
    y = A4.h - M;
    text(`Invoice ${inv.number || "(draft)"} continued`, M, 9, bold, MUTED);
    y -= 22;
    header();
  };
  header();
  const kindLabel = { labour: "Labour", part: "Parts", other: "" } as const;
  for (const l of c.lines) {
    const lines = wrap(l.description, reg, 9.5, descWidth);
    const tag = kindLabel[l.kind];
    const h = lines.length * 13 + (tag ? 11 : 0) + 6;
    if (y - h < M + 40) newPage();
    const rowTop = y;
    right(qty(l.quantity), cols.qty);
    right(money(l.unitPence), cols.unit + 30);
    right(money(lineTotal(l)), cols.amount, 9.5, bold);
    for (const t of lines) {
      text(t, cols.desc);
      y -= 13;
    }
    if (tag) {
      text(tag, cols.desc, 8, reg, MUTED);
      y -= 11;
    }
    y = Math.min(y, rowTop - 13) - 6;
    page.drawLine({ start: { x: M - 6, y: y + 8 }, end: { x: A4.w - M + 6, y: y + 8 }, thickness: 0.5, color: LINE });
  }

  // Totals (kept together on one page)
  const t = inv.totals;
  const rows: [string, string, boolean][] = [
    ["Subtotal", money(t.subtotalPence), false],
    ...(t.discountPence ? [["Discount", `-${money(t.discountPence)}`, false] as [string, string, boolean]] : []),
    ...(c.vatRatePercent > 0 ? [["Net", money(t.netPence), false], [`VAT at ${c.vatRatePercent}%`, money(t.vatPence), false]] as [string, string, boolean][] : []),
    [`Total due (${c.currency})`, money(t.totalPence), true],
  ];
  if (y - rows.length * 16 - 20 < M) newPage();
  y -= 6;
  for (const [k, v, strong] of rows) {
    text(k, cols.unit - 60, strong ? 11 : 9.5, strong ? bold : reg, strong ? INK : MUTED);
    right(v, cols.amount, strong ? 11 : 9.5, strong ? bold : reg);
    y -= strong ? 18 : 15;
  }
  if (c.vatRatePercent === 0 && !s.vatNumber) {
    text("No VAT charged: the business is not VAT registered.", cols.unit - 60, 8, reg, MUTED);
    y -= 12;
  }
  y -= 10;

  // Payment instructions and notes
  for (const [title, body] of [["How to pay", `${c.paymentInstructions}${c.paymentInstructions ? "\n" : ""}Payment terms: ${c.paymentTermsDays} days from the invoice date.`], ["Notes", c.notes]] as const) {
    if (!body.trim()) continue;
    const lines = wrap(body, reg, 9.5, A4.w - 2 * M);
    if (y - lines.length * 13 - 16 < M) newPage();
    text(title, M, 8.5, bold, MUTED);
    y -= 13;
    block(lines, M);
    y -= 8;
  }
  if (inv.status === "cancelled") {
    const p0 = doc.getPage(0);
    p0.drawText("CANCELLED", { x: 150, y: 420, size: 72, font: bold, color: rgb(0.71, 0.14, 0.09), opacity: 0.18, rotate: degrees(30) });
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pages.length}`, { x: A4.w - M - 60, y: 24, size: 8, font: reg, color: MUTED }));
  return doc.save();
}
