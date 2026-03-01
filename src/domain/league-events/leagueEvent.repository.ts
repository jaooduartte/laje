import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { LeagueEventOrganizerType } from "@/lib/enums";
import type { LeagueEvent, Team } from "@/lib/types";

interface DateRangeFilter {
  startDate: string;
  endDate: string;
}

interface LeagueEventOrganizerTeamsRelationRow {
  event_id: string;
  team: Team | null;
}

const LEAGUE_EVENT_SELECT_QUERY = "*, organizer_team:teams!league_events_organizer_team_id_fkey(*)";

function resolveOrderedOrganizerTeams(organizerTeams: Team[]) {
  return [...organizerTeams].sort((firstTeam, secondTeam) => firstTeam.name.localeCompare(secondTeam.name));
}

function mapLeagueEvents(
  rawLeagueEvents: LeagueEvent[],
  organizerTeamsByEventId: Record<string, Team[]>,
): LeagueEvent[] {
  return rawLeagueEvents.map((leagueEvent) => ({
    ...leagueEvent,
    organizer_teams: resolveOrderedOrganizerTeams(organizerTeamsByEventId[leagueEvent.id] ?? []),
  }));
}

async function fetchOrganizerTeamsByEventIds(eventIds: string[]) {
  if (eventIds.length == 0) {
    return {};
  }

  const response = await supabase
    .from("league_event_organizer_teams")
    .select("event_id, team:teams!league_event_organizer_teams_team_id_fkey(*)")
    .in("event_id", eventIds);

  if (response.error) {
    return {};
  }

  return (response.data ?? []).reduce<Record<string, Team[]>>((organizerTeamsByEventId, organizerRelation) => {
    const leagueEventOrganizerRelation = organizerRelation as LeagueEventOrganizerTeamsRelationRow;
    const eventId = leagueEventOrganizerRelation.event_id;
    const organizerTeam = leagueEventOrganizerRelation.team;

    if (!eventId || !organizerTeam) {
      return organizerTeamsByEventId;
    }

    if (!organizerTeamsByEventId[eventId]) {
      organizerTeamsByEventId[eventId] = [];
    }

    organizerTeamsByEventId[eventId].push(organizerTeam);
    return organizerTeamsByEventId;
  }, {});
}

async function fetchLeagueEventById(eventId: string) {
  const response = await supabase
    .from("league_events")
    .select(LEAGUE_EVENT_SELECT_QUERY)
    .eq("id", eventId)
    .single();

  if (response.error) {
    const basicResponse = await supabase
      .from("league_events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (basicResponse.error || !basicResponse.data) {
      return {
        data: null,
        error: basicResponse.error,
      };
    }

    const organizerTeamsByEventId = await fetchOrganizerTeamsByEventIds([eventId]);

    return {
      data: mapLeagueEvents([basicResponse.data as LeagueEvent], organizerTeamsByEventId)[0] ?? null,
      error: null,
    };
  }

  if (!response.data) {
    return {
      data: null,
      error: response.error,
    };
  }

  const organizerTeamsByEventId = await fetchOrganizerTeamsByEventIds([eventId]);

  return {
    data: mapLeagueEvents([response.data as LeagueEvent], organizerTeamsByEventId)[0] ?? null,
    error: null,
  };
}

async function replaceLeagueEventOrganizerTeams(eventId: string, organizerTeamIds: string[]) {
  const normalizedOrganizerTeamIds = [...new Set(organizerTeamIds)];

  const deleteResponse = await supabase.from("league_event_organizer_teams").delete().eq("event_id", eventId);

  if (deleteResponse.error) {
    return deleteResponse.error;
  }

  if (normalizedOrganizerTeamIds.length == 0) {
    return null;
  }

  const insertPayload = normalizedOrganizerTeamIds.map((organizerTeamId) => ({
    event_id: eventId,
    team_id: organizerTeamId,
  }));

  const insertResponse = await supabase.from("league_event_organizer_teams").insert(insertPayload);
  return insertResponse.error;
}

export async function fetchLeagueEventsByDateRange({ startDate, endDate }: DateRangeFilter) {
  const response = await supabase
    .from("league_events")
    .select(LEAGUE_EVENT_SELECT_QUERY)
    .gte("event_date", startDate)
    .lte("event_date", endDate)
    .order("event_date", { ascending: true })
    .order("name", { ascending: true });

  if (response.error) {
    const basicResponse = await supabase
      .from("league_events")
      .select("*")
      .gte("event_date", startDate)
      .lte("event_date", endDate)
      .order("event_date", { ascending: true })
      .order("name", { ascending: true });

    if (basicResponse.error) {
      return {
        data: [],
        error: basicResponse.error,
      };
    }

    const baseLeagueEvents = (basicResponse.data ?? []) as LeagueEvent[];
    const organizerTeamsByEventId = await fetchOrganizerTeamsByEventIds(
      baseLeagueEvents.map((leagueEvent) => leagueEvent.id),
    );

    return {
      data: mapLeagueEvents(baseLeagueEvents, organizerTeamsByEventId),
      error: basicResponse.error,
    };
  }

  const baseLeagueEvents = (response.data ?? []) as LeagueEvent[];
  const organizerTeamsByEventId = await fetchOrganizerTeamsByEventIds(
    baseLeagueEvents.map((leagueEvent) => leagueEvent.id),
  );

  return {
    data: mapLeagueEvents(baseLeagueEvents, organizerTeamsByEventId),
    error: response.error,
  };
}

export async function createLeagueEvent(payload: TablesInsert<"league_events">, organizerTeamIds: string[]) {
  const createResponse = await supabase
    .from("league_events")
    .insert(payload)
    .select("id")
    .single();

  if (createResponse.error || !createResponse.data) {
    return {
      data: null,
      error: createResponse.error,
    };
  }

  if (payload.organizer_type == LeagueEventOrganizerType.ATHLETIC) {
    const syncError = await replaceLeagueEventOrganizerTeams(createResponse.data.id, organizerTeamIds);

    if (syncError) {
      await supabase.from("league_events").delete().eq("id", createResponse.data.id);

      return {
        data: null,
        error: syncError,
      };
    }
  }

  return fetchLeagueEventById(createResponse.data.id);
}

export async function updateLeagueEvent(eventId: string, payload: TablesUpdate<"league_events">, organizerTeamIds: string[]) {
  const updateResponse = await supabase
    .from("league_events")
    .update(payload)
    .eq("id", eventId)
    .select("id, organizer_type")
    .single();

  if (updateResponse.error || !updateResponse.data) {
    return {
      data: null,
      error: updateResponse.error,
    };
  }

  const resolvedOrganizerType = payload.organizer_type ?? updateResponse.data.organizer_type;
  const resolvedOrganizerTeamIds =
    resolvedOrganizerType == LeagueEventOrganizerType.ATHLETIC ? organizerTeamIds : [];

  const syncError = await replaceLeagueEventOrganizerTeams(eventId, resolvedOrganizerTeamIds);

  if (syncError) {
    return {
      data: null,
      error: syncError,
    };
  }

  return fetchLeagueEventById(eventId);
}

export async function deleteLeagueEvent(eventId: string) {
  return supabase.from("league_events").delete().eq("id", eventId);
}
