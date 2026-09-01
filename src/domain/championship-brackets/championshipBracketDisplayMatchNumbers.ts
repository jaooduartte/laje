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

export function resolveKnockoutDisplayMatchNumberById(
  championshipBracketView: ChampionshipBracketView,
  matches: Match[] = [],
): Record<string, number> {
  const lastGroupStageMatchNumberBySportId = new Map<string, number>();
  const firstGroupStageMatchNumberBySportId = new Map<string, number>();
  const groupStageMatchCountBySportId = new Map<string, number>();

  championshipBracketView.competitions.forEach((competition) => {
    competition.groups.forEach((group) => {
      group.matches.forEach((match) => {
        groupStageMatchCountBySportId.set(
          competition.sport_id,
          (groupStageMatchCountBySportId.get(competition.sport_id) ?? 0) + 1,
        );

        const matchNumber =
          match.queue_position ?? Number.MAX_SAFE_INTEGER;

        if (matchNumber == Number.MAX_SAFE_INTEGER) {
          return;
        }

        lastGroupStageMatchNumberBySportId.set(
          competition.sport_id,
          Math.max(
            lastGroupStageMatchNumberBySportId.get(competition.sport_id) ?? 0,
            matchNumber,
          ),
        );
        firstGroupStageMatchNumberBySportId.set(
          competition.sport_id,
          Math.min(
            firstGroupStageMatchNumberBySportId.get(competition.sport_id) ??
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

    lastGroupStageMatchNumberBySportId.set(
      match.sport_id,
      Math.max(
        lastGroupStageMatchNumberBySportId.get(match.sport_id) ?? 0,
        matchNumber,
      ),
    );
  });

  const displayMatchNumberById: Record<string, number> = {};

  const knockoutMatchesBySportId = new Map<
    string,
    ChampionshipBracketView["competitions"][number]["knockout_matches"]
  >();

  championshipBracketView.competitions.forEach((competition) => {
    const knockoutMatches = knockoutMatchesBySportId.get(competition.sport_id) ?? [];
    knockoutMatches.push(...competition.knockout_matches);
    knockoutMatchesBySportId.set(competition.sport_id, knockoutMatches);
  });

  knockoutMatchesBySportId.forEach((knockoutMatches, sportId) => {
    const firstGroupStageMatchNumber =
      firstGroupStageMatchNumberBySportId.get(sportId);
    const groupStageMatchCount = groupStageMatchCountBySportId.get(sportId) ?? 0;
    const expectedLastGroupStageMatchNumber =
      firstGroupStageMatchNumber != null && groupStageMatchCount > 0
        ? firstGroupStageMatchNumber + groupStageMatchCount - 1
        : 0;
    const baseMatchNumber = Math.max(
      lastGroupStageMatchNumberBySportId.get(sportId) ?? 0,
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
