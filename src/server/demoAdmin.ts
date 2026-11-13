import { DEMO_GARAGE_ID } from "@/demo/seed";
import type { GarageRow } from "./auth";

// The demo's admin console data: kept in this server process's memory, so it resets when the app restarts.
// shortcut: in-memory and shared by everyone using this local demo; the hosted product uses Supabase instead.
const garages: GarageRow[] = [
  {
    id: DEMO_GARAGE_ID,
    name: "Riverside Garage",
    created_at: "2026-11-01T09:00:00.000Z",
    members: [{ email: "demo", role: "owner", confirmed: true }],
    sms: { phone: "+447700900000", status: "simulated" },
  },
];

export const demoGarages = () => garages;

export function demoCreateGarage(name: string, owner: string): void {
  garages.unshift({ id: crypto.randomUUID(), name, created_at: new Date().toISOString(), members: [{ email: owner, role: "owner", confirmed: false }], sms: null });
}

/** Adds a user to a garage. Returns a problem to show, or null. */
export function demoAddUser(garageId: string, email: string, role: "owner" | "staff"): string | null {
  const g = garages.find((x) => x.id === garageId);
  if (!g) return "Choose a garage.";
  if (garages.some((x) => x.members.some((m) => m.email === email))) return "That email already has an account. Each account belongs to one garage.";
  g.members.push({ email, role, confirmed: false });
  return null;
}
