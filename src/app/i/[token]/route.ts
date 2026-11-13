import { NextResponse } from "next/server";
import type { Invoice } from "@/domain/types";
import { HOSTED } from "@/lib/mode";
import { issuedInvoicePdf } from "@/server/invoicePdf";
import { adminClient } from "@/server/supabase";

const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

/**
 * The link texted to a customer with their invoice. It opens that one invoice's PDF without a login:
 * the token is 128 random bits (unguessable) and identifies exactly one issued invoice. Unknown or malformed
 * tokens get the same plain 404, so nothing can be probed. The PDF is the frozen copy saved at issue.
 */
export async function GET(_: Request, ctx: RouteContext<"/i/[token]">) {
  const { token } = await ctx.params;
  if (!HOSTED) {
    return new NextResponse("This is a demo link. In the live product it opens the invoice as a PDF.", { headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
  }
  const notFound = () => new NextResponse("This invoice link isn't valid.", { status: 404, headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return notFound();
  const { data: row } = await adminClient().from("issued_invoices").select("garage_id, number, snapshot").eq("share_token", token).maybeSingle();
  if (!row) return notFound();
  const bytes = await issuedInvoicePdf(row.garage_id, row.snapshot as Invoice);
  return new NextResponse(Buffer.from(bytes), {
    headers: { ...HEADERS, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${String(row.number).replace(/[^\w-]/g, "")}.pdf"` },
  });
}
