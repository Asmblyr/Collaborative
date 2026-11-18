import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsSectionLoading() {
  return (
    <div
      aria-busy="true"
      className="space-y-6"
    >
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="space-y-4 rounded-xl border bg-card p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
