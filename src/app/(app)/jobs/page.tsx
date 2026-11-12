import { Suspense } from "react";
import { JobsView } from "@/components/JobsView";

export const instant = false;

export const metadata = { title: "Jobs · Garage desk" };

export default function JobsPage() {
  return (
    <Suspense>
      <JobsView />
    </Suspense>
  );
}
