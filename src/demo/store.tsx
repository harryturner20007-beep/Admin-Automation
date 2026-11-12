"use client";

// The app's data store. Two backends behind one interface:
//  - demo:   the whole engine runs in the browser over synthetic data kept in localStorage (no accounts);
//  - hosted: a garage's own records, loaded from the server; every change is applied on screen at once and
//            saved through the save queue (src/demo/sync.ts) to the server, which checks and stores it.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { applyDeliveryStatus, approveMessage, dispatchApproved, log, receiveInbound, runFollowUpCheck, type CheckReportItem, type InboundResult, type SendReportItem } from "@/domain/engine";
import { advanceDemoClock, runScheduledCheck, type RunReport } from "@/domain/automation";
import { issueDraftInvoice, runInvoiceCheck } from "@/domain/invoices";
import { migrateState } from "@/domain/workspace";
import { issueInvoice as issueOnServer, saveWorkspace, type Loaded } from "@/server/workspace";
import { SyncQueue, type SyncStatus } from "./sync";
import { GATE_REASON_TEXT } from "@/domain/gate";
import { deliveryLabel, prepareManualSend, type ManualTarget } from "@/domain/sms";
import { approveAndSendText as approveOnServer, sendText as sendOnServer } from "@/server/sms";
import { addQuote, type QuoteInput } from "@/domain/intake";
import { applyFollowUpSettings, type ScheduleChange, type SettingsInput } from "@/domain/settings";
import type { AppState, ProviderMode, Quote } from "@/domain/types";
import { MockSmsProvider } from "@/sms/provider";
import { buildSeedState, DEMO_STAFF } from "./seed";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { Button } from "@/components/ui";

// Bump when AppState changes shape so old browser copies are rebuilt, not misread.
const STORAGE_KEY = "quote-followup-demo-v9";

export type LastRun = {
  at: string;
  automated: boolean; // true when the simulated scheduler ran it after a clock move
  check: CheckReportItem[];
  sends: SendReportItem[];
};

export type Notice = { id: number; text: string; quoteIds: string[] }; // quoteIds: rows to highlight

const drafted = (check: CheckReportItem[]) => check.filter((c) => c.outcome === "drafted").map((c) => c.quoteId);

/** One sentence for the toast: what the run sent, drafted or held back. */
const runText = (state: AppState, r: RunReport, automated: boolean): string | null => {
  const name = (id: string) => state.quotes.find((q) => q.id === id)?.customerName ?? "a customer";
  const isInvoice = (id: string) => !!state.messages.find((m) => m.id === id)?.invoiceId;
  const sentOk = r.sends.filter((s) => s.outcome === "sent");
  const sent = sentOk.filter((s) => !isInvoice(s.messageId)).map((s) => name(s.quoteId));
  const invoiceSent = sentOk.filter((s) => isInvoice(s.messageId)).map((s) => name(s.quoteId));
  const invoiceWaiting = r.invoices.filter((c) => c.outcome === "drafted" && state.messages.find((m) => m.id === c.messageId)?.status === "awaiting_approval").map((c) => c.customerName);
  const unclear = r.sends.filter((s) => s.outcome === "needs_reconciliation").length;
  const waiting = r.check.filter((c) => c.outcome === "drafted" && state.messages.find((m) => m.id === c.messageId)?.status === "awaiting_approval").map((c) => c.customerName);
  const parts: string[] = [];
  if (sent.length) parts.push(`Simulated sending: follow-up sent to ${sent.join(", ")}.`);
  if (waiting.length) parts.push(`${waiting.length === 1 ? `Follow-up drafted for ${waiting[0]}` : `${waiting.length} follow-ups drafted`}. Waiting for your approval.`);
  if (invoiceSent.length) parts.push(`Simulated sending: invoice or payment reminder sent to ${invoiceSent.join(", ")}.`);
  if (invoiceWaiting.length) parts.push(`${invoiceWaiting.length === 1 ? `Invoice text drafted for ${invoiceWaiting[0]}` : `${invoiceWaiting.length} invoice texts drafted`}. Waiting for your approval on Invoices.`);
  if (unclear) parts.push(`${unclear} send${unclear === 1 ? "" : "s"} timed out and need checking.`);
  if (parts.length) return parts.join(" ");
  return automated ? null : "Check finished. Nothing new was due.";
};

