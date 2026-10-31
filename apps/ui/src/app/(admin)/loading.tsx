export default function AdminLoading() {
  return (
    <div
      aria-busy="true"
      className="space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 animate-pulse rounded-lg bg-muted/70" />
          <div className="h-4 w-72 max-w-full animate-pulse rounded-md bg-muted/50" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 animate-pulse rounded-lg bg-muted/60" />
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b bg-muted/30 px-4 py-3">
          <div className="h-4 w-56 animate-pulse rounded bg-muted/60" />
        </div>
        <div className="divide-y">
          {[0, 1, 2, 3, 4].map((row) => (
            <div
              key={row}
              className="flex items-center justify-between gap-4 px-4 py-3.5"
            >
              <div className="h-4 w-44 animate-pulse rounded bg-muted/60" />
              <div className="hidden h-4 w-28 animate-pulse rounded bg-muted/40 sm:block" />
              <div className="h-4 w-20 animate-pulse rounded bg-muted/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
