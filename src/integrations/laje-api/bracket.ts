import { lajeApiRequest } from "@/integrations/laje-api/client";
import type {
  ChampionshipBracketCompetition,
  ChampionshipBracketGroupMatch,
  ChampionshipBracketKnockoutMatch,
  ChampionshipBracketView,
} from "@/lib/types";

interface DataResponse<DataType> {
  data: DataType;
}

interface ApiBracketMatch {
  id: string;
  roundNumber?: number;
  slotNumber?: number;
  matchId: string | null;
  status: ChampionshipBracketGroupMatch["status"];
  scheduledDate: string | null;
  queuePosition: number | null;
  scheduledSlot?: number | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  courtName: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  winnerTeamId: string | null;
  winnerTeamName: string | null;
  isBye?: boolean;
  isThirdPlace?: boolean;
}

interface ApiBracketCompetition {
  id: string;
  sportId: string;
  sportName: string;
  naipe: ChampionshipBracketCompetition["naipe"];
  division: ChampionshipBracketCompetition["division"];
  groupsCount: number;
  qualifiersPerGroup: number;
  shouldCompleteKnockoutWithBestSecondPlacedTeams?: boolean | null;
  knockoutPairingMode?: ChampionshipBracketCompetition["knockout_pairing_mode"];
  thirdPlaceMode: ChampionshipBracketCompetition["third_place_mode"];
  groups: Array<{
    id: string;
    groupNumber: number;
    teams: Array<{
      teamId: string;
      teamName: string;
      teamCity: string;
      position: number;
    }>;
    matches: ApiBracketMatch[];
  }>;
  knockoutMatches: ApiBracketMatch[];
}

interface ApiBracketView {
  edition: null | {
    id: string;
    championshipId: string;
    seasonYear: number;
    status: NonNullable<ChampionshipBracketView["edition"]>["status"];
    payloadSnapshot: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  };
  competitions: ApiBracketCompetition[];
}

function toGroupMatch(match: ApiBracketMatch): ChampionshipBracketGroupMatch {
  return {
    id: match.id,
    match_id: match.matchId,
    status: match.status,
    scheduled_date: match.scheduledDate,
    queue_position: match.queuePosition,
    start_time: match.startTime,
    end_time: match.endTime,
    location: match.location,
    court_name: match.courtName,
    home_team_id: match.homeTeamId,
    away_team_id: match.awayTeamId,
    home_team_name: match.homeTeamName,
    away_team_name: match.awayTeamName,
    winner_team_id: match.winnerTeamId,
    winner_team_name: match.winnerTeamName,
  };
}

function toKnockoutMatch(match: ApiBracketMatch): ChampionshipBracketKnockoutMatch {
  return {
    ...toGroupMatch(match),
    round_number: match.roundNumber ?? 1,
    slot_number: match.slotNumber ?? 1,
    scheduled_slot: match.scheduledSlot ?? null,
    is_bye: match.isBye ?? false,
    is_third_place: match.isThirdPlace ?? false,
  };
}

function toCompetition(competition: ApiBracketCompetition): ChampionshipBracketCompetition {
  return {
    id: competition.id,
    sport_id: competition.sportId,
    sport_name: competition.sportName,
    naipe: competition.naipe,
    division: competition.division,
    groups_count: competition.groupsCount,
    qualifiers_per_group: competition.qualifiersPerGroup,
    should_complete_knockout_with_best_second_placed_teams:
      competition.shouldCompleteKnockoutWithBestSecondPlacedTeams ?? false,
    knockout_pairing_mode: competition.knockoutPairingMode ?? null,
    third_place_mode: competition.thirdPlaceMode,
    groups: competition.groups.map((group) => ({
      id: group.id,
      group_number: group.groupNumber,
      teams: group.teams.map((team) => ({
        team_id: team.teamId,
        team_name: team.teamName,
        team_city: team.teamCity,
        position: team.position,
      })),
      matches: group.matches.map(toGroupMatch),
    })),
    knockout_matches: competition.knockoutMatches.map(toKnockoutMatch),
  };
}

export async function fetchDedicatedChampionshipBracketView(
  championshipId: string,
  seasonYear: number,
): Promise<ChampionshipBracketView> {
  const search = new URLSearchParams({ seasonYear: String(seasonYear) });
  const response = await lajeApiRequest<DataResponse<ApiBracketView>>(
    `/championships/${championshipId}/bracket?${search.toString()}`,
  );

  return {
    edition: response.data.edition
      ? {
          id: response.data.edition.id,
          championship_id: response.data.edition.championshipId,
          season_year: response.data.edition.seasonYear,
          status: response.data.edition.status,
          payload_snapshot: response.data.edition.payloadSnapshot,
          created_at: response.data.edition.createdAt,
          updated_at: response.data.edition.updatedAt,
        }
      : null,
    competitions: response.data.competitions.map(toCompetition),
  };
}
