import { frontendEnvironment } from "@/config/environment";
import type { MatchSetInput } from "@/domain/championship-brackets/championshipBracket.types";
import type { Championship, ChampionshipSeasonSettings, Match, Standing } from "@/lib/types";
import { lajeApiRequest } from "./client";

interface DataResponse<DataType> {
  data: DataType;
}

interface CollectionResponse<DataType> {
  data: DataType[];
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    totalItems?: number;
    totalPages?: number;
  };
}

interface ApiChampionshipDto {
  id: string;
  code: Championship["code"];
  name: string;
  status: Championship["status"];
  currentSeasonYear: number;
  usesDivisions: boolean;
  defaultLocation?: string | null;
  createdAt?: string | null;
}

interface ApiTeamSummary {
  id: string;
  name: string;
  city?: string | null;
  division?: Match["division"];
}

interface ApiSportSummary {
  id: string;
  name: string;
  code?: string | null;
}

interface ApiMatchSet {
  id?: string;
  setNumber: number;
  homePoints: number;
  awayPoints: number;
}

interface ApiMatchDto {
  id: string;
  championshipId: string;
  seasonYear: number;
  division: Match["division"];
  naipe: Match["naipe"];
  supportsCards: boolean;
  resultRule?: Match["result_rule"];
  sportId: string;
  homeTeamId: string;
  awayTeamId: string;
  location: string | null;
  courtName: string | null;
  scheduledDate: string | null;
  queuePosition: number | null;
  scheduledSlot?: number | null;
  scheduledStartTime?: string | null;
  startTime: string | null;
  endTime: string | null;
  status: Match["status"];
  homeScore: number;
  awayScore: number;
  currentSetHomeScore?: number | null;
  currentSetAwayScore?: number | null;
  homePenaltyScore?: number | null;
  awayPenaltyScore?: number | null;
  homeYellowCards: number;
  homeRedCards: number;
  homeBlueCards?: number;
  homeTwoMinutePenalties?: number;
  awayYellowCards: number;
  awayRedCards: number;
  awayBlueCards?: number;
  awayTwoMinutePenalties?: number;
  isWalkover?: boolean;
  walkoverLoserTeamId?: string | null;
  isDoubleWalkover?: boolean;
  disqualificationId?: string | null;
  resolvedTieBreakerRule?: Match["resolved_tie_breaker_rule"];
  resolvedTieBreakWinnerTeamId?: string | null;
  isManualScheduleOverride?: boolean;
  manualRepresentationMode?: Match["manual_representation_mode"];
  isPendingManualRelocation?: boolean;
  isScoreSheetReviewed?: boolean;
  createdAt: string;
  groupNumber?: number | null;
  championship?: ApiChampionshipDto | null;
  sport?: ApiSportSummary | null;
  homeTeam?: ApiTeamSummary | null;
  awayTeam?: ApiTeamSummary | null;
  matchSets?: ApiMatchSet[] | null;
}

export interface SportsCoreMatchFilters {
  championshipId?: string | null;
  seasonYear?: number | null;
  statuses?: Match["status"][];
  sportId?: string | null;
  teamId?: string | null;
  naipe?: Match["naipe"] | null;
  division?: Match["division"];
  groupNumber?: number | null;
  location?: string | null;
  courtName?: string | null;
  matchIds?: string[];
  includePendingManualRelocation?: boolean;
  page?: number;
  pageSize?: number;
  sort?: "scheduledDate" | "queuePosition" | "createdAt";
  order?: "asc" | "desc";
}

export interface SportsCoreScoreboardPatch {
  homeScore?: number;
  awayScore?: number;
  currentSetHomeScore?: number | null;
  currentSetAwayScore?: number | null;
  homePenaltyScore?: number | null;
  awayPenaltyScore?: number | null;
  homeYellowCards?: number;
  homeRedCards?: number;
  homeBlueCards?: number;
  homeTwoMinutePenalties?: number;
  awayYellowCards?: number;
  awayRedCards?: number;
  awayBlueCards?: number;
  awayTwoMinutePenalties?: number;
  sets?: Array<{
    setNumber: number;
    homePoints: number;
    awayPoints: number;
  }>;
}

