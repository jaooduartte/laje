import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface CardListSkeletonProps {
  count?: number;
  className?: string;
  cardClassName?: string;
}

export function CardListSkeleton({
  count = 6,
  className,
  cardClassName,
}: CardListSkeletonProps) {
  return (
    <div
      className={cn(
        "grid gap-4 sm:grid-cols-2 xl:grid-cols-3",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`card-list-skeleton-${index}`}
          className={cn(
            "list-item-card flex min-h-44 flex-col gap-4 p-4",
            cardClassName,
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>

          <div className="flex gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>

          <div className="flex flex-1 items-center justify-center">
            <Skeleton className="h-6 w-2/3" />
          </div>

          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}