import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Championship, ChampionshipSport, Team } from "@/lib/types";
import {
  BracketThirdPlaceMode,
  ChampionshipSportNaipeMode,
  MatchNaipe,
  TeamDivision,
} from "@/lib/enums";
import {
  MATCH_NAIPE_LABELS,
  TEAM_DIVISION_BADGE_TONES,
  TEAM_DIVISION_LABELS,
} from "@/lib/championship";
import { resolveRandomUuid } from "@/lib/random";
import {
  CHAMPIONSHIP_BRACKET_DEFAULT_QUALIFIERS_PER_GROUP,
} from "@/domain/championship-brackets/championshipBracket.constants";
import { ChampionshipBracketSetupDTO } from "@/domain/championship-brackets/ChampionshipBracketSetupDTO";
import {
  clearChampionshipBracketWizardDraft,
  fetchChampionshipBracketWizardDraft,
  saveChampionshipBracketWizardDraft,
} from "@/domain/championship-brackets/championshipBracketDraft.repository";
import { generateChampionshipBracketGroups } from "@/domain/championship-brackets/championshipBracket.repository";
import type {
  ChampionshipBracketCompetitionInput,
  ChampionshipBracketLocationInput,
  ChampionshipBracketParticipantInput,
  ChampionshipBracketScheduleDayInput,
  ChampionshipBracketWizardDraftFormValues,
} from "@/domain/championship-brackets/championshipBracket.types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AppBadge } from "@/components/ui/app-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedChampionship: Championship;
  teams: Team[];
  championshipSports: ChampionshipSport[];
  onGenerated: (bracketEditionId: string) => Promise<void>;
}

interface CompetitionOption {
  key: string;
  sport_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
}

interface CompetitionConfig {
  groups_count: number;
  qualifiers_per_group: number;
}

interface ScheduleCourtFormValue {
  id: string;
  name: string;
  position: number;
  sport_ids: string[];
}

interface ScheduleLocationFormValue {
  id: string;
  name: string;
  position: number;
  courts: ScheduleCourtFormValue[];
}

interface ScheduleDayFormValue {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_start_time: string;
  break_end_time: string;
  locations: ScheduleLocationFormValue[];
}

interface SaveErrorBannerData {
  title: string;
  message: string;
  suggestion: string;
}

const COMPETITION_DIVISION_WITHOUT_DIVISION = "WITHOUT_DIVISION";

const WIZARD_STEP_LABELS = [
  "Participantes",
  "Modalidades",
  "Naipes",
  "Configuração de Chaves",
  "Distribuição Manual",
  "Agenda",
  "Revisão",
] as const;

const SQUARE_CHECKBOX_CLASS_NAME = "h-4 w-4 rounded-[3px]";
const QUALIFIERS_PER_GROUP_OPTIONS = [1, 2] as const;

function resolveCompetitionKey(sport_id: string, naipe: MatchNaipe, division: TeamDivision | null): string {
  return [sport_id, naipe, division ?? COMPETITION_DIVISION_WITHOUT_DIVISION].join("::");
}

function parseCompetitionKey(competition_key: string): {
  sport_id: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
} {
  const [sport_id, naipe, division] = competition_key.split("::");

  return {
    sport_id,
    naipe: naipe as MatchNaipe,
    division: division == COMPETITION_DIVISION_WITHOUT_DIVISION ? null : (division as TeamDivision),
  };
}

function resolveSupportedNaipesByMode(naipe_mode: ChampionshipSportNaipeMode): MatchNaipe[] {
  if (naipe_mode == ChampionshipSportNaipeMode.MISTO) {
    return [MatchNaipe.MISTO];
  }

  return [MatchNaipe.MASCULINO, MatchNaipe.FEMININO];
}

function resolveInitialScheduleDay(): ScheduleDayFormValue {
  return {
    id: resolveRandomUuid(),
    date: "",
    start_time: "08:00",
    end_time: "18:00",
    break_start_time: "",
    break_end_time: "",
    locations: [
      {
        id: resolveRandomUuid(),
        name: "",
        position: 1,
        courts: [
          {
            id: resolveRandomUuid(),
            name: "",
            position: 1,
            sport_ids: [],
          },
        ],
      },
    ],
  };
}

function resolveReplicatedScheduleDay(previousScheduleDay: ScheduleDayFormValue): ScheduleDayFormValue {
  return {
    id: resolveRandomUuid(),
    date: "",
    start_time: previousScheduleDay.start_time,
    end_time: previousScheduleDay.end_time,
    break_start_time: previousScheduleDay.break_start_time,
    break_end_time: previousScheduleDay.break_end_time,
    locations: previousScheduleDay.locations.map((location, locationIndex) => ({
      id: resolveRandomUuid(),
      name: location.name,
      position: locationIndex + 1,
      courts: location.courts.map((court, courtIndex) => ({
        id: resolveRandomUuid(),
        name: court.name,
        position: courtIndex + 1,
        sport_ids: [...court.sport_ids],
      })),
    })),
  };
}

function resolveScheduleCourtClone(schedule_court: ScheduleCourtFormValue): ScheduleCourtFormValue {
  return {
    id: schedule_court.id,
    name: schedule_court.name,
    position: schedule_court.position,
    sport_ids: [...schedule_court.sport_ids],
  };
}

function resolveScheduleLocationClone(schedule_location: ScheduleLocationFormValue): ScheduleLocationFormValue {
  return {
    id: schedule_location.id,
    name: schedule_location.name,
    position: schedule_location.position,
    courts: schedule_location.courts.map((schedule_court) => resolveScheduleCourtClone(schedule_court)),
  };
}

function resolveScheduleDayClone(schedule_day: ScheduleDayFormValue): ScheduleDayFormValue {
  return {
    id: schedule_day.id,
    date: schedule_day.date,
    start_time: schedule_day.start_time,
    end_time: schedule_day.end_time,
    break_start_time: schedule_day.break_start_time,
    break_end_time: schedule_day.break_end_time,
    locations: schedule_day.locations.map((schedule_location) => resolveScheduleLocationClone(schedule_location)),
  };
}

function resolveInitialWizardDraftFormValues(): ChampionshipBracketWizardDraftFormValues {
  return {
    current_step_index: 0,
    selected_team_ids: [],
    selected_sport_ids_by_team_id: {},
    selected_competition_keys_by_team_id: {},
    should_apply_modalities_to_all_teams: true,
    should_apply_naipes_to_all_teams: true,
    should_apply_group_selection_to_all_competitions: false,
    should_replicate_previous_schedule_day: false,
    competition_config_by_key: {},
    group_assignments_by_competition_key: {},
    schedule_days: [resolveInitialScheduleDay()],
  };
}

function resolveDefaultCompetitionConfig(team_count: number): CompetitionConfig {
  const safe_group_count = Math.max(1, Math.min(2, team_count));

  return {
    groups_count: safe_group_count,
    qualifiers_per_group: CHAMPIONSHIP_BRACKET_DEFAULT_QUALIFIERS_PER_GROUP,
  };
}

function resolveTextHashValue(text_value: string): number {
  let hash_value = 0;

  for (let character_index = 0; character_index < text_value.length; character_index += 1) {
    hash_value = (hash_value * 31 + text_value.charCodeAt(character_index)) | 0;
  }

  return Math.abs(hash_value);
}

function resolveShuffledTeamIds(team_ids: string[], competition_key: string): string[] {
  return [...team_ids].sort((left_team_id, right_team_id) => {
    const left_hash_value = resolveTextHashValue(`${competition_key}::${left_team_id}`);
    const right_hash_value = resolveTextHashValue(`${competition_key}::${right_team_id}`);

    if (left_hash_value == right_hash_value) {
      return left_team_id.localeCompare(right_team_id);
    }

    return left_hash_value - right_hash_value;
  });
}

function resolveBalancedAssignments(team_ids: string[], groups_count: number, competition_key: string): Record<string, number> {
  const next_assignments: Record<string, number> = {};
  const shuffled_team_ids = resolveShuffledTeamIds(team_ids, competition_key);

  shuffled_team_ids.forEach((team_id, team_index) => {
    next_assignments[team_id] = (team_index % groups_count) + 1;
  });

  return next_assignments;
}

function resolveDatePartAsString(date_value: Date): string {
  const year_value = date_value.getFullYear();
  const month_value = (date_value.getMonth() + 1).toString().padStart(2, "0");
  const day_value = date_value.getDate().toString().padStart(2, "0");

  return `${year_value}-${month_value}-${day_value}`;
}

function resolveTimePartAsString(date_value: Date): string {
  const hour_value = date_value.getHours().toString().padStart(2, "0");
  const minute_value = date_value.getMinutes().toString().padStart(2, "0");

  return `${hour_value}:${minute_value}`;
}

function resolveBrazilianDateString(date_value: string): string {
  if (!date_value) {
    return "--/--/----";
  }

  const [year_value, month_value, day_value] = date_value.split("-");

  if (!year_value || !month_value || !day_value) {
    return date_value;
  }

  return `${day_value}/${month_value}/${year_value}`;
}

function resolveScheduleDayDateTimeValue(schedule_day: ScheduleDayFormValue, time_value: string): Date | null {
  if (!schedule_day.date || !time_value) {
    return null;
  }

  const [year_value, month_value, day_value] = schedule_day.date.split("-").map(Number);
  const [hour_value, minute_value] = time_value.split(":").map(Number);

  if (!year_value || !month_value || !day_value || Number.isNaN(hour_value) || Number.isNaN(minute_value)) {
    return null;
  }

  const resolved_date_time = new Date(year_value, month_value - 1, day_value, hour_value, minute_value, 0, 0);

  if (Number.isNaN(resolved_date_time.getTime())) {
    return null;
  }

  return resolved_date_time;
}

function resolveTimeValueToMinutes(timeValue: string): number | null {
  if (!timeValue) {
    return null;
  }

  const [hourValue, minuteValue] = timeValue.split(":").map(Number);

  if (Number.isNaN(hourValue) || Number.isNaN(minuteValue)) {
    return null;
  }

  if (hourValue < 0 || hourValue > 23 || minuteValue < 0 || minuteValue > 59) {
    return null;
  }

  return (hourValue * 60) + minuteValue;
}

