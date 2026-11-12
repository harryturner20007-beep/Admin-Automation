"use client";

import { useState } from "react";
import { useAction, useDemo } from "@/demo/store";
import { Button, InlineFeedback } from "./ui";

/** Two-step reset so a stray click mid-meeting doesn't wipe the walkthrough. */
/** `dark` adapts colours for the navy header. */
export function ResetDemo({ size = "sm", dark = false }: { size?: "sm" | "md"; dark?: boolean }) {
  const { reset, hosted } = useDemo();
  const { run, pending, feedback, setFeedback } = useAction();
  const [confirming, setConfirming] = useState(false);

  if (hosted) return null; // a real garage's records are never reset
  if (confirming) {
    return (
      <span className={`inline-flex flex-wrap items-center gap-2 text-xs ${dark ? "text-slate-200" : "text-slate-700"}`}>
        Reset to the starting point (Wed 11 Nov, 10:00)?
        <Button size={size} variant="danger" disabled={pending} aria-busy={pending} onClick={() => run(reset, "Demo reset. Ready for the walkthrough.").then(() => setConfirming(false))}>
          {pending ? "Resetting…" : "Reset"}
        </Button>
        <Button size={size} variant={dark ? "onDark" : "ghost"} disabled={pending} onClick={() => setConfirming(false)}>Cancel</Button>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <InlineFeedback feedback={feedback} onDark={dark} />
      <Button size={size} variant={dark ? "onDark" : "secondary"} onClick={() => { setFeedback(null); setConfirming(true); }}>Reset demo</Button>
    </span>
  );
}
