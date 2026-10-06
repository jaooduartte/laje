import type { ChampionshipCode, MatchNaipe, TeamDivision } from "@/lib/enums";
import type {
  ChampionshipIndividualEvent,
  ChampionshipIndividualEventEntry,
  ChampionshipIndividualEventEntryMember,
  ChampionshipIndividualSession,
  ChampionshipIndividualTeamStanding,
  ChampionshipSport,
  HomeDashboardMetrics,
  Sport,
  Team,
} from "@/lib/types";
import { lajeApiRequest } from "./client";

interface DataResponse<T> {
  data: T;
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function toTeam(row: Record<string, unknown>): Team {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    city: String(row.city ?? ""),
    division: (row.division ?? null) as Team["division"],
    is_active:
      typeof row.isActive === "boolean"
        ? row.isActive
        : typeof row.is_active === "boolean"
          ? row.is_active
          : true,
    created_at: String(row.createdAt ?? row.created_at ?? ""),
  };
}

function toSport(row: Record<string, unknown>): Sport {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    code: typeof row.code === "string" ? row.code : null,
    default_match_duration_minutes:
      row.defaultMatchDurationMinutes == null
        ? row.default_match_duration_minutes == null
          ? null
          : asNumber(row.default_match_duration_minutes)
        : asNumber(row.defaultMatchDurationMinutes),
    created_at: String(row.createdAt ?? row.created_at ?? ""),
  };
}

function joinedSport(row: Record<string, unknown>): Sport | null {
  if (!row.sport_join_id) return null;
  return {
    id: String(row.sport_join_id),
    name: String(row.sport_join_name ?? ""),
    code: typeof row.sport_join_code === "string" ? row.sport_join_code : null,
    created_at: String(row.sport_join_created_at ?? ""),
  };
}

function joinedTeam(row: Record<string, unknown>): Team | null {
  if (!row.team_join_id) return null;
  return {
    id: String(row.team_join_id),
    name: String(row.team_join_name ?? ""),
    city: String(row.team_join_city ?? ""),
    division: (row.team_join_division ?? null) as Team["division"],
    created_at: String(row.team_join_created_at ?? ""),
  };
}

export async function listAwsTeams(includeInactive = false): Promise<Team[]> {
  const search = new URLSearchParams();
  if (includeInactive) search.set("includeInactive", "true");
  const response = await lajeApiRequest<DataResponse<Record<string, unknown>[]>>(
    `/public-runtime/teams?${search.toString()}`,
  );
  return response.data.map(toTeam);
}

export async function listAwsSports(championshipId?: string | null): Promise<{
  sports: Sport[];
  championshipSports: ChampionshipSport[];
}> {
  const search = new URLSearchParams();
  if (championshipId) search.set("championshipId", championshipId);
  const response = await lajeApiRequest<
    DataResponse<{
      sports: Record<string, unknown>[];
      championshipSports: Record<string, unknown>[];
    }>
  >(`/public-runtime/sports?${search.toString()}`);

  return {
    sports: response.data.sports.map(toSport),
    championshipSports: response.data.championshipSports.map((row) => ({
      id: String(row.id),
      championship_id: String(row.championshipId),
      sport_id: String(row.sportId),
      naipe_mode: row.naipeMode as ChampionshipSport["naipe_mode"],
      result_rule: row.resultRule as ChampionshipSport["result_rule"],
      supports_cards: Boolean(row.supportsCards),
      tie_breaker_rule: row.tieBreakerRule as ChampionshipSport["tie_breaker_rule"],
      default_match_duration_minutes: asNumber(row.defaultMatchDurationMinutes),
      show_estimated_start_time_on_cards: Boolean(row.showEstimatedStartTimeOnCards),
      points_win: asNumber(row.pointsWin),
      points_draw: asNumber(row.pointsDraw),
      points_loss: asNumber(row.pointsLoss),
      created_at: String(row.createdAt ?? ""),
      walkover_winner_points:
        row.walkoverWinnerPoints == null ? null : asNumber(row.walkoverWinnerPoints),
      walkover_winner_set_count: asNumber(row.walkoverWinnerSetCount),
      awards_include_knockout_phase: Boolean(row.awardsIncludeKnockoutPhase),
      supports_individual_awards: Boolean(row.supportsIndividualAwards),
      classification_policy:
        (row.classificationPolicy as Record<string, unknown> | null | undefined) ?? null,
    })),
  };
}