/** Every action throws on failure so the calling button can show the error next to itself. */
type DemoCtx = {
  hosted: boolean; // a real garage's records (no demo clock, no simulated replies, texts not sent from here)
  role: "owner" | "staff";
  sync: SyncStatus;
  /** Issue an invoice draft: number, totals and the frozen copy are made on the server when hosted. */
  issueInvoice: (invoiceId: string) => Promise<void>;
  state: AppState;
  garageId: string;
  staff: string;
  lastRun: LastRun | null;
  epoch: number; // increments on reset so screens drop their local UI state
  notice: Notice | null; // the one current confirmation message (saved, drafted, booked)
  notify: (text: string, quoteIds?: string[]) => void;
  dismissNotice: () => void;
  act: (fn: (s: AppState) => void) => void;
  /** Like act, but remembers the previous state so `undo` can restore it. */
  actUndoable: (fn: (s: AppState) => void) => void;
  /** Restores the state before the last undoable action, only if nothing else changed since. */
  undo: () => void;
  runCheck: () => Promise<RunReport>;
  /** Approve a waiting text and send it now. Resolves with its status in staff words; throws if it can't go. */
  approveAndSend: (messageId: string) => Promise<TextOutcome>;
  /** "Send follow-up": a staff-written text for a quote or invoice, sent from the garage's number. */
  sendText: (target: ManualTarget, body: string, requestKey: string) => Promise<TextOutcome>;
  simulateReply: (from: string, body: string) => InboundResult;
  advanceClock: (ms: number) => Promise<void>;
  addQuote: (input: QuoteInput) => Quote;
  saveSettings: (input: SettingsInput) => ScheduleChange[];
  setProviderMode: (m: ProviderMode) => void;
  reset: () => Promise<void>;
};

export type TextOutcome = { status: string; detail?: string };

const Ctx = createContext<DemoCtx | null>(null);

/** Demo: send through the simulated provider (it "delivers" at once; real texts wait for the network's receipt). */
async function demoDispatch(s: AppState, messageId: string): Promise<TextOutcome> {
  const sends = await dispatchApproved(s, new MockSmsProvider(s.providerMode));
  for (const r of sends.filter((x) => x.outcome === "sent")) {
    const m = s.messages.find((x) => x.id === r.messageId)!;
    applyDeliveryStatus(s, { eventId: `${m.providerMessageId}:delivered`, providerMessageId: m.providerMessageId!, status: "delivered" });
  }
  const m = s.messages.find((x) => x.id === messageId)!;
  const why = sends.find((x) => x.messageId === messageId)?.reasons;
  return { status: deliveryLabel(m).label, detail: m.deliveryError ?? (why?.length ? why.map((r) => GATE_REASON_TEXT[r]).join(", ") : undefined) };
}

export function useDemo(): DemoCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDemo outside DemoProvider");
  return c;
}

function load(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? migrateState(JSON.parse(raw)) : null;
  } catch {
    return null; // unreadable copy: rebuild from the seed
  }
}

const COLLECTIONS = ["quotes", "jobs", "invoices", "messages", "tasks"] as const;

/**
 * Undo by putting back each record the last change touched, unless it has changed again since. History is
 * append-only, so the undo itself is recorded rather than the original entry removed.
 */
function revertChange(s: AppState, before: AppState, after: AppState, staff: string) {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const k of COLLECTIONS) {
    const was = new Map<string, unknown>(before[k].map((x) => [x.id, x]));
    const then = new Map<string, unknown>(after[k].map((x) => [x.id, x]));
    const list = (s[k] as { id: string }[]).flatMap((x) => {
      if (!same(x, then.get(x.id)) || same(x, was.get(x.id))) return [x]; // not touched by that change, or changed again since
      const old = was.get(x.id);
      if (old) return [structuredClone(old) as { id: string }];
      return k === "messages" || k === "tasks" ? [] : [x]; // drafts it created go; saved records stay
    });
    (s as Record<string, unknown>)[k] = list;
  }
  log(s, s.garages[0].id, "undo", `${staff} undid their last change`);
}

function save(s: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* demo still works without storage */
  }
}

const notHere = () => {
  throw new Error("Only available in the demo");
};

