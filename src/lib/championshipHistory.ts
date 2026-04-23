import { resolveCompetitionPodium } from "@/lib/championshipPodium";
import type {
  ChampionshipBracketCompetition,
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

export function resolveChampionshipChampionHistory(
  championshipBracketSeasonViews: ChampionshipBracketSeasonView[],
): ChampionshipChampionYearGroup[] {
  return championshipBracketSeasonViews
    .map((championshipBracketSeasonView) => {
      const champions = championshipBracketSeasonView.championship_bracket_view.competitions
        .map((competition) => {
          const competitionPodium = resolveCompetitionPodium(competition);

          if (!competitionPodium) {
            return null;
          }

          return {
            year: String(championshipBracketSeasonView.season_year),
            sport_id: competition.sport_id,
            sport_name: competition.sport_name,
            naipe: competition.naipe,
            division: competition.division,
            champion_team_name: competitionPodium.champion.team_name,
            runner_up_team_name: competitionPodium.runner_up?.team_name ?? null,
            third_place_team_name: competitionPodium.third_place?.team.team_name ?? null,
            match_id: competitionPodium.final_match_id,
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
