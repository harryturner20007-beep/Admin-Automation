import Link from "next/link";
import { Logo } from "@/components/Logo";

export const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
export const focusOnNavy = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const btn = "inline-flex min-h-11 items-center justify-center rounded-lg px-6 text-base font-medium transition-colors duration-150";
export const primary = `${btn} ${focus} bg-accent text-white hover:bg-accent-hover`;
export const outline = `${btn} ${focus} border border-accent text-accent hover:bg-selected`;

/** Shared top bar for the public pages. The live demo is one click; Login goes to the sign-in screen. */
export function SiteHeader() {
  return (
    <>
      <a href="#main" className={`sr-only z-50 rounded-lg bg-white px-4 py-2 font-medium text-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2 ${focus}`}>Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-line bg-white">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
          <Logo />
          <nav aria-label="Page" className="hidden gap-8 text-sm font-medium md:flex">
            <Link href="/#features" className={`hover:text-accent ${focus}`}>Features</Link>
            <Link href="/#how" className={`hover:text-accent ${focus}`}>How it works</Link>
            <Link href="/pricing" className={`hover:text-accent ${focus}`}>Pricing</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className={`hidden rounded-lg px-3 py-2 text-sm font-medium hover:text-accent sm:inline ${focus}`}>Login</Link>
            <Link href="/demo" prefetch={false} className={`${primary} px-5 text-sm`}>Try the live demo</Link>
          </div>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  const download = URL.parse(process.env.REVLOOP_WINDOWS_DOWNLOAD_URL ?? "");
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted md:px-8">
        <span>Revloop · Quotes, jobs and invoices for independent UK garages</span>
        <span className="flex flex-wrap gap-6">
          <Link href="/pricing" className={`hover:text-text ${focus}`}>Pricing</Link>
          <Link href="/demo" prefetch={false} className={`hover:text-text ${focus}`}>Live demo</Link>
          <Link href="/login" className={`hover:text-text ${focus}`}>Login</Link>
          {download?.protocol === "https:" && !download.username && !download.password && (
            <a href={download.href} className={`hover:text-text ${focus}`}>Download for Windows</a>
          )}
          <Link href="/admin/login" className={`hover:text-text ${focus}`}>Admin</Link>
        </span>
      </div>
    </footer>
  );
}
