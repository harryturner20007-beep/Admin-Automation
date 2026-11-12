import { NextResponse, type NextRequest } from "next/server";
import { applyDeliveryStatus } from "@/domain/engine";
import { twilioErrorText } from "@/sms/twilio";
import { verifyTwilio } from "@/sms/webhook";
import { siteUrl, withWorkspace } from "@/server/store";
import { adminClient } from "@/server/supabase";

/**
 * Twilio delivery-status callback (set per message as StatusCallback). The garage comes from our own send
 * ledger (by MessageSid), never from the request. Duplicates and out-of-order updates are ignored.
 */
export async function POST(request: NextRequest) {
  const { valid, params } = verifyTwilio(`${siteUrl()}/api/sms/status`, await request.text(), request.headers.get("x-twilio-signature"));
  if (!valid) return new NextResponse("Forbidden", { status: 403 });
  const sid = params.MessageSid;
  const status = params.MessageStatus;
  if (!sid || !status) return new NextResponse(null, { status: 204 });
  const error = params.ErrorCode ? twilioErrorText(params.ErrorCode) : null;

  const { data: garageId, error: dbError } = await adminClient().rpc("record_sms_status", { p_sid: sid, p_status: status, p_error: error });
  if (dbError) return new NextResponse("Retry", { status: 500 });
  if (!garageId) return new NextResponse(null, { status: 204 }); // not one of ours (or a test text): nothing to show
  // If the send's own save hasn't landed yet, the ledger already holds this status; the next save picks it up.
  await withWorkspace(garageId as string, null, "delivery status", (d) => applyDeliveryStatus(d, { eventId: `${sid}:${status}`, providerMessageId: sid, status, error: error ?? undefined }), false);
  return new NextResponse(null, { status: 204 });
}
