import { renderSms, templateValues, DEFAULT_TEMPLATES, formatPounds } from "@/domain/templates";
import { formatLondon } from "@/domain/time";
import { PlateLabel, StatusLabel } from "../ui";

// One sample repair quote from the demo (Olivia Brooks, NM-1027), shown at the point it needs a person:
// both automatic follow-ups sent, no reply. The labels, message and "Staff needed" sentence are the app's own.
const QUOTE = {
  customerName: "Olivia Brooks",
  job: "four new tyres and wheel alignment",
  customerJobDescription: "four new tyres and wheel alignment",
  vehicle: "2021 Kia Sportage",
  registration: "OB21 KSP",
  sourceQuoteId: "NM-1027",
  amountPence: 52000,
};
const SENT = { quote: "2026-10-27T10:00:00.000Z", f1: "2026-10-29T10:00:00.000Z", f2: "2026-11-03T10:00:00.000Z" };
const FOLLOW_UP_1 = renderSms(DEFAULT_TEMPLATES[1], templateValues(QUOTE, { name: "Riverside Garage" })).text;

const STEPS = [
  { label: `Quote ${QUOTE.sourceQuoteId} sent for ${formatPounds(QUOTE.amountPence)}`, at: SENT.quote, state: null },
  { label: "Follow-up 1", at: SENT.f1, state: "Delivered" },
  { label: "Follow-up 2", at: SENT.f2, state: "Delivered" },
] as const;

/** A cropped view of the quote and its follow-ups, without the dashboard around it. */
export function HeroPreview() {
  return (
    <figure aria-label="Example of a quote moving through follow-ups" className="mx-auto max-w-4xl rounded-2xl border border-line bg-selected p-2 md:p-3">
      <div className="grid overflow-hidden rounded-xl border border-line bg-white md:grid-cols-[5fr_7fr]">
        <div className="border-b border-line p-5 md:border-r md:border-b-0 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <PlateLabel reg={QUOTE.registration} />
            <StatusLabel tone="neutral">Open</StatusLabel>
          </div>
          <p className="mt-3 text-lg font-semibold text-text">{QUOTE.customerName}</p>
          <p className="text-sm text-muted">{QUOTE.vehicle}</p>
          <p className="mt-4 text-base text-text">{QUOTE.job}</p>
          <p className="mt-4 text-xs text-muted">Quote</p>
          <p className="text-2xl font-semibold text-text tabular-nums">{formatPounds(QUOTE.amountPence)}</p>
        </div>

        <div className="p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-text">Follow-ups</p>
            <span className="rounded border border-dashed border-muted/60 px-1.5 py-0.5 text-xs text-text">Sample data</span>
          </div>
          <ol className="mt-3 space-y-3">
            {STEPS.map((s) => (
              <li key={s.label} className="flex items-start gap-3 text-sm">
                <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.state ? "bg-success" : "bg-muted"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-text">
                    <span className="font-medium">{s.label}</span>
                    {s.state && <span className="text-muted">: {s.state}</span>}
                  </p>
                  <p className="text-xs text-muted tabular-nums">{formatLondon(s.at)}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 line-clamp-3 rounded-lg bg-canvas px-3 py-2 text-sm text-text md:line-clamp-2">{FOLLOW_UP_1}</p>
          <div className="mt-4 rounded-lg border border-attention/30 bg-attention-bg px-3 py-2 text-sm text-attention">
            <span className="font-medium">Staff needed:</span> Both follow-ups sent (last on 3 Nov), no reply. Call or text the customer.
          </div>
        </div>
      </div>
    </figure>
  );
}
