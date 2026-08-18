import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface DashboardSkeletonProps {
  chartCount?: number;
  className?: string;
}

export function DashboardSkeleton({
  chartCount = 2,
  className,
}: DashboardSkeletonProps) {
  return (
    <div className={cn("space-y-5", className)}>
      {Array.from({ length: chartCount }).map((_, chartIndex) => (
        <section
          key={`dashboard-chart-skeleton-${chartIndex}`}
          className="glass-card rounded-3xl p-4 sm:p-5"
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>

            <Skeleton className="h-8 w-40 rounded-lg" />
          </div>

          <div className="space-y-5 py-4">
            {Array.from({ length: 6 }).map((_, rowIndex) => (
              <div
                key={`dashboard-chart-row-${chartIndex}-${rowIndex}`}
                className="flex items-center gap-3"
              >
                <Skeleton className="h-4 w-20 shrink-0" />

                <Skeleton
                  className="h-7 rounded-r-xl"
                  style={{
                    width: `${Math.max(30, 90 - rowIndex * 10)}%`,
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, panelIndex) => (
          <div
            key={`dashboard-panel-skeleton-${panelIndex}`}
            className="glass-card min-h-[280px] space-y-4 rounded-3xl p-4 sm:p-5"
          >
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>

            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, itemIndex) => (
                <Skeleton
                  key={`dashboard-panel-item-${panelIndex}-${itemIndex}`}
                  className="h-12 w-full rounded-xl"
                />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}