"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { confirmBooking, confirmStatus, formatPounds, markCompleted, reconcileSend, renderTemplate, setQuotePaused } from "@/domain/engine";
import { GATE_REASON_TEXT, type GateReason } from "@/domain/gate";
import { setCustomerJobDescription } from "@/domain/settings";
import { CATEGORY_LABEL } from "@/domain/replies";
import { formatLondon, formatLondonTime, HOUR_MS } from "@/domain/time";
import { REPLY_PRESETS } from "@/demo/seed";
import { useDemo } from "@/demo/store";
import { ActionButton } from "./ActionButton";
import { Button, Icon, inputClass, Plate } from "./ui";
import { quoteRow } from "./quoteRows";
import { queueReply } from "./RepliesView";

// Every safeguard checked before drafting and again right before sending, as staff-readable lines.
const CHECKS: [GateReason, string][] = [
  ["garage_paused", "Garage sending is on"],
  ["quote_paused", "Quote is not paused"],
  ["status_not_open", "Quote is still open"],
  ["status_stale", "Open status confirmed in the last 24 hours"],
  ["no_eligibility_evidence", "SMS consent is recorded"],
  ["template_not_approved", "Message template is approved"],
  ["number_suppressed", "Customer hasn't opted out"],
  ["quote_expired", "Quote is within its 30-day validity"],
  ["unresolved_reply", "No customer reply waiting for staff"],
  ["window_expired", "Send window hasn't passed"],
];

function Section({ title, notice, children }: { title: string; notice?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-steel-line/70 px-5 py-4">
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      {notice && <p role="status" className="mb-2 rounded-md bg-green-50 px-3 py-1.5 text-xs text-green-800">✓ {notice}</p>}
      {children}
    </section>
  );
}

