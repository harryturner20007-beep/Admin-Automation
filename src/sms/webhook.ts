// Twilio webhook checks: the signature (official SDK) over the exact public URL Twilio called, and the account.
import twilio from "twilio";

/**
 * Parse a Twilio form post and say whether it's genuine. `publicUrl` must be the address configured in Twilio
 * (scheme, host, path and query exactly), not the internal one the request arrived on.
 */
export function verifyTwilio(publicUrl: string, rawBody: string, signature: string | null, env = process.env): { valid: boolean; params: Record<string, string> } {
  const params = Object.fromEntries(new URLSearchParams(rawBody));
  const token = env.TWILIO_AUTH_TOKEN;
  const valid = !!token && !!signature && twilio.validateRequest(token, signature, publicUrl, params) && params.AccountSid === env.TWILIO_ACCOUNT_SID;
  return { valid, params };
}

export const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
