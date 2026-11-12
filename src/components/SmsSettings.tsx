"use client";

import { useEffect, useState } from "react";
import { INVOICE_MODE_LABEL } from "@/domain/invoices";
import { INVOICE_REMINDER_DAYS } from "@/domain/schedule";
import { smsSegments } from "@/domain/sms";
import { formatLondon } from "@/domain/time";
import type { Weekday } from "@/domain/types";
import { sendTestText, smsStatus, type SmsStatus } from "@/server/sms";
import { useAction, useDemo } from "@/demo/store";
import { Button, Field, InlineFeedback, inputClass, StatusLabel } from "./ui";

const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MODE = { off: "Off", draft: "Drafted for approval", automatic: "Automatic" } as const;

/** The garage's texting set-up at a glance: number, whether it's live, what sends automatically, usage. */
export function SmsSettings() {
  const { state, garageId, hosted, role } = useDemo();
  const garage = state.garages.find((g) => g.id === garageId)!;
  const [status, setStatus] = useState<SmsStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [to, setTo] = useState("");
  const test = useAction();

  useEffect(() => {
    if (hosted) smsStatus().then(setStatus, () => setLoadError(true));
  }, [hosted]);

  // The demo has no database: its status and usage come from the sample records.
  const since = Date.parse(state.now) - 30 * 86_400_000;
  const outbound = state.messages.filter((m) => m.direction === "outbound" && m.garageId === garageId && m.sentAt && Date.parse(m.sentAt) > since);
  const s: SmsStatus | null = hosted
    ? status
    : {
        mode: "simulated",
        missing: [],
        sender: { phone: garage.smsNumber, status: "active" },
        dailyLimit: 300,
        usage: { today: 0, month: outbound.reduce((n, m) => n + smsSegments(m.body).segments, 0), failedMonth: outbound.filter((m) => m.status === "failed").length },
        recentFailures: [],
      };
  const hours = (Object.entries(garage.hours) as [string, { open: string; close: string }][]).map(([d, h]) => `${DAYS[Number(d) as Weekday]} ${h.open}–${h.close}`).join(", ");
  const [f1, f2] = garage.followUps;

  return (
    <section id="sms" aria-labelledby="sms-title" className="mx-4 mb-6 rounded-xl border border-line bg-white p-4 md:mx-8 md:p-6">
      <h2 id="sms-title" className="text-lg font-semibold text-text">Text messages (SMS)</h2>
      {!s ? (
        <p className="mt-2 text-sm text-muted">{loadError ? "Couldn't load the SMS status. Refresh to try again." : "Loading…"}</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusLabel tone={s.mode === "live" ? "success" : s.mode === "simulated" ? "neutral" : "attention"}>
              {s.mode === "live" ? "Live: real texts" : s.mode === "simulated" ? "Simulated: no real texts are sent" : "SMS setup required"}
            </StatusLabel>
            {s.sender && <span className="text-sm text-text tabular-nums">Sending number {s.sender.phone} ({s.sender.status})</span>}
          </div>
          {s.mode === "setup_required" && (
            <div className="mt-3 rounded-lg border border-attention/30 bg-attention-bg px-3 py-2 text-sm text-attention">
              Still needed before texts can go:
              <ul className="mt-1 list-disc pl-5">{s.missing.map((m) => <li key={m}>{m}</li>)}</ul>
              <p className="mt-1 text-xs">Until then, texts that come due wait in the queue, and you can still text from your own phone.</p>
            </div>
          )}
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            <dt className="text-muted">Texting from this app</dt>
            <dd className="text-text">{s.mode === "setup_required" ? "Not available yet" : "Available on quotes and invoices (08:00–20:00)"}</dd>
            <dt className="text-muted">Quote follow-ups</dt>
            <dd className="text-text">{MODE[garage.mode]}{garage.paused && " (all sending paused)"}</dd>
            <dt className="text-muted">Invoice texts</dt>
            <dd className="text-text">{INVOICE_MODE_LABEL[garage.invoiceMode]}</dd>
            <dt className="text-muted">Sending window</dt>
            <dd className="text-text">{hours || "No opening hours set"} · UK time (Europe/London)</dd>
            <dt className="text-muted">Follow-up timing</dt>
            <dd className="text-text">
              {f2.enabled ? `${f1.businessDays} and ${f2.businessDays} business days after the quote (2 follow-ups at most)` : `${f1.businessDays} business days after the quote (1 follow-up at most)`}. Invoices: reminders at {INVOICE_REMINDER_DAYS[1]} and {INVOICE_REMINDER_DAYS[2]} days.
            </dd>
            <dt className="text-muted">Usage</dt>
            <dd className="text-text tabular-nums">
              {s.usage.today} SMS parts today (limit {s.dailyLimit} in 24 hours) · {s.usage.month} in the last 30 days · {s.usage.failedMonth} failed
            </dd>
          </dl>
          <p className="mt-2 text-xs text-muted">Change timing, templates and automatic sending under Follow-up settings below. Only the platform admin can change the sending number.</p>

          {s.recentFailures.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-text">Recent failures</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {s.recentFailures.map((x, i) => <li key={i} className="text-text"><span className="text-xs text-muted tabular-nums">{formatLondon(x.at)} · {x.to}</span> {x.error}</li>)}
              </ul>
            </div>
          )}

          {role === "owner" && s.mode !== "setup_required" && (
            <form
              className="mt-5 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                test.run(async () => {
                  if (!hosted) return "Simulated: no real text sent";
                  const r = await sendTestText(to);
                  if (!r.ok) throw new Error(r.error);
                  smsStatus().then(setStatus, () => {});
                  return `Accepted by Twilio (${r.sid}, ${r.status}). Check the phone.`;
                }, (r) => String(r));
              }}
            >
              <Field id="sms-test" label="Send a test text to" hint="A UK mobile you have with you. Up to 5 a day.">
                <input id="sms-test" type="tel" inputMode="tel" value={to} onChange={(e) => setTo(e.target.value)} placeholder="07…" className={`${inputClass()} w-48 tabular-nums`} />
              </Field>
              <Button type="submit" disabled={test.pending || !to.trim()}>{test.pending ? "Sending…" : "Send test text"}</Button>
              <InlineFeedback feedback={test.feedback} />
            </form>
          )}
        </>
      )}
    </section>
  );
}
