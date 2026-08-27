import { supabase } from "@/integrations/supabase/client";
import type {
  ChampionshipAthlete,
  ChampionshipIndividualEvent,
  ChampionshipIndividualEventEntry,
  ChampionshipIndividualEventEntryMember,
  ChampionshipIndividualSession,
  ChampionshipIndividualSessionScoreboardRow,
  ChampionshipIndividualTeamStanding,
  Team,
} from "@/lib/types";
import type {
  ChampionshipIndividualEntryStatus,
  ChampionshipIndividualEventKind,
  ChampionshipIndividualEventStatus,
  ChampionshipIndividualSessionStatus,
  ChampionshipSchedulePeriod,
  MatchNaipe,
  TeamDivision,
} from "@/lib/enums";

type LooseSupabase = {
  from: (table: string) => {
    select: (columns: string) => LooseSupabaseQuery;
    delete: () => LooseSupabaseQuery;
  };
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};

type LooseSupabaseQuery = PromiseLike<{ data: unknown; error: Error | null }> & {
  order: (column: string, options?: Record<string, unknown>) => LooseSupabaseQuery;
  eq: (column: string, value: unknown) => LooseSupabaseQuery;
  in: (column: string, values: unknown[]) => LooseSupabaseQuery;
  is: (column: string, value: unknown) => LooseSupabaseQuery;
};

const supabaseLoose = supabase as unknown as LooseSupabase;

export interface SaveChampionshipAthleteInput {
  athleteId?: string | null;
  championshipId: string;
  seasonYear: number;
  sportId: string;
  teamId: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  name: string;
}

export interface SaveChampionshipIndividualEventInput {
  eventId: string;
  scheduledDate: string | null;
  period: ChampionshipSchedulePeriod | null;
  location: string | null;
  status: ChampionshipIndividualEventStatus;
}

export interface SaveChampionshipIndividualEntryInput {
  eventId: string;
  teamId: string;
  athleteId?: string | null;
  memberAthleteIds?: string[];
  starterAthleteIds?: string[];
}

export interface SaveChampionshipIndividualEventResultInput {
  entry_id: string;
  status: ChampionshipIndividualEntryStatus;
  result_time_milliseconds: number | null;
  result_mark_centimeters: number | null;
}

export interface SaveChampionshipIndividualLiveEntryInput {
  entry_id?: string | null;
  team_id: string;
  athlete_id?: string | null;
  starter_athlete_ids?: string[];
  lane_number: number;
  status: ChampionshipIndividualEntryStatus;
  result_time_milliseconds: number | null;
  attempt_one_centimeters: number | null;
  attempt_two_centimeters: number | null;
  attempt_three_centimeters: number | null;
}

export interface SaveChampionshipIndividualSessionInput {
  sessionId: string;
  scheduledDate: string | null;
  period: ChampionshipSchedulePeriod | null;
  locationKey: string | null;
  courtKey: string | null;
  locationName: string | null;
  courtName: string | null;
  status: ChampionshipIndividualSessionStatus;
  exclusiveLockEnabled: boolean;
}

export async function syncChampionshipIndividualEventsFromSetup(
  championshipId: string,
  seasonYear: number,
) {
  return supabaseLoose.rpc("sync_championship_individual_events_from_setup", {
    _championship_id: championshipId,
    _season_year: seasonYear,
  });
}

export async function syncChampionshipIndividualSessionsFromSetup(
  championshipId: string,
  seasonYear: number,
) {
  return supabaseLoose.rpc("sync_championship_individual_sessions_from_setup", {
    _championship_id: championshipId,
    _season_year: seasonYear,
  });
}

