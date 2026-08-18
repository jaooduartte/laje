import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface CalendarGridSkeletonProps {
  daysCount?: number;
  className?: string;
}

export function CalendarGridSkeleton({
  daysCount = 35,
  className,
}: CalendarGridSkeletonProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <section className="glass-panel hidden overflow-hidden p-0 md:block">
        <div className="grid grid-cols-7 px-3 py-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <div
              key={`calendar-weekday-skeleton-${index}`}
              className="flex justify-center px-2 py-1"
            >
              <Skeleton className="h-3 w-8" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 p-1">
          {Array.from({ length: daysCount }).map((_, index) => (
            <div
              key={`calendar-day-skeleton-${index}`}
              className="app-card-muted min-h-40 rounded-xl p-2"
            >
              <Skeleton className="h-4 w-5" />

              <div className="mt-5 space-y-2">
                {index % 3 == 0 ? (
                  <>
                    <Skeleton className="h-5 w-full rounded-md" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                  </>
                ) : index % 4 == 0 ? (
                  <Skeleton className="h-5 w-2/3 rounded-md" />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-panel space-y-3 p-4 md:hidden">
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, index) => (
            <div
              key={`calendar-mobile-weekday-skeleton-${index}`}
              className="flex justify-center py-1"
            >
              <Skeleton className="h-3 w-5" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: daysCount }).map((_, index) => (
            <div
              key={`calendar-mobile-day-skeleton-${index}`}
              className="app-card-muted h-16 rounded-xl p-1.5"
            >
              <Skeleton className="h-3 w-4" />

              {index % 3 == 0 ? (
                <div className="ml-auto mt-1 space-y-1">
                  <Skeleton className="h-2 w-2 rounded-full" />
                  <Skeleton className="h-2 w-2 rounded-full" />
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="app-card-muted space-y-3 rounded-xl p-3">
          <Skeleton className="h-3 w-40" />

          <div className="space-y-2">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        </div>
      </section>
    </div>
  );
}