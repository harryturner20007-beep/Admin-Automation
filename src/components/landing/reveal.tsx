"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useState } from "react";

// Entrance and press motion for the landing page, using Motion's own props (initial, animate, whileInView,
// whileHover, whileTap). Everything tweens opacity 0 → 1 with one easing; reduced motion shows the final
// state at once, with no delay, stagger or press feedback.
const EASE = [0.22, 1, 0.36, 1] as const;

// Phones are below 768px, where the site switches to its stacked mobile layout (Tailwind's md breakpoint).
const PHONE = "(max-width: 767px)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(PHONE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const usePhone = () => useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => false);

/** True while the element is taller than the viewport, where 15% visible may never happen. */
function useTall(ref: React.RefObject<HTMLElement | null>) {
  const [tall, setTall] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setTall(el.offsetHeight > window.innerHeight);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [ref]);
  return tall;
}

const TAGS = { div: motion.div, li: motion.li, section: motion.section };

/**
 * One entrance for a group (heading + copy + actions, or a whole card collection).
 * `mount`: plays on load (hero). Otherwise plays once when 15% is visible, 0.1s after entering view.
 * `stagger`: position among 2–4 sibling cards that show steps; adds 0.1s per place (none on phones).
 * `media`: a standalone visual. It scales 0.98 → 1 and never moves, at every breakpoint.
 */
export function Reveal({ children, className, as = "div", mount = false, media = false, stagger = 0, labelledBy }: { children: ReactNode; className?: string; as?: keyof typeof TAGS; mount?: boolean; media?: boolean; stagger?: number; labelledBy?: string }) {
  const reduce = useReducedMotion();
  const phone = usePhone();
  const ref = useRef<HTMLElement>(null);
  const tall = useTall(ref);
  const Tag = TAGS[as];
  const shown = media ? { opacity: 1, scale: 1 } : { opacity: 1, y: 0 };
  return (
    <Tag
      ref={ref as never}
      data-reveal=""
      aria-labelledby={labelledBy}
      className={className}
      initial={reduce ? false : media ? { opacity: 0, scale: 0.98 } : { opacity: 0, y: phone ? 8 : 12 }}
      {...(mount ? { animate: shown } : { whileInView: shown, viewport: { once: true, amount: tall ? 0 : 0.15 } })}
      transition={reduce ? { duration: 0, delay: 0 } : { duration: mount ? 0.8 : 1, delay: mount ? 0 : 0.1 + (phone ? 0 : stagger * 0.1), ease: EASE }}
    >
      {children}
    </Tag>
  );
}

const MotionLink = motion.create(Link);

/** A button-style link with hover and press feedback (scale 1.01 / 0.99, 0.25s). Plain when reduced motion is on. */
export function PressLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <MotionLink href={href} className={className} {...(reduce ? {} : { whileHover: { scale: 1.01 }, whileTap: { scale: 0.99 }, transition: { duration: 0.25, delay: 0, ease: EASE } })}>
      {children}
    </MotionLink>
  );
}
