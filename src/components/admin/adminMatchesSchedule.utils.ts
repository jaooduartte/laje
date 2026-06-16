import type {
  BracketDaySchedule,
  BracketDayScheduleUpdate,
} from "@/domain/championship-brackets/championshipBracket.types";
import { MatchStatus } from "@/lib/enums";
import type { Match } from "@/lib/types";

export function resolveMatchScheduleMoveSortValue(
  match: Pick<Match, "queue_position" | "scheduled_slot">,
  shouldUseScheduledSlot: boolean,
): number {
  if (shouldUseScheduledSlot) {
    return match.scheduled_slot ?? match.queue_position ?? Number.MAX_SAFE_INTEGER;
  }

  return match.queue_position ?? match.scheduled_slot ?? Number.MAX_SAFE_INTEGER;
}

export function resolveBracketDayScheduleUpdates(
  bracketDaySchedules: BracketDaySchedule[],
): BracketDayScheduleUpdate[] {
  return bracketDaySchedules.map((scheduleDay) => ({
    date: scheduleDay.event_date,
    start_time: scheduleDay.start_time,
    end_time: scheduleDay.end_time,
    breaks: scheduleDay.breaks.map((dayBreak) => ({
      break_start_time: dayBreak.break_start_time,
      break_end_time: dayBreak.break_end_time,
      position: dayBreak.position,
      scope_type: dayBreak.scope_type,
      bracket_court_id: dayBreak.bracket_court_id,
    })),
  }));
}

type MatchScheduleRedistributionSnapshot = Pick<
  Match,
  | "status"
  | "scheduled_date"
  | "queue_position"
  | "scheduled_slot"
  | "sport_id"
  | "naipe"
  | "division"
  | "location"
  | "court_name"
  | "start_time"
  | "created_at"
  | "home_team_id"
  | "away_team_id"
>;

export function resolveShouldRedistributeBracketScheduleAfterMatchEdit(params: {
  previousMatch: MatchScheduleRedistributionSnapshot | null;
  nextMatch: MatchScheduleRedistributionSnapshot;
}): boolean {
  const { previousMatch, nextMatch } = params;

  if (nextMatch.status != MatchStatus.SCHEDULED) {
    return false;
  }

  if (!previousMatch || previousMatch.status != MatchStatus.SCHEDULED) {
    return true;
  }

  return (
    previousMatch.scheduled_date != nextMatch.scheduled_date ||
    previousMatch.queue_position != nextMatch.queue_position ||
    previousMatch.scheduled_slot != nextMatch.scheduled_slot ||
    previousMatch.sport_id != nextMatch.sport_id ||
    previousMatch.naipe != nextMatch.naipe ||
    previousMatch.division != nextMatch.division ||
    previousMatch.location != nextMatch.location ||
    previousMatch.court_name != nextMatch.court_name ||
    previousMatch.home_team_id != nextMatch.home_team_id ||
    previousMatch.away_team_id != nextMatch.away_team_id
  );
}

type MatchCourtConflictSnapshot = Pick<
  Match,
  | "id"
  | "status"
  | "scheduled_date"
  | "naipe"
  | "location"
  | "court_name"
  | "start_time"
  | "queue_position"
  | "scheduled_slot"
  | "created_at"
  | "home_team_id"
  | "away_team_id"
>;

export function resolveScheduledMatchCourtConflictMessage(params: {
  matches: MatchCourtConflictSnapshot[];
  nextMatch: MatchCourtConflictSnapshot;
}): string | null {
  const { matches, nextMatch } = params;

  if (
    nextMatch.status !== MatchStatus.SCHEDULED ||
    !nextMatch.scheduled_date ||
    !nextMatch.location?.trim() ||
    !nextMatch.court_name?.trim() ||
    !nextMatch.home_team_id ||
    !nextMatch.away_team_id
  ) {
    return null;
  }

  const normalizedLocation = normalizeBracketEntityName(nextMatch.location);
  const normalizedCourtName = normalizeBracketEntityName(nextMatch.court_name);

  const scopedMatches = [
    ...matches.filter((match) => {
      return (
        match.status === MatchStatus.SCHEDULED &&
        match.scheduled_date === nextMatch.scheduled_date &&
        normalizeBracketEntityName(match.location) === normalizedLocation &&
        normalizeBracketEntityName(match.court_name) === normalizedCourtName &&
        match.id !== nextMatch.id
      );
    }),
    nextMatch,
  ].sort(compareCourtSequenceMatches);

  const currentMatchIndex = scopedMatches.findIndex((match) => match.id === nextMatch.id);

  if (currentMatchIndex < 0) {
    return null;
  }

  const nearbySameNaipeConflictingMatch = scopedMatches.find((match, matchIndex) => {
    if (match.id == nextMatch.id || match.naipe != nextMatch.naipe) {
      return false;
    }

    return Math.abs(matchIndex - currentMatchIndex) < 4 && doMatchesShareAnyTeam(match, nextMatch);
  });

  if (nearbySameNaipeConflictingMatch) {
    return "A mesma atlética precisa de pelo menos 4 jogos de descanso na mesma quadra para partidas do mesmo naipe.";
  }

  const nearbyDifferentNaipeConflictingMatch = scopedMatches.find((match, matchIndex) => {
    if (match.id == nextMatch.id || match.naipe == nextMatch.naipe) {
      return false;
    }

    return Math.abs(matchIndex - currentMatchIndex) < 2 && doMatchesShareAnyTeam(match, nextMatch);
  });

  if (nearbyDifferentNaipeConflictingMatch) {
    return "A mesma atlética precisa de pelo menos 1 jogo de intervalo entre partidas de naipes diferentes na mesma quadra.";
  }

  return null;
}

function normalizeBracketEntityName(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

function compareCourtSequenceMatches(
  firstMatch: MatchCourtConflictSnapshot,
  secondMatch: MatchCourtConflictSnapshot,
) {
  if (firstMatch.start_time && secondMatch.start_time && firstMatch.start_time !== secondMatch.start_time) {
    return firstMatch.start_time.localeCompare(secondMatch.start_time);
  }

  if (firstMatch.start_time && !secondMatch.start_time) {
    return -1;
  }

  if (!firstMatch.start_time && secondMatch.start_time) {
    return 1;
  }

  const slotDifference = resolveMatchScheduleMoveSortValue(firstMatch, true) - resolveMatchScheduleMoveSortValue(secondMatch, true);

  if (slotDifference !== 0) {
    return slotDifference;
  }

  if (firstMatch.created_at !== secondMatch.created_at) {
    return firstMatch.created_at.localeCompare(secondMatch.created_at);
  }

  return firstMatch.id.localeCompare(secondMatch.id);
}

function doMatchesShareAnyTeam(
  firstMatch: Pick<MatchCourtConflictSnapshot, "home_team_id" | "away_team_id">,
  secondMatch: Pick<MatchCourtConflictSnapshot, "home_team_id" | "away_team_id">,
) {
  const firstTeamIds = [firstMatch.home_team_id, firstMatch.away_team_id].filter(Boolean);
  const secondTeamIds = new Set([secondMatch.home_team_id, secondMatch.away_team_id].filter(Boolean));

  return firstTeamIds.some((teamId) => secondTeamIds.has(teamId));
}
