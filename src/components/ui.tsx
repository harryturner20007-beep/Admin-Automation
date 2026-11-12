import type { ComponentProps, ReactNode } from "react";

// Colour roles, used the same way on every screen:
//   blue  = primary action        amber = needs attention
//   green = confirmed outcome     red   = failure / sending stopped
//   neutral (slate) = everything else
type Tone = "neutral" | "green" | "amber" | "red" | "blue";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  green: "bg-green-50 text-green-800 ring-green-200",
  amber: "bg-amber-50 text-amber-900 ring-amber-300",
  red: "bg-red-50 text-red-800 ring-red-200",
  blue: "bg-blue-50 text-blue-800 ring-blue-200",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

type Variant = "primary" | "secondary" | "danger" | "ghost" | "onDark" | "signalOnDark";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover disabled:opacity-50",
  secondary: "bg-white text-text ring-1 ring-inset ring-line hover:bg-canvas disabled:opacity-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-muted hover:bg-canvas hover:text-text disabled:opacity-50",
  onDark: "text-slate-200 ring-1 ring-inset ring-white/20 hover:bg-white/10 hover:text-white",
  signalOnDark: "bg-signal text-white hover:bg-white hover:text-ink",
};

export function Button({ variant = "secondary", size = "md", className = "", ...rest }: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" }) {
  // 44px minimum for every size (design DNA touch target); "sm" only narrows padding and type.
  const sz = size === "sm" ? "px-3 text-xs" : "px-4 text-sm";
  return <button className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed ${sz} ${VARIANTS[variant]} ${className}`} {...rest} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-slate-200 bg-white ${className}`}>{children}</div>;
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-slate-900">{children}</h2>
      {hint && <p className="mt-0.5 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

/** Inline result next to the control that caused it. role=status so screen readers hear it. */
export function InlineFeedback({ feedback, onDark = false }: { feedback: { ok: boolean; text: string } | null; onDark?: boolean }) {
  if (!feedback) return null;
  const colour = feedback.ok ? (onDark ? "text-green-300" : "text-green-700") : onDark ? "text-red-300" : "text-red-700";
  return (
    <span role="status" className={`text-xs ${colour}`}>
      {feedback.ok ? "✓ " : "Couldn't save: "}
      {feedback.text}
    </span>
  );
}

// Simple 24px line icons (stroke only), drawn here rather than adding an icon package for a dozen glyphs.
const ICONS = {
  plus: "M12 5v14M5 12h14",
  search: "M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM21 21l-5.2-5.2",
  close: "M6 6l12 12M18 6L6 18",
  check: "M5 12.5l4.5 4.5L19 7",
  clock: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 7v5l3 2",
  alert: "M12 4l9 16H3zM12 10v4M12 17.2v.1",
  quotes: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  inbox: "M4 5h16v11H9l-5 4z",
  results: "M5 20V11M12 20V5M19 20v-6",
  pause: "M9 5v14M15 5v14",
  refresh: "M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5",
  pound: "M16 6.5a3.5 3.5 0 0 0-6.5 1.8V17M7 12h7M7 17h10",
  calendar: "M5 6h14v14H5zM5 10h14M9 3v4M15 3v4",
  bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
  sliders: "M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6",
  back: "M15 5l-7 7 7 7",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  message: "M4 5h16v11H8l-4 4zM8 10h8M8 13h5",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  undo: "M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  next: "M9 5l7 7-7 7",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 ${className}`}>
      <path d={ICONS[name]} />
    </svg>
  );
}

/** Shared field chrome: label, hint, and an error the input points at via aria-describedby. */
export function Field({ id, label, hint, error, optional, children }: { id: string; label: string; hint?: string; error?: string; optional?: boolean; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-text">
        {label} {optional && <span className="font-normal text-slate-400">(optional)</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}

export const inputClass = (error?: string) =>
  `min-h-11 w-full rounded-lg border bg-white px-3 py-2 text-sm text-text placeholder:text-muted/70 transition-colors focus:outline-none focus:ring-2 ${error ? "border-danger focus:ring-danger/20" : "border-line hover:border-muted focus:border-accent focus:ring-accent/15"}`;

/**
 * The registration as a UK front plate: white face, heavy condensed characters and the blue
 * identifier band, which doubles as the interface's one accent. Renders nothing without a reg.
 */
export function Plate({ reg, size = "sm", ghost = false }: { reg?: string; size?: "sm" | "lg"; ghost?: boolean }) {
  const lg = size === "lg";
  if (!reg) {
    // Keeps the queue's plate column aligned when no registration was recorded.
    return ghost ? <span className="inline-flex h-[22px] items-center rounded-[3px] border border-dashed border-steel-line px-2 text-[11px] text-slate-500">No reg</span> : null;
  }
  return (
    <span
      className={`inline-flex items-stretch overflow-hidden rounded-[3px] border border-ink/70 bg-white leading-none text-ink ${lg ? "h-8" : "h-[22px]"}`}
    >
      <span className="sr-only">Registration {reg}</span>
      <span aria-hidden className={`flex items-end justify-center bg-signal font-bold text-white ${lg ? "w-4 pb-1 text-[7px]" : "w-2.5 pb-0.5 text-[5px]"}`}>UK</span>
      <span aria-hidden className={`flex items-center font-bold tracking-wide whitespace-nowrap uppercase [font-stretch:72%] ${lg ? "px-2.5 text-lg" : "px-1.5 text-[13px]"}`}>{reg}</span>
    </span>
  );
}

/** Neutral registration label for the Quotes workspace (.design/components/controls.md). */
export function PlateLabel({ reg }: { reg?: string }) {
  return reg ? (
    <span className="inline-flex items-center rounded border border-line bg-canvas px-1.5 py-0.5 text-xs font-semibold tracking-[0.04em] whitespace-nowrap text-text uppercase">
      <span className="sr-only">Registration </span>
      {reg}
    </span>
  ) : (
    <span className="inline-flex rounded border border-dashed border-line px-1.5 py-0.5 text-xs text-muted">No reg</span>
  );
}

export type StatusTone = "success" | "attention" | "danger" | "neutral";
const STATUS_TONES: Record<StatusTone, string> = {
  success: "bg-success-bg text-success",
  attention: "bg-attention-bg text-attention",
  danger: "bg-danger-bg text-danger",
  neutral: "bg-canvas text-muted",
};

/** Status as text on a subtle tint, never colour alone. */
export function StatusLabel({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_TONES[tone]}`}>{children}</span>;
}
