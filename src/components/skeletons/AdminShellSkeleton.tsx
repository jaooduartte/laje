import { Skeleton } from "@/components/ui/skeleton";
import { PageContentSkeleton } from "@/components/skeletons/PageContentSkeleton";

export function AdminShellSkeleton() {
  return (
    <div className="space-y-5">
      <section className="glass-panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-52" />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Skeleton className="h-10 w-52 rounded-xl" />
            <Skeleton className="h-10 w-24 rounded-xl" />
          </div>
        </div>
      </section>

      <section className="glass-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-5 w-36" />
          </div>

          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
      </section>

      <div className="glass-panel p-2">
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton
              key={`admin-tab-skeleton-${index}`}
              className="h-9 min-w-28 flex-1 rounded-lg"
            />
          ))}
        </div>
      </div>

      <PageContentSkeleton
        filterCount={4}
        contentCount={3}
      />
    </div>
  );
}