export async function fetchChampionshipIndividualEvents({
  championshipId,
  seasonYear,
  sportId,
}: {
  championshipId?: string | null;
  seasonYear?: number | null;
  sportId?: string | null;
}): Promise<{ data: ChampionshipIndividualEvent[]; error: Error | null }> {
  let query = supabaseLoose
    .from("championship_individual_events")
    .select("*, sports(*)")
    .order("display_order", { ascending: true })
    .order("scheduled_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (championshipId) {
    query = query.eq("championship_id", championshipId);
  }

  if (typeof seasonYear == "number") {
    query = query.eq("season_year", seasonYear);
  }

  if (sportId) {
    query = query.eq("sport_id", sportId);
  }

  const { data, error } = await query;
  return {
    data: ((data ?? []) as ChampionshipIndividualEvent[]).sort((leftEvent, rightEvent) => {
      if ((leftEvent.scheduled_date ?? "") != (rightEvent.scheduled_date ?? "")) {
        return (leftEvent.scheduled_date ?? "").localeCompare(rightEvent.scheduled_date ?? "");
      }

      if (leftEvent.display_order != rightEvent.display_order) {
        return leftEvent.display_order - rightEvent.display_order;
      }

      return leftEvent.name.localeCompare(rightEvent.name, "pt-BR", { sensitivity: "base" });
    }),
    error,
  };
}

