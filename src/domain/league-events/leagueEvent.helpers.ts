import type { LeagueEvent, Team } from "@/lib/types";
import { LeagueEventOrganizerType } from "@/lib/enums";
import { LEAGUE_EVENT_LEGEND_ORDER } from "@/domain/league-events/leagueEvent.constants";

export function resolveLeagueEventOrganizerTeams(leagueEvent: LeagueEvent): Team[] {
  if (leagueEvent.organizer_type == LeagueEventOrganizerType.LAJE) {
    return [];
  }

  if (leagueEvent.organizer_teams && leagueEvent.organizer_teams.length > 0) {
    return [...leagueEvent.organizer_teams].sort((firstTeam, secondTeam) => firstTeam.name.localeCompare(secondTeam.name));
  }

  if (leagueEvent.organizer_team) {
    return [leagueEvent.organizer_team];
  }

  return [];
}

export function resolveLeagueEventOrganizerName(leagueEvent: LeagueEvent): string {
  if (leagueEvent.organizer_type == LeagueEventOrganizerType.LAJE) {
    return "LAJE";
  }

  const organizerTeams = resolveLeagueEventOrganizerTeams(leagueEvent);

  if (organizerTeams.length == 0) {
    return "Atlética";
  }

  return organizerTeams.map((team) => team.name).join(" + ");
}

export function resolveUniqueLeagueEventTypes(leagueEvents: LeagueEvent[]) {
  const uniqueLeagueEventTypes = new Set(leagueEvents.map((leagueEvent) => leagueEvent.event_type));

  return LEAGUE_EVENT_LEGEND_ORDER.filter((leagueEventType) => uniqueLeagueEventTypes.has(leagueEventType));
}

export function leagueEventHasOrganizerTeam(leagueEvent: LeagueEvent, teamId: string): boolean {
  return resolveLeagueEventOrganizerTeams(leagueEvent).some((team) => team.id == teamId);
}

export function resolveLeagueEventOrganizerTeamIds(leagueEvent: LeagueEvent): string[] {
  const organizerTeams = resolveLeagueEventOrganizerTeams(leagueEvent);

  if (organizerTeams.length > 0) {
    return organizerTeams.map((team) => team.id);
  }

  if (leagueEvent.organizer_team_id) {
    return [leagueEvent.organizer_team_id];
  }

  return [];
}
