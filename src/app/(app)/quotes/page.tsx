import { Suspense } from "react";
import { QuotesView } from "@/components/QuotesView";

// Client-only demo (data lives in browser storage): nothing to prerender, so skip instant-navigation validation.
// Revisit when Phase 2 moves data to the server.
export const instant = false;

export const metadata = { title: "Quotes · Revloop" };

export default function QuotesPage() {
  // QuotesView reads ?quote= (useSearchParams), which needs a Suspense boundary on a prerendered page.
  return (
    <Suspense>
      <QuotesView />
    </Suspense>
  );
}
