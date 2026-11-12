// Invoice arithmetic. Everything is integer pence; quantities are held to 2 decimal places.
// VAT rule (HMRC VAT Notice 700, 17.5): VAT is worked out once on the invoice's net total and the
// fraction of a penny is dropped (rounded down). Line amounts round half up to the penny.
import type { Charges, Line, Totals } from "./types";

/** Quantity in hundredths, so 1.5 hours is 150 and no float error reaches the money. */
const hundredths = (q: number) => Math.round(q * 100);

export const lineTotal = (l: Pick<Line, "quantity" | "unitPence">) => Math.round((hundredths(l.quantity) * l.unitPence) / 100);

export function totals(c: Charges): Totals {
  const subtotalPence = c.lines.reduce((s, l) => s + lineTotal(l), 0);
  const discountPence = Math.min(c.discountPence, subtotalPence);
  const netPence = subtotalPence - discountPence;
  const vatPence = Math.floor((netPence * c.vatRatePercent) / 100);
  return { subtotalPence, discountPence, netPence, vatPence, totalPence: netPence + vatPence };
}

/** Problems with a set of charges, in staff words. Empty when valid. */
export function chargeErrors(c: Charges): string[] {
  const errors: string[] = [];
  if (!c.lines.length) errors.push("Add at least one line of work");
  c.lines.forEach((l, i) => {
    const n = `Line ${i + 1}`;
    if (!l.description.trim()) errors.push(`${n}: add a description`);
    if (!(l.quantity > 0) || hundredths(l.quantity) !== Math.round(l.quantity * 100) || l.quantity > 10_000) errors.push(`${n}: quantity must be more than 0`);
    if (!Number.isInteger(l.unitPence) || l.unitPence < 0) errors.push(`${n}: price must be £0 or more`);
  });
  if (!Number.isInteger(c.discountPence) || c.discountPence < 0) errors.push("Discount must be £0 or more");
  else if (c.discountPence > c.lines.reduce((s, l) => s + lineTotal(l), 0)) errors.push("Discount can't be more than the work");
  if (![0, 5, 20].includes(c.vatRatePercent)) errors.push("VAT rate must be 0%, 5% or 20%");
  return errors;
}

/**
 * Net price of a VAT-inclusive amount. Quotes made before itemised work hold only the customer's
 * total; on a VAT-registered garage that total is split back into net + VAT for the summary line.
 */
export function netOfVat(grossPence: number, ratePercent: number): number {
  const n0 = Math.round((grossPence * 100) / (100 + ratePercent));
  // Prefer the net that gives back exactly the quoted total under the round-down VAT rule.
  return [n0, n0 + 1, n0 - 1].find((n) => n + Math.floor((n * ratePercent) / 100) === grossPence) ?? n0;
}
