import type { ChampionshipBracketMatchNumberingMode } from "@/domain/championship-brackets/championshipBracket.types";
import type { MatchNaipe } from "@/lib/enums";
import type { ChampionshipBracketView, Match } from "@/lib/types";
import { resolvePublicScheduleTimeLabel } from "@/domain/public-schedule/publicScheduleTimeline";

function resolveScheduleTimeValue(timeValue: string | null) {
  const timeLabel = resolvePublicScheduleTimeLabel(timeValue);
  const timeMatch = timeLabel ? /^(\d{2}):(\d{2})$/.exec(timeLabel) : null;

  if (!timeMatch) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
}

function resolveScheduledSlotValue(
  scheduledSlot: number | null,
  queuePosition: number | null,
) {
  return scheduledSlot ?? queuePosition ?? Number.MAX_SAFE_INTEGER;
}

function resolvePendingMatchPreviousSlotValue(match: Match) {
  const previousSchedule = match.pending_manual_relocation_previous_schedule;

  if (!previousSchedule || typeof previousSchedule != "object") {
    return null;
  }

  const previousScheduledSlot = previousSchedule.scheduled_slot;

  return typeof previousScheduledSlot == "number"
    ? previousScheduledSlot
    : null;
}

function resolveStoredMatchNumber(match: Match) {
  return (
    (match.is_pending_manual_relocation
      ? resolvePendingMatchPreviousSlotValue(match)
      : null) ??
    resolveScheduledSlotValue(match.scheduled_slot, match.queue_position)
  );
}

export function resolveChampionshipBracketMatchNumberingMode(
  payloadSnapshot: Record<string, unknown> | null | undefined,
): ChampionshipBracketMatchNumberingMode {
  if (payloadSnapshot?.match_numbering_mode == "SPORT_NAIPE") {
    return "SPORT_NAIPE";
  }

  return payloadSnapshot?.match_numbering_mode == "SPORT" ? "SPORT" : "COURT";
}

function resolveMatchNumberingScopeKey(
  sportId: string,
  naipe: MatchNaipe,
  matchNumberingMode: ChampionshipBracketMatchNumberingMode,
): string {
  return matchNumberingMode == "SPORT_NAIPE"
    ? `${sportId}:${naipe}`
    : sportId;
}

export function resolveKnockoutDisplayMatchNumberById(
  championshipBracketView: ChampionshipBracketView,
  matches: Match[] = [],
  matchNumberingMode = resolveChampionshipBracketMatchNumberingMode(
    championshipBracketView.edition?.payload_snapshot,
  ),
): Record<string, number> {
  const lastGroupStageMatchNumberByScopeKey = new Map<string, number>();
  const firstGroupStageMatchNumberByScopeKey = new Map<string, number>();
  const groupStageMatchCountByScopeKey = new Map<string, number>();

  championshipBracketView.competitions.forEach((competition) => {
    const scopeKey = resolveMatchNumberingScopeKey(
      competition.sport_id,
      competition.naipe,
      matchNumberingMode,
    );

    competition.groups.forEach((group) => {
      group.matches.forEach((match) => {
        groupStageMatchCountByScopeKey.set(
          scopeKey,
          (groupStageMatchCountByScopeKey.get(scopeKey) ?? 0) + 1,
        );

        const matchNumber =
          match.queue_position ?? Number.MAX_SAFE_INTEGER;

        if (matchNumber == Number.MAX_SAFE_INTEGER) {
          return;
        }

        lastGroupStageMatchNumberByScopeKey.set(
          scopeKey,
          Math.max(
            lastGroupStageMatchNumberByScopeKey.get(scopeKey) ?? 0,
            matchNumber,
          ),
        );
        firstGroupStageMatchNumberByScopeKey.set(
          scopeKey,
          Math.min(
            firstGroupStageMatchNumberByScopeKey.get(scopeKey) ??
              matchNumber,
            matchNumber,
          ),
        );
      });
    });
  });

  matches.forEach((match) => {
    const matchNumber = resolveStoredMatchNumber(match);

    if (matchNumber == Number.MAX_SAFE_INTEGER) {
      return;
    }

    const scopeKey = resolveMatchNumberingScopeKey(
      match.sport_id,
      match.naipe,
      matchNumberingMode,
    );

    lastGroupStageMatchNumberByScopeKey.set(
      scopeKey,
      Math.max(
        lastGroupStageMatchNumberByScopeKey.get(scopeKey) ?? 0,
        matchNumber,
      ),
    );
  });

  const displayMatchNumberById: Record<string, number> = {};

  const knockoutMatchesByScopeKey = new Map<
    string,
    ChampionshipBracketView["competitions"][number]["knockout_matches"]
  >();

  championshipBracketView.competitions.forEach((competition) => {
    const scopeKey = resolveMatchNumberingScopeKey(
      competition.sport_id,
      competition.naipe,
      matchNumberingMode,
    );
    const knockoutMatches = knockoutMatchesByScopeKey.get(scopeKey) ?? [];
    knockoutMatches.push(...competition.knockout_matches);
    knockoutMatchesByScopeKey.set(scopeKey, knockoutMatches);
  });

  knockoutMatchesByScopeKey.forEach((knockoutMatches, scopeKey) => {
    const firstGroupStageMatchNumber =
      firstGroupStageMatchNumberByScopeKey.get(scopeKey);
    const groupStageMatchCount = groupStageMatchCountByScopeKey.get(scopeKey) ?? 0;
    const expectedLastGroupStageMatchNumber =
      firstGroupStageMatchNumber != null && groupStageMatchCount > 0
        ? firstGroupStageMatchNumber + groupStageMatchCount - 1
        : 0;
    const baseMatchNumber =
      matchNumberingMode == "SPORT_NAIPE"
        ? groupStageMatchCount
        : Math.max(
            lastGroupStageMatchNumberByScopeKey.get(scopeKey) ?? 0,
            expectedLastGroupStageMatchNumber,
          );

    knockoutMatches
      .filter((match) => !match.is_bye && match.scheduled_date != null)
      .sort((firstMatch, secondMatch) => {
        if (firstMatch.scheduled_date != secondMatch.scheduled_date) {
          return firstMatch.scheduled_date!.localeCompare(
            secondMatch.scheduled_date!,
          );
        }

        const firstTime = resolveScheduleTimeValue(firstMatch.start_time);
        const secondTime = resolveScheduleTimeValue(secondMatch.start_time);

        if (firstTime != secondTime) {
          return firstTime - secondTime;
        }

        const firstSlot = resolveScheduledSlotValue(
          firstMatch.scheduled_slot,
          firstMatch.queue_position,
        );
        const secondSlot = resolveScheduledSlotValue(
          secondMatch.scheduled_slot,
          secondMatch.queue_position,
        );

        if (firstSlot != secondSlot) {
          return firstSlot - secondSlot;
        }

        if (firstMatch.round_number != secondMatch.round_number) {
          return firstMatch.round_number - secondMatch.round_number;
        }

        if (firstMatch.slot_number != secondMatch.slot_number) {
          return firstMatch.slot_number - secondMatch.slot_number;
        }

        return firstMatch.id.localeCompare(secondMatch.id);
      })
      .forEach((match, index) => {
        displayMatchNumberById[match.id] = baseMatchNumber + index + 1;
      });
  });

  return displayMatchNumberById;
}
