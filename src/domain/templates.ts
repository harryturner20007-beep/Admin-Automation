// Deterministic SMS templates. No model involved: the same quote and template always give the same text.
import type { Garage, Quote } from "./types";

export function formatPounds(pence: number): string {
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: pence % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export const TEMPLATE_FIELDS = [
  { key: "first_name", label: "First name" },
  { key: "garage_name", label: "Garage name" },
  { key: "job_description", label: "Job description" },
  { key: "vehicle", label: "Vehicle" },
  { key: "quote_ref", label: "Quote ref" },
  { key: "quoted_price", label: "Quoted price" },
] as const;

export type FieldKey = (typeof TEMPLATE_FIELDS)[number]["key"];

export const DEFAULT_TEMPLATES: Record<1 | 2, string> = {
  1: "Hi {{first_name}}, it's {{garage_name}}. Just checking in on the quote for {{job_description}} on your {{vehicle}}. Reply here if you'd like to book or have a question. Reply STOP to opt out.",
  2: "Hi {{first_name}}, {{garage_name}} again. Your quote for {{job_description}} on your {{vehicle}} is still available. Reply here if you'd like a slot. Reply STOP to opt out.",
};

export type Rendered = {
  text: string;
  /** Placeholders that could not be filled (unknown names or empty values). Never send while non-empty. */
  unresolved: string[];
};

export function templateValues(quote: Pick<Quote, "customerName" | "job" | "customerJobDescription" | "vehicle" | "sourceQuoteId" | "amountPence">, garage: Pick<Garage, "name">): Record<FieldKey, string> {
  return {
    first_name: quote.customerName.trim().split(/\s+/)[0] ?? "",
    garage_name: garage.name.trim(),
    job_description: (quote.customerJobDescription?.trim() || quote.job.trim()),
    vehicle: quote.vehicle.trim(),
    quote_ref: quote.sourceQuoteId.trim(),
    quoted_price: quote.amountPence > 0 ? formatPounds(quote.amountPence) : "",
  };
}

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/gi;

export function renderSms(body: string, values: Record<FieldKey, string>): Rendered {
  let text = body;
  // No vehicle on file: drop the whole "on your {{vehicle}}" phrase rather than leave a gap.
  if (!values.vehicle) text = text.replace(/\s+on your\s+\{\{\s*vehicle\s*\}\}/gi, "");
  const unresolved: string[] = [];
  text = text.replace(PLACEHOLDER, (whole, name: string) => {
    const v = values[name.toLowerCase() as FieldKey];
    if (v) return v;
    unresolved.push(name);
    return whole; // left visible so previews can show exactly what is missing
  });
  return { text: text.replace(/[ \t]{2,}/g, " ").trim(), unresolved };
}

export const hasUnresolved = (text: string) => /\{\{[^}]*\}\}/.test(text);

/** Built-in sample for the settings preview (matches the default template's example wording). */
export const SAMPLE_QUOTES = {
  sample: { customerName: "Ben Carter", job: "front brake pads", vehicle: "Ford Fiesta", sourceQuoteId: "Q-1234", amountPence: 18000 },
  sampleNoVehicle: { customerName: "Ben Carter", job: "front brake pads", vehicle: "", sourceQuoteId: "Q-1234", amountPence: 18000 },
};

/** SMS parts for plain text: 160 characters fit one message; longer ones split into 153-character parts. */
export const smsParts = (text: string) => (text.length <= 160 ? 1 : Math.ceil(text.length / 153));
