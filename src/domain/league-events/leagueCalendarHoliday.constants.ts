import { AppBadgeTone, LeagueCalendarHolidayDayKind, LeagueCalendarHolidayScope } from "@/lib/enums";

export const LEAGUE_CALENDAR_HOLIDAY_SCOPE_LABELS: Record<LeagueCalendarHolidayScope, string> = {
  [LeagueCalendarHolidayScope.NATIONAL]: "Nacional",
  [LeagueCalendarHolidayScope.JOINVILLE]: "Joinville",
};

export const LEAGUE_CALENDAR_HOLIDAY_DAY_KIND_LABELS: Record<LeagueCalendarHolidayDayKind, string> = {
  [LeagueCalendarHolidayDayKind.HOLIDAY]: "Feriado",
  [LeagueCalendarHolidayDayKind.OPTIONAL]: "Feriado",
};

export const LEAGUE_CALENDAR_HOLIDAY_DAY_KIND_BADGE_TONES: Record<LeagueCalendarHolidayDayKind, AppBadgeTone> = {
  [LeagueCalendarHolidayDayKind.HOLIDAY]: AppBadgeTone.SILVER,
  [LeagueCalendarHolidayDayKind.OPTIONAL]: AppBadgeTone.SILVER,
};

export const LEAGUE_CALENDAR_HOLIDAY_DAY_KIND_DOT_CLASS_NAMES: Record<LeagueCalendarHolidayDayKind, string> = {
  [LeagueCalendarHolidayDayKind.HOLIDAY]: "bg-slate-400 dark:bg-slate-300",
  [LeagueCalendarHolidayDayKind.OPTIONAL]: "bg-slate-400 dark:bg-slate-300",
};

export const LEAGUE_CALENDAR_HOLIDAY_DAY_KIND_GLASS_CARD_CLASS_NAMES: Record<LeagueCalendarHolidayDayKind, string> = {
  [LeagueCalendarHolidayDayKind.HOLIDAY]:
    "border-slate-200/70 bg-slate-100/60 text-slate-900 dark:border-slate-500/40 dark:bg-slate-900/50 dark:text-slate-100",
  [LeagueCalendarHolidayDayKind.OPTIONAL]:
    "border-slate-200/70 bg-slate-100/60 text-slate-900 dark:border-slate-500/40 dark:bg-slate-900/50 dark:text-slate-100",
};

export const LEAGUE_CALENDAR_HOLIDAY_DAY_KIND_META_TEXT_CLASS_NAMES: Record<LeagueCalendarHolidayDayKind, string> = {
  [LeagueCalendarHolidayDayKind.HOLIDAY]: "text-slate-700/90 dark:text-slate-200/80",
  [LeagueCalendarHolidayDayKind.OPTIONAL]: "text-slate-700/90 dark:text-slate-200/80",
};

export const LEAGUE_CALENDAR_HOLIDAY_DAY_KIND_LEGEND_ORDER: LeagueCalendarHolidayDayKind[] = [
  LeagueCalendarHolidayDayKind.HOLIDAY,
];
