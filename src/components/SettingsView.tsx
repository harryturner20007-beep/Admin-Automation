"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { stepWindow } from "@/domain/schedule";
import { previewScheduleChanges, validateSettings, type SettingsErrors, type SettingsInput } from "@/domain/settings";
import { renderSms, SAMPLE_QUOTES, smsParts, TEMPLATE_FIELDS, templateValues } from "@/domain/templates";
import { formatLondon } from "@/domain/time";
import type { FollowUpMode, Weekday } from "@/domain/types";
import { useAction, useDemo } from "@/demo/store";
import { Button, Icon, InlineFeedback, inputClass } from "./ui";

const MODES: { id: FollowUpMode; title: string; body: string }[] = [
  { id: "off", title: "Off", body: "Nothing is scheduled or sent." },
  { id: "draft", title: "Draft for approval", body: "Each text is written at its send time and waits for staff to approve it." },
  { id: "automatic", title: "Automatic", body: "Eligible quotes get the saved text at the set time, with no per-message approval." },
];

const DAY_NAMES: Record<Weekday, string> = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun" };

function TemplateEditor({ id, value, onChange, error }: { id: string; value: string; onChange: (v: string) => void; error?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (key: string) => {
    const el = ref.current;
    const token = `{{${key}}}`;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Insert a field">
        {TEMPLATE_FIELDS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => insert(f.key)}
            className="rounded border border-steel-line bg-white px-2 py-0.5 text-xs text-slate-700 transition-colors hover:border-signal hover:text-signal focus-visible:outline-2 focus-visible:outline-signal"
            title={`Insert {{${f.key}}}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        id={id}
        rows={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass(error)} leading-relaxed`}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && <p id={`${id}-error`} className="mt-1 text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}

export function SettingsView() {
  const { state, garageId, saveSettings, notify } = useDemo();
  const garage = state.garages.find((g) => g.id === garageId)!;
  const tpl = (step: 1 | 2) => state.templates.find((t) => t.garageId === garageId && t.step === step)?.body ?? "";
  const [form, setForm] = useState<SettingsInput>(() => ({
    mode: garage.mode,
    followUps: structuredClone(garage.followUps),
    templates: { 1: tpl(1), 2: tpl(2) },
  }));
  const [tried, setTried] = useState(false);
  const [previewWith, setPreviewWith] = useState<string>("sample");
  const [previewStep, setPreviewStep] = useState<1 | 2>(1);
  const save = useAction();

  const errors: SettingsErrors = tried ? validateSettings(form) : {};
  const setFollowUp = (i: 0 | 1, patch: Partial<SettingsInput["followUps"][0]>) =>
    setForm((f) => {
      const followUps = structuredClone(f.followUps);
      Object.assign(followUps[i], patch);
      return { ...f, followUps };
    });

  const openQuotes = state.quotes.filter((q) => q.garageId === garageId && q.status === "open");
  const previewQuote =
    previewWith === "sample" || previewWith === "sampleNoVehicle"
      ? SAMPLE_QUOTES[previewWith]
      : state.quotes.find((q) => q.id === previewWith)!;
  const step = previewStep === 2 && !form.followUps[1].enabled ? 1 : previewStep;
  const rendered = renderSms(form.templates[step], templateValues(previewQuote, garage));
  const realQuote = state.quotes.find((q) => q.id === previewWith);
  const nextAt = realQuote ? stepWindow(realQuote, { ...garage, followUps: form.followUps }, step)?.windowStart : undefined;

  const valid = Object.keys(validateSettings(form)).length === 0;
  const { changes, alreadySent } = valid ? previewScheduleChanges(state, garageId, form) : { changes: [], alreadySent: 0 };
  const dirty =
    form.mode !== garage.mode || JSON.stringify(form.followUps) !== JSON.stringify(garage.followUps) || form.templates[1] !== tpl(1) || form.templates[2] !== tpl(2);

  // "Mon–Fri 08:30–17:30, Sat 09:00–12:00": consecutive days with the same hours share one range.
  const hours = (() => {
    const days = ([1, 2, 3, 4, 5, 6, 7] as Weekday[]).filter((d) => garage.hours[d]);
    const groups: { from: Weekday; to: Weekday; span: string }[] = [];
    for (const d of days) {
      const span = `${garage.hours[d]!.open}–${garage.hours[d]!.close}`;
      const last = groups[groups.length - 1];
      if (last && last.span === span && last.to === d - 1) last.to = d;
      else groups.push({ from: d, to: d, span });
    }
    return groups.map((g) => `${DAY_NAMES[g.from]}${g.to !== g.from ? `–${DAY_NAMES[g.to]}` : ""} ${g.span}`).join(", ");
  })();

  const onSave = () => {
    setTried(true);
    save.run(() => {
      const errs = validateSettings(form);
      if (Object.keys(errs).length) throw new Error("check the highlighted settings");
      const moved = saveSettings(form);
      notify(`Follow-up settings saved. ${moved.length ? `${moved.length} unsent follow-up${moved.length === 1 ? "" : "s"} moved.` : "No scheduled follow-ups moved."}`);
    }, "Saved");
  };

  const followUpCard = (i: 0 | 1) => {
    const n = (i + 1) as 1 | 2;
    const fu = form.followUps[i];
    const off = i === 1 && !fu.enabled;
    return (
      <section aria-labelledby={`fu${n}-title`} className="rounded-md border border-steel-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-steel-line/70 px-5 py-3.5">
          <h2 id={`fu${n}-title`} className="text-base font-semibold text-ink [font-stretch:110%]">Follow-up {n}</h2>
          {i === 1 && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 accent-signal" checked={fu.enabled} onChange={(e) => setFollowUp(1, { enabled: e.target.checked })} />
              Send a second follow-up
            </label>
          )}
        </div>
        {off ? (
          <p className="px-5 py-4 text-sm text-slate-600">Off. Quotes get one follow-up only.</p>
        ) : (
          <div className="space-y-4 px-5 py-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor={`days${n}`} className="mb-1 block text-sm font-medium text-ink">Business days after the quote</label>
                <input
                  id={`days${n}`}
                  type="number"
                  min={1}
                  max={20}
                  value={fu.businessDays}
                  onChange={(e) => setFollowUp(i, { businessDays: Number(e.target.value) })}
                  className={`${inputClass(errors[`days${n}` as const])} w-28 tabular-nums`}
                  aria-invalid={!!errors[`days${n}` as const]}
                />
              </div>
              <div>
                <label htmlFor={`time${n}`} className="mb-1 block text-sm font-medium text-ink">Send time (UK)</label>
                <input
                  id={`time${n}`}
                  type="time"
                  step={900}
                  value={fu.sendTime}
                  onChange={(e) => setFollowUp(i, { sendTime: e.target.value })}
                  className={`${inputClass(errors[`time${n}` as const])} w-32 tabular-nums`}
                  aria-invalid={!!errors[`time${n}` as const]}
                />
              </div>
            </div>
            {(errors[`days${n}` as const] || errors[`time${n}` as const]) && (
              <p className="text-xs font-medium text-red-700">{errors[`days${n}` as const] ?? errors[`time${n}` as const]}</p>
            )}
            <div>
              <label htmlFor={`tpl${n}`} className="mb-1 block text-sm font-medium text-ink">Message</label>
              <TemplateEditor
                id={`tpl${n}`}
                value={form.templates[n]}
                onChange={(v) => setForm((f) => ({ ...f, templates: { ...f.templates, [n]: v } }))}
                error={errors[`template${n}` as const]}
              />
            </div>
          </div>
        )}
      </section>
    );
  };

  return (
    <>
      <section aria-labelledby="settings-title" className="mx-4 mt-4 rounded-2xl bg-navy/90 text-white shadow-card md:mx-8">
        <div className="mx-auto max-w-6xl px-4 pt-6 pb-7 sm:pt-10">
          <Link href="/quotes" className="inline-flex items-center gap-1 text-sm text-steel hover:text-white focus-visible:outline-2 focus-visible:outline-signal">
            <Icon name="back" className="h-3.5 w-3.5" /> Quotes
          </Link>
          <h1 id="settings-title" className="mt-3 text-[clamp(2rem,5vw,3.5rem)] leading-[0.95] font-extrabold tracking-[-0.02em] [font-stretch:125%]">Follow-up settings</h1>
          <p className="mt-3 max-w-[62ch] text-steel">
            For <span className="text-white">{garage.name}</span> only. Texts go out on business days, inside opening hours ({hours}).
          </p>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <fieldset className="rounded-md border border-steel-line bg-white">
            <legend className="sr-only">Mode</legend>
            <div className="grid divide-y divide-steel-line/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {MODES.map((m) => {
                const on = form.mode === m.id;
                return (
                  <label key={m.id} className={`relative flex cursor-pointer flex-col gap-1 px-4 py-3.5 transition-colors ${on ? "bg-signal/[0.06]" : "hover:bg-work"}`}>
                    {on && <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-signal" />}
                    <span className="flex items-center gap-2">
                      <input type="radio" name="mode" className="h-4 w-4 accent-signal" checked={on} onChange={() => setForm((f) => ({ ...f, mode: m.id }))} />
                      <span className="font-semibold text-ink">{m.title}</span>
                    </span>
                    <span className="text-xs text-slate-600">{m.body}</span>
                    {m.id === "automatic" && <span className="mt-1 w-fit rounded border border-dashed border-steel px-1.5 py-0.5 text-[11px] text-slate-600">Simulated sending in demo mode</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {followUpCard(0)}
          {followUpCard(1)}

          {/* What a save would change: shown before saving, never after the fact. */}
          <section aria-labelledby="moves-title" className="rounded-md border border-steel-line bg-white px-5 py-4">
            <h2 id="moves-title" className="text-base font-semibold text-ink [font-stretch:110%]">
              {changes.length ? `${changes.length} unsent follow-up${changes.length === 1 ? "" : "s"} will move` : "No scheduled follow-ups will move"}
            </h2>
            {changes.length > 0 && (
              <ul className="mt-2 divide-y divide-steel-line/70 text-sm">
                {changes.map((c) => (
                  <li key={`${c.quoteId}-${c.step}`} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2">
                    <span className="text-ink">{c.customerName}, follow-up {c.step}</span>
                    <span className="text-slate-600 tabular-nums">
                      {c.from ? formatLondon(c.from) : "not scheduled"} <span aria-hidden>→</span><span className="sr-only">to</span> <span className="font-medium text-ink">{c.to ? formatLondon(c.to) : "won't send"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-500">
              {alreadySent > 0 ? `${alreadySent} follow-up${alreadySent === 1 ? " has" : "s have"} already gone out and won't be sent again.` : "Follow-ups that have already gone out are never sent again."}
            </p>
          </section>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <InlineFeedback feedback={save.feedback?.ok ? null : save.feedback} />
            <Button
              variant="ghost"
              disabled={!dirty || save.pending}
              onClick={() => {
                setForm({ mode: garage.mode, followUps: structuredClone(garage.followUps), templates: { 1: tpl(1), 2: tpl(2) } });
                setTried(false);
              }}
            >
              Discard changes
            </Button>
            <Button variant="primary" disabled={!dirty || save.pending} aria-busy={save.pending} onClick={onSave}>
              {save.pending ? "Saving…" : changes.length ? `Save and move ${changes.length}` : "Save settings"}
            </Button>
          </div>
        </div>

        {/* Live preview */}
        <aside aria-labelledby="preview-title" className="self-start lg:sticky lg:top-[102px]">
          <div className="rounded-md border border-steel-line bg-white">
            <div className="border-b border-steel-line/70 px-4 py-3">
              <h2 id="preview-title" className="text-base font-semibold text-ink [font-stretch:110%]">Preview</h2>
              <label htmlFor="preview-with" className="mt-2 block text-xs text-slate-600">Preview with</label>
              <select id="preview-with" value={previewWith} onChange={(e) => setPreviewWith(e.target.value)} className={`${inputClass()} mt-1`}>
                <option value="sample">Sample: Ben, front brake pads, Ford Fiesta</option>
                <option value="sampleNoVehicle">Sample: Ben, no vehicle on file</option>
                <optgroup label="Open quotes">
                  {openQuotes.map((q) => (
                    <option key={q.id} value={q.id}>{q.customerName}, {q.sourceQuoteId}</option>
                  ))}
                </optgroup>
              </select>
              {form.followUps[1].enabled && (
                <div role="tablist" aria-label="Follow-up to preview" className="mt-3 flex gap-0.5">
                  {([1, 2] as const).map((n) => (
                    <button
                      key={n}
                      role="tab"
                      aria-selected={step === n}
                      onClick={() => setPreviewStep(n)}
                      className={`border-b-2 px-2.5 pb-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-signal ${step === n ? "border-signal text-ink" : "border-transparent text-slate-500 hover:text-ink"}`}
                    >
                      Follow-up {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-work px-4 py-5">
              <div className="mb-1.5 text-xs text-slate-500">To {previewQuote.customerName} from {garage.name}</div>
              <p data-testid="sms-preview" className="max-w-[34ch] rounded-2xl rounded-bl-sm bg-graphite px-3.5 py-2.5 text-[15px] leading-snug text-white">
                {rendered.text.split(/(\{\{[^}]*\}\})/).map((part, k) =>
                  /^\{\{/.test(part) ? <mark key={k} className="rounded bg-red-500/90 px-0.5 text-white">{part}</mark> : <span key={k}>{part}</span>,
                )}
              </p>
              <div className="mt-2 text-xs text-slate-500 tabular-nums">
                {rendered.text.length} characters, {smsParts(rendered.text)} SMS {smsParts(rendered.text) === 1 ? "part" : "parts"}
              </div>
              {rendered.unresolved.length > 0 && (
                <p className="mt-2 text-xs font-medium text-red-700">
                  Won&apos;t send for this quote: {rendered.unresolved.map((f) => `{{${f}}}`).join(", ")} has no value.
                </p>
              )}
              {realQuote && (
                <p className="mt-2 text-xs text-slate-600">
                  {form.mode === "off" ? "Follow-ups are off, so this won't be scheduled." : nextAt ? <>Would {form.mode === "automatic" ? "send" : "be drafted"} <span className="font-medium text-ink tabular-nums">{formatLondon(nextAt)}</span></> : "Not scheduled with these settings."}
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
