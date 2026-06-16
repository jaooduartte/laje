import type { Match } from "@/lib/types";
import { MatchStatus } from "@/lib/enums";
import { resolveMatchQueueLabel, resolveMatchScheduledDateValue } from "@/lib/championship";
import { resolveScheduledMatchCourtConflictMessage } from "@/components/admin/adminMatchesSchedule.utils";

type MatchQueueSwapComparable = Pick<
  Match,
  | "id"
  | "status"
  | "scheduled_date"
  | "start_time"
  | "sport_id"
  | "naipe"
  | "division"
  | "location"
  | "court_name"
  | "created_at"
  | "home_team_id"
  | "away_team_id"
  | "queue_position"
  | "scheduled_slot"
  | "start_time"
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
  matches: MatchQueueSwapComparable[] = [],
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

  if (sourceMatch.location != candidateMatch.location || sourceMatch.court_name != candidateMatch.court_name) {
    return false;
  }

  if (sourceMatch.sport_id != candidateMatch.sport_id) {
    return false;
  }

  if (!sourceMatch.location?.trim() || !sourceMatch.court_name?.trim()) {
    return false;
  }

  if (resolveMatchOperationalQueueSlot(sourceMatch) == null || resolveMatchOperationalQueueSlot(candidateMatch) == null) {
    return false;
  }

  if (
    matches.length > 0 &&
    resolveMatchQueueSwapConflictMessage({
      matches,
      sourceMatch,
      targetMatch: candidateMatch,
    }) != null
  ) {
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

export function resolveMatchQueueSwapConflictMessage(params: {
  matches: MatchQueueSwapComparable[];
  sourceMatch: MatchQueueSwapComparable;
  targetMatch: MatchQueueSwapComparable;
}): string | null {
  const { matches, sourceMatch, targetMatch } = params;

  const sourceOperationalSlot = resolveMatchOperationalQueueSlot(sourceMatch);
  const targetOperationalSlot = resolveMatchOperationalQueueSlot(targetMatch);

  if (sourceOperationalSlot == null || targetOperationalSlot == null) {
    return "Os jogos selecionados precisam ter posição válida na fila.";
  }

  const sourceSwappedMatch = resolveSwappedMatchSnapshot(sourceMatch, targetMatch, targetOperationalSlot);
  const targetSwappedMatch = resolveSwappedMatchSnapshot(targetMatch, sourceMatch, sourceOperationalSlot);
  const simulatedMatches = matches.map((match) => {
    if (match.id == sourceMatch.id) {
      return sourceSwappedMatch;
    }

    if (match.id == targetMatch.id) {
      return targetSwappedMatch;
    }

    return match;
  });

  const sourceConflictMessage = resolveScheduledMatchCourtConflictMessage({
    matches: simulatedMatches as Parameters<typeof resolveScheduledMatchCourtConflictMessage>[0]["matches"],
    nextMatch: sourceSwappedMatch as Parameters<typeof resolveScheduledMatchCourtConflictMessage>[0]["nextMatch"],
  });

  if (sourceConflictMessage) {
    return sourceConflictMessage;
  }

  return resolveScheduledMatchCourtConflictMessage({
    matches: simulatedMatches as Parameters<typeof resolveScheduledMatchCourtConflictMessage>[0]["matches"],
    nextMatch: targetSwappedMatch as Parameters<typeof resolveScheduledMatchCourtConflictMessage>[0]["nextMatch"],
  });
}

function resolveSwappedMatchSnapshot(
  match: MatchQueueSwapComparable,
  referenceMatch: MatchQueueSwapComparable,
  nextOperationalSlot: number,
): MatchQueueSwapComparable {
  return {
    ...match,
    queue_position: nextOperationalSlot,
    scheduled_slot: nextOperationalSlot,
    start_time: referenceMatch.start_time,
  };
}
