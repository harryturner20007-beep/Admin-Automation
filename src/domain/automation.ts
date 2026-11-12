// The scheduled follow-up run. In production a cloud scheduler calls this every 15 minutes from a
// protected worker endpoint; in demo mode the demo clock drives it tick by tick.
import type { SmsProvider } from "@/sms/provider";
import { applyDeliveryStatus, dispatchApproved, runFollowUpCheck, type CheckReportItem, type SendReportItem } from "./engine";
import type { AppState } from "./types";

export const TICK_MS = 15 * 60 * 1000;

export type RunReport = { check: CheckReportItem[]; sends: SendReportItem[] };

/**
 * One scheduler run: draft (or, in Automatic mode, queue) everything due, then send what is approved.
 * Safe to repeat: drafts are unique per garage + quote + revision + step, and each send is claimed once.
 */
export async function runScheduledCheck(state: AppState, provider: SmsProvider, garageIds?: string[]): Promise<RunReport> {
  const ids = garageIds ?? state.garages.map((g) => g.id);
  const check = runFollowUpCheck(state, ids);
  const sends = state.messages.some((m) => m.status === "approved" && ids.includes(m.garageId)) ? await dispatchApproved(state, provider) : [];
  if (provider.name === "mock") {
    // The mock provider "delivers" at once; Twilio reports delivery later through a status webhook.
    for (const r of sends.filter((x) => x.outcome === "sent")) {
      const m = state.messages.find((x) => x.id === r.messageId)!;
      applyDeliveryStatus(state, { eventId: `${m.providerMessageId}:delivered`, providerMessageId: m.providerMessageId!, status: "delivered" });
    }
  }
  return { check, sends };
}

/**
 * Demo stand-in for the scheduler: move the demo clock forward and run every 15-minute tick in
 * between, so texts go out at their scheduled time, not whenever the clock happened to land.
 * Returns null when every garage has follow-ups switched off.
 */
export async function advanceDemoClock(state: AppState, ms: number, provider: SmsProvider): Promise<RunReport | null> {
  const end = Date.parse(state.now) + ms;
  const active = state.garages.filter((g) => g.mode !== "off").map((g) => g.id);
  if (!active.length) {
    state.now = new Date(end).toISOString();
    return null;
  }
  const report: RunReport = { check: [], sends: [] };
  for (let t = Math.floor(Date.parse(state.now) / TICK_MS) * TICK_MS + TICK_MS; t <= end; t += TICK_MS) {
    state.now = new Date(t).toISOString();
    const r = await runScheduledCheck(state, provider, active);
    report.check.push(...r.check.filter((c) => c.outcome !== "already_handled"));
    report.sends.push(...r.sends);
  }
  state.now = new Date(end).toISOString();
  return report;
}
