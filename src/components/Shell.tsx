"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { gsap } from "gsap";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { setGaragePaused } from "@/domain/engine";
import { formatLondon, HOUR_MS, DAY_MS } from "@/domain/time";
import type { ProviderMode } from "@/domain/types";
import { useDemo } from "@/demo/store";
import { motionAllowed } from "./motion";
import { ResetDemo } from "./ResetDemo";
import { Toast } from "./Toast";
import { leaveGarage, signOut } from "@/server/auth";
import { Icon, type IconName } from "./ui";

// The workflow: quote → booked job → completed job → invoice → payment.
// `gap` starts a new group in the sidebar: overview, the work, talking to customers, running the garage.
const TABS: { href: string; label: string; icon: IconName; gap?: boolean }[] = [
  { href: "/overview", label: "Overview", icon: "home" },
  { href: "/quotes", label: "Quotes", icon: "quotes", gap: true },
  { href: "/jobs", label: "Jobs", icon: "wrench" },
  { href: "/invoices", label: "Invoices", icon: "pound" },
  { href: "/chats", label: "Chats", icon: "inbox", gap: true },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/results", label: "Results", icon: "results", gap: true },
  { href: "/settings", label: "Settings", icon: "sliders" },
];

type User = { email: string; garageName: string; platformAdmin: boolean; adminView?: boolean };

function SyncBadge() {
  const { sync, hosted } = useDemo();
  if (!hosted) return null;
  const text = sync.state === "saved" ? "All changes saved" : sync.state === "saving" ? "Saving…" : sync.message;
  return (
    <span role="status" aria-live="polite" className={`text-xs ${sync.state === "saved" ? "text-muted" : sync.state === "saving" ? "text-text" : "font-medium text-danger"}`}>
      {text}
      {sync.state === "signed_out" && (
        <a href="/login" target="_blank" rel="noopener" className="ml-2 underline">Sign in (new tab)</a>
      )}
    </span>
  );
}

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const focusOnNavy = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/**
 * App shell (.design/patterns/shell-and-states.md):
 * ≥1200px a 208px sidebar, 768–1199px a 64px icon rail, <768px the top navigation bar.
 */
