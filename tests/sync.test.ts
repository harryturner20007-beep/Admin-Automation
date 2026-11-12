// Two devices saving the same garage through the save queue, against a fake server that behaves like
// saveWorkspace (version check + server-side transition check).
import { beforeEach, describe, expect, it } from "vitest";
import { markInvoicePaid } from "@/domain/invoices";
import { bookJob } from "@/domain/jobs";
import type { AppState } from "@/domain/types";
import { checkTransition } from "@/domain/workspace";
import { buildSeedState, DEMO_GARAGE_ID, DEMO_STAFF } from "@/demo/seed";
import { SyncQueue } from "@/demo/sync";
import type { SaveResult } from "@/server/workspace";

let server: { doc: AppState; version: number; saves: number; down: boolean };
const booking = { startAt: "2026-11-12T09:00:00.000Z", notes: "", customerConfirmation: "Accepted by phone" };

async function save(version: number, doc: AppState): Promise<SaveResult> {
  await Promise.resolve(); // a real network hop: lets the other device run in between
  if (server.down) throw new Error("offline");
  if (version !== server.version) return { kind: "conflict", doc: structuredClone(server.doc), version: server.version };
  const problem = checkTransition(server.doc, doc, DEMO_GARAGE_ID);
  if (problem) return { kind: "invalid", message: problem };
  server = { ...server, doc: structuredClone(doc), version: version + 1, saves: server.saves + 1 };
  return { kind: "saved", version: server.version };
}

const device = (dropped: string[] = []) => new SyncQueue({ doc: structuredClone(server.doc), version: server.version }, save, () => {}, (m) => dropped.push(m), 1);

beforeEach(async () => {
  server = { doc: await buildSeedState(), version: 1, saves: 0, down: false };
});

describe("saving from several devices", () => {
  it("two devices booking the same quote at once make one job", async () => {
    const a = device();
    const b = device();
    a.push((s) => bookJob(s, "q_ava", booking, DEMO_STAFF));
    b.push((s) => bookJob(s, "q_ava", { ...booking, notes: "from the other desk" }, DEMO_STAFF));
    await Promise.all([a.flush(), b.flush()]);
    expect(server.doc.jobs.filter((j) => j.quoteId === "q_ava")).toHaveLength(1);
    expect(server.doc.events.filter((e) => e.kind === "job_booked" && e.quoteId === "q_ava")).toHaveLength(1);
  });

  it("a double-click queues twice but saves one job", async () => {
    const a = device();
    a.push((s) => bookJob(s, "q_ava", booking, DEMO_STAFF));
    a.push((s) => bookJob(s, "q_ava", booking, DEMO_STAFF));
    await a.flush();
    expect(server.doc.jobs.filter((j) => j.quoteId === "q_ava")).toHaveLength(1);
  });

  it("changes made on different devices are both kept", async () => {
    const a = device();
    const b = device();
    a.push((s) => bookJob(s, "q_ava", booking, DEMO_STAFF));
    b.push((s) => markInvoicePaid(s, s.invoices.find((i) => i.status === "unpaid")!.id, DEMO_STAFF));
    await Promise.all([a.flush(), b.flush()]);
    expect(server.doc.jobs.some((j) => j.quoteId === "q_ava")).toBe(true);
    expect(server.doc.invoices.filter((i) => i.status === "paid")).toHaveLength(3);
  });

  it("a change that no longer applies after the other device's save is dropped and reported", async () => {
    const dropped: string[] = [];
    const a = device();
    const b = device(dropped);
    const inv = server.doc.invoices.find((i) => i.status === "unpaid")!.id;
    a.push((s) => markInvoicePaid(s, inv, DEMO_STAFF));
    await a.flush();
    b.push((s) => markInvoicePaid(s, inv, DEMO_STAFF)); // b hasn't seen a's save yet
    await b.flush();
    expect(dropped[0]).toMatch(/already marked paid/);
    expect(server.doc.events.filter((e) => e.kind === "invoice_paid")).toHaveLength(server.doc.invoices.filter((i) => i.status === "paid").length);
  });

  it("keeps changes while offline and saves them once the server is back", async () => {
    const a = device();
    server.down = true;
    a.push((s) => bookJob(s, "q_ava", booking, DEMO_STAFF));
    const done = a.flush();
    await new Promise((r) => setTimeout(r, 3));
    server.down = false;
    await done;
    expect(server.doc.jobs.some((j) => j.quoteId === "q_ava")).toBe(true);
    expect(a.view().jobs.filter((j) => j.quoteId === "q_ava")).toHaveLength(1);
  });

  it("a change the domain rejects throws at once and nothing is queued", () => {
    const a = device();
    expect(() => a.push((s) => bookJob(s, "q_ava", { ...booking, customerConfirmation: "" }, DEMO_STAFF))).toThrow(/accepted/);
    expect(server.saves).toBe(0);
  });
});
