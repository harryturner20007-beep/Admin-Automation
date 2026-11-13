// Garage-specific follow-up settings: validation, a preview of what a change would move, and applying it
// without touching anything already sent.
import { log, renderTemplate } from "./engine";
import { isSuppressed } from "./gate";
import { sendKey, stepWindow } from "./schedule";
import { TEMPLATE_FIELDS } from "./templates";
import type { AppState, FollowUpMode, FollowUpSetting, Garage } from "./types";

export type SettingsInput = {
  mode: FollowUpMode;
  followUps: [FollowUpSetting, FollowUpSetting];
  templates: Record<1 | 2, string>;
};

export type SettingsErrors = Partial<Record<"days1" | "days2" | "time1" | "time2" | "template1" | "template2", string>>;

const KNOWN = new Set<string>(TEMPLATE_FIELDS.map((f) => f.key));

export function validateSettings(input: SettingsInput): SettingsErrors {
  const e: SettingsErrors = {};
  const [a, b] = input.followUps;
  const days = (n: number) => Number.isInteger(n) && n >= 1 && n <= 20;
  if (!days(a.businessDays)) e.days1 = "Use a whole number of business days from 1 to 20";
  if (b.enabled && !days(b.businessDays)) e.days2 = "Use a whole number of business days from 1 to 20";
  else if (b.enabled && b.businessDays <= a.businessDays) e.days2 = "The second follow-up must come after the first";
  const time = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  if (!time(a.sendTime)) e.time1 = "Choose a time";
  if (b.enabled && !time(b.sendTime)) e.time2 = "Choose a time";
  for (const step of [1, 2] as const) {
    if (step === 2 && !b.enabled) continue;
    const body = input.templates[step].trim();
    const key = step === 1 ? "template1" : "template2";
    const unknown = [...body.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map((m) => m[1]).filter((n) => !KNOWN.has(n));
    if (!body) e[key] = "Write the message";
    else if (unknown.length) e[key] = `Unknown field: {{${unknown[0]}}}. Use the buttons to insert fields.`;
    else if (!/\bstop\b/i.test(body)) e[key] = "Tell customers how to opt out, e.g. \"Reply STOP to opt out.\"";
  }
  return e;
}

export type ScheduleChange = {
  quoteId: string;
  customerName: string;
  step: 1 | 2;
  from: string | null; // scheduled send time now (ISO), null if not scheduled
  to: string | null; // scheduled send time after the change, null if it will no longer go
};

const PENDING = ["awaiting_approval", "approved"];

/**
 * Which unsent follow-ups a change would move. Steps that already went out (or expired/were cancelled)
 * are never rescheduled, so a settings change can't replay a message.
 */
export function previewScheduleChanges(state: AppState, garageId: string, next: Pick<Garage, "followUps" | "mode">): { changes: ScheduleChange[]; alreadySent: number } {
  const garage = state.garages.find((g) => g.id === garageId)!;
  const now = Date.parse(state.now);
  const changes: ScheduleChange[] = [];
  let alreadySent = 0;
  for (const q of state.quotes) {
    if (q.garageId !== garageId) continue;
    for (const step of [1, 2] as const) {
      const msg = state.messages.find((m) => m.sendKey === sendKey(garageId, q.id, q.revision, step));
      if (msg && !PENDING.includes(msg.status ?? "")) {
        if (msg.status === "sent" || msg.status === "delivered") alreadySent++;
        continue;
      }
      if (q.status !== "open" || !q.eligibilityEvidenceRef || isSuppressed(state.suppressions, garageId, q.phone)) continue;
      const live = (w: ReturnType<typeof stepWindow>, mode: FollowUpMode) => (w && mode !== "off" && Date.parse(w.windowEnd) > now ? w.windowStart : null);
      const from = live(stepWindow(q, garage, step), garage.mode);
      const to = live(stepWindow(q, { ...garage, followUps: next.followUps }, step), next.mode);
      if (from !== to) changes.push({ quoteId: q.id, customerName: q.customerName, step, from, to });
    }
  }
  return { changes, alreadySent };
}

export function applyFollowUpSettings(state: AppState, garageId: string, input: SettingsInput, staffName: string): ScheduleChange[] {
  const garage = state.garages.find((g) => g.id === garageId)!;
  const { changes } = previewScheduleChanges(state, garageId, input);
  garage.mode = input.mode;
  garage.followUps = input.followUps;
  for (const step of [1, 2] as const) {
    const t = state.templates.find((x) => x.garageId === garageId && x.step === step);
    if (t) {
      t.body = input.templates[step].trim();
      t.approved = true; // saved by staff on the settings screen
    }
  }
  // Unsent drafts follow the new schedule and wording. Anything already sent is left exactly as it was.
  for (const m of state.messages) {
    if (m.garageId !== garageId || m.direction !== "outbound" || m.invoiceId || m.manual || !PENDING.includes(m.status ?? "")) continue;
    const q = state.quotes.find((x) => x.id === m.quoteId)!;
    const w = stepWindow(q, garage, m.step!);
    const t = state.templates.find((x) => x.garageId === garageId && x.step === m.step)!;
    const rendered = renderTemplate(t, q, garage);
    if (garage.mode === "off" || !w || rendered.unresolved.length) {
      m.status = "cancelled";
      m.statusReasons = [garage.mode === "off" ? "follow_ups_off" : !w ? "follow_up_switched_off" : "template_unresolved"];
      continue;
    }
    m.windowStart = w.windowStart;
    m.windowEnd = w.windowEnd;
    m.body = rendered.text;
  }
  const modeText = { off: "Off", draft: "Draft for approval", automatic: "Automatic" }[garage.mode];
  const days = (n: number) => `${n} business day${n === 1 ? "" : "s"}`;
  log(state, garageId, "settings", `${staffName} saved follow-up settings: ${modeText}; follow-up 1 at ${days(input.followUps[0].businessDays)}, ${input.followUps[0].sendTime}${input.followUps[1].enabled ? `; follow-up 2 at ${days(input.followUps[1].businessDays)}, ${input.followUps[1].sendTime}` : "; follow-up 2 off"}. ${changes.length} unsent follow-up${changes.length === 1 ? "" : "s"} moved.`);
  return changes;
}

/** Customer-facing job wording for texts. Unsent drafts for the quote pick it up; sent texts never change. */
export function setCustomerJobDescription(state: AppState, quoteId: string, text: string, staffName: string) {
  const q = state.quotes.find((x) => x.id === quoteId)!;
  const garage = state.garages.find((g) => g.id === q.garageId)!;
  q.customerJobDescription = text.trim() || undefined;
  for (const m of state.messages) {
    if (m.quoteId !== q.id || m.direction !== "outbound" || m.invoiceId || m.manual || !PENDING.includes(m.status ?? "")) continue;
    const t = state.templates.find((x) => x.garageId === q.garageId && x.step === m.step)!;
    m.body = renderTemplate(t, q, garage).text;
  }
  log(state, q.garageId, "job_wording", q.customerJobDescription ? `${staffName} set the text wording for ${q.customerName}'s job to "${q.customerJobDescription}"` : `${staffName} cleared the text wording for ${q.customerName}'s job`, q.id);
}
