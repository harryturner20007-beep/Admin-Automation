// SYNTHETIC DEMO DATA. Every name, vehicle and number here is invented.
// Phone numbers use Ofcom's reserved drama range (07700 900xxx), which is never allocated to real people.

import {
  applyDeliveryStatus,
  approveMessage,
  confirmStatus,
  dispatchApproved,
  markCompleted,
  receiveInbound,
  runFollowUpCheck,
} from "@/domain/engine";
import { markInvoicePaid, runInvoiceCheck } from "@/domain/invoices";
import { bookJob, completeJob, startJob } from "@/domain/jobs";
import { recordOutcome } from "@/domain/queue";
import { fromLondonInput } from "@/domain/time";
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
  invoiceMode: "automatic",
  followUps: structuredClone(DEFAULT_FOLLOW_UPS),
  synthetic: true,
  business: {
    tradingName: "Riverside Garage",
    legalName: "Riverside Garage (Demo) Ltd",
    address: "Unit 4, Mill Lane Trading Estate\nRiverside\nRV1 4MG",
    phone: "01632 960 123", // Ofcom drama range
    email: "desk@riverside-garage.example",
    companyNumber: "00000000 (demo)",
    vatNumber: "GB 000 0000 00 (demo)",
    vatRatePercent: 20,
    currency: "GBP",
    paymentTermsDays: 7,
    invoicePrefix: "INV-",
    nextInvoiceNumber: 1,
    paymentInstructions: "Bank transfer to Riverside Garage (Demo) Ltd, sort code 00-00-00, account 00000000 (demo details). Please use the invoice number as the reference. Card payments taken at the desk.",
  },
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

const STREETS = ["Mill Lane", "Church Road", "Station Street", "Park View", "Willow Close", "Orchard Way", "Bridge Street"];
let addressNo = 0;
function quote(q: Omit<Quote, "garageId" | "status" | "statusSource" | "revision" | "paused" | "unresolvedReply" | "booking">): Quote {
  const n = addressNo++;
  const billingAddress = `${12 + n * 3} ${STREETS[n % STREETS.length]}
Riverside
RV${1 + (n % 4)} ${n % 9}${"ABDEFGHJ"[n % 8]}${"LNPQRSTU"[(n * 3) % 8]}`; // fictional town and postcodes
  const email = `${q.customerName.split(" ")[0].toLowerCase()}@example.com`;
  return { garageId: DEMO_GARAGE_ID, status: "open", statusSource: "manual", revision: 1, paused: false, unresolvedReply: false, booking: "none", billingAddress, email, ...q };
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
  quote({
    id: "q_fay",
    sourceQuoteId: "NM-1022",
    customerName: "Fay Morgan",
    phone: "+447700900106",
    vehicle: "2015 Honda Jazz",
    registration: "FY15 HJZ",
    job: "clutch & flywheel",
    customerJobDescription: "clutch and flywheel replacement",
    amountPence: 52000,
    quoteSentAt: "2026-10-20T11:00:00.000Z",
    statusConfirmedAt: "2026-10-20T11:00:00.000Z",
    eligibilityEvidenceRef: "Job card NM-1022: SMS follow-up consent ticked",
  }),
];

