import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface PageContentSkeletonProps {
  filterCount?: number;
  contentCount?: number;
  className?: string;
}

export function PageContentSkeleton({
  filterCount = 4,
  contentCount = 3,
  className,
}: PageContentSkeletonProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="glass-card space-y-4 p-4">
        <Skeleton className="h-4 w-48" />

        {filterCount > 0 ? (
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: filterCount }).map((_, index) => (
              <Skeleton
                key={`page-filter-skeleton-${index}`}
                className="h-10 min-w-40 flex-1"
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        {Array.from({ length: contentCount }).map((_, index) => (
          <Skeleton
            key={`page-content-skeleton-${index}`}
            className="h-52 w-full rounded-2xl"
          />
        ))}
      </div>
    </div>
  );
}