"use client";

// Phase 1 demo store: the whole engine runs in the browser over synthetic data,
// so the demo can be hosted as a static site and needs no accounts.
// Phase 2 replaces this with server actions over Supabase Postgres.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { applyDeliveryStatus, approveMessage, dispatchApproved, receiveInbound, type CheckReportItem, type InboundResult, type SendReportItem } from "@/domain/engine";
import { advanceDemoClock, runScheduledCheck, type RunReport } from "@/domain/automation";
import { addQuote, type QuoteInput } from "@/domain/intake";
import { applyFollowUpSettings, type ScheduleChange, type SettingsInput } from "@/domain/settings";
import type { AppState, ProviderMode, Quote } from "@/domain/types";
import { MockSmsProvider } from "@/sms/provider";
import { buildSeedState, DEMO_GARAGE_ID, DEMO_STAFF } from "./seed";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { Button } from "@/components/ui";

// Bump when AppState changes shape so old browser copies are rebuilt, not misread.
const STORAGE_KEY = "quote-followup-demo-v5";

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
  const sent = r.sends.filter((s) => s.outcome === "sent").map((s) => name(s.quoteId));
  const unclear = r.sends.filter((s) => s.outcome === "needs_reconciliation").length;
  const waiting = r.check.filter((c) => c.outcome === "drafted" && state.messages.find((m) => m.id === c.messageId)?.status === "awaiting_approval").map((c) => c.customerName);
  const parts: string[] = [];
  if (sent.length) parts.push(`Simulated sending: follow-up sent to ${sent.join(", ")}.`);
  if (waiting.length) parts.push(`${waiting.length === 1 ? `Follow-up drafted for ${waiting[0]}` : `${waiting.length} follow-ups drafted`}. Waiting for your approval.`);
  if (unclear) parts.push(`${unclear} send${unclear === 1 ? "" : "s"} timed out and need checking.`);
  if (parts.length) return parts.join(" ");
  return automated ? null : "Check finished. Nothing new was due.";
};

/** Every action throws on failure so the calling button can show the error next to itself. */
type DemoCtx = {
  state: AppState;
  garageId: string;
  staff: string;
  lastRun: LastRun | null;
  epoch: number; // increments on reset so screens drop their local UI state
  notice: Notice | null; // the one current confirmation message (saved, drafted, booked)
  notify: (text: string, quoteIds?: string[]) => void;
  dismissNotice: () => void;
  act: (fn: (s: AppState) => void) => void;
  runCheck: () => Promise<RunReport>;
  approveAndSend: (messageId: string) => Promise<SendReportItem[]>;
  simulateReply: (from: string, body: string) => InboundResult;
  advanceClock: (ms: number) => Promise<void>;
  addQuote: (input: QuoteInput) => Quote;
  saveSettings: (input: SettingsInput) => ScheduleChange[];
  setProviderMode: (m: ProviderMode) => void;
  reset: () => Promise<void>;
};

const Ctx = createContext<DemoCtx | null>(null);

export function useDemo(): DemoCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDemo outside DemoProvider");
  return c;
}

function load(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AppState) : null;
  } catch {
    return null; // unreadable copy: rebuild from the seed
  }
}

function save(s: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* demo still works without storage */
  }
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const ref = useRef<AppState | null>(null);

  const commit = useCallback((s: AppState) => {
    ref.current = s;
    setState(s);
    save(s);
  }, []);

  useEffect(() => {
    Promise.resolve(load() ?? buildSeedState())
      .then(commit)
      .catch((e: Error) => setLoadError(e.message));
  }, [commit]);

  // Actions only read the ref inside event handlers, never during render.
  const actions = useMemo(() => {
    const draft = () => structuredClone(ref.current!) as AppState;
    return {
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
        setNotice({ id: Date.now(), text: runText(s, { check, sends: r.sends }, false)!, quoteIds: [...drafted(check), ...r.sends.map((x) => x.quoteId)] });
        return r;
      },
      approveAndSend: async (messageId: string) => {
        const s = draft();
        approveMessage(s, messageId, DEMO_STAFF);
        const sends = await dispatchApproved(s, new MockSmsProvider(s.providerMode));
        // The mock provider reports delivery straight away. Twilio sends a status callback instead.
        for (const r of sends.filter((x) => x.outcome === "sent")) {
          const m = s.messages.find((x) => x.id === r.messageId)!;
          applyDeliveryStatus(s, { eventId: `${m.providerMessageId}:delivered`, providerMessageId: m.providerMessageId!, status: "delivered" });
        }
        commit(s);
        return sends;
      },
      simulateReply: (from: string, body: string) => {
        const s = draft();
        const garage = s.garages.find((g) => g.id === DEMO_GARAGE_ID)!;
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
        const changes = applyFollowUpSettings(s, DEMO_GARAGE_ID, input, DEMO_STAFF);
        commit(s);
        return changes;
      },
      addQuote: (input: QuoteInput) => {
        const s = draft();
        const q = addQuote(s, DEMO_GARAGE_ID, input, DEMO_STAFF);
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
  }, [commit]);

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
  const value: DemoCtx = { ...actions, state, lastRun, epoch, notice, garageId: DEMO_GARAGE_ID, staff: DEMO_STAFF };
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
