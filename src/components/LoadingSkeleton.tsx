/** Shown while the demo data loads: the shape of the Quotes workspace, not a spinner. */
export function LoadingSkeleton() {
  const pulse = "motion-safe:animate-pulse";
  return (
    <div className="min-h-full md:pl-16 desk:pl-[208px]" aria-busy="true" aria-label="Loading quotes">
      <div className="fixed inset-y-0 left-0 hidden w-16 border-r border-line bg-white md:block desk:w-[208px]" />
      <div className="p-4 md:p-8">
        <div className={`h-8 w-40 rounded-lg bg-line ${pulse}`} />
        <div className={`mt-2 h-4 w-72 max-w-full rounded bg-line/70 ${pulse}`} />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-[92px] rounded-xl border border-line bg-white" />)}
        </div>
        <div className="mt-6 overflow-hidden rounded-xl border border-line bg-white">
          <div className="h-[76px] border-b border-line" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex h-20 items-center gap-6 border-b border-line px-4 last:border-0">
              <div className="flex-1 space-y-2"><div className={`h-4 w-24 rounded bg-line ${pulse}`} /><div className={`h-3 w-40 rounded bg-line/70 ${pulse}`} /></div>
              <div className={`hidden h-4 w-48 rounded bg-line/70 md:block ${pulse}`} />
              <div className={`h-4 w-16 rounded bg-line ${pulse}`} />
              <div className="hidden h-11 w-28 rounded-lg bg-line/60 md:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
