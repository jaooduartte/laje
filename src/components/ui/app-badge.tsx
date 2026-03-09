import { Badge, type BadgeProps } from "@/components/ui/badge";
import { AppBadgeTone } from "@/lib/enums";
import { cn } from "@/lib/utils";

const APP_BADGE_TONE_CLASS_NAMES: Record<AppBadgeTone, string> = {
  [AppBadgeTone.NEUTRAL]: "border-transparent bg-secondary text-secondary-foreground dark:bg-slate-950 dark:text-slate-100",
  [AppBadgeTone.PRIMARY]: "border-transparent bg-primary/10 text-primary dark:bg-primary/50 dark:text-primary-foreground",
  [AppBadgeTone.RED]: "border-transparent bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-100",
  [AppBadgeTone.AMBER]: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-100",
  [AppBadgeTone.EMERALD]:
    "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
  [AppBadgeTone.SKY]: "border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-100",
  [AppBadgeTone.BLUE]: "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-100",
  [AppBadgeTone.GOLD]: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-100",
  [AppBadgeTone.SILVER]: "border-transparent bg-slate-100 text-slate-800 dark:bg-slate-950 dark:text-slate-100",
  [AppBadgeTone.BRONZE]: "border-transparent bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-100",
};

interface AppBadgeProps extends Omit<BadgeProps, "variant"> {
  tone: AppBadgeTone;
}

export function AppBadge({ tone, className, ...props }: AppBadgeProps) {
  return <Badge variant="secondary" className={cn(APP_BADGE_TONE_CLASS_NAMES[tone], className)} {...props} />;
}
