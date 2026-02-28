import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type { LeagueEvent } from "@/lib/types";

interface DateRangeFilter {
  startDate: string;
  endDate: string;
}

export async function fetchLeagueEventsByDateRange({ startDate, endDate }: DateRangeFilter) {
  const response = await supabase
    .from("league_events")
    .select("*, organizer_team:teams(*)")
    .gte("event_date", startDate)
    .lte("event_date", endDate)
    .order("event_date", { ascending: true })
    .order("name", { ascending: true });

  return {
    data: (response.data ?? []) as LeagueEvent[],
    error: response.error,
  };
}

export async function createLeagueEvent(payload: TablesInsert<"league_events">) {
  return supabase
    .from("league_events")
    .insert(payload)
    .select("*, organizer_team:teams(*)")
    .single();
}

export async function updateLeagueEvent(eventId: string, payload: TablesUpdate<"league_events">) {
  return supabase
    .from("league_events")
    .update(payload)
    .eq("id", eventId)
    .select("*, organizer_team:teams(*)")
    .single();
}

export async function deleteLeagueEvent(eventId: string) {
  return supabase.from("league_events").delete().eq("id", eventId);
}
