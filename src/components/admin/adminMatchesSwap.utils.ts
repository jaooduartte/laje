import type { Match } from "@/lib/types";
import { MatchStatus } from "@/lib/enums";
import { resolveMatchQueueLabel, resolveMatchScheduledDateValue } from "@/lib/championship";

type MatchQueueSwapComparable = Pick<
  Match,
  | "id"
  | "status"
  | "scheduled_date"
  | "start_time"
  | "sport_id"
  | "naipe"
  | "division"
  | "queue_position"
  | "scheduled_slot"
>;

type MatchQueueSwapDisplay = Pick<
  Match,
  "queue_position" | "scheduled_slot" | "home_team" | "away_team"
>;

export function resolveMatchOperationalQueueSlot(
  match: Pick<Match, "queue_position" | "scheduled_slot">,
): number | null {
  const resolvedSlot = match.queue_position ?? match.scheduled_slot ?? null;

  if (typeof resolvedSlot != "number" || !Number.isFinite(resolvedSlot) || resolvedSlot <= 0) {
    return null;
  }

  return resolvedSlot;
}

export function resolveIsMatchEligibleForQueueSwap(
  sourceMatch: MatchQueueSwapComparable,
  candidateMatch: MatchQueueSwapComparable,
): boolean {
  if (sourceMatch.id == candidateMatch.id) {
    return false;
  }

  if (sourceMatch.status != MatchStatus.SCHEDULED || candidateMatch.status != MatchStatus.SCHEDULED) {
    return false;
  }

  const sourceScheduledDate = resolveMatchScheduledDateValue(sourceMatch);
  const candidateScheduledDate = resolveMatchScheduledDateValue(candidateMatch);

  if (!sourceScheduledDate || !candidateScheduledDate || sourceScheduledDate != candidateScheduledDate) {
    return false;
  }

  if (sourceMatch.sport_id != candidateMatch.sport_id) {
    return false;
  }

  if (sourceMatch.naipe != candidateMatch.naipe) {
    return false;
  }

  if (sourceMatch.division != candidateMatch.division) {
    return false;
  }

  if (resolveMatchOperationalQueueSlot(sourceMatch) == null || resolveMatchOperationalQueueSlot(candidateMatch) == null) {
    return false;
  }

  return true;
}

export function resolveMatchSwapDisplaySlot(
  match: Pick<Match, "queue_position" | "scheduled_slot">,
  shouldUseScheduledSlot: boolean,
): number | null {
  const resolvedSlot = shouldUseScheduledSlot
    ? (match.scheduled_slot ?? match.queue_position ?? null)
    : (match.queue_position ?? match.scheduled_slot ?? null);

  if (typeof resolvedSlot != "number" || !Number.isFinite(resolvedSlot) || resolvedSlot <= 0) {
    return null;
  }

  return resolvedSlot;
}

export function resolveMatchSwapOptionLabel(
  match: MatchQueueSwapDisplay,
  shouldUseScheduledSlot: boolean,
): string {
  const queueSlot = resolveMatchSwapDisplaySlot(match, shouldUseScheduledSlot);
  const queueLabel = resolveMatchQueueLabel(queueSlot);
  const homeTeamName = match.home_team?.name ?? "Casa";
  const awayTeamName = match.away_team?.name ?? "Visitante";

  return `${queueLabel} • ${homeTeamName} x ${awayTeamName}`;
}
