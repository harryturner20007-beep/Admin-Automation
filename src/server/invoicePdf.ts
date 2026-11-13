// Builds the PDF of an issued invoice from the copy frozen at issue. Server only.
import type { Invoice } from "@/domain/types";
import { buildInvoicePdf } from "@/lib/invoicePdf";
import { adminClient } from "./supabase";

/**
 * Reads with the server key, so the caller must already have authorised this garage and invoice (a signed-in
 * member's row-level-security read, or a valid invoice link). The printed content is always the frozen copy;
 * only a cancellation stamp comes from the live record.
 */
export async function issuedInvoicePdf(garageId: string, snapshot: Invoice): Promise<Uint8Array> {
  const admin = adminClient();
  const { data: ws } = await admin.from("workspaces").select("doc->invoices").eq("garage_id", garageId).single();
  const live = ((ws as { invoices?: Invoice[] } | null)?.invoices ?? []).find((i) => i.id === snapshot.id);
  let logo: { bytes: Uint8Array; type: "png" | "jpg" } | undefined;
  const logoPath = snapshot.content?.seller.logoPath;
  if (logoPath?.startsWith(`${garageId}/`)) {
    const { data } = await admin.storage.from("garage-files").download(logoPath);
    if (data) logo = { bytes: new Uint8Array(await data.arrayBuffer()), type: data.type === "image/png" ? "png" : "jpg" };
  }
  return buildInvoicePdf({ number: snapshot.number, issuedAt: snapshot.issuedAt, dueDate: snapshot.dueDate, status: live?.status === "cancelled" ? "cancelled" : "unpaid", content: snapshot.content!, totals: snapshot.totals!, logo });
}
