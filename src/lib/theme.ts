import { ThemeMode, ThemeTimeZone } from "@/lib/enums";

export const AUTO_THEME_DARK_START_HOUR = 18;
export const AUTO_THEME_LIGHT_START_HOUR = 6;
export const AUTO_THEME_TIME_ZONE = ThemeTimeZone.SAO_PAULO;

interface HourAndMinute {
  hour: number;
  minute: number;
}

function resolveLocalHourAndMinute(now: Date): HourAndMinute {
  return {
    hour: now.getHours(),
    minute: now.getMinutes(),
  };
}

export function resolveSaoPauloHourAndMinute(now: Date): HourAndMinute {
  try {
    const hourFormatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: AUTO_THEME_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });

    const datePartByType = new Map(
      hourFormatter
        .formatToParts(now)
        .filter((datePart) => datePart.type == "hour" || datePart.type == "minute")
        .map((datePart) => [datePart.type, datePart.value]),
    );
    const parsedHour = Number(datePartByType.get("hour"));
    const parsedMinute = Number(datePartByType.get("minute"));

    if (Number.isNaN(parsedHour) || Number.isNaN(parsedMinute)) {
      return resolveLocalHourAndMinute(now);
    }

    return {
      hour: parsedHour,
      minute: parsedMinute,
    };
  } catch {
    return resolveLocalHourAndMinute(now);
  }
}

export function resolveThemeModeByTime(now: Date): ThemeMode {
  const { hour } = resolveSaoPauloHourAndMinute(now);
  const isDarkModeHour = hour >= AUTO_THEME_DARK_START_HOUR || hour < AUTO_THEME_LIGHT_START_HOUR;

  return isDarkModeHour ? ThemeMode.DARK : ThemeMode.LIGHT;
}

export function resolveIsDarkModeByTime(now: Date): boolean {
  return resolveThemeModeByTime(now) == ThemeMode.DARK;
}
