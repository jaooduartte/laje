import { MATCH_NAIPE_LABELS } from "@/lib/championship";
import { ChampionshipSportNaipeMode, MatchNaipe, TeamDivision } from "@/lib/enums";
import type { ChampionshipSport, Team } from "@/lib/types";

export interface ChampionshipBracketWizardCompetitionOption {
  key: string;
  sport_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
}

export interface ChampionshipBracketWizardModalityCardTeam {
  team_id: string;
  team_name: string;
  division: TeamDivision | null;
  is_selected: boolean;
}

export interface ChampionshipBracketWizardModalityCard {
  sport_id: string;
  sport_name: string;
  teams: ChampionshipBracketWizardModalityCardTeam[];
  eligible_team_count: number;
  selected_team_count: number;
}

export interface ChampionshipBracketWizardNaipeTabTeam {
  team_id: string;
  team_name: string;
  division: TeamDivision | null;
  competition_key: string;
  is_selected: boolean;
}

export interface ChampionshipBracketWizardNaipeTab {
  naipe: MatchNaipe;
  label: string;
  teams: ChampionshipBracketWizardNaipeTabTeam[];
  eligible_team_count: number;
  selected_team_count: number;
}

export interface ChampionshipBracketWizardNaipeCard {
  sport_id: string;
  sport_name: string;
  tabs: ChampionshipBracketWizardNaipeTab[];
}

interface WizardSportDefinition {
  sport_id: string;
  sport_name: string;
  naipe_mode: ChampionshipSportNaipeMode;
}

interface ResolveWizardModalityCardsInput {
  championship_sports: ChampionshipSport[];
  selected_teams: Team[];
  selected_sport_ids_by_team_id: Record<string, string[]>;
  competition_options_by_team_id: Record<string, ChampionshipBracketWizardCompetitionOption[]>;
}

interface ResolveWizardNaipeCardsInput {
  championship_sports: ChampionshipSport[];
  selected_teams: Team[];
  selected_sport_ids_by_team_id: Record<string, string[]>;
  selected_competition_keys_by_team_id: Record<string, string[]>;
  competition_options_by_team_id: Record<string, ChampionshipBracketWizardCompetitionOption[]>;
}

const DEFAULT_COMPETITION_DIVISION_SORT_VALUE = "";
const DEFAULT_COMPETITION_NAIPE_SORT_VALUE = "";
const WIZARD_NAIPE_TAB_SORT_ORDER = [MatchNaipe.MASCULINO, MatchNaipe.FEMININO, MatchNaipe.MISTO] as const;

function compareAlphabetically(first_value: string, second_value: string): number {
  return first_value.localeCompare(second_value, "pt-BR", { sensitivity: "base" });
}

function resolveSupportedNaipesByMode(naipe_mode: ChampionshipSportNaipeMode): MatchNaipe[] {
  if (naipe_mode == ChampionshipSportNaipeMode.MISTO) {
    return [MatchNaipe.MISTO];
  }

  return [MatchNaipe.MASCULINO, MatchNaipe.FEMININO];
}

function resolveSortedWizardSportDefinitions(championship_sports: ChampionshipSport[]): WizardSportDefinition[] {
  const wizardSportDefinitionBySportId = new Map<string, WizardSportDefinition>();

  championship_sports.forEach((championshipSport) => {
    if (wizardSportDefinitionBySportId.has(championshipSport.sport_id)) {
      return;
    }

    wizardSportDefinitionBySportId.set(championshipSport.sport_id, {
      sport_id: championshipSport.sport_id,
      sport_name: championshipSport.sports?.name ?? "Modalidade",
      naipe_mode: championshipSport.naipe_mode,
    });
  });

  return [...wizardSportDefinitionBySportId.values()].sort((firstWizardSportDefinition, secondWizardSportDefinition) => {
    return compareAlphabetically(firstWizardSportDefinition.sport_name, secondWizardSportDefinition.sport_name);
  });
}

function resolveSortedTeams(selected_teams: Team[]): Team[] {
  return [...selected_teams].sort((firstTeam, secondTeam) => compareAlphabetically(firstTeam.name, secondTeam.name));
}

function resolveWizardNaipeTabOrder(first_naipe: MatchNaipe, second_naipe: MatchNaipe): number {
  return WIZARD_NAIPE_TAB_SORT_ORDER.indexOf(first_naipe) - WIZARD_NAIPE_TAB_SORT_ORDER.indexOf(second_naipe);
}

