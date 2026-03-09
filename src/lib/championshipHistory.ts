import { MatchStatus } from "@/lib/enums";
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
