// Texts staff send by hand, and how any text's status is shown. Sending itself goes through the same
// pipeline as automatic texts (dispatchApproved: claim once, recheck every rule, then the provider).
import { log, newId } from "./engine";
import { isSuppressed } from "./gate";
import { normaliseUkMobile } from "./intake";
import { invoiceSendKey, sendKey } from "./schedule";
import { hasUnresolved } from "./templates";
import { londonParts, londonToUtc } from "./time";
import type { AppState, InvoiceStep, Message } from "./types";

// GSM 03.38: texts using only these characters fit 160 per SMS; anything else (emoji, curly quotes) drops to 70.
const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€"; // count as two characters

export function smsSegments(text: string): { chars: number; segments: number; unicode: boolean } {
  const chars = [...text];
  const unicode = chars.some((c) => !GSM.includes(c) && !GSM_EXT.includes(c));
  const units = unicode ? chars.length : chars.reduce((n, c) => n + (GSM_EXT.includes(c) ? 2 : 1), 0);
  const [single, multi] = unicode ? [70, 67] : [160, 153];
  return { chars: units, segments: units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi), unicode };
}

export const MAX_SEGMENTS = 4; // longer texts cost more and read badly; a cap also limits accidental spend

export type DeliveryTone = "neutral" | "success" | "attention" | "danger";

/** A text's status in staff words. "Delivered" only with a delivery receipt from the network. */
export function deliveryLabel(m: Message): { label: string; tone: DeliveryTone } {
  const sim = m.providerMessageId?.startsWith("SMmock") ? " (simulated)" : "";
  switch (m.status) {
    case "awaiting_approval":
      return { label: "Waiting for approval", tone: "neutral" };
    case "approved":
      return { label: "Pending", tone: "neutral" };
    case "sending":
      return { label: "Sending", tone: "neutral" };
    case "sent":
      return { label: (m.deliveryStatus === "sent" ? "Sent" : "Queued") + sim, tone: "neutral" };
    case "delivered":
      return { label: "Delivered" + sim, tone: "success" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    case "needs_reconciliation":
      return { label: "Delivery unknown", tone: "attention" };
    default:
      return { label: "Not sent", tone: "neutral" };
  }
}

/** Staff may text by hand between 08:00 and 20:00 UK time. */
export function manualWindow(now: string): { windowStart: string; windowEnd: string } | null {
  const p = londonParts(now);
  const end = londonToUtc({ y: p.y, m: p.m, d: p.d }, 20, 0).toISOString();
  return p.hh >= 8 && now < end ? { windowStart: now, windowEnd: end } : null;
}

export type ManualTarget = { quoteId: string } | { invoiceId: string };

/**
 * Turn a staff-typed text into an approved outbound message, ready for the send pipeline.
 * - It takes the place of the next scheduled text for that quote or invoice (same send key), so the
 *   automatic one can never go as well; a waiting automatic draft is reused rather than duplicated.
 * - `requestKey` comes from the composer: a double-click or retry returns the same message.
 * Throws a staff-readable reason if the text can't be sent.
 */
export function prepareManualSend(state: AppState, target: ManualTarget, body: string, requestKey: string, staffName: string): Message {
  const again = state.messages.find((m) => m.requestKey === requestKey);
  if (again) return again;

  const text = body.trim();
  if (!text) throw new Error("Write the message first");
  if (hasUnresolved(text)) throw new Error("The message still has a {{placeholder}} in it");
  if (smsSegments(text).segments > MAX_SEGMENTS) throw new Error(`Keep it to ${MAX_SEGMENTS} SMS parts or fewer`);

  const invoice = "invoiceId" in target ? state.invoices.find((i) => i.id === target.invoiceId) : undefined;
  const quote = state.quotes.find((q) => q.id === ("quoteId" in target ? target.quoteId : invoice?.quoteId));
  if (!quote) throw new Error("Quote not found");
  const garage = state.garages.find((g) => g.id === quote.garageId)!;
  if (!garage.smsNumber) throw new Error("SMS setup required: this garage has no sending number yet");
  if (garage.paused) throw new Error("Sending is paused for the garage");
  if (!normaliseUkMobile(quote.phone)) throw new Error("The customer's number isn't a UK mobile number");
  if (isSuppressed(state.suppressions, garage.id, quote.phone)) throw new Error("This customer opted out of texts (they can text START to opt back in)");
  if (!quote.eligibilityEvidenceRef?.trim()) throw new Error("There's no record of this customer agreeing to texts");
  if (invoice ? invoice.status !== "unpaid" : quote.status !== "open") throw new Error(invoice ? "Only issued, unpaid invoices can be chased" : "Only open quotes can be followed up");
  // The same words to the same customer twice in 10 minutes is a double-click or a refresh, not a new text.
  const recent = state.messages.find((m) => m.manual && m.toPhone === quote.phone && m.body === text && Date.parse(state.now) - Date.parse(m.approvedAt ?? m.createdAt) < 10 * 60_000 && m.status !== "failed" && m.status !== "cancelled");
  if (recent) throw new Error("This exact text was just sent to this customer");
  const window = manualWindow(state.now);
  if (!window) throw new Error("Texts can be sent between 08:00 and 20:00");

  const SENT = ["sending", "sent", "delivered", "needs_reconciliation"];
  const keys: { key: string; step?: 1 | 2; invoiceStep?: InvoiceStep }[] = invoice
    ? ([0, 1, 2] as const).map((s) => ({ key: invoiceSendKey(garage.id, invoice.id, s), invoiceStep: s }))
    : ([1, 2] as const).map((s) => ({ key: sendKey(garage.id, quote.id, quote.revision, s), step: s }));
  const slot = keys.find((k) => !state.messages.some((m) => m.sendKey === k.key && SENT.includes(m.status ?? "")));
  const existing = slot && state.messages.find((m) => m.sendKey === slot.key && (m.status === "awaiting_approval" || m.status === "approved"));

  const fields: Partial<Message> = {
    body: text,
    manual: true,
    requestKey,
    status: "approved",
    approvedBy: staffName,
    approvedAt: state.now,
    statusReasons: undefined,
    fromPhone: garage.smsNumber,
    toPhone: quote.phone,
    ...window,
  };
  if (existing) {
    Object.assign(existing, fields);
    return existing;
  }
  const msg: Message = {
    id: newId(state, "msg"),
    garageId: garage.id,
    quoteId: quote.id,
    direction: "outbound",
    createdAt: state.now,
    revision: quote.revision,
    // No scheduled slot left: an extra text, keyed by the request so it still can't go twice.
    sendKey: slot?.key ?? `${garage.id}:${invoice?.id ?? quote.id}:manual:${requestKey}`,
    step: invoice ? undefined : (slot?.step ?? 2),
    invoiceId: invoice?.id,
    invoiceStep: invoice ? (slot?.invoiceStep ?? 2) : undefined,
    body: text,
    fromPhone: garage.smsNumber,
    toPhone: quote.phone,
  };
  Object.assign(msg, fields);
  state.messages.push(msg);
  log(state, garage.id, "manual_text", `${staffName} sent a text to ${quote.customerName} from this app`, quote.id, { invoiceId: invoice?.id });
  return msg;
}
