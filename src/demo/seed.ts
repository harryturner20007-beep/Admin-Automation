// SYNTHETIC DEMO DATA. Every name, vehicle and number here is invented.
// Phone numbers use Ofcom's reserved drama range (07700 900xxx), which is never allocated to real people.

import {
  applyDeliveryStatus,
  approveMessage,
  confirmStatus,
  dispatchApproved,
  receiveInbound,
  runFollowUpCheck,
} from "@/domain/engine";
import { DEFAULT_FOLLOW_UPS } from "@/domain/schedule";
import { DEFAULT_TEMPLATES } from "@/domain/templates";
import type { AppState, Garage, Quote, Template } from "@/domain/types";
import { MockSmsProvider } from "@/sms/provider";

export const DEMO_GARAGE_ID = "g_demo";
export const DEMO_STAFF = "Mia (front desk)";
/** Demo clock starts Wednesday 11 November 2026, 10:00 London time (GMT). */
export const DEMO_START = "2026-11-11T10:00:00.000Z";

const garage: Garage = {
  id: DEMO_GARAGE_ID,
  name: "Riverside Garage",
  timezone: "Europe/London",
  smsNumber: "+447700900999",
  hours: {
    1: { open: "08:30", close: "17:30" },
    2: { open: "08:30", close: "17:30" },
    3: { open: "08:30", close: "17:30" },
    4: { open: "08:30", close: "17:30" },
    5: { open: "08:30", close: "17:30" },
    6: { open: "09:00", close: "12:00" },
  },
  paused: false,
  quoteValidityDays: 30,
  statusFreshHours: 24,
  mode: "draft",
  followUps: structuredClone(DEFAULT_FOLLOW_UPS),
  synthetic: true,
};

const templates: Template[] = [
  {
    id: "tpl_1",
    garageId: DEMO_GARAGE_ID,
    step: 1,
    approved: true,
    body: DEFAULT_TEMPLATES[1],
  },
  {
    id: "tpl_2",
    garageId: DEMO_GARAGE_ID,
    step: 2,
    approved: true,
    body: DEFAULT_TEMPLATES[2],
  },
];

function quote(q: Omit<Quote, "garageId" | "status" | "statusSource" | "revision" | "paused" | "unresolvedReply" | "booking">): Quote {
  return { garageId: DEMO_GARAGE_ID, status: "open", statusSource: "manual", revision: 1, paused: false, unresolvedReply: false, booking: "none", ...q };
}

const seedQuotes: Quote[] = [
  quote({
    id: "q_ava",
    sourceQuoteId: "NM-1042",
    customerName: "Ava Thompson",
    phone: "+447700900101",
    vehicle: "2017 Ford Focus",
    registration: "YK17 FHD",
    job: "front brake pads and discs",
    amountPence: 28500,
    quoteSentAt: "2026-11-09T14:20:00.000Z",
    statusConfirmedAt: "2026-11-09T14:20:00.000Z",
    eligibilityEvidenceRef: "Job card NM-1042: SMS follow-up consent ticked",
  }),
  quote({
    id: "q_ben",
    sourceQuoteId: "NM-1037",
    customerName: "Ben Okafor",
    phone: "+447700900102",
    vehicle: "2015 VW Golf",
    registration: "LS15 GVA",
    job: "clutch replacement",
    amountPence: 64000,
    quoteSentAt: "2026-11-05T16:00:00.000Z",
    statusConfirmedAt: "2026-11-05T16:00:00.000Z",
    eligibilityEvidenceRef: "Job card NM-1037: SMS follow-up consent ticked",
  }),
  quote({
    id: "q_chloe",
    sourceQuoteId: "NM-1033",
    customerName: "Chloe Patel",
    phone: "+447700900103",
    vehicle: "2019 Vauxhall Corsa",
    registration: "BD19 KXR",
    job: "timing belt and water pump",
    amountPence: 42000,
    quoteSentAt: "2026-11-04T11:30:00.000Z",
    statusConfirmedAt: "2026-11-04T11:30:00.000Z",
    eligibilityEvidenceRef: "Online booking form #W-2291: SMS consent",
  }),
  quote({
    id: "q_dan",
    sourceQuoteId: "NM-1034",
    customerName: "Daniel Hughes",
    phone: "+447700900104",
    vehicle: "2016 Toyota Yaris",
    registration: "MA66 TYS",
    job: "two rear tyres and alignment",
    amountPence: 19000,
    quoteSentAt: "2026-11-04T15:10:00.000Z",
    statusConfirmedAt: "2026-11-04T15:10:00.000Z",
    eligibilityEvidenceRef: "Job card NM-1034: SMS follow-up consent ticked",
  }),
  quote({
    id: "q_emma",
    sourceQuoteId: "NM-1031",
    customerName: "Emma Clarke",
    phone: "+447700900105",
    vehicle: "2018 Nissan Qashqai",
    registration: "WP68 NQE",
    job: "exhaust back box replacement",
    amountPence: 23000,
    quoteSentAt: "2026-11-04T09:15:00.000Z",
    statusConfirmedAt: "2026-11-04T09:15:00.000Z",
    eligibilityEvidenceRef: "Job card NM-1031: SMS follow-up consent ticked",
  }),
];