export async function listAwsChampionshipSeasonYears(championshipId: string): Promise<number[]> {
  const response = await lajeApiRequest<DataResponse<number[]>>(
    `/public-runtime/championships/${championshipId}/season-years`,
  );
  return response.data;
}

export async function listAwsRemovedSportIds(
  championshipId: string,
  seasonYear: number,
): Promise<string[]> {
  const response = await lajeApiRequest<DataResponse<Array<{ sportId: string }>>>(
    `/public-runtime/championships/${championshipId}/seasons/${seasonYear}/removed-sports`,
  );
  return response.data.map((row) => row.sportId);
}

export async function listAwsCompetitionDisqualifications(
  championshipId: string,
  seasonYear: number,
): Promise<import("@/lib/types").CompetitionTeamDisqualification[]> {
  const response = await lajeApiRequest<DataResponse<Record<string, unknown>[]>>(
    `/public-runtime/championships/${championshipId}/seasons/${seasonYear}/disqualifications`,
  );

  return response.data.map((row) => ({
    id: String(row.id),
    championship_id: String(row.championshipId),
    season_year: asNumber(row.seasonYear),
    sport_id: String(row.sportId),
    naipe: row.naipe as import("@/lib/enums").MatchNaipe,
    division: (row.division ?? null) as import("@/lib/enums").TeamDivision | null,
    team_id: String(row.teamId),
    created_at: String(row.createdAt ?? ""),
    created_by: row.createdBy == null ? null : String(row.createdBy),
  }));
}

export async function listAwsIndividualEvents(input: {
  championshipId: string;
  seasonYear: number;
  sportId?: string | null;
}): Promise<ChampionshipIndividualEvent[]> {
  const search = new URLSearchParams({ seasonYear: String(input.seasonYear) });
  if (input.sportId) search.set("sportId", input.sportId);
  const response = await lajeApiRequest<DataResponse<Record<string, unknown>[]>>(
    `/public-runtime/championships/${input.championshipId}/individual-events?${search.toString()}`,
  );

  return response.data.map((row) => ({
    ...(row as unknown as ChampionshipIndividualEvent),
    relay_multiplier: asNumber(row.relay_multiplier),
    display_order: asNumber(row.display_order),
    season_year: asNumber(row.season_year),
    sports: joinedSport(row),
  }));
}

export async function listAwsIndividualSessions(input: {
  championshipId: string;
  seasonYear: number;
  sportId?: string | null;
  status?: ChampionshipIndividualSession["status"] | null;
}): Promise<ChampionshipIndividualSession[]> {
  const search = new URLSearchParams({ seasonYear: String(input.seasonYear) });
  if (input.sportId) search.set("sportId", input.sportId);
  if (input.status) search.set("status", input.status);
  const response = await lajeApiRequest<DataResponse<Record<string, unknown>[]>>(
    `/public-runtime/championships/${input.championshipId}/individual-sessions?${search.toString()}`,
  );

  return response.data.map((row) => ({
    ...(row as unknown as ChampionshipIndividualSession),
    season_year: asNumber(row.season_year),
    exclusive_lock_enabled: Boolean(row.exclusive_lock_enabled),
    sports: joinedSport(row),
  }));
}

