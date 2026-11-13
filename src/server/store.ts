// Server-only helpers for reading and writing a garage's workspace, and for running server-side work on it
// (sending texts, webhooks, the scheduler). Not a "use server" file: nothing here is callable from a browser.
import { applyDeliveryStatus, dispatchApproved, type SendReportItem } from "@/domain/engine";
import type { AppState, Invoice } from "@/domain/types";
import { migrateState } from "@/domain/workspace";
import { MockSmsProvider } from "@/sms/provider";
import { LedgerProvider, type SendLedger } from "@/sms/ledger";
import { TwilioProvider } from "@/sms/twilio";
import { adminClient, type Member } from "./supabase";

if (typeof window !== "undefined") throw new Error("server/store is server-only");

export type SaveResult =
  | { kind: "saved"; version: number }
  | { kind: "conflict"; doc: AppState; version: number } // someone saved first: replay on top of this
  | { kind: "invalid"; message: string }
  | { kind: "signed_out" };

export type Sender = { phone_e164: string; status: "pending" | "active" | "disabled"; provider_sid: string | null };

export async function senderFor(garageId: string): Promise<Sender | null> {
  const { data } = await adminClient().from("sms_numbers").select("phone_e164, status, provider_sid").eq("garage_id", garageId).maybeSingle();
  return (data as Sender | null) ?? null;
}

/** The workspace, with the sending number taken from the trusted sms_numbers table (never from a browser save). */
export async function load(garageId: string): Promise<{ doc: AppState; version: number }> {
  const [{ data, error }, sender] = await Promise.all([adminClient().from("workspaces").select("doc, version").eq("garage_id", garageId).single(), senderFor(garageId)]);
  if (error || !data) throw new Error("Couldn't load your garage's records. Try again.");
  const doc = migrateState(data.doc);
  doc.garages[0].smsNumber = sender?.status === "active" ? sender.phone_e164 : "";
  return { doc, version: data.version };
}

export async function write(m: Member | null, garageId: string, baseVersion: number, doc: AppState, op: string, issued?: Invoice): Promise<SaveResult> {
  doc.now = new Date().toISOString();
  const { data, error } = await adminClient().rpc("save_workspace", { p_garage: garageId, p_version: baseVersion, p_doc: doc, p_op: op.slice(0, 120), p_user: m?.userId ?? null, p_issued: issued ?? null });
  if (!error) return { kind: "saved", version: data as number };
  if (error.code === "40001") return { kind: "conflict", ...(await load(garageId)) };
  if (error.code === "42501") return { kind: "signed_out" };
  console.error("save_workspace failed", { code: error.code, garageId }); // no record contents in logs
  return { kind: "invalid", message: error.code === "23514" ? "That change would break a rule (one job per quote, one invoice per job)." : "Couldn't save. Try again." };
}

/**
 * Delivery updates that arrived before the send's own save (the callback can beat it) are held in the ledger;
 * copy any the workspace hasn't seen yet. Same forward-only, de-duplicated rule as the callback itself.
 */
async function catchUpDeliveryStatus(garageId: string, doc: AppState) {
  const waiting = doc.messages.filter((m) => m.providerMessageId && (m.status === "sent" || m.status === "delivered"));
  if (!waiting.length) return;
  const { data } = await adminClient().from("sms_sends").select("provider_sid, provider_status, error").eq("garage_id", garageId).not("provider_status", "is", null).gte("updated_at", new Date(Date.now() - 3 * 86_400_000).toISOString());
  for (const r of data ?? []) {
    if (waiting.some((m) => m.providerMessageId === r.provider_sid && m.deliveryStatus !== r.provider_status))
      applyDeliveryStatus(doc, { eventId: `${r.provider_sid}:${r.provider_status}`, providerMessageId: r.provider_sid, status: r.provider_status, error: r.error ?? undefined });
  }
}

/** The workspace without the clock fields a check always touches. */
const fingerprint = (doc: AppState) => JSON.stringify({ ...doc, now: "", garages: doc.garages.map((g) => ({ ...g, lastCheckAt: "" })) });

