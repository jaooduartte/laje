import { ChampionshipIndividualEntryStatus } from "@/lib/enums";
import type {
  ChampionshipIndividualEvent,
  ChampionshipIndividualEventEntry,
} from "@/lib/types";

export function hasIndividualEventEntryResult(
  entry: ChampionshipIndividualEventEntry,
): boolean {
  return (
    entry.final_position != null ||
    entry.status == ChampionshipIndividualEntryStatus.WALKOVER ||
    entry.status == ChampionshipIndividualEntryStatus.DNS ||
    entry.status == ChampionshipIndividualEntryStatus.DSQ ||
    entry.status == ChampionshipIndividualEntryStatus.DSQ_OVER_LIMIT
  );
}

export function resolveIndividualEventsWithResults(
  individualEvents: ChampionshipIndividualEvent[],
  individualEntriesByEventId: Record<string, ChampionshipIndividualEventEntry[]>,
): ChampionshipIndividualEvent[] {
  return individualEvents.filter((event) => {
    return (individualEntriesByEventId[event.id] ?? []).some(
      hasIndividualEventEntryResult,
    );
  });
}
