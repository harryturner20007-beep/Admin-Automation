"use client";

import Link from "next/link";
import { gsap } from "gsap";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { confirmStatus, formatPounds, reconcileSend, setQuotePaused } from "@/domain/engine";
import { JOB_STATUS_LABEL, jobForQuote, setCustomerBilling } from "@/domain/jobs";
import { GATE_REASON_TEXT } from "@/domain/gate";
import {
  canChase,
  staffReason,
  composeMessage,
  followUpFor,
  MESSAGE_OPTIONS,
  OUTCOME_LABEL,
  recordContactAttempt,
  cancelQuote,
  restoreQuote,
  recordOutcome,
  reminderDate,
  type MessageOption,
  type Outcome,
} from "@/domain/queue";
import { setCustomerJobDescription } from "@/domain/settings";
import { formatLondon, formatLondonDate, ukDate } from "@/domain/time";
import { REPLY_PRESETS } from "@/demo/seed";
import { useAction, useDemo } from "@/demo/store";
import { ActionButton } from "./ActionButton";
import { BookJobForm } from "./BookJobForm";
import { QuoteWork } from "./QuoteWork";
import { quoteValidity } from "@/domain/intake";
import { SmsComposer } from "./SmsComposer";
import { ReplyBox } from "./ReplyBox";
import { Progress } from "./workflow";
import { lineReveal, motionAllowed, RISE, Rise, Words } from "./motion";
import { quoteRow } from "./quoteRows";
import { queueReply } from "./ChatsView";
import { statusOf } from "./quoteStatus";
import { Button, Icon, InlineFeedback, inputClass, PlateLabel, StatusLabel } from "./ui";

