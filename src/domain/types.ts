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
  followUps: [FollowUpSetting, FollowUpSetting];
  lastCheckAt?: string; // last follow-up check that covered this garage
  synthetic: boolean;
};

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
  completedAt?: string;
  jobValuePence?: number;
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
  deliveryStatus?: string;
  statusReasons?: string[];
  // inbound
  providerInboundId?: string;
  category?: ReplyCategory;
  matchedQuoteIds?: string[];
};

/** 0 = the invoice text, 1 = first reminder (7 days), 2 = second reminder (14 days). */
export type InvoiceStep = 0 | 1 | 2;

export type Invoice = {
  id: string;
  garageId: string;
  quoteId: string;
  number: string; // per garage, "INV-0001"
  amountPence: number; // the completed job value
  issuedAt: string; // when the job was recorded complete
  dueDate: string; // "YYYY-MM-DD" (UK date)
  status: "unpaid" | "paid";
  paidAt?: string;
  chasePaused: boolean; // staff stopped automatic reminders for this invoice
};

export type Suppression = {
  id: string;
  garageId: string;
  phone: string;
  reason: "opt_out";
  sourceMessageId: string;
  createdAt: string;
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
  kind: string;
  text: string;
};

export type ProviderMode = "accept" | "reject" | "timeout";

export type AppState = {
  now: string; // demo clock (ISO, UTC)
  garages: Garage[];
  templates: Template[];
  quotes: Quote[];
  invoices: Invoice[];
  messages: Message[];
  suppressions: Suppression[];
  tasks: StaffTask[];
  events: AuditEvent[];
  seq: number;
  providerMode: ProviderMode;
  processedProviderEvents: string[]; // dedupe for inbound + status callbacks
};
