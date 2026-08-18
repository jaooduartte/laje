import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface PublicLinkSectionsSkeletonProps {
  count?: number;
  className?: string;
}

const BUTTON_COUNT_BY_SECTION = [5, 2, 2, 3];

const BUTTON_WIDTH_CLASS_NAMES = [
  "w-28",
  "w-36",
  "w-44",
  "w-32",
  "w-40",
] as const;

export function PublicLinkSectionsSkeleton({
  count = 4,
  className,
}: PublicLinkSectionsSkeletonProps) {
  return (
    <section className={cn("space-y-4", className)}>
      {Array.from({ length: count }).map((_, sectionIndex) => {
        const buttonCount =
          BUTTON_COUNT_BY_SECTION[sectionIndex] ?? 3;

        return (
          <article
            key={`public-link-section-skeleton-${sectionIndex}`}
            className="glass-panel p-5"
          >
            <div className="mb-5 flex flex-col items-center space-y-2">
              <Skeleton className="h-5 w-48 max-w-full" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              {Array.from({ length: buttonCount }).map(
                (_, buttonIndex) => (
                  <Skeleton
                    key={`public-link-button-skeleton-${sectionIndex}-${buttonIndex}`}
                    className={`h-10 rounded-xl ${
                      BUTTON_WIDTH_CLASS_NAMES[
                        buttonIndex %
                          BUTTON_WIDTH_CLASS_NAMES.length
                      ]
                    }`}
                  />
                ),
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}