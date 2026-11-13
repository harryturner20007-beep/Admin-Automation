"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import {
  cancelJob,
  completeJob,
  completionErrors,
  invoiceForJob,
  JOB_STATUS_LABEL,
  JOB_TABS,
  jobChanges,
  jobInTab,
  jobNextAction,
  quotesAwaitingJob,
  rescheduleJob,
  startJob,
  type JobTab,
} from "@/domain/jobs";
import { lineTotal, totals } from "@/domain/money";
import { formatLondon, fromLondonInput, toLondonInput, ukDate } from "@/domain/time";
import type { Job, JobStatus } from "@/domain/types";
import { useAction, useDemo } from "@/demo/store";
import { PanelSection, SidePanel } from "./SidePanel";
import { BookJobForm } from "./BookJobForm";
import { Button, Field, Icon, InlineFeedback, inputClass, PlateLabel, StatusLabel, type StatusTone } from "./ui";
import { chargesFromDraft, ChargesEditor, draftFromCharges, money, Progress, TotalsTable, type ChargesDraft } from "./workflow";

const TONE: Record<JobStatus, StatusTone> = { booked: "neutral", in_progress: "attention", completed: "success", cancelled: "neutral" };
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export function JobsView() {
  const { state, garageId, staff, act } = useDemo();
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tab = (JOB_TABS.find((t) => t.id === params.get("tab"))?.id ?? "today") as JobTab;
  const selected = params.get("job");
  const [term, setTerm] = useState(params.get("q") ?? "");
  const start = useAction();

  // Filters and the open job live in the URL, so back/forward and links keep the user's place.
  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
      router.replace(`${path}?${next.toString()}`, { scroll: false });
    },
    [params, path, router],
  );

  const jobs = state.jobs.filter((j) => j.garageId === garageId);
  const awaiting = quotesAwaitingJob(state, garageId);
  const bookingQuote = awaiting.find((q) => q.id === params.get("quote"));
  const quote = (j: Job) => state.quotes.find((q) => q.id === j.quoteId)!;
  const matches = (j: Job) => {
    const t = squash(term);
    const q = quote(j);
    return !t || [q.customerName, q.registration ?? "", j.number, q.job].some((v) => squash(v).includes(t));
  };
  const shown = jobs
    .filter((j) => jobInTab(state, j, tab) && matches(j))
    .sort((a, b) => (tab === "completed" || tab === "cancelled" ? b.startAt.localeCompare(a.startAt) : a.startAt.localeCompare(b.startAt)));
  const count = (t: JobTab) => jobs.filter((j) => jobInTab(state, j, t)).length;
  const open = (j: Job) => setParams({ job: j.id, quote: null });
  const job = jobs.find((j) => j.id === selected);

  const rowAction = (j: Job) => {
    const a = jobNextAction(state, j);
    if (a.id === "start") return start.run(() => act((s) => startJob(s, j.id, staff)), "Started");
    if (a.id === "invoice") return router.push(`/invoices?invoice=${invoiceForJob(state, j.id)!.id}`);
    setParams({ job: j.id, mode: a.id === "complete" ? "complete" : null });
  };

  return (
    <div className="desk:flex desk:items-start">
      <div className="min-w-0 flex-1 p-4 md:p-8">
        <h1 className="text-[28px] leading-tight font-[650] text-text">Jobs</h1>
        <p className="mt-1 text-sm text-muted">Booked work from accepted quotes. Start a job when the car is in, then complete it to create the invoice.</p>

        {awaiting.length > 0 && (
          <section aria-labelledby="awaiting-jobs-title" className="mt-6 rounded-xl border border-line bg-white p-4">
            <h2 id="awaiting-jobs-title" className="text-lg font-semibold text-text">Booked quotes to schedule <span className="tabular-nums">({awaiting.length})</span></h2>
            <p className="mt-1 text-sm text-muted">Choose a date and time to add each accepted quote to the job list and calendar.</p>
            <ul className="mt-4 divide-y divide-line">
              {awaiting.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div>
                    <PlateLabel reg={q.registration} />
                    <p className="mt-1 text-sm font-medium text-text">{q.customerName}</p>
                    <p className="text-sm text-muted">{q.customerJobDescription || q.job}</p>
                  </div>
                  <Button onClick={() => setParams({ quote: q.id, job: null, mode: null })} aria-label={`Schedule job for ${q.customerName}`}>Schedule job</Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div role="tablist" aria-label="Jobs" className="mt-6 flex gap-1 overflow-x-auto border-b border-line">
          {JOB_TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setParams({ tab: t.id === "today" ? null : t.id })}
              className={`-mb-px min-h-11 shrink-0 border-b-2 px-3 text-sm font-medium transition-colors duration-150 ${focusRing} ${tab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-text"}`}
            >
              {t.label} <span className="tabular-nums">({count(t.id)})</span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor="job-search" className="sr-only">Search jobs</label>
          <div className="relative w-full md:w-80">
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="job-search"
              type="search"
              value={term}
              placeholder="Customer, registration or job no."
              onChange={(e) => {
                setTerm(e.target.value);
                setParams({ q: e.target.value || null });
              }}
              className={`${inputClass()} pl-9`}
            />
          </div>
          <InlineFeedback feedback={start.feedback?.ok ? null : start.feedback} />
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
          {shown.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <h2 className="text-lg font-semibold text-text">{term ? "No jobs match" : jobs.length ? `No ${JOB_TABS.find((t) => t.id === tab)!.label.toLowerCase()} jobs` : "No jobs yet"}</h2>
              <p className="mt-1 text-sm text-muted">{term ? "Try a different name, registration or job number." : jobs.length ? "Try another tab." : "Book an accepted quote in from the Quotes page and it appears here."}</p>
              {term ? (
                <Button className="mt-4" onClick={() => { setTerm(""); setParams({ q: null }); }}>Clear search</Button>
              ) : !jobs.length ? (
                <Link href="/quotes" className="mt-4 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium text-text ring-1 ring-line ring-inset hover:bg-canvas">Go to Quotes</Link>
              ) : null}
            </div>
          ) : (
            <>
              {/* Desktop and tablet table */}
              <table className="hidden w-full text-sm md:table">
                <thead className="border-b border-line text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">Customer &amp; vehicle</th>
                    <th scope="col" className="px-4 py-2 font-medium">Work</th>
                    <th scope="col" className="px-4 py-2 font-medium">Booked</th>
                    <th scope="col" className="px-4 py-2 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((j) => {
                    const q = quote(j);
                    const a = jobNextAction(state, j);
                    const isSel = j.id === selected;
                    return (
                      <tr key={j.id} className={`h-20 ${isSel ? "bg-selected shadow-[inset_3px_0_0_var(--color-accent)]" : "hover:bg-canvas"}`}>
                        <td className="px-4 py-2">
                          <button onClick={() => open(j)} className={`text-left ${focusRing}`} aria-label={`Open ${j.number}, ${q.customerName}`}>
                            <PlateLabel reg={q.registration} />
                            <span className="mt-1 block font-medium text-text">{q.customerName}</span>
                          </button>
                        </td>
                        <td className="max-w-64 px-4 py-2 text-text"><span className="line-clamp-2">{q.customerJobDescription || q.job}</span><span className="text-xs text-muted">{j.number}</span></td>
                        <td className="px-4 py-2 text-text tabular-nums whitespace-nowrap">{formatLondon(j.startAt)}</td>
                        <td className="px-4 py-2"><StatusLabel tone={TONE[j.status]}>{JOB_STATUS_LABEL[j.status]}</StatusLabel></td>
                        <td className="px-4 py-2 text-right">
                          <Button size="sm" variant={a.id === "view" ? "ghost" : "primary"} disabled={start.pending} onClick={() => rowAction(j)}>{a.label}</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Phone cards */}
              <ul className="divide-y divide-line md:hidden">
                {shown.map((j) => {
                  const q = quote(j);
                  const a = jobNextAction(state, j);
                  return (
                    <li key={j.id} className="p-4">
                      <button onClick={() => open(j)} className={`w-full text-left ${focusRing}`}>
                        <span className="flex items-center gap-2">
                          <PlateLabel reg={q.registration} />
                          <StatusLabel tone={TONE[j.status]}>{JOB_STATUS_LABEL[j.status]}</StatusLabel>
                        </span>
                        <span className="mt-1 block font-medium text-text">{q.customerName}</span>
                        <span className="block text-sm text-muted">{q.customerJobDescription || q.job}</span>
                        <span className="block text-sm text-text tabular-nums">{formatLondon(j.startAt)}</span>
                      </button>
                      <Button size="sm" variant={a.id === "view" ? "secondary" : "primary"} className="mt-2 w-full" onClick={() => rowAction(j)}>{a.label}</Button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
      {job && <JobPanel key={job.id} job={job} mode={params.get("mode")} setMode={(m) => setParams({ mode: m })} onClose={() => setParams({ job: null, mode: null })} />}
      {!job && bookingQuote && (
        <SidePanel id="schedule-job" reg={bookingQuote.registration} title={`Schedule ${bookingQuote.customerName}`} onClose={() => setParams({ quote: null })}>
          <div className="p-6">
            <BookJobForm key={bookingQuote.id} q={bookingQuote} goToJob onCancel={() => setParams({ quote: null })} />
          </div>
        </SidePanel>
      )}
    </div>
  );
}

function JobPanel({ job, mode, setMode, onClose }: { job: Job; mode: string | null; setMode: (m: string | null) => void; onClose: () => void }) {
  const { state, staff, act } = useDemo();
  const router = useRouter();
  const q = state.quotes.find((x) => x.id === job.quoteId)!;
  const inv = invoiceForJob(state, job.id);
  const primary = useAction();
  const open = job.status === "booked" || job.status === "in_progress";
  const history = state.events.filter((e) => e.quoteId === q.id).sort((a, b) => b.at.localeCompare(a.at));

  if (mode === "complete" && open) return (
    <SidePanel id="job-panel" reg={q.registration} title={`Complete ${job.number}`} onClose={onClose}>
      <CompletionForm job={job} onCancel={() => setMode(null)} onDone={(invoiceId) => router.push(`/invoices?invoice=${invoiceId}`)} />
    </SidePanel>
  );

  const footer = job.status === "booked" ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <InlineFeedback feedback={primary.feedback?.ok ? null : primary.feedback} />
      <Button variant="primary" data-autofocus disabled={primary.pending} onClick={() => primary.run(() => act((s) => startJob(s, job.id, staff)), "Started")}>Start job</Button>
    </div>
  ) : job.status === "in_progress" ? (
    <div className="flex justify-end"><Button variant="primary" data-autofocus onClick={() => setMode("complete")}>Complete &amp; create invoice</Button></div>
  ) : inv ? (
    <div className="flex justify-end">
      <Link href={`/invoices?invoice=${inv.id}`} className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover">{inv.status === "draft" ? "Review invoice draft" : "View invoice"}</Link>
    </div>
  ) : undefined;

  return (
    <SidePanel id="job-panel" reg={q.registration} title={`${q.customerName} · ${job.number}`} onClose={onClose} footer={footer}>
      <div className="space-y-3 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusLabel tone={TONE[job.status]}>{JOB_STATUS_LABEL[job.status]}</StatusLabel>
          {inv && <span className="text-xs text-muted">Invoice: {inv.status === "draft" ? "draft, not issued" : inv.status === "unpaid" ? `${inv.number}, unpaid` : `${inv.number}, ${inv.status}`}</span>}
        </div>
        <Progress state={state} quoteId={q.id} here="job" />
        {open && <Link href={`/calendar?date=${ukDate(job.startAt)}`} className={`inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-2 ${focusRing}`}>View in calendar</Link>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Booked</dt>
          <dd className="text-text tabular-nums">{formatLondon(job.startAt)}{job.durationMins ? ` · about ${job.durationMins / 60} h` : ""}</dd>
          <dt className="text-muted">Vehicle</dt>
          <dd className="text-text">{q.vehicle || "Not recorded"}</dd>
          <dt className="text-muted">Phone</dt>
          <dd><a href={`tel:${q.phone}`} className="text-accent underline underline-offset-2">{q.phone}</a></dd>
          {job.cancelReason && (<><dt className="text-muted">Cancelled</dt><dd className="text-text">{job.cancelReason}</dd></>)}
        </dl>
        {job.notes && <p className="rounded-lg bg-canvas px-3 py-2 text-sm whitespace-pre-line text-text">{job.notes}</p>}
      </div>

      <PanelSection title="Accepted work">
        {job.accepted.vatRatePercent > 0 && <p className="mb-1 text-xs text-muted">Line prices exclude VAT; the total includes it.</p>}
        <LinesList lines={job.accepted.lines} />
        <p className="mt-2 text-sm text-text">Accepted total <span className="font-semibold tabular-nums">{money(job.accepted.totalPence)}</span></p>
        <p className="mt-1 text-xs text-muted">{job.accepted.customerConfirmation} · recorded by {job.accepted.acceptedBy}, {formatLondon(job.accepted.acceptedAt)}</p>
      </PanelSection>

      {job.final && (
        <PanelSection title="Final charges">
          <LinesList lines={job.final.lines} />
          <TotalsTable t={totals(job.final)} vatRatePercent={job.final.vatRatePercent} />
          <Changes job={job} />
          {job.final.extraWorkReason && <p className="mt-2 text-sm text-text">Extra work: {job.final.extraWorkReason}. Authorised: {job.final.extraWorkAuthorisation}</p>}
          {job.final.completionNotes && <p className="mt-2 text-sm text-muted">{job.final.completionNotes}</p>}
        </PanelSection>
      )}

      {open && (
        <PanelSection title="Change booking">
          <Reschedule job={job} />
          <CancelJob job={job} />
        </PanelSection>
      )}

      <PanelSection title="History">
        <ol className="space-y-2 text-sm">
          {history.map((e) => (
            <li key={e.id}><span className="text-xs text-muted tabular-nums">{formatLondon(e.at)}</span><span className="block text-text">{e.text}</span></li>
          ))}
        </ol>
      </PanelSection>
    </SidePanel>
  );
}

function LinesList({ lines }: { lines: Job["accepted"]["lines"] }) {
  return (
    <ul className="divide-y divide-line text-sm">
      {lines.map((l) => (
        <li key={l.id} className="flex justify-between gap-3 py-1.5">
          <span className="text-text">{l.description}{l.quantity !== 1 && <span className="text-muted"> × {l.quantity}</span>}</span>
          <span className="text-text tabular-nums">{money(lineTotal(l))}</span>
        </li>
      ))}
    </ul>
  );
}

function Changes({ job, final }: { job: Job; final?: Job["accepted"] | ReturnType<typeof chargesFromDraft> }) {
  const f = final ?? job.final;
  if (!f) return null;
  const c = jobChanges(job.accepted, f);
  const diff = c.toPence - job.accepted.totalPence;
  if (!c.lines.length && !diff) return <p className="mt-2 text-xs text-muted">Same as the accepted quote.</p>;
  return (
    <div className="mt-3 rounded-lg border border-line p-3 text-sm" aria-live="polite">
      <p className={`font-medium ${diff > 0 ? "text-attention" : "text-text"}`}>
        {diff === 0 ? "Same total as the accepted quote" : `${money(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than the accepted ${money(job.accepted.totalPence)}`}
      </p>
      <ul className="mt-1 space-y-0.5 text-xs text-muted">
        {c.lines.map((x, i) => (
          <li key={i}>{x.kind === "added" ? "Added" : x.kind === "removed" ? "Removed" : "Changed"}: {x.description}{x.kind === "changed" ? ` (${money(x.fromPence!)} → ${money(x.toPence!)})` : ""}</li>
        ))}
      </ul>
    </div>
  );
}

function Reschedule({ job }: { job: Job }) {
  const { staff, act } = useDemo();
  const [when, setWhen] = useState(toLondonInput(job.startAt));
  const [reason, setReason] = useState("");
  const save = useAction();
  return (
    <div className="space-y-2">
      <Field id="resched-when" label="New date and time">
        <input id="resched-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={`${inputClass()} tabular-nums`} />
      </Field>
      <Field id="resched-reason" label="Reason" optional>
        <input id="resched-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass()} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={save.pending} onClick={() => save.run(() => act((s) => rescheduleJob(s, job.id, fromLondonInput(when), job.durationMins, reason, staff)), "Rescheduled")}>Reschedule</Button>
        <InlineFeedback feedback={save.feedback} />
      </div>
    </div>
  );
}

function CancelJob({ job }: { job: Job }) {
  const { staff, act } = useDemo();
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  const save = useAction();
  if (!asking) return <Button size="sm" variant="ghost" className="mt-4 text-danger" onClick={() => setAsking(true)}>Cancel job…</Button>;
  return (
    <div className="mt-4 space-y-2 rounded-lg border border-danger/30 p-3">
      <Field id="cancel-reason" label="Why is the job cancelled?">
        <input id="cancel-reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass()} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="danger" disabled={save.pending} onClick={() => save.run(() => act((s) => cancelJob(s, job.id, reason, staff)), "Job cancelled")}>Cancel job</Button>
        <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>Keep job</Button>
        <InlineFeedback feedback={save.feedback} />
      </div>
    </div>
  );
}

/** Final parts and labour, prefilled from the accepted work. Typed values survive a failed save. */
function CompletionForm({ job, onCancel, onDone }: { job: Job; onCancel: () => void; onDone: (invoiceId: string) => void }) {
  const { staff, act } = useDemo();
  const [draft, setDraft] = useState<ChargesDraft>(() => draftFromCharges(job.accepted));
  const [reason, setReason] = useState("");
  const [auth, setAuth] = useState("");
  const [notes, setNotes] = useState("");
  const save = useAction();
  const charges = chargesFromDraft(draft);
  const input = { ...charges, extraWorkReason: reason, extraWorkAuthorisation: auth, completionNotes: notes };
  const errors = completionErrors(job, input);
  const more = errors.length === 0 || !errors.some((e) => e.startsWith("Line")) ? totals(charges).totalPence > job.accepted.totalPence : false;
  return (
    <form
      className="space-y-5 px-6 py-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.run(() => {
          let id = "";
          act((s) => {
            id = completeJob(s, job.id, input, staff).id;
          });
          onDone(id);
        }, "Completed. Invoice draft created.");
      }}
    >
      <p className="text-sm text-muted">Check the final work. The invoice draft is filled in from these lines.</p>
      <ChargesEditor value={draft} onChange={setDraft} idPrefix="final" />
      <Changes job={job} final={{ ...job.accepted, ...charges }} />
      {more && (
        <fieldset className="space-y-3 rounded-lg border border-attention/40 bg-attention-bg p-3">
          <legend className="px-1 text-sm font-medium text-attention">Additional work</legend>
          <Field id="extra-reason" label="Why the price changed"><input id="extra-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass()} /></Field>
          <Field id="extra-auth" label="How the customer authorised it" hint="e.g. agreed by phone at 14:10 (Mia)"><input id="extra-auth" value={auth} onChange={(e) => setAuth(e.target.value)} className={inputClass()} /></Field>
        </fieldset>
      )}
      <Field id="completion-notes" label="Completion notes" optional hint="Staff only. Advisories go on the invoice notes later.">
        <textarea id="completion-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass()} />
      </Field>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <InlineFeedback feedback={save.feedback?.ok ? null : save.feedback} />
        <Button type="button" variant="ghost" onClick={onCancel}>Back</Button>
        <Button type="submit" variant="primary" disabled={save.pending}>{save.pending ? "Saving…" : "Complete & create invoice"}</Button>
      </div>
    </form>
  );
}
