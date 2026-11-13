// Chats: every text to or from a customer, grouped by their phone number.
import type { AppState, Message } from "./types";

export type Thread = {
  phone: string;
  name: string; // the customer's name from their quote, or the number
  messages: Message[]; // oldest first
  last: Message;
  hasOpenTask: boolean; // a reply here needs a person: it is listed with the replies instead
};

const SHOWN = ["sent", "delivered", "failed", "needs_reconciliation"];
const at = (m: Message) => m.sentAt ?? m.createdAt;

/** Texts staff and customers have actually exchanged (not drafts or blocked texts), newest conversation first. */
export function chatThreads(state: AppState, garageId: string): Thread[] {
  const byPhone = new Map<string, Message[]>();
  for (const m of state.messages) {
    if (m.garageId !== garageId) continue;
    if (m.direction === "outbound" && !SHOWN.includes(m.status ?? "")) continue;
    const phone = m.direction === "inbound" ? m.fromPhone : m.toPhone;
    byPhone.set(phone, [...(byPhone.get(phone) ?? []), m]);
  }
  const openTaskPhones = new Set<string>();
  for (const t of state.tasks) {
    if (t.garageId !== garageId || t.status !== "open") continue;
    for (const id of t.quoteIds) {
      const q = state.quotes.find((x) => x.id === id);
      if (q) openTaskPhones.add(q.phone);
    }
    const inbound = t.messageId ? state.messages.find((m) => m.id === t.messageId && m.direction === "inbound") : undefined;
    if (inbound) openTaskPhones.add(inbound.fromPhone);
  }
  return [...byPhone.entries()]
    .map(([phone, list]) => {
      const messages = list.sort((a, b) => Date.parse(at(a)) - Date.parse(at(b)));
      const quote = state.quotes.find((q) => q.garageId === garageId && q.phone === phone);
      return { phone, name: quote?.customerName ?? phone, messages, last: messages.at(-1)!, hasOpenTask: openTaskPhones.has(phone) };
    })
    .sort((a, b) => Date.parse(at(b.last)) - Date.parse(at(a.last)));
}

const compact = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Everything a customer can be found by: names, phone (07… and +44 forms), quote refs, number plates,
 * vehicles, job text, job numbers and invoice numbers, across all their quotes.
 */
export function searchText(state: AppState, garageId: string, phone: string): string {
  const quotes = state.quotes.filter((q) => q.garageId === garageId && q.phone === phone);
  const ids = new Set(quotes.map((q) => q.id));
  const parts = [phone, phone.startsWith("+44") ? `0${phone.slice(3)}` : phone];
  for (const q of quotes) parts.push(q.customerName, q.sourceQuoteId, q.registration ?? "", q.vehicle, q.job, q.customerJobDescription ?? "");
  for (const j of state.jobs) if (ids.has(j.quoteId)) parts.push(j.number);
  for (const i of state.invoices) if (ids.has(i.quoteId)) parts.push(i.number, i.content?.jobNumber ?? "", i.content?.customer.name ?? "");
  return parts.join(" ");
}

/** Every word typed must appear somewhere in the text (ignoring case, spaces and punctuation, so "ob21 ksp" finds OB21KSP). */
export function matchesSearch(text: string, query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).map(compact).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = compact(text);
  return tokens.every((t) => haystack.includes(t));
}
