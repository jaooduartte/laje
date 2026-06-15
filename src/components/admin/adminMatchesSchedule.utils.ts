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
    previousMatch.home_team_id != nextMatch.home_team_id ||
    previousMatch.away_team_id != nextMatch.away_team_id
  );
}
