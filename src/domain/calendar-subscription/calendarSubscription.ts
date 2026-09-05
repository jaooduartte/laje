import type { ChampionshipIndividualSession, Match, Team } from "@/lib/types";

export type CalendarSubscriptionScope =
  | "MATCH"
  | "SESSION"
  | "SPORT_NAIPE"
  | "TEAM"
  | "TEAM_MATCHES"
  | "TEAM_SPORT_NAIPE";

export interface CalendarSubscriptionOption {
  id: string;
  label: string;
  scope: CalendarSubscriptionScope;
  championshipId: string;
  seasonYear: number;
  matchId?: string;
  sessionId?: string;
  sportId?: string;
  naipe?: string;
  teamId?: string;
}

export interface CalendarSubscriptionUrls {
  downloadUrl: string;
  subscriptionUrl: string;
}

function resolveOptionBase(params: {
  championshipId: string;
  seasonYear: number;
  sportId: string;
  naipe: string;
}) {
  return {
    championshipId: params.championshipId,
    seasonYear: params.seasonYear,
    sportId: params.sportId,
    naipe: params.naipe,
  };
}

export function resolveMatchCalendarSubscriptionOptions(
  match: Match,
): CalendarSubscriptionOption[] {
  const base = resolveOptionBase({
    championshipId: match.championship_id,
    seasonYear: match.season_year,
    sportId: match.sport_id,
    naipe: match.naipe,
  });

  return [
    {
      id: `match:${match.id}`,
      label: "Este jogo",
      scope: "MATCH",
      matchId: match.id,
      ...base,
    },
    {
      id: `team-sport-naipe:${match.home_team_id}:${match.sport_id}:${match.naipe}`,
      label: `Jogos de ${match.sports?.name ?? "modalidade"} ${match.naipe.toLowerCase()} da ${match.home_team?.name ?? "atlética da casa"}`,
      scope: "TEAM_SPORT_NAIPE",
      teamId: match.home_team_id,
      ...base,
    },
    {
      id: `team-sport-naipe:${match.away_team_id}:${match.sport_id}:${match.naipe}`,
      label: `Jogos de ${match.sports?.name ?? "modalidade"} ${match.naipe.toLowerCase()} da ${match.away_team?.name ?? "atlética visitante"}`,
      scope: "TEAM_SPORT_NAIPE",
      teamId: match.away_team_id,
      ...base,
    },
    {
      id: `team-matches:${match.home_team_id}`,
      label: `Todos os jogos da ${match.home_team?.name ?? "atlética da casa"}`,
      scope: "TEAM_MATCHES",
      teamId: match.home_team_id,
      ...base,
    },
    {
      id: `team-matches:${match.away_team_id}`,
      label: `Todos os jogos da ${match.away_team?.name ?? "atlética visitante"}`,
      scope: "TEAM_MATCHES",
      teamId: match.away_team_id,
      ...base,
    },
  ];
}

export function resolveSessionCalendarSubscriptionOptions(
  session: ChampionshipIndividualSession,
  participantTeams: Team[],
): CalendarSubscriptionOption[] {
  const base = resolveOptionBase({
    championshipId: session.championship_id,
    seasonYear: session.season_year,
    sportId: session.sport_id,
    naipe: session.naipe,
  });

  return [
    {
      id: `session:${session.id}`,
      label: "Esta sessão",
      scope: "SESSION",
      sessionId: session.id,
      ...base,
    },
    {
      id: `sport-naipe:${session.sport_id}:${session.naipe}`,
      label: `Sessões e jogos de ${session.sports?.name ?? "modalidade"} ${session.naipe.toLowerCase()}`,
      scope: "SPORT_NAIPE",
      ...base,
    },
    ...participantTeams.map((team) => ({
      id: `team:${team.id}`,
      label: `Jogos da ${team.name}`,
      scope: "TEAM" as const,
      teamId: team.id,
      ...base,
    })),
  ];
}

export function canSubscribeToCalendar(startTime: string | null): boolean {
  if (!startTime) {
    return false;
  }

  const startTimestamp = new Date(startTime).getTime();

  return Number.isFinite(startTimestamp) && startTimestamp > Date.now();
}

export function resolveCalendarSubscriptionUrls(
  option: CalendarSubscriptionOption,
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL,
): CalendarSubscriptionUrls | null {
  if (!supabaseUrl) {
    return null;
  }

  const feedUrl = new URL(
    "/functions/v1/calendar-subscription-feed",
    supabaseUrl,
  );
  feedUrl.searchParams.set("scope", option.scope);
  feedUrl.searchParams.set("championship_id", option.championshipId);
  feedUrl.searchParams.set("season_year", String(option.seasonYear));

  if (option.matchId) {
    feedUrl.searchParams.set("match_id", option.matchId);
  }

  if (option.sessionId) {
    feedUrl.searchParams.set("session_id", option.sessionId);
  }

  if (option.sportId) {
    feedUrl.searchParams.set("sport_id", option.sportId);
  }

  if (option.naipe) {
    feedUrl.searchParams.set("naipe", option.naipe);
  }

  if (option.teamId) {
    feedUrl.searchParams.set("team_id", option.teamId);
  }

  const downloadUrl = new URL(feedUrl);
  downloadUrl.searchParams.set("download", "1");
  return {
    downloadUrl: downloadUrl.toString(),
    subscriptionUrl: feedUrl.toString().replace(/^https:/, "webcal:"),
  };
}