export interface SportsCoreFinishMatchInput extends SportsCoreScoreboardPatch {
  isWalkover?: boolean;
  isDoubleWalkover?: boolean;
  walkoverLoserTeamId?: string | null;
}

export interface SportsCoreChampionshipWriteInput {
  code?: Championship["code"];
  name?: string;
  status?: Championship["status"];
  currentSeasonYear?: number;
  usesDivisions?: boolean;
  defaultLocation?: string | null;
}

const SPORTS_CORE_PAGE_SIZE = 100;

function appendQueryValue(search: URLSearchParams, key: string, value: unknown): void {
  if (value == null || value === "") return;
  search.append(key, String(value));
}

function toChampionship(dto: ApiChampionshipDto): Championship {
  return {
    id: dto.id,
    code: dto.code,
    name: dto.name,
    status: dto.status,
    current_season_year: dto.currentSeasonYear,
    uses_divisions: dto.usesDivisions,
    default_location: dto.defaultLocation ?? null,
    created_at: dto.createdAt ?? "",
  };
}

function toMatchSet(dto: ApiMatchSet): MatchSetInput {
  return {
    set_number: dto.setNumber,
    home_points: dto.homePoints,
    away_points: dto.awayPoints,
  };
}

export function toLegacyMatch(dto: ApiMatchDto): Match {
  return {
    id: dto.id,
    championship_id: dto.championshipId,
    season_year: dto.seasonYear,
    division: dto.division,
    naipe: dto.naipe,
    supports_cards: dto.supportsCards,
    result_rule: dto.resultRule ?? null,
    sport_id: dto.sportId,
    home_team_id: dto.homeTeamId,
    away_team_id: dto.awayTeamId,
    location: dto.location,
    court_name: dto.courtName,
    scheduled_date: dto.scheduledDate,
    queue_position: dto.queuePosition,
    scheduled_slot: dto.scheduledSlot ?? null,
    scheduled_start_time: dto.scheduledStartTime ?? null,
    start_time: dto.startTime,
    end_time: dto.endTime,
    status: dto.status,
    home_score: dto.homeScore,
    away_score: dto.awayScore,
    current_set_home_score: dto.currentSetHomeScore ?? null,
    current_set_away_score: dto.currentSetAwayScore ?? null,
    home_penalty_score: dto.homePenaltyScore ?? null,
    away_penalty_score: dto.awayPenaltyScore ?? null,
    home_yellow_cards: dto.homeYellowCards,
    home_red_cards: dto.homeRedCards,
    home_blue_cards: dto.homeBlueCards ?? 0,
    home_two_minute_penalties: dto.homeTwoMinutePenalties ?? 0,
    away_yellow_cards: dto.awayYellowCards,
    away_red_cards: dto.awayRedCards,
    away_blue_cards: dto.awayBlueCards ?? 0,
    away_two_minute_penalties: dto.awayTwoMinutePenalties ?? 0,
    is_walkover: dto.isWalkover ?? false,
    is_double_walkover: dto.isDoubleWalkover ?? false,
    walkover_loser_team_id: dto.walkoverLoserTeamId ?? null,
    disqualification_id: dto.disqualificationId ?? null,
    resolved_tie_breaker_rule: dto.resolvedTieBreakerRule ?? null,
    resolved_tie_break_winner_team_id: dto.resolvedTieBreakWinnerTeamId ?? null,
    is_manual_schedule_override: dto.isManualScheduleOverride ?? false,
    manual_representation_mode: dto.manualRepresentationMode ?? null,
    is_pending_manual_relocation: dto.isPendingManualRelocation ?? false,
    is_score_sheet_reviewed: dto.isScoreSheetReviewed ?? false,
    created_at: dto.createdAt,
    group_number: dto.groupNumber ?? null,
    ...(dto.championship ? { championships: toChampionship(dto.championship) } : {}),
    ...(dto.sport
      ? {
          sports: {
            id: dto.sport.id,
            name: dto.sport.name,
            code: dto.sport.code ?? null,
            created_at: "",
          },
        }
      : {}),
    ...(dto.homeTeam
      ? {
          home_team: {
            id: dto.homeTeam.id,
            name: dto.homeTeam.name,
            city: dto.homeTeam.city ?? "",
            division: dto.homeTeam.division ?? null,
            created_at: "",
          },
        }
      : {}),
    ...(dto.awayTeam
      ? {
          away_team: {
            id: dto.awayTeam.id,
            name: dto.awayTeam.name,
            city: dto.awayTeam.city ?? "",
            division: dto.awayTeam.division ?? null,
            created_at: "",
          },
        }
      : {}),
    match_sets: (dto.matchSets ?? []).map(toMatchSet),
  };
}

