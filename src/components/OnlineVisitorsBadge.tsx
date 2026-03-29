import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";

interface OnlineVisitorsBadgeProps {
  onlineVisitorsCount: number;
  showLabel?: boolean;
  accessibleLabel?: string;
  className?: string;
}

export function OnlineVisitorsBadge({
  onlineVisitorsCount,
  showLabel = false,
  accessibleLabel = "Visitantes online",
  className,
}: OnlineVisitorsBadgeProps) {
  return (
    <div
      className={cn(
        "app-button-secondary inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground shadow-[0_4px_10px_rgba(15,23,42,0.06)] dark:shadow-none",
        className,
      )}
      title={`${accessibleLabel}: ${onlineVisitorsCount}`}
      aria-label={`${accessibleLabel}: ${onlineVisitorsCount}`}
      aria-live="polite"
    >
      <Eye className="h-4 w-4 shrink-0" />
      {showLabel ? <span>{accessibleLabel}</span> : null}
      <span className="text-foreground tabular-nums">{onlineVisitorsCount}</span>
    </div>
  );
}
