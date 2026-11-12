import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runFollowUpCheck } from "@/domain/engine";
import { runInvoiceCheck } from "@/domain/invoices";
import { withWorkspace } from "@/server/store";
import { adminClient } from "@/server/supabase";

/**
 * Background follow-up and invoice-reminder run (Vercel Cron, see vercel.json). Runs with the browser
 * closed. For each garage: drafts (or, in Automatic mode, queues) whatever is due, rechecking every rule
 * at that moment. Safe to repeat or overlap: drafts are unique per send key, and each garage is saved
 * with a version check, so a run that collides with a user's save is dropped and picked up next time.
 *
 * Then it sends what is approved and due through the garage's own number (Twilio), rechecking every rule
 * immediately before each send. Without a connected number texts stay queued; nothing is marked sent that wasn't.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const { data: rows, error } = await adminClient().from("workspaces").select("garage_id");
  if (error) return NextResponse.json({ error: "Couldn't load workspaces" }, { status: 500 });

  const summary = { garages: 0, drafted: 0, sent: 0, failed: 0, unknown: 0, errors: 0 };
  for (const { garage_id } of rows ?? []) {
    summary.garages++;
    try {
      const { result, sends } = await withWorkspace(garage_id, null, "scheduled check", (doc) => [...runFollowUpCheck(doc, [garage_id]), ...runInvoiceCheck(doc, [garage_id])]);
      summary.drafted += result.filter((r) => r.outcome === "drafted").length;
      summary.sent += sends.filter((s) => s.outcome === "sent").length;
      summary.failed += sends.filter((s) => s.outcome === "failed").length;
      summary.unknown += sends.filter((s) => s.outcome === "needs_reconciliation").length;
    } catch (e) {
      summary.errors++;
      console.error("scheduled check failed", { garageId: garage_id, error: (e as Error).message });
    }
  }
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}
