import { InvoicesView } from "@/components/InvoicesView";

// Client-only demo (data lives in browser storage): nothing to prerender, so skip instant-navigation validation.
export const instant = false;

export const metadata = { title: "Invoices · Quote follow-up demo" };

export default function InvoicesPage() {
  return <InvoicesView />;
}
