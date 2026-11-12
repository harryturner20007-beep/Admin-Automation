import type { ProviderMode } from "@/domain/types";

export type SendRequest = {
  from: string; // garage's reply-capable number
  to: string;
  body: string;
  idempotencyKey: string; // the durable send key
  messageId?: string; // the app's message record, for the send ledger
};

export type SendResult =
  | { kind: "accepted"; providerMessageId: string; status: string }
  | { kind: "rejected"; error: string } // provider definitely did not accept: safe to mark failed
  | { kind: "ambiguous"; error: string } // timeout / 5xx / network: MUST reconcile before any retry
  | { kind: "in_flight" }; // another worker or click is sending this exact message right now: leave it to them

/** Twilio (Phase 3) implements this same interface. */
export interface SmsProvider {
  readonly name: string;
  send(req: SendRequest): Promise<SendResult>;
}

/** In-memory provider for the demo and automated tests. Never touches the network. */
export class MockSmsProvider implements SmsProvider {
  readonly name = "mock";
  readonly sent: (SendRequest & { providerMessageId: string })[] = [];
  calls = 0;
  private counter = 0;

  constructor(public mode: ProviderMode = "accept", private delayMs = 0) {}

  async send(req: SendRequest): Promise<SendResult> {
    this.calls++;
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.mode === "reject") return { kind: "rejected", error: "Mock: provider rejected the request (e.g. invalid number)" };
    if (this.mode === "timeout") return { kind: "ambiguous", error: "Mock: request timed out — provider may or may not have accepted it" };
    this.counter++;
    const rand = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
    const providerMessageId = `SMmock${rand}${String(this.counter).padStart(4, "0")}`;
    this.sent.push({ ...req, providerMessageId });
    return { kind: "accepted", providerMessageId, status: "queued" };
  }
}
