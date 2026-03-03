import { Calendar, CalendarDays, Radio, Shield, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppRoutePath } from "@/lib/enums";

export interface AppNavigationItem {
  routePath: AppRoutePath;
  label: string;
  icon: LucideIcon;
  isPublicPage: boolean;
}

export const APP_NAVIGATION_ITEMS: AppNavigationItem[] = [
  { routePath: AppRoutePath.LIVE, label: "Ao Vivo", icon: Radio, isPublicPage: true },
  { routePath: AppRoutePath.CHAMPIONSHIPS, label: "Campeonatos", icon: Trophy, isPublicPage: true },
  { routePath: AppRoutePath.SCHEDULE, label: "Agenda", icon: Calendar, isPublicPage: true },
  { routePath: AppRoutePath.LEAGUE_CALENDAR, label: "Calendário da Liga", icon: CalendarDays, isPublicPage: true },
  { routePath: AppRoutePath.ADMIN, label: "Admin", icon: Shield, isPublicPage: false },
];

export const PUBLIC_APP_NAVIGATION_ITEMS: AppNavigationItem[] = APP_NAVIGATION_ITEMS.filter(
  (appNavigationItem) => appNavigationItem.isPublicPage,
);

export const HEADER_APP_NAVIGATION_ITEMS: AppNavigationItem[] = APP_NAVIGATION_ITEMS;
