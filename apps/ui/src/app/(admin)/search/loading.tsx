import { Skeleton } from "@/components/ui/skeleton";

export default function SearchLoading() {
  return (
    <div
      aria-busy="true"
      className="space-y-7"
    >
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-28" />
        <div className="divide-y rounded-xl border bg-card">
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3.5 w-24" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-48" />
        <div className="divide-y rounded-xl border bg-card">
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="flex items-center gap-3 px-4 py-3"
            >
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-4 w-56" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
