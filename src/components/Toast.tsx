"use client";

import { gsap } from "gsap";
import { useCallback, useEffect, useRef } from "react";
import { useDemo } from "@/demo/store";
import { motionAllowed } from "./motion";
import { Icon } from "./ui";

/** The one confirmation message (quote saved, follow-up drafted, booking confirmed). Clears itself after 6s. */
export function Toast() {
  const { notice, dismissNotice } = useDemo();
  const box = useRef<HTMLDivElement>(null);
  const out = useRef<gsap.core.Tween | null>(null);

  // Leaves with a 150ms fade (instant under reduced motion), then the notice is cleared.
  const leave = useCallback(() => {
    if (!box.current || !motionAllowed()) return dismissNotice();
    out.current?.kill();
    out.current = gsap.to(box.current, { opacity: 0, duration: 0.15, ease: "power1.out", onComplete: dismissNotice });
  }, [dismissNotice]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(leave, 6000);
    return () => {
      clearTimeout(t);
      out.current?.kill(); // a newer notice (or unmount) replaces this one mid-fade
      out.current = null;
    };
  }, [notice, leave]);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      {notice && (
        <div ref={box} key={notice.id} className="toast-in pointer-events-auto flex max-w-xl items-start gap-3 rounded-xl border-l-[3px] border-accent bg-text py-3 pr-2 pl-4 text-sm text-white shadow-float">
          <Icon name="check" className="mt-0.5 h-4 w-4 text-white" />
          <span className="flex-1">{notice.text}</span>
          <button onClick={leave} aria-label="Dismiss" className="grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:text-white focus-visible:outline-2 focus-visible:outline-white">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
