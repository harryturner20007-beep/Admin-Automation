// A garage's workspace document: the AppState the engine works on, as stored per garage.
// migrateState upgrades older saved copies; checkTransition is the server's check on every save.
import { DEFAULT_FOLLOW_UPS } from "./schedule";
import { DEFAULT_TEMPLATES } from "./templates";
import type { AppState, BusinessDetails, Garage } from "./types";

export const defaultBusiness = (name: string): BusinessDetails => ({
  tradingName: name,
  legalName: "",
  address: "",
  phone: "",
  email: "",
  companyNumber: "",
  vatNumber: "",
  vatRatePercent: 0,
  currency: "GBP",
  paymentTermsDays: 7,
  invoicePrefix: "INV-",
  nextInvoiceNumber: 1,
  paymentInstructions: "",
});

/** A new, empty workspace for a real garage. Follow-ups and invoice texts start off until the owner turns them on. */
export function newWorkspace(garageId: string, name: string, now: string): AppState {
  const garage: Garage = {
    id: garageId,
    name,
    timezone: "Europe/London",
    smsNumber: "",
    hours: { 1: { open: "08:30", close: "17:30" }, 2: { open: "08:30", close: "17:30" }, 3: { open: "08:30", close: "17:30" }, 4: { open: "08:30", close: "17:30" }, 5: { open: "08:30", close: "17:30" } },
    paused: false,
    quoteValidityDays: 30,
    statusFreshHours: 24,
    mode: "off",
    invoiceMode: "off",
    followUps: structuredClone(DEFAULT_FOLLOW_UPS),
    synthetic: false,
    business: defaultBusiness(name),
  };
  return {
    now,
    garages: [garage],
    templates: ([1, 2] as const).map((step) => ({ id: `tpl_${step}`, garageId, step, approved: false, body: DEFAULT_TEMPLATES[step] })),
    quotes: [],
    jobs: [],
    invoices: [],
    messages: [],
    suppressions: [],
    tasks: [],
    events: [],
    seq: 0,
    providerMode: "accept",
    processedProviderEvents: [],
  };
}

export type BusinessInput = Omit<BusinessDetails, "nextInvoiceNumber" | "currency">;

export function businessErrors(b: BusinessInput): Partial<Record<keyof BusinessInput, string>> {
  const e: Partial<Record<keyof BusinessInput, string>> = {};
  if (!b.tradingName.trim() && !b.legalName.trim()) e.tradingName = "Enter the name customers know you by";
  if (b.tradingName.length > 120 || b.legalName.length > 160) e.legalName = "Keep names under 160 characters";
  if (b.address.length > 400) e.address = "Keep the address under 400 characters";
  if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim())) e.email = "That email address doesn't look right";
  if (![0, 5, 20].includes(b.vatRatePercent)) e.vatRatePercent = "Choose a VAT rate";
  if (b.vatRatePercent > 0 && !b.vatNumber.trim()) e.vatNumber = "Needed when you charge VAT";
  if (!Number.isInteger(b.paymentTermsDays) || b.paymentTermsDays < 0 || b.paymentTermsDays > 120) e.paymentTermsDays = "Between 0 and 120 days";
  if (!/^[A-Za-z0-9/-]{0,8}$/.test(b.invoicePrefix)) e.invoicePrefix = "Up to 8 letters, numbers, / or -";
  if (b.paymentInstructions.length > 1000) e.paymentInstructions = "Keep under 1,000 characters";
  return e;
}

/** Owner edits the details printed on invoices. Issued invoices keep the copy they were issued with. */
export function setBusinessDetails(state: AppState, garageId: string, input: BusinessInput, staffName: string) {
  const errors = Object.values(businessErrors(input));
  if (errors.length) throw new Error(errors[0]);
  const g = state.garages.find((x) => x.id === garageId)!;
  const trim = (s: string) => s.trim();
  g.business = {
    ...g.business,
    ...input,
    tradingName: trim(input.tradingName),
    legalName: trim(input.legalName),
    address: trim(input.address),
    phone: trim(input.phone),
    email: trim(input.email),
    companyNumber: trim(input.companyNumber),
    vatNumber: trim(input.vatNumber),
    invoicePrefix: input.invoicePrefix.trim().toUpperCase(),
    paymentInstructions: trim(input.paymentInstructions),
  };
  if (g.business.tradingName) g.name = g.business.tradingName;
  state.events.push({ id: `ev_${++state.seq}`, at: state.now, garageId, kind: "settings", text: `${staffName} updated the business details` });
}

const LIST_KEYS =["garages", "templates", "quotes", "invoices", "messages", "suppressions", "tasks", "events", "processedProviderEvents"] as const;

/**
 * Bring a saved workspace up to the current shape. Adds what newer versions introduced (jobs, business
 * details) and leaves existing records as they are, so invoices raised before jobs existed keep working.
 * Throws on anything that is not a workspace at all.
 */
