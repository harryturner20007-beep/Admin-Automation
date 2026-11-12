import { Suspense } from "react";
import { InvoicesView } from "@/components/InvoicesView";

export const instant = false;

export const metadata = { title: "Invoices · Garage desk" };

export default function InvoicesPage() {
  return (
    <Suspense>
      <InvoicesView />
    </Suspense>
  );
}