export function resolveChampionshipBracketWizardModalityCards({
  championship_sports,
  selected_teams,
  selected_sport_ids_by_team_id,
  competition_options_by_team_id,
}: ResolveWizardModalityCardsInput): ChampionshipBracketWizardModalityCard[] {
  const sortedTeams = resolveSortedTeams(selected_teams);

  return resolveSortedWizardSportDefinitions(championship_sports).map((wizardSportDefinition) => {
    const teams = sortedTeams
      .filter((team) => {
        return (competition_options_by_team_id[team.id] ?? []).some((competitionOption) => {
          return competitionOption.sport_id == wizardSportDefinition.sport_id;
        });
      })
      .map<ChampionshipBracketWizardModalityCardTeam>((team) => ({
        team_id: team.id,
        team_name: team.name,
        division: team.division,
        is_selected: (selected_sport_ids_by_team_id[team.id] ?? []).includes(wizardSportDefinition.sport_id),
      }));

    return {
      sport_id: wizardSportDefinition.sport_id,
      sport_name: wizardSportDefinition.sport_name,
      teams,
      eligible_team_count: teams.length,
      selected_team_count: teams.filter((team) => team.is_selected).length,
    };
  });
}

export function resolveChampionshipBracketWizardNaipeCards({
  championship_sports,
  selected_teams,
  selected_sport_ids_by_team_id,
  selected_competition_keys_by_team_id,
  competition_options_by_team_id,
}: ResolveWizardNaipeCardsInput): ChampionshipBracketWizardNaipeCard[] {
  const sortedTeams = resolveSortedTeams(selected_teams);
  const selectedSportIds = new Set(Object.values(selected_sport_ids_by_team_id).flat());

  return resolveSortedWizardSportDefinitions(championship_sports)
    .filter((wizardSportDefinition) => selectedSportIds.has(wizardSportDefinition.sport_id))
    .map((wizardSportDefinition) => {
      const tabs = resolveSupportedNaipesByMode(wizardSportDefinition.naipe_mode)
        .sort(resolveWizardNaipeTabOrder)
        .map<ChampionshipBracketWizardNaipeTab>((naipe) => {
          const teams = sortedTeams
            .filter((team) => (selected_sport_ids_by_team_id[team.id] ?? []).includes(wizardSportDefinition.sport_id))
            .map((team) => {
              const competitionOption = (competition_options_by_team_id[team.id] ?? []).find((currentCompetitionOption) => {
                return currentCompetitionOption.sport_id == wizardSportDefinition.sport_id && currentCompetitionOption.naipe == naipe;
              });

              if (!competitionOption) {
                return null;
              }

              return {
                team_id: team.id,
                team_name: team.name,
                division: team.division,
                competition_key: competitionOption.key,
                is_selected: (selected_competition_keys_by_team_id[team.id] ?? []).includes(competitionOption.key),
              } satisfies ChampionshipBracketWizardNaipeTabTeam;
            })
            .filter((team): team is ChampionshipBracketWizardNaipeTabTeam => team != null);

          return {
            naipe,
            label: MATCH_NAIPE_LABELS[naipe],
            teams,
            eligible_team_count: teams.length,
            selected_team_count: teams.filter((team) => team.is_selected).length,
          };
        });

      return {
        sport_id: wizardSportDefinition.sport_id,
        sport_name: wizardSportDefinition.sport_name,
        tabs,
      };
    });
}

export function resolveSortedChampionshipBracketCompetitionKeys(
  competition_keys: string[],
  competition_options_by_key: Map<string, ChampionshipBracketWizardCompetitionOption>,
): string[] {
  return [...competition_keys].sort((firstCompetitionKey, secondCompetitionKey) => {
    const firstCompetitionOption = competition_options_by_key.get(firstCompetitionKey);
    const secondCompetitionOption = competition_options_by_key.get(secondCompetitionKey);

    if (!firstCompetitionOption || !secondCompetitionOption) {
      return compareAlphabetically(firstCompetitionKey, secondCompetitionKey);
    }

    const sportNameComparison = compareAlphabetically(firstCompetitionOption.sport_name, secondCompetitionOption.sport_name);

    if (sportNameComparison != 0) {
      return sportNameComparison;
    }

    const firstNaipeLabel = MATCH_NAIPE_LABELS[firstCompetitionOption.naipe] ?? DEFAULT_COMPETITION_NAIPE_SORT_VALUE;
    const secondNaipeLabel = MATCH_NAIPE_LABELS[secondCompetitionOption.naipe] ?? DEFAULT_COMPETITION_NAIPE_SORT_VALUE;
    const naipeLabelComparison = compareAlphabetically(firstNaipeLabel, secondNaipeLabel);

    if (naipeLabelComparison != 0) {
      return naipeLabelComparison;
    }

    return compareAlphabetically(
      firstCompetitionOption.division ?? DEFAULT_COMPETITION_DIVISION_SORT_VALUE,
      secondCompetitionOption.division ?? DEFAULT_COMPETITION_DIVISION_SORT_VALUE,
    );
  });
}
