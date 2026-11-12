// Manual quote intake: validation, normalisation and creation.
import { log, newId } from "./engine";
import type { AppState, Quote } from "./types";

/** UK mobile (07… or +44 7…) to E.164, or null. Spaces, dashes, dots and brackets are ignored. */
export function normaliseUkMobile(input: string): string | null {
  let d = input.trim().replace(/[\s\-().]/g, "");
  if (d.startsWith("+44")) d = "0" + d.slice(3);
  else if (d.startsWith("0044")) d = "0" + d.slice(4);
  else if (d.startsWith("44") && d.length === 12) d = "0" + d.slice(2);
  if (d.startsWith("00")) d = d.slice(1); // "+44 (0)7…" leaves "007…" once brackets are stripped
  return /^07\d{9}$/.test(d) ? "+44" + d.slice(1) : null;
}

/** "£1,234.50" / "340" → integer pence, or null. At most two decimal places, must be positive. */
export function parsePoundsToPence(input: string): number | null {
  const s = input.trim().replace(/^£/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const pence = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return pence > 0 && Number.isSafeInteger(pence) ? pence : null;
}

/** "ab12cde" → "AB12 CDE" for current-style plates; other formats are just upper-cased. */
export function normaliseRegistration(input: string): string {
  const s = input.trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z]{2}\d{2}[A-Z]{3}$/.test(s) ? `${s.slice(0, 4)} ${s.slice(4)}` : s;
}

const refKey = (ref: string) => ref.trim().toUpperCase();

export function findQuoteByRef(state: AppState, garageId: string, ref: string): Quote | undefined {
  return state.quotes.find((q) => q.garageId === garageId && refKey(q.sourceQuoteId) === refKey(ref));
}

/** Next free "Q-1001"-style reference for this garage. */
export function generateQuoteRef(state: AppState, garageId: string): string {
  const used = state.quotes.filter((q) => q.garageId === garageId).map((q) => /^Q-(\d+)$/i.exec(q.sourceQuoteId)?.[1]).filter(Boolean).map(Number);
  return `Q-${Math.max(1000, ...used) + 1}`;
}

export type QuoteInput = {
  customerName: string;
  phone: string;
  reference: string; // blank = generate
  job: string;
  customerJob?: string; // optional customer-facing wording for texts
  price: string; // pounds, as typed
  vehicle: string;
  registration: string;
  sentAt: string; // ISO UTC
  smsEligible: boolean;
  evidenceRef: string;
};

export type FieldErrors = Partial<Record<keyof QuoteInput, string>> & { duplicateOf?: string };

export class QuoteValidationError extends Error {
  constructor(public errors: FieldErrors) {
    super("Check the highlighted fields");
  }
}

export function validateQuoteInput(state: AppState, garageId: string, input: QuoteInput): FieldErrors {
  const e: FieldErrors = {};
  if (!input.customerName.trim()) e.customerName = "Enter the customer's name";
  if (!input.phone.trim()) e.phone = "Enter a UK mobile number";
  else if (!normaliseUkMobile(input.phone)) e.phone = "Use a UK mobile, e.g. 07700 900123 or +44 7700 900123";
  if (input.reference.trim()) {
    const dup = findQuoteByRef(state, garageId, input.reference);
    if (dup) {
      e.reference = `${dup.sourceQuoteId} is already used for ${dup.customerName}`;
      e.duplicateOf = dup.id;
    } else if (input.reference.trim().length > 30) e.reference = "Keep the reference under 30 characters";
  }
  if (!input.job.trim()) e.job = "Describe the job";
  if (!input.price.trim()) e.price = "Enter the quoted price";
  else if (parsePoundsToPence(input.price) === null) e.price = "Enter an amount in pounds, e.g. 340 or 340.50";
  const sent = Date.parse(input.sentAt);
  if (!input.sentAt || Number.isNaN(sent)) e.sentAt = "Enter when the quote was sent";
  else if (sent > Date.parse(state.now) + 60_000) e.sentAt = "This is in the future. Use when the quote was actually sent";
  if (input.smsEligible && !input.evidenceRef.trim()) e.evidenceRef = "Record where the customer agreed to SMS follow-ups";
  return e;
}

/** Validates (again: this is the trust boundary) and creates the quote. Throws QuoteValidationError. */
export function addQuote(state: AppState, garageId: string, input: QuoteInput, staffName: string): Quote {
  const errors = validateQuoteInput(state, garageId, input);
  if (Object.keys(errors).length) throw new QuoteValidationError(errors);
  const quote: Quote = {
    id: newId(state, "q"),
    garageId,
    sourceQuoteId: input.reference.trim() || generateQuoteRef(state, garageId),
    customerName: input.customerName.trim(),
    phone: normaliseUkMobile(input.phone)!,
    vehicle: input.vehicle.trim(),
    registration: input.registration.trim() ? normaliseRegistration(input.registration) : undefined,
    job: input.job.trim(),
    customerJobDescription: input.customerJob?.trim() || undefined,
    amountPence: parsePoundsToPence(input.price)!,
    quoteSentAt: new Date(input.sentAt).toISOString(),
    status: "open",
    statusConfirmedAt: state.now, // staff entering it now is a fresh "still open" confirmation
    statusSource: "manual",
    eligibilityEvidenceRef: input.smsEligible ? input.evidenceRef.trim() : null,
    revision: 1,
    paused: false,
    unresolvedReply: false,
    booking: "none",
  };
  state.quotes.push(quote);
  log(state, garageId, "quote_added", `${staffName} added quote ${quote.sourceQuoteId} for ${quote.customerName}${quote.eligibilityEvidenceRef ? "" : " (SMS follow-ups off)"}`, quote.id);
  return quote;
}

