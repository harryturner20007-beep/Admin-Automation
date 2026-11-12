"use client";

// The four motion primitives from .design/primitives.md (line reveal, rise-in, hover nudge, panel slide).
// Hover nudges are CSS only (globals.css: .hover-x2 / .hover-x4 / .hover-turn on the parent, .nudge-icon on the icon).
import { gsap } from "gsap";
import { useLayoutEffect, useRef, type ReactNode } from "react";

/** False when the user asked for reduced motion; checked right before any tween starts (gsap.matchMedia caches). */
export const motionAllowed = () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Line-reveal markup: each word clipped in its own box. Put aria-label={text} on the parent. */
export function Words({ text }: { text: string }) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (
      <span key={i}>
        {i > 0 && " "}
        <span aria-hidden className="-mb-[0.12em] inline-block overflow-hidden pb-[0.12em] align-top">
          <span data-word className="inline-block">{w}</span>
        </span>
      </span>
    ));
}

/** Line reveal on every [data-word] inside scope. Caller checks motionAllowed() and reverts the tween. */
export const lineReveal = (scope: Element) =>
  gsap.from(scope.querySelectorAll("[data-word]"), { yPercent: 100, opacity: 0, duration: 0.42, ease: "expo.out", stagger: 0.06, clearProps: "transform,opacity" });

/** Rise-in vars for gsap.from (add delay / stagger per block). */
export const RISE = { y: 12, opacity: 0, duration: 0.26, ease: "power3.out", clearProps: "transform,opacity" } as const;

/**
 * A number that tweens old → new (400ms power2.out) when it changes, formatted every frame in whole `step`s.
 * The span's text is owned here, not by React, so frames never fight a re-render. `format` must be stable.
 */
export function CountTo({ value, format, step = 1 }: { value: number; format: (n: number) => string; step?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(value);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = last.current;
    last.current = value;
    if (from === value || !motionAllowed()) {
      el.textContent = format(value);
      return;
    }
    const o = { v: from };
    el.textContent = format(from);
    const t = gsap.to(o, { v: value, duration: 0.4, ease: "power2.out", onUpdate: () => {
        el.textContent = format(o.v === value ? value : Math.round(o.v / step) * step); // in-between frames in whole steps (e.g. pounds)
      },
    });
    return () => {
      t.kill();
      el.textContent = format(value);
    };
  }, [value, format, step]);
  return <span ref={ref} />;
}

/** Rise-in wrapper: plays once when it first enters the viewport (at once if already on screen). */
export function Rise({ delay = 0, play = true, className, children }: { delay?: number; play?: boolean; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !play || !motionAllowed()) return;
    gsap.set(el, { y: RISE.y, opacity: 0 }); // before first paint, so nothing jumps
    let tween: gsap.core.Tween | undefined;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      tween = gsap.to(el, { y: 0, opacity: 1, duration: RISE.duration, ease: RISE.ease, delay: delay / 1000, clearProps: RISE.clearProps });
    });
    io.observe(el);
    return () => {
      io.disconnect();
      tween?.kill();
      gsap.set(el, { clearProps: "transform,opacity" });
    };
  }, [play, delay]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
