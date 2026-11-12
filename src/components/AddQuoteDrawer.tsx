"use client";

import { useEffect, useRef, useState } from "react";
import { generateQuoteRef, normaliseRegistration, QuoteValidationError, validateQuoteInput, type FieldErrors, type QuoteInput } from "@/domain/intake";
import { fromLondonInput, toLondonInput } from "@/domain/time";
import type { Quote } from "@/domain/types";
import { useAction, useDemo } from "@/demo/store";
import { Button, Field, Icon, InlineFeedback, inputClass, Plate } from "./ui";

type Form = Omit<QuoteInput, "sentAt"> & { sentLocal: string | null }; // null = "now" (follows the clock until edited)

const EMPTY: Form = {
  customerName: "", phone: "", reference: "", job: "", customerJob: "", price: "", vehicle: "", registration: "",
  sentLocal: null, smsEligible: false, evidenceRef: "",
};

/**
 * Right-side drawer (full screen on mobile) for a quote the garage has already sent.
 * Stays mounted while closed so a half-filled form survives closing it or a failed save.
 */
export function AddQuoteDrawer({ open, onClose, onSaved, onShowExisting }: {
  open: boolean;
  onClose: () => void;
  onSaved: (q: Quote) => void;
  onShowExisting: (quoteId: string) => void;
}) {
  const { state, garageId, addQuote } = useDemo();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [tried, setTried] = useState(false);
  const save = useAction();
  const first = useRef<HTMLInputElement>(null);

  const sentLocal = form.sentLocal ?? toLondonInput(state.now);
  const toInput = (f: Form): QuoteInput => ({ ...f, sentAt: fromLondonInput(f.sentLocal ?? toLondonInput(state.now)) });

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    const next = { ...form, [key]: value };
    setForm(next);
    if (tried) setErrors(validateQuoteInput(state, garageId, toInput(next))); // live re-check only after a first attempt
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    save.run(
      () => {
        const errs = validateQuoteInput(state, garageId, toInput(form));
        setErrors(errs);
        if (Object.keys(errs).length) {
          // Take staff straight to the first problem (it may be below the fold).
          const firstBad = (["customerName", "phone", "job", "price", "reference", "sentAt", "evidenceRef"] as const).find((k) => errs[k]);
          requestAnimationFrame(() => document.getElementById(`aq-${firstBad}`)?.focus());
          throw new QuoteValidationError(errs);
        }
        const q = addQuote(toInput(form));
        setForm(EMPTY);
        setErrors({});
        setTried(false);
        onSaved(q);
      },
      "Saved",
    );
  };

  const field = (key: keyof FieldErrors & keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> & { hint?: string; optional?: boolean } = {}) => {
    const { hint, optional, ...rest } = props;
    const err = errors[key];
    return (
      <Field id={`aq-${key}`} label={label} hint={hint} error={err} optional={optional}>
        <input
          id={`aq-${key}`}
          className={inputClass(err)}
          value={form[key] as string}
          onChange={(e) => set(key, e.target.value)}
          aria-invalid={!!err}
          aria-describedby={err ? `aq-${key}-error` : hint ? `aq-${key}-hint` : undefined}
          {...rest}
        />
      </Field>
    );
  };

  return (
    <aside
      hidden={!open}
      aria-labelledby="add-quote-title"
      className="drawer-in fixed inset-0 z-40 flex flex-col bg-white lg:top-[86px] lg:left-auto lg:w-[480px] lg:border-l lg:border-steel-line lg:shadow-xl lg:shadow-graphite/10"
    >
      <div className="flex items-start justify-between gap-3 bg-graphite px-5 pt-4 pb-5 text-white">
        <div>
          <h2 id="add-quote-title" className="text-2xl font-bold [font-stretch:115%]">Add a quote</h2>
          <p className="mt-1 text-sm text-steel">For a quote the garage has already sent the customer.</p>
        </div>
        <Button size="sm" variant="onDark" className="ring-0" onClick={onClose} aria-label="Close add quote"><Icon name="close" /></Button>
      </div>

      <form noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5">
          <p className="rounded-md border border-dashed border-steel px-3 py-2 text-xs text-slate-600">
            Demo mode: use sample details only, such as a made-up name and an 07700 900xxx number. Quotes are saved in this browser.
          </p>

          <fieldset className="space-y-4">
            <legend className="mb-3 text-sm font-semibold text-ink">Customer</legend>
            <Field id="aq-customerName" label="Customer name" error={errors.customerName}>
              <input
                ref={first}
                id="aq-customerName"
                className={inputClass(errors.customerName)}
                value={form.customerName}
                onChange={(e) => set("customerName", e.target.value)}
                autoComplete="off"
                aria-invalid={!!errors.customerName}
                aria-describedby={errors.customerName ? "aq-customerName-error" : undefined}
              />
            </Field>
            {field("phone", "Mobile number", { type: "tel", inputMode: "tel", autoComplete: "off", placeholder: "07700 900123", hint: "UK mobile. 07 or +44 7 both work." })}
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-3 text-sm font-semibold text-ink">The quote</legend>
            <Field id="aq-job" label="Job description" error={errors.job}>
              <textarea
                id="aq-job"
                rows={2}
                placeholder="Front brake pads and discs"
                className={`${inputClass(errors.job)} resize-y`}
                value={form.job}
                onChange={(e) => set("job", e.target.value)}
                aria-invalid={!!errors.job}
                aria-describedby={errors.job ? "aq-job-error" : undefined}
              />
            </Field>
            {field("customerJob", "Wording for texts", { optional: true, maxLength: 80, placeholder: "front brake pads", hint: "Use this if the description has internal notes or shorthand. Texts say this instead." })}
            <Field id="aq-price" label="Quoted price" hint="Total including VAT, as quoted to the customer." error={errors.price}>
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-500">£</span>
                <input
                  id="aq-price"
                  inputMode="decimal"
                  placeholder="340.00"
                  className={`${inputClass(errors.price)} pl-7 tabular-nums`}
                  value={form.price}
                  onChange={(e) => set("price", e.target.value)}
                  aria-invalid={!!errors.price}
                  aria-describedby={errors.price ? "aq-price-error" : "aq-price-hint"}
                />
              </div>
            </Field>
            <div>
              {field("reference", "Quote reference", { optional: true, placeholder: generateQuoteRef(state, garageId), hint: `Leave blank to use ${generateQuoteRef(state, garageId)}.` })}
              {errors.duplicateOf && (
                <button type="button" className="mt-1 text-xs font-medium text-signal underline underline-offset-2 hover:text-signal-deep" onClick={() => onShowExisting(errors.duplicateOf!)}>
                  Open the existing quote
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field("vehicle", "Vehicle", { optional: true, placeholder: "2016 Ford Fiesta" })}
              <div>
                {field("registration", "Registration", { optional: true, placeholder: "AB12 CDE", className: `${inputClass(errors.registration)} uppercase` })}
                {form.registration.trim() && (
                  <div className="mt-2"><Plate reg={normaliseRegistration(form.registration)} /></div>
                )}
              </div>
            </div>
            <Field id="aq-sentAt" label="Date sent" hint="UK time. Defaults to now." error={errors.sentAt}>
              <input
                id="aq-sentAt"
                type="datetime-local"
                className={`${inputClass(errors.sentAt)} tabular-nums`}
                value={sentLocal}
                max={toLondonInput(state.now)}
                onChange={(e) => set("sentLocal", e.target.value)}
                aria-invalid={!!errors.sentAt}
                aria-describedby={errors.sentAt ? "aq-sentAt-error" : "aq-sentAt-hint"}
              />
            </Field>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm font-semibold text-ink">SMS follow-up</legend>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-signal" checked={form.smsEligible} onChange={(e) => set("smsEligible", e.target.checked)} />
              <span>
                Customer agreed to SMS follow-ups
                <span className="block text-xs text-slate-500">Leave off to save the quote without any follow-up texts.</span>
              </span>
            </label>
            {form.smsEligible && field("evidenceRef", "Where was consent recorded?", { placeholder: "Job card 4411, SMS box ticked", hint: "Kept as the evidence reference for this quote." })}
          </fieldset>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-steel-line bg-work px-5 py-3">
          <InlineFeedback feedback={save.feedback?.ok ? null : save.feedback} />
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={save.pending} aria-busy={save.pending}>
            {save.pending ? "Saving…" : "Save quote"}
          </Button>
        </div>
      </form>
    </aside>
  );
}
