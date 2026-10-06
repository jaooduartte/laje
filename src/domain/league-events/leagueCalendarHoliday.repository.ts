import { isSupabaseBackendEnabled } from "@/config/environment";
import { supabase } from "@/integrations/supabase/client";
import type { LeagueCalendarHoliday } from "@/lib/types";

interface DateRangeFilter {
  startDate: string;
  endDate: string;
}

export async function ensureLeagueCalendarHolidaysYear(year: number) {
  if (!isSupabaseBackendEnabled()) {
    return {
      data: null,
      error: new Error(
        "Geração de feriados ainda depende do Supabase e está bloqueada no modo AWS.",
      ),
    };
  }

  return supabase.rpc("ensure_league_calendar_holidays_year", { _year: year });
}

export async function fetchLeagueCalendarHolidaysByDateRange({
  startDate,
  endDate,
}: DateRangeFilter) {
  if (!isSupabaseBackendEnabled()) {
    return {
      data: [] as LeagueCalendarHoliday[],
      error: new Error(
        "Consulta de feriados ainda depende do Supabase e está bloqueada no modo AWS.",
      ),
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
