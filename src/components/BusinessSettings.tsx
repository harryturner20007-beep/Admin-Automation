"use client";

import { useState } from "react";
import type { BusinessDetails } from "@/domain/types";
import { businessErrors, setBusinessDetails, type BusinessInput } from "@/domain/workspace";
import { uploadLogo } from "@/server/workspace";
import { useAction, useDemo } from "@/demo/store";
import { InviteColleagueForm } from "./AuthForms";
import { Button, Field, InlineFeedback, inputClass } from "./ui";

const pick = ({ nextInvoiceNumber: _n, currency: _c, ...rest }: BusinessDetails): BusinessInput => rest;

/** Details printed on invoices. Checked against GOV.UK invoice rules and VAT Notice 700 (UK garages). */
export function BusinessSettings() {
  const { state, garageId, staff, act, hosted, role } = useDemo();
  const garage = state.garages.find((g) => g.id === garageId)!;
  const [b, setB] = useState<BusinessInput>(() => pick(garage.business));
  const [errors, setErrors] = useState<ReturnType<typeof businessErrors>>({});
  const save = useAction();
  const logo = useAction();
  const owner = role === "owner";
  const set = (k: keyof BusinessInput) => (e: { target: { value: string } }) => setB({ ...b, [k]: k === "vatRatePercent" || k === "paymentTermsDays" ? Number(e.target.value) : e.target.value });
  const text = (k: keyof BusinessInput, label: string, extra: { hint?: string; optional?: boolean; multiline?: boolean; type?: string } = {}) => (
    <Field id={`biz-${k}`} label={label} hint={extra.hint} optional={extra.optional} error={errors[k]}>
      {extra.multiline ? (
        <textarea id={`biz-${k}`} rows={3} disabled={!owner} value={String(b[k] ?? "")} onChange={set(k)} className={inputClass(errors[k])} />
      ) : (
        <input id={`biz-${k}`} type={extra.type ?? "text"} disabled={!owner} value={String(b[k] ?? "")} onChange={set(k)} className={inputClass(errors[k])} />
      )}
    </Field>
  );

  const onLogo = (file: File | undefined) =>
    logo.run(async () => {
      if (!file) return;
      if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 300_000) throw new Error("Use a PNG or JPEG under 300 KB");
      let path: string;
      if (hosted) {
        const f = new FormData();
        f.set("logo", file);
        const r = await uploadLogo(f);
        if ("error" in r) throw new Error(r.error);
        path = r.path;
      } else {
        path = await new Promise<string>((res) => {
          const reader = new FileReader();
          reader.onload = () => res(String(reader.result));
          reader.readAsDataURL(file);
        });
      }
      setB({ ...b, logoPath: path });
      act((s) => setBusinessDetails(s, garageId, { ...b, logoPath: path }, staff));
    }, "Logo saved");

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-[28px] leading-tight font-[650] text-text">Settings</h1>
      <p className="mt-1 text-sm text-muted">Business details for your invoices, your team, and quote follow-ups.</p>

      <form
        className="mt-6 space-y-6 rounded-xl border border-line bg-white p-4 md:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.run(() => {
            const e2 = businessErrors(b);
            setErrors(e2);
            if (Object.keys(e2).length) throw new Error("Check the highlighted fields");
            act((s) => setBusinessDetails(s, garageId, b, staff));
          }, "Saved. New invoices use these details; issued invoices keep theirs.");
        }}
      >
        <div>
          <h2 className="text-lg font-semibold text-text">Business details</h2>
          <p className="mt-1 text-sm text-muted">Printed on every invoice. {!owner && "Only the garage owner can change these."}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {text("tradingName", "Trading name")}
          {text("legalName", "Legal name", { hint: "Limited company: exactly as on the certificate of incorporation. Sole trader: your own name." })}
          {text("address", "Address", { multiline: true, hint: "Registered office if it's a limited company." })}
          <div className="space-y-4">
            {text("phone", "Phone", { type: "tel" })}
            {text("email", "Email", { type: "email" })}
          </div>
          {text("companyNumber", "Company number", { optional: true, hint: "Limited companies only." })}
          {text("vatNumber", "VAT registration number", { optional: true })}
          <Field id="biz-vat" label="VAT on invoices" error={errors.vatRatePercent} hint="Prices on invoice lines are entered without VAT; VAT is added on the total.">
            <select id="biz-vat" disabled={!owner} value={b.vatRatePercent} onChange={set("vatRatePercent")} className={inputClass()}>
              <option value={20}>VAT registered: 20% standard rate</option>
              <option value={5}>VAT registered: 5% reduced rate</option>
              <option value={0}>Not VAT registered (no VAT)</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="biz-terms" label="Payment terms (days)" error={errors.paymentTermsDays}>
              <input id="biz-terms" type="number" min={0} max={120} disabled={!owner} value={b.paymentTermsDays} onChange={set("paymentTermsDays")} className={`${inputClass(errors.paymentTermsDays)} tabular-nums`} />
            </Field>
            {text("invoicePrefix", "Invoice number prefix", { hint: `Next: ${b.invoicePrefix}${String(garage.business.nextInvoiceNumber).padStart(4, "0")}` })}
          </div>
          <div className="md:col-span-2">{text("paymentInstructions", "Payment instructions", { multiline: true, hint: "Bank details or how customers can pay. Printed on invoices." })}</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm md:col-span-2">
            <dt className="text-muted">Currency</dt><dd className="text-text">Pounds sterling (GBP)</dd>
            <dt className="text-muted">Time zone</dt><dd className="text-text">UK (Europe/London), with England and Wales bank holidays</dd>
          </dl>
          <div className="md:col-span-2">
            <label htmlFor="biz-logo" className="mb-1 block text-sm font-medium text-text">Logo <span className="font-normal text-muted">(optional, PNG or JPEG under 300 KB)</span></label>
            <div className="flex flex-wrap items-center gap-3">
              {b.logoPath?.startsWith("data:") && <img src={b.logoPath} alt="Current logo" className="h-10 w-auto rounded border border-line" />}
              {b.logoPath && !b.logoPath.startsWith("data:") && <span className="text-xs text-muted">Logo uploaded</span>}
              <input id="biz-logo" type="file" accept="image/png,image/jpeg" disabled={!owner || logo.pending} onChange={(e) => onLogo(e.target.files?.[0])} className="text-sm" />
              <InlineFeedback feedback={logo.feedback} />
            </div>
          </div>
        </div>
        {owner && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <InlineFeedback feedback={save.feedback} />
            <Button type="submit" variant="primary" disabled={save.pending}>{save.pending ? "Saving…" : "Save business details"}</Button>
          </div>
        )}
      </form>

      {hosted && owner && (
        <section className="mt-6 rounded-xl border border-line bg-white p-4 md:p-6">
          <h2 className="text-lg font-semibold text-text">Team</h2>
          <p className="mt-1 mb-4 text-sm text-muted">Invite a colleague. They get their own sign-in to this garage only.</p>
          <InviteColleagueForm />
        </section>
      )}
    </div>
  );
}
