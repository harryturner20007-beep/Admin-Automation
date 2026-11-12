import { SettingsView } from "@/components/SettingsView";

// Client-only demo (data lives in browser storage): nothing to prerender, so skip instant-navigation validation.
// Revisit when Phase 2 moves data to the server.
export const instant = false;

export const metadata = { title: "Follow-up settings · Quote follow-up demo" };

export default function SettingsPage() {
  return <SettingsView />;
}