export function isDedicatedSportsCoreEnabled(): boolean {
  return Boolean(frontendEnvironment.apiUrl);
}

function createMatchesSearch(
  filters: SportsCoreMatchFilters,
  page: number,
  pageSize: number,
): URLSearchParams {
  const search = new URLSearchParams();
  appendQueryValue(search, "championshipId", filters.championshipId);
  appendQueryValue(search, "seasonYear", filters.seasonYear);
  filters.statuses?.forEach((status) => appendQueryValue(search, "status", status));
  appendQueryValue(search, "sportId", filters.sportId);
  appendQueryValue(search, "teamId", filters.teamId);
  appendQueryValue(search, "naipe", filters.naipe);
  appendQueryValue(search, "division", filters.division);
  appendQueryValue(search, "groupNumber", filters.groupNumber);
  appendQueryValue(search, "location", filters.location);
  appendQueryValue(search, "courtName", filters.courtName);
  filters.matchIds?.forEach((matchId) => appendQueryValue(search, "matchId", matchId));
  appendQueryValue(search, "page", page);
  appendQueryValue(search, "pageSize", pageSize);
  appendQueryValue(search, "sort", filters.sort);
  appendQueryValue(search, "order", filters.order);
  return search;
}

async function fetchSportsCoreMatchPage(
  filters: SportsCoreMatchFilters,
  page: number,
  pageSize: number,
): Promise<CollectionResponse<ApiMatchDto>> {
  const search = createMatchesSearch(filters, page, pageSize);
  return lajeApiRequest<CollectionResponse<ApiMatchDto>>(`/matches?${search.toString()}`);
}

export async function listSportsCoreMatches(
  filters: SportsCoreMatchFilters = {},
): Promise<{ matches: Match[]; total: number }> {
  const requestedPage = typeof filters.page === "number" && filters.page > 0 ? filters.page : null;
  const requestedPageSize =
    typeof filters.pageSize === "number" && filters.pageSize > 0 ? filters.pageSize : null;
  const includePendingManualRelocation = filters.includePendingManualRelocation ?? true;

  if (
    includePendingManualRelocation &&
    requestedPage != null &&
    requestedPageSize != null &&
    requestedPageSize <= SPORTS_CORE_PAGE_SIZE
  ) {
    const response = await fetchSportsCoreMatchPage(filters, requestedPage, requestedPageSize);
    return {
      matches: response.data.map(toLegacyMatch),
      total: response.meta?.total ?? response.meta?.totalItems ?? response.data.length,
    };
  }

  const allMatches: Match[] = [];
  let currentPage = 1;
  let totalPages = 1;

  do {
    const response = await fetchSportsCoreMatchPage(filters, currentPage, SPORTS_CORE_PAGE_SIZE);
    allMatches.push(...response.data.map(toLegacyMatch));
    totalPages = Math.max(1, response.meta?.totalPages ?? 1);
    currentPage += 1;
  } while (currentPage <= totalPages);

  const filteredMatches = includePendingManualRelocation
    ? allMatches
    : allMatches.filter((match) => !match.is_pending_manual_relocation);

  if (requestedPage != null && requestedPageSize != null) {
    const start = (requestedPage - 1) * requestedPageSize;
    return {
      matches: filteredMatches.slice(start, start + requestedPageSize),
      total: filteredMatches.length,
    };
  }

  return { matches: filteredMatches, total: filteredMatches.length };
}

