// Domain records. These mirror the Phase 2 Postgres tables:
// garages, garage_members, quotes, messages, suppressions, staff_tasks.

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type OpeningHours = Partial<Record<Weekday, { open: string; close: string }>>;

/** Off: nothing is scheduled. Draft: staff approve each text. Automatic: due texts send at the set time. */
export type FollowUpMode = "off" | "draft" | "automatic";

export type FollowUpSetting = {
  enabled: boolean; // follow-up 1 is always enabled; staff may switch off follow-up 2
  businessDays: number; // business days after the quote was sent (Europe/London)
  sendTime: string; // preferred UK local send time, "HH:MM"; kept inside opening hours
};

export type Garage = {
  id: string;
  name: string;
  timezone: "Europe/London";
  smsNumber: string; // one reply-capable number per garage
  hours: OpeningHours; // follow-ups are only sent inside these hours
  paused: boolean; // garage-wide pause switch
  quoteValidityDays: number; // quotes older than this are expired
  statusFreshHours: number; // how recent a status confirmation must be
  mode: FollowUpMode;
  invoiceMode: FollowUpMode; // invoice texts and payment reminders, set separately from quote follow-ups
  followUps: [FollowUpSetting, FollowUpSetting];
  lastCheckAt?: string; // last follow-up check that covered this garage
  synthetic: boolean;
  business: BusinessDetails; // printed on invoices; edited by the garage owner in Settings
};

/** What a garage prints on its invoices (GOV.UK "Invoices: what they must include", VAT Notice 700 s.16). */
export type BusinessDetails = {
  tradingName: string;
  legalName: string; // limited company: exactly as on the certificate of incorporation; sole trader: owner's name
  address: string; // multi-line
  phone: string;
  email: string;
  companyNumber: string; // "" when not a limited company
  vatNumber: string; // "" when not VAT registered
  vatRatePercent: number; // 20 standard; 0 when not VAT registered
  currency: "GBP";
  paymentTermsDays: number;
  invoicePrefix: string; // "INV-"
  nextInvoiceNumber: number; // allocated on issue; never reused
  paymentInstructions: string; // bank details or how to pay
  logoPath?: string; // private storage path (hosted) or data URL (demo)
};

/** One charge. Prices are integer pence, excluding VAT when the garage is VAT registered. */
export type LineKind = "labour" | "part" | "other";
export type Line = { id: string; kind: LineKind; description: string; quantity: number; unitPence: number };

/** The figures an invoice is calculated from. */
export type Charges = { lines: Line[]; discountPence: number; vatRatePercent: number };

export type JobStatus = "booked" | "in_progress" | "completed" | "cancelled";

export type Job = {
  id: string;
  garageId: string;
  quoteId: string; // unique: one job per quote
  number: string; // "JOB-0001"
  status: JobStatus;
  startAt: string; // booked date and time (ISO, UTC)
  durationMins?: number;
  notes: string; // internal only
  /** Snapshot of the work and price the customer accepted. Never changed after booking. */
  accepted: Charges & { totalPence: number; acceptedAt: string; acceptedBy: string; customerConfirmation: string };
  /** Final charges, set on completion. */
  final?: Charges & { extraWorkReason: string; extraWorkAuthorisation: string; completionNotes: string };
  createdAt: string;
  createdBy: string;
  startedAt?: string;
  completedAt?: string;
  completedBy?: string;
  cancelledAt?: string;
  cancelReason?: string;
};

export type Party = { name: string; address: string; phone: string; email: string };

/** Everything printed on an invoice. Editable while draft; frozen into `issued` on issue. */
export type InvoiceContent = Charges & {
  seller: Omit<BusinessDetails, "nextInvoiceNumber" | "invoicePrefix" | "logoPath"> & { logoPath?: string };
  customer: Party;
  vehicle: { registration: string; description: string };
  supplyDate: string; // "YYYY-MM-DD"
  currency: "GBP";
  paymentTermsDays: number;
  paymentInstructions: string;
  notes: string;
  jobNumber: string;
};

export type Totals = { subtotalPence: number; discountPence: number; netPence: number; vatPence: number; totalPence: number };

export type QuoteStatus = "open" | "booked" | "declined" | "completed" | "expired";
export type BookingState = "none" | "requested" | "confirmed";

export type Quote = {
  id: string;
  garageId: string;
  sourceQuoteId: string; // garage's own reference; upsert key with garageId
  customerName: string;
  phone: string; // E.164
  vehicle: string; // "" when not given
  registration?: string; // normalised, e.g. "AB12 CDE"
  job: string; // as entered by the garage; may contain workshop shorthand
  customerJobDescription?: string; // short customer-facing wording used in texts instead of `job`
  outcome?: "needs_time" | "no_reply"; // last staff-recorded outcome while the quote stays open
  reminderDate?: string; // "YYYY-MM-DD" (UK date) staff chose to chase again; holds automatic follow-ups until then
  contactPendingAt?: string; // staff opened an external app to contact the customer; outcome not yet recorded
  amountPence: number; // quoted price, integer pence; completed value is jobValuePence
  quoteSentAt: string; // when the garage sent the quote (ISO, UTC)
  status: QuoteStatus;
  statusConfirmedAt: string; // last time staff or a feed confirmed the status
  statusSource: "manual" | "import" | "feed";
  eligibilityEvidenceRef: string | null; // e.g. "Signed job card #4411, SMS consent box ticked"
  revision: number; // bumps when a quote is re-issued; part of the send key
  paused: boolean;
  unresolvedReply: boolean;
  booking: BookingState;
  bookingRequestedAt?: string;
  bookedAt?: string;
  bookedFor?: string; // "YYYY-MM-DD" (UK date) the job is booked in for, once staff set it
  completedAt?: string;
  jobValuePence?: number;
  offeredSlots?: string[]; // booking times (ISO) staff offered by text; one click books the one the customer picks
  email?: string; // customer billing details, copied onto the job's invoice
  billingAddress?: string;
};

