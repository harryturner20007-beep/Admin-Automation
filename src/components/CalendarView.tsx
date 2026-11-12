"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { calendarItemHref, calendarItems, type CalendarItem, type CalendarKind } from "@/domain/calendar";
import { addCalendarDays, formatLondonDate, formatLondonTime, ukDate, weekdayOf, ymd } from "@/domain/time";
import { useDemo } from "@/demo/store";
import { Button, Icon } from "./ui";

const KINDS: { id: CalendarKind; label: string; dot: string; edge: string }[] = [
  { id: "follow_up", label: "Quote follow-ups", dot: "bg-accent", edge: "border-accent" },
  { id: "booking", label: "Booked-in work", dot: "bg-success", edge: "border-success" },
  { id: "invoice", label: "Invoices", dot: "bg-attention", edge: "border-attention" },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k])) as Record<CalendarKind, (typeof KINDS)[number]>;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const dayLabel = (d: string) => formatLondonDate(`${d}T12:00:00Z`); // "Thu 12 Nov"
const monthLabel = (y: number, m: number) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(Date.UTC(y, m - 1, 1));

function ItemRow({ item }: { item: CalendarItem }) {
  const { state } = useDemo();
  const k = KIND[item.kind];
  return (
    <li className="flex items-start gap-3 py-3">
      <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${k.dot}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text">
          {item.at && <span className="mr-2 text-muted tabular-nums">{formatLondonTime(item.at)}</span>}
          <span className="font-medium">{item.title}</span>
          <span className="sr-only"> ({k.label})</span>
        </p>
        <p className={`text-sm ${item.overdue ? "font-medium text-danger" : "text-muted"}`}>
          {item.detail}
          {item.overdue && " · overdue"}
        </p>
      </div>
      <Link href={calendarItemHref(item, ukDate(state.now))} className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-medium text-accent hover:bg-canvas hover:text-accent-hover ${focusRing}`}>
        Open<span className="sr-only"> {item.title}</span>
      </Link>
    </li>
  );
}

export function CalendarView() {
  const { state, garageId } = useDemo();
  const today = ukDate(state.now);
  const requestedDay = useSearchParams().get("date");
  const initialDay = requestedDay && /^\d{4}-\d{2}-\d{2}$/.test(requestedDay) && Number.isFinite(Date.parse(requestedDay)) ? requestedDay : today;
  const [ty, tm] = initialDay.split("-").map(Number);
  const [month, setMonth] = useState({ y: ty, m: tm });
  const [day, setDay] = useState(initialDay);
  const [hidden, setHidden] = useState<CalendarKind[]>([]);

  const first = { y: month.y, m: month.m, d: 1 };
  const daysInMonth = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
  const lead = weekdayOf(first) - 1; // grid starts on the Monday on or before the 1st
  const cells = Array.from({ length: Math.ceil((lead + daysInMonth) / 7) * 7 }, (_, i) => ymd(addCalendarDays(first, i - lead)));
  const monthPrefix = `${month.y}-${String(month.m).padStart(2, "0")}`;
  const { items, unscheduled } = calendarItems(state, garageId, cells[0], cells[cells.length - 1]);
  const shown = items.filter((i) => !hidden.includes(i.kind));
  const on = (d: string) => shown.filter((i) => i.date === d);
  const monthDays = [...new Set(shown.filter((i) => i.date.startsWith(monthPrefix)).map((i) => i.date))];

  const move = (n: number) =>
    setMonth(({ y, m }) => {
      const d = new Date(Date.UTC(y, m - 1 + n, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
    });
  const goToday = () => {
    setMonth({ y: ty, m: tm });
    setDay(today);
  };

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-[28px] leading-tight font-[650] text-text">Calendar</h1>
      <p className="mt-1 text-sm text-muted">Everything that&apos;s due: quote follow-ups and your reminders, booked-in work, invoice due dates and payment reminders.</p>

      {/* Toolbar: month navigation and what to show */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button size="sm" aria-label="Previous month" onClick={() => move(-1)}><Icon name="back" /></Button>
        <h2 className="min-w-40 text-center text-lg font-semibold text-text" aria-live="polite">{monthLabel(month.y, month.m)}</h2>
        <Button size="sm" aria-label="Next month" onClick={() => move(1)}><Icon name="next" /></Button>
        <Button size="sm" variant="ghost" onClick={goToday}>Today</Button>
        <div className="flex w-full flex-wrap gap-2 md:ml-auto md:w-auto" role="group" aria-label="Show">
          {KINDS.map((k) => {
            const showing = !hidden.includes(k.id);
            return (
              <button
                key={k.id}
                aria-pressed={showing}
                onClick={() => setHidden((h) => (showing ? [...h, k.id] : h.filter((x) => x !== k.id)))}
                className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm transition-colors duration-150 ${focusRing} ${showing ? "border-line bg-white text-text" : "border-dashed border-line bg-canvas text-muted line-through"}`}
              >
                <span aria-hidden className={`h-2 w-2 rounded-full ${k.dot}`} />
                {k.label}
              </button>
            );
          })}
        </div>
      </div>

      {unscheduled.length > 0 && (
        <p className="mt-4 rounded-xl border border-line bg-white px-4 py-3 text-sm text-text">
          {unscheduled.length === 1 ? "1 booked job has" : `${unscheduled.length} booked jobs have`} no booked-in date yet:{" "}
          {unscheduled.map((q, i) => (
            <span key={q.id}>
              {i > 0 && ", "}
              <Link href={`/jobs?quote=${encodeURIComponent(q.id)}`} className="font-medium text-accent underline underline-offset-2 hover:text-accent-hover">{q.customerName}</Link>
            </span>
          ))}
          . Choose a date and time in Jobs.
        </p>
      )}

      {/* Month grid (768px and up) */}
      <div className="mt-4 hidden overflow-hidden rounded-xl border border-line bg-white md:block">
        <div className="grid grid-cols-7 border-b border-line text-xs font-medium text-muted">
          {WEEKDAYS.map((w) => <div key={w} className="px-2 py-2">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const list = on(d);
            const inMonth = d.startsWith(monthPrefix);
            const selected = d === day;
            return (
              <button
                key={d}
                aria-pressed={selected}
                aria-label={`${dayLabel(d)}${d === today ? ", today" : ""}: ${list.length ? `${list.length} item${list.length === 1 ? "" : "s"}` : "nothing due"}`}
                onClick={() => setDay(d)}
                className={`flex min-h-28 min-w-0 flex-col gap-1 border-line p-1.5 text-left align-top ${i % 7 ? "border-l" : ""} ${i >= 7 ? "border-t" : ""} ${focusRing} focus-visible:-outline-offset-2 ${selected ? "bg-selected" : inMonth ? "bg-white hover:bg-canvas" : "bg-canvas/60 hover:bg-canvas"}`}
              >
                <span className={`grid h-6 w-6 place-items-center rounded-full text-xs tabular-nums ${d === today ? "bg-accent font-semibold text-white" : inMonth ? "text-text" : "text-muted"}`}>{Number(d.slice(8))}</span>
                {list.slice(0, 3).map((it, n) => (
                  <span key={n} aria-hidden className={`truncate rounded border-l-2 bg-canvas px-1.5 py-0.5 text-xs ${KIND[it.kind].edge} ${it.overdue ? "text-danger" : "text-text"}`}>
                    {it.title}
                  </span>
                ))}
                {list.length > 3 && <span aria-hidden className="px-1.5 text-xs text-muted">+{list.length - 3} more</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day (768px and up) */}
      <section aria-label={`Due on ${dayLabel(day)}`} className="mt-4 hidden rounded-xl border border-line bg-white px-6 py-4 md:block">
        <h2 className="text-lg font-semibold text-text">{dayLabel(day)}{day === today && <span className="ml-2 text-sm font-normal text-muted">Today</span>}</h2>
        {on(day).length ? (
          <ul className="divide-y divide-line">{on(day).map((it, n) => <ItemRow key={n} item={it} />)}</ul>
        ) : (
          <p className="mt-2 text-sm text-muted">Nothing due this day.</p>
        )}
      </section>

      {/* Month agenda (below 768px) */}
      <div className="mt-4 space-y-3 md:hidden">
        {monthDays.length ? (
          monthDays.map((d) => (
            <section key={d} aria-label={dayLabel(d)} className="rounded-xl border border-line bg-white px-4 py-3">
              <h2 className="text-sm font-semibold text-text">{dayLabel(d)}{d === today && <span className="ml-2 font-normal text-muted">Today</span>}</h2>
              <ul className="divide-y divide-line">{on(d).map((it, n) => <ItemRow key={n} item={it} />)}</ul>
            </section>
          ))
        ) : (
          <p className="rounded-xl border border-line bg-white px-4 py-6 text-center text-sm text-muted">Nothing due in {monthLabel(month.y, month.m)}.</p>
        )}
      </div>
    </div>
  );
}
