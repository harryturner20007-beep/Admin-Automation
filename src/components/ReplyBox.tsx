"use client";

import { useState } from "react";
import { resolveTask } from "@/domain/engine";
import { bookJob, offerSlots, offerText } from "@/domain/jobs";
import { addDaysYmd, formatLondon, fromLondonInput, ukDate } from "@/domain/time";
import type { Quote } from "@/domain/types";
import { useAction, useDemo } from "@/demo/store";
import { SmsComposer } from "./SmsComposer";
import { Button, Icon, InlineFeedback, inputClass } from "./ui";

/**
 * Talk to the customer from the quote: see their latest text, answer it, offer booking times, and book
 * the time they pick (which creates the job). Everything is sent from the garage's number.
 *
 * Booking stays on this screen: the quote panel re-renders to its booked state (it reads live from
 * `state`), so the quote simply moves out of Quotes' open list and into Jobs without jumping the user there.
 */
export function ReplyBox({ q }: { q: Quote }) {
  const { state, staff, act, textBookingConfirmation, notify } = useDemo();
  const tomorrow = addDaysYmd(ukDate(state.now), 1);
  const [text, setText] = useState("");
  const [offering, setOffering] = useState(false);
  const [slots, setSlots] = useState([`${tomorrow}T09:00`, "", ""]);
  const offer = useAction();
  const confirm = useAction();
  const handled = useAction();

  const inbound = state.messages.filter((m) => m.direction === "inbound" && (m.quoteId === q.id || m.matchedQuoteIds?.includes(q.id))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const tasks = state.tasks.filter((t) => t.status === "open" && t.quoteIds.includes(q.id) && t.kind !== "opt_out_notice" && t.kind !== "reconcile_send");
  const waiting = tasks.length > 0 || q.unresolvedReply;
  const latest = inbound[0];

  // The customer has had an answer: the alert clears and any remaining automatic follow-up may continue.
  const markHandled = () => act((s) => s.tasks.filter((t) => t.status === "open" && t.quoteIds.includes(q.id) && t.kind !== "opt_out_notice" && t.kind !== "reconcile_send").forEach((t) => resolveTask(s, t.id, "resume", staff)));

  const book = (slot: string) =>
    confirm.run(async () => {
      // Book first, then text: the customer is only told once the booking really exists.
      act((s) => {
        bookJob(s, q.id, { startAt: slot, notes: "", customerConfirmation: "Chose this time by text" }, staff);
      });
      const done = await textBookingConfirmation(q, slot);
      notify(`${q.customerName} booked in. ${done}`, [q.id]); // the reply box closes once booked
      return done;
    }, (r) => `Booked. ${r}`);

  return (
    <div className="space-y-4">
      {latest && (
        <div className={`rounded-lg px-3 py-2 text-sm ${waiting ? "bg-selected" : "bg-canvas"}`}>
          <span className="mb-1 block text-xs font-medium text-muted">{q.customerName.split(" ")[0]} · {formatLondon(latest.createdAt)}{waiting ? " · needs an answer" : ""}</span>
          <span className="text-text">{latest.body}</span>
        </div>
      )}

      {(q.offeredSlots?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-line p-3">
          <p className="text-sm font-medium text-text">Times you offered</p>
          <p className="text-xs text-muted">When the customer picks one, confirm it here. It books the job and texts them the confirmation.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {q.offeredSlots!.map((slot) => (
              <Button key={slot} variant="primary" size="sm" disabled={confirm.pending} onClick={() => book(slot)}>
                <Icon name="check" /> Confirm {formatLondon(slot, { withDay: true })}
              </Button>
            ))}
          </div>
          <div className="mt-2"><InlineFeedback feedback={confirm.feedback} /></div>
        </div>
      )}

      <div>
        <label htmlFor={`reply-${q.id}`} className="mb-1 block text-sm font-medium text-text">Text the customer</label>
        <textarea id={`reply-${q.id}`} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your answer…" className={`${inputClass()} mb-2 leading-relaxed`} />
        <SmsComposer target={{ quoteId: q.id, reply: true }} to={q.phone} value={text} label="Send reply" onSent={(status) => status !== "Failed" && waiting && markHandled()} />
      </div>

      {offering ? (
        <form
          className="space-y-2 rounded-lg border border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            offer.run(() => {
              const chosen = slots.filter(Boolean).map(fromLondonInput);
              act((s) => offerSlots(s, q.id, chosen, staff));
              setText(offerText(q, [...new Set(chosen)].sort()));
              setOffering(false);
            }, "Times saved. Check the text above and press Send reply.");
          }}
        >
          <p className="text-sm font-medium text-text">Offer up to three times</p>
          {slots.map((v, i) => (
            <div key={i}>
              <label htmlFor={`slot-${i}`} className="sr-only">Time {i + 1}</label>
              <input id={`slot-${i}`} type="datetime-local" value={v} onChange={(e) => setSlots(slots.map((x, j) => (j === i ? e.target.value : x)))} className={`${inputClass()} tabular-nums`} />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" variant="primary">Write the offer text</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOffering(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setOffering(true)}><Icon name="calendar" /> Offer dates</Button>
          {waiting && <Button size="sm" variant="ghost" disabled={handled.pending} onClick={() => handled.run(markHandled, "Marked as answered")}>Mark as answered (no text)</Button>}
        </div>
      )}
      <InlineFeedback feedback={offer.feedback ?? handled.feedback} />
    </div>
  );
}
