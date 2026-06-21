import { CHAMPIONSHIP_BRACKET_DEFAULT_QUALIFIERS_PER_GROUP } from "@/domain/championship-brackets/championshipBracket.constants";
import {
  sanitizeGroupAssignments,
  sanitizeGroupOrderedTeamIdsByGroupNumber,
} from "@/domain/championship-brackets/championshipBracketGroupEditor";
import { resolveDefaultCompetitionKnockoutPairingMode } from "@/domain/championship-brackets/championshipBracketPairing";
import type {
  ChampionshipBracketCompetitionConfigDraft,
  ChampionshipBracketWizardDraftFormValues,
} from "@/domain/championship-brackets/championshipBracket.types";
import type { ChampionshipSport, Team } from "@/lib/types";
import { ChampionshipSportNaipeMode, MatchNaipe, TeamDivision } from "@/lib/enums";

const COMPETITION_DIVISION_WITHOUT_DIVISION = "WITHOUT_DIVISION";

interface SanitizeChampionshipBracketWizardDraftOptions {
  draftFormValues: ChampionshipBracketWizardDraftFormValues;
  teams: Team[];
  championshipSports: ChampionshipSport[];
  usesDivisions: boolean;
}

interface WizardCompetitionOption {
  key: string;
  sport_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
}

function resolveCompetitionKey(
  sportId: string,
  naipe: MatchNaipe,
  division: TeamDivision | null,
): string {
  return [sportId, naipe, division ?? COMPETITION_DIVISION_WITHOUT_DIVISION].join("::");
}

function resolveSupportedNaipesByMode(naipeMode: ChampionshipSportNaipeMode): MatchNaipe[] {
  if (naipeMode == ChampionshipSportNaipeMode.MISTO) {
    return [MatchNaipe.MISTO];
  }

  return [MatchNaipe.MASCULINO, MatchNaipe.FEMININO];
}

function resolveDefaultCompetitionConfig(
  participantCount: number,
  competitionOption: WizardCompetitionOption | null,
): ChampionshipBracketCompetitionConfigDraft {
  return {
    groups_count: Math.max(1, Math.min(2, participantCount)),
    qualifiers_per_group: CHAMPIONSHIP_BRACKET_DEFAULT_QUALIFIERS_PER_GROUP,
    should_complete_knockout_with_best_second_placed_teams: true,
    knockout_pairing_mode: competitionOption
      ? resolveDefaultCompetitionKnockoutPairingMode({
          sport_name: competitionOption.sport_name,
          naipe: competitionOption.naipe,
          division: competitionOption.division,
        })
      : "LINEAR",
  };
}

function resolveSelectableTeams(teams: Team[]) {
  return teams.filter((team) => {
    return (
      team.division == TeamDivision.DIVISAO_PRINCIPAL ||
      team.division == TeamDivision.DIVISAO_ACESSO
    );
  });
}

function resolveCompetitionOptionsByTeamId({
  teams,
  championshipSports,
  usesDivisions,
}: {
  teams: Team[];
  championshipSports: ChampionshipSport[];
  usesDivisions: boolean;
}) {
  return teams.reduce<Record<string, WizardCompetitionOption[]>>((carry, team) => {
    const teamDivision = usesDivisions ? team.division : null;

    if (usesDivisions && teamDivision == null) {
      carry[team.id] = [];
      return carry;
    }

    carry[team.id] = championshipSports.flatMap((championshipSport) => {
      const sportName = championshipSport.sports?.name ?? "Modalidade";

      return resolveSupportedNaipesByMode(championshipSport.naipe_mode).map((naipe) => ({
        key: resolveCompetitionKey(championshipSport.sport_id, naipe, teamDivision),
        sport_id: championshipSport.sport_id,
        sport_name: sportName,
        naipe,
        division: teamDivision,
      }));
    });

    return carry;
  }, {});
}