export type Template = {
  id: string;
  garageId: string;
  step: 1 | 2;
  body: string;
  approved: boolean;
};

export type OutboundStatus =
  | "awaiting_approval"
  | "approved"
  | "sending" // claimed by exactly one worker
  | "sent"
  | "delivered"
  | "failed"
  | "needs_reconciliation"
  | "blocked"
  | "expired"
  | "cancelled";

export type ReplyCategory =
  | "opt_out"
  | "booking_request"
  | "price_question"
  | "complaint"
  | "repair_or_safety"
  | "general";

export type Message = {
  id: string;
  garageId: string;
  quoteId: string | null; // null for unmatched inbound
  direction: "outbound" | "inbound";
  body: string;
  createdAt: string;
  fromPhone: string;
  toPhone: string;
  // outbound
  step?: 1 | 2; // follow-up step; unset on invoice texts
  invoiceId?: string; // set on invoice texts (the invoice itself and its reminders)
  invoiceStep?: InvoiceStep;
  revision?: number;
  sendKey?: string; // unique: garage:quote:revision:step
  templateId?: string;
  status?: OutboundStatus;
  windowStart?: string;
  windowEnd?: string;
  approvedBy?: string;
  approvedAt?: string;
  claimedAt?: string;
  sentAt?: string;
  providerMessageId?: string;
  deliveryStatus?: string; // the provider's latest status (queued, sent, delivered, undelivered, failed)
  deliveryError?: string; // why the provider or network rejected or failed it, in staff words
  manual?: boolean; // typed and sent by staff from the composer (not a scheduled template)
  requestKey?: string; // the composer's one-off key: a repeated click or retry finds this message instead of making another
  statusReasons?: string[];
  // inbound
  providerInboundId?: string;
  category?: ReplyCategory;
  matchedQuoteIds?: string[];
};

/** 0 = the invoice text, 1 = first reminder (7 days), 2 = second reminder (14 days). */
export type InvoiceStep = 0 | 1 | 2;

/**
 * draft: created on job completion, editable, never chased. unpaid: issued and outstanding (chased).
 * paid. cancelled: an issued invoice withdrawn with a reason (kept, never deleted).
 * Invoices from before jobs existed have no jobId/content: they were issued straight from the quote.
 */
export type InvoiceStatus = "draft" | "unpaid" | "paid" | "cancelled";

export type Invoice = {
  id: string;
  garageId: string;
  quoteId: string;
  jobId?: string; // one non-cancelled invoice per job
  number: string; // per garage, "INV-0001"; "" while draft
  amountPence: number; // total due (incl. VAT)
  issuedAt: string; // issue time; for a draft, when it was created
  dueDate: string; // "YYYY-MM-DD" (UK date)
  status: InvoiceStatus;
  paidAt?: string;
  chasePaused: boolean; // staff stopped automatic reminders for this invoice
  content?: InvoiceContent; // the draft (or, once issued, the frozen copy)
  totals?: Totals;
  issuedBy?: string;
  cancelledAt?: string;
  cancelReason?: string;
  replacesId?: string; // a corrected draft points at the cancelled invoice it replaces
};

export type Suppression = {
  id: string;
  garageId: string;
  phone: string;
  reason: "opt_out";
  sourceMessageId: string;
  createdAt: string;
  liftedAt?: string; // the customer texted START: kept for the record, no longer blocks texts
};

export type TaskKind =
  | "booking_request"
  | "price_question"
  | "complaint"
  | "repair_or_safety"
  | "general_reply"
  | "ambiguous_match"
  | "unmatched_reply"
  | "opt_out_notice"
  | "reconcile_send";

export type StaffTask = {
  id: string;
  garageId: string;
  kind: TaskKind;
  quoteIds: string[];
  messageId?: string;
  summary: string;
  status: "open" | "resolved";
  createdAt: string;
  resolvedAt?: string;
  resolution?: string;
  readAt?: string; // set when staff first open it on the Replies screen
};

export type AuditEvent = {
  id: string;
  at: string;
  garageId: string;
  quoteId?: string;
  jobId?: string;
  invoiceId?: string;
  kind: string;
  text: string;
};

export type ProviderMode = "accept" | "reject" | "timeout";

export type AppState = {
  now: string; // demo clock (ISO, UTC)
  garages: Garage[];
  templates: Template[];
  quotes: Quote[];
  jobs: Job[];
  invoices: Invoice[];
  messages: Message[];
  suppressions: Suppression[];
  tasks: StaffTask[];
  events: AuditEvent[];
  seq: number;
  providerMode: ProviderMode;
  processedProviderEvents: string[]; // dedupe for inbound + status callbacks
};
