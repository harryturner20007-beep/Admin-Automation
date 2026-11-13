"use server";
// Server actions for a garage's workspace. The garage always comes from the signed-in user's membership,
// never from the request, so a tampered request can only ever touch the caller's own garage.

import { issueDraftInvoice } from "@/domain/invoices";
import type { AppState, Invoice } from "@/domain/types";
import { checkTransition, migrateState } from "@/domain/workspace";
import { load, withWorkspace, write, type SaveResult } from "./store";
import { adminClient, currentMember, type Member } from "./supabase";

const MAX_DOC_BYTES = 8_000_000; // matches serverActions.bodySizeLimit in next.config.ts

export type Loaded = { doc: AppState; version: number; staff: string; role: Member["role"] };
export type { SaveResult };

export async function loadWorkspace(): Promise<Loaded | null> {
  const m = await currentMember();
  if (!m?.garageId) return null;
  return { ...(await load(m.garageId)), staff: m.displayName, role: m.role };
}

/** Save the browser's copy, if it is based on the latest saved version and passes the server's checks. */
export async function saveWorkspace(baseVersion: number, doc: AppState, op: string): Promise<SaveResult> {
  const m = await currentMember();
  if (!m?.garageId) return { kind: "signed_out" };
  if (!Number.isInteger(baseVersion) || typeof op !== "string") return { kind: "invalid", message: "Bad request" };
  if (JSON.stringify(doc).length > MAX_DOC_BYTES) return { kind: "invalid", message: "This garage's records are too large to save. Contact support." };
  let next: AppState;
  try {
    next = migrateState(doc);
  } catch {
    return { kind: "invalid", message: "Bad request" };
  }
  const prev = await load(m.garageId);
  if (prev.version !== baseVersion) return { kind: "conflict", ...prev };
  const problem = checkTransition(prev.doc, next, m.garageId, m.role);
  if (problem) return { kind: "invalid", message: problem };
  return write(m, m.garageId, baseVersion, next, op);
}

/**
 * Issue an invoice draft on the server: number, totals, link and the frozen copy are made here from the saved
 * record (never from the browser) and stored with the workspace in one transaction. Only then is the
 * customer's invoice text sent, so the link in it is always the one that was saved, even if the save had to
 * be retried after a clash with another change.
 */
export async function issueInvoice(invoiceId: string): Promise<SaveResult & { doc?: AppState }> {
  const m = await currentMember();
  if (!m?.garageId) return { kind: "signed_out" };
  try {
    let wasDraft = false;
    const issued = await withWorkspace(
      m.garageId,
      m,
      "issue invoice",
      (doc) => {
        wasDraft = doc.invoices.find((i) => i.id === invoiceId)?.status === "draft";
        return issueDraftInvoice(doc, invoiceId, m.displayName);
      },
      false,
      (inv) => (wasDraft ? inv : undefined), // already issued (a repeat or another tab): nothing new to store
    );
    // Send the invoice text now (Automatic invoice texts) through the garage's own number, inside opening hours.
    const sent = await withWorkspace(m.garageId, m, "send invoice text", () => undefined);
    return { kind: "saved", version: sent.version, doc: sent.doc };
  } catch (e) {
    return { kind: "invalid", message: (e as Error).message };
  }
}

/** Owner uploads a logo (PNG or JPEG, up to 300 KB) to the garage's private folder. */
export async function uploadLogo(form: FormData): Promise<{ path: string } | { error: string }> {
  const m = await currentMember();
  if (!m?.garageId || m.role !== "owner") return { error: "Only the garage owner can change the logo." };
  const file = form.get("logo");
  if (!(file instanceof File)) return { error: "Choose an image." };
  const type = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : null;
  if (!type) return { error: "Use a PNG or JPEG image." };
  if (file.size > 300_000) return { error: "Use an image under 300 KB." };
  const path = `${m.garageId}/logo-${Date.now()}.${type}`;
  const { error } = await adminClient().storage.from("garage-files").upload(path, file, { contentType: file.type });
  return error ? { error: "Couldn't upload the logo. Try again." } : { path };
}
