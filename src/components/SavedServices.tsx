"use client";

import { useState } from "react";
import { addCatalogueItem, parsePoundsToPence, removeCatalogueItem } from "@/domain/intake";
import type { CatalogueItem, LineKind } from "@/domain/types";
import { useAction, useDemo } from "@/demo/store";
import { Button, Icon, InlineFeedback, inputClass } from "./ui";
import { money, type ChargesDraft } from "./workflow";

const KIND_LABEL: Record<LineKind, string> = { labour: "Labour", part: "Part", other: "Other" };

/** Saved labour, parts and services, picked from when building a quote. Prices are ex VAT. */
export function SavedServices() {
  const { state, garageId, act } = useDemo();
  const items = state.garages.find((g) => g.id === garageId)!.catalogue ?? [];
  const [kind, setKind] = useState<LineKind>("labour");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const add = useAction();

  return (
    <div className="px-4 pb-4 md:px-8 md:pb-8">
      <section aria-labelledby="saved-title" className="rounded-xl border border-line bg-white p-4 md:p-6">
        <h2 id="saved-title" className="text-lg font-semibold text-text">Saved services</h2>
        <p className="mt-1 text-sm text-muted">Labour, parts and services you quote often. Add them to a quote in one click. Prices are before VAT.</p>

        {items.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Nothing saved yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
            {items.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-14 shrink-0 text-xs text-muted">{KIND_LABEL[c.kind]}</span>
                <span className="min-w-0 flex-1 truncate text-text">{c.description}</span>
                <span className="text-text tabular-nums">{money(c.unitPence)}</span>
                <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${c.description}`} onClick={() => act((s) => removeCatalogueItem(s, garageId, c.id))}>
                  <Icon name="close" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="mt-4 grid gap-3 sm:grid-cols-[8rem_1fr_8rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            add.run(() => {
              const unitPence = price.trim() === "0" ? 0 : parsePoundsToPence(price);
              if (unitPence === null) throw new Error("Enter a price in pounds, e.g. 65 or 65.50");
              act((s) => addCatalogueItem(s, garageId, { kind, description, unitPence }));
              setDescription("");
              setPrice("");
            }, "Saved");
          }}
        >
          <label className="text-sm font-medium text-text">
            Type
            <select value={kind} onChange={(e) => setKind(e.target.value as LineKind)} className={`${inputClass()} mt-1`}>
              <option value="labour">Labour</option>
              <option value="part">Part</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="text-sm font-medium text-text">
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} placeholder="Air filter" className={`${inputClass()} mt-1`} />
          </label>
          <label className="text-sm font-medium text-text">
            Price (£, ex VAT)
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="14.50" className={`${inputClass()} mt-1 text-right tabular-nums`} />
          </label>
          <Button type="submit" disabled={add.pending}>Add</Button>
          <div className="sm:col-span-4"><InlineFeedback feedback={add.feedback} /></div>
        </form>
      </section>
    </div>
  );
}

/** "Add a saved service" picker for the charges editor: appends the chosen item as a new line. */
export function SavedServicePicker({ id, value, onChange }: { id: string; value: ChargesDraft; onChange: (d: ChargesDraft) => void }) {
  const { state, garageId } = useDemo();
  const items = state.garages.find((g) => g.id === garageId)!.catalogue ?? [];
  if (!items.length) return null;
  const pick = (c: CatalogueItem) =>
    onChange({
      ...value,
      // An untouched empty first line is replaced rather than left blank above the pick.
      rows: [...value.rows.filter((r) => r.description.trim() || r.unit.trim()), { id: `s${crypto.randomUUID().slice(0, 8)}`, kind: c.kind, description: c.description, quantity: "1", unit: (c.unitPence / 100).toFixed(2) }],
    });
  return (
    <label htmlFor={id} className="block text-sm font-medium text-text">
      Add a saved service
      <select
        id={id}
        value=""
        onChange={(e) => {
          const c = items.find((x) => x.id === e.target.value);
          if (c) pick(c);
        }}
        className={`${inputClass()} mt-1`}
      >
        <option value="">Choose…</option>
        {items.map((c) => (
          <option key={c.id} value={c.id}>{`${c.description} · ${money(c.unitPence)}`}</option>
        ))}
      </select>
    </label>
  );
}
