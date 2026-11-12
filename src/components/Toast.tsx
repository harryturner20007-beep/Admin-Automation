"use client";

import { useEffect } from "react";
import { useDemo } from "@/demo/store";
import { Icon } from "./ui";

/** The one confirmation message (quote saved, follow-up drafted, booking confirmed). Clears itself after 6s. */
export function Toast() {
  const { notice, dismissNotice } = useDemo();
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(dismissNotice, 6000);
    return () => clearTimeout(t);
  }, [notice, dismissNotice]);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      {notice && (
        <div key={notice.id} className="toast-in pointer-events-auto flex max-w-xl items-start gap-3 rounded-md border-l-[3px] border-signal bg-graphite py-3 pr-2 pl-4 text-sm text-white shadow-lg shadow-graphite/20">
          <Icon name="check" className="mt-0.5 h-4 w-4 text-signal" />
          <span className="flex-1">{notice.text}</span>
          <button onClick={dismissNotice} aria-label="Dismiss" className="rounded p-0.5 text-steel hover:text-white focus-visible:outline-2 focus-visible:outline-signal">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
