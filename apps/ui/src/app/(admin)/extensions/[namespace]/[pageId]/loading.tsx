import { Skeleton } from "@/components/ui/skeleton";

export default function ExtensionPageLoading() {
  return (
    <div
      aria-busy="true"
      className="space-y-6"
    >
      <div className="space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="space-y-4 rounded-xl border bg-card p-6">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-28 w-full" />
      </div>
    </div>
  );
}
