// Twilio Programmable Messaging through the official SDK. Server only: needs the account's auth token.
import twilio from "twilio";
import type { SendRequest, SendResult, SmsProvider } from "./provider";

type TwilioClient = ReturnType<typeof twilio>;

/** Twilio error codes → what staff should know. Anything unlisted keeps Twilio's own message. */
const ERRORS: Record<number, string> = {
  21211: "The customer's number isn't valid",
  21614: "The customer's number can't receive texts (not a mobile)",
  21610: "The customer has opted out (replied STOP) at Twilio",
  21606: "The garage's sending number isn't able to send SMS from this Twilio account",
  21659: "The garage's sending number isn't able to send SMS from this Twilio account",
  21612: "Twilio can't route a text between these two numbers",
  21408: "Texts to this country aren't switched on in Twilio (Messaging geo permissions)",
  21608: "The Twilio account is a trial: it can only text verified numbers",
  20003: "Twilio rejected the account credentials",
  20005: "The Twilio account isn't active (suspended or out of credit)",
  20429: "Twilio is limiting requests; it will be tried again at the next check",
  30001: "Twilio's queue for this number is full",
  30003: "The customer's phone is switched off or unreachable",
  30005: "The customer's number doesn't exist or is no longer in use",
  30006: "The customer's number is a landline or can't receive texts",
  30007: "The mobile network filtered the message",
  30008: "The network couldn't deliver it (unknown reason)",
};

export const twilioErrorText = (code?: number | string | null, fallback?: string) => {
  const n = Number(code);
  if (ERRORS[n]) return ERRORS[n];
  if (fallback && /balance|fund|credit/i.test(fallback)) return "The Twilio account is out of credit";
  return fallback ? `Twilio: ${fallback}` : code ? `Twilio error ${code}` : "The network couldn't deliver it";
};

export class TwilioProvider implements SmsProvider {
  readonly name = "twilio";
  constructor(
    private client: TwilioClient,
    private statusCallback: string,
  ) {}

  static fromEnv(statusCallback: string): TwilioProvider {
    // No SDK auto-retry: a retried create after a timeout could send twice. Uncertain results go to reconciliation.
    return new TwilioProvider(twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!, { timeout: 15_000, autoRetry: false }), statusCallback);
  }

  async send(req: SendRequest): Promise<SendResult> {
    try {
      const m = await this.client.messages.create({ to: req.to, from: req.from, body: req.body, statusCallback: this.statusCallback });
      return { kind: "accepted", providerMessageId: m.sid, status: m.status };
    } catch (e) {
      const err = e as { status?: number; code?: number; message?: string };
      // A 4xx from Twilio means it definitely did not take the message. No status (timeout, network) or a
      // 5xx means it might have: never resend blindly.
      if (err.status && err.status < 500 && err.code !== 20429) return { kind: "rejected", error: twilioErrorText(err.code, err.message) };
      return { kind: "ambiguous", error: err.status ? `Twilio error ${err.status}; it may or may not have sent` : "No answer from Twilio in time; it may or may not have sent" };
    }
  }

  /** Look for a message Twilio actually accepted, to settle a "Delivery unknown" send. */
  async findSent(from: string, to: string, body: string, since: Date): Promise<{ sid: string; status: string } | null> {
    const list = await this.client.messages.list({ from, to, dateSentAfter: new Date(since.getTime() - 60_000), limit: 20 });
    const hit = list.find((m) => m.body === body);
    return hit ? { sid: hit.sid, status: hit.status } : null;
  }
}
