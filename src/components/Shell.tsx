"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { setGaragePaused } from "@/domain/engine";
import { formatLondon, HOUR_MS, DAY_MS } from "@/domain/time";
import type { ProviderMode } from "@/domain/types";
import { useDemo } from "@/demo/store";
import { ResetDemo } from "./ResetDemo";
import { Toast } from "./Toast";
import { Icon, type IconName } from "./ui";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/quotes", label: "Quotes", icon: "quotes" },
  { href: "/replies", label: "Replies", icon: "inbox" },
  { href: "/results", label: "Results", icon: "results" },
];

const demoBtn = "rounded px-2 py-0.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-signal";

export function Shell({ children }: { children: ReactNode }) {
  const { state, garageId, staff, act, advanceClock, setProviderMode, epoch } = useDemo();
  const path = usePathname();
  const garage = state.garages.find((g) => g.id === garageId)!;
  const unread = state.tasks.filter((t) => t.garageId === garageId && t.status === "open" && !t.readAt).length;

  return (
    <div className="min-h-full">
      {/* lg: fixed 86px tall (48 + 36 + 2 borders). QuoteDetails, AddQuoteDrawer and LoadingSkeleton depend on it. */}
      <header className="z-20 border-b border-graphite bg-graphite text-white lg:sticky lg:top-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 lg:h-12 lg:py-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded bg-signal text-white"><Icon name="bolt" className="h-3.5 w-3.5" /></span>
            <span className="truncate text-sm font-semibold [font-stretch:110%]">{garage.name}</span>
          </div>

          <nav aria-label="Main" className="flex gap-1">
            {TABS.map((t) => {
              const active = path?.startsWith(t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-signal ${active ? "bg-white/10 text-white" : "text-steel hover:bg-white/6 hover:text-white"}`}
                >
                  <Icon name={t.icon} />
                  {t.label}
                  {t.href === "/replies" && unread > 0 && (
                    <span className="rounded-full bg-signal px-1.5 text-[11px] leading-4 font-bold text-white tabular-nums">
                      {unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <Link
            href="/settings"
            aria-current={path?.startsWith("/settings") ? "page" : undefined}
            className={`ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-signal ${path?.startsWith("/settings") ? "bg-white/10 text-white" : "text-steel hover:bg-white/6 hover:text-white"}`}
          >
            <Icon name="sliders" />
            <span className="sr-only sm:not-sr-only">Follow-up settings</span>
          </Link>
          <label className={`flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1 text-sm transition-colors ${garage.paused ? "bg-red-600 text-white" : "text-slate-300 hover:bg-white/6"}`}>
            <input
              type="checkbox"
              className="h-4 w-4 accent-red-500"
              checked={garage.paused}
              onChange={(e) => act((s) => setGaragePaused(s, garageId, e.target.checked, staff))}
            />
            <Icon name="pause" />
            {garage.paused ? "Sending stopped" : "Pause all sending"}
          </label>
        </div>

        <div className="border-t border-white/8 bg-graphite-2">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-1.5 text-xs text-steel lg:h-9 lg:py-0">
            {/* Dashed outline = simulated, everywhere in the app. */}
            <span className="rounded border border-dashed border-white/35 px-1.5 py-0.5 font-medium text-white">Demo mode: sample data</span>
            <span className="flex items-center gap-1">
              <Icon name="clock" className="h-3.5 w-3.5" />
              <span className="font-medium text-slate-100 tabular-nums">{formatLondon(state.now)}</span>
              <button className={demoBtn} onClick={() => advanceClock(HOUR_MS)}>+1 hour</button>
              <button className={demoBtn} onClick={() => advanceClock(DAY_MS)}>+1 day</button>
            </span>
            <label className="flex items-center gap-1.5">
              Mock SMS (no real texts)
              <select
                className="rounded border border-white/15 bg-graphite px-1.5 py-0.5 text-xs text-slate-100 focus-visible:outline-2 focus-visible:outline-signal"
                value={state.providerMode}
                onChange={(e) => setProviderMode(e.target.value as ProviderMode)}
              >
                <option value="accept">accepts and delivers</option>
                <option value="reject">rejects</option>
                <option value="timeout">times out</option>
              </select>
            </label>
            <span className="ml-auto"><ResetDemo dark /></span>
          </div>
        </div>
      </header>

      {garage.paused && (
        <div role="status" className="border-b border-red-200 bg-red-50 px-4 py-2 text-center text-sm text-red-800">
          Sending is stopped for {garage.name}. Nothing will be drafted or sent until you switch it back on.
        </div>
      )}

      {/* Re-mounting on reset clears filters, search, open panels and expanded replies. */}
      {/* Each screen draws its own full-bleed graphite band and work-area container. */}
      <main key={epoch}>{children}</main>
      <Toast />
    </div>
  );
}
