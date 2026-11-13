"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { bookingErrors, bookJob, type BookingInput } from "@/domain/jobs";
import { formatPounds } from "@/domain/templates";
import { addDaysYmd, fromLondonInput, ukDate } from "@/domain/time";
import type { Quote } from "@/domain/types";
import { useAction, useDemo } from "@/demo/store";
import { Button, Field, InlineFeedback, inputClass } from "./ui";

/**
 * "Book job" from a quote: details come from the quote; staff add the slot and notes and confirm the
 * customer accepted. Saving creates the job (or returns the existing one).
 *
 * By default this stays put: the quote's own status flips to "booked", so whichever screen it's shown
 * on (Quotes, Chats) just re-renders to its booked state and the quote drops off that screen's open
 * list. Pass `goToJob` only when the form is used from the Jobs screen itself, where jumping to the new
 * job's panel is the point.
 */
export function BookJobForm({ q, onCancel, customerAccepted = false, goToJob = false }: { q: Quote; onCancel: () => void; customerAccepted?: boolean; goToJob?: boolean }) {
  const { state, staff, act, textBookingConfirmation, notify } = useDemo();
  const router = useRouter();
  const save = useAction();
  const [when, setWhen] = useState(`${q.bookedFor || addDaysYmd(ukDate(state.now), 1)}T09:00`);
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [accepted, setAccepted] = useState(customerAccepted || q.status === "booked");
  const [how, setHow] = useState(q.status === "booked" ? "Accepted (recorded earlier)" : "");
  const [errors, setErrors] = useState<Partial<Record<keyof BookingInput, string>>>({});

  const submit = () =>
    save.run(async () => {
      const input: BookingInput = {
        startAt: fromLondonInput(when),
        durationMins: duration.trim() ? Math.round(Number(duration) * 60) : undefined,
        notes,
        customerConfirmation: accepted ? how.trim() || "Customer accepted" : "",
      };
      const e = bookingErrors(input);
      if (!accepted) e.customerConfirmation = "Tick to confirm the customer accepted the quote";
      setErrors(e);
      if (Object.keys(e).length) throw new Error("Check the highlighted fields");
      let jobId = "";
      let jobTab = "today";
      act((s) => {
        const job = bookJob(s, q.id, input, staff);
        jobId = job.id;
        jobTab = ukDate(job.startAt) > ukDate(s.now) ? "upcoming" : "today";
      });
      const texted = await textBookingConfirmation(q, input.startAt);
      notify(`${q.customerName} booked in. ${texted}`, [q.id]); // the form closes once booked, so say it in the toast
      if (goToJob) router.push(`/jobs?tab=${jobTab}&job=${encodeURIComponent(jobId)}`);
      return texted;
    }, (r) => `Booked. ${r}`);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-canvas p-3 text-sm">
        <dt className="text-muted">Customer</dt>
        <dd className="text-text">{q.customerName}</dd>
        <dt className="text-muted">Vehicle</dt>
        <dd className="text-text">{[q.registration, q.vehicle].filter(Boolean).join(", ") || "Not recorded"}</dd>
        <dt className="text-muted">Agreed work</dt>
        <dd className="text-text">{q.customerJobDescription || q.job}</dd>
        <dt className="text-muted">Quoted</dt>
        <dd className="font-semibold text-text tabular-nums">{formatPounds(q.amountPence)}</dd>
      </dl>
      <Field id="book-when" label="Booking date and time" error={errors.startAt}>
        <input id="book-when" type="datetime-local" autoFocus value={when} onChange={(e) => setWhen(e.target.value)} aria-invalid={!!errors.startAt} className={`${inputClass(errors.startAt)} tabular-nums`} />
      </Field>
      <Field id="book-duration" label="Estimated duration (hours)" optional error={errors.durationMins}>
        <input id="book-duration" inputMode="decimal" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 2.5" className={`${inputClass(errors.durationMins)} w-32 tabular-nums`} />
      </Field>
      <Field id="book-notes" label="Internal job notes" optional hint="Only staff see these." error={errors.notes}>
        <textarea id="book-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass(errors.notes)} />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-text">Customer acceptance</legend>
        <label className="flex min-h-11 items-start gap-3 text-sm text-text">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 h-4 w-4 accent-accent" />
          The customer accepted this quote at {formatPounds(q.amountPence)}
        </label>
        <label htmlFor="book-how" className="block text-xs text-muted">How they accepted (optional)</label>
        <input id="book-how" value={how} onChange={(e) => setHow(e.target.value)} placeholder="e.g. by phone, replied YES by text" className={inputClass()} />
        {errors.customerConfirmation && <p className="text-xs font-medium text-danger">{errors.customerConfirmation}</p>}
      </fieldset>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <InlineFeedback feedback={save.feedback?.ok ? null : save.feedback} />
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.pending} aria-busy={save.pending}>{save.pending ? "Saving…" : "Book job"}</Button>
      </div>
    </form>
  );
}
