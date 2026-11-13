// The one plan. Change the numbers here and the landing page and pricing page follow.
export const PRICE_PENCE = 9900; // per month
export const FIRST_MONTH_DISCOUNT_PERCENT = 50;
export const FIRST_MONTH_PENCE = Math.round((PRICE_PENCE * (100 - FIRST_MONTH_DISCOUNT_PERCENT)) / 100);

const pounds = (p: number) => `£${(p / 100).toFixed(p % 100 ? 2 : 0)}`;
export const PRICE = pounds(PRICE_PENCE);
export const FIRST_MONTH = pounds(FIRST_MONTH_PENCE);

/**
 * Where "Start" sends people: a payment or booking link you create (for example a Stripe Payment Link
 * with a 50%-off-first-month coupon, or a mailto: link). Unset, the pages show the demo instead of a dead button.
 */
export const START_URL = process.env.NEXT_PUBLIC_START_URL || "";
