"use client";

import Link from "next/link";
import { useState } from "react";
import { isSuppressed } from "@/domain/gate";
import { MAX_SEGMENTS, smsSegments, type ManualTarget } from "@/domain/sms";
import { useAction, useDemo } from "@/demo/store";
import { Button, Icon, InlineFeedback } from "./ui";

const ukPhone = (e164: string) => (e164.startsWith("+44") ? `0${e164.slice(3, 7)} ${e164.slice(7)}` : e164);
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/**
 * Send a staff-written text from the garage's number: shows who it's from and to, the size, then sends
 * through the same pipeline as automatic texts. The parent owns the text, so nothing typed is lost on failure.
 */
export function SmsComposer({ target, to, value, label = "Send text", onSent }: { target: ManualTarget; to: string; value: string; label?: string; onSent?: (status: string) => void }) {
  const { state, garageId, hosted, sendText } = useDemo();
  const garage = state.garages.find((g) => g.id === garageId)!;
  const [requestKey, setRequestKey] = useState(newKey); // one per text: repeat clicks and retries can't send twice
  const [sentBody, setSentBody] = useState<string | null>(null); // after sending, the button waits for a new text
  const send = useAction();
  const size = smsSegments(value.trim());
  const tooLong = size.segments > MAX_SEGMENTS;
  const optedOut = isSuppressed(state.suppressions, garageId, to);

  if (!garage.smsNumber) {
    return (
      <p className="rounded-lg border border-attention/30 bg-attention-bg px-3 py-2 text-sm text-attention">
        SMS setup required: this garage has no connected sending number yet. <Link href="/settings#sms" className="font-medium underline">See what&apos;s missing</Link>
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-muted">From</dt>
        <dd className="text-text tabular-nums">{ukPhone(garage.smsNumber)} <span className="text-muted">({hosted ? "your garage's number" : "simulated: no real text is sent"})</span></dd>
        <dt className="text-muted">To</dt>
        <dd className="text-text tabular-nums">{ukPhone(to)}</dd>
      </dl>
      <p className={`text-xs tabular-nums ${tooLong ? "font-medium text-danger" : "text-muted"}`} aria-live="polite">
        {size.chars} characters · {size.segments} SMS {size.segments === 1 ? "part" : "parts"}
        {size.unicode && " (special characters: 70 per part)"}
        {tooLong && ` · keep it to ${MAX_SEGMENTS} parts`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={send.pending || !value.trim() || tooLong || optedOut || value === sentBody}
          aria-busy={send.pending}
          onClick={() =>
            send.run(
              async () => {
                const r = await sendText(target, value, requestKey);
                setRequestKey(newKey()); // the next text is a new one
                setSentBody(value);
                onSent?.(r.status);
                if (r.status === "Failed") throw new Error(`Failed: ${r.detail ?? "the provider didn't take it"}`);
                return r;
              },
              (r) => {
                const o = r as { status: string; detail?: string };
                return `${o.status}${o.detail ? `: ${o.detail}` : ""}`;
              },
            )
          }
        >
          <Icon name="message" /> {send.pending ? "Sending…" : value === sentBody ? "Sent" : label}
        </Button>
        <InlineFeedback feedback={send.feedback} />
      </div>
      {optedOut && <p className="text-xs text-danger">This customer opted out of texts. They can text START to opt back in.</p>}
    </div>
  );
}