/** Media query as React state (false on the server, where nothing renders before data loads anyway). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const ukPhone = (e164: string) => (e164.startsWith("+44") ? `0${e164.slice(3, 7)} ${e164.slice(7)}` : e164);
const dayLabel = (ymd: string) => formatLondonDate(`${ymd}T12:00:00Z`);
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section data-section className="border-t border-line px-6 py-5">
      <h3 className="mb-3 text-sm font-semibold text-text">{title}</h3>
      {children}
    </section>
  );
}

/** Pill-style single choice (role=radio), used for message options, outcomes and reminders. */
function Choice({ options, value, onChange, label, autoFocus }: { options: { id: string; label: string; hint?: string }[]; value: string | null; onChange: (id: string) => void; label: string; autoFocus?: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (i: number) => {
    const n = (i + options.length) % options.length;
    onChange(options[n].id);
    refs.current[n]?.focus();
  };
  const current = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o, i) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === current ? 0 : -1}
            data-autofocus={autoFocus && i === 0 ? true : undefined}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => {
              const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
              if (step) {
                e.preventDefault();
                move(i + step);
              }
            }}
            className={`min-h-11 rounded-lg border px-3 text-left text-sm transition-colors ${focusRing} ${on ? "border-accent bg-selected font-medium text-accent" : "border-line bg-white text-text hover:bg-canvas"}`}
          >
            {o.label}
            {o.hint && <span className="ml-1.5 text-xs text-muted tabular-nums">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

type Saved = { text: string };

export function QuotePanel({ quoteId, animateIn, onClose, onSaved, onNext, hasNext }: { quoteId: string; animateIn: boolean; onClose: () => void; onSaved: (id: string) => void; onNext: () => void; hasNext: boolean }) {
  const { state, staff, act, actUndoable, undo, approveAndSend, simulateReply, hosted } = useDemo();
  const desk = useMediaQuery("(min-width: 1200px)");
  const panel = useRef<HTMLElement & HTMLDialogElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const fade = useRef<gsap.core.Tween | null>(null);
  const q = state.quotes.find((x) => x.id === quoteId);

  const [option, setOption] = useState<MessageOption | null>(null);
  const [message, setMessage] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [reminder, setReminder] = useState<"tomorrow" | "3days" | "custom" | null>(null);
  const [customDate, setCustomDate] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [wording, setWording] = useState(q?.customerJobDescription ?? "");
  const [booking, setBooking] = useState(false);
  const [email, setEmail] = useState(q?.email ?? "");
  const [address, setAddress] = useState(q?.billingAddress ?? "");
  const [replyText, setReplyText] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const save = useAction();
  const undoAction = useAction();
  const contact = useAction();

  // Modal below 1200px (drawer / full-screen sheet), in-flow side panel at desktop.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    if (!desk && el instanceof HTMLDialogElement && !el.open) el.showModal();
    (el.querySelector<HTMLElement>("[data-autofocus]") ?? closeBtn.current)?.focus({ preventScroll: true });
    if (!motionAllowed()) return;
    // Opening: panel slide, then the first 6 sections rise in. Switching quote while open: only the header re-reveals.
    const tweens = animateIn
      ? [
          gsap.from(el, { x: 24, opacity: 0, duration: 0.2, ease: "power1.out", clearProps: "transform,opacity" }),
          gsap.from([...el.querySelectorAll("[data-section]")].slice(0, 6), { ...RISE, stagger: 0.04 }),
        ]
      : header.current
        ? [lineReveal(header.current)]
        : [];
    return () => {
      tweens.forEach((t) => t.revert()); // unmount mid-tween: kill it and drop its inline styles
      fade.current?.revert();
    };
  }, [desk, animateIn]);

  useEffect(() => {
    if (!desk) return; // the modal <dialog> handles Escape itself (onCancel)
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desk, onClose]);

  if (!q) return null;
  // Closing the modal <dialog> first lets the browser restore focus natively; the list then refocuses the row.
  const close = () => {
    if (panel.current instanceof HTMLDialogElement && panel.current.open) panel.current.close();
    onClose();
  };
  const row = quoteRow(state, q);
  const job = jobForQuote(state, q.id);
  const reason = staffReason(state, q);
  const status = statusOf(state, q);
  const fu = followUpFor(state, q);
  const chase = canChase(state, q);
  const today = ukDate(state.now);
  const reminderYmd = reminder === "custom" ? customDate : reminder ? reminderDate(state, reminder) : undefined;
  const validity = quoteValidity(q, state.garages.find((g) => g.id === q.garageId)!.quoteValidityDays, state.now);
  const smsHref = `sms:${q.phone}?&body=${encodeURIComponent(message)}`;

  const submitOutcome = () =>
    save.run(() => {
      if (!outcome) throw new Error("choose an outcome first");
      const needsDate = outcome === "needs_time" || outcome === "no_reply";
      if (needsDate && !reminderYmd) throw new Error("choose when to follow up");
      actUndoable((s) => recordOutcome(s, q.id, outcome, staff, needsDate ? reminderYmd : undefined));
      setSaved({ text: needsDate ? `Saved: ${OUTCOME_LABEL[outcome]}. Follow up ${dayLabel(reminderYmd!)}.` : `Saved: ${OUTCOME_LABEL[outcome]}.` });
      onSaved(q.id);
    }, "Saved");

  const content = (
    <div className="flex h-full min-h-0 flex-col">
      {/* 1. Header (stays visible while the panel scrolls) */}
      <header ref={header} className="flex items-start gap-3 border-b border-line bg-white px-6 py-4">
        <div className="min-w-0 flex-1">
          <span className="-mb-[0.12em] inline-block overflow-hidden pb-[0.12em] align-top">
            <span data-word className="inline-block"><PlateLabel reg={q.registration} /></span>
          </span>
          <h2 id="quote-panel-title" aria-label={q.customerName} className="mt-1.5 text-lg leading-tight font-semibold break-words text-text"><Words text={q.customerName} /></h2>
        </div>
        <Button ref={closeBtn} variant="secondary" size="sm" className="hover-turn" onClick={close}>
          <Icon name="close" className="nudge-icon h-4 w-4" /> Close
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* 2. Amount and status */}
        <div data-section className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div>
            <div className="text-xs text-muted">Quote</div>
            <div className="text-2xl font-semibold text-text tabular-nums">{formatPounds(q.amountPence)}</div>
            {q.status === "open" && validity && (
              <div className={`mt-1 text-xs tabular-nums ${validity.daysLeft <= 0 ? "font-medium text-danger" : validity.daysLeft <= 3 ? "font-medium text-attention" : "text-muted"}`}>
                Valid until {formatLondonDate(validity.until)} · {validity.daysLeft <= 0 ? "expired" : `${validity.daysLeft} day${validity.daysLeft === 1 ? "" : "s"} left`}
              </div>
            )}
          </div>
          <div className="text-right">
            <StatusLabel tone={status.tone}>{status.label}</StatusLabel>
            <div className="mt-1 text-xs text-muted">Follow-up: {fu.label}</div>
          </div>
          <div className="w-full">
            <Progress state={state} quoteId={q.id} here="quote" />
          </div>
        </div>

        {/* 3. Work and line items */}
        <Section title="Work">
          <p className="text-sm whitespace-pre-line text-text">{q.job}</p>
          <p className="mt-1 text-xs text-muted">{q.vehicle || "Vehicle not recorded"} · Ref {q.sourceQuoteId} · Sent {formatLondon(q.quoteSentAt)}</p>
          <QuoteWork q={q} />
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor="cust-job" className="mb-1 block text-xs font-medium text-muted">Wording for texts (optional)</label>
              <input id="cust-job" value={wording} onChange={(e) => setWording(e.target.value)} placeholder={q.job} maxLength={80} className={inputClass()} />
            </div>
            <ActionButton label="Save wording" onRun={() => act((s) => setCustomerJobDescription(s, q.id, wording, staff))} success={wording.trim() ? "Texts will say this" : "Texts will use the description"} />
          </div>
        </Section>

        {/* 4. Contact */}
        <Section title="Contact">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Mobile</dt>
            <dd className="text-text tabular-nums">{ukPhone(q.phone)}</dd>
          </dl>
          <details className="mt-3 text-sm">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-accent">Billing details{q.billingAddress ? "" : " (needed for the invoice)"}</summary>
            <div className="space-y-2">
              <label htmlFor="cust-email" className="block text-xs font-medium text-muted">Email</label>
              <input id="cust-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass()} />
              <label htmlFor="cust-address" className="block text-xs font-medium text-muted">Billing address</label>
              <textarea id="cust-address" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass()} />
              <ActionButton label="Save billing details" onRun={() => act((s) => setCustomerBilling(s, q.id, { email, billingAddress: address }, staff))} success="Saved. New invoices use these details." />
            </div>
          </details>
          {row.suppressed && <p className="mt-2 rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">Opted out of texts. Don&apos;t text this number.</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={`tel:${q.phone}`}
              onClick={() => contact.run(() => act((s) => recordContactAttempt(s, q.id, "call", staff)), "Call started in your phone app. Record the outcome below.")}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-white px-4 text-sm font-medium text-text ring-1 ring-line ring-inset hover:bg-canvas ${focusRing}`}
            >
              <Icon name="phone" /> Call customer
            </a>
            <InlineFeedback feedback={contact.feedback} />
          </div>
        </Section>

        {/* 5. Message composer */}
        {reason && (
          <div role="status" className="mx-6 mb-4 rounded-lg border border-attention/30 bg-attention-bg px-3 py-2 text-sm text-attention">
            <span className="font-medium">Staff needed:</span> {reason}
          </div>
        )}

        {chase && !row.suppressed && (
          <Section title="Messages with the customer">
            <ReplyBox q={q} />
          </Section>
        )}

        {chase && !row.suppressed && (
          <Section title="Follow-up message">
            <Choice
              label="Message type"
              autoFocus
              options={MESSAGE_OPTIONS}
              value={option}
              onChange={(id) => {
                setOption(id as MessageOption);
                setMessage(composeMessage(q, id as MessageOption));
                // 150ms cross-fade of the new text; the textarea stays editable and focus stays on the chip.
                if (composer.current && motionAllowed()) {
                  fade.current?.revert();
                  fade.current = gsap.fromTo(composer.current, { opacity: 0.2 }, { opacity: 1, duration: 0.15, ease: "power2.out", clearProps: "opacity" });
                }
              }}
            />
            <label htmlFor="compose" className="sr-only">Message</label>
            <textarea ref={composer} id="compose" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Choose a message above, or write your own." className={`${inputClass()} mt-3 leading-relaxed`} />
            <div className="mt-3">
              <SmsComposer target={{ quoteId: q.id }} to={q.phone} value={message} label="Send follow-up" onSent={() => onSaved(q.id)} />
            </div>
            <p className="mt-4 text-xs text-muted">Or send it from your own phone (then record the outcome below):</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                href={message.trim() ? smsHref : undefined}
                aria-disabled={!message.trim()}
                onClick={(e) => {
                  if (!message.trim()) return e.preventDefault();
                  contact.run(() => act((s) => recordContactAttempt(s, q.id, "messages_app", staff)), "Opened in Messages. Record the outcome below once you know it.");
                }}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-4 text-sm font-medium text-text ring-1 ring-line ring-inset hover:bg-canvas aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${focusRing}`}
              >
                <Icon name="message" /> Open Messages app
              </a>
              <Button
                disabled={!message.trim()}
                onClick={() =>
                  contact.run(async () => {
                    await navigator.clipboard.writeText(message);
                    act((s) => recordContactAttempt(s, q.id, "copy", staff));
                  }, "Message copied")
                }
              >
                <Icon name="copy" /> Copy message
              </Button>
            </div>
          </Section>
        )}

        {/* Scheduled texts (the automatic follow-up workflow) */}
        {q.status === "open" && (row.draft || row.recon || row.view.nextWindow) && (
          <Section title="Scheduled texts">
            <p className="text-sm text-text">{row.next}</p>
            {row.draft && (
              <>
                <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-sm text-text">{row.draft.body}</p>
                <div className="mt-2">
                  <ActionButton
                    variant="primary"
                    label="Approve & send"
                    onRun={() => approveAndSend(row.draft!.id)}
                    success={(r) => {
                      const o = r as { status: string; detail?: string };
                      return o.status === "Pending" ? `Approved. ${o.detail ?? "It sends inside its sending window."}` : `${o.status}${o.detail ? `: ${o.detail}` : ""}`;
                    }}
                  />
                </div>
              </>
            )}
            {/* The main hold reason is already in the line above; only offer the fix staff can make here. */}
            {row.view.blockers.includes("status_stale") && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-attention">
                {GATE_REASON_TEXT.status_stale}
                <ActionButton label="Confirm still open" onRun={() => act((s) => confirmStatus(s, q.id, "open", staff))} success="Confirmed" />
              </div>
            )}
            {row.recon && (
              <div className="mt-3 flex flex-wrap gap-2">
                <p className="w-full text-xs text-muted">The SMS provider timed out. Check its log; nothing is resent automatically.</p>
                <ActionButton label="It was sent" onRun={() => act((s) => reconcileSend(s, row.recon!.id, "was_sent"))} success="Recorded as sent" />
                <ActionButton label="It was not sent" onRun={() => act((s) => reconcileSend(s, row.recon!.id, "not_sent"))} success="Recorded as not sent" />
              </div>
            )}
            {row.replyTask && (
              <p className="mt-2 text-xs text-muted">
                A customer reply is waiting. <Link className="font-medium text-accent underline" href={`/chats#${row.replyTask.id}`} onClick={() => queueReply(row.replyTask!.id)}>Open it in Chats</Link>
              </p>
            )}
          </Section>
        )}

        {!hosted && (
        <Section title="Demo">
          <details>
            <summary className={`cursor-pointer text-xs text-muted ${focusRing}`}>Demo: simulate a customer reply</summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {REPLY_PRESETS.map((p) => (
                <Button key={p.label} size="sm" onClick={() => setReplyText(p.body)}>{p.label}</Button>
              ))}
            </div>
            <label htmlFor="sim-reply" className="sr-only">Reply text</label>
            <input id="sim-reply" className={`${inputClass()} mt-2`} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder={`Text from ${q.customerName.split(" ")[0]}`} />
            <div className="mt-2">
              <ActionButton label="Receive reply" onRun={() => { if (!replyText.trim()) throw new Error("type or pick a reply"); simulateReply(q.phone, replyText.trim()); setReplyText(""); }} success="Reply received" />
            </div>
          </details>
        </Section>
        )}

        {/* 7. Outcome and next reminder */}
        <Section title={chase ? "Outcome" : "Outcome recorded"}>
          {chase && (booking || outcome === "accepted") ? (
            <BookJobForm q={q} customerAccepted={outcome === "accepted"} onCancel={() => { setBooking(false); setOutcome(null); }} />
          ) : chase ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3 text-sm">
                <span className="text-text">Customer said yes?</span>
                <Button variant="primary" size="sm" onClick={() => setBooking(true)}>Book job</Button>
              </div>
              <Choice label="Outcome" options={(Object.keys(OUTCOME_LABEL) as Outcome[]).map((id) => ({ id, label: OUTCOME_LABEL[id] }))} value={outcome} onChange={(id) => setOutcome(id as Outcome)} />
              {(outcome === "needs_time" || outcome === "no_reply") && (
                <Rise>
                  <div className="mb-2 text-xs font-medium text-muted">Next reminder</div>
                  <Choice
                    label="Next reminder"
                    options={[
                      { id: "tomorrow", label: "Tomorrow", hint: dayLabel(reminderDate(state, "tomorrow")) },
                      { id: "3days", label: "In 3 days", hint: dayLabel(reminderDate(state, "3days")) },
                      { id: "custom", label: "Choose date" },
                    ]}
                    value={reminder}
                    onChange={(id) => setReminder(id as typeof reminder)}
                  />
                  {reminder === "custom" && (
                    <div className="mt-2">
                      <label htmlFor="remind-date" className="sr-only">Reminder date</label>
                      <input id="remind-date" type="date" min={today} value={customDate} onChange={(e) => setCustomDate(e.target.value)} className={`${inputClass()} max-w-[200px] tabular-nums`} />
                    </div>
                  )}
                  <p className="mt-2 text-sm text-text" aria-live="polite">{reminderYmd ? <>Reminder: <span className="font-medium tabular-nums">{dayLabel(reminderYmd)}</span></> : "No reminder date chosen yet."}</p>
                </Rise>
              )}
              <Button variant="ghost" size="sm" onClick={() => act((s) => setQuotePaused(s, q.id, !q.paused, staff))}>
                <Icon name="pause" /> {q.paused ? "Resume automatic texts" : "Pause automatic texts for this quote"}
              </Button>
              <div className="border-t border-line pt-3">
                {confirmCancel ? (
                  <div role="group" aria-label="Confirm cancelling this quote" className="space-y-2 rounded-lg border border-line bg-canvas p-3 text-sm">
                    <p className="text-text">Cancel this quote? It moves to the Cancelled tab and no more texts go out. You can restore it later.</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          actUndoable((s) => cancelQuote(s, q.id, staff));
                          setConfirmCancel(false);
                          setSaved({ text: `Cancelled ${q.customerName}'s quote. Find it in the Cancelled tab.` });
                          onSaved(q.id);
                        }}
                      >
                        Yes, cancel quote
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(false)}>Keep it</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(true)}>Cancel quote…</Button>
                )}
              </div>
            </div>
          ) : job ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-text">
                {job.number} · {JOB_STATUS_LABEL[job.status]} · {formatLondon(job.startAt)}
              </span>
              <Link href={`/jobs?job=${job.id}`} className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 font-medium text-white hover:bg-accent-hover">View job</Link>
            </div>
          ) : q.status === "booked" ? (
            booking ? <BookJobForm q={q} onCancel={() => setBooking(false)} /> : (
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="text-muted">Accepted. Book it in to create the job.</span>
                <Button variant="primary" onClick={() => setBooking(true)}>Book job</Button>
              </div>
            )
          ) : q.status === "cancelled" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-muted">Cancelled{q.cancelledAt ? ` on ${formatLondonDate(q.cancelledAt)}` : ""}. No texts go out while it is cancelled.</span>
              <ActionButton label="Restore quote" onRun={() => act((s) => restoreQuote(s, q.id, staff))} success="Restored. Automatic texts are paused until you resume them." />
            </div>
          ) : (
            <p className="text-sm text-muted">{status.label}. Nothing more to chase.</p>
          )}
        </Section>
      </div>

      {/* Bottom action bar: always reachable, never covers the fields above (it sits outside the scroll area). */}
      <footer className="border-t border-line bg-white px-6 py-3">
        {saved ? (
          <Rise>
          <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
            <span className="mr-auto font-medium text-success">{saved.text}</span>
            <InlineFeedback feedback={undoAction.feedback?.ok ? null : undoAction.feedback} />
            <Button
              size="sm"
              disabled={undoAction.pending}
              onClick={() =>
                undoAction.run(() => {
                  undo();
                  setSaved(null);
                  onSaved(q.id);
                }, "Undone")
              }
            >
              <Icon name="undo" /> Undo
            </Button>
            <Button size="sm" variant="primary" disabled={!hasNext} onClick={onNext}>
              Next quote <Icon name="next" />
            </Button>
          </div>
          </Rise>
        ) : chase && !booking && outcome !== "accepted" ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <InlineFeedback feedback={save.feedback?.ok ? null : save.feedback} />
            <Button variant="primary" className="w-full sm:w-auto" disabled={save.pending} aria-busy={save.pending} onClick={submitOutcome}>
              {save.pending ? "Saving…" : "Save outcome"}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button variant="secondary" className="w-full sm:w-auto" onClick={close}>Close</Button>
          </div>
        )}
      </footer>
    </div>
  );

  return desk ? (
    <aside ref={panel} aria-labelledby="quote-panel-title" className="sticky top-0 h-screen w-[420px] shrink-0 border-l border-line bg-white">
      {content}
    </aside>
  ) : (
    <dialog
      ref={panel}
      aria-labelledby="quote-panel-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className={`${animateIn ? "backdrop-in " : ""}m-0 ml-auto h-dvh max-h-none w-full max-w-none bg-white p-0 shadow-float backdrop:bg-text/30 md:w-[420px]`}
    >
      {content}
    </dialog>
  );
}
