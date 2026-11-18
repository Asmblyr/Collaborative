export default function CollectionItemsLoading() {
  return (
    <div
      aria-busy="true"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <div className="h-5 w-40 animate-pulse rounded-md bg-muted/60" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-24 animate-pulse rounded-lg bg-muted/50" />
          <div className="h-8 w-24 animate-pulse rounded-lg bg-muted/50" />
          <div className="h-8 w-28 animate-pulse rounded-lg bg-muted/70" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden border-t">
        <div className="flex h-10 items-center gap-4 border-b bg-muted/20 px-4">
          <div className="size-4 animate-pulse rounded bg-muted/60" />
          <div className="h-3.5 w-32 animate-pulse rounded bg-muted/60" />
          <div className="hidden h-3.5 w-28 animate-pulse rounded bg-muted/50 sm:block" />
          <div className="hidden h-3.5 w-24 animate-pulse rounded bg-muted/50 md:block" />
          <div className="ml-auto h-3.5 w-20 animate-pulse rounded bg-muted/40" />
        </div>
        <div className="divide-y">
          {[0, 1, 2, 3, 4, 5, 6].map((row) => (
            <div
              key={row}
              className="flex items-center gap-4 px-4 py-3"
            >
              <div className="size-4 animate-pulse rounded bg-muted/50" />
              <div className="h-4 w-44 animate-pulse rounded bg-muted/60" />
              <div className="hidden h-4 w-32 animate-pulse rounded bg-muted/40 sm:block" />
              <div className="hidden h-4 w-24 animate-pulse rounded bg-muted/40 md:block" />
              <div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted/40" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-4 border-t px-4 py-3">
        <div className="h-4 w-36 animate-pulse rounded bg-muted/50" />
        <div className="h-7 w-52 animate-pulse rounded-lg bg-muted/50" />
      </div>
    </div>
  );
}
