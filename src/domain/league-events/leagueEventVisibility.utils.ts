import type { LeagueEvent } from "@/lib/types";

export function resolvePastLeagueEvents(
  leagueEvents: LeagueEvent[],
  todayDateKey: string,
): LeagueEvent[] {
  return leagueEvents.filter(
    (leagueEvent) => leagueEvent.event_date < todayDateKey,
  );
}

export function resolveVisibleLeagueEvents(
  leagueEvents: LeagueEvent[],
  todayDateKey: string,
  showPastLeagueEvents: boolean,
): LeagueEvent[] {
  if (showPastLeagueEvents) {
    return leagueEvents;
  }

  return leagueEvents.filter(
    (leagueEvent) => leagueEvent.event_date >= todayDateKey,
  );
}
