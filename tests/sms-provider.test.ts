import twilio from "twilio";
import { describe, expect, it } from "vitest";
import { dispatchApproved } from "@/domain/engine";
import { prepareManualSend } from "@/domain/sms";
import { buildSeedState, DEMO_STAFF } from "@/demo/seed";
import { LedgerProvider, type Claim, type SendLedger } from "@/sms/ledger";
import type { SendRequest, SendResult, SmsProvider } from "@/sms/provider";
import { TwilioProvider } from "@/sms/twilio";
import { verifyTwilio } from "@/sms/webhook";

/** In-memory stand-in for the sms_sends table and its claim function. */
function memoryLedger(limit = 100) {
  const rows = new Map<string, { status: "claimed" | "accepted" | "rejected" | "unknown"; sid: string | null; error: string | null; claimedAt: string; segments: number }>();
  const ledger: SendLedger = {
    async claim(req) {
      const r = rows.get(req.idempotencyKey);
      if (r) return { outcome: "exists", status: r.status, providerSid: r.sid, error: r.error, claimedAt: r.claimedAt } satisfies Claim;
      if ([...rows.values()].reduce((n, x) => n + x.segments, 0) + req.segments > limit) return { outcome: "limited" };
      rows.set(req.idempotencyKey, { status: "claimed", sid: null, error: null, claimedAt: new Date().toISOString(), segments: req.segments });
      return { outcome: "claimed" };
    },
    async finish(key, res) {
      const r = rows.get(key)!;
      Object.assign(r, res.kind === "accepted" ? { status: "accepted", sid: res.providerMessageId } : { status: res.kind === "rejected" ? "rejected" : "unknown", error: "error" in res ? res.error : null });
    },
  };
  return { ledger, rows };
}

class SlowProvider implements SmsProvider {
  name = "test";
  calls = 0;
  constructor(private result: () => SendResult, private delay = 5) {}
  async send(_: SendRequest): Promise<SendResult> {
    this.calls++;
    await new Promise((r) => setTimeout(r, this.delay));
    return this.result();
  }
}

const req = (key: string): SendRequest => ({ from: "+447700900999", to: "+447700900101", body: "Hi", idempotencyKey: key });

describe("send ledger", () => {
  it("two workers sending the same text at once reach the provider once", async () => {
    const { ledger } = memoryLedger();
    const inner = new SlowProvider(() => ({ kind: "accepted", providerMessageId: "SM1", status: "queued" }));
    const a = new LedgerProvider(inner, ledger, 100);
    const b = new LedgerProvider(inner, ledger, 100);
    const [ra, rb] = await Promise.all([a.send(req("k")), b.send(req("k"))]);
    expect(inner.calls).toBe(1);
    expect([ra.kind, rb.kind].sort()).toEqual(["accepted", "in_flight"]);
    expect(await a.send(req("k"))).toEqual({ kind: "accepted", providerMessageId: "SM1", status: "queued" }); // a retry gets the stored answer
    expect(inner.calls).toBe(1);
  });

  it("a timeout is stored as unknown and never resent blindly", async () => {
    const { ledger } = memoryLedger();
    const inner = new SlowProvider(() => ({ kind: "ambiguous", error: "No answer from Twilio in time" }));
    const p = new LedgerProvider(inner, ledger, 100);
    expect((await p.send(req("k"))).kind).toBe("ambiguous");
    expect((await p.send(req("k"))).kind).toBe("ambiguous");
    expect(inner.calls).toBe(1);
  });

  it("a claim left by a crashed worker becomes 'Delivery unknown', not a second text", async () => {
    const { ledger, rows } = memoryLedger();
    await ledger.claim({ ...req("k"), segments: 1 });
    rows.get("k")!.claimedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    const inner = new SlowProvider(() => ({ kind: "accepted", providerMessageId: "SM2", status: "queued" }));
    expect((await new LedgerProvider(inner, ledger, 100).send(req("k"))).kind).toBe("ambiguous");
    expect(inner.calls).toBe(0);
  });

  it("stops at the garage's daily limit", async () => {
    const { ledger } = memoryLedger(1);
    const inner = new SlowProvider(() => ({ kind: "accepted", providerMessageId: "SM3", status: "queued" }));
    const p = new LedgerProvider(inner, ledger, 1);
    await p.send(req("a"));
    const r = await p.send(req("b"));
    expect(r).toMatchObject({ kind: "rejected", error: expect.stringMatching(/Daily text limit/) });
    expect(inner.calls).toBe(1);
  });

  it("two scheduler runs over copies of the same workspace send each due text once", async () => {
    const s1 = await buildSeedState();
    prepareManualSend(s1, { quoteId: "q_ava" }, "Hi Ava", "k1", DEMO_STAFF);
    const s2 = structuredClone(s1);
    const { ledger } = memoryLedger();
    const inner = new SlowProvider(() => ({ kind: "accepted", providerMessageId: `SM${Math.random()}`, status: "queued" }));
    await Promise.all([dispatchApproved(s1, new LedgerProvider(inner, ledger, 100)), dispatchApproved(s2, new LedgerProvider(inner, ledger, 100))]);
    expect(inner.calls).toBe(1);
  });
});

