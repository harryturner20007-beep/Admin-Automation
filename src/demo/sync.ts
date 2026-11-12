// Browser side of saving a hosted workspace. Each change is applied at once on screen and queued; the queue
// saves in order against the last version the server confirmed. If another device saved first, the server
// returns its copy and the queued changes are replayed on top, so changes are neither lost nor doubled
// (booking, completing and issuing return the existing record when replayed).
import type { AppState } from "@/domain/types";
import type { SaveResult } from "@/server/workspace";

export type Op = { fn: (s: AppState) => void; at: string };
export type SyncStatus = { state: "saved" | "saving" | "retrying" | "signed_out"; message?: string };

const clone = (s: AppState) => structuredClone(s);

export class SyncQueue {
  private pending: Op[] = [];
  private running: Promise<void> | null = null;

  constructor(
    private confirmed: { doc: AppState; version: number },
    private save: (version: number, doc: AppState, op: string) => Promise<SaveResult>,
    private onChange: (doc: AppState, status: SyncStatus) => void,
    private onDropped: (message: string) => void,
    private retryMs = 3000,
  ) {}

  /** Replay queued changes on a copy of `base`. A change that no longer applies (say, the other device
   *  already marked the invoice paid) is dropped and reported. */
  private replay(base: AppState): { doc: AppState; kept: Op[] } {
    const doc = clone(base);
    const kept: Op[] = [];
    for (const op of this.pending) {
      const before = clone(doc);
      try {
        doc.now = op.at;
        op.fn(doc);
        kept.push(op);
      } catch (e) {
        Object.assign(doc, before);
        this.onDropped(`A change couldn't be saved: ${(e as Error).message}`);
      }
    }
    return { doc, kept };
  }

  /** What the screen shows: the last confirmed copy plus queued changes. */
  view(): AppState {
    return this.replay(this.confirmed.doc).doc;
  }

  get version() {
    return this.confirmed.version;
  }

  /** Apply a change now (throws, changing nothing, if it isn't allowed) and queue it for saving. */
  push(fn: (s: AppState) => void): AppState {
    const at = new Date().toISOString();
    const doc = this.view();
    doc.now = at;
    fn(doc); // validation errors surface here, before anything is queued
    this.pending.push({ fn, at });
    void this.flush();
    return doc;
  }

  /** Replace the confirmed copy (after a server-side action such as issuing an invoice). */
  reset(doc: AppState, version: number) {
    this.confirmed = { doc, version };
    this.onChange(this.view(), { state: this.pending.length ? "saving" : "saved" });
  }

  /** Resolves when everything queued so far is saved (or can't be). */
  flush(): Promise<void> {
    this.running ??= this.loop().finally(() => (this.running = null));
    return this.running;
  }

  private async loop() {
    let failures = 0;
    while (this.pending.length) {
      const { doc, kept } = this.replay(this.confirmed.doc);
      this.pending = kept; // changes pushed while saving are appended after these
      if (!kept.length) break;
      this.onChange(this.view(), { state: "saving" });
      let r: SaveResult;
      try {
        r = await this.save(this.confirmed.version, doc, `${kept.length} change${kept.length === 1 ? "" : "s"}`);
      } catch {
        failures++;
        this.onChange(this.view(), { state: "retrying", message: "Couldn't reach the server. Your changes are kept and will be retried." });
        if (failures >= 5) return;
        await new Promise((res) => setTimeout(res, this.retryMs * failures));
        continue;
      }
      failures = 0;
      if (r.kind === "saved") {
        this.confirmed = { doc, version: r.version };
        this.pending = this.pending.slice(kept.length);
      } else if (r.kind === "conflict") {
        this.confirmed = { doc: r.doc, version: r.version }; // replay on top of the newer copy
      } else if (r.kind === "invalid") {
        this.pending = this.pending.slice(kept.length);
        this.onDropped(`Not saved: ${r.message}`);
      } else {
        this.onChange(this.view(), { state: "signed_out", message: "You've been signed out. Sign in again to save your changes." });
        return;
      }
    }
    this.onChange(this.view(), { state: "saved" });
  }
}
