import type { ReplyCategory } from "./types";

// Clear opt-outs are applied BEFORE any classification.
// Single-word keywords follow the standard carrier/Twilio opt-out set;
// phrases catch obvious plain-English opt-outs. Anything unclear goes to staff.
const OPT_OUT_KEYWORDS = new Set([
  "STOP", "STOPALL", "STOP ALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "OPT OUT", "REVOKE",
]);

const OPT_OUT_PHRASES = [
  /\bstop (texting|messaging|contacting|sending)\b/i,
  /\b(don'?t|do not) (text|message|contact) me\b/i,
  /\bremove (me|my number)\b/i,
  /\bunsubscribe\b/i,
  /\bopt[ -]?out\b/i,
];

export function normaliseReply(body: string): string {
  return body.trim().replace(/[.!\s]+$/g, "").replace(/\s+/g, " ").toUpperCase();
}

/** START / UNSTOP: the standard keywords to opt back in after STOP. */
export const isClearOptIn = (body: string) => ["START", "UNSTOP"].includes(normaliseReply(body));

export function isClearOptOut(body: string): boolean {
  const n = normaliseReply(body);
  if (OPT_OUT_KEYWORDS.has(n)) return true;
  return OPT_OUT_PHRASES.some((re) => re.test(body));
}

const RULES: { category: Exclude<ReplyCategory, "opt_out" | "general">; patterns: RegExp[] }[] = [
  // Safety first: anything about whether the car is safe goes straight to a person.
  {
    category: "repair_or_safety",
    patterns: [/\bsafe\b/i, /\bwarning light\b/i, /\bbrakes?\b/i, /\bnoise\b/i, /\bsmoke\b/i, /\bbreak(s)? down\b/i, /\bok to drive\b/i],
  },
  {
    category: "complaint",
    patterns: [/\bcomplain/i, /\bunhappy\b/i, /\bdisappointed\b/i, /\brip[- ]?off\b/i, /\bterrible\b/i, /\bawful\b/i, /\bnot happy\b/i],
  },
  {
    category: "price_question",
    patterns: [/\bprice\b/i, /\bcheaper\b/i, /\bdiscount\b/i, /\bcost\b/i, /£\s?\d/, /\bbest you can do\b/i, /\bexpensive\b/i, /\bhow much\b/i],
  },
  {
    category: "booking_request",
    patterns: [/\bbook\b/i, /\bbooking\b/i, /\bfit me in\b/i, /\bgo ahead\b/i, /\byes please\b/i, /\bwhen can\b/i, /\bavailab/i, /\bdrop (it|the car) (off|in)\b/i, /\bbring (it|the car) in\b/i, /\b(mon|tues|wednes|thurs|fri|satur)day\b/i],
  },
];

/** Deterministic rule-based classifier. Every category is routed to staff; it only labels the task. */
export function classifyReply(body: string): ReplyCategory {
  if (isClearOptOut(body)) return "opt_out";
  for (const rule of RULES) {
    if (rule.patterns.some((re) => re.test(body))) return rule.category;
  }
  return "general";
}

export const CATEGORY_LABEL: Record<ReplyCategory, string> = {
  opt_out: "Opt-out",
  booking_request: "Wants to book",
  price_question: "Price question",
  complaint: "Complaint",
  repair_or_safety: "Repair / safety question",
  general: "General reply",
};
