import { CalendarView } from "@/components/CalendarView";
import { Suspense } from "react";

// Client-only demo (data lives in browser storage): nothing to prerender, so skip instant-navigation validation.
export const instant = false;

export const metadata = { title: "Calendar · Revloop" };

export default function CalendarPage() {
  return <Suspense><CalendarView /></Suspense>;
}
