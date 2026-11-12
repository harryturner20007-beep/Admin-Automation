import type { Garage, InvoiceStep, Quote, Weekday } from "./types";
import {
  addBusinessDays,
  addCalendarDays,
  isBusinessDay,
  londonParts,
  londonToUtc,
  parseHHMM,
  weekdayOf,
  type LocalDate,
} from "./time";

export const DEFAULT_FOLLOW_UPS: Garage["followUps"] = [
  { enabled: true, businessDays: 2, sendTime: "10:00" },
  { enabled: true, businessDays: 5, sendTime: "10:00" },
];

export type StepWindow = {
  step: 1 | 2;
  dueDate: LocalDate;
  windowStart: string; // ISO: the exact scheduled send time
  windowEnd: string; // ISO: closing time that day; a missed window expires, nothing is sent late
};

const minutes = (t: { hh: number; mm: number }) => t.hh * 60 + t.mm;

/**
 * Follow-up N goes out `businessDays` business days (Europe/London) after the quote was sent,
 * at the garage's preferred send time, kept inside that day's opening hours: a time before opening
 * moves to opening; a time at or after closing falls back to opening. If the garage is closed that
 * weekday, it rolls to the next business day it is open. Returns null when the step is switched off.
 */
export function stepWindow(quote: Pick<Quote, "quoteSentAt">, garage: Pick<Garage, "hours" | "followUps">, step: 1 | 2): StepWindow | null {
  const setting = garage.followUps[step - 1];
  if (!setting || (step === 2 && !setting.enabled)) return null;
  const sent = londonParts(quote.quoteSentAt);
  const w = openWindowFrom(garage, addBusinessDays({ y: sent.y, m: sent.m, d: sent.d }, setting.businessDays), parseHHMM(setting.sendTime));
  return w && { step, ...w };
}

/**
 * The first business day on or after `due` that the garage is open, at `preferred` kept inside opening hours
 * (before opening moves to opening; at or after closing falls back to opening). Null if never open.
 */
function openWindowFrom(garage: Pick<Garage, "hours">, due: LocalDate, preferred: { hh: number; mm: number }): Omit<StepWindow, "step"> | null {
  for (let i = 0; i < 14; i++) {
    const hours = garage.hours[weekdayOf(due) as Weekday];
    if (hours && isBusinessDay(due)) {
      const open = parseHHMM(hours.open);
      const close = parseHHMM(hours.close);
      const at = minutes(preferred) < minutes(open) || minutes(preferred) >= minutes(close) ? open : preferred;
      return {
        dueDate: due,
        windowStart: londonToUtc(due, at.hh, at.mm).toISOString(),
        windowEnd: londonToUtc(due, close.hh, close.mm).toISOString(),
      };
    }
    due = addCalendarDays(due, 1);
  }
  return null; // garage has no opening hours on business days
}

/** Calendar days after the invoice date that each reminder is due. */
export const INVOICE_REMINDER_DAYS = { 1: 7, 2: 14 } as const;

/**
 * When an invoice text may go. Step 0 (the invoice) goes from `from` if the garage is open then,
 * otherwise at the next opening. Reminders go N calendar days after `from` at follow-up 1's send time,
 * moved to the next open business day. Pass `from` = now to get the next window after a missed one.
 */
export function invoiceWindow(from: string, garage: Pick<Garage, "hours" | "followUps">, step: InvoiceStep): Omit<StepWindow, "step"> | null {
  const p = londonParts(from);
  const day: LocalDate = { y: p.y, m: p.m, d: p.d };
  const sendTime = parseHHMM(garage.followUps[0].sendTime);
  if (step > 0) return openWindowFrom(garage, addCalendarDays(day, INVOICE_REMINDER_DAYS[step as 1 | 2]), sendTime);
  const today = openWindowFrom(garage, day, { hh: p.hh, mm: p.mm });
  if (today && Date.parse(today.windowEnd) > Date.parse(from)) {
    return { ...today, windowStart: Date.parse(today.windowStart) > Date.parse(from) ? today.windowStart : from };
  }
  return openWindowFrom(garage, addCalendarDays(day, 1), { hh: 0, mm: 0 }); // closed now: next opening
}

export const invoiceSendKey = (garageId: string, invoiceId: string, step: InvoiceStep) => `${garageId}:${invoiceId}:i${step}`;

export function sendKey(garageId: string, quoteId: string, revision: number, step: 1 | 2): string {
  return `${garageId}:${quoteId}:r${revision}:s${step}`;
}

export function isInsideWindow(now: string, w: Pick<StepWindow, "windowStart" | "windowEnd">): boolean {
  const t = Date.parse(now);
  return t >= Date.parse(w.windowStart) && t < Date.parse(w.windowEnd);
}
