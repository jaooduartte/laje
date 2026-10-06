import { isAwsBackendEnabled, isSupabaseBackendEnabled } from "@/config/environment";
import {
  ensureAwsLeagueCalendarHolidaysYear,
  listAwsLeagueCalendarHolidays,
} from "@/integrations/laje-api/public-runtime";
import { supabase } from "@/integrations/supabase/client";
import type { LeagueCalendarHoliday } from "@/lib/types";

interface DateRangeFilter {
  startDate: string;
  endDate: string;
}

export async function ensureLeagueCalendarHolidaysYear(year: number) {
  if (isAwsBackendEnabled()) {
    try {
      return { data: await ensureAwsLeagueCalendarHolidaysYear(year), error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error("Falha ao gerar feriados pela laje-api."),
      };
    }
  }

  if (!isSupabaseBackendEnabled()) {
    return {
      data: null,
      error: new Error("Backend de feriados não configurado."),
    };
  }

  return supabase.rpc("ensure_league_calendar_holidays_year", { _year: year });
}

export async function fetchLeagueCalendarHolidaysByDateRange({
  startDate,
  endDate,
}: DateRangeFilter) {
  if (isAwsBackendEnabled()) {
    try {
      return {
        data: await listAwsLeagueCalendarHolidays({ startDate, endDate }),
        error: null,
      };
    } catch (error) {
      return {
        data: [] as LeagueCalendarHoliday[],
        error:
          error instanceof Error ? error : new Error("Falha ao carregar feriados pela laje-api."),
      };
    }
  }

  if (!isSupabaseBackendEnabled()) {
    return {
      data: [] as LeagueCalendarHoliday[],
      error: new Error("Backend de feriados não configurado."),
    };
  }

  const response = await supabase
    .from("league_calendar_holidays")
    .select("*")
    .gte("holiday_date", startDate)
    .lte("holiday_date", endDate)
    .order("holiday_date", { ascending: true })
    .order("day_kind", { ascending: true })
    .order("name", { ascending: true });

  return {
    data: (response.data ?? []) as LeagueCalendarHoliday[],
    error: response.error,
  };
}
