import { useMemo, type ComponentProps } from "react";
import { AdminMatches as AdminMatchesBase } from "./AdminMatches";
import { AdminMatchesViewMode } from "@/components/admin/adminMatches.types";
import { resolveAdminMatchesKnockoutPlaceholders } from "@/components/admin/adminMatchesScheduleItems.utils";
import { MatchStatus } from "@/lib/enums";
import type { Match } from "@/lib/types";

type AdminMatchesProps = ComponentProps<typeof AdminMatchesBase>;

const UNSUPPORTED_PLACEHOLDER_ACCESS = Symbol("unsupported-placeholder-access");
const FILTER_METADATA_PROPERTIES = new Set<PropertyKey>(["location", "court_name"]);

function createFilterMetadataProbe(match: Match): Match {
  return new Proxy(match, {
    get(target, property, receiver) {
      if (FILTER_METADATA_PROPERTIES.has(property)) {
        return Reflect.get(target, property, receiver);
      }

      throw UNSUPPORTED_PLACEHOLDER_ACCESS;
    },
  });
}

function createFilteredMatchesWithScheduleMetadata(
  realMatches: Match[],
  placeholderMatches: Match[],
): Match[] {
  return new Proxy(realMatches, {
    get(target, property, receiver) {
      if (property == "map") {
        return <T,>(
          callback: (match: Match, index: number, matches: Match[]) => T,
          thisArg?: unknown,
        ): T[] => {
          const mappedValues = target.map(callback, thisArg);

          placeholderMatches.forEach((placeholderMatch, placeholderIndex) => {
            try {
              mappedValues.push(
                callback.call(
                  thisArg,
                  createFilterMetadataProbe(placeholderMatch),
                  target.length + placeholderIndex,
                  target,
                ),
              );
            } catch (error) {
              if (error !== UNSUPPORTED_PLACEHOLDER_ACCESS) {
                throw error;
              }
            }
          });

          return mappedValues;
        };
      }

      if (property == "forEach") {
        return (
          callback: (match: Match, index: number, matches: Match[]) => void,
          thisArg?: unknown,
        ): void => {
          target.forEach(callback, thisArg);

          placeholderMatches.forEach((placeholderMatch, placeholderIndex) => {
            try {
              callback.call(
                thisArg,
                createFilterMetadataProbe(placeholderMatch),
                target.length + placeholderIndex,
                target,
              );
            } catch (error) {
              if (error !== UNSUPPORTED_PLACEHOLDER_ACCESS) {
                throw error;
              }
            }
          });
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
}

// Exportado para testes/utilitários; não representa um componente React.
// eslint-disable-next-line react-refresh/only-export-components
export function createMatchesWithSchedulePlaceholderFilterMetadata(
  realMatches: Match[],
  placeholderMatches: Match[],
): Match[] {
  if (placeholderMatches.length == 0) {
    return realMatches;
  }

  return new Proxy(realMatches, {
    get(target, property, receiver) {
      if (property == "filter") {
        return (
          predicate: (match: Match, index: number, matches: Match[]) => unknown,
          thisArg?: unknown,
        ): Match[] => {
          const filteredRealMatches = target.filter(predicate, thisArg);
          const filteredPlaceholderMatches = placeholderMatches.filter(
            (placeholderMatch, placeholderIndex) =>
              Boolean(
                predicate.call(thisArg, placeholderMatch, target.length + placeholderIndex, target),
              ),
          );

          return createFilteredMatchesWithScheduleMetadata(
            filteredRealMatches,
            filteredPlaceholderMatches,
          );
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
}

function resolveSchedulePlaceholderMatches(props: AdminMatchesProps): Match[] {
  if (props.viewMode != null && props.viewMode != AdminMatchesViewMode.DEFAULT) {
    return [];
  }

  const placeholders = resolveAdminMatchesKnockoutPlaceholders({
    championshipBracketView: props.championshipBracketView,
    matchesForMatchNumbering: props.matches,
    sportId: null,
    scheduledDate: null,
    naipe: null,
    division: null,
    location: null,
    courtName: null,
    shouldIncludeScheduledItems: true,
    shouldExcludePlaceholdersForTeamOrGroupFilter: false,
  });

  return placeholders.map(
    (placeholder): Match =>
      ({
        id: `schedule-placeholder:${placeholder.id}`,
        championship_id: props.selectedChampionship.id,
        season_year: props.selectedSeasonYear ?? props.selectedChampionship.current_season_year,
        division: placeholder.division,
        naipe: placeholder.naipe,
        supports_cards: false,
        sport_id: placeholder.sport_id,
        home_team_id: "",
        away_team_id: "",
        location: placeholder.location,
        court_name: placeholder.court_name,
        scheduled_date: placeholder.scheduled_date,
        queue_position: placeholder.queue_position,
        scheduled_slot: placeholder.scheduled_slot,
        is_manual_schedule_override: false,
        is_pending_manual_relocation: false,
        scheduled_start_time: placeholder.start_time,
        start_time: placeholder.start_time,
        end_time: placeholder.end_time,
        status: MatchStatus.SCHEDULED,
        home_score: 0,
        home_yellow_cards: 0,
        home_red_cards: 0,
        away_score: 0,
        away_yellow_cards: 0,
        away_red_cards: 0,
        created_at: placeholder.start_time ?? `${placeholder.scheduled_date}T00:00:00-03:00`,
      }) as Match,
  );
}

export function AdminMatchesWithScheduleFilters(props: AdminMatchesProps) {
  const schedulePlaceholderMatches = useMemo(
    () => resolveSchedulePlaceholderMatches(props),
    [props],
  );

  const matchesWithFilterMetadata = useMemo(
    () =>
      createMatchesWithSchedulePlaceholderFilterMetadata(props.matches, schedulePlaceholderMatches),
    [props.matches, schedulePlaceholderMatches],
  );

  return <AdminMatchesBase {...props} matches={matchesWithFilterMetadata} />;
}

export { AdminMatchesWithScheduleFilters as AdminMatches };