export function migrateState(raw: unknown): AppState {
  const s = raw as AppState;
  if (!s || typeof s !== "object" || typeof s.now !== "string" || typeof s.seq !== "number" || LIST_KEYS.some((k) => !Array.isArray(s[k])) || !s.garages.length) {
    throw new Error("Not a workspace");
  }
  s.jobs ??= [];
  for (const g of s.garages) {
    g.business ??= defaultBusiness(g.name);
    g.invoiceMode ??= "off";
    const used = s.invoices.filter((i) => i.garageId === g.id && i.number).length; // drafts have no number yet
    if (g.business.nextInvoiceNumber <= used) g.business.nextInvoiceNumber = used + 1;
  }
  s.providerMode ??= "accept";
  return s;
}

/**
 * The server's check on a save sent from the browser. A member may change their own garage's records, but
 * history is append-only and an issued invoice is frozen: these rules keep a buggy or tampered client from
 * rewriting either. Returns the first problem, or null.
 */
export function checkTransition(prev: AppState, next: AppState, garageId: string, role: "owner" | "staff" = "owner"): string | null {
  if (next.garages.length !== 1 || next.garages[0].id !== garageId) return "Workspace belongs to another garage";
  if (role !== "owner" && JSON.stringify(next.garages[0].business) !== JSON.stringify(prev.garages[0].business)) {
    const { nextInvoiceNumber: _a, ...n } = next.garages[0].business;
    const { nextInvoiceNumber: _b, ...p } = prev.garages[0].business;
    if (JSON.stringify(n) !== JSON.stringify(p)) return "Only the garage owner can change the business details";
  }
  if (next.garages[0].business.nextInvoiceNumber < prev.garages[0].business.nextInvoiceNumber) return "Invoice numbers can't go backwards";
  const owned = <T extends { garageId: string }>(xs: T[]) => xs.every((x) => x.garageId === garageId);
  if (!owned(next.quotes) || !owned(next.jobs) || !owned(next.invoices) || !owned(next.messages) || !owned(next.events)) return "Records must belong to this garage";
  if (next.seq < prev.seq) return "Workspace is older than the saved copy";
  for (const k of ["quotes", "jobs", "invoices", "events"] as const) {
    const ids = new Set(next[k].map((x) => x.id));
    if (ids.size !== next[k].length) return `Duplicate ${k}`;
    if (prev[k].some((x) => !ids.has(x.id))) return `Saved ${k} can't be removed`;
  }
  // Opt-outs only come from the customer's own texts (handled on the server): the browser can't remove or edit them.
  const sups = new Map(next.suppressions.map((x) => [x.id, JSON.stringify(x)]));
  if (prev.suppressions.some((x) => sups.get(x.id) !== JSON.stringify(x))) return "Opt-outs can't be changed here";
  // Only the server records a text as sent: the browser may approve, cancel, or settle a "Delivery unknown" one.
  const SENT = ["sending", "sent", "delivered"];
  const prevMsg = new Map(prev.messages.map((m) => [m.id, m]));
  for (const m of next.messages) {
    const was = prevMsg.get(m.id);
    if (m.direction === "inbound" && !was) return "Incoming texts come from the provider";
    if (m.direction !== "outbound" || !SENT.includes(m.status ?? "") || (was && was.status === m.status && was.providerMessageId === m.providerMessageId)) continue;
    if (!(was?.status === "needs_reconciliation" && m.status === "sent")) return "Texts are marked sent by the server";
  }
  const evIds = new Map(next.events.map((e) => [e.id, e]));
  if (prev.events.some((e) => JSON.stringify(evIds.get(e.id)) !== JSON.stringify(e))) return "History can't be changed";
  const quoteIds = new Set(next.quotes.map((q) => q.id));
  const jobIds = new Set(next.jobs.map((j) => j.id));
  if (next.jobs.some((j) => !quoteIds.has(j.quoteId))) return "Job without its quote";
  if (new Set(next.jobs.map((j) => j.quoteId)).size !== next.jobs.length) return "Only one job per quote";
  const live = next.invoices.filter((i) => i.jobId && i.status !== "cancelled").map((i) => i.jobId);
  if (new Set(live).size !== live.length) return "Only one invoice per job";
  if (next.invoices.some((i) => i.jobId && !jobIds.has(i.jobId))) return "Invoice without its job";
  const prevInv = new Map(prev.invoices.map((i) => [i.id, i]));
  for (const inv of next.invoices) {
    const was = prevInv.get(inv.id);
    const frozen = (i: typeof inv) => JSON.stringify([i.number, i.amountPence, i.issuedAt, i.dueDate, i.content, i.totals, i.issuedBy]);
    if (was && was.status !== "draft") {
      if (inv.status === "draft" || frozen(inv) !== frozen(was)) return `Issued invoice ${was.number} can't be changed`;
      if (was.status === "cancelled" && inv.status !== "cancelled") return `Cancelled invoice ${was.number} can't be reopened`;
    } else if (inv.status !== "draft") {
      return "Invoices are issued by the server";
    }
  }
  return null;
}
