// Europe/London calendar helpers. All stored instants are UTC ISO strings;
// all business rules are evaluated on the London wall clock.

export const LONDON = "Europe/London";

// England & Wales bank holidays (source: gov.uk/bank-holidays).
// Phase 2 replaces this with a table refreshed from https://www.gov.uk/bank-holidays.json
export const ENGLAND_WALES_BANK_HOLIDAYS = new Set<string>([
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25",
  "2026-08-31", "2026-12-25", "2026-12-28",
  "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31",
  "2027-08-30", "2027-12-27", "2027-12-28",
]);

export type LocalDate = { y: number; m: number; d: number }; // m is 1-12

export type LondonParts = LocalDate & {
  hh: number;
  mm: number;
  weekday: number; // 1 = Monday ... 7 = Sunday
};

const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function londonParts(at: Date | string): LondonParts {
  const date = typeof at === "string" ? new Date(at) : at;
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    hh: Number(parts.hour),
    mm: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday as string],
  };
}

/** Convert a London wall-clock time to a UTC Date (handles BST/GMT). */
export function londonToUtc(date: LocalDate, hh: number, mm: number): Date {
  const naive = Date.UTC(date.y, date.m - 1, date.d, hh, mm);
  let guess = naive;
  for (let i = 0; i < 3; i++) {
    const p = londonParts(new Date(guess));
    const asIfUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm);
    const offset = asIfUtc - guess; // London minus UTC, in ms
    const next = naive - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

export function ymd(date: LocalDate): string {
  return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
}

/** ISO weekday for a calendar date, 1 = Monday. */
export function weekdayOf(date: LocalDate): number {
  const w = new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
  return w === 0 ? 7 : w;
}

export function addCalendarDays(date: LocalDate, n: number): LocalDate {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function isBusinessDay(date: LocalDate, holidays = ENGLAND_WALES_BANK_HOLIDAYS): boolean {
  return weekdayOf(date) <= 5 && !holidays.has(ymd(date));
}

export function addBusinessDays(date: LocalDate, n: number, holidays = ENGLAND_WALES_BANK_HOLIDAYS): LocalDate {
  let cur = date;
  let added = 0;
  while (added < n) {
    cur = addCalendarDays(cur, 1);
    if (isBusinessDay(cur, holidays)) added++;
  }
  return cur;
}

export function parseHHMM(s: string): { hh: number; mm: number } {
  const [hh, mm] = s.split(":").map(Number);
  return { hh, mm };
}

export function formatLondon(at: string | Date, opts: { withDay?: boolean } = {}): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    weekday: opts.withDay === false ? undefined : "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(typeof at === "string" ? new Date(at) : at);
}

export function formatLondonDate(at: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(typeof at === "string" ? new Date(at) : at);
}

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

export function formatLondonTime(at: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(typeof at === "string" ? new Date(at) : at);
}

/** ISO instant → "YYYY-MM-DDTHH:mm" in London time, for <input type="datetime-local">. */
export function toLondonInput(at: string): string {
  const p = londonParts(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.hh)}:${pad(p.mm)}`;
}

/** "YYYY-MM-DDTHH:mm" read as London wall-clock time → ISO UTC, or "" if unparseable. */
export function fromLondonInput(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return "";
  const [, y, mo, d, hh, mm] = m.map(Number);
  return londonToUtc({ y, m: mo, d }, hh, mm).toISOString();
}

/** "YYYY-MM-DD" for the UK calendar day containing this instant. Compare these strings directly. */
export const ukDate = (at: string | Date) => ymd(londonParts(at));

/** Whole days from UK date `a` to UK date `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** "YYYY-MM-DD" plus n calendar days. */
export function addDaysYmd(d: string, n: number): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}
