import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOnlineVisitors } from "@/hooks/useOnlineVisitors";
import { OnlineVisitorsContext } from "@/lib/enums";

interface OnlineVisitorsBadgeProps {
  context: OnlineVisitorsContext;
  showLabel?: boolean;
  accessibleLabel?: string;
  className?: string;
}

export function OnlineVisitorsBadge({
  context,
  showLabel = false,
  accessibleLabel = "Visitantes online",
  className,
}: OnlineVisitorsBadgeProps) {
  const { onlineVisitorsCount } = useOnlineVisitors(context);

  return (
    <div
      className={cn(
        "glass-chip inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground",
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
