import { AppBadgeTone, LeagueEventOrganizerType, LeagueEventType } from "@/lib/enums";

export const LEAGUE_EVENT_TYPE_LABELS: Record<LeagueEventType, string> = {
  [LeagueEventType.HH]: "HH",
  [LeagueEventType.OPEN_BAR]: "OPEN-BAR",
  [LeagueEventType.CHAMPIONSHIP]: "Campeonato",
  [LeagueEventType.LAJE_EVENT]: "Eventos da LAJE",
};

export const LEAGUE_EVENT_TYPE_BADGE_TONES: Record<LeagueEventType, AppBadgeTone> = {
  [LeagueEventType.HH]: AppBadgeTone.AMBER,
  [LeagueEventType.OPEN_BAR]: AppBadgeTone.EMERALD,
  [LeagueEventType.CHAMPIONSHIP]: AppBadgeTone.BLUE,
  [LeagueEventType.LAJE_EVENT]: AppBadgeTone.RED,
};

export const LEAGUE_EVENT_TYPE_DOT_CLASS_NAMES: Record<LeagueEventType, string> = {
  [LeagueEventType.HH]: "bg-amber-500",
  [LeagueEventType.OPEN_BAR]: "bg-emerald-500",
  [LeagueEventType.CHAMPIONSHIP]: "bg-blue-500",
  [LeagueEventType.LAJE_EVENT]: "bg-red-500",
};

export const LEAGUE_EVENT_TYPE_GLASS_CARD_CLASS_NAMES: Record<LeagueEventType, string> = {
  [LeagueEventType.HH]:
    "border-amber-200/70 bg-amber-100/42 text-amber-900 dark:border-amber-500/45 dark:bg-amber-900/48 dark:text-amber-100",
  [LeagueEventType.OPEN_BAR]:
    "border-emerald-200/70 bg-emerald-100/42 text-emerald-900 dark:border-emerald-500/45 dark:bg-emerald-900/48 dark:text-emerald-100",
  [LeagueEventType.CHAMPIONSHIP]:
    "border-blue-200/70 bg-blue-100/42 text-blue-900 dark:border-blue-500/45 dark:bg-blue-900/48 dark:text-blue-100",
  [LeagueEventType.LAJE_EVENT]:
    "border-red-200/70 bg-red-100/42 text-red-900 dark:border-red-500/45 dark:bg-red-900/52 dark:text-red-100",
};

export const LEAGUE_EVENT_TYPE_META_TEXT_CLASS_NAMES: Record<LeagueEventType, string> = {
  [LeagueEventType.HH]: "text-amber-800/90 dark:text-amber-100/85",
  [LeagueEventType.OPEN_BAR]: "text-emerald-800/90 dark:text-emerald-100/85",
  [LeagueEventType.CHAMPIONSHIP]: "text-blue-800/90 dark:text-blue-100/85",
  [LeagueEventType.LAJE_EVENT]: "text-red-800/90 dark:text-red-100/85",
};

export const LEAGUE_EVENT_ORGANIZER_LABELS: Record<LeagueEventOrganizerType, string> = {
  [LeagueEventOrganizerType.ATHLETIC]: "Atlética",
  [LeagueEventOrganizerType.LAJE]: "LAJE",
};

export function isLeagueEventType(value: string): value is LeagueEventType {
  return (
    value === LeagueEventType.HH ||
    value === LeagueEventType.OPEN_BAR ||
    value === LeagueEventType.CHAMPIONSHIP ||
    value === LeagueEventType.LAJE_EVENT
  );
}

export const LEAGUE_EVENT_LEGEND_ORDER: LeagueEventType[] = [
  LeagueEventType.LAJE_EVENT,
  LeagueEventType.HH,
  LeagueEventType.OPEN_BAR,
  LeagueEventType.CHAMPIONSHIP,
];
