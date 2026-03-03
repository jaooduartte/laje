import { AppRoutePath, PublicPageAccessSettingField } from "@/lib/enums";
import type { PublicAccessSettings } from "@/lib/types";

export const DEFAULT_PUBLIC_ACCESS_SETTINGS: PublicAccessSettings = {
  is_public_access_blocked: false,
  is_live_page_blocked: false,
  is_championships_page_blocked: false,
  is_schedule_page_blocked: false,
  is_league_calendar_page_blocked: false,
  blocked_message: null,
  updated_at: null,
};

export const PUBLIC_PAGE_ACCESS_LABELS: Record<PublicPageAccessSettingField, string> = {
  [PublicPageAccessSettingField.LIVE]: "Ao Vivo",
  [PublicPageAccessSettingField.CHAMPIONSHIPS]: "Campeonatos",
  [PublicPageAccessSettingField.SCHEDULE]: "Agenda",
  [PublicPageAccessSettingField.LEAGUE_CALENDAR]: "Calendário da Liga",
};

export const PUBLIC_PAGE_ACCESS_FIELD_ORDER: PublicPageAccessSettingField[] = [
  PublicPageAccessSettingField.LIVE,
  PublicPageAccessSettingField.CHAMPIONSHIPS,
  PublicPageAccessSettingField.SCHEDULE,
  PublicPageAccessSettingField.LEAGUE_CALENDAR,
];

export function resolvePublicAccessSettings(
  data: PublicAccessSettings[] | PublicAccessSettings | null,
): PublicAccessSettings {
  const normalizedData = Array.isArray(data) ? data[0] : data;

  if (!normalizedData) {
    return DEFAULT_PUBLIC_ACCESS_SETTINGS;
  }

  return {
    ...DEFAULT_PUBLIC_ACCESS_SETTINGS,
    ...normalizedData,
  };
}

function isPublicRoutePath(routePath: string): boolean {
  return (
    routePath == AppRoutePath.HOME ||
    routePath == AppRoutePath.LIVE ||
    routePath == AppRoutePath.CHAMPIONSHIPS ||
    routePath == AppRoutePath.SCHEDULE ||
    routePath == AppRoutePath.LEAGUE_CALENDAR ||
    routePath == AppRoutePath.LEGACY_CHAMPIONSHIPS ||
    routePath == AppRoutePath.LEGACY_SCHEDULE ||
    routePath == AppRoutePath.LEGACY_LEAGUE_CALENDAR
  );
}

export function resolveIsPublicRouteBlocked(
  publicAccessSettings: PublicAccessSettings,
  routePath: AppRoutePath | string,
): boolean {
  if (!isPublicRoutePath(routePath)) {
    return false;
  }

  if (publicAccessSettings.is_public_access_blocked) {
    return true;
  }

  if (routePath == AppRoutePath.HOME) {
    return false;
  }

  if (routePath == AppRoutePath.LIVE) {
    return publicAccessSettings.is_live_page_blocked;
  }

  if (routePath == AppRoutePath.CHAMPIONSHIPS || routePath == AppRoutePath.LEGACY_CHAMPIONSHIPS) {
    return publicAccessSettings.is_championships_page_blocked;
  }

  if (routePath == AppRoutePath.SCHEDULE || routePath == AppRoutePath.LEGACY_SCHEDULE) {
    return publicAccessSettings.is_schedule_page_blocked;
  }

  if (routePath == AppRoutePath.LEAGUE_CALENDAR || routePath == AppRoutePath.LEGACY_LEAGUE_CALENDAR) {
    return publicAccessSettings.is_league_calendar_page_blocked;
  }

  return false;
}
