import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface MatchListSkeletonProps {
  count?: number;
  className?: string;
  variant?: "grid" | "list";
}

export function MatchListSkeleton({
  count = 6,
  className,
  variant = "grid",
}: MatchListSkeletonProps) {
  if (variant === "list") {
    return (
      <div className={cn("space-y-3", className)}>
        {Array.from({ length: count }).map((_, index) => (
          <div
            key={`match-list-skeleton-${index}`}
            className="list-item-card px-4 py-3"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="space-y-2 sm:w-44 sm:shrink-0">
                <Skeleton className="h-4 w-24" />

                <div className="flex gap-2">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </div>

              <div className="flex flex-1 items-center justify-center gap-4">
                <div className="flex-1">
                  <Skeleton className="ml-auto h-4 w-28" />
                </div>

                <Skeleton className="h-6 w-12" />

                <div className="flex-1">
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 sm:w-36 sm:shrink-0">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-8 w-8 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`match-list-skeleton-${index}`}
          className="list-item-card flex min-h-48 flex-col p-4"
        >
          <div className="mb-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>

            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>

          <div className="flex flex-1 items-center">
            <div className="flex-1">
              <Skeleton className="ml-auto h-4 w-24" />
            </div>

            <div className="mx-4 flex items-center gap-2">
              <Skeleton className="h-7 w-7" />
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-7 w-7" />
            </div>

            <div className="flex-1">
              <Skeleton className="h-4 w-24" />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <Skeleton className="mx-auto h-3 w-32" />

            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
