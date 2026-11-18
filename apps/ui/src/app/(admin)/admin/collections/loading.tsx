import { Skeleton } from "@/components/ui/skeleton";

export default function AdminCollectionsLoading() {
  return (
    <div
      aria-busy="true"
      className="space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
      </div>
      <div className="divide-y rounded-xl border bg-card">
        {[0, 1, 2, 3, 4].map((row) => (
          <div
            key={row}
            className="flex items-center justify-between gap-4 px-5 py-4"
          >
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3.5 w-32" />
            </div>
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