export function emptyState(now: string): AppState {
  return {
    now,
    garages: [structuredClone(garage)],
    templates: structuredClone(templates),
    quotes: structuredClone(seedQuotes),
    messages: [],
    suppressions: [],
    tasks: [],
    events: [],
    seq: 0,
    providerMode: "accept",
    processedProviderEvents: [],
  };
}

async function approveAndSendAll(state: AppState, provider: MockSmsProvider) {
  for (const m of state.messages.filter((x) => x.status === "awaiting_approval")) approveMessage(state, m.id, DEMO_STAFF);
  await dispatchApproved(state, provider);
  for (const m of state.messages.filter((x) => x.status === "sent")) {
    applyDeliveryStatus(state, { eventId: `${m.providerMessageId}:delivered`, providerMessageId: m.providerMessageId!, status: "delivered" });
  }
}

function reply(state: AppState, from: string, body: string) {
  receiveInbound(state, { eventId: `SMin_${state.seq + 1}_${from.slice(-3)}`, from, to: garage.smsNumber, body });
}

/**
 * Builds the five demo cases by replaying the past week through the real engine,
 * so seeded history obeys exactly the same rules as live clicks.
 */
export async function buildSeedState(): Promise<AppState> {
  const s = emptyState("2026-11-06T10:00:00.000Z");
  const provider = new MockSmsProvider("accept");
  const at = (iso: string) => (s.now = iso);

  // Fri 6 Nov: first follow-ups for Chloe, Daniel and Emma
  at("2026-11-06T08:45:00.000Z");
  for (const id of ["q_chloe", "q_dan", "q_emma"]) confirmStatus(s, id, "open", DEMO_STAFF);
  at("2026-11-06T10:00:00.000Z");
  runFollowUpCheck(s);
  await approveAndSendAll(s, provider);

  // Fri 6 Nov: Daniel replies STOP
  at("2026-11-06T12:05:00.000Z");
  reply(s, "+447700900104", "STOP");

  // Mon 9 Nov: Ben's first follow-up
  at("2026-11-09T08:45:00.000Z");
  confirmStatus(s, "q_ben", "open", DEMO_STAFF);
  at("2026-11-09T10:00:00.000Z");
  runFollowUpCheck(s);
  await approveAndSendAll(s, provider);

  // Mon 9 Nov: Ben wants to book
  at("2026-11-09T11:12:00.000Z");
  reply(s, "+447700900102", "Yes please, can you fit me in this Friday morning?");

  // Tue 10 Nov: Emma phones the garage and books before her second reminder
  at("2026-11-10T15:00:00.000Z");
  confirmStatus(s, "q_emma", "booked", DEMO_STAFF);

  // Tue 10 Nov evening: Chloe asks about price
  at("2026-11-10T18:40:00.000Z");
  reply(s, "+447700900103", "Is £420 the best you can do? Bit more than I expected.");

  // Wed 11 Nov morning: staff confirm the open quotes are still open
  at("2026-11-11T08:40:00.000Z");
  for (const id of ["q_ava", "q_chloe", "q_dan"]) confirmStatus(s, id, "open", DEMO_STAFF);

  at(DEMO_START);
  return s;
}

export const REPLY_PRESETS: { label: string; body: string }[] = [
  { label: "Wants to book", body: "Yes please, can you do Friday?" },
  { label: "Price question", body: "Any chance you can do it a bit cheaper?" },
  { label: "Safety question", body: "Is it safe to drive until then? The brakes are squealing." },
  { label: "Complaint", body: "Not happy, I was told it would be less than this." },
  { label: "STOP", body: "STOP" },
];
