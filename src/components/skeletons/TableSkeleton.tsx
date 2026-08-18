import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function TableSkeleton({
  rows = 6,
  columns = 5,
  className,
}: TableSkeletonProps) {
  return (
    <div
      className={cn(
        "glass-card overflow-x-auto p-4",
        className,
      )}
    >
      <div className="min-w-[640px]">
        <div className="flex gap-4 border-b border-border/60 pb-3">
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton
              key={`table-header-skeleton-${index}`}
              className="h-4 flex-1"
            />
          ))}
        </div>

        <div className="divide-y divide-border/40">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div
              key={`table-row-skeleton-${rowIndex}`}
              className="flex gap-4 py-4"
            >
              {Array.from({ length: columns }).map((_, columnIndex) => (
                <Skeleton
                  key={`table-cell-skeleton-${rowIndex}-${columnIndex}`}
                  className="h-4 flex-1"
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}