export function DemoProvider({ children, hosted }: { children: ReactNode; hosted?: Loaded }) {
  const [state, setState] = useState<AppState | null>(hosted?.doc ?? null);
  const [sync, setSync] = useState<SyncStatus>({ state: "saved" });
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const ref = useRef<AppState | null>(null);
  const undoRef = useRef<{ before: AppState; after: AppState } | null>(null);

  const commit = useCallback((s: AppState) => {
    ref.current = s;
    setState(s);
    save(s);
  }, []);

  const staff = hosted?.staff ?? DEMO_STAFF;
  const isHosted = !!hosted;
  const queueRef = useRef<SyncQueue | null>(null);

  useEffect(() => {
    if (hosted) {
      // Hosted: the save queue starts from the copy the server loaded for this visit.
      queueRef.current = new SyncQueue(
        { doc: hosted.doc, version: hosted.version },
        saveWorkspace,
        (doc, status) => {
          ref.current = doc;
          setState(doc);
          setSync(status);
        },
        (text) => setNotice({ id: Date.now(), text, quoteIds: [] }),
      );
      ref.current = hosted.doc;
      return;
    }
    Promise.resolve(load() ?? buildSeedState())
      .then(commit)
      .catch((e: Error) => setLoadError(e.message));
  }, [commit, hosted]);

  // Warn before closing the tab while changes are still being saved.
  useEffect(() => {
    if (sync.state === "saved") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [sync.state]);

  // Actions only read the ref inside event handlers, never during render.
  const actions = useMemo(() => {
    const draft = () => structuredClone(ref.current!) as AppState;
    /** Apply a change: saved locally in the demo, queued for the server when hosted. Returns fn's result. */
    const apply = <T,>(fn: (s: AppState) => T): T => {
      let out!: T;
      const queue = queueRef.current;
      if (queue) {
        ref.current = queue.push((s) => {
          out = fn(s);
        });
        setState(ref.current);
        setSync({ state: "saving" });
      } else {
        const s = draft();
        out = fn(s);
        commit(s);
      }
      return out;
    };
    if (isHosted)
      return {
        actUndoable: (fn: (s: AppState) => void) => {
          const before = ref.current!;
          apply(fn);
          undoRef.current = { before, after: ref.current! };
        },
        undo: () => {
          const u = undoRef.current;
          if (!u) throw new Error("Nothing to undo");
          apply((s) => revertChange(s, u.before, u.after, staff));
          undoRef.current = null;
        },
        act: (fn: (s: AppState) => void) => apply(fn),
        runCheck: async () => {
          const r = apply((s) => ({ check: runFollowUpCheck(s).filter((c) => c.outcome !== "already_handled"), invoices: runInvoiceCheck(s), sends: [] as SendReportItem[] }));
          setLastRun({ at: ref.current!.now, automated: false, check: r.check, sends: [] });
          setNotice({ id: Date.now(), text: runText(ref.current!, r, false)!, quoteIds: drafted(r.check) });
          return r;
        },
        approveAndSend: async (messageId: string) => {
          const queue = queueRef.current!;
          await queue.flush();
          const r = await approveOnServer(messageId);
          if (!r.ok) throw new Error(r.error);
          queue.reset(r.doc, r.version);
          return { status: r.status, detail: r.detail };
        },
        sendText: async (target: ManualTarget, body: string, requestKey: string) => {
          const queue = queueRef.current!;
          await queue.flush(); // the server sends from the saved record, so save edits first
          const r = await sendOnServer(target, body, requestKey);
          if (!r.ok) throw new Error(r.error);
          queue.reset(r.doc, r.version);
          return { status: r.status, detail: r.detail };
        },
        issueInvoice: async (invoiceId: string) => {
          const queue = queueRef.current!;
          await queue.flush(); // the server issues from the saved draft, so save edits first
          const r = await issueOnServer(invoiceId);
          if (r.kind === "signed_out") throw new Error("You've been signed out. Sign in again.");
          if (r.kind === "invalid") throw new Error(r.message);
          if (r.kind === "saved" && r.doc) queue.reset(r.doc, r.version);
        },
        addQuote: (input: QuoteInput) => apply((s) => addQuote(s, s.garages[0].id, input, staff)),
        saveSettings: (input: SettingsInput) => apply((s) => applyFollowUpSettings(s, s.garages[0].id, input, staff)),
        notify: (text: string, quoteIds: string[] = []) => setNotice({ id: Date.now(), text, quoteIds }),
        dismissNotice: () => setNotice(null),
        simulateReply: notHere as DemoCtx["simulateReply"],
        advanceClock: notHere as DemoCtx["advanceClock"],
        setProviderMode: notHere as DemoCtx["setProviderMode"],
        reset: notHere as DemoCtx["reset"],
      };
    return {
      issueInvoice: async (invoiceId: string) => {
        apply((s) => issueDraftInvoice(s, invoiceId, staff));
      },
      actUndoable: (fn: (s: AppState) => void) => {
        const before = ref.current!;
        const s = draft();
        fn(s);
        commit(s);
        undoRef.current = { before, after: s };
      },
      undo: () => {
        const u = undoRef.current;
        if (!u || ref.current !== u.after) throw new Error("something else changed since, so this can't be undone");
        commit(u.before);
        undoRef.current = null;
      },
      act: (fn: (s: AppState) => void) => {
        const s = draft();
        fn(s);
        commit(s);
      },
      runCheck: async () => {
        const s = draft();
        const r = await runScheduledCheck(s, new MockSmsProvider(s.providerMode));
        const check = r.check.filter((c) => c.outcome !== "already_handled");
        commit(s);
        setLastRun({ at: s.now, automated: false, check, sends: r.sends });
        setNotice({ id: Date.now(), text: runText(s, { check, invoices: r.invoices, sends: r.sends }, false)!, quoteIds: [...drafted(check), ...r.sends.map((x) => x.quoteId)] });
        return r;
      },
      approveAndSend: async (messageId: string) => {
        const s = draft();
        approveMessage(s, messageId, DEMO_STAFF);
        const out = await demoDispatch(s, messageId);
        commit(s);
        return out;
      },
      sendText: async (target: ManualTarget, body: string, requestKey: string) => {
        const s = draft();
        const m = prepareManualSend(s, target, body, requestKey, DEMO_STAFF);
        const out = await demoDispatch(s, m.id);
        commit(s);
        return out;
      },
      simulateReply: (from: string, body: string) => {
        const s = draft();
        const garage = s.garages[0];
        const inbound = receiveInbound(s, { eventId: `SMin_demo_${s.seq + 1}_${Date.now()}`, from, to: garage.smsNumber, body });
        commit(s);
        return inbound;
      },
      advanceClock: async (ms: number) => {
        const s = draft();
        const r = await advanceDemoClock(s, ms, new MockSmsProvider(s.providerMode));
        commit(s);
        if (r) {
          setLastRun({ at: s.now, automated: true, check: r.check, sends: r.sends });
          const text = runText(s, r, true);
          if (text) setNotice({ id: Date.now(), text, quoteIds: [...drafted(r.check), ...r.sends.map((x) => x.quoteId)] });
        }
      },
      saveSettings: (input: SettingsInput) => {
        const s = draft();
        const changes = applyFollowUpSettings(s, s.garages[0].id, input, DEMO_STAFF);
        commit(s);
        return changes;
      },
      addQuote: (input: QuoteInput) => {
        const s = draft();
        const q = addQuote(s, s.garages[0].id, input, DEMO_STAFF);
        commit(s); // only reached when valid; a failed save leaves state (and the form) untouched
        return q;
      },
      setProviderMode: (m: ProviderMode) => {
        const s = draft();
        s.providerMode = m;
        commit(s);
      },
      notify: (text: string, quoteIds: string[] = []) => setNotice({ id: Date.now(), text, quoteIds }),
      dismissNotice: () => setNotice(null),
      reset: async () => {
        commit(await buildSeedState());
        setLastRun(null);
        setNotice(null);
        setLoadError(null);
        setEpoch((e) => e + 1);
      },
    };
  }, [commit, isHosted, staff]);

  if (loadError) {
    return (
      <div role="alert" className="mx-auto mt-16 max-w-md rounded-lg border border-red-200 bg-white p-6 text-sm">
        <h1 className="font-semibold text-slate-900">The demo data couldn&apos;t be loaded</h1>
        <p className="mt-1 text-slate-600">{loadError}</p>
        <Button className="mt-4" variant="primary" onClick={() => actions.reset().catch((e: Error) => setLoadError(e.message))}>
          Rebuild demo data
        </Button>
      </div>
    );
  }
  if (!state) return <LoadingSkeleton />;
  const value: DemoCtx = { ...actions, hosted: !!hosted, role: hosted?.role ?? "owner", sync, state, lastRun, epoch, notice, garageId: state.garages[0].id, staff };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export type Feedback = { ok: boolean; text: string } | null;

/**
 * One saving/feedback slot per control. Ignores clicks while a save is in flight
 * (a ref, so a fast double-click in the same tick is also caught).
 */
export function useAction() {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const run = useCallback(async (fn: () => unknown, success: string | ((r: unknown) => string)) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFeedback(null);
    try {
      const r = await fn();
      setFeedback({ ok: true, text: typeof success === "function" ? success(r) : success });
    } catch (e) {
      setFeedback({ ok: false, text: (e as Error).message });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, []);
  return { run, pending, feedback, setFeedback };
}