// Fifteen more customers, so the demo reads like a working week at a real garage.
// Each line: id, ref, name, phone suffix, vehicle, registration, job, (customer wording), price, sent.
const more: [string, string, string, string, string, string, string, string | undefined, number, string][] = [
  ["q_grace", "NM-1037", "Grace Wilson", "107", "2019 VW Polo", "GL19 WPV", "MOT fail: front coil spring + wiper blades", "front coil spring and wiper blades", 18600, "2026-11-05T14:00:00.000Z"],
  ["q_tom", "NM-1043", "Tom Bennett", "108", "2017 Ford Transit Custom", "TB17 FTC", "timing belt & water pump kit", "timing belt and water pump", 54500, "2026-11-09T11:30:00.000Z"],
  ["q_priya", "NM-1044", "Priya Sharma", "109", "2020 Toyota Yaris Hybrid", "PS70 TYH", "12V aux battery + hybrid health check", "12V battery and hybrid health check", 16800, "2026-11-10T16:00:00.000Z"],
  ["q_liam", "NM-1035", "Liam O'Connor", "110", "2014 BMW 320d", "LO14 BMD", "DPF clean + EGR valve", "DPF clean and EGR valve replacement", 64000, "2026-11-02T14:00:00.000Z"],
  ["q_sophie", "NM-1032", "Sophie Walsh", "111", "2016 Vauxhall Astra", "SW66 VXA", "rear discs & pads", "rear brake discs and pads", 23500, "2026-10-30T11:00:00.000Z"],
  ["q_mo", "NM-1040", "Mohammed Rahman", "112", "2018 Skoda Octavia Estate", "MR18 SKO", "a/c regas + cabin filter", "air con regas and cabin filter", 9500, "2026-11-06T09:40:00.000Z"],
  ["q_olivia", "NM-1027", "Olivia Brooks", "113", "2021 Kia Sportage", "OB21 KSP", "4x Michelin Primacy 4 + 4 wheel alignment", "four new tyres and wheel alignment", 52000, "2026-10-27T10:00:00.000Z"],
  ["q_james", "NM-1034", "James Carter", "114", "2015 Land Rover Discovery Sport", "JC15 LRD", "front pads & discs + brake fluid", "front brakes and brake fluid change", 41000, "2026-11-03T15:00:00.000Z"],
  ["q_hannah", "NM-1028", "Hannah Price", "115", "2019 Mini Cooper", "HP19 MNC", "clutch kit + DMF", "clutch replacement", 78000, "2026-10-28T12:00:00.000Z"],
  ["q_kwame", "NM-1041", "Kwame Mensah", "116", "2017 Mercedes C220d", "KM17 MBC", "full service + front wiper motor", "full service and front wiper motor", 46500, "2026-11-06T10:30:00.000Z"],
  ["q_lucy", "NM-1019", "Lucy Fletcher", "117", "2016 Peugeot 208", "LF16 PGT", "cambelt + aux belt", "cambelt and auxiliary belt", 39500, "2026-10-19T10:00:00.000Z"],
  ["q_ryan", "NM-1033", "Ryan Murphy", "118", "2013 Ford Focus", "RM13 FFC", "exhaust centre section + MOT retest", "exhaust repair and MOT retest", 21000, "2026-11-02T09:30:00.000Z"],
  ["q_zara", "NM-1024", "Zara Ahmed", "119", "2020 Hyundai Tucson", "ZA70 HTC", "front lower arms (pair)", "front suspension arms", 36500, "2026-10-22T11:00:00.000Z"],
  ["q_peter", "NM-1016", "Peter Lawson", "120", "2012 Volvo XC60", "PL12 VXC", "turbo actuator repair", "turbo actuator repair", 89000, "2026-10-15T09:00:00.000Z"],
  ["q_megan", "NM-1026", "Megan Davies", "121", "2018 Fiat 500", "MD18 FTF", "gearbox mount + clutch hydraulics", "gearbox mount and clutch hydraulics", 45500, "2026-10-26T09:00:00.000Z"],
];
for (const [id, ref, name, tail, vehicle, registration, job, wording, amountPence, sent] of more) {
  seedQuotes.push(
    quote({
      id,
      sourceQuoteId: ref,
      customerName: name,
      phone: `+447700900${tail}`,
      vehicle,
      registration,
      job,
      customerJobDescription: wording,
      amountPence,
      quoteSentAt: sent,
      statusConfirmedAt: sent,
      eligibilityEvidenceRef: `Job card ${ref}: SMS follow-up consent ticked`,
    }),
  );
}

