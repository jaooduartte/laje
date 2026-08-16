import type {
  ChampionshipIndividualSession,
  Match,
} from "@/lib/types";
import type { MatchNaipe, TeamDivision } from "@/lib/enums";
import {
  resolveMatchDisplaySlotValue,
  resolveMatchScheduledDateValue,
  resolveSaoPauloDateTimeLabel,
} from "@/lib/championship";

export interface ScheduledKnockoutPlaceholder {
  id: string;
  competition_id: string;
  sport_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  round_number: number;
  slot_number: number;
  is_third_place: boolean;
  scheduled_date: string;
  queue_position: number | null;
  scheduled_slot: number | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  court_name: string | null;
  stage_label: string;
}

export type PublicScheduleTimelineItem =
  | {
      type: "MATCH";
      id: string;
      scheduledDate: string;
      match: Match;
    }
  | {
      type: "KNOCKOUT_PLACEHOLDER";
      id: string;
      scheduledDate: string;
      placeholder: ScheduledKnockoutPlaceholder;
    }
  | {
      type: "INDIVIDUAL_SESSION";
      id: string;
      scheduledDate: string;
      session: ChampionshipIndividualSession;
      eventCount: number;
    };

function resolveTimeValueToMinutes(timeValue: string | null | undefined) {
  const timeLabel = resolvePublicScheduleTimeLabel(timeValue);

  if (!timeLabel) {
    return null;
  }

  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeLabel);

  if (!timeMatch) {
    return null;
  }

  return Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
}

function resolveTimelineItemTimeValue(
  item: PublicScheduleTimelineItem,
  estimatedStartTimeByMatchId: Record<string, string>,
) {
  if (item.type == "MATCH") {
    return resolveTimeValueToMinutes(
      item.match.start_time ?? estimatedStartTimeByMatchId[item.match.id],
    );
  }

  if (item.type == "KNOCKOUT_PLACEHOLDER") {
    return resolveTimeValueToMinutes(item.placeholder.start_time);
  }

  if (item.session.period == "MATUTINO") {
    return 0;
  }

  if (item.session.period == "VESPERTINO") {
    return 12 * 60;
  }

  return null;
}

function resolveTimelineItemSlotValue(item: PublicScheduleTimelineItem) {
  if (item.type == "MATCH") {
    return resolveMatchDisplaySlotValue(item.match) ?? Number.MAX_SAFE_INTEGER;
  }

  if (item.type == "KNOCKOUT_PLACEHOLDER") {
    return (
      item.placeholder.scheduled_slot ??
      item.placeholder.queue_position ??
      Number.MAX_SAFE_INTEGER
    );
  }

  return Number.MAX_SAFE_INTEGER;
}

export function resolvePublicScheduleTimeLabel(
  timeValue: string | null | undefined,
) {
  if (!timeValue) {
    return null;
  }

  const directTimeMatch = /^(\d{2}:\d{2})(?::\d{2})?$/.exec(timeValue);

  if (directTimeMatch) {
    return directTimeMatch[1];
  }

  const saoPauloDateTimeLabel = resolveSaoPauloDateTimeLabel(timeValue);

  return saoPauloDateTimeLabel?.slice(11, 16) ?? null;
}

export function resolvePublicScheduleTimelineItems({
  matches,
  placeholders = [],
  individualSessions = [],
  individualEventCountBySessionId = {},
  estimatedStartTimeByMatchId = {},
}: {
  matches: Match[];
  placeholders?: ScheduledKnockoutPlaceholder[];
  individualSessions?: ChampionshipIndividualSession[];
  individualEventCountBySessionId?: Record<string, number>;
  estimatedStartTimeByMatchId?: Record<string, string>;
}): PublicScheduleTimelineItem[] {
  const items: PublicScheduleTimelineItem[] = [
    ...matches.flatMap((match) => {
      const scheduledDate = resolveMatchScheduledDateValue(match);

      return scheduledDate
        ? [{ type: "MATCH" as const, id: match.id, scheduledDate, match }]
        : [];
    }),
    ...placeholders.map((placeholder) => ({
      type: "KNOCKOUT_PLACEHOLDER" as const,
      id: placeholder.id,
      scheduledDate: placeholder.scheduled_date,
      placeholder,
    })),
    ...individualSessions.flatMap((session) => {
      if (!session.scheduled_date) {
        return [];
      }

      return [
        {
          type: "INDIVIDUAL_SESSION" as const,
          id: session.id,
          scheduledDate: session.scheduled_date,
          session,
          eventCount: individualEventCountBySessionId[session.id] ?? 0,
        },
      ];
    }),
  ];

  return items.sort((firstItem, secondItem) => {
    if (firstItem.scheduledDate != secondItem.scheduledDate) {
      return firstItem.scheduledDate.localeCompare(secondItem.scheduledDate);
    }

    const firstTimeValue = resolveTimelineItemTimeValue(
      firstItem,
      estimatedStartTimeByMatchId,
    );
    const secondTimeValue = resolveTimelineItemTimeValue(
      secondItem,
      estimatedStartTimeByMatchId,
    );

    if (firstTimeValue != null && secondTimeValue != null && firstTimeValue != secondTimeValue) {
      return firstTimeValue - secondTimeValue;
    }

    if (firstTimeValue != null && secondTimeValue == null) {
      return -1;
    }

    if (firstTimeValue == null && secondTimeValue != null) {
      return 1;
    }

    const firstSlotValue = resolveTimelineItemSlotValue(firstItem);
    const secondSlotValue = resolveTimelineItemSlotValue(secondItem);

    if (firstSlotValue != secondSlotValue) {
      return firstSlotValue - secondSlotValue;
    }

    return firstItem.id.localeCompare(secondItem.id);
  });
}
