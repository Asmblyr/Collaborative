import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section
      aria-label="Загрузка расширений"
      className="space-y-6"
    >
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-5 w-full max-w-xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton
            key={index}
            className="h-20"
          />
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-56 w-full" />
    </section>
  );
}