export function AdminChampionshipBracketWizardModal({
  open,
  onOpenChange,
  selectedChampionship,
  teams,
  championshipSports,
  onGenerated,
}: Props) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [selectedSportIdsByTeamId, setSelectedSportIdsByTeamId] = useState<Record<string, string[]>>({});
  const [selectedCompetitionKeysByTeamId, setSelectedCompetitionKeysByTeamId] = useState<Record<string, string[]>>({});
  const [shouldApplyModalitiesToAllTeams, setShouldApplyModalitiesToAllTeams] = useState(true);
  const [shouldApplyNaipesToAllTeams, setShouldApplyNaipesToAllTeams] = useState(true);
  const [shouldApplyGroupSelectionToAllCompetitions, setShouldApplyGroupSelectionToAllCompetitions] = useState(false);
  const [shouldReplicatePreviousScheduleDay, setShouldReplicatePreviousScheduleDay] = useState(false);
  const [competitionConfigByKey, setCompetitionConfigByKey] = useState<Record<string, CompetitionConfig>>({});
  const [groupAssignmentsByCompetitionKey, setGroupAssignmentsByCompetitionKey] = useState<Record<string, Record<string, number>>>({});
  const [scheduleDays, setScheduleDays] = useState<ScheduleDayFormValue[]>([resolveInitialScheduleDay()]);
  const [saving, setSaving] = useState(false);
  const [saveErrorBannerData, setSaveErrorBannerData] = useState<SaveErrorBannerData | null>(null);
  const saveErrorBannerReference = useRef<HTMLDivElement | null>(null);

  const applyWizardDraft = useCallback((draft_form_values: ChampionshipBracketWizardDraftFormValues) => {
    setCurrentStepIndex(Math.max(0, Math.min(draft_form_values.current_step_index, WIZARD_STEP_LABELS.length - 1)));
    setSelectedTeamIds(draft_form_values.selected_team_ids);
    setSelectedSportIdsByTeamId(draft_form_values.selected_sport_ids_by_team_id);
    setSelectedCompetitionKeysByTeamId(draft_form_values.selected_competition_keys_by_team_id);
    setShouldApplyModalitiesToAllTeams(draft_form_values.should_apply_modalities_to_all_teams);
    setShouldApplyNaipesToAllTeams(draft_form_values.should_apply_naipes_to_all_teams);
    setShouldApplyGroupSelectionToAllCompetitions(draft_form_values.should_apply_group_selection_to_all_competitions);
    setShouldReplicatePreviousScheduleDay(draft_form_values.should_replicate_previous_schedule_day);
    setCompetitionConfigByKey(draft_form_values.competition_config_by_key);
    setGroupAssignmentsByCompetitionKey(draft_form_values.group_assignments_by_competition_key);
    setScheduleDays(
      draft_form_values.schedule_days.length > 0
        ? draft_form_values.schedule_days.map((schedule_day) => resolveScheduleDayClone(schedule_day))
        : [resolveInitialScheduleDay()],
    );
    setSaveErrorBannerData(null);
  }, []);

  const resetWizardState = useCallback(() => {
    applyWizardDraft(resolveInitialWizardDraftFormValues());
  }, [applyWizardDraft]);

  const resolveWizardDraftFormValues = useCallback((): ChampionshipBracketWizardDraftFormValues => {
    return {
      current_step_index: currentStepIndex,
      selected_team_ids: [...selectedTeamIds],
      selected_sport_ids_by_team_id: Object.entries(selectedSportIdsByTeamId).reduce<Record<string, string[]>>(
        (carry, [team_id, selected_sport_ids]) => {
          carry[team_id] = [...selected_sport_ids];
          return carry;
        },
        {},
      ),
      selected_competition_keys_by_team_id: Object.entries(selectedCompetitionKeysByTeamId).reduce<Record<string, string[]>>(
        (carry, [team_id, selected_competition_keys]) => {
          carry[team_id] = [...selected_competition_keys];
          return carry;
        },
        {},
      ),
      should_apply_modalities_to_all_teams: shouldApplyModalitiesToAllTeams,
      should_apply_naipes_to_all_teams: shouldApplyNaipesToAllTeams,
      should_apply_group_selection_to_all_competitions: shouldApplyGroupSelectionToAllCompetitions,
      should_replicate_previous_schedule_day: shouldReplicatePreviousScheduleDay,
      competition_config_by_key: Object.entries(competitionConfigByKey).reduce<Record<string, CompetitionConfig>>(
        (carry, [competition_key, competition_config]) => {
          carry[competition_key] = {
            groups_count: competition_config.groups_count,
            qualifiers_per_group: competition_config.qualifiers_per_group,
          };
          return carry;
        },
        {},
      ),
      group_assignments_by_competition_key: Object.entries(groupAssignmentsByCompetitionKey).reduce<Record<string, Record<string, number>>>(
        (carry, [competition_key, team_group_map]) => {
          carry[competition_key] = { ...team_group_map };
          return carry;
        },
        {},
      ),
      schedule_days: scheduleDays.map((schedule_day) => resolveScheduleDayClone(schedule_day)),
    };
  }, [
    competitionConfigByKey,
    currentStepIndex,
    groupAssignmentsByCompetitionKey,
    scheduleDays,
    selectedCompetitionKeysByTeamId,
    selectedSportIdsByTeamId,
    selectedTeamIds,
    shouldApplyGroupSelectionToAllCompetitions,
    shouldApplyModalitiesToAllTeams,
    shouldApplyNaipesToAllTeams,
    shouldReplicatePreviousScheduleDay,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const stored_draft = fetchChampionshipBracketWizardDraft(selectedChampionship.id);

    if (stored_draft) {
      applyWizardDraft(stored_draft);
      toast.success("Rascunho restaurado com sucesso.");
      return;
    }

    resetWizardState();
  }, [applyWizardDraft, open, resetWizardState, selectedChampionship.id]);

  useEffect(() => {
    if (!saveErrorBannerData) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;

      if (!target) {
        return;
      }

      if (saveErrorBannerReference.current?.contains(target)) {
        return;
      }

      setSaveErrorBannerData(null);
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [saveErrorBannerData]);

  const resolveSaveErrorSuggestion = useCallback((errorMessage: string): string => {
    if (errorMessage.includes("Sugestão:")) {
      const suggestionParts = errorMessage.split("Sugestão:");
      const resolvedSuggestion = suggestionParts[suggestionParts.length - 1]?.trim();

      if (resolvedSuggestion) {
        return resolvedSuggestion;
      }
    }

    if (
      errorMessage.includes("Tempo total necessário nesta modalidade:") ||
      errorMessage.includes("Tempo total necessário para este esporte") ||
      errorMessage.includes("Conflito de encaixe na modalidade")
    ) {
      return "";
    }

    if (errorMessage.includes("Não há horários disponíveis")) {
      return "Sugestão: aumente os horários da agenda ou reduza a quantidade de jogos/chaves desta edição.";
    }

    return "Sugestão: revise as configurações das etapas anteriores e tente novamente.";
  }, []);

  const selectableTeams = useMemo(() => {
    return teams.filter((team) => {
      return team.division == TeamDivision.DIVISAO_PRINCIPAL || team.division == TeamDivision.DIVISAO_ACESSO;
    });
  }, [teams]);

  const selectableTeamIds = useMemo(() => {
    return selectableTeams.map((team) => team.id);
  }, [selectableTeams]);

  const selectedTeamIdSet = useMemo(() => {
    return new Set(selectedTeamIds);
  }, [selectedTeamIds]);

  const selectedTeams = useMemo(() => {
    return selectableTeams.filter((team) => selectedTeamIdSet.has(team.id));
  }, [selectableTeams, selectedTeamIdSet]);

  const teamById = useMemo(() => {
    return teams.reduce<Record<string, Team>>((carry, team) => {
      carry[team.id] = team;
      return carry;
    }, {});
  }, [teams]);

  const teamNameById = useMemo(() => {
    return teams.reduce<Record<string, string>>((carry, team) => {
      carry[team.id] = team.name;
      return carry;
    }, {});
  }, [teams]);

  const selectedSportIdSetByTeamId = useMemo(() => {
    return Object.entries(selectedSportIdsByTeamId).reduce<Record<string, Set<string>>>((carry, [team_id, selectedSportIds]) => {
      carry[team_id] = new Set(selectedSportIds);
      return carry;
    }, {});
  }, [selectedSportIdsByTeamId]);

  const selectedCompetitionKeySetByTeamId = useMemo(() => {
    return Object.entries(selectedCompetitionKeysByTeamId).reduce<Record<string, Set<string>>>(
      (carry, [team_id, selectedCompetitionKeys]) => {
        carry[team_id] = new Set(selectedCompetitionKeys);
        return carry;
      },
      {},
    );
  }, [selectedCompetitionKeysByTeamId]);

  useEffect(() => {
    const selectableTeamIdSet = new Set(selectableTeamIds);

    setSelectedTeamIds((currentSelectedTeamIds) => {
      const nextSelectedTeamIds = currentSelectedTeamIds.filter((team_id) => selectableTeamIdSet.has(team_id));

      if (nextSelectedTeamIds.length == currentSelectedTeamIds.length) {
        return currentSelectedTeamIds;
      }

      return nextSelectedTeamIds;
    });

    setSelectedSportIdsByTeamId((currentSelectedSportIdsByTeamId) => {
      const nextSelectedSportIdsByTeamId = Object.entries(currentSelectedSportIdsByTeamId).reduce<Record<string, string[]>>(
        (carry, [team_id, selectedSportIds]) => {
          if (!selectableTeamIdSet.has(team_id)) {
            return carry;
          }

          carry[team_id] = selectedSportIds;
          return carry;
        },
        {},
      );

      if (Object.keys(nextSelectedSportIdsByTeamId).length == Object.keys(currentSelectedSportIdsByTeamId).length) {
        return currentSelectedSportIdsByTeamId;
      }

      return nextSelectedSportIdsByTeamId;
    });

    setSelectedCompetitionKeysByTeamId((currentSelectedCompetitionKeysByTeamId) => {
      const nextSelectedCompetitionKeysByTeamId = Object.entries(currentSelectedCompetitionKeysByTeamId).reduce<
        Record<string, string[]>
      >((carry, [team_id, selectedCompetitionKeys]) => {
        if (!selectableTeamIdSet.has(team_id)) {
          return carry;
        }

        carry[team_id] = selectedCompetitionKeys;
        return carry;
      }, {});

      if (Object.keys(nextSelectedCompetitionKeysByTeamId).length == Object.keys(currentSelectedCompetitionKeysByTeamId).length) {
        return currentSelectedCompetitionKeysByTeamId;
      }

      return nextSelectedCompetitionKeysByTeamId;
    });
  }, [selectableTeamIds]);

  const competitionOptionsByTeamId = useMemo(() => {
    const nextCompetitionOptionsByTeamId: Record<string, CompetitionOption[]> = {};

    selectedTeams.forEach((team) => {
      const teamDivision = selectedChampionship.uses_divisions ? team.division : null;

      if (selectedChampionship.uses_divisions && teamDivision == null) {
        nextCompetitionOptionsByTeamId[team.id] = [];
        return;
      }

      nextCompetitionOptionsByTeamId[team.id] = championshipSports.flatMap((championshipSport) => {
        const supportedNaipes = resolveSupportedNaipesByMode(championshipSport.naipe_mode);
        const sportName = championshipSport.sports?.name ?? "Modalidade";

        return supportedNaipes.map((naipe) => {
          const optionDivision = selectedChampionship.uses_divisions ? teamDivision : null;

          return {
            key: resolveCompetitionKey(championshipSport.sport_id, naipe, optionDivision),
            sport_id: championshipSport.sport_id,
            sport_name: sportName,
            naipe,
            division: optionDivision,
          } as CompetitionOption;
        });
      });
    });

    return nextCompetitionOptionsByTeamId;
  }, [championshipSports, selectedChampionship.uses_divisions, selectedTeams]);

  const competitionOptionsByKey = useMemo(() => {
    const map = new Map<string, CompetitionOption>();

    Object.values(competitionOptionsByTeamId).forEach((competitionOptions) => {
      competitionOptions.forEach((competitionOption) => {
        map.set(competitionOption.key, competitionOption);
      });
    });

    return map;
  }, [competitionOptionsByTeamId]);

  const teamIdsByCompetitionKey = useMemo(() => {
    const nextTeamIdsByCompetitionKey: Record<string, string[]> = {};

    Object.entries(selectedCompetitionKeysByTeamId).forEach(([teamId, selectedCompetitionKeys]) => {
      selectedCompetitionKeys.forEach((competitionKey) => {
        if (!nextTeamIdsByCompetitionKey[competitionKey]) {
          nextTeamIdsByCompetitionKey[competitionKey] = [];
        }

        nextTeamIdsByCompetitionKey[competitionKey].push(teamId);
      });
    });

    return nextTeamIdsByCompetitionKey;
  }, [selectedCompetitionKeysByTeamId]);

  const activeCompetitionKeys = useMemo(() => {
    return Object.keys(teamIdsByCompetitionKey).filter((competitionKey) => teamIdsByCompetitionKey[competitionKey].length >= 2);
  }, [teamIdsByCompetitionKey]);

  const competitionTeamsByCompetitionKey = useMemo(() => {
    return activeCompetitionKeys.reduce<Record<string, Team[]>>((carry, competitionKey) => {
      carry[competitionKey] = (teamIdsByCompetitionKey[competitionKey] ?? [])
        .map((teamId) => teamById[teamId])
        .filter((team): team is Team => team != null);

      return carry;
    }, {});
  }, [activeCompetitionKeys, teamById, teamIdsByCompetitionKey]);

  useEffect(() => {
    setCompetitionConfigByKey((previousCompetitionConfigByKey) => {
      const nextCompetitionConfigByKey: Record<string, CompetitionConfig> = {};

      activeCompetitionKeys.forEach((competitionKey) => {
        const previousCompetitionConfig = previousCompetitionConfigByKey[competitionKey];

        if (previousCompetitionConfig) {
          nextCompetitionConfigByKey[competitionKey] = previousCompetitionConfig;
          return;
        }

        const participantCount = teamIdsByCompetitionKey[competitionKey]?.length ?? 2;

        nextCompetitionConfigByKey[competitionKey] = resolveDefaultCompetitionConfig(participantCount);
      });

      return nextCompetitionConfigByKey;
    });
  }, [activeCompetitionKeys, teamIdsByCompetitionKey]);

  useEffect(() => {
    setGroupAssignmentsByCompetitionKey((previousGroupAssignmentsByCompetitionKey) => {
      const nextGroupAssignmentsByCompetitionKey: Record<string, Record<string, number>> = {};

      activeCompetitionKeys.forEach((competitionKey) => {
        const teamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
        const groupCount = competitionConfigByKey[competitionKey]?.groups_count ?? 1;
        const previousAssignments = previousGroupAssignmentsByCompetitionKey[competitionKey] ?? {};
        const candidateAssignments: Record<string, number> = {};

        let allAssignmentsAreValid = teamIds.length > 0;

        teamIds.forEach((team_id) => {
          const previousGroupNumber = previousAssignments[team_id];

          if (!previousGroupNumber || previousGroupNumber < 1 || previousGroupNumber > groupCount) {
            allAssignmentsAreValid = false;
            return;
          }

          candidateAssignments[team_id] = previousGroupNumber;
        });

        nextGroupAssignmentsByCompetitionKey[competitionKey] = allAssignmentsAreValid
          ? candidateAssignments
          : resolveBalancedAssignments(teamIds, groupCount, competitionKey);
      });

      return nextGroupAssignmentsByCompetitionKey;
    });
  }, [activeCompetitionKeys, competitionConfigByKey, teamIdsByCompetitionKey]);

  const selectedSportOptions = useMemo(() => {
    const sportsById = new Map<string, { id: string; name: string }>();

    championshipSports.forEach((championshipSport) => {
      sportsById.set(championshipSport.sport_id, {
        id: championshipSport.sport_id,
        name: championshipSport.sports?.name ?? "Modalidade",
      });
    });

    return [...sportsById.values()];
  }, [championshipSports]);

  const sportOptionsByTeamId = useMemo(() => {
    const nextSportOptionsByTeamId: Record<string, { id: string; name: string }[]> = {};

    Object.entries(competitionOptionsByTeamId).forEach(([team_id, competitionOptions]) => {
      const teamSportOptionsById = new Map<string, { id: string; name: string }>();

      competitionOptions.forEach((competitionOption) => {
        teamSportOptionsById.set(competitionOption.sport_id, {
          id: competitionOption.sport_id,
          name: competitionOption.sport_name,
        });
      });

      nextSportOptionsByTeamId[team_id] = [...teamSportOptionsById.values()];
    });

    return nextSportOptionsByTeamId;
  }, [competitionOptionsByTeamId]);

  const allSelectableTeamsSelected = useMemo(() => {
    if (selectableTeamIds.length == 0) {
      return false;
    }

    return selectableTeamIds.every((team_id) => selectedTeamIdSet.has(team_id));
  }, [selectableTeamIds, selectedTeamIdSet]);

  const hasAtLeastOneSelectableTeamSelected = useMemo(() => {
    return selectableTeamIds.some((team_id) => selectedTeamIdSet.has(team_id));
  }, [selectableTeamIds, selectedTeamIdSet]);

  const handleToggleTeamSelection = (team_id: string, checked: boolean) => {
    setSelectedTeamIds((currentSelectedTeamIds) => {
      if (checked) {
        if (currentSelectedTeamIds.includes(team_id)) {
          return currentSelectedTeamIds;
        }

        return [...currentSelectedTeamIds, team_id];
      }

      return currentSelectedTeamIds.filter((selectedTeamId) => selectedTeamId != team_id);
    });

    if (!checked) {
      setSelectedSportIdsByTeamId((currentSelectedSportIdsByTeamId) => {
        const nextSelectedSportIdsByTeamId = { ...currentSelectedSportIdsByTeamId };
        delete nextSelectedSportIdsByTeamId[team_id];
        return nextSelectedSportIdsByTeamId;
      });

      setSelectedCompetitionKeysByTeamId((currentSelectedCompetitionKeysByTeamId) => {
        const nextSelectedCompetitionKeysByTeamId = { ...currentSelectedCompetitionKeysByTeamId };
        delete nextSelectedCompetitionKeysByTeamId[team_id];
        return nextSelectedCompetitionKeysByTeamId;
      });
    }
  };

  const handleToggleAllTeamSelection = (checked: boolean) => {
    if (!checked) {
      setSelectedTeamIds([]);
      setSelectedSportIdsByTeamId({});
      setSelectedCompetitionKeysByTeamId({});
      return;
    }

    const nextSelectedTeamIds = [...selectableTeamIds];
    const selectableTeamIdSet = new Set(nextSelectedTeamIds);

    setSelectedTeamIds(nextSelectedTeamIds);
    setSelectedSportIdsByTeamId((currentSelectedSportIdsByTeamId) => {
      return Object.entries(currentSelectedSportIdsByTeamId).reduce<Record<string, string[]>>((carry, [team_id, selectedSportIds]) => {
        if (!selectableTeamIdSet.has(team_id)) {
          return carry;
        }

        carry[team_id] = selectedSportIds;
        return carry;
      }, {});
    });
    setSelectedCompetitionKeysByTeamId((currentSelectedCompetitionKeysByTeamId) => {
      return Object.entries(currentSelectedCompetitionKeysByTeamId).reduce<Record<string, string[]>>(
        (carry, [team_id, selectedCompetitionKeys]) => {
          if (!selectableTeamIdSet.has(team_id)) {
            return carry;
          }

          carry[team_id] = selectedCompetitionKeys;
          return carry;
        },
        {},
      );
    });
  };

  const handleToggleTeamSport = (team_id: string, sport_id: string, checked: boolean) => {
    setSelectedSportIdsByTeamId((currentSelectedSportIdsByTeamId) => {
      const selectedSportIds = currentSelectedSportIdsByTeamId[team_id] ?? [];

      if (checked) {
        if (selectedSportIds.includes(sport_id)) {
          return currentSelectedSportIdsByTeamId;
        }

        return {
          ...currentSelectedSportIdsByTeamId,
          [team_id]: [...selectedSportIds, sport_id],
        };
      }

      return {
        ...currentSelectedSportIdsByTeamId,
        [team_id]: selectedSportIds.filter((selectedSportId) => selectedSportId != sport_id),
      };
    });

    if (!checked) {
      setSelectedCompetitionKeysByTeamId((currentSelectedCompetitionKeysByTeamId) => {
        const selectedCompetitionKeys = currentSelectedCompetitionKeysByTeamId[team_id] ?? [];

        return {
          ...currentSelectedCompetitionKeysByTeamId,
          [team_id]: selectedCompetitionKeys.filter((competitionKey) => {
            const parsedCompetitionKey = parseCompetitionKey(competitionKey);
            return parsedCompetitionKey.sport_id != sport_id;
          }),
        };
      });
    }
  };

  const handleToggleTeamCompetition = (team_id: string, competition_key: string, checked: boolean) => {
    setSelectedCompetitionKeysByTeamId((currentSelectedCompetitionKeysByTeamId) => {
      const selectedCompetitionKeys = currentSelectedCompetitionKeysByTeamId[team_id] ?? [];

      if (checked) {
        if (selectedCompetitionKeys.includes(competition_key)) {
          return currentSelectedCompetitionKeysByTeamId;
        }

        return {
          ...currentSelectedCompetitionKeysByTeamId,
          [team_id]: [...selectedCompetitionKeys, competition_key],
        };
      }

      return {
        ...currentSelectedCompetitionKeysByTeamId,
        [team_id]: selectedCompetitionKeys.filter((key) => key != competition_key),
      };
    });
  };

  const modalityQuickSelectionOptions = useMemo(() => {
    return selectedSportOptions.filter((sportOption) => {
      return selectedTeamIds.some((team_id) => {
        return (sportOptionsByTeamId[team_id] ?? []).some((teamSportOption) => teamSportOption.id == sportOption.id);
      });
    });
  }, [selectedSportOptions, selectedTeamIds, sportOptionsByTeamId]);

  const modalityQuickSelectionStatusBySportId = useMemo(() => {
    return modalityQuickSelectionOptions.reduce<Record<string, { all_selected: boolean; has_selected: boolean }>>((carry, sportOption) => {
      const eligibleTeamIds = selectedTeamIds.filter((team_id) => {
        return (sportOptionsByTeamId[team_id] ?? []).some((teamSportOption) => teamSportOption.id == sportOption.id);
      });

      if (eligibleTeamIds.length == 0) {
        carry[sportOption.id] = {
          all_selected: false,
          has_selected: false,
        };
        return carry;
      }

      const selectedCount = eligibleTeamIds.filter((team_id) => {
        return selectedSportIdSetByTeamId[team_id]?.has(sportOption.id) == true;
      }).length;

      carry[sportOption.id] = {
        all_selected: selectedCount == eligibleTeamIds.length,
        has_selected: selectedCount > 0,
      };

      return carry;
    }, {});
  }, [modalityQuickSelectionOptions, selectedSportIdSetByTeamId, selectedTeamIds, sportOptionsByTeamId]);

  const modalitySelectionSummary = useMemo(() => {
    let eligibleModalitiesCount = 0;
    let selectedModalitiesCount = 0;

    selectedTeamIds.forEach((team_id) => {
      const teamSportIds = (sportOptionsByTeamId[team_id] ?? []).map((sportOption) => sportOption.id);
      const selectedSportIdSet = selectedSportIdSetByTeamId[team_id] ?? new Set<string>();
      eligibleModalitiesCount = eligibleModalitiesCount + teamSportIds.length;
      selectedModalitiesCount =
        selectedModalitiesCount + teamSportIds.filter((sport_id) => selectedSportIdSet.has(sport_id)).length;
    });

    return {
      eligible_modalities_count: eligibleModalitiesCount,
      selected_modalities_count: selectedModalitiesCount,
      are_all_selected: eligibleModalitiesCount > 0 && selectedModalitiesCount == eligibleModalitiesCount,
      has_at_least_one_selected: selectedModalitiesCount > 0,
    };
  }, [selectedSportIdSetByTeamId, selectedTeamIds, sportOptionsByTeamId]);

  const handleToggleAllModalitiesSelection = (checked: boolean) => {
    if (!checked) {
      setSelectedSportIdsByTeamId((currentSelectedSportIdsByTeamId) => {
        const nextSelectedSportIdsByTeamId = { ...currentSelectedSportIdsByTeamId };

        selectedTeamIds.forEach((team_id) => {
          nextSelectedSportIdsByTeamId[team_id] = [];
        });

        return nextSelectedSportIdsByTeamId;
      });

      setSelectedCompetitionKeysByTeamId((currentSelectedCompetitionKeysByTeamId) => {
        const nextSelectedCompetitionKeysByTeamId = { ...currentSelectedCompetitionKeysByTeamId };

        selectedTeamIds.forEach((team_id) => {
          nextSelectedCompetitionKeysByTeamId[team_id] = [];
        });

        return nextSelectedCompetitionKeysByTeamId;
      });

      return;
    }

    setSelectedSportIdsByTeamId((currentSelectedSportIdsByTeamId) => {
      const nextSelectedSportIdsByTeamId = { ...currentSelectedSportIdsByTeamId };

      selectedTeamIds.forEach((team_id) => {
        const teamSportIds = (sportOptionsByTeamId[team_id] ?? []).map((sportOption) => sportOption.id);
        nextSelectedSportIdsByTeamId[team_id] = teamSportIds;
      });

      return nextSelectedSportIdsByTeamId;
    });
  };

  const handleToggleBulkSportSelection = (sport_id: string, checked: boolean) => {
    if (!shouldApplyModalitiesToAllTeams) {
      return;
    }

    setSelectedSportIdsByTeamId((currentSelectedSportIdsByTeamId) => {
      const nextSelectedSportIdsByTeamId = { ...currentSelectedSportIdsByTeamId };

      selectedTeamIds.forEach((team_id) => {
        const teamSupportsSport = (sportOptionsByTeamId[team_id] ?? []).some((sportOption) => sportOption.id == sport_id);

        if (!teamSupportsSport) {
          return;
        }

        const selectedSportIds = nextSelectedSportIdsByTeamId[team_id] ?? [];

        if (checked) {
          if (selectedSportIds.includes(sport_id)) {
            return;
          }

          nextSelectedSportIdsByTeamId[team_id] = [...selectedSportIds, sport_id];
          return;
        }

        nextSelectedSportIdsByTeamId[team_id] = selectedSportIds.filter((selectedSportId) => selectedSportId != sport_id);
      });

      return nextSelectedSportIdsByTeamId;
    });

    if (!checked) {
      setSelectedCompetitionKeysByTeamId((currentSelectedCompetitionKeysByTeamId) => {
        const nextSelectedCompetitionKeysByTeamId = { ...currentSelectedCompetitionKeysByTeamId };

        selectedTeamIds.forEach((team_id) => {
          const selectedCompetitionKeys = nextSelectedCompetitionKeysByTeamId[team_id] ?? [];
          nextSelectedCompetitionKeysByTeamId[team_id] = selectedCompetitionKeys.filter((competitionKey) => {
            const parsedCompetitionKey = parseCompetitionKey(competitionKey);
            return parsedCompetitionKey.sport_id != sport_id;
          });
        });

        return nextSelectedCompetitionKeysByTeamId;
      });
    }
  };

  const naipeQuickSelectionOptions = useMemo(() => {
    const nextQuickSelectionOptionsBySportId = new Map<string, { sport_id: string; sport_name: string; naipes: MatchNaipe[] }>();

    selectedTeamIds.forEach((team_id) => {
      const selectedSportIdSet = selectedSportIdSetByTeamId[team_id] ?? new Set<string>();

      (competitionOptionsByTeamId[team_id] ?? []).forEach((competitionOption) => {
        if (!selectedSportIdSet.has(competitionOption.sport_id)) {
          return;
        }

        const previousOption = nextQuickSelectionOptionsBySportId.get(competitionOption.sport_id);

        if (!previousOption) {
          nextQuickSelectionOptionsBySportId.set(competitionOption.sport_id, {
            sport_id: competitionOption.sport_id,
            sport_name: competitionOption.sport_name,
            naipes: [competitionOption.naipe],
          });
          return;
        }

        if (!previousOption.naipes.includes(competitionOption.naipe)) {
          previousOption.naipes = [...previousOption.naipes, competitionOption.naipe];
          nextQuickSelectionOptionsBySportId.set(competitionOption.sport_id, previousOption);
        }
      });
    });

    return [...nextQuickSelectionOptionsBySportId.values()];
  }, [competitionOptionsByTeamId, selectedSportIdSetByTeamId, selectedTeamIds]);

  const naipeQuickSelectionStatusByKey = useMemo(() => {
    return naipeQuickSelectionOptions.reduce<Record<string, { all_selected: boolean; has_selected: boolean }>>(
      (carry, quickOption) => {
        quickOption.naipes.forEach((naipe) => {
          const statusKey = `${quickOption.sport_id}::${naipe}`;
          const eligibleTeamIds: string[] = [];
          let selectedCount = 0;

          selectedTeamIds.forEach((team_id) => {
            if (selectedSportIdSetByTeamId[team_id]?.has(quickOption.sport_id) != true) {
              return;
            }

            const teamCompetitionOption = (competitionOptionsByTeamId[team_id] ?? []).find((competitionOption) => {
              return competitionOption.sport_id == quickOption.sport_id && competitionOption.naipe == naipe;
            });

            if (!teamCompetitionOption) {
              return;
            }

            eligibleTeamIds.push(team_id);

            if (selectedCompetitionKeySetByTeamId[team_id]?.has(teamCompetitionOption.key) == true) {
              selectedCount = selectedCount + 1;
            }
          });

          carry[statusKey] = {
            all_selected: eligibleTeamIds.length > 0 && selectedCount == eligibleTeamIds.length,
            has_selected: selectedCount > 0,
          };
        });

        return carry;
      },
      {},
    );
  }, [
    competitionOptionsByTeamId,
    naipeQuickSelectionOptions,
    selectedCompetitionKeySetByTeamId,
    selectedSportIdSetByTeamId,
    selectedTeamIds,
  ]);

  const naipeSelectionSummary = useMemo(() => {
    let eligibleNaipesCount = 0;
    let selectedNaipesCount = 0;

    selectedTeamIds.forEach((team_id) => {
      const selectedSportIdSet = selectedSportIdSetByTeamId[team_id] ?? new Set<string>();
      const teamCompetitionOptions = (competitionOptionsByTeamId[team_id] ?? []).filter((competitionOption) => {
        return selectedSportIdSet.has(competitionOption.sport_id);
      });
      const selectedCompetitionKeySet = selectedCompetitionKeySetByTeamId[team_id] ?? new Set<string>();

      eligibleNaipesCount = eligibleNaipesCount + teamCompetitionOptions.length;
      selectedNaipesCount =
        selectedNaipesCount +
        teamCompetitionOptions.filter((competitionOption) => selectedCompetitionKeySet.has(competitionOption.key)).length;
    });

    return {
      eligible_naipes_count: eligibleNaipesCount,
      selected_naipes_count: selectedNaipesCount,
      are_all_selected: eligibleNaipesCount > 0 && selectedNaipesCount == eligibleNaipesCount,
      has_at_least_one_selected: selectedNaipesCount > 0,
    };
  }, [competitionOptionsByTeamId, selectedCompetitionKeySetByTeamId, selectedSportIdSetByTeamId, selectedTeamIds]);

  const handleToggleAllNaipesSelection = (checked: boolean) => {
    setSelectedCompetitionKeysByTeamId((currentSelectedCompetitionKeysByTeamId) => {
      const nextSelectedCompetitionKeysByTeamId = { ...currentSelectedCompetitionKeysByTeamId };

      selectedTeamIds.forEach((team_id) => {
        const selectedSportIds = selectedSportIdsByTeamId[team_id] ?? [];
        const selectedSportIdSet = new Set(selectedSportIds);
        const teamCompetitionOptions = (competitionOptionsByTeamId[team_id] ?? []).filter((competitionOption) => {
          return selectedSportIdSet.has(competitionOption.sport_id);
        });

        if (!checked) {
          const teamCompetitionKeySet = new Set(teamCompetitionOptions.map((competitionOption) => competitionOption.key));
          const selectedCompetitionKeys = nextSelectedCompetitionKeysByTeamId[team_id] ?? [];
          nextSelectedCompetitionKeysByTeamId[team_id] = selectedCompetitionKeys.filter(
            (competitionKey) => !teamCompetitionKeySet.has(competitionKey),
          );
          return;
        }

        const selectedCompetitionKeys = nextSelectedCompetitionKeysByTeamId[team_id] ?? [];
        const selectedCompetitionKeySet = new Set(selectedCompetitionKeys);
        teamCompetitionOptions.forEach((competitionOption) => {
          selectedCompetitionKeySet.add(competitionOption.key);
        });
        nextSelectedCompetitionKeysByTeamId[team_id] = [...selectedCompetitionKeySet];
      });

      return nextSelectedCompetitionKeysByTeamId;
    });
  };

  const handleToggleBulkNaipeSelection = (sport_id: string, naipe: MatchNaipe, checked: boolean) => {
    if (!shouldApplyNaipesToAllTeams) {
      return;
    }

    setSelectedCompetitionKeysByTeamId((currentSelectedCompetitionKeysByTeamId) => {
      const nextSelectedCompetitionKeysByTeamId = { ...currentSelectedCompetitionKeysByTeamId };

      selectedTeamIds.forEach((team_id) => {
        const selectedSportIds = selectedSportIdsByTeamId[team_id] ?? [];

        if (!selectedSportIds.includes(sport_id)) {
          return;
        }

        const teamCompetitionOption = (competitionOptionsByTeamId[team_id] ?? []).find((competitionOption) => {
          return competitionOption.sport_id == sport_id && competitionOption.naipe == naipe;
        });

        if (!teamCompetitionOption) {
          return;
        }

        const selectedCompetitionKeys = nextSelectedCompetitionKeysByTeamId[team_id] ?? [];

        if (checked) {
          if (selectedCompetitionKeys.includes(teamCompetitionOption.key)) {
            return;
          }

          nextSelectedCompetitionKeysByTeamId[team_id] = [...selectedCompetitionKeys, teamCompetitionOption.key];
          return;
        }

        nextSelectedCompetitionKeysByTeamId[team_id] = selectedCompetitionKeys.filter(
          (competitionKey) => competitionKey != teamCompetitionOption.key,
        );
      });

      return nextSelectedCompetitionKeysByTeamId;
    });
  };

  const handleAutoAssignCompetitionGroups = (competitionKey: string) => {
    const teamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
    const groupCount = competitionConfigByKey[competitionKey]?.groups_count ?? 1;

    setGroupAssignmentsByCompetitionKey((currentGroupAssignmentsByCompetitionKey) => ({
      ...currentGroupAssignmentsByCompetitionKey,
      [competitionKey]: resolveBalancedAssignments(teamIds, groupCount, competitionKey),
    }));
  };

  const handleAutoAssignAllCompetitionGroups = () => {
    setGroupAssignmentsByCompetitionKey((currentGroupAssignmentsByCompetitionKey) => {
      const nextGroupAssignmentsByCompetitionKey = { ...currentGroupAssignmentsByCompetitionKey };

      activeCompetitionKeys.forEach((competitionKey) => {
        const teamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
        const groupCount = competitionConfigByKey[competitionKey]?.groups_count ?? 1;
        nextGroupAssignmentsByCompetitionKey[competitionKey] = resolveBalancedAssignments(teamIds, groupCount, competitionKey);
      });

      return nextGroupAssignmentsByCompetitionKey;
    });
  };

  const validateCurrentStep = () => {
    if (currentStepIndex == 0) {
      if (selectedTeamIds.length == 0) {
        toast.error("Selecione ao menos uma atlética participante.");
        return false;
      }
    }

    if (currentStepIndex == 1) {
      const hasSelectedTeamWithoutSport = selectedTeamIds.some((team_id) => {
        return (selectedSportIdsByTeamId[team_id] ?? []).length == 0;
      });

      if (hasSelectedTeamWithoutSport) {
        toast.error("Todas as atléticas selecionadas precisam ter ao menos uma modalidade.");
        return false;
      }
    }

    if (currentStepIndex == 2) {
      const hasSelectedTeamSportWithoutNaipe = selectedTeamIds.some((team_id) => {
        const selectedSportIds = selectedSportIdsByTeamId[team_id] ?? [];
        const selectedCompetitionKeys = selectedCompetitionKeysByTeamId[team_id] ?? [];

        return selectedSportIds.some((sport_id) => {
          return !selectedCompetitionKeys.some((competitionKey) => {
            const parsedCompetitionKey = parseCompetitionKey(competitionKey);
            return parsedCompetitionKey.sport_id == sport_id;
          });
        });
      });

      if (hasSelectedTeamSportWithoutNaipe) {
        toast.error("Selecione ao menos um naipe para cada modalidade de cada atlética.");
        return false;
      }

      const selectedCompetitionCount = Object.values(selectedCompetitionKeysByTeamId).reduce((total, selectedCompetitionKeys) => {
        return total + selectedCompetitionKeys.length;
      }, 0);

      if (selectedCompetitionCount == 0) {
        toast.error("Selecione ao menos uma modalidade/naipe para as atléticas participantes.");
        return false;
      }

      if (activeCompetitionKeys.length == 0) {
        toast.error("É necessário ao menos uma competição com duas atléticas para gerar chaves.");
        return false;
      }
    }

    if (currentStepIndex == 3) {
      const hasInvalidCompetition = activeCompetitionKeys.some((competitionKey) => {
        const competitionConfig = competitionConfigByKey[competitionKey];
        if (!competitionConfig) {
          return true;
        }

        return (
          competitionConfig.groups_count < 1 ||
          competitionConfig.qualifiers_per_group < 1 ||
          competitionConfig.qualifiers_per_group > 2
        );
      });

      if (hasInvalidCompetition) {
        toast.error("Revise a configuração de grupos. Classificados por chave deve ser 1 ou 2.");
        return false;
      }
    }

    if (currentStepIndex == 4) {
      for (const competitionKey of activeCompetitionKeys) {
        const teamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
        const assignments = groupAssignmentsByCompetitionKey[competitionKey] ?? {};
        const groupCount = competitionConfigByKey[competitionKey]?.groups_count ?? 1;
        const competitionOption = competitionOptionsByKey.get(competitionKey);
        const groupSizes = Array.from({ length: groupCount }, () => 0);
        const competitionDisplayLabel = competitionOption
          ? `${competitionOption.sport_name} • ${MATCH_NAIPE_LABELS[competitionOption.naipe]}${
              competitionOption.division ? ` • ${competitionOption.division}` : ""
            }`
          : "modalidade selecionada";

        for (const teamId of teamIds) {
          const assignedGroup = assignments[teamId];

          if (!assignedGroup || assignedGroup < 1 || assignedGroup > groupCount) {
            toast.error(`A distribuição de ${competitionDisplayLabel} possui atléticas sem chave válida.`);
            return false;
          }

          groupSizes[assignedGroup - 1] = groupSizes[assignedGroup - 1] + 1;
        }

        const minimumGroupSize = Math.min(...groupSizes);
        const maximumGroupSize = Math.max(...groupSizes);

        if (minimumGroupSize < 2) {
          toast.error(`Em ${competitionDisplayLabel}, cada chave precisa ter no mínimo 2 atléticas.`);
          return false;
        }

        if (maximumGroupSize - minimumGroupSize > 1) {
          toast.error(
            `Distribuição inválida em ${competitionDisplayLabel}: diferença entre chaves maior que 1 (${minimumGroupSize} até ${maximumGroupSize}).`,
          );
          return false;
        }
      }
    }

    if (currentStepIndex == 5) {
      if (scheduleDays.length == 0) {
        toast.error("Configure ao menos um dia de agenda.");
        return false;
      }

      for (const scheduleDay of scheduleDays) {
        if (!scheduleDay.date || !scheduleDay.start_time || !scheduleDay.end_time) {
          toast.error("Preencha data, início e fim de todos os dias da agenda.");
          return false;
        }

        if ((scheduleDay.break_start_time && !scheduleDay.break_end_time) || (!scheduleDay.break_start_time && scheduleDay.break_end_time)) {
          toast.error("Se preencher pausa, informe início e fim.");
          return false;
        }

        const startMinutes = resolveTimeValueToMinutes(scheduleDay.start_time);
        const endMinutes = resolveTimeValueToMinutes(scheduleDay.end_time);

        if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
          toast.error("Horário do dia inválido: fim deve ser maior que início.");
          return false;
        }

        if (scheduleDay.break_start_time && scheduleDay.break_end_time) {
          const breakStartMinutes = resolveTimeValueToMinutes(scheduleDay.break_start_time);
          const breakEndMinutes = resolveTimeValueToMinutes(scheduleDay.break_end_time);

          if (breakStartMinutes == null || breakEndMinutes == null || breakEndMinutes <= breakStartMinutes) {
            toast.error("Intervalo de pausa inválido: fim deve ser maior que início.");
            return false;
          }

          if (breakStartMinutes < startMinutes || breakEndMinutes > endMinutes) {
            toast.error("Intervalo de pausa deve estar dentro do horário do dia.");
            return false;
          }
        }

        if (scheduleDay.locations.length == 0) {
          toast.error("Cada dia precisa de ao menos um local.");
          return false;
        }

        for (const location of scheduleDay.locations) {
          if (!location.name.trim()) {
            toast.error("Todo local precisa ter um nome.");
            return false;
          }

          if (location.courts.length == 0) {
            toast.error("Todo local precisa de ao menos uma quadra.");
            return false;
          }

          for (const court of location.courts) {
            if (!court.name.trim()) {
              toast.error("Toda quadra precisa ter um nome.");
              return false;
            }

            if (court.sport_ids.length == 0) {
              toast.error("Toda quadra precisa ter ao menos uma modalidade vinculada.");
              return false;
            }
          }
        }
      }
    }

    return true;
  };

  const handleNextStep = () => {
    if (!validateCurrentStep()) {
      return;
    }

    const next_step_index = Math.min(currentStepIndex + 1, WIZARD_STEP_LABELS.length - 1);

    saveChampionshipBracketWizardDraft(selectedChampionship.id, {
      ...resolveWizardDraftFormValues(),
      current_step_index: next_step_index,
    });

    setCurrentStepIndex(next_step_index);
  };

  const handlePreviousStep = () => {
    setCurrentStepIndex((currentStep) => Math.max(currentStep - 1, 0));
  };

  const resolveParticipantsPayload = (): ChampionshipBracketParticipantInput[] => {
    return selectedTeamIds.map((team_id) => {
      const selectedCompetitionKeys = selectedCompetitionKeysByTeamId[team_id] ?? [];

      return {
        team_id,
        modalities: selectedCompetitionKeys.map((competitionKey) => {
          const parsedCompetitionKey = parseCompetitionKey(competitionKey);

          return {
            sport_id: parsedCompetitionKey.sport_id,
            naipe: parsedCompetitionKey.naipe,
            division: parsedCompetitionKey.division,
          };
        }),
      };
    });
  };

  const resolveCompetitionsPayload = (): ChampionshipBracketCompetitionInput[] => {
    return activeCompetitionKeys.map((competitionKey) => {
      const parsedCompetitionKey = parseCompetitionKey(competitionKey);
      const competitionConfig = competitionConfigByKey[competitionKey] ?? resolveDefaultCompetitionConfig(2);
      const assignments = groupAssignmentsByCompetitionKey[competitionKey] ?? {};
      const groups: { group_number: number; team_ids: string[] }[] = [];

      for (let groupNumber = 1; groupNumber <= competitionConfig.groups_count; groupNumber += 1) {
        groups.push({
          group_number: groupNumber,
          team_ids: teamIdsByCompetitionKey[competitionKey].filter((team_id) => assignments[team_id] == groupNumber),
        });
      }

      return {
        sport_id: parsedCompetitionKey.sport_id,
        naipe: parsedCompetitionKey.naipe,
        division: parsedCompetitionKey.division,
        groups_count: competitionConfig.groups_count,
        qualifiers_per_group: competitionConfig.qualifiers_per_group,
        third_place_mode: BracketThirdPlaceMode.CHAMPION_SEMIFINAL_LOSER,
        groups,
      };
    });
  };

  const resolveScheduleDaysPayload = (): ChampionshipBracketScheduleDayInput[] => {
    return scheduleDays.map((scheduleDay) => ({
      date: scheduleDay.date,
      start_time: scheduleDay.start_time,
      end_time: scheduleDay.end_time,
      break_start_time: scheduleDay.break_start_time || null,
      break_end_time: scheduleDay.break_end_time || null,
      locations: scheduleDay.locations.map((location, locationIndex): ChampionshipBracketLocationInput => ({
        name: location.name,
        position: locationIndex + 1,
        courts: location.courts.map((court, courtIndex) => ({
          name: court.name,
          position: courtIndex + 1,
          sport_ids: court.sport_ids,
        })),
      })),
    }));
  };

  const handleSave = async () => {
    if (!validateCurrentStep()) {
      return;
    }

    setSaving(true);
    setSaveErrorBannerData(null);

    try {
      const dto = ChampionshipBracketSetupDTO.fromFormValues({
        participants: resolveParticipantsPayload(),
        competitions: resolveCompetitionsPayload(),
        schedule_days: resolveScheduleDaysPayload(),
      });

      const payload = dto.bindToSave();
      const response = await generateChampionshipBracketGroups(selectedChampionship.id, payload);

      if (response.error || !response.data) {
        throw new Error(response.error?.message ?? "Não foi possível gerar as chaves automaticamente.");
      }

      clearChampionshipBracketWizardDraft(selectedChampionship.id);
      await onGenerated(response.data);
      toast.success("Chaves e jogos da fase de grupos gerados com sucesso.");
      onOpenChange(false);
    } catch (error) {
      const resolvedMessage = error instanceof Error ? error.message : "Erro inesperado ao criar campeonato.";
      const hasCalculatedSuggestion = resolvedMessage.includes("Sugestão:");
      const normalizedMessage = hasCalculatedSuggestion
        ? resolvedMessage.split("Sugestão:")[0].trim()
        : resolvedMessage;

      setSaveErrorBannerData({
        title: "Não foi possível criar o campeonato",
        message: normalizedMessage,
        suggestion: resolveSaveErrorSuggestion(resolvedMessage),
      });
    } finally {
      setSaving(false);
    }
  };

  const updateScheduleDay = useCallback((scheduleDayId: string, updater: (scheduleDay: ScheduleDayFormValue) => ScheduleDayFormValue) => {
    setScheduleDays((currentScheduleDays) => {
      const scheduleDayIndex = currentScheduleDays.findIndex((item) => item.id == scheduleDayId);

      if (scheduleDayIndex < 0) {
        return currentScheduleDays;
      }

      const currentScheduleDay = currentScheduleDays[scheduleDayIndex];
      const nextScheduleDay = updater(currentScheduleDay);

      if (nextScheduleDay == currentScheduleDay) {
        return currentScheduleDays;
      }

      const nextScheduleDays = [...currentScheduleDays];
      nextScheduleDays[scheduleDayIndex] = nextScheduleDay;

      return nextScheduleDays;
    });
  }, []);

  const updateScheduleLocation = useCallback(
    (
      scheduleDayId: string,
      locationId: string,
      updater: (location: ScheduleLocationFormValue, locationIndex: number) => ScheduleLocationFormValue,
    ) => {
      updateScheduleDay(scheduleDayId, (scheduleDay) => {
        const locationIndex = scheduleDay.locations.findIndex((locationItem) => locationItem.id == locationId);

        if (locationIndex < 0) {
          return scheduleDay;
        }

        const currentLocation = scheduleDay.locations[locationIndex];
        const nextLocation = updater(currentLocation, locationIndex);

        if (nextLocation == currentLocation) {
          return scheduleDay;
        }

        const nextLocations = [...scheduleDay.locations];
        nextLocations[locationIndex] = nextLocation;

        return {
          ...scheduleDay,
          locations: nextLocations,
        };
      });
    },
    [updateScheduleDay],
  );

  const updateScheduleCourt = useCallback(
    (
      scheduleDayId: string,
      locationId: string,
      courtId: string,
      updater: (court: ScheduleCourtFormValue, courtIndex: number) => ScheduleCourtFormValue,
    ) => {
      updateScheduleLocation(scheduleDayId, locationId, (location) => {
        const courtIndex = location.courts.findIndex((courtItem) => courtItem.id == courtId);

        if (courtIndex < 0) {
          return location;
        }

        const currentCourt = location.courts[courtIndex];
        const nextCourt = updater(currentCourt, courtIndex);

        if (nextCourt == currentCourt) {
          return location;
        }

        const nextCourts = [...location.courts];
        nextCourts[courtIndex] = nextCourt;

        return {
          ...location,
          courts: nextCourts,
        };
      });
    },
    [updateScheduleLocation],
  );

  const removeScheduleDay = useCallback((scheduleDayId: string) => {
    setScheduleDays((currentScheduleDays) => {
      if (!currentScheduleDays.some((item) => item.id == scheduleDayId)) {
        return currentScheduleDays;
      }

      return currentScheduleDays.filter((item) => item.id != scheduleDayId);
    });
  }, []);

  const handleAddScheduleDay = useCallback(() => {
    setScheduleDays((currentScheduleDays) => {
      const previousScheduleDay = currentScheduleDays[currentScheduleDays.length - 1];

      if (shouldReplicatePreviousScheduleDay && previousScheduleDay) {
        return [...currentScheduleDays, resolveReplicatedScheduleDay(previousScheduleDay)];
      }

      return [...currentScheduleDays, resolveInitialScheduleDay()];
    });
  }, [shouldReplicatePreviousScheduleDay]);

  const reviewScheduleDaySummaries = useMemo(() => {
    return scheduleDays.map((scheduleDay, scheduleDayIndex) => {
      const totalCourts = scheduleDay.locations.reduce((carry, location) => carry + location.courts.length, 0);

      return {
        key: `review-schedule-day-${scheduleDay.id}`,
        day_label: `Dia ${scheduleDayIndex + 1}`,
        date: resolveBrazilianDateString(scheduleDay.date),
        start_time: scheduleDay.start_time || "--:--",
        end_time: scheduleDay.end_time || "--:--",
        break_start_time: scheduleDay.break_start_time || "",
        break_end_time: scheduleDay.break_end_time || "",
        location_count: scheduleDay.locations.length,
        total_courts: totalCourts,
      };
    });
  }, [scheduleDays]);

  const reviewCompetitionGroupSummariesByCompetitionKey = useMemo(() => {
    return activeCompetitionKeys.reduce<
      Record<string, { group_number: number; teams: { id: string; name: string }[] }[]>
    >((carry, competitionKey) => {
      const competitionConfig = competitionConfigByKey[competitionKey];

      if (!competitionConfig) {
        carry[competitionKey] = [];
        return carry;
      }

      const participantTeamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
      const groupAssignments = groupAssignmentsByCompetitionKey[competitionKey] ?? {};

      carry[competitionKey] = Array.from({ length: competitionConfig.groups_count }, (_, groupIndex) => {
        const groupNumber = groupIndex + 1;
        const teams = participantTeamIds
          .filter((teamId) => (groupAssignments[teamId] ?? 1) == groupNumber)
          .map((teamId) => ({
            id: teamId,
            name: teamNameById[teamId] ?? "Atlética",
          }));

        return {
          group_number: groupNumber,
          teams,
        };
      });

      return carry;
    }, {});
  }, [activeCompetitionKeys, competitionConfigByKey, groupAssignmentsByCompetitionKey, teamIdsByCompetitionKey, teamNameById]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[780px] max-h-[88vh] w-[1120px] max-w-[95vw] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Hora de configurar o campeonato {selectedChampionship.name}!</DialogTitle>
          <DialogDescription>
            Configure participantes, chaves e agenda para criar os jogos automaticamente sem conflitos.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {saveErrorBannerData ? (
            <div ref={saveErrorBannerReference}>
              <Alert variant="destructive" className="border-destructive/60 bg-destructive/10 pr-10 dark:bg-destructive/10">
                <button
                  type="button"
                  aria-label="Fechar aviso de erro"
                  className="absolute right-3 top-3 rounded-sm p-1 text-destructive/80 transition hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setSaveErrorBannerData(null)}
                >
                  <X className="h-4 w-4" />
                </button>
                <AlertTitle>{saveErrorBannerData.title}</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>{saveErrorBannerData.message}</p>
                  {saveErrorBannerData.suggestion ? <p>{saveErrorBannerData.suggestion}</p> : null}
                </AlertDescription>
              </Alert>
            </div>
          ) : null}

          <div className="rounded-2xl border border-transparent bg-background/60 p-1 shadow-[0_12px_24px_rgba(15,23,42,0.14)] dark:shadow-none dark:border-border/60">
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-7">
              {WIZARD_STEP_LABELS.map((label, stepIndex) => (
                <div
                  key={label}
                  className={`flex min-h-[56px] items-center justify-center rounded-xl px-3 py-2 text-center text-xs font-semibold transition-colors ${
                    stepIndex == currentStepIndex
                      ? "bg-primary text-primary-foreground shadow-[0_6px_14px_rgba(220,38,38,0.32)] dark:shadow-none"
                      : stepIndex < currentStepIndex
                        ? "bg-primary/10 text-primary"
                        : "bg-transparent text-muted-foreground"
                  }`}
                >
                  <div className="leading-tight">
                    {stepIndex + 1}. {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
          {currentStepIndex == 0 ? (
            <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
              <div className="rounded-xl bg-background/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">Selecione as atléticas participantes</p>
                    <span className="text-xs text-muted-foreground">
                      {selectedTeamIds.length}/{selectableTeams.length} selecionadas
                    </span>
                  </div>
                  <label className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
                    <Checkbox
                      className={SQUARE_CHECKBOX_CLASS_NAME}
                      checked={allSelectableTeamsSelected ? true : hasAtLeastOneSelectableTeamSelected ? "indeterminate" : false}
                      onCheckedChange={(checked) => handleToggleAllTeamSelection(checked == true)}
                    />
                    Selecionar todas
                  </label>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {selectableTeams.map((team) => {
                    const isSelected = selectedTeamIdSet.has(team.id);

                    return (
                      <label key={team.id} className="flex items-center gap-2 rounded-lg bg-background/40 px-3 py-2">
                        <Checkbox
                          className={SQUARE_CHECKBOX_CLASS_NAME}
                          checked={isSelected}
                          onCheckedChange={(checked) => handleToggleTeamSelection(team.id, checked == true)}
                        />
                        <span className="text-sm font-medium">{team.name}</span>
                        {team.division ? (
                          <AppBadge tone={TEAM_DIVISION_BADGE_TONES[team.division]} className="shrink-0 whitespace-nowrap">
                            {TEAM_DIVISION_LABELS[team.division]}
                          </AppBadge>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
                {selectableTeams.length == 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Nenhuma atlética com divisão configurada (principal/acesso) foi encontrada.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {currentStepIndex == 1 ? (
            <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
              <div className="rounded-xl bg-background/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">Matriz Atlética x Modalidade</p>
                    <span className="text-xs text-muted-foreground">
                      {modalitySelectionSummary.selected_modalities_count}/{modalitySelectionSummary.eligible_modalities_count} selecionadas
                    </span>
                  </div>
                  <label className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
                    <Checkbox
                      className={SQUARE_CHECKBOX_CLASS_NAME}
                      checked={
                        modalitySelectionSummary.are_all_selected
                          ? true
                          : modalitySelectionSummary.has_at_least_one_selected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(checked) => handleToggleAllModalitiesSelection(checked == true)}
                    />
                    Selecionar todas
                  </label>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Selecione as modalidades que cada atlética disputará.
                </p>

                <div className="mt-3 rounded-lg bg-background/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold">Seleção rápida de modalidades</p>
                    <label className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
                      <Checkbox
                        className={SQUARE_CHECKBOX_CLASS_NAME}
                        checked={shouldApplyModalitiesToAllTeams}
                        onCheckedChange={(checked) => setShouldApplyModalitiesToAllTeams(checked == true)}
                      />
                      Aplicar para todas as atléticas configuradas
                    </label>
                  </div>

                  {modalityQuickSelectionOptions.length == 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Selecione atléticas participantes para habilitar a seleção rápida.
                    </p>
                  ) : (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {modalityQuickSelectionOptions.map((sportOption) => {
                        const quickSelectionStatus = modalityQuickSelectionStatusBySportId[sportOption.id];

                        return (
                          <label
                            key={`quick-modality-${sportOption.id}`}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                          >
                            <Checkbox
                              className={SQUARE_CHECKBOX_CLASS_NAME}
                              checked={
                                quickSelectionStatus?.all_selected
                                  ? true
                                  : quickSelectionStatus?.has_selected
                                    ? "indeterminate"
                                    : false
                              }
                              disabled={!shouldApplyModalitiesToAllTeams}
                              onCheckedChange={(checked) => handleToggleBulkSportSelection(sportOption.id, checked == true)}
                            />
                            <span>{sportOption.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="mt-3 space-y-3">
                  {selectedTeams.map((team) => {
                    const teamSportOptions = sportOptionsByTeamId[team.id] ?? [];
                    const selectedSportIdSet = selectedSportIdSetByTeamId[team.id] ?? new Set<string>();

                    return (
                      <div
                        key={team.id}
                        className="rounded-lg bg-background/70 p-3 shadow-[0_10px_18px_rgba(15,23,42,0.16)] dark:shadow-none"
                      >
                        <p className="text-sm font-semibold">{team.name}</p>
                        {teamSportOptions.length == 0 ? (
                          <p className="mt-2 text-xs text-muted-foreground">Sem modalidades elegíveis para esta atlética.</p>
                        ) : (
                          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {teamSportOptions.map((sportOption) => {
                              const isSelected = selectedSportIdSet.has(sportOption.id);

                              return (
                                <label key={`${team.id}-${sportOption.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs">
                                  <Checkbox
                                    className={SQUARE_CHECKBOX_CLASS_NAME}
                                    checked={isSelected}
                                    onCheckedChange={(checked) => handleToggleTeamSport(team.id, sportOption.id, checked == true)}
                                  />
                                  <span>{sportOption.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedTeams.length == 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhuma atlética selecionada. Volte para a etapa anterior e selecione participantes.
                </p>
              ) : null}
            </div>
          ) : null}

          {currentStepIndex == 2 ? (
            <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
              <div className="rounded-xl bg-background/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">Matriz Atlética x Modalidade x Naipe</p>
                    <span className="text-xs text-muted-foreground">
                      {naipeSelectionSummary.selected_naipes_count}/{naipeSelectionSummary.eligible_naipes_count} selecionados
                    </span>
                  </div>
                  <label className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
                    <Checkbox
                      className={SQUARE_CHECKBOX_CLASS_NAME}
                      checked={
                        naipeSelectionSummary.are_all_selected
                          ? true
                          : naipeSelectionSummary.has_at_least_one_selected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(checked) => handleToggleAllNaipesSelection(checked == true)}
                    />
                    Selecionar todas
                  </label>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Selecione os naipes de cada modalidade por atlética.</p>

                <div className="mt-3 rounded-lg bg-background/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold">Seleção rápida de naipes</p>
                    <label className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
                      <Checkbox
                        className={SQUARE_CHECKBOX_CLASS_NAME}
                        checked={shouldApplyNaipesToAllTeams}
                        onCheckedChange={(checked) => setShouldApplyNaipesToAllTeams(checked == true)}
                      />
                      Aplicar para todas as atléticas configuradas
                    </label>
                  </div>

                  {naipeQuickSelectionOptions.length == 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Selecione modalidades na etapa anterior para habilitar a seleção rápida de naipes.
                    </p>
                  ) : (
                    <div className="mt-2 overflow-x-auto pb-1">
                      <div className="flex w-max gap-2">
                        {naipeQuickSelectionOptions.map((quickOption) => (
                          <div
                            key={`quick-naipe-${quickOption.sport_id}`}
                            className="w-[220px] shrink-0 rounded-md p-2"
                          >
                            <p className="truncate text-xs font-semibold">{quickOption.sport_name}</p>
                            <div className="mt-2 space-y-1.5">
                              {quickOption.naipes.map((naipe) => {
                                const statusKey = `${quickOption.sport_id}::${naipe}`;
                                const quickSelectionStatus = naipeQuickSelectionStatusByKey[statusKey];

                                return (
                                  <label key={statusKey} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs">
                                    <Checkbox
                                      className={SQUARE_CHECKBOX_CLASS_NAME}
                                      checked={
                                        quickSelectionStatus?.all_selected
                                          ? true
                                          : quickSelectionStatus?.has_selected
                                            ? "indeterminate"
                                            : false
                                      }
                                      disabled={!shouldApplyNaipesToAllTeams}
                                      onCheckedChange={(checked) =>
                                        handleToggleBulkNaipeSelection(quickOption.sport_id, naipe, checked == true)
                                      }
                                    />
                                    <span>{MATCH_NAIPE_LABELS[naipe]}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 space-y-3">
                  {selectedTeams.map((team) => {
                    const selectedSportIds = selectedSportIdsByTeamId[team.id] ?? [];
                    const selectedCompetitionKeySet = selectedCompetitionKeySetByTeamId[team.id] ?? new Set<string>();

                    return (
                      <div
                        key={`team-naipe-${team.id}`}
                        className="rounded-lg bg-background/70 p-3 shadow-[0_10px_18px_rgba(15,23,42,0.16)] dark:shadow-none"
                      >
                        <p className="text-sm font-semibold">{team.name}</p>

                        {selectedSportIds.length == 0 ? (
                          <p className="mt-2 text-xs text-muted-foreground">Selecione modalidades na etapa anterior para configurar os naipes.</p>
                        ) : (
                          <div className="mt-2 space-y-3">
                            {selectedSportIds.map((sport_id) => {
                              const teamCompetitionOptions = (competitionOptionsByTeamId[team.id] ?? []).filter((competitionOption) => {
                                return competitionOption.sport_id == sport_id;
                              });

                              if (teamCompetitionOptions.length == 0) {
                                return null;
                              }

                              return (
                                <div key={`${team.id}-${sport_id}`} className="rounded-md p-2">
                                  <p className="text-xs font-semibold">
                                    {teamCompetitionOptions[0].sport_name}
                                    {teamCompetitionOptions[0].division ? ` • ${teamCompetitionOptions[0].division}` : ""}
                                  </p>

                                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {teamCompetitionOptions.map((competitionOption) => {
                                      const isSelected = selectedCompetitionKeySet.has(competitionOption.key);

                                      return (
                                        <label key={competitionOption.key} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs">
                                          <Checkbox
                                            className={SQUARE_CHECKBOX_CLASS_NAME}
                                            checked={isSelected}
                                            onCheckedChange={(checked) =>
                                              handleToggleTeamCompetition(team.id, competitionOption.key, checked == true)
                                            }
                                          />
                                          <span>{MATCH_NAIPE_LABELS[competitionOption.naipe]}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedTeams.length == 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhuma atlética selecionada. Volte para a etapa anterior e selecione participantes.
                </p>
              ) : null}
            </div>
          ) : null}

          {currentStepIndex == 3 ? (
            <div className="grid gap-3 p-1 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {activeCompetitionKeys.map((competitionKey) => {
                const competitionOption = competitionOptionsByKey.get(competitionKey);

                if (!competitionOption) {
                  return null;
                }

                const competitionConfig = competitionConfigByKey[competitionKey] ?? resolveDefaultCompetitionConfig(2);
                const participantCount = teamIdsByCompetitionKey[competitionKey]?.length ?? 0;

                return (
                  <div
                    key={competitionKey}
                    className="rounded-xl bg-background/70 p-3 shadow-[0_10px_18px_rgba(15,23,42,0.18)] dark:shadow-none"
                  >
                    <div className="space-y-0.5">
                      <p className="line-clamp-2 text-sm font-semibold">
                        {competitionOption.sport_name} • {MATCH_NAIPE_LABELS[competitionOption.naipe]}
                        {competitionOption.division ? ` • ${competitionOption.division}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">Participantes: {participantCount}</p>
                    </div>

                    <div className="mt-2 space-y-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Quantidade de chaves</Label>
                        <Input
                          type="number"
                          min={1}
                          value={competitionConfig.groups_count}
                          onChange={(event) => {
                            const groupsCount = Math.max(1, Number(event.target.value) || 1);
                            setCompetitionConfigByKey((currentCompetitionConfigByKey) => ({
                              ...currentCompetitionConfigByKey,
                              [competitionKey]: {
                                ...competitionConfig,
                                groups_count: groupsCount,
                              },
                            }));
                          }}
                          className="glass-input h-8 w-24 min-w-0 px-2 text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Classificados por chave</Label>
                        <RadioGroup
                          className="space-y-1"
                          value={competitionConfig.qualifiers_per_group == 2 ? "2" : "1"}
                          onValueChange={(value) => {
                            const qualifiersPerGroup = value == "2" ? 2 : 1;
                            setCompetitionConfigByKey((currentCompetitionConfigByKey) => ({
                              ...currentCompetitionConfigByKey,
                              [competitionKey]: {
                                ...competitionConfig,
                                qualifiers_per_group: qualifiersPerGroup,
                              },
                            }));
                          }}
                        >
                          {QUALIFIERS_PER_GROUP_OPTIONS.map((qualifiersPerGroupOption) => (
                            <Label
                              key={`${competitionKey}-qualifiers-${qualifiersPerGroupOption}`}
                              htmlFor={`${competitionKey}-qualifiers-${qualifiersPerGroupOption}`}
                              className="flex w-full items-center gap-2 rounded-md bg-background/40 px-2 py-1.5 text-[11px] font-normal"
                            >
                              <RadioGroupItem
                                id={`${competitionKey}-qualifiers-${qualifiersPerGroupOption}`}
                                value={String(qualifiersPerGroupOption)}
                              />
                              <span>{qualifiersPerGroupOption} classificado{qualifiersPerGroupOption == 1 ? "" : "s"}</span>
                            </Label>
                          ))}
                        </RadioGroup>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {currentStepIndex == 4 ? (
            <div className="space-y-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
              <div className="rounded-xl bg-background/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
                    <Checkbox
                      className={SQUARE_CHECKBOX_CLASS_NAME}
                      checked={shouldApplyGroupSelectionToAllCompetitions}
                      onCheckedChange={(checked) => setShouldApplyGroupSelectionToAllCompetitions(checked == true)}
                    />
                    Aplicar mudança de chave da atlética em todas as modalidades compatíveis
                  </label>

                  <Button size="sm" variant="outline" onClick={handleAutoAssignAllCompetitionGroups}>
                    Distribuir automaticamente tudo
                  </Button>
                </div>
              </div>

              {activeCompetitionKeys.map((competitionKey) => {
                const competitionOption = competitionOptionsByKey.get(competitionKey);
                const competitionConfig = competitionConfigByKey[competitionKey];

                if (!competitionOption || !competitionConfig) {
                  return null;
                }

                const assignments = groupAssignmentsByCompetitionKey[competitionKey] ?? {};
                const competitionTeams = competitionTeamsByCompetitionKey[competitionKey] ?? [];

                return (
                  <div key={competitionKey} className="rounded-xl bg-background/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {competitionOption.sport_name} • {MATCH_NAIPE_LABELS[competitionOption.naipe]}
                        {competitionOption.division ? ` • ${competitionOption.division}` : ""}
                      </p>

                      <Button size="sm" variant="outline" onClick={() => handleAutoAssignCompetitionGroups(competitionKey)}>
                        Auto distribuir modalidade
                      </Button>
                    </div>

                    {competitionTeams.length == 0 ? null : (
                      <div className="mt-3 overflow-x-auto pb-1">
                        <div className="min-w-max space-y-2">
                          <div className="flex items-center gap-2">
                            <p className="w-24 shrink-0 text-xs font-semibold text-muted-foreground">Atlética</p>
                            {competitionTeams.map((team) => (
                              <p
                                key={`${competitionKey}-${team.id}-label`}
                                className="w-44 shrink-0 rounded-md bg-background/40 px-2 py-1.5 text-xs font-medium"
                              >
                                {team.name}
                              </p>
                            ))}
                          </div>

                          <div className="flex items-center gap-2">
                            <p className="w-24 shrink-0 text-xs font-semibold text-muted-foreground">Chave</p>
                            {competitionTeams.map((team) => (
                              <div key={`${competitionKey}-${team.id}-assignment`} className="w-44 shrink-0">
                                <Select
                                  value={String(assignments[team.id] ?? 1)}
                                  onValueChange={(value) => {
                                    const selectedGroup = Math.max(1, Number(value) || 1);
                                    setGroupAssignmentsByCompetitionKey((currentGroupAssignmentsByCompetitionKey) => {
                                      const nextGroupAssignmentsByCompetitionKey = {
                                        ...currentGroupAssignmentsByCompetitionKey,
                                        [competitionKey]: {
                                          ...(currentGroupAssignmentsByCompetitionKey[competitionKey] ?? assignments),
                                          [team.id]: selectedGroup,
                                        },
                                      };

                                      if (!shouldApplyGroupSelectionToAllCompetitions) {
                                        return nextGroupAssignmentsByCompetitionKey;
                                      }

                                      activeCompetitionKeys.forEach((nextCompetitionKey) => {
                                        if (nextCompetitionKey == competitionKey) {
                                          return;
                                        }

                                        const nextGroupCount = competitionConfigByKey[nextCompetitionKey]?.groups_count ?? 1;
                                        if (selectedGroup > nextGroupCount) {
                                          return;
                                        }

                                        const nextCompetitionTeamIds = teamIdsByCompetitionKey[nextCompetitionKey] ?? [];
                                        if (!nextCompetitionTeamIds.includes(team.id)) {
                                          return;
                                        }

                                        nextGroupAssignmentsByCompetitionKey[nextCompetitionKey] = {
                                          ...(nextGroupAssignmentsByCompetitionKey[nextCompetitionKey] ?? {}),
                                          [team.id]: selectedGroup,
                                        };
                                      });

                                      return nextGroupAssignmentsByCompetitionKey;
                                    });
                                  }}
                                >
                                  <SelectTrigger className="glass-input">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Array.from({ length: competitionConfig.groups_count }, (_, groupIndex) => (
                                      <SelectItem key={`${competitionKey}-group-${groupIndex + 1}`} value={String(groupIndex + 1)}>
                                        Chave {groupIndex + 1}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {currentStepIndex == 5 ? (
            <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
              <label className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground">
                <Checkbox
                  className={SQUARE_CHECKBOX_CLASS_NAME}
                  checked={shouldReplicatePreviousScheduleDay}
                  onCheckedChange={(checked) => setShouldReplicatePreviousScheduleDay(checked == true)}
                />
                Replicar locais, quadras, modalidades e horários do dia anterior ao adicionar novo dia
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                {scheduleDays.map((scheduleDay, scheduleDayIndex) => (
                  <div key={scheduleDay.id} className="rounded-xl bg-background/30 p-3 shadow-[0_10px_18px_rgba(15,23,42,0.14)] dark:shadow-none">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Dia {scheduleDayIndex + 1}</p>
                      {scheduleDays.length > 1 ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeScheduleDay(scheduleDay.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : null}
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <DateTimePicker
                        value={resolveScheduleDayDateTimeValue(scheduleDay, scheduleDay.start_time)}
                        onChange={(nextStartDateTime) => {
                          if (!nextStartDateTime) {
                            return;
                          }

                          const nextDate = resolveDatePartAsString(nextStartDateTime);
                          const nextStartTime = resolveTimePartAsString(nextStartDateTime);

                          updateScheduleDay(scheduleDay.id, (scheduleDayItem) => ({
                            ...scheduleDayItem,
                            date: nextDate,
                            start_time: nextStartTime,
                          }));
                        }}
                        placeholder="Início"
                        defaultTime="08:00"
                      />

                      <DateTimePicker
                        value={resolveScheduleDayDateTimeValue(scheduleDay, scheduleDay.end_time)}
                        onChange={(nextEndDateTime) => {
                          if (!nextEndDateTime) {
                            return;
                          }

                          const nextDate = resolveDatePartAsString(nextEndDateTime);
                          const nextEndTime = resolveTimePartAsString(nextEndDateTime);

                          updateScheduleDay(scheduleDay.id, (scheduleDayItem) => ({
                            ...scheduleDayItem,
                            date: nextDate,
                            end_time: nextEndTime,
                          }));
                        }}
                        placeholder="Fim"
                        defaultTime="18:00"
                      />

                      <DateTimePicker
                        value={resolveScheduleDayDateTimeValue(scheduleDay, scheduleDay.break_start_time)}
                        onChange={(nextBreakStartDateTime) => {
                          if (!nextBreakStartDateTime) {
                            return;
                          }

                          const nextDate = resolveDatePartAsString(nextBreakStartDateTime);
                          const nextBreakStartTime = resolveTimePartAsString(nextBreakStartDateTime);

                          updateScheduleDay(scheduleDay.id, (scheduleDayItem) => ({
                            ...scheduleDayItem,
                            date: nextDate,
                            break_start_time: nextBreakStartTime,
                          }));
                        }}
                        placeholder="Início pausa (opcional)"
                        defaultTime="12:00"
                      />

                      <DateTimePicker
                        value={resolveScheduleDayDateTimeValue(scheduleDay, scheduleDay.break_end_time)}
                        onChange={(nextBreakEndDateTime) => {
                          if (!nextBreakEndDateTime) {
                            return;
                          }

                          const nextDate = resolveDatePartAsString(nextBreakEndDateTime);
                          const nextBreakEndTime = resolveTimePartAsString(nextBreakEndDateTime);

                          updateScheduleDay(scheduleDay.id, (scheduleDayItem) => ({
                            ...scheduleDayItem,
                            date: nextDate,
                            break_end_time: nextBreakEndTime,
                          }));
                        }}
                        placeholder="Fim pausa (opcional)"
                        defaultTime="13:00"
                      />
                    </div>

                    {scheduleDay.break_start_time || scheduleDay.break_end_time ? (
                      <div className="mt-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            updateScheduleDay(scheduleDay.id, (scheduleDayItem) => ({
                              ...scheduleDayItem,
                              break_start_time: "",
                              break_end_time: "",
                            }));
                          }}
                        >
                          Limpar pausa
                        </Button>
                      </div>
                    ) : null}

                    <div className="mt-4 space-y-3">
                      {scheduleDay.locations.map((location) => (
                        <div key={location.id} className="rounded-lg bg-background/50 p-3">
                          <Input
                            placeholder="Nome do local"
                            value={location.name}
                            onChange={(event) => {
                              const nextName = event.target.value;

                              updateScheduleLocation(scheduleDay.id, location.id, (locationItem) => ({
                                ...locationItem,
                                name: nextName,
                              }));
                            }}
                            className="glass-input"
                          />

                          <div className="mt-3 space-y-2">
                            {location.courts.map((court) => (
                              <div key={court.id} className="rounded-md bg-background/40 p-2">
                                <Input
                                  placeholder="Nome da quadra"
                                  value={court.name}
                                  onChange={(event) => {
                                    const nextCourtName = event.target.value;

                                    updateScheduleCourt(scheduleDay.id, location.id, court.id, (courtItem) => ({
                                      ...courtItem,
                                      name: nextCourtName,
                                    }));
                                  }}
                                  className="glass-input"
                                />

                                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                  {selectedSportOptions.map((sportOption) => {
                                    const isSelected = court.sport_ids.includes(sportOption.id);

                                    return (
                                      <label key={`${court.id}-${sportOption.id}`} className="flex items-center gap-2 rounded px-2 py-1 text-xs">
                                        <Checkbox
                                          className={SQUARE_CHECKBOX_CLASS_NAME}
                                          checked={isSelected}
                                          onCheckedChange={(checked) => {
                                            updateScheduleCourt(scheduleDay.id, location.id, court.id, (courtItem) => {
                                              if (checked == true) {
                                                if (courtItem.sport_ids.includes(sportOption.id)) {
                                                  return courtItem;
                                                }

                                                return {
                                                  ...courtItem,
                                                  sport_ids: [...courtItem.sport_ids, sportOption.id],
                                                };
                                              }

                                              return {
                                                ...courtItem,
                                                sport_ids: courtItem.sport_ids.filter((sportId) => sportId != sportOption.id),
                                              };
                                            });
                                          }}
                                        />
                                        {sportOption.name}
                                      </label>
                                    );
                                  })}
                                </div>

                                <div className="mt-2 flex justify-end">
                                  {location.courts.length > 1 ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        updateScheduleLocation(scheduleDay.id, location.id, (locationItem) => ({
                                          ...locationItem,
                                          courts: locationItem.courts.filter((courtItem) => courtItem.id != court.id),
                                        }));
                                      }}
                                    >
                                      <Trash2 className="mr-1 h-3 w-3" /> Remover quadra
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            ))}

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                updateScheduleLocation(scheduleDay.id, location.id, (locationItem) => ({
                                  ...locationItem,
                                  courts: [
                                    ...locationItem.courts,
                                    {
                                      id: resolveRandomUuid(),
                                      name: "",
                                      position: locationItem.courts.length + 1,
                                      sport_ids: [],
                                    },
                                  ],
                                }));
                              }}
                            >
                              <Plus className="mr-1 h-3 w-3" /> Adicionar quadra
                            </Button>
                          </div>

                          <div className="mt-2 flex justify-end">
                            {scheduleDay.locations.length > 1 ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  updateScheduleDay(scheduleDay.id, (scheduleDayItem) => ({
                                    ...scheduleDayItem,
                                    locations: scheduleDayItem.locations.filter((locationItem) => locationItem.id != location.id),
                                  }));
                                }}
                              >
                                <Trash2 className="mr-1 h-3 w-3" /> Remover local
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          updateScheduleDay(scheduleDay.id, (scheduleDayItem) => ({
                            ...scheduleDayItem,
                            locations: [
                              ...scheduleDayItem.locations,
                              {
                                id: resolveRandomUuid(),
                                name: "",
                                position: scheduleDayItem.locations.length + 1,
                                courts: [
                                  {
                                    id: resolveRandomUuid(),
                                    name: "",
                                    position: 1,
                                    sport_ids: [],
                                  },
                                ],
                              },
                            ],
                          }));
                        }}
                      >
                        <Plus className="mr-1 h-3 w-3" /> Adicionar local
                      </Button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-primary/40 bg-background/20 p-4 text-sm text-muted-foreground transition hover:border-primary hover:bg-background/30 hover:text-foreground"
                  onClick={handleAddScheduleDay}
                >
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Plus className="h-6 w-6" />
                  </span>
                  <span className="font-semibold">Adicionar dia</span>
                  <span className="mt-1 text-xs">
                    {shouldReplicatePreviousScheduleDay ? "Novo dia com dados replicados" : "Criar novo card de agenda"}
                  </span>
                </button>
              </div>
            </div>
          ) : null}

          {currentStepIndex == 6 ? (
            <div className="space-y-4 rounded-xl bg-background/30 p-3 text-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-transparent bg-background/50 p-3 dark:border-border/70">
                  <p className="text-xs text-muted-foreground">Atléticas participantes</p>
                  <p className="mt-1 text-lg font-semibold">{selectedTeamIds.length}</p>
                </div>
                <div className="rounded-lg border border-transparent bg-background/50 p-3 dark:border-border/70">
                  <p className="text-xs text-muted-foreground">Competições ativas</p>
                  <p className="mt-1 text-lg font-semibold">{activeCompetitionKeys.length}</p>
                </div>
                <div className="rounded-lg border border-transparent bg-background/50 p-3 dark:border-border/70">
                  <p className="text-xs text-muted-foreground">Dias de agenda</p>
                  <p className="mt-1 text-lg font-semibold">{scheduleDays.length}</p>
                </div>
              </div>

              <div className="rounded-lg border border-transparent bg-background/50 p-3 dark:border-border/70">
                <p className="text-sm font-semibold">Agenda configurada</p>
                <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                  {reviewScheduleDaySummaries.map((scheduleDaySummary) => (
                    <div
                      key={scheduleDaySummary.key}
                      className="rounded-md border border-transparent bg-background/40 px-2 py-1.5 dark:border-border/70"
                    >
                      {scheduleDaySummary.day_label}: {scheduleDaySummary.date} • {scheduleDaySummary.start_time} até{" "}
                      {scheduleDaySummary.end_time}
                      {scheduleDaySummary.break_start_time && scheduleDaySummary.break_end_time
                        ? ` • pausa ${scheduleDaySummary.break_start_time}-${scheduleDaySummary.break_end_time}`
                        : ""}
                      {" • "}
                      {scheduleDaySummary.location_count} locais •{" "}
                      {scheduleDaySummary.total_courts} quadras
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold">Visualização das chaves por modalidade</p>

                {activeCompetitionKeys.map((competitionKey) => {
                  const competitionOption = competitionOptionsByKey.get(competitionKey);
                  const competitionConfig = competitionConfigByKey[competitionKey];
                  const participantTeamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
                  const groupSummaries = reviewCompetitionGroupSummariesByCompetitionKey[competitionKey] ?? [];

                  if (!competitionOption || !competitionConfig) {
                    return null;
                  }

                  return (
                    <div
                      key={`review-${competitionKey}`}
                      className="rounded-lg border border-transparent bg-background/50 p-3 shadow-[0_10px_18px_rgba(15,23,42,0.14)] dark:shadow-none dark:border-border/70"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">
                          {competitionOption.sport_name} • {MATCH_NAIPE_LABELS[competitionOption.naipe]}
                          {competitionOption.division ? ` • ${competitionOption.division}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {participantTeamIds.length} atléticas • {competitionConfig.groups_count} chaves • {competitionConfig.qualifiers_per_group} classificados/chave
                        </p>
                      </div>

                      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {groupSummaries.map((groupSummary) => {
                          return (
                            <div
                              key={`${competitionKey}-review-group-${groupSummary.group_number}`}
                              className="rounded-md bg-background/40 p-2 shadow-[0_6px_14px_rgba(15,23,42,0.1)] dark:shadow-none"
                            >
                              <p className="text-xs font-semibold">Chave {groupSummary.group_number}</p>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {groupSummary.teams.length == 0 ? (
                                  <span className="text-[11px] text-muted-foreground">Sem atléticas</span>
                                ) : (
                                  groupSummary.teams.map((groupTeam) => (
                                    <span
                                      key={`${competitionKey}-review-group-${groupSummary.group_number}-${groupTeam.id}`}
                                      className="rounded-full bg-background/70 px-2 py-0.5 text-[11px]"
                                    >
                                      {groupTeam.name}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          </div>

          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handlePreviousStep} disabled={currentStepIndex == 0 || saving}>
                Voltar
              </Button>

              {currentStepIndex < WIZARD_STEP_LABELS.length - 1 ? (
                <Button onClick={handleNextStep} disabled={saving}>
                  Próximo
                </Button>
              ) : (
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Criar campeonato
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
