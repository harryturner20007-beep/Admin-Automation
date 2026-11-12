"use client";

import { gsap } from "gsap";
import { useEffect, useRef, type ReactNode } from "react";
import { motionAllowed } from "./motion";
import { useMediaQuery } from "./QuotePanel";
import { Button, Icon, PlateLabel } from "./ui";

/**
 * The record panel (same shape as the quote panel): an in-flow 420px side panel from 1200px, a modal
 * drawer on tablets and a full-screen sheet on phones. Sticky header, scrolling body, action bar.
 */
export function SidePanel({ id, reg, title, onClose, children, footer }: { id: string; reg?: string; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const desk = useMediaQuery("(min-width: 1200px)");
  const panel = useRef<HTMLElement & HTMLDialogElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    if (!desk && el instanceof HTMLDialogElement && !el.open) el.showModal();
    (el.querySelector<HTMLElement>("[data-autofocus]") ?? closeBtn.current)?.focus({ preventScroll: true });
    if (!motionAllowed()) return;
    const t = gsap.from(el, { x: 24, opacity: 0, duration: 0.2, ease: "power1.out", clearProps: "transform,opacity" });
    return () => {
      t.revert();
    };
  }, [desk, id]);

  useEffect(() => {
    if (!desk) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desk, onClose]);

  const close = () => {
    if (panel.current instanceof HTMLDialogElement && panel.current.open) panel.current.close();
    onClose();
  };
  const titleId = `${id}-title`;
  const content = (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start gap-3 border-b border-line bg-white px-6 py-4">
        <div className="min-w-0 flex-1">
          <PlateLabel reg={reg} />
          <h2 id={titleId} className="mt-1.5 text-lg leading-tight font-semibold break-words text-text">{title}</h2>
        </div>
        <Button ref={closeBtn} variant="secondary" size="sm" className="hover-turn" onClick={close}>
          <Icon name="close" className="nudge-icon h-4 w-4" /> Close
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer && <footer className="border-t border-line bg-white px-6 py-3">{footer}</footer>}
    </div>
  );
  return desk ? (
    <aside ref={panel} aria-labelledby={titleId} className="sticky top-0 h-screen w-[420px] shrink-0 border-l border-line bg-white">{content}</aside>
  ) : (
    <dialog
      ref={panel}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className="backdrop-in m-0 ml-auto h-dvh max-h-none w-full max-w-none bg-white p-0 shadow-float backdrop:bg-text/30 md:w-[420px]"
    >
      {content}
    </dialog>
  );
}

export function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line px-6 py-5 first:border-t-0">
      <h3 className="mb-3 text-sm font-semibold text-text">{title}</h3>
      {children}
    </section>
  );
}
