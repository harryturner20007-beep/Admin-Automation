"use server";
// SMS actions. The garage always comes from the signed-in member, and the sending number from the trusted
// sms_numbers table, never from the request. Every text goes through the same pipeline as automatic ones.

import { randomUUID } from "node:crypto";
import twilio from "twilio";
import { approveMessage, reconcileSend } from "@/domain/engine";
import { normaliseUkMobile } from "@/domain/intake";
import { deliveryLabel, prepareManualSend, type ManualTarget } from "@/domain/sms";
import type { AppState } from "@/domain/types";
import { TwilioProvider } from "@/sms/twilio";
import { providerFor, senderFor, siteUrl, SMS_DAILY_LIMIT, smsConfig, withWorkspace } from "./store";
import { adminClient, currentMember } from "./supabase";

export type TextResult = { ok: true; doc: AppState; version: number; status: string; detail?: string } | { ok: false; error: string };

async function member() {
  const m = await currentMember();
  if (!m?.garageId) throw new Error("You've been signed out. Sign in again.");
  return m;
}

const outcome = (doc: AppState, version: number, messageId: string): TextResult => {
  const msg = doc.messages.find((x) => x.id === messageId)!;
  const { label } = deliveryLabel(msg);
  return { ok: true, doc, version, status: label, detail: msg.deliveryError ?? (msg.status === "approved" ? "It will go at the next check, inside the sending window." : undefined) };
};