export async function getSportsCoreMatch(matchId: string): Promise<Match> {
  const response = await lajeApiRequest<DataResponse<ApiMatchDto>>(`/matches/${matchId}`);
  return toLegacyMatch(response.data);
}

export async function startSportsCoreMatch(matchId: string, accessToken: string): Promise<Match> {
  const response = await lajeApiRequest<DataResponse<ApiMatchDto>>(
    `/matches/${matchId}/start`,
    { method: "POST" },
    accessToken,
  );
  return toLegacyMatch(response.data);
}

export async function updateSportsCoreScoreboard(
  matchId: string,
  input: SportsCoreScoreboardPatch,
  accessToken: string,
): Promise<Match> {
  const response = await lajeApiRequest<DataResponse<ApiMatchDto>>(
    `/matches/${matchId}/scoreboard`,
    { method: "PATCH", body: JSON.stringify(input) },
    accessToken,
  );
  return toLegacyMatch(response.data);
}

export async function finishSportsCoreMatch(
  matchId: string,
  input: SportsCoreFinishMatchInput,
  accessToken: string,
): Promise<Match> {
  const response = await lajeApiRequest<DataResponse<ApiMatchDto>>(
    `/matches/${matchId}/finish`,
    { method: "POST", body: JSON.stringify(input) },
    accessToken,
  );
  return toLegacyMatch(response.data);
}

export async function listSportsCoreChampionships(): Promise<Championship[]> {
  const response = await lajeApiRequest<CollectionResponse<ApiChampionshipDto>>("/championships");
  return response.data.map(toChampionship);
}

export async function getSportsCoreChampionship(championshipId: string): Promise<Championship> {
  const response = await lajeApiRequest<DataResponse<ApiChampionshipDto>>(
    `/championships/${championshipId}`,
  );
  return toChampionship(response.data);
}

export async function updateSportsCoreChampionship(
  championshipId: string,
  input: SportsCoreChampionshipWriteInput,
  accessToken: string,
): Promise<Championship> {
  const response = await lajeApiRequest<DataResponse<ApiChampionshipDto>>(
    `/championships/${championshipId}`,
    { method: "PATCH", body: JSON.stringify(input) },
    accessToken,
  );
  return toChampionship(response.data);
}

