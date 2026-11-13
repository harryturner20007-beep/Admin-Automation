import { NextResponse } from "next/server";
import type { Invoice } from "@/domain/types";
import { issuedInvoicePdf } from "@/server/invoicePdf";
import { adminClient, currentMember, userClient } from "@/server/supabase";

const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * Download an issued invoice as PDF. The invoice is read with the signed-in user's session, so row-level
 * security decides access: another garage's invoice id simply isn't found. The PDF is built from the
 * frozen copy saved at issue, stored privately under the garage's folder (overwritten on retry, never a
 * second invoice), and sent with no-store headers.
 */
export async function GET(_: Request, ctx: RouteContext<"/api/invoices/[id]/pdf">) {
  const { id } = await ctx.params;
  const m = await currentMember();
  if (!m?.garageId) return NextResponse.json({ error: "Sign in again" }, { status: 401, headers: PRIVATE });
  // Members read under row-level security. A platform admin viewing a garage isn't a member, so their read
  // uses the server key, still limited to the garage the session resolved to.
  const supabase = m.adminView ? adminClient() : await userClient();
  const { data: row } = await supabase.from("issued_invoices").select("garage_id, id, number, snapshot, pdf_path").eq("id", id).eq("garage_id", m.garageId).maybeSingle();
  if (!row) return NextResponse.json({ error: "Invoice not found" }, { status: 404, headers: PRIVATE });

  const admin = adminClient();
  const bytes = await issuedInvoicePdf(m.garageId, row.snapshot as Invoice);

  const path = `${m.garageId}/invoices/${row.id}.pdf`;
  const { error } = await admin.storage.from("garage-files").upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (!error && row.pdf_path !== path) await admin.from("issued_invoices").update({ pdf_path: path }).eq("garage_id", m.garageId).eq("id", row.id);

  return new NextResponse(Buffer.from(bytes), {
    headers: { ...PRIVATE, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${row.number.replace(/[^\w-]/g, "")}.pdf"` },
  });
}