export function emptyState(now: string): AppState {
  return {
    now,
    garages: [structuredClone(garage)],
    templates: structuredClone(templates),
    quotes: structuredClone(seedQuotes),
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
 * Builds the demo by replaying the past four weeks through the real engine, so seeded history obeys
 * exactly the same rules as live clicks. Each working morning staff confirm open quotes and the 10:00
 * check drafts what is due (all approved, as staff did); dated events add replies, bookings and payments.
 */
export async function buildSeedState(): Promise<AppState> {
  const s = emptyState("2026-10-15T08:00:00.000Z");
  const provider = new MockSmsProvider("accept");
  const events: [string, () => unknown][] = [];
  const on = (iso: string, fn: () => unknown) => events.push([iso, fn]);
  const sendAll = () => approveAndSendAll(s, provider);
  const phone = (id: string) => s.quotes.find((q) => q.id === id)!.phone;
  const answer = (id: string, body: string) => reply(s, phone(id), body);
  const book = (id: string, day: string, time = "09:00") =>
    bookJob(s, id, { startAt: fromLondonInput(`${day}T${time}`), durationMins: 180, notes: "", customerConfirmation: "Customer accepted by phone" }, DEMO_STAFF);
  const complete = async (id: string, pence: number) => {
    markCompleted(s, id, pence, DEMO_STAFF); // raises the invoice; its text goes straight out
    await sendAll();
  };
  const paid = (id: string) => markInvoicePaid(s, s.invoices.find((i) => i.quoteId === id)!.id, DEMO_STAFF);

  // Daily routine, 15 Oct to 10 Nov: morning status check, then the 10:00 follow-up and invoice check.
  for (let d = Date.parse("2026-10-15T00:00:00.000Z"); d <= Date.parse("2026-11-10T00:00:00.000Z"); d += 86_400_000) {
    const day = new Date(d).toISOString().slice(0, 10);
    on(`${day}T08:45:00.000Z`, () => {
      for (const q of s.quotes) {
        if (q.status === "open" && q.quoteSentAt <= s.now && !q.unresolvedReply && q.booking !== "requested") confirmStatus(s, q.id, "open", DEMO_STAFF);
      }
    });
    on(`${day}T10:00:00.000Z`, async () => {
      runFollowUpCheck(s);
      runInvoiceCheck(s);
      await sendAll();
    });
  }

  // Peter: booked straight away; job done 26 Oct. Two payment reminders sent, still unpaid: needs a call.
  on("2026-10-16T14:00:00.000Z", () => book("q_peter", "2026-10-26"));
  on("2026-10-26T15:00:00.000Z", () => complete("q_peter", 89000));
  // Lucy: booked before her first follow-up, job done 26 Oct, paid two days later.
  on("2026-10-21T09:00:00.000Z", () => book("q_lucy", "2026-10-26"));
  on("2026-10-26T16:10:00.000Z", () => complete("q_lucy", 39500));
  on("2026-10-28T11:00:00.000Z", () => paid("q_lucy"));
  // Fay: booked 22 Oct, job done Tue 3 Nov. Invoice texted that afternoon, first payment reminder Tue 10 Nov; still unpaid.
  on("2026-10-22T09:30:00.000Z", () => book("q_fay", "2026-11-03"));
  on("2026-11-03T15:30:00.000Z", () => complete("q_fay", 51250));
  // Zara: replied to her first follow-up to book; job done 30 Oct; paid after the first reminder.
  on("2026-10-26T13:00:00.000Z", () => answer("q_zara", "Yes go ahead please, when can you fit it in?"));
  on("2026-10-27T09:15:00.000Z", () => book("q_zara", "2026-10-30"));
  on("2026-10-30T15:45:00.000Z", () => complete("q_zara", 36500));
  on("2026-11-09T12:30:00.000Z", () => paid("q_zara"));
  // Megan: two follow-ups, then said no.
  on("2026-11-03T18:05:00.000Z", () => answer("q_megan", "No thanks, I'm getting it done elsewhere."));
  on("2026-11-04T09:30:00.000Z", () => recordOutcome(s, "q_megan", "declined", DEMO_STAFF));
  // Hannah: phoned to book after her first follow-up; booked in for Mon 16 Nov.
  on("2026-11-02T09:20:00.000Z", () => book("q_hannah", "2026-11-16"));
  // Ryan: booked in for Thu 5 Nov, a little extra on the day; invoice due 12 Nov.
  on("2026-11-03T10:30:00.000Z", () => book("q_ryan", "2026-11-05"));
  on("2026-11-05T15:20:00.000Z", () => complete("q_ryan", 22400));
  // Olivia: no answer to either follow-up; staff set a reminder for 10 Nov, now overdue.
  on("2026-11-05T11:00:00.000Z", () => recordOutcome(s, "q_olivia", "no_reply", DEMO_STAFF, "2026-11-10"));
  // James: replied to book for Tue 10 Nov. Brake fluid was overdue and a wiper blade split: he agreed both
  // by phone, so the completed job has extra work and its invoice draft is waiting to be checked and issued.
  on("2026-11-05T12:10:00.000Z", () => answer("q_james", "That's fine, can you do Tuesday next week?"));
  on("2026-11-05T16:00:00.000Z", () => book("q_james", "2026-11-10", "08:30"));
  on("2026-11-10T08:40:00.000Z", () => startJob(s, s.jobs.find((j) => j.quoteId === "q_james")!.id, DEMO_STAFF));
  on("2026-11-10T16:20:00.000Z", () => {
    const j = s.jobs.find((x) => x.quoteId === "q_james")!;
    completeJob(s, j.id, {
      vatRatePercent: 20,
      discountPence: 0,
      lines: [
        { id: "f1", kind: "part", description: "Front brake discs (pair)", quantity: 1, unitPence: 12400 },
        { id: "f2", kind: "part", description: "Front brake pads (set)", quantity: 1, unitPence: 5600 },
        { id: "f3", kind: "part", description: "DOT 4 brake fluid, 1 litre", quantity: 1, unitPence: 1450 },
        { id: "f4", kind: "labour", description: "Labour: front brakes and fluid change", quantity: 2.5, unitPence: 5500 },
        { id: "f5", kind: "part", description: "Wiper blade, driver side", quantity: 1, unitPence: 1650 },
      ],
      extraWorkReason: "Driver's wiper blade split during the job",
      extraWorkAuthorisation: "James agreed by phone at 14:10 (Mia)",
      completionNotes: "Rear pads at 4mm, advise at next service.",
    }, DEMO_STAFF);
  });
  // Daniel replies STOP to his first follow-up.
  on("2026-11-06T12:05:00.000Z", () => answer("q_dan", "STOP"));
  // Sophie: wants to wait for payday; reminder Mon 16 Nov.
  on("2026-11-09T15:30:00.000Z", () => recordOutcome(s, "q_sophie", "needs_time", DEMO_STAFF, "2026-11-16"));
  // Kwame: phoned to accept; booked in for this morning and now in the workshop.
  on("2026-11-09T14:00:00.000Z", () => book("q_kwame", "2026-11-11", "08:30"));
  on("2026-11-11T08:45:00.000Z", () => startJob(s, s.jobs.find((j) => j.quoteId === "q_kwame")!.id, DEMO_STAFF));
  // Ben wants to book after his first follow-up.
  on("2026-11-09T11:12:00.000Z", () => answer("q_ben", "Yes please, can you fit me in this Friday morning?"));
  // Mohammed asks about the price after his first follow-up.
  on("2026-11-10T13:15:00.000Z", () => answer("q_mo", "Does the £95 include the cabin filter?"));
  // Emma phones the garage and books before her second reminder.
  on("2026-11-10T15:00:00.000Z", () => book("q_emma", "2026-11-11", "14:00"));
  // Chloe asks about price; Liam asks to book.
  on("2026-11-10T18:40:00.000Z", () => answer("q_chloe", "Is £420 the best you can do? Bit more than I expected."));
  on("2026-11-10T19:20:00.000Z", () => answer("q_liam", "Can I bring it in next Tuesday morning?"));
  // Wed 11 Nov morning: staff confirm the open quotes are still open.
  on("2026-11-11T08:40:00.000Z", () => {
    for (const q of s.quotes) if (q.status === "open" && !q.unresolvedReply && q.booking !== "requested") confirmStatus(s, q.id, "open", DEMO_STAFF);
  });

  events.sort((a, b) => a[0].localeCompare(b[0])); // stable: same-time events keep the order above
  for (const [iso, fn] of events) {
    s.now = iso;
    await fn();
  }
  s.now = DEMO_START;
  return s;
}

export const REPLY_PRESETS: { label: string; body: string }[] = [
  { label: "Wants to book", body: "Yes please, can you do Friday?" },
  { label: "Price question", body: "Any chance you can do it a bit cheaper?" },
  { label: "Safety question", body: "Is it safe to drive until then? The brakes are squealing." },
  { label: "Complaint", body: "Not happy, I was told it would be less than this." },
  { label: "STOP", body: "STOP" },
];
