"use client";

import { useAction } from "@/demo/store";
import { Button, InlineFeedback } from "./ui";

type Props = {
  label: string;
  onRun: () => unknown;
  success: string | ((r: unknown) => string);
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  className?: string;
  /** Report success to the parent instead of beside the button (for buttons that disappear once the action works). */
  onDone?: (text: string) => void;
  /** Marks this as the drawer's first useful control (focused when the drawer opens). */
  primaryFocus?: boolean;
};

/** A button that saves once, shows "Saving…" while busy and reports the result beside itself. */
export function ActionButton({ label, onRun, success, variant = "secondary", size = "sm", className, onDone, primaryFocus }: Props) {
  const { run, pending, feedback } = useAction();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button data-autofocus={primaryFocus || undefined} variant={variant} size={size} className={className} disabled={pending} aria-busy={pending} onClick={() => run(onRun, (r) => { const t = typeof success === "function" ? success(r) : success; onDone?.(t); return t; })}>
        {pending ? "Saving…" : label}
      </Button>
      <InlineFeedback feedback={onDone && feedback?.ok ? null : feedback} />
    </span>
  );
}