/** "Send follow-up": a staff-written text for a quote or invoice, sent now from the garage's number. */
export async function sendText(target: ManualTarget, body: string, requestKey: string): Promise<TextResult> {
  try {
    const m = await member();
    if (typeof body !== "string" || typeof requestKey !== "string" || requestKey.length > 64) return { ok: false, error: "Bad request" };
    const sender = await senderFor(m.garageId);
    if (!providerFor(m.garageId, sender)) return { ok: false, error: setupError(sender) };
    const { doc, version, result } = await withWorkspace(m.garageId, m, "send text", (d) => prepareManualSend(d, target, body, requestKey, m.displayName).id);
    return outcome(doc, version, result);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Approve a waiting draft and send it now (if it's inside its sending window). */
export async function approveAndSendText(messageId: string): Promise<TextResult> {
  try {
    const m = await member();
    const { doc, version } = await withWorkspace(m.garageId, m, "approve text", (d) => {
      const msg = d.messages.find((x) => x.id === messageId);
      if (msg?.status === "awaiting_approval") approveMessage(d, messageId, m.displayName); // repeat clicks: already approved
      else if (!msg) throw new Error("Text not found");
    });
    return outcome(doc, version, messageId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function setupError(sender: Awaited<ReturnType<typeof senderFor>>): string {
  const cfg = smsConfig();
  if (!sender) return "SMS setup required: no sending number is connected to this garage yet";
  if (sender.status !== "active") return `SMS setup required: the number ${sender.phone_e164} is ${sender.status === "pending" ? "waiting for activation" : "switched off"}`;
  return `SMS setup required: missing ${cfg.missing.join(", ")}`;
}

export type SmsStatus = {
  mode: "live" | "simulated" | "setup_required";
  missing: string[];
  sender: { phone: string; status: string } | null;
  dailyLimit: number;
  usage: { today: number; month: number; failedMonth: number };
  recentFailures: { at: string; to: string; error: string }[];
};

export async function smsStatus(): Promise<SmsStatus | null> {
  const m = await currentMember();
  if (!m?.garageId) return null;
  const cfg = smsConfig();
  const sender = await senderFor(m.garageId);
  const since = new Date(Date.now() - 31 * 86_400_000).toISOString();
  const { data } = await adminClient().from("sms_sends").select("segments, status, error, to_phone, claimed_at").eq("garage_id", m.garageId).gte("claimed_at", since).order("claimed_at", { ascending: false }).limit(2000);
  const rows = data ?? [];
  const day = Date.now() - 86_400_000;
  const mask = (p: string) => p.replace(/\d(?=\d{3})/g, "•"); // only what staff need to recognise the number
  return {
    mode: sender?.status === "active" && cfg.live ? "live" : sender?.status === "active" && cfg.simulated ? "simulated" : "setup_required",
    missing: [...cfg.missing, ...(sender ? (sender.status === "active" ? [] : [`sending number ${sender.phone_e164} is ${sender.status}`]) : ["a sending number connected to this garage (platform admin)"])],
    sender: sender && { phone: sender.phone_e164, status: sender.status },
    dailyLimit: SMS_DAILY_LIMIT,
    usage: {
      today: rows.filter((r) => Date.parse(r.claimed_at) > day && r.status !== "rejected").reduce((s, r) => s + r.segments, 0),
      month: rows.filter((r) => r.status !== "rejected").reduce((s, r) => s + r.segments, 0),
      failedMonth: rows.filter((r) => r.status === "rejected" || r.status === "unknown").length,
    },
    recentFailures: rows.filter((r) => r.error).slice(0, 5).map((r) => ({ at: r.claimed_at, to: mask(r.to_phone), error: r.error! })),
  };
}

/** Owner sends a test text to a UK mobile (theirs). Counted in the daily limit; at most 5 a day. */
export async function sendTestText(to: string): Promise<{ ok: true; sid: string; status: string } | { ok: false; error: string }> {
  try {
    const m = await member();
    if (m.role !== "owner") return { ok: false, error: "Only the garage owner can send test texts" };
    const phone = normaliseUkMobile(String(to));
    if (!phone) return { ok: false, error: "Enter a UK mobile number (07…)" };
    const sender = await senderFor(m.garageId);
    const provider = providerFor(m.garageId, sender, true);
    if (!provider) return { ok: false, error: setupError(sender) };
    const { count } = await adminClient().from("sms_sends").select("send_key", { count: "exact", head: true }).eq("garage_id", m.garageId).eq("is_test", true).gte("claimed_at", new Date(Date.now() - 86_400_000).toISOString());
    if ((count ?? 0) >= 5) return { ok: false, error: "That's 5 test texts today. Try again tomorrow." };
    const body = `Test from ${m.garageName} via Garage desk. If you got this, texts from ${sender!.phone_e164} are working.`;
    const r = await provider.send({ from: sender!.phone_e164, to: phone, body, idempotencyKey: `test:${randomUUID()}` });
    if (r.kind === "accepted") return { ok: true, sid: r.providerMessageId, status: r.status };
    return { ok: false, error: "error" in r ? r.error : "Already sending" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Settle a "Delivery unknown" text by asking Twilio whether it took it. */
export async function checkWithProvider(messageId: string): Promise<TextResult> {
  try {
    const m = await member();
    if (!smsConfig().live) return { ok: false, error: "Check Twilio's message log by hand, then record the result." };
    const { doc } = await withWorkspace(m.garageId, null, "check send", () => undefined, false);
    const msg = doc.messages.find((x) => x.id === messageId && x.status === "needs_reconciliation");
    if (!msg) return { ok: false, error: "This text doesn't need checking" };
    const hit = await TwilioProvider.fromEnv(`${siteUrl()}/api/sms/status`).findSent(msg.fromPhone, msg.toPhone, msg.body, new Date(msg.claimedAt ?? msg.createdAt));
    if (!hit) return { ok: false, error: "Twilio has no record of it, so it wasn't sent. Record it as not sent; you can then send it again." };
    const r = await withWorkspace(m.garageId, m, "reconcile send", (d) => {
      if (d.messages.find((x) => x.id === messageId)?.status === "needs_reconciliation") reconcileSend(d, messageId, "was_sent", hit.sid);
    }, false);
    return outcome(r.doc, r.version, messageId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------- platform admin: connect a garage's sending number ----------

export type ConnectState = { error?: string; ok?: string } | undefined;

/**
 * Platform admin only. Checks the number is in the Twilio account and can send SMS, points its incoming
 * messages at this app, and links it to the garage. Without Twilio credentials (development) it's saved as
 * pending, or active when the visible simulation is on.
 */
export async function connectSmsNumber(_: ConnectState, form: FormData): Promise<ConnectState> {
  const m = await currentMember();
  if (!m?.platformAdmin) return { error: "Only platform admins can change sending numbers." };
  const garageId = String(form.get("garage") ?? "");
  const raw = String(form.get("phone") ?? "").replace(/\s/g, "");
  const phone = raw.startsWith("+44") ? raw : raw.startsWith("0") ? `+44${raw.slice(1)}` : raw;
  if (!/^\+44\d{10}$/.test(phone)) return { error: "Enter a UK number, e.g. +44 7…" };
  const cfg = smsConfig();
  let status: "pending" | "active" = cfg.simulated ? "active" : "pending";
  let sid: string | null = null;
  if (cfg.live) {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
    const [pn] = await client.incomingPhoneNumbers.list({ phoneNumber: phone, limit: 1 });
    if (!pn) return { error: `${phone} isn't in this Twilio account. Buy or port it into the account first.` };
    if (!pn.capabilities?.sms) return { error: `${phone} can't send SMS (Twilio lists it as voice-only).` };
    await client.incomingPhoneNumbers(pn.sid).update({ smsUrl: `${siteUrl()}/api/sms/inbound`, smsMethod: "POST", smsFallbackUrl: `${siteUrl()}/api/sms/inbound`, smsFallbackMethod: "POST" });
    status = "active";
    sid = pn.sid;
  }
  const { error } = await adminClient().from("sms_numbers").upsert({ garage_id: garageId, phone_e164: phone, provider_sid: sid, status, updated_at: new Date().toISOString(), updated_by: m.userId });
  if (error) return { error: error.code === "23505" ? "That number is already connected to another garage." : "Couldn't save the number." };
  return { ok: `${phone} connected (${status}${cfg.live ? ", incoming texts now come to this app" : cfg.simulated ? ", simulated sending" : "; add Twilio credentials to activate"}).` };
}

