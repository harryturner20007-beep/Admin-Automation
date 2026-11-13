"use client";

import { useEffect, useRef, useState } from "react";
import { generateQuoteRef, normaliseRegistration, QuoteValidationError, validateQuoteInput, type FieldErrors, type QuoteInput } from "@/domain/intake";
import { fromLondonInput, toLondonInput } from "@/domain/time";
import type { Quote } from "@/domain/types";
import { useAction, useDemo } from "@/demo/store";
import { Rise } from "./motion";
import { SavedServicePicker } from "./SavedServices";
import { ChargesEditor, chargesFromDraft, type ChargesDraft } from "./workflow";
import { Button, Field, Icon, InlineFeedback, inputClass, PlateLabel } from "./ui";

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

  const vat = state.garages.find((g) => g.id === garageId)!.business.vatRatePercent;
  const emptyDraft = (): ChargesDraft => ({ rows: [{ id: "n0", kind: "labour", description: "", quantity: "1", unit: "" }], discount: "", vat });
  const [itemise, setItemise] = useState(false);
  const [draft, setDraft] = useState<ChargesDraft>(emptyDraft);

  const sentLocal = form.sentLocal ?? toLondonInput(state.now);
  const toInput = (f: Form, it = itemise, d = draft): QuoteInput => ({ ...f, sentAt: fromLondonInput(f.sentLocal ?? toLondonInput(state.now)), charges: it ? chargesFromDraft(d) : undefined });
  const recheck = (it: boolean, d: ChargesDraft) => tried && setErrors(validateQuoteInput(state, garageId, toInput(form, it, d)));

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
          const firstBad = (["customerName", "phone", "job", "price", "charges", "reference", "sentAt", "evidenceRef"] as const).find((k) => errs[k]);
          requestAnimationFrame(() => document.getElementById(`aq-${firstBad}`)?.focus());
          throw new QuoteValidationError(errs);
        }
        const q = addQuote(toInput(form));
        setForm(EMPTY);
        setDraft(emptyDraft());
        setItemise(false);
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
      className="drawer-in fixed inset-0 z-40 flex flex-col bg-white md:left-auto md:w-[480px] md:border-l md:border-line md:shadow-float"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
        <div>
          <h2 id="add-quote-title" className="text-lg font-semibold text-text">Add a quote</h2>
          <p className="mt-1 text-sm text-muted">For a quote the garage has already sent the customer.</p>
        </div>
        <Button size="sm" variant="ghost" className="hover-turn" onClick={onClose} aria-label="Close add quote"><Icon name="close" className="nudge-icon h-4 w-4" /></Button>
      </div>

      <form noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5">
          <p className="rounded-lg border border-dashed border-muted/60 px-3 py-2 text-xs text-muted">
            Demo mode: use sample details only, such as a made-up name and an 07700 900xxx number. Quotes are saved in this browser.
          </p>

          <fieldset className="space-y-4">
            <legend className="mb-3 text-sm font-semibold text-text">Customer</legend>
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
            <legend className="mb-3 text-sm font-semibold text-text">The quote</legend>
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
            <div role="radiogroup" aria-label="How to price the quote" className="grid grid-cols-2 gap-2">
              {([[false, "Total price"], [true, "Labour and parts"]] as const).map(([v, label]) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={itemise === v}
                  onClick={() => { setItemise(v); recheck(v, draft); }}
                  className={`min-h-11 rounded-lg border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${itemise === v ? "border-accent bg-selected text-accent" : "border-line bg-white text-text hover:bg-canvas"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {itemise ? (
              <div id="aq-charges" tabIndex={-1} className="space-y-3">
                <SavedServicePicker id="aq-saved" value={draft} onChange={(d) => { setDraft(d); recheck(true, d); }} />
                <ChargesEditor idPrefix="aq-line" value={draft} onChange={(d) => { setDraft(d); recheck(true, d); }} />
                {errors.charges && <p id="aq-charges-error" role="alert" className="text-xs font-medium text-danger">{errors.charges}</p>}
              </div>
            ) : (
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
            )}
            <div>
              {field("reference", "Quote reference", { optional: true, placeholder: generateQuoteRef(state, garageId), hint: `Leave blank to use ${generateQuoteRef(state, garageId)}.` })}
              {errors.duplicateOf && (
                <button type="button" className="mt-1 text-xs font-medium text-accent underline underline-offset-2 hover:text-accent-hover" onClick={() => onShowExisting(errors.duplicateOf!)}>
                  Open the existing quote
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field("vehicle", "Vehicle", { optional: true, placeholder: "2016 Ford Fiesta" })}
              <div>
                {field("registration", "Registration", { optional: true, placeholder: "AB12 CDE", className: `${inputClass(errors.registration)} uppercase` })}
                {form.registration.trim() && (
                  <Rise className="mt-2"><PlateLabel reg={normaliseRegistration(form.registration)} /></Rise>
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
            <legend className="mb-3 text-sm font-semibold text-text">SMS follow-up</legend>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-text">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-accent" checked={form.smsEligible} onChange={(e) => set("smsEligible", e.target.checked)} />
              <span>
                Customer agreed to SMS follow-ups
                <span className="block text-xs text-slate-500">Leave off to save the quote without any follow-up texts.</span>
              </span>
            </label>
            {form.smsEligible && field("evidenceRef", "Where was consent recorded?", { placeholder: "Job card 4411, SMS box ticked", hint: "Kept as the evidence reference for this quote." })}
          </fieldset>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-line bg-canvas px-6 py-3">
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
