import { Icon } from "../ui";
import { HeroPreview } from "./HeroPreview";
import { PressLink, Reveal } from "./reveal";

/**
 * Centered copy over a real-looking preview of a quote moving through follow-ups. The grid and the round
 * accent shape behind it are solid and static (the design rules forbid gradients); only the text group and
 * the preview enter, each once, on load.
 */
export function Hero({ href, label, note, ctaClass }: { href: string; label: string; note: string; ctaClass: string }) {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden border-b border-line">
      <svg aria-hidden className="pointer-events-none absolute inset-0 -z-20 h-full w-full text-line">
        <defs>
          <pattern id="hero-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M48 0H0V48" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hero-grid)" />
      </svg>
      <div aria-hidden className="pointer-events-none absolute top-[-220px] left-1/2 -z-10 h-[520px] w-[920px] max-w-none -translate-x-1/2 rounded-full bg-selected" />

      <div className="mx-auto max-w-5xl px-4 pt-10 pb-12 md:px-8 md:pt-14 md:pb-16">
        <Reveal mount className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-sm font-medium text-muted">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            Quote follow-up for repair shops
          </span>
          <h1 id="hero-title" className="mt-5 text-[34px] leading-[1.1] font-[650] tracking-tight text-balance md:text-[52px]">Turn more repair quotes into booked jobs</h1>
          <p className="mt-4 max-w-xl text-lg text-pretty text-muted">Add a quote. We text the customer twice, flag any reply for your team, and put the jobs you book in your diary.</p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <PressLink href={href} className={ctaClass}>
              {label} <Icon name="next" className="ml-2 h-4 w-4" />
            </PressLink>
            <span className="text-base text-muted">{note}</span>
          </div>
        </Reveal>

        <Reveal mount media className="mt-10 md:mt-12">
          <HeroPreview />
        </Reveal>
      </div>
    </section>
  );
}
