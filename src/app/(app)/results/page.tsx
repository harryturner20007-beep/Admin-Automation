import { ResultsView } from "@/components/ResultsView";

// Client-only demo (data lives in browser storage): nothing to prerender, so skip instant-navigation validation.
// Revisit when Phase 2 moves data to the server.
export const instant = false;

export const metadata = { title: "Results · Revloop" };

export default function ResultsPage() {
  return <ResultsView />;
}