describe("Twilio provider", () => {
  const client = (fn: () => Promise<unknown>) => ({ messages: { create: fn } }) as never;
  const send = (fn: () => Promise<unknown>) => new TwilioProvider(client(fn), "https://x/api/sms/status").send(req("k"));

  it("reports acceptance with Twilio's id and status", async () => {
    expect(await send(async () => ({ sid: "SMabc", status: "queued" }))).toEqual({ kind: "accepted", providerMessageId: "SMabc", status: "queued" });
  });
  it("turns Twilio errors into staff words; uncertain ones are never treated as failures", async () => {
    const fail = (e: object) => send(async () => Promise.reject(e));
    expect(await fail({ status: 400, code: 21211, message: "Invalid 'To'" })).toEqual({ kind: "rejected", error: "The customer's number isn't valid" });
    expect(await fail({ status: 400, code: 21606 })).toMatchObject({ kind: "rejected", error: expect.stringMatching(/sending number/) });
    expect(await fail({ status: 401, code: 20003 })).toMatchObject({ kind: "rejected", error: expect.stringMatching(/credentials/) });
    expect(await fail({ status: 400, code: 99999, message: "Insufficient balance" })).toMatchObject({ error: "The Twilio account is out of credit" });
    expect((await fail({ status: 429, code: 20429 })).kind).toBe("ambiguous");
    expect((await fail({ status: 503 })).kind).toBe("ambiguous");
    expect((await fail(new Error("socket hang up"))).kind).toBe("ambiguous");
  });
});

describe("webhook signatures", () => {
  const env = { TWILIO_AUTH_TOKEN: "test_token_123", TWILIO_ACCOUNT_SID: "ACtest" } as unknown as NodeJS.ProcessEnv;
  const url = "https://desk.example/api/sms/inbound";
  const params = { AccountSid: "ACtest", MessageSid: "SMin1", From: "+447700900101", To: "+447700900999", Body: "Yes please" };
  const body = new URLSearchParams(params).toString();
  const sig = twilio.getExpectedTwilioSignature("test_token_123", url, params);

  it("accepts a genuine Twilio request", () => {
    expect(verifyTwilio(url, body, sig, env)).toMatchObject({ valid: true, params });
  });
  it("rejects forged, altered, misaddressed or unsigned requests", () => {
    expect(verifyTwilio(url, body.replace("Yes", "No"), sig, env).valid).toBe(false); // body changed
    expect(verifyTwilio(url, body, twilio.getExpectedTwilioSignature("wrong_token", url, params), env).valid).toBe(false);
    expect(verifyTwilio("https://other.example/api/sms/inbound", body, sig, env).valid).toBe(false);
    expect(verifyTwilio(url, body, null, env).valid).toBe(false);
    expect(verifyTwilio(url, body, sig, { ...env, TWILIO_ACCOUNT_SID: "ACother" }).valid).toBe(false); // another account's number
    expect(verifyTwilio(url, body, sig, { ...env, TWILIO_AUTH_TOKEN: "" }).valid).toBe(false); // not configured: refuse everything
  });
});
