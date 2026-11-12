import { NextResponse, type NextRequest } from "next/server";
import { receiveInbound } from "@/domain/engine";
import { EMPTY_TWIML, verifyTwilio } from "@/sms/webhook";
import { siteUrl, withWorkspace } from "@/server/store";
import { adminClient } from "@/server/supabase";

const XML = { "Content-Type": "text/xml" };

/**
 * Incoming text (the number's "A message comes in" webhook). The garage is the one our sms_numbers table
 * links to the receiving number. Replies go into the customer's history and Replies; nothing is auto-answered
 * (Twilio itself answers STOP/START on UK long codes).
 */
export async function POST(request: NextRequest) {
  const { valid, params } = verifyTwilio(`${siteUrl()}/api/sms/inbound`, await request.text(), request.headers.get("x-twilio-signature"));
  if (!valid) return new NextResponse("Forbidden", { status: 403 });
  const { MessageSid: sid, From: from, To: to } = params;
  if (!sid || !from || !to) return new NextResponse(EMPTY_TWIML, { headers: XML });

  const { data } = await adminClient().from("sms_numbers").select("garage_id").eq("phone_e164", to).maybeSingle();
  if (!data) {
    console.error("incoming text for an unconnected number", { to: to.slice(0, 6) });
    return new NextResponse(EMPTY_TWIML, { headers: XML });
  }
  // With Twilio Advanced Opt-Out the keyword may be custom; its OptOutType says what it meant.
  const body = params.OptOutType === "STOP" ? "STOP" : params.OptOutType === "START" ? "START" : (params.Body ?? "");
  try {
    await withWorkspace(data.garage_id, null, "incoming text", (d) => {
      d.garages[0].smsNumber = to; // matched on the trusted number above
      return receiveInbound(d, { eventId: sid, from, to, body });
    }, false);
  } catch (e) {
    console.error("incoming text not saved", { error: (e as Error).message });
    return new NextResponse("Retry", { status: 500 }); // Twilio then tries the number's fallback URL (this route again); the MessageSid dedupes it
  }
  return new NextResponse(EMPTY_TWIML, { headers: XML });
}