export function sanitizeChampionshipBracketWizardDraft({
  draftFormValues,
  teams,
  championshipSports,
  usesDivisions,
}: SanitizeChampionshipBracketWizardDraftOptions): ChampionshipBracketWizardDraftFormValues {
  const selectableTeamIds = new Set(resolveSelectableTeams(teams).map((team) => team.id));
  const nextSelectedTeamIds = draftFormValues.selected_team_ids.filter((teamId) => selectableTeamIds.has(teamId));
  const selectedTeamIdSet = new Set(nextSelectedTeamIds);
  const selectedTeams = teams.filter((team) => selectedTeamIdSet.has(team.id));
  const competitionOptionsByTeamId = resolveCompetitionOptionsByTeamId({
    teams: selectedTeams,
    championshipSports,
    usesDivisions,
  });

  const nextSelectedSportIdsByTeamId = Object.entries(draftFormValues.selected_sport_ids_by_team_id).reduce<
    Record<string, string[]>
  >((carry, [teamId, selectedSportIds]) => {
    if (!selectedTeamIdSet.has(teamId)) {
      return carry;
    }

    const validSportIds = new Set((competitionOptionsByTeamId[teamId] ?? []).map((competitionOption) => competitionOption.sport_id));
    const nextSelectedSportIds = [...new Set(selectedSportIds.filter((sportId) => validSportIds.has(sportId)))];

    if (nextSelectedSportIds.length > 0) {
      carry[teamId] = nextSelectedSportIds;
    }

    return carry;
  }, {});

  const nextSelectedCompetitionKeysByTeamId = Object.entries(draftFormValues.selected_competition_keys_by_team_id).reduce<
    Record<string, string[]>
  >((carry, [teamId, selectedCompetitionKeys]) => {
    if (!selectedTeamIdSet.has(teamId)) {
      return carry;
    }

    const validCompetitionOptions = competitionOptionsByTeamId[teamId] ?? [];
    const validCompetitionKeys = new Set(validCompetitionOptions.map((competitionOption) => competitionOption.key));
    const validSportIds = new Set(nextSelectedSportIdsByTeamId[teamId] ?? []);
    const nextSelectedCompetitionKeys = [...new Set(
      selectedCompetitionKeys.filter((competitionKey) => {
        if (!validCompetitionKeys.has(competitionKey)) {
          return false;
        }

        const competitionOption = validCompetitionOptions.find((currentCompetitionOption) => {
          return currentCompetitionOption.key == competitionKey;
        });

        return competitionOption ? validSportIds.has(competitionOption.sport_id) : false;
      }),
    )];

    if (nextSelectedCompetitionKeys.length > 0) {
      carry[teamId] = nextSelectedCompetitionKeys;
    }

    return carry;
  }, {});

  const teamIdsByCompetitionKey = Object.entries(nextSelectedCompetitionKeysByTeamId).reduce<Record<string, string[]>>(
    (carry, [teamId, competitionKeys]) => {
      competitionKeys.forEach((competitionKey) => {
        if (!carry[competitionKey]) {
          carry[competitionKey] = [];
        }

        carry[competitionKey].push(teamId);
      });

      return carry;
    },
    {},
  );

  const activeCompetitionKeys = Object.keys(teamIdsByCompetitionKey).filter((competitionKey) => {
    return (teamIdsByCompetitionKey[competitionKey] ?? []).length >= 2;
  });
  const competitionOptionsByKey = Object.values(competitionOptionsByTeamId).reduce<
    Record<string, WizardCompetitionOption>
  >((carry, competitionOptions) => {
    competitionOptions.forEach((competitionOption) => {
      carry[competitionOption.key] = competitionOption;
    });

    return carry;
  }, {});

  const nextCompetitionConfigByKey = activeCompetitionKeys.reduce<Record<string, ChampionshipBracketCompetitionConfigDraft>>(
    (carry, competitionKey) => {
      const participantCount = teamIdsByCompetitionKey[competitionKey]?.length ?? 2;
      const competitionOption = competitionOptionsByKey[competitionKey] ?? null;
      carry[competitionKey] =
        draftFormValues.competition_config_by_key[competitionKey] ??
        resolveDefaultCompetitionConfig(participantCount, competitionOption);
      return carry;
    },
    {},
  );

  const nextGroupAssignmentsByCompetitionKey = activeCompetitionKeys.reduce<Record<string, Record<string, number>>>(
    (carry, competitionKey) => {
      const participantTeamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
      const groupsCount = nextCompetitionConfigByKey[competitionKey]?.groups_count ?? 1;
      carry[competitionKey] = sanitizeGroupAssignments({
        participant_team_ids: participantTeamIds,
        group_assignments: draftFormValues.group_assignments_by_competition_key[competitionKey] ?? {},
        groups_count: groupsCount,
      });
      return carry;
    },
    {},
  );

  const nextGroupOrderByCompetitionKey = activeCompetitionKeys.reduce<
    Record<string, Record<string, string[]>>
  >((carry, competitionKey) => {
    const participantTeamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
    const groupsCount = nextCompetitionConfigByKey[competitionKey]?.groups_count ?? 1;
    const nextGroupOrder = sanitizeGroupOrderedTeamIdsByGroupNumber({
      participant_team_ids: participantTeamIds,
      group_assignments: nextGroupAssignmentsByCompetitionKey[competitionKey] ?? {},
      groups_count: groupsCount,
      ordered_team_ids_by_group_number: draftFormValues.group_order_by_competition_key[competitionKey] ?? {},
    });

    if (Object.keys(nextGroupOrder).length > 0) {
      carry[competitionKey] = nextGroupOrder;
    }

    return carry;
  }, {});

  return {
    ...draftFormValues,
    selected_team_ids: nextSelectedTeamIds,
    selected_sport_ids_by_team_id: nextSelectedSportIdsByTeamId,
    selected_competition_keys_by_team_id: nextSelectedCompetitionKeysByTeamId,
    competition_config_by_key: nextCompetitionConfigByKey,
    group_assignments_by_competition_key: nextGroupAssignmentsByCompetitionKey,
    group_order_by_competition_key: nextGroupOrderByCompetitionKey,
  };
}
