import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface AdminListSkeletonProps {
  count?: number;
  className?: string;
  showActions?: boolean;
}

export function AdminListSkeleton({
  count = 5,
  className,
  showActions = true,
}: AdminListSkeletonProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`admin-list-skeleton-${index}`}
          className="list-item-card px-4 py-3"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-44 max-w-full" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>

            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-28 rounded-lg" />

              {showActions ? (
                <Skeleton className="h-9 w-9 rounded-lg" />
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}