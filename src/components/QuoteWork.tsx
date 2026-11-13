"use client";

import { useState } from "react";
import { updateQuoteCharges } from "@/domain/intake";
import { acceptedLinesFromQuote } from "@/domain/jobs";
import { lineTotal, totals } from "@/domain/money";
import type { LineKind, Quote } from "@/domain/types";
import { useAction, useDemo } from "@/demo/store";
import { SavedServicePicker } from "./SavedServices";
import { Button, InlineFeedback } from "./ui";
import { ChargesEditor, chargesFromDraft, draftFromCharges, money, TotalsTable, type ChargesDraft } from "./workflow";

const KIND: Record<LineKind, string> = { labour: "Labour", part: "Parts", other: "Other" };

/** The quote's labour and parts, with totals. Open quotes can be itemised or edited; the price follows. */
export function QuoteWork({ q }: { q: Quote }) {
  const { state, staff, act } = useDemo();
  const [draft, setDraft] = useState<ChargesDraft | null>(null);
  const save = useAction();
  const open = q.status === "open";

  if (draft) {
    return (
      <div className="mt-3 space-y-3">
        <SavedServicePicker id={`qw-saved-${q.id}`} value={draft} onChange={setDraft} />
        <ChargesEditor idPrefix={`qw-${q.id}`} value={draft} onChange={setDraft} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <InlineFeedback feedback={save.feedback?.ok ? null : save.feedback} />
          <Button type="button" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
          <Button
            type="button"
            variant="primary"
            disabled={save.pending}
            onClick={() =>
              save.run(() => {
                act((s) => updateQuoteCharges(s, q.id, chargesFromDraft(draft), staff));
                setDraft(null);
              }, "Saved")
            }
          >
            {save.pending ? "Saving…" : "Save work"}
          </Button>
        </div>
      </div>
    );
  }

  if (!q.charges) {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">No labour or parts recorded; the total above is the quoted price.</p>
        {open && <Button type="button" size="sm" onClick={() => setDraft(draftFromCharges(acceptedLinesFromQuote(state, q)))}>Itemise work</Button>}
      </div>
    );
  }

  const groups = (["labour", "part", "other"] as const).map((k) => ({ k, lines: q.charges!.lines.filter((l) => l.kind === k) })).filter((g) => g.lines.length);
  return (
    <div className="mt-3 space-y-3">
      {groups.map((g) => (
        <div key={g.k}>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{KIND[g.k]}</p>
          <ul className="mt-1 divide-y divide-line rounded-lg border border-line">
            {g.lines.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block break-words text-text">{l.description}</span>
                  <span className="text-xs text-muted tabular-nums">{l.quantity} × {money(l.unitPence)}</span>
                </span>
                <span className="text-text tabular-nums">{money(lineTotal(l))}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <TotalsTable t={totals(q.charges)} vatRatePercent={q.charges.vatRatePercent} />
      {open && (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={() => setDraft(draftFromCharges(q.charges!))}>Edit work</Button>
        </div>
      )}
    </div>
  );
}
