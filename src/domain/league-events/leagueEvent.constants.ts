import { LeagueEventOrganizerType, LeagueEventType } from "@/lib/enums";

export const LEAGUE_EVENT_TYPE_LABELS: Record<LeagueEventType, string> = {
  [LeagueEventType.HH]: "HH",
  [LeagueEventType.OPEN_BAR]: "OPEN-BAR",
  [LeagueEventType.CHAMPIONSHIP]: "Campeonato",
  [LeagueEventType.LAJE_EVENT]: "Eventos da LAJE",
};

export const LEAGUE_EVENT_TYPE_BADGE_CLASS_NAMES: Record<LeagueEventType, string> = {
  [LeagueEventType.HH]: "border-transparent bg-amber-100 text-amber-700",
  [LeagueEventType.OPEN_BAR]: "border-transparent bg-emerald-100 text-emerald-700",
  [LeagueEventType.CHAMPIONSHIP]: "border-transparent bg-sky-100 text-sky-700",
  [LeagueEventType.LAJE_EVENT]: "border-transparent bg-rose-100 text-rose-700",
};

export const LEAGUE_EVENT_TYPE_DOT_CLASS_NAMES: Record<LeagueEventType, string> = {
  [LeagueEventType.HH]: "bg-amber-500",
  [LeagueEventType.OPEN_BAR]: "bg-emerald-500",
  [LeagueEventType.CHAMPIONSHIP]: "bg-blue-500",
  [LeagueEventType.LAJE_EVENT]: "bg-red-500",
};

export const LEAGUE_EVENT_TYPE_GLASS_CARD_CLASS_NAMES: Record<LeagueEventType, string> = {
  [LeagueEventType.HH]: "border-amber-200/70 bg-amber-100/35",
  [LeagueEventType.OPEN_BAR]: "border-emerald-200/70 bg-emerald-100/35",
  [LeagueEventType.CHAMPIONSHIP]: "border-blue-200/70 bg-blue-100/35",
  [LeagueEventType.LAJE_EVENT]: "border-red-200/70 bg-red-100/35",
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