export function Shell({ children, user }: { children: ReactNode; user?: User }) {
  const { state, garageId, staff, act, advanceClock, setProviderMode, epoch, hosted } = useDemo();
  const path = usePathname() ?? "";
  const garage = state.garages.find((g) => g.id === garageId)!;
  const unread = state.tasks.filter((t) => t.garageId === garageId && t.status === "open" && !t.readAt).length;
  const togglePause = () => act((s) => setGaragePaused(s, garageId, !garage.paused, staff));
  const router = useRouter();
  const [query, setQuery] = useState("");
  const search = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/quotes?q=${encodeURIComponent(query.trim())}`);
  };

  // Active-link edge: placed on first paint, then slides (200ms power2.out) between the main links.
  const nav = useRef<HTMLElement>(null);
  const edge = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  useLayoutEffect(() => {
    const e = edge.current;
    const a = nav.current?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!e) return;
    if (!a) {
      gsap.set(e, { opacity: 0 });
      placed.current = false;
      return;
    }
    const to = { y: a.offsetTop, height: a.offsetHeight, opacity: 1 };
    if (!placed.current || !motionAllowed()) {
      gsap.set(e, to);
      placed.current = true;
      return;
    }
    const t = gsap.to(e, { ...to, duration: 0.2, ease: "power2.out" });
    return () => {
      t.kill();
    };
  }, [path]);

  const badge = (t: (typeof TABS)[number], rail = false) =>
    t.href === "/chats" && unread > 0 ? (
      <span aria-hidden className={`rounded-full bg-brand px-1.5 text-navy text-[11px] leading-4 font-semibold tabular-nums ${rail ? "absolute top-1 right-1 desk:static" : ""}`}>
        {unread}
      </span>
    ) : null;

  return (
    <div className="app-backdrop min-h-screen desk:p-4">
     <div className="min-h-full md:flex desk:min-h-[calc(100vh-2rem)]">
      {/* Sidebar (≥1200) / icon rail (768–1199): dark frosted glass over the backdrop */}
      <aside aria-label="App" className="glass-dark sticky top-0 z-30 hidden h-screen w-16 shrink-0 flex-col text-white md:flex desk:top-4 desk:h-[calc(100vh-2rem)] desk:w-[208px] desk:rounded-l-[22px] desk:border desk:border-r-0 desk:border-white/10">
        <div className="flex min-h-16 items-center gap-2.5 px-4 py-3">
          <Image src="/revloop-mark.png" alt="" width={28} height={25} className="h-auto w-7 shrink-0" priority />
          <span className="min-w-0">
            <span className="sr-only text-lg leading-tight font-extrabold tracking-tight desk:not-sr-only desk:block">Revloop</span>
            <span className="sr-only truncate text-xs text-white/70 desk:not-sr-only desk:block">{garage.name}</span>
          </span>
        </div>
        <nav ref={nav} aria-label="Main" className="relative flex flex-1 flex-col gap-1 px-2 py-2">
          <span ref={edge} aria-hidden className="absolute top-0 left-2 z-10 w-[3px] rounded-full bg-brand opacity-0" />
          {TABS.map((t) => {
            const active = path.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                data-gap={t.gap || undefined}
                aria-current={active ? "page" : undefined}
                aria-label={`${t.label}${t.href === "/chats" && unread ? `, ${unread} unread` : ""}`}
                title={t.label}
                className={`hover-x2 relative flex min-h-11 shrink-0 items-center data-[gap]:mt-4 justify-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors desk:justify-start ${focusOnNavy} ${active ? "bg-accent text-white" : "text-white/75 hover:bg-white/10 hover:text-white"}`}
              >
                <Icon name={t.icon} className="nudge-icon h-5 w-5" />
                <span className="hidden flex-1 desk:inline">{t.label}</span>
                {badge(t, true)}
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col gap-1 border-t border-white/10 px-2 py-3">
          <button
            aria-pressed={garage.paused}
            aria-label="Pause all sending"
            title={garage.paused ? "Sending paused. Click to resume" : "Pause all sending"}
            onClick={togglePause}
            className={`flex min-h-11 items-center justify-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors desk:justify-start ${focusOnNavy} ${garage.paused ? "bg-danger-bg text-danger" : "text-white/75 hover:bg-white/10 hover:text-white"}`}
          >
            <Icon name="pause" className="h-5 w-5" />
            <span className="hidden desk:inline">{garage.paused ? "Sending paused" : "Pause all sending"}</span>
          </button>
          {user && (
            <form action={signOut} className="hidden px-3 pt-2 text-xs text-white/70 desk:block">
              <span className="block truncate" title={user.email}>{user.email}</span>
              {user.platformAdmin && <Link href="/admin" className={`mr-3 underline hover:text-white ${focusOnNavy}`}>Admin</Link>}
              <button className={`min-h-8 underline hover:text-white ${focusOnNavy}`}>Sign out</button>
            </form>
          )}
          {user && (
            <form action={signOut} className="desk:hidden">
              <button aria-label={`Sign out ${user.email}`} title="Sign out" className={`flex min-h-11 w-full items-center justify-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white ${focusOnNavy}`}>
                <Icon name="logout" className="h-5 w-5" />
              </button>
            </form>
          )}
        </div>
      </aside>

      <div className="relative min-w-0 flex-1">
      {/* Light frosted pane behind the content. A sibling, never a parent, so fixed drawers stay fixed to the screen. */}
      <div aria-hidden className="glass-light absolute inset-0 desk:rounded-r-[22px] desk:border desk:border-l-0 desk:border-white/30" />
      <div className="relative">
      {/* Mobile top navigation (<768px) */}
      <header className="border-b border-line bg-white md:hidden">
        <div className="flex items-center gap-1 px-4 pt-2">
          <Image src="/revloop-mark.png" alt="Revloop" width={24} height={22} className="h-auto w-6" priority />
          <span className="ml-1 min-w-0 flex-1 truncate text-sm font-semibold text-text">{garage.name}</span>
          {user && (
            <form action={signOut}>
              <button className={`min-h-11 rounded-lg px-2 text-xs font-medium text-muted hover:bg-canvas ${focus}`}>Sign out</button>
            </form>
          )}
          <button aria-pressed={garage.paused} aria-label="Pause all sending" onClick={togglePause} className={`grid h-11 w-11 place-items-center rounded-lg ${focus} ${garage.paused ? "bg-danger-bg text-danger" : "text-muted hover:bg-canvas"}`}>
            <Icon name="pause" className="h-5 w-5" />
          </button>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2">
          {TABS.map((t) => {
            const active = path.startsWith(t.href);
            return (
              <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={`flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-lg px-3 text-sm font-medium ${focus} ${active ? "bg-selected text-accent" : "text-muted hover:bg-canvas"}`}>
                <Icon name={t.icon} className="hidden h-4 w-4 min-[440px]:block" />
                {t.label}
                {badge(t)}
                {t.href === "/chats" && unread > 0 && <span className="sr-only">, {unread} unread</span>}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Top bar (≥768px): search everything, and the one action staff use most */}
      <div className="hidden flex-wrap items-center gap-3 px-4 pt-4 md:flex md:px-8">
        <form role="search" onSubmit={search} className="min-w-0 flex-1">
          <label htmlFor="global-search" className="sr-only">Search quotes</label>
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="global-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customers, plates, quote refs, numbers"
              className={`min-h-11 w-full rounded-xl border border-white/60 bg-white pr-3 pl-10 text-sm text-text shadow-card placeholder:text-muted ${focus}`}
            />
          </div>
        </form>
        <Link href="/chats" className={`inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/60 bg-white px-4 text-sm font-medium text-text shadow-card hover:bg-canvas ${focus}`}>
          <Icon name="inbox" className="h-4 w-4 text-muted" /> Chats
          {unread > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] leading-4 font-semibold text-white tabular-nums">{unread}</span>}
        </Link>
        <button type="button" onClick={() => router.push(`/quotes?add=${Date.now()}`)} className={`inline-flex min-h-11 items-center gap-2 rounded-xl bg-navy px-4 text-sm font-medium text-white shadow-card hover:bg-graphite-2 ${focus}`}>
          <Icon name="plus" className="h-4 w-4" /> Add quote
        </button>
      </div>

      {user?.adminView && (
        <form action={leaveGarage} role="status" className="flex flex-wrap items-center justify-center gap-3 border-b border-attention/30 bg-attention-bg px-4 py-2 text-sm text-attention">
          Platform admin: you are working in {user.garageName}&apos;s dashboard. {hosted ? "Changes you make are real and recorded." : "Demo: sample data only."}
          <button className={`min-h-8 rounded-lg bg-white px-3 font-medium text-text ring-1 ring-line ring-inset hover:bg-canvas ${focus}`}>Back to admin</button>
        </form>
      )}

      {hosted && (
        <div className="flex min-h-8 items-center justify-end border-b border-line bg-white px-4 md:px-8">
          <SyncBadge />
        </div>
      )}

      {/* Demo controls: a simulated clock and SMS provider, never part of the real product. */}
      {!hosted && <div className="mx-4 mt-3 rounded-xl border border-white/60 bg-white/70 md:mx-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-xs text-muted md:px-8">
          <span className="rounded border border-dashed border-muted/60 px-1.5 py-0.5 font-medium text-text">Demo mode: sample data</span>
          <span className="flex items-center gap-1">
            <Icon name="clock" className="h-3.5 w-3.5" />
            <span className="font-medium text-text tabular-nums">{formatLondon(state.now)}</span>
            <button className={`rounded px-2 py-1 hover:bg-canvas hover:text-text ${focus}`} onClick={() => advanceClock(HOUR_MS)}>+1 hour</button>
            <button className={`rounded px-2 py-1 hover:bg-canvas hover:text-text ${focus}`} onClick={() => advanceClock(DAY_MS)}>+1 day</button>
          </span>
          <label className="flex items-center gap-1.5">
            Mock SMS (no real texts)
            <select className={`rounded border border-line bg-white px-1.5 py-1 text-xs text-text ${focus}`} value={state.providerMode} onChange={(e) => setProviderMode(e.target.value as ProviderMode)}>
              <option value="accept">accepts and delivers</option>
              <option value="reject">rejects</option>
              <option value="timeout">times out</option>
            </select>
          </label>
          <span className="ml-auto"><ResetDemo /></span>
        </div>
      </div>}

      {garage.paused && (
        <div role="status" className="border-b border-danger/20 bg-danger-bg px-4 py-2 text-center text-sm text-danger">
          Sending is paused for {garage.name}. Nothing will be drafted or sent until you resume it.
        </div>
      )}

      {/* Re-mounting on reset clears filters, search, open panels and expanded replies.
          Pages other than Quotes keep their own display type (Archivo). */}
      <main key={epoch} className={["/overview", "/quotes", "/jobs", "/invoices", "/calendar", "/settings"].some((p) => path.startsWith(p)) ? undefined : "font-display"}>{children}</main>
      </div>
      </div>
     </div>
      <Toast />
    </div>
  );
}