function mapSportsCoreStanding(row: Record<string, unknown>): Standing {
  return {
    id: String(row.id),
    championship_id: String(row.championshipId),
    season_year: Number(row.seasonYear),
    division: (row.division ?? null) as Standing["division"],
    naipe: row.naipe as Standing["naipe"],
    sport_id: String(row.sportId),
    team_id: String(row.teamId),
    played: Number(row.played ?? 0),
    wins: Number(row.wins ?? 0),
    draws: Number(row.draws ?? 0),
    losses: Number(row.losses ?? 0),
    goals_for: Number(row.goalsFor ?? 0),
    goals_against: Number(row.goalsAgainst ?? 0),
    goal_diff: Number(row.goalDiff ?? 0),
    points: Number(row.points ?? row.totalPoints ?? 0),
    yellow_cards: Number(row.yellowCards ?? 0),
    red_cards: Number(row.redCards ?? 0),
    blue_cards: Number(row.blueCards ?? 0),
    two_minute_penalties: Number(row.twoMinutePenalties ?? 0),
    sets_for: Number(row.setsFor ?? 0),
    sets_against: Number(row.setsAgainst ?? 0),
    rally_points_for: Number(row.rallyPointsFor ?? 0),
    rally_points_against: Number(row.rallyPointsAgainst ?? 0),
    updated_at: String(row.updatedAt ?? ""),
    is_individual_sport: row.source === "INDIVIDUAL",
    scored_events_count: Number(row.scoredEventsCount ?? 0),
    first_places: Number(row.firstPlaces ?? 0),
    second_places: Number(row.secondPlaces ?? 0),
    third_places: Number(row.thirdPlaces ?? 0),
    fourth_places: Number(row.fourthPlaces ?? 0),
    fifth_places: Number(row.fifthPlaces ?? 0),
    sixth_places: Number(row.sixthPlaces ?? 0),
    seventh_places: Number(row.seventhPlaces ?? 0),
    eighth_places: Number(row.eighthPlaces ?? 0),
    ninth_places: Number(row.ninthPlaces ?? 0),
    tenth_places: Number(row.tenthPlaces ?? 0),
    eleventh_places: Number(row.eleventhPlaces ?? 0),
    twelfth_places: Number(row.twelfthPlaces ?? 0),
    thirteenth_places: Number(row.thirteenthPlaces ?? 0),
    fourteenth_places: Number(row.fourteenthPlaces ?? 0),
    fifteenth_places: Number(row.fifteenthPlaces ?? 0),
    sixteenth_places: Number(row.sixteenthPlaces ?? 0),
    seventeenth_places: Number(row.seventeenthPlaces ?? 0),
    eighteenth_places: Number(row.eighteenthPlaces ?? 0),
    nineteenth_places: Number(row.nineteenthPlaces ?? 0),
    twentieth_places: Number(row.twentiethPlaces ?? 0),
    relay_points_total: Number(row.relayPointsTotal ?? 0),
    teams: {
      id: String(row.teamId),
      name: String(row.teamName ?? ""),
      city: String(row.teamCity ?? ""),
      division: (row.division ?? null) as Standing["division"],
      created_at: "",
    },
    sports: {
      id: String(row.sportId),
      name: String(row.sportName ?? ""),
      code: typeof row.sportCode === "string" ? row.sportCode : null,
      created_at: "",
    },
  };
}

export async function getSportsCoreStandings(
  championshipId: string,
  seasonYear: number,
): Promise<Standing[]> {
  const standings: Standing[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const search = new URLSearchParams({
      seasonYear: String(seasonYear),
      page: String(page),
      pageSize: String(SPORTS_CORE_PAGE_SIZE),
    });
    const response = await lajeApiRequest<CollectionResponse<Record<string, unknown>>>(
      `/championships/${championshipId}/standings?${search.toString()}`,
    );
    standings.push(...response.data.map(mapSportsCoreStanding));
    totalPages = Math.max(1, response.meta?.totalPages ?? 1);
    page += 1;
  } while (page <= totalPages);

  return standings;
}

export async function getSportsCoreBracket(
  championshipId: string,
  seasonYear: number,
): Promise<unknown> {
  const search = new URLSearchParams({ seasonYear: String(seasonYear) });
  const response = await lajeApiRequest<DataResponse<unknown>>(
    `/championships/${championshipId}/bracket?${search.toString()}`,
  );
  return response.data;
}

export async function getSportsCoreSeason(
  championshipId: string,
  seasonYear: number,
): Promise<ChampionshipSeasonSettings | null> {
  const response = await lajeApiRequest<DataResponse<Record<string, unknown> | null>>(
    `/championships/${championshipId}/seasons/${seasonYear}`,
  );
  if (!response.data) return null;
  const row = response.data;
  return {
    id: String(row.id),
    championship_id: String(row.championshipId),
    season_year: Number(row.seasonYear),
    division_format: row.divisionFormat as ChampionshipSeasonSettings["division_format"],
    division_settlement_mode:
      row.divisionSettlementMode as ChampionshipSeasonSettings["division_settlement_mode"],
    principal_slots_count: row.principalSlotsCount == null ? null : Number(row.principalSlotsCount),
    principal_relegation_count:
      row.principalRelegationCount == null ? null : Number(row.principalRelegationCount),
    access_promotion_count:
      row.accessPromotionCount == null ? null : Number(row.accessPromotionCount),
    yellow_card_reset_phase:
      row.yellowCardResetPhase as ChampionshipSeasonSettings["yellow_card_reset_phase"],
    created_at: String(row.createdAt ?? ""),
    updated_at: String(row.updatedAt ?? ""),
  };
}