export function QuoteDetails({ quoteId, onClose }: { quoteId: string; onClose: () => void }) {
  const { state, staff, act, approveAndSend, simulateReply, notify } = useDemo();
  const panel = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [replyText, setReplyText] = useState("");
  const [notice, setNotice] = useState<{ at: "next" | "message" | "status" | "reply" | "wording"; text: string } | null>(null);
  const done = (at: "next" | "message" | "status" | "reply" | "wording") => (text: string) => setNotice({ at, text });
  const noticeFor = (at: string) => (notice?.at === at ? notice.text : undefined);
  const q = state.quotes.find((x) => x.id === quoteId);
  const [jobValue, setJobValue] = useState(q ? String(q.amountPence / 100) : "");
  const [wording, setWording] = useState(q?.customerJobDescription ?? "");

  // Focus the first useful control (approve, confirm, reconcile...), else the close button.
  useEffect(() => {
    const target = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? closeBtn.current;
    target?.focus({ preventScroll: true });
  }, [quoteId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!q) return null;
  const row = quoteRow(state, q);
  const garage = state.garages.find((g) => g.id === q.garageId)!;
  const stale = q.status === "open" && Date.parse(state.now) - Date.parse(q.statusConfirmedAt) > garage.statusFreshHours * HOUR_MS;
  // One control gets focus on open, by priority of what staff most likely came to do.
  const focusKey =
    row.recon ? "recon"
    : q.status === "open" && q.booking === "requested" ? "confirm"
    : row.draft && !row.view.blockers.length ? "approve"
    : row.view.blockers.includes("status_stale") ? "stale"
    : null;
  const preview = (() => {
    const t = row.view.nextStep ? state.templates.find((x) => x.garageId === q.garageId && x.step === row.view.nextStep) : undefined;
    return t ? renderTemplate(t, q, garage) : undefined;
  })();
  const template = row.view.nextStep ? state.templates.find((t) => t.garageId === q.garageId && t.step === row.view.nextStep) : undefined;

  type Item = { at: string; text: string; quote?: string; from?: "customer" | "garage" };
  const timeline: Item[] = [
    { at: q.quoteSentAt, text: `Quote ${q.sourceQuoteId} sent for ${formatPounds(q.amountPence)}` },
    ...state.events.filter((e) => e.quoteId === q.id && e.kind !== "reply" && e.kind !== "sent").map((e) => ({ at: e.at, text: e.text })),
    ...state.messages
      .filter((m) => m.direction === "outbound" && m.quoteId === q.id && m.sentAt)
      .map((m): Item => ({ at: m.sentAt!, text: `Follow-up ${m.step} ${m.status === "delivered" ? "delivered" : "sent"}`, quote: m.body, from: "garage" })),
    ...state.messages
      .filter((m) => m.direction === "inbound" && (m.quoteId === q.id || m.matchedQuoteIds?.includes(q.id)))
      .map((m): Item => ({ at: m.createdAt, text: `Customer replied: ${CATEGORY_LABEL[m.category ?? "general"].toLowerCase()}`, quote: m.body, from: "customer" })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return (
    <aside
      ref={panel}
      aria-labelledby="quote-details-title"
      className="drawer-in fixed inset-0 z-30 flex flex-col bg-white lg:top-[86px] lg:left-auto lg:w-[480px] lg:border-l lg:border-steel-line lg:shadow-xl lg:shadow-graphite/10"
    >
      <div className="bg-graphite px-5 pt-4 pb-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <Plate reg={q.registration} size="lg" />
          <Button ref={closeBtn} size="sm" variant="onDark" className="ml-auto ring-0" onClick={onClose} aria-label="Close quote details"><Icon name="close" /></Button>
        </div>
        <h2 id="quote-details-title" className="mt-3 text-2xl leading-tight font-bold break-words [font-stretch:115%]">{q.customerName}</h2>
        <p className="mt-1 text-sm break-words text-steel">{q.job}{q.vehicle && <>, {q.vehicle}</>}</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <span className="text-3xl font-extrabold tabular-nums [font-stretch:120%]">{formatPounds(q.amountPence)}</span>
          <span className="text-right text-xs text-steel">
            <span className="block font-medium text-white">{row.status.label}</span>
            {q.sourceQuoteId}, {q.phone}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Next scheduled action" notice={noticeFor("next")}>
          <p className="text-sm font-medium text-ink">{row.next}</p>
          {row.view.nextWindow && q.status === "open" && !row.suppressed && q.eligibilityEvidenceRef && garage.mode !== "off" && (
            <p className="mt-0.5 text-xs text-slate-500">
              {garage.mode === "automatic" ? "Sends automatically" : "Drafted for approval"} at <span className="font-medium text-ink tabular-nums">{formatLondon(row.view.nextWindow.windowStart)}</span>.
              {" "}If it can&apos;t go by {formatLondonTime(row.view.nextWindow.windowEnd)} (closing), it expires rather than going late.
            </p>
          )}
          {row.replyTask && (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Paused until staff deal with the reply.{" "}
              <Link className="font-medium underline" href={`/replies#${row.replyTask.id}`} onClick={() => queueReply(row.replyTask!.id)}>Open it on Replies</Link>
            </p>
          )}
        </Section>

        {(row.draft || (template && q.status === "open" && !row.suppressed && q.eligibilityEvidenceRef)) && (
          <Section notice={noticeFor("message")} title={row.draft ? `Draft follow-up ${row.draft.step}: needs your approval` : `Message preview: follow-up ${row.view.nextStep}`}>
            <p className="rounded-lg bg-work px-3 py-2.5 text-sm text-ink">
              {row.draft ? row.draft.body : preview!.text}
            </p>
            {!row.draft && preview!.unresolved.length > 0 && (
              <p className="mt-1.5 text-xs font-medium text-red-700">
                Won&apos;t send: {preview!.unresolved.map((f) => `{{${f}}}`).join(", ")} has no value for this quote. Edit the template or the quote.
              </p>
            )}
            <p className="mt-1.5 text-xs text-slate-500">
              {row.draft ? "Approving sends exactly this text." : garage.mode === "automatic" ? "This exact text sends automatically at the time above." : "Drafted for your approval at the time above."}
            </p>
            {row.draft && (
              <div className="mt-3">
                <ActionButton
                  variant="primary"
                  label="Approve & send"
                  primaryFocus={focusKey === "approve"}
                  onDone={(t) => { done("message")(t); if (t.startsWith("Sent")) notify(`Follow-up sent to ${q.customerName}. ${t}.`, [q.id]); }}
                  onRun={() => approveAndSend(row.draft!.id)}
                  success={(r) => {
                    const s = (r as { outcome: string; reasons?: string[] }[])[0];
                    if (!s) return "Nothing to send";
                    if (s.outcome === "sent") return "Sent and delivered (mock provider)";
                    if (s.outcome === "needs_reconciliation") return "Provider timed out: marked for reconciliation, not retried";
                    if (s.outcome === "failed") return "Provider rejected it; not sent";
                    return `Held back by final checks: ${(s.reasons ?? []).map((x) => GATE_REASON_TEXT[x as keyof typeof GATE_REASON_TEXT].toLowerCase()).join(", ")}`;
                  }}
                />
              </div>
            )}
          </Section>
        )}

        {q.status === "open" && row.view.nextStep && (
          <Section title={row.view.blockers.length ? `Send checks: ${row.view.blockers.length} blocking` : "Send checks: all clear"}>
            <ul className="space-y-1.5 text-sm">
              {CHECKS.map(([reason, label]) => {
                const failing = row.view.blockers.includes(reason);
                return (
                  <li key={reason} className="flex items-center gap-2">
                    <span className={`grid h-4 w-4 place-items-center rounded-full ${failing ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                      <Icon name={failing ? "close" : "check"} className="h-3 w-3" />
                    </span>
                    <span className={failing ? "font-medium text-red-800" : "text-slate-600"}>{failing ? GATE_REASON_TEXT[reason] : label}</span>
                    {failing && reason === "status_stale" && (
                      <ActionButton primaryFocus={focusKey === "stale"} onDone={done("status")} label="Confirm still open" onRun={() => act((s) => confirmStatus(s, q.id, "open", staff))} success="Status confirmed" />
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-slate-500">These run again immediately before any text is sent.</p>
          </Section>
        )}

        {row.recon && (
          <Section title="Send result unknown">
            <p className="mb-2 text-sm text-slate-700">The provider timed out. Check its log, then record what happened. It will not be resent automatically.</p>
            <div className="flex flex-col items-start gap-2">
              <ActionButton primaryFocus={focusKey === "recon"} onDone={done("next")} label="Provider log shows it was sent" onRun={() => act((s) => reconcileSend(s, row.recon!.id, "was_sent"))} success="Recorded as sent" />
              <ActionButton onDone={done("next")} label="It was not sent" onRun={() => act((s) => reconcileSend(s, row.recon!.id, "not_sent"))} success="Recorded as not sent" />
            </div>
          </Section>
        )}

        <Section title="Timeline">
          <ol className="relative ml-1 border-l border-steel-line">
            {timeline.map((t, i) => (
              <li key={i} className="relative pb-3.5 pl-4 last:pb-0">
                <span aria-hidden className={`absolute top-1.5 -left-[4.5px] h-2 w-2 rounded-full ring-2 ring-white ${t.from === "customer" ? "bg-signal" : t.from === "garage" ? "bg-ink" : "bg-steel"}`} />
                <span className="block text-xs text-slate-500 tabular-nums">{formatLondon(t.at)}</span>
                <span className="block text-sm text-slate-700">{t.text}</span>
                {t.quote && (
                  <span className={`mt-1 block rounded-md px-2.5 py-1.5 text-sm ${t.from === "customer" ? "bg-signal/[0.07] text-ink" : "bg-work text-slate-700"}`}>{t.quote}</span>
                )}
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Job wording in texts" notice={noticeFor("wording")}>
          <p className="mb-2 text-xs text-slate-500">
            Texts use this instead of the workshop description. Garage description: <span className="text-ink">{q.job}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="cust-job" className="sr-only">Job wording for texts</label>
            <input
              id="cust-job"
              value={wording}
              onChange={(e) => setWording(e.target.value)}
              placeholder={q.job}
              maxLength={80}
              className={`${inputClass()} min-w-0 flex-1`}
            />
            <ActionButton onDone={done("wording")} label="Save wording" onRun={() => act((s) => setCustomerJobDescription(s, q.id, wording, staff))} success={wording.trim() ? "Texts will say this" : "Texts will use the garage description"} />
          </div>
        </Section>

        <Section title="Status" notice={noticeFor("status")}>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Last confirmed</dt>
              <dd className={stale ? "text-amber-800" : "text-slate-800"}>{formatLondon(q.statusConfirmedAt)} ({q.statusSource}){stale && ", too old to send"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">SMS eligibility</dt>
              <dd className="text-right text-slate-800">{q.eligibilityEvidenceRef ?? <span className="text-red-700">missing</span>}</dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-col items-start gap-2">
            {q.status === "open" && q.booking === "requested" && (
              <ActionButton variant="primary" primaryFocus={focusKey === "confirm"} onDone={(t) => { done("status")(t); notify(`Booking confirmed for ${q.customerName}. Follow-ups stopped.`, [q.id]); }} label="Confirm booking" onRun={() => act((s) => confirmBooking(s, q.id, staff))} success="Booking confirmed. Follow-ups stopped." />
            )}
            {q.status === "open" && (
              <>
                <ActionButton onDone={done("status")} label="Still open: confirm status" onRun={() => act((s) => confirmStatus(s, q.id, "open", staff))} success="Status confirmed" />
                <ActionButton onDone={done("status")} label="Booked by phone" onRun={() => act((s) => confirmStatus(s, q.id, "booked", staff))} success="Marked booked. Follow-ups stopped." />
                <ActionButton onDone={done("status")} label="Customer declined" onRun={() => act((s) => confirmStatus(s, q.id, "declined", staff))} success="Marked declined" />
                <ActionButton
                  variant="ghost"
                  onDone={done("status")}
                  label={q.paused ? "Resume this quote" : "Pause this quote"}
                  onRun={() => act((s) => setQuotePaused(s, q.id, !q.paused, staff))}
                  success={q.paused ? "Paused" : "Resumed"}
                />
              </>
            )}
            {q.status === "booked" && (
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="job-value" className="text-xs text-slate-600">Final job value £</label>
                <input id="job-value" className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm" inputMode="decimal" value={jobValue} onChange={(e) => setJobValue(e.target.value)} />
                <ActionButton
                  onDone={done("status")} label="Record completed job"
                  onRun={() => {
                    const pence = Math.round(Number(jobValue) * 100);
                    if (!Number.isFinite(pence) || pence <= 0) throw new Error("enter the job value in pounds");
                    act((s) => markCompleted(s, q.id, pence, staff));
                  }}
                  success="Job recorded"
                />
              </div>
            )}
          </div>
        </Section>

        <Section title="Simulate a customer reply (demo)" notice={noticeFor("reply")}>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {REPLY_PRESETS.map((p) => (
              <Button key={p.label} size="sm" onClick={() => setReplyText(p.body)}>{p.label}</Button>
            ))}
          </div>
          <label htmlFor="reply-text" className="sr-only">Reply text</label>
          <input
            id="reply-text"
            className="mb-2 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            placeholder={`Text from ${q.customerName.split(" ")[0]}…`}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
          />
          <ActionButton
            onDone={done("reply")}
            label="Receive reply"
            onRun={() => {
              if (!replyText.trim()) throw new Error("type or pick a reply first");
              const r = simulateReply(q.phone, replyText.trim());
              setReplyText("");
              return r;
            }}
            success={(r) => {
              const i = r as { outcome: string; category?: keyof typeof CATEGORY_LABEL };
              if (i.outcome === "opt_out") return "Opt-out applied. This number won't be texted again.";
              if (i.outcome === "ambiguous") return "Matches several quotes. All paused and handed to staff.";
              return `${CATEGORY_LABEL[i.category ?? "general"]}: follow-ups paused, handed to staff on Replies`;
            }}
          />
        </Section>

      </div>
    </aside>
  );
}
