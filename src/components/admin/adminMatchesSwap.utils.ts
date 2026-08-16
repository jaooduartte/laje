import type { Match } from "@/lib/types";
import { MatchManualRepresentationMode, MatchStatus } from "@/lib/enums";
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
  | "manual_representation_mode"
  | "start_time"
>;

type MatchQueueSwapDisplay = Pick<
  Match,
  | "queue_position"
  | "scheduled_slot"
  | "scheduled_date"
  | "start_time"
  | "home_team"
  | "away_team"
>;

type MatchSwapOptionLabelParams = {
  match: MatchQueueSwapDisplay;
  shouldUseScheduledSlot: boolean;
  displaySlot?: number | null;
};

export function resolveMatchOperationalQueueSlot(
  match: Pick<Match, "queue_position" | "scheduled_slot">,
): number | null {
  const resolvedSlot = match.scheduled_slot ?? match.queue_position ?? null;

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

  if (!sourceScheduledDate || !candidateScheduledDate) {
    return false;
  }

  if (sourceMatch.location != candidateMatch.location || sourceMatch.court_name != candidateMatch.court_name) {
    return false;
  }

  if (sourceMatch.sport_id != candidateMatch.sport_id) {
    return false;
  }

  if (sourceMatch.naipe != candidateMatch.naipe) {
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

export function resolveMatchSwapOptionLabel(params: MatchSwapOptionLabelParams): string {
  const { match, shouldUseScheduledSlot, displaySlot } = params;
  const queueSlot = displaySlot ?? resolveMatchSwapDisplaySlot(match, shouldUseScheduledSlot);
  const queueLabel = resolveMatchQueueLabel(queueSlot);
  const scheduledDateLabel = resolveSwapMatchScheduledDateLabel(match.scheduled_date);
  const startTimeLabel = resolveSwapMatchStartTimeLabel(match.start_time);
  const homeTeamName = match.home_team?.name ?? "Casa";
  const awayTeamName = match.away_team?.name ?? "Visitante";

  return `${scheduledDateLabel ? `${scheduledDateLabel} • ` : ""}${startTimeLabel ? `${startTimeLabel} • ` : ""}${queueLabel} • ${homeTeamName} x ${awayTeamName}`;
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

  const targetConflictMessage = resolveScheduledMatchCourtConflictMessage({
    matches: simulatedMatches as Parameters<typeof resolveScheduledMatchCourtConflictMessage>[0]["matches"],
    nextMatch: targetSwappedMatch as Parameters<typeof resolveScheduledMatchCourtConflictMessage>[0]["nextMatch"],
  });

  if (targetConflictMessage) {
    return targetConflictMessage;
  }

  return resolveMatchQueueSwapRepresentationConflictMessage({
    matches: simulatedMatches,
    sourceMatch: sourceSwappedMatch,
    targetMatch: targetSwappedMatch,
  });
}

function resolveSwappedMatchSnapshot(
  match: MatchQueueSwapComparable,
  referenceMatch: MatchQueueSwapComparable,
  nextOperationalSlot: number,
): MatchQueueSwapComparable {
  return {
    ...match,
    scheduled_date: referenceMatch.scheduled_date,
    queue_position: nextOperationalSlot,
    scheduled_slot: nextOperationalSlot,
    start_time: referenceMatch.start_time,
  };
}

function resolveMatchQueueSwapRepresentationConflictMessage(params: {
  matches: MatchQueueSwapComparable[];
  sourceMatch: MatchQueueSwapComparable;
  targetMatch: MatchQueueSwapComparable;
}): string | null {
  const { matches, sourceMatch, targetMatch } = params;
  const affectedTeamIds = new Set(
    [sourceMatch.home_team_id, sourceMatch.away_team_id, targetMatch.home_team_id, targetMatch.away_team_id].filter(Boolean),
  );

  const normalizedLocation = normalizeBracketEntityName(sourceMatch.location);
  const normalizedCourtName = normalizeBracketEntityName(sourceMatch.court_name);
  const affectedScheduledDates = new Set(
    [resolveMatchScheduledDateValue(sourceMatch), resolveMatchScheduledDateValue(targetMatch)].filter(Boolean),
  );

  const scopedMatches = matches
    .filter((match) => {
      const matchScheduledDate = resolveMatchScheduledDateValue(match);

      return (
        match.status === MatchStatus.SCHEDULED &&
        !!matchScheduledDate &&
        affectedScheduledDates.has(matchScheduledDate) &&
        normalizeBracketEntityName(match.location) === normalizedLocation &&
        normalizeBracketEntityName(match.court_name) === normalizedCourtName
      );
    })
    .sort(compareSwapScopedMatches);

  for (let matchIndex = 1; matchIndex < scopedMatches.length; matchIndex += 1) {
    const previousMatch = scopedMatches[matchIndex - 1];
    const currentMatch = scopedMatches[matchIndex];

    if (resolveMatchScheduledDateValue(previousMatch) !== resolveMatchScheduledDateValue(currentMatch)) {
      continue;
    }

    if (currentMatch.manual_representation_mode === MatchManualRepresentationMode.CO) {
      continue;
    }

    if (!doMatchesShareAnyTeam(previousMatch, currentMatch)) {
      continue;
    }

    if (!doMatchesIncludeAffectedTeam(previousMatch, currentMatch, affectedTeamIds)) {
      continue;
    }

    return "A troca cria conflito de representação na mesma quadra.";
  }

  return null;
}

function normalizeBracketEntityName(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

function compareSwapScopedMatches(
  firstMatch: MatchQueueSwapComparable,
  secondMatch: MatchQueueSwapComparable,
) {
  const firstScheduledDate = resolveMatchScheduledDateValue(firstMatch) ?? "9999-12-31";
  const secondScheduledDate = resolveMatchScheduledDateValue(secondMatch) ?? "9999-12-31";

  if (firstScheduledDate !== secondScheduledDate) {
    return firstScheduledDate.localeCompare(secondScheduledDate);
  }

  if (firstMatch.start_time && secondMatch.start_time && firstMatch.start_time !== secondMatch.start_time) {
    return firstMatch.start_time.localeCompare(secondMatch.start_time);
  }

  if (firstMatch.start_time && !secondMatch.start_time) {
    return -1;
  }

  if (!firstMatch.start_time && secondMatch.start_time) {
    return 1;
  }

  const slotDifference = (resolveMatchOperationalQueueSlot(firstMatch) ?? Number.MAX_SAFE_INTEGER)
    - (resolveMatchOperationalQueueSlot(secondMatch) ?? Number.MAX_SAFE_INTEGER);

  if (slotDifference !== 0) {
    return slotDifference;
  }

  if (firstMatch.created_at !== secondMatch.created_at) {
    return firstMatch.created_at.localeCompare(secondMatch.created_at);
  }

  return firstMatch.id.localeCompare(secondMatch.id);
}

function doMatchesIncludeAffectedTeam(
  firstMatch: Pick<MatchQueueSwapComparable, "home_team_id" | "away_team_id">,
  secondMatch: Pick<MatchQueueSwapComparable, "home_team_id" | "away_team_id">,
  affectedTeamIds: Set<string>,
) {
  return [firstMatch.home_team_id, firstMatch.away_team_id, secondMatch.home_team_id, secondMatch.away_team_id]
    .filter(Boolean)
    .some((teamId) => affectedTeamIds.has(teamId as string));
}

function resolveSwapMatchScheduledDateLabel(scheduledDate: string | null | undefined): string | null {
  const normalizedValue = scheduledDate?.trim() ?? "";
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizedValue);

  if (!dateMatch) {
    return null;
  }

  return `${dateMatch[3]}/${dateMatch[2]}`;
}

function resolveSwapMatchStartTimeLabel(startTime: string | null | undefined): string | null {
  if (!startTime) {
    return null;
  }

  const parsedStartTime = new Date(startTime);

  if (Number.isNaN(parsedStartTime.getTime())) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(parsedStartTime);
  } catch {
    return null;
  }
}
