/** Shown while the demo data loads: the shape of the Quotes board, not a spinner. */
export function LoadingSkeleton() {
  return (
    <div className="min-h-full" aria-busy="true" aria-label="Loading quotes">
      <div className="bg-graphite">
        <div className="h-[86px] border-b border-white/8" />
        <div className="mx-auto max-w-6xl px-4 pt-12 pb-16">
          <div className="h-14 w-2/3 max-w-xl rounded bg-white/10 motion-safe:animate-pulse" />
          <div className="mt-6 h-5 w-1/2 max-w-md rounded bg-white/8 motion-safe:animate-pulse" />
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-3 h-7 w-72 rounded bg-steel-line/70" />
        <div className="overflow-hidden rounded-md border border-steel-line bg-white">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-5 border-b border-steel-line/70 px-4 py-3.5 last:border-0">
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-40 rounded bg-steel-line motion-safe:animate-pulse" />
                <div className="h-3 w-64 max-w-full rounded bg-steel-line/60 motion-safe:animate-pulse" />
              </div>
              <div className="hidden h-[22px] w-24 rounded-[3px] bg-steel-line/60 md:block" />
              <div className="h-5 w-16 rounded bg-steel-line motion-safe:animate-pulse" />
              <div className="hidden h-7 w-28 rounded bg-steel-line/60 md:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
