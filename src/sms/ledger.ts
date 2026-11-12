// Wraps a provider so each send key reaches the provider at most once, across clicks, tabs, retries and
// overlapping workers. The claim and the answer live in the database (sms_sends); a repeat of a finished
// send gets the stored answer back instead of a second text.
import { smsSegments } from "@/domain/sms";
import type { SendRequest, SendResult, SmsProvider } from "./provider";

export type Claim =
  | { outcome: "claimed" }
  | { outcome: "limited" }
  | { outcome: "exists"; status: "claimed" | "accepted" | "rejected" | "unknown"; providerSid: string | null; error: string | null; claimedAt: string };

export interface SendLedger {
  claim(req: SendRequest & { segments: number }): Promise<Claim>;
  finish(sendKey: string, result: SendResult): Promise<void>;
}

/** A claim older than this with no answer belongs to a worker that stopped mid-send. */
const STALE_MS = 2 * 60_000;

export class LedgerProvider implements SmsProvider {
  constructor(
    private inner: SmsProvider,
    private ledger: SendLedger,
    private dailyLimit: number,
  ) {}

  get name() {
    return this.inner.name;
  }

  async send(req: SendRequest): Promise<SendResult> {
    const c = await this.ledger.claim({ ...req, segments: smsSegments(req.body).segments || 1 });
    if (c.outcome === "limited") return { kind: "rejected", error: `Daily text limit reached for this garage (${this.dailyLimit} SMS parts in 24 hours). It protects against runaway sending; ask us to raise it.` };
    if (c.outcome === "exists") {
      if (c.status === "accepted") return { kind: "accepted", providerMessageId: c.providerSid!, status: "queued" };
      if (c.status === "rejected") return { kind: "rejected", error: c.error ?? "The provider rejected it" };
      if (c.status === "unknown") return { kind: "ambiguous", error: c.error ?? "No clear answer from the provider" };
      return Date.now() - Date.parse(c.claimedAt) > STALE_MS ? { kind: "ambiguous", error: "An earlier attempt stopped before the provider answered; check before resending" } : { kind: "in_flight" };
    }
    let result: SendResult;
    try {
      result = await this.inner.send(req);
    } catch (e) {
      result = { kind: "ambiguous", error: (e as Error).message };
    }
    await this.ledger.finish(req.idempotencyKey, result);
    return result;
  }
}
