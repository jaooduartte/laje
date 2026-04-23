import { MatchStatus } from "@/lib/enums";
import type { ChampionshipBracketCompetition, ChampionshipBracketKnockoutMatch, ChampionshipBracketView } from "@/lib/types";

export enum ChampionshipThirdPlaceSource {
  THIRD_PLACE_MATCH = "THIRD_PLACE_MATCH",
  CHAMPION_SEMIFINAL_LOSER = "CHAMPION_SEMIFINAL_LOSER",
}

export interface ChampionshipPodiumTeam {
  team_id: string;
  team_name: string;
}

export interface ChampionshipCompetitionPodiumPlacement {
  team: ChampionshipPodiumTeam;
  source: ChampionshipThirdPlaceSource;
  source_match_id: string;
}

export interface ChampionshipCompetitionPodium {
  competition_id: string;
  sport_id: string;
  sport_name: string;
  naipe: ChampionshipBracketCompetition["naipe"];
  division: ChampionshipBracketCompetition["division"];
  final_match_id: string;
  champion: ChampionshipPodiumTeam;
  runner_up: ChampionshipPodiumTeam | null;
  third_place: ChampionshipCompetitionPodiumPlacement | null;
}

function resolveCompetitionFinalMatch(
  competition: ChampionshipBracketCompetition,
): ChampionshipBracketKnockoutMatch | null {
  const mainKnockoutMatches = competition.knockout_matches.filter((knockoutMatch) => !knockoutMatch.is_third_place);

  if (mainKnockoutMatches.length == 0) {
    return null;
  }

  const finalRoundNumber = mainKnockoutMatches.reduce((currentFinalRoundNumber, knockoutMatch) => {
    return Math.max(currentFinalRoundNumber, knockoutMatch.round_number);
  }, 1);

  return (
    mainKnockoutMatches.find((knockoutMatch) => {
      return knockoutMatch.round_number == finalRoundNumber && knockoutMatch.slot_number == 1;
    }) ?? null
  );
}

function resolveMatchLoserTeam(match: ChampionshipBracketKnockoutMatch): ChampionshipPodiumTeam | null {
  if (!match.winner_team_id || !match.winner_team_name) {
    return null;
  }

  if (
    match.winner_team_id == match.home_team_id &&
    match.winner_team_name == match.home_team_name &&
    match.away_team_id &&
    match.away_team_name
  ) {
    return {
      team_id: match.away_team_id,
      team_name: match.away_team_name,
    };
  }

  if (
    match.winner_team_id == match.away_team_id &&
    match.winner_team_name == match.away_team_name &&
    match.home_team_id &&
    match.home_team_name
  ) {
    return {
      team_id: match.home_team_id,
      team_name: match.home_team_name,
    };
  }

  return null;
}

function didTeamPlayMatch(match: ChampionshipBracketKnockoutMatch, teamId: string | null, teamName: string | null): boolean {
  if (teamId && (match.home_team_id == teamId || match.away_team_id == teamId)) {
    return true;
  }

  if (teamName && (match.home_team_name == teamName || match.away_team_name == teamName)) {
    return true;
  }

  return false;
}

function resolveExplicitThirdPlaceWinner(
  competition: ChampionshipBracketCompetition,
): ChampionshipCompetitionPodiumPlacement | null {
  const thirdPlaceMatch = competition.knockout_matches.find((knockoutMatch) => {
    return (
      knockoutMatch.is_third_place &&
      knockoutMatch.status == MatchStatus.FINISHED &&
      knockoutMatch.winner_team_id != null &&
      knockoutMatch.winner_team_name != null
    );
  });

  if (!thirdPlaceMatch || !thirdPlaceMatch.winner_team_id || !thirdPlaceMatch.winner_team_name) {
    return null;
  }

  return {
    team: {
      team_id: thirdPlaceMatch.winner_team_id,
      team_name: thirdPlaceMatch.winner_team_name,
    },
    source: ChampionshipThirdPlaceSource.THIRD_PLACE_MATCH,
    source_match_id: thirdPlaceMatch.id,
  };
}

function resolveChampionSemifinalLoser(
  competition: ChampionshipBracketCompetition,
  finalMatch: ChampionshipBracketKnockoutMatch,
): ChampionshipCompetitionPodiumPlacement | null {
  const semifinalRoundNumber = finalMatch.round_number - 1;

  if (semifinalRoundNumber < 1) {
    return null;
  }

  const championSemifinal = competition.knockout_matches.find((knockoutMatch) => {
    return (
      !knockoutMatch.is_third_place &&
      knockoutMatch.round_number == semifinalRoundNumber &&
      knockoutMatch.status == MatchStatus.FINISHED &&
      didTeamPlayMatch(knockoutMatch, finalMatch.winner_team_id, finalMatch.winner_team_name ?? null)
    );
  });

  if (!championSemifinal) {
    return null;
  }

  const loserTeam = resolveMatchLoserTeam(championSemifinal);

  if (!loserTeam) {
    return null;
  }

  return {
    team: loserTeam,
    source: ChampionshipThirdPlaceSource.CHAMPION_SEMIFINAL_LOSER,
    source_match_id: championSemifinal.id,
  };
}

function resolveFinalRunnerUpTeam(finalMatch: ChampionshipBracketKnockoutMatch): ChampionshipPodiumTeam | null {
  return resolveMatchLoserTeam(finalMatch);
}

export function resolveCompetitionPodium(
  competition: ChampionshipBracketCompetition,
): ChampionshipCompetitionPodium | null {
  const finalMatch = resolveCompetitionFinalMatch(competition);

  if (
    !finalMatch ||
    finalMatch.status != MatchStatus.FINISHED ||
    !finalMatch.winner_team_id ||
    !finalMatch.winner_team_name
  ) {
    return null;
  }

  const championTeam = {
    team_id: finalMatch.winner_team_id,
    team_name: finalMatch.winner_team_name,
  };

  const explicitThirdPlaceWinner = resolveExplicitThirdPlaceWinner(competition);
  const inheritedThirdPlaceWinner = resolveChampionSemifinalLoser(competition, finalMatch);

  return {
    competition_id: competition.id,
    sport_id: competition.sport_id,
    sport_name: competition.sport_name,
    naipe: competition.naipe,
    division: competition.division,
    final_match_id: finalMatch.id,
    champion: championTeam,
    runner_up: resolveFinalRunnerUpTeam(finalMatch),
    third_place: explicitThirdPlaceWinner ?? inheritedThirdPlaceWinner,
  };
}

export function resolveChampionshipCompetitionPodiums(
  championshipBracketView: ChampionshipBracketView,
): ChampionshipCompetitionPodium[] {
  return championshipBracketView.competitions
    .map((competition) => resolveCompetitionPodium(competition))
    .filter((competitionPodium): competitionPodium is ChampionshipCompetitionPodium => competitionPodium != null);
}
