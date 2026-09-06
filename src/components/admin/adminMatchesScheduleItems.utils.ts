import type { ScheduledKnockoutPlaceholder } from "@/domain/public-schedule/publicScheduleTimeline";
import { resolvePublicScheduleTimelineItems } from "@/domain/public-schedule/publicScheduleTimeline";
import type { ChampionshipBracketView, Match } from "@/lib/types";
import type { MatchNaipe, TeamDivision } from "@/lib/enums";
import {
  resolveChampionshipBracketMatchNumberingMode,
  resolveKnockoutDisplayMatchNumberById,
} from "@/domain/championship-brackets/championshipBracketDisplayMatchNumbers";
import {
  resolveKnockoutRoundLabel,
} from "@/lib/championship";

export type AdminMatchesScheduleItem =
  | {
      type: "MATCH";
      id: string;
      match: Match;
    }
  | {
      type: "KNOCKOUT_PLACEHOLDER";
      id: string;
      placeholder: ScheduledKnockoutPlaceholder;
    };

interface ResolveAdminMatchesKnockoutPlaceholdersOptions {
  championshipBracketView: ChampionshipBracketView;
  matchesForMatchNumbering: Match[];
  sportId: string | null;
  scheduledDate: string | null;
  naipe: MatchNaipe | null;
  division: TeamDivision | null;
  location: string | null;
  courtName: string | null;
  shouldIncludeScheduledItems: boolean;
  shouldExcludePlaceholdersForTeamOrGroupFilter: boolean;
}

export function resolveAdminMatchesKnockoutPlaceholders({
  championshipBracketView,
  matchesForMatchNumbering,
  sportId,
  scheduledDate,
  naipe,
  division,
  location,
  courtName,
  shouldIncludeScheduledItems,
  shouldExcludePlaceholdersForTeamOrGroupFilter,
}: ResolveAdminMatchesKnockoutPlaceholdersOptions): ScheduledKnockoutPlaceholder[] {
  if (
    !shouldIncludeScheduledItems ||
    shouldExcludePlaceholdersForTeamOrGroupFilter
  ) {
    return [];
  }

  const knockoutDisplayMatchNumberById =
    resolveKnockoutDisplayMatchNumberById(
      championshipBracketView,
      matchesForMatchNumbering,
      resolveChampionshipBracketMatchNumberingMode(
        championshipBracketView.edition?.payload_snapshot,
      ),
    );

  return championshipBracketView.competitions.flatMap((competition) => {
    const totalRounds = competition.knockout_matches.reduce(
      (currentMaxRound, knockoutMatch) => {
        if (knockoutMatch.is_third_place) {
          return currentMaxRound;
        }

        return Math.max(currentMaxRound, knockoutMatch.round_number);
      },
      0,
    );

    return competition.knockout_matches
      .filter((knockoutMatch) => {
        if (
          knockoutMatch.match_id ||
          knockoutMatch.is_bye ||
          !knockoutMatch.scheduled_date
        ) {
          return false;
        }

        if (sportId && competition.sport_id != sportId) {
          return false;
        }

        if (scheduledDate && knockoutMatch.scheduled_date != scheduledDate) {
          return false;
        }

        if (naipe && competition.naipe != naipe) {
          return false;
        }

        if (division && competition.division != division) {
          return false;
        }

        if (location && knockoutMatch.location != location) {
          return false;
        }

        if (courtName && knockoutMatch.court_name != courtName) {
          return false;
        }

        return true;
      })
      .map((knockoutMatch) => ({
        id: knockoutMatch.id,
        competition_id: competition.id,
        sport_id: competition.sport_id,
        sport_name: competition.sport_name,
        naipe: competition.naipe,
        division: competition.division,
        round_number: knockoutMatch.round_number,
        slot_number: knockoutMatch.slot_number,
        is_third_place: knockoutMatch.is_third_place,
        display_match_number:
          knockoutDisplayMatchNumberById[knockoutMatch.id] ?? null,
        scheduled_date: knockoutMatch.scheduled_date!,
        queue_position: knockoutMatch.queue_position,
        scheduled_slot: knockoutMatch.scheduled_slot ?? null,
        start_time: knockoutMatch.start_time,
        end_time: knockoutMatch.end_time,
        location: knockoutMatch.location,
        court_name: knockoutMatch.court_name,
        stage_label: resolveKnockoutRoundLabel(
          knockoutMatch.round_number,
          Math.max(totalRounds, knockoutMatch.round_number),
          knockoutMatch.is_third_place,
        ),
      }));
  });
}

export function resolveAdminMatchesScheduleItems({
  matches,
  placeholders,
  estimatedStartTimeByMatchId,
}: {
  matches: Match[];
  placeholders: ScheduledKnockoutPlaceholder[];
  estimatedStartTimeByMatchId: Record<string, string>;
}): AdminMatchesScheduleItem[] {
  return resolvePublicScheduleTimelineItems({
    matches,
    placeholders,
    estimatedStartTimeByMatchId,
  }).flatMap((item) => {
    if (item.type == "MATCH") {
      return [{ type: "MATCH" as const, id: item.id, match: item.match }];
    }

    if (item.type == "KNOCKOUT_PLACEHOLDER") {
      return [
        {
          type: "KNOCKOUT_PLACEHOLDER" as const,
          id: item.id,
          placeholder: item.placeholder,
        },
      ];
    }

    return [];
  });
}