export async function fetchChampionshipIndividualSessions({
  championshipId,
  seasonYear,
  sportId,
  status,
  sessionIds,
}: {
  championshipId?: string | null;
  seasonYear?: number | null;
  sportId?: string | null;
  status?: ChampionshipIndividualSessionStatus | null;
  sessionIds?: string[];
}): Promise<{ data: ChampionshipIndividualSession[]; error: Error | null }> {
  if (sessionIds != null && sessionIds.length == 0) {
    return { data: [], error: null };
  }

  let query = supabaseLoose
    .from("championship_individual_sessions")
    .select("*, sports(*)")
    .order("scheduled_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (championshipId) {
    query = query.eq("championship_id", championshipId);
  }

  if (typeof seasonYear == "number") {
    query = query.eq("season_year", seasonYear);
  }

  if (sportId) {
    query = query.eq("sport_id", sportId);
  }

  if (sessionIds != null) {
    query = query.in("id", sessionIds);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  return {
    data: (data ?? []) as ChampionshipIndividualSession[],
    error,
  };
}

export async function fetchChampionshipAthletes({
  championshipId,
  seasonYear,
  sportIds,
}: {
  championshipId?: string | null;
  seasonYear?: number | null;
  sportIds?: string[];
}): Promise<{ data: ChampionshipAthlete[]; error: Error | null }> {
  let query = supabaseLoose
    .from("championship_award_players")
    .select("*, teams(*), sports(*)")
    .order("name", { ascending: true });

  if (championshipId) {
    query = query.eq("championship_id", championshipId);
  }

  if (typeof seasonYear == "number") {
    query = query.eq("season_year", seasonYear);
  }

  if (sportIds && sportIds.length > 0) {
    query = query.in("sport_id", sportIds);
  }

  const { data, error } = await query;
  return {
    data: (data ?? []) as ChampionshipAthlete[],
    error,
  };
}

export async function fetchChampionshipIndividualEventEntries({
  eventIds,
}: {
  eventIds: string[];
}): Promise<{
  data: ChampionshipIndividualEventEntry[];
  membersByEntryId: Record<string, ChampionshipIndividualEventEntryMember[]>;
  error: Error | null;
}> {
  if (eventIds.length == 0) {
    return { data: [], membersByEntryId: {}, error: null };
  }

  const entriesResponse = await supabaseLoose
    .from("championship_individual_event_entries")
    .select("*, teams(*)")
    .in("event_id", eventIds)
    .order("created_at", { ascending: true });

  if (entriesResponse.error) {
    return { data: [], membersByEntryId: {}, error: entriesResponse.error };
  }

  const entryIds = ((entriesResponse.data ?? []) as ChampionshipIndividualEventEntry[]).map((entry) => entry.id);

  if (entryIds.length == 0) {
    return {
      data: (entriesResponse.data ?? []) as ChampionshipIndividualEventEntry[],
      membersByEntryId: {},
      error: null,
    };
  }

  const membersResponse = await supabaseLoose
    .from("championship_individual_event_entry_members")
    .select("*")
    .in("entry_id", entryIds)
    .order("position", { ascending: true });

  if (membersResponse.error) {
    return { data: [], membersByEntryId: {}, error: membersResponse.error };
  }

  const membersByEntryId = ((membersResponse.data ?? []) as ChampionshipIndividualEventEntryMember[]).reduce<Record<string, ChampionshipIndividualEventEntryMember[]>>(
    (carry, member) => {
      carry[member.entry_id] = [...(carry[member.entry_id] ?? []), member];
      return carry;
    },
    {},
  );

  return {
    data: ((entriesResponse.data ?? []) as ChampionshipIndividualEventEntry[]).map((entry) => ({
      ...entry,
      members: membersByEntryId[entry.id] ?? [],
    })),
    membersByEntryId,
    error: null,
  };
}

export async function fetchChampionshipIndividualTeamStandings({
  championshipId,
  seasonYear,
  sportId,
  naipe,
  division,
}: {
  championshipId?: string | null;
  seasonYear?: number | null;
  sportId?: string | null;
  naipe?: MatchNaipe | null;
  division?: TeamDivision | null | undefined;
}): Promise<{ data: ChampionshipIndividualTeamStanding[]; error: Error | null }> {
  let query = supabaseLoose
    .from("championship_individual_team_standings")
    .select("*, teams(*), sports(*)")
    .order("total_points", { ascending: false })
    .order("first_places", { ascending: false })
    .order("second_places", { ascending: false })
    .order("third_places", { ascending: false })
    .order("fourth_places", { ascending: false })
    .order("fifth_places", { ascending: false })
    .order("sixth_places", { ascending: false })
    .order("seventh_places", { ascending: false })
    .order("eighth_places", { ascending: false })
    .order("ninth_places", { ascending: false })
    .order("tenth_places", { ascending: false })
    .order("eleventh_places", { ascending: false })
    .order("twelfth_places", { ascending: false })
    .order("thirteenth_places", { ascending: false })
    .order("fourteenth_places", { ascending: false })
    .order("fifteenth_places", { ascending: false })
    .order("sixteenth_places", { ascending: false })
    .order("seventeenth_places", { ascending: false })
    .order("eighteenth_places", { ascending: false })
    .order("nineteenth_places", { ascending: false })
    .order("twentieth_places", { ascending: false });

  if (championshipId) {
    query = query.eq("championship_id", championshipId);
  }

  if (typeof seasonYear == "number") {
    query = query.eq("season_year", seasonYear);
  }

  if (sportId) {
    query = query.eq("sport_id", sportId);
  }

  if (naipe) {
    query = query.eq("naipe", naipe);
  }

  if (division === null) {
    query = query.is("division", null);
  } else if (division !== undefined) {
    query = query.eq("division", division);
  }

  const { data, error } = await query;
  return {
    data: (data ?? []) as ChampionshipIndividualTeamStanding[],
    error,
  };
}

export async function saveChampionshipAthlete(input: SaveChampionshipAthleteInput) {
  return supabaseLoose.rpc("save_championship_athlete", {
    _athlete_id: input.athleteId ?? null,
    _championship_id: input.championshipId,
    _season_year: input.seasonYear,
    _sport_id: input.sportId,
    _team_id: input.teamId,
    _naipe: input.naipe,
    _division: input.division,
    _name: input.name,
  });
}

export async function removeChampionshipAthlete(athleteId: string) {
  return supabaseLoose.rpc("remove_championship_athlete", {
    _athlete_id: athleteId,
  });
}

export async function saveChampionshipIndividualEvent(input: SaveChampionshipIndividualEventInput) {
  return supabaseLoose.rpc("save_championship_individual_event", {
    _event_id: input.eventId,
    _scheduled_date: input.scheduledDate,
    _period: input.period,
    _location: input.location,
    _status: input.status,
  });
}

export async function saveChampionshipIndividualSession(input: SaveChampionshipIndividualSessionInput) {
  return supabaseLoose.rpc("save_championship_individual_session", {
    _session_id: input.sessionId,
    _scheduled_date: input.scheduledDate,
    _period: input.period,
    _location_key: input.locationKey,
    _court_key: input.courtKey,
    _location_name: input.locationName,
    _court_name: input.courtName,
    _status: input.status,
    _exclusive_lock_enabled: input.exclusiveLockEnabled,
  });
}

export async function saveChampionshipIndividualEventEntry(input: SaveChampionshipIndividualEntryInput) {
  return supabaseLoose.rpc("save_championship_individual_event_entry", {
    _event_id: input.eventId,
    _team_id: input.teamId,
    _athlete_id: input.athleteId ?? null,
    _member_athlete_ids: input.memberAthleteIds ?? [],
    _starter_athlete_ids: input.starterAthleteIds ?? [],
  });
}

export async function removeChampionshipIndividualEventEntry(entryId: string) {
  return supabaseLoose.rpc("remove_championship_individual_event_entry", {
    _entry_id: entryId,
  });
}

export async function saveChampionshipIndividualEventResults(
  eventId: string,
  results: SaveChampionshipIndividualEventResultInput[],
) {
  return supabaseLoose.rpc("save_championship_individual_event_results", {
    _event_id: eventId,
    _results: results,
  });
}

export async function saveChampionshipIndividualEventLiveResults(
  eventId: string,
  entries: SaveChampionshipIndividualLiveEntryInput[],
) {
  return supabaseLoose.rpc("save_championship_individual_event_live_results", {
    _event_id: eventId,
    _entries: entries,
  });
}

export async function previewChampionshipIndividualSessionScoreboard(
  sessionId: string,
): Promise<{ data: ChampionshipIndividualSessionScoreboardRow[]; error: Error | null }> {
  const response = await supabaseLoose.rpc(
    "preview_championship_individual_session_scoreboard",
    {
      _session_id: sessionId,
    },
  );

  return {
    data: (response.data ?? []) as ChampionshipIndividualSessionScoreboardRow[],
    error: response.error,
  };
}

export async function fetchChampionshipIndividualSessionParticipants(
  sessionId: string,
): Promise<{ data: Team[]; error: Error | null }> {
  const response = await supabaseLoose.rpc(
    "get_championship_individual_session_participants",
    { _session_id: sessionId },
  );

  return {
    data: ((response.data ?? []) as Array<{ teams?: Team | null }>)
      .map((row) => row.teams)
      .filter((team): team is Team => team != null),
    error: response.error,
  };
}

export async function startChampionshipIndividualSession(sessionId: string) {
  return supabaseLoose.rpc("start_championship_individual_session", {
    _session_id: sessionId,
  });
}

export async function finishChampionshipIndividualSession(sessionId: string) {
  return supabaseLoose.rpc("finish_championship_individual_session", {
    _session_id: sessionId,
  });
}

export async function reopenChampionshipIndividualSession(sessionId: string) {
  return supabaseLoose.rpc("reopen_championship_individual_session", {
    _session_id: sessionId,
  });
}

export async function returnChampionshipIndividualSessionToScheduled(sessionId: string) {
  return supabaseLoose.rpc("return_championship_individual_session_to_scheduled", {
    _session_id: sessionId,
  });
}

export async function markChampionshipIndividualEventTeamWalkover(
  eventId: string,
  teamId: string,
) {
  return supabaseLoose.rpc("mark_championship_individual_event_team_walkover", {
    _event_id: eventId,
    _team_id: teamId,
  });
}

export async function fetchChampionshipEffectiveStandings({
  championshipId,
  seasonYear,
  division,
  naipe,
  sportId,
}: {
  championshipId?: string | null;
  seasonYear?: number | null;
  division?: TeamDivision | null | undefined;
  naipe?: MatchNaipe | null;
  sportId?: string | null;
}) {
  return supabaseLoose.rpc("get_championship_effective_standings", {
    _championship_id: championshipId ?? null,
    _season_year: seasonYear ?? null,
    _division_filter:
      division === undefined
        ? null
        : division === null
          ? "WITHOUT_DIVISION"
          : division,
    _naipe: naipe ?? null,
    _sport_id: sportId ?? null,
  });
}