// ---------- SMS ----------

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const SMS_DAILY_LIMIT = Number(process.env.SMS_DAILY_LIMIT) || 300; // SMS parts per garage per 24 hours

/** What's missing before real texts can go, in the exact names to set. */
export function smsConfig(): { live: boolean; simulated: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.TWILIO_ACCOUNT_SID) missing.push("TWILIO_ACCOUNT_SID");
  if (!process.env.TWILIO_AUTH_TOKEN) missing.push("TWILIO_AUTH_TOKEN");
  if (!siteUrl().startsWith("https://")) missing.push("NEXT_PUBLIC_SITE_URL (the public https address, for Twilio's callbacks)");
  // Development only: a visibly labelled fake provider. Refused on the production deployment.
  const simulated = process.env.SMS_SIMULATE === "1" && process.env.VERCEL_ENV !== "production";
  return { live: missing.length === 0, simulated: missing.length > 0 && simulated, missing };
}

function ledgerFor(garageId: string, isTest = false): SendLedger {
  const db = adminClient();
  return {
    async claim(req) {
      const { data, error } = await db.rpc("claim_sms_send", { p_garage: garageId, p_key: req.idempotencyKey, p_message: req.messageId ?? "", p_to: req.to, p_from: req.from, p_segments: req.segments, p_daily_limit: SMS_DAILY_LIMIT, p_is_test: isTest });
      if (error) throw new Error("Couldn't reach the database to record the text");
      const row = (data as { outcome: string; status: string; provider_sid: string | null; error: string | null; claimed_at: string }[])[0];
      if (row.outcome === "exists") return { outcome: "exists", status: row.status as "claimed", providerSid: row.provider_sid, error: row.error, claimedAt: row.claimed_at };
      return { outcome: row.outcome as "claimed" | "limited" };
    },
    async finish(key, r) {
      const status = r.kind === "accepted" ? "accepted" : r.kind === "rejected" ? "rejected" : "unknown";
      await db.rpc("finish_sms_send", { p_garage: garageId, p_key: key, p_status: status, p_sid: r.kind === "accepted" ? r.providerMessageId : null, p_provider_status: r.kind === "accepted" ? r.status : null, p_error: "error" in r ? r.error : null });
    },
  };
}

/** The garage's provider, wrapped in the send ledger; null when its number or the provider isn't set up. */
export function providerFor(garageId: string, sender: Sender | null, isTest = false): LedgerProvider | null {
  if (sender?.status !== "active") return null;
  const cfg = smsConfig();
  const inner = cfg.live ? TwilioProvider.fromEnv(`${siteUrl()}/api/sms/status`) : cfg.simulated ? new MockSmsProvider("accept") : null;
  return inner && new LedgerProvider(inner, ledgerFor(garageId, isTest), SMS_DAILY_LIMIT);
}

/**
 * Run a change on a garage's workspace on the server, send whatever it approved, and save. On a save
 * conflict it starts again from the newer copy: the change must be safe to repeat, and texts are, because the
 * send ledger hands back the first attempt's result instead of sending again.
 */
export async function withWorkspace<T>(garageId: string, member: Member | null, label: string, change: (doc: AppState) => T, send = true, issuedOf?: (result: T) => Invoice | undefined): Promise<{ doc: AppState; version: number; result: T; sends: SendReportItem[] }> {
  const sender = await senderFor(garageId);
  const provider = send ? providerFor(garageId, sender) : null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { doc, version } = await load(garageId);
    const before = fingerprint(doc);
    doc.now = new Date().toISOString();
    await catchUpDeliveryStatus(garageId, doc);
    const result = change(doc);
    const sends = provider && doc.messages.some((m) => m.status === "approved") ? await dispatchApproved(doc, provider) : [];
    if (fingerprint(doc) === before) return { doc, version, result, sends }; // nothing changed: don't rewrite (the scheduler runs often)
    const r = await write(member, garageId, version, doc, label, issuedOf?.(result));
    if (r.kind === "saved") return { doc, version: r.version, result, sends };
    if (r.kind !== "conflict") throw new Error(r.kind === "invalid" ? r.message : "Signed out");
  }
  throw new Error("The garage's records are busy. Try again in a moment.");
}
