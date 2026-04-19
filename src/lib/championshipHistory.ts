import { BracketThirdPlaceMode, MatchStatus } from "@/lib/enums";
import type {
  ChampionshipBracketCompetition,
  ChampionshipBracketKnockoutMatch,
  ChampionshipBracketSeasonView,
} from "@/lib/types";

export interface ChampionshipChampionEntry {
  year: string;
  sport_id: string;
  sport_name: string;
  naipe: ChampionshipBracketCompetition["naipe"];
  division: ChampionshipBracketCompetition["division"];
  champion_team_name: string;
  runner_up_team_name: string | null;
  third_place_team_name: string | null;
  match_id: string;
}

export interface ChampionshipChampionYearGroup {
  year: string;
  champions: ChampionshipChampionEntry[];
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

function resolveFinalRunnerUpTeamName(finalMatch: ChampionshipBracketKnockoutMatch): string | null {
  if (!finalMatch.winner_team_name) {
    return null;
  }

  if (finalMatch.winner_team_name == finalMatch.home_team_name) {
    return finalMatch.away_team_name ?? null;
  }

  if (finalMatch.winner_team_name == finalMatch.away_team_name) {
    return finalMatch.home_team_name ?? null;
  }

  return null;
}

function resolveMatchLoserTeamName(match: ChampionshipBracketKnockoutMatch): string | null {
  if (!match.winner_team_name) {
    return null;
  }

  if (match.winner_team_name == match.home_team_name) {
    return match.away_team_name ?? null;
  }

  if (match.winner_team_name == match.away_team_name) {
    return match.home_team_name ?? null;
  }

  return null;
}

function resolveExplicitThirdPlaceTeamName(competition: ChampionshipBracketCompetition): string | null {
  const thirdPlaceMatch = competition.knockout_matches.find((knockoutMatch) => {
    return knockoutMatch.is_third_place && knockoutMatch.status == MatchStatus.FINISHED && !!knockoutMatch.winner_team_name;
  });

  return thirdPlaceMatch?.winner_team_name ?? null;
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

function resolveChampionSemifinalLoserThirdPlaceTeamName(
  competition: ChampionshipBracketCompetition,
  finalMatch: ChampionshipBracketKnockoutMatch,
): string | null {
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

  return championSemifinal ? resolveMatchLoserTeamName(championSemifinal) : null;
}

function resolveThirdPlaceTeamName(
  competition: ChampionshipBracketCompetition,
  finalMatch: ChampionshipBracketKnockoutMatch,
): string | null {
  const explicitThirdPlaceTeamName = resolveExplicitThirdPlaceTeamName(competition);

  if (explicitThirdPlaceTeamName) {
    return explicitThirdPlaceTeamName;
  }

  // Quando não existe partida explícita de 3º lugar, herdamos o perdedor da semifinal do campeão.
  // Isso cobre tanto o modo configurado quanto edições legadas que não salvaram o modo corretamente.
  if (
    competition.third_place_mode == BracketThirdPlaceMode.CHAMPION_SEMIFINAL_LOSER ||
    competition.third_place_mode == BracketThirdPlaceMode.NONE ||
    competition.third_place_mode == BracketThirdPlaceMode.MATCH
  ) {
    return resolveChampionSemifinalLoserThirdPlaceTeamName(competition, finalMatch);
  }

  return null;
}

export function resolveChampionshipChampionHistory(
  championshipBracketSeasonViews: ChampionshipBracketSeasonView[],
): ChampionshipChampionYearGroup[] {
  return championshipBracketSeasonViews
    .map((championshipBracketSeasonView) => {
      const champions = championshipBracketSeasonView.championship_bracket_view.competitions
        .map((competition) => {
          const finalMatch = resolveCompetitionFinalMatch(competition);

          if (!finalMatch || finalMatch.status != MatchStatus.FINISHED || !finalMatch.winner_team_name) {
            return null;
          }

          return {
            year: String(championshipBracketSeasonView.season_year),
            sport_id: competition.sport_id,
            sport_name: competition.sport_name,
            naipe: competition.naipe,
            division: competition.division,
            champion_team_name: finalMatch.winner_team_name,
            runner_up_team_name: resolveFinalRunnerUpTeamName(finalMatch),
            third_place_team_name: resolveThirdPlaceTeamName(competition, finalMatch),
            match_id: finalMatch.match_id ?? finalMatch.id,
          };
        })
        .filter((championshipChampion): championshipChampion is ChampionshipChampionEntry => championshipChampion != null)
        .sort((firstChampion, secondChampion) => {
          if (firstChampion.sport_name != secondChampion.sport_name) {
            return firstChampion.sport_name.localeCompare(secondChampion.sport_name);
          }

          if (firstChampion.naipe != secondChampion.naipe) {
            return firstChampion.naipe.localeCompare(secondChampion.naipe);
          }

          return (firstChampion.division ?? "").localeCompare(secondChampion.division ?? "");
        });

      if (champions.length == 0) {
        return null;
      }

      return {
        year: String(championshipBracketSeasonView.season_year),
        champions,
      };
    })
    .filter(
      (championshipChampionYearGroup): championshipChampionYearGroup is ChampionshipChampionYearGroup =>
        championshipChampionYearGroup != null,
    )
    .sort((firstYearGroup, secondYearGroup) => Number(secondYearGroup.year) - Number(firstYearGroup.year));
}