export async function listAwsIndividualEventEntries(eventIds: string[]): Promise<{
  data: ChampionshipIndividualEventEntry[];
  membersByEntryId: Record<string, ChampionshipIndividualEventEntryMember[]>;
}> {
  if (eventIds.length === 0) {
    return { data: [], membersByEntryId: {} };
  }

  const search = new URLSearchParams();
  eventIds.forEach((eventId) => search.append("eventId", eventId));
  const response = await lajeApiRequest<
    DataResponse<Record<string, unknown>[]> & {
      membersByEntryId: Record<string, ChampionshipIndividualEventEntryMember[]>;
    }
  >(`/public-runtime/individual-event-entries?${search.toString()}`);

  const membersByEntryId = response.membersByEntryId ?? {};
  return {
    data: response.data.map((row) => ({
      ...(row as unknown as ChampionshipIndividualEventEntry),
      final_position: row.final_position == null ? null : asNumber(row.final_position),
      result_time_milliseconds:
        row.result_time_milliseconds == null ? null : asNumber(row.result_time_milliseconds),
      result_mark_centimeters:
        row.result_mark_centimeters == null ? null : asNumber(row.result_mark_centimeters),
      lane_number: row.lane_number == null ? null : asNumber(row.lane_number),
      attempt_one_centimeters:
        row.attempt_one_centimeters == null ? null : asNumber(row.attempt_one_centimeters),
      attempt_two_centimeters:
        row.attempt_two_centimeters == null ? null : asNumber(row.attempt_two_centimeters),
      attempt_three_centimeters:
        row.attempt_three_centimeters == null ? null : asNumber(row.attempt_three_centimeters),
      points_awarded: asNumber(row.points_awarded),
      teams: joinedTeam(row),
      members: membersByEntryId[String(row.id)] ?? [],
    })),
    membersByEntryId,
  };
}

export async function listAwsIndividualSessionParticipants(sessionId: string): Promise<Team[]> {
  const response = await lajeApiRequest<DataResponse<Record<string, unknown>[]>>(
    `/public-runtime/individual-sessions/${sessionId}/participants`,
  );
  return response.data.map(toTeam);
}

export async function listAwsIndividualStandings(input: {
  championshipId: string;
  seasonYear: number;
  sportId?: string | null;
  naipe?: MatchNaipe | null;
  division?: TeamDivision | null | undefined;
}): Promise<ChampionshipIndividualTeamStanding[]> {
  const search = new URLSearchParams({ seasonYear: String(input.seasonYear) });
  if (input.sportId) search.set("sportId", input.sportId);
  if (input.naipe) search.set("naipe", input.naipe);
  if (input.division) search.set("division", input.division);
  const response = await lajeApiRequest<DataResponse<Record<string, unknown>[]>>(
    `/public-runtime/championships/${input.championshipId}/individual-standings?${search.toString()}`,
  );

  return response.data.map((row) => ({
    ...(row as unknown as ChampionshipIndividualTeamStanding),
    season_year: asNumber(row.season_year),
    total_points: asNumber(row.total_points),
    scored_events_count: asNumber(row.scored_events_count),
    first_places: asNumber(row.first_places),
    second_places: asNumber(row.second_places),
    third_places: asNumber(row.third_places),
    fourth_places: asNumber(row.fourth_places),
    fifth_places: asNumber(row.fifth_places),
    sixth_places: asNumber(row.sixth_places),
    seventh_places: asNumber(row.seventh_places),
    eighth_places: asNumber(row.eighth_places),
    ninth_places: asNumber(row.ninth_places),
    tenth_places: asNumber(row.tenth_places),
    eleventh_places: asNumber(row.eleventh_places),
    twelfth_places: asNumber(row.twelfth_places),
    thirteenth_places: asNumber(row.thirteenth_places),
    fourteenth_places: asNumber(row.fourteenth_places),
    fifteenth_places: asNumber(row.fifteenth_places),
    sixteenth_places: asNumber(row.sixteenth_places),
    seventeenth_places: asNumber(row.seventeenth_places),
    eighteenth_places: asNumber(row.eighteenth_places),
    nineteenth_places: asNumber(row.nineteenth_places),
    twentieth_places: asNumber(row.twentieth_places),
    relay_points_total: asNumber(row.relay_points_total),
    teams: joinedTeam(row),
    sports: joinedSport(row),
  }));
}

export async function getAwsHomeDashboardMetrics(
  input: {
    seasonYear?: number | null;
    championshipCode?: ChampionshipCode | null;
  } = {},
): Promise<HomeDashboardMetrics> {
  const search = new URLSearchParams();
  if (input.seasonYear) search.set("seasonYear", String(input.seasonYear));
  if (input.championshipCode) search.set("championshipCode", input.championshipCode);
  const response = await lajeApiRequest<DataResponse<HomeDashboardMetrics>>(
    `/public-runtime/home-dashboard?${search.toString()}`,
  );
  return response.data;
}
