import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
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
  resolveChampionshipGroupLabel,
} from "@/lib/championship";
import { resolveRandomUuid } from "@/lib/random";
import {
  CHAMPIONSHIP_BRACKET_DEFAULT_QUALIFIERS_PER_GROUP,
} from "@/domain/championship-brackets/championshipBracket.constants";
import {
  resolveGroupEditorColumns,
  resolveOrderedAssignedTeamIds,
  sanitizeGroupAssignments,
  sanitizeGroupOrderedTeamIdsByGroupNumber,
  type ChampionshipBracketGroupEditorColumn,
  type ChampionshipBracketGroupOrderedTeamIdsByGroupNumber,
  type ChampionshipBracketGroupEditorTransientSlotIdsByGroupNumber,
} from "@/domain/championship-brackets/championshipBracketGroupEditor";
import {
  resolveChampionshipBracketWizardModalityCards,
  resolveChampionshipBracketWizardNaipeCards,
  resolveSortedChampionshipBracketCompetitionKeys,
  type ChampionshipBracketWizardCompetitionOption,
} from "@/domain/championship-brackets/championshipBracketWizardView";
import { ChampionshipBracketSetupDTO } from "@/domain/championship-brackets/ChampionshipBracketSetupDTO";
import { ChampionshipBracketWizardDraftDTO } from "@/domain/championship-brackets/ChampionshipBracketWizardDraftDTO";
import {
  clearChampionshipBracketWizardDraft,
  fetchChampionshipBracketWizardDraft,
  saveChampionshipBracketWizardDraft,
} from "@/domain/championship-brackets/championshipBracketDraft.repository";
import {
  deleteChampionshipBracketLocationTemplate,
  generateChampionshipBracketGroups,
  fetchChampionshipBracketLocationTemplates,
  saveChampionshipBracketLocationTemplate,
} from "@/domain/championship-brackets/championshipBracket.repository";
import type {
  ChampionshipBracketCompetitionInput,
  ChampionshipBracketLocationTemplate,
  ChampionshipBracketLocationTemplateSaveInput,
  ChampionshipBracketSetupFormValues,
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
  location_template_id: string | null;
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

interface LocationTemplateModalFormValue {
  id: string | null;
  name: string;
  courts: ScheduleCourtFormValue[];
}

interface LocationTemplateModalTarget {
  schedule_day_id: string;
  location_id: string | null;
  location_template_id: string | null;
}

interface LocationTemplateDeletionTarget {
  location_template_id: string;
  location_name: string;
}

const COMPETITION_DIVISION_WITHOUT_DIVISION = "WITHOUT_DIVISION";

const WIZARD_STEP_LABELS = [
  "Participantes",
  "Modalidades",
  "Naipes",
  "Configuração de Grupos",
  "Distribuição Manual",
  "Agenda",
  "Revisão",
] as const;

const SQUARE_CHECKBOX_CLASS_NAME = "h-4 w-4 rounded-[3px]";
const QUALIFIERS_PER_GROUP_OPTIONS = [1, 2] as const;
const WIZARD_NAIPE_TAB_DEFAULT_ORDER = [MatchNaipe.MASCULINO, MatchNaipe.FEMININO, MatchNaipe.MISTO] as const;

interface AnimatedTabItem {
  value: string;
  label: string;
  test_id?: string;
}

interface AnimatedTabBarProps {
  items: AnimatedTabItem[];
  value: string;
  onValueChange: (value: string) => void;
}

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

function resolveCheckboxCheckedState(selected_count: number, eligible_count: number): boolean | "indeterminate" {
  if (eligible_count == 0 || selected_count == 0) {
    return false;
  }

  if (selected_count == eligible_count) {
    return true;
  }

  return "indeterminate";
}

function resolveDefaultWizardNaipeTabValue(naipes: MatchNaipe[]): MatchNaipe | null {
  return WIZARD_NAIPE_TAB_DEFAULT_ORDER.find((naipe) => naipes.includes(naipe)) ?? null;
}

function AnimatedTabBar({ items, value, onValueChange }: AnimatedTabBarProps) {
  const containerReference = useRef<HTMLDivElement | null>(null);
  const buttonByValueReference = useRef<Record<string, HTMLButtonElement | null>>({});
  const [activeIndicatorLeft, setActiveIndicatorLeft] = useState(0);
  const [activeIndicatorWidth, setActiveIndicatorWidth] = useState(0);
  const [showActiveIndicator, setShowActiveIndicator] = useState(false);

  const updateActiveIndicator = useCallback(() => {
    if (!containerReference.current) {
      setShowActiveIndicator(false);
      return;
    }

    const activeButtonElement = buttonByValueReference.current[value];

    if (!activeButtonElement) {
      setShowActiveIndicator(false);
      return;
    }

    const containerRect = containerReference.current.getBoundingClientRect();
    const buttonRect = activeButtonElement.getBoundingClientRect();

    setActiveIndicatorLeft(buttonRect.left - containerRect.left);
    setActiveIndicatorWidth(buttonRect.width);
    setShowActiveIndicator(true);
  }, [value]);

  useLayoutEffect(() => {
    const animationFrameId = requestAnimationFrame(updateActiveIndicator);
    return () => cancelAnimationFrame(animationFrameId);
  }, [items, updateActiveIndicator]);

  useEffect(() => {
    window.addEventListener("resize", updateActiveIndicator);
    return () => window.removeEventListener("resize", updateActiveIndicator);
  }, [updateActiveIndicator]);

  return (
    <div className="flex justify-center">
      <div
        ref={containerReference}
        role="tablist"
        className="glass-chip relative inline-flex max-w-full items-center gap-0 overflow-x-auto rounded-xl p-0"
      >
        <span
          className="pointer-events-none absolute inset-y-0 left-0 rounded-xl bg-primary/20 backdrop-blur-2xl transition-[transform,width,opacity] duration-500"
          style={{
            width: `${activeIndicatorWidth}px`,
            transform: `translateX(${activeIndicatorLeft}px)`,
            opacity: showActiveIndicator ? 1 : 0,
            transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />

        {items.map((item) => {
          const isSelected = value == item.value;

          return (
            <button
              key={item.value}
              ref={(buttonElement) => {
                buttonByValueReference.current[item.value] = buttonElement;
              }}
              type="button"
              role="tab"
              data-testid={item.test_id}
              aria-selected={isSelected}
              className={`relative z-10 whitespace-nowrap rounded-none px-3 py-1.5 text-sm font-medium transition-colors first:rounded-l-xl last:rounded-r-xl ${
                isSelected ? "text-primary" : "text-secondary-foreground hover:text-foreground"
              }`}
              onClick={() => onValueChange(item.value)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function resolveInitialScheduleCourt(): ScheduleCourtFormValue {
  return {
    id: resolveRandomUuid(),
    name: "",
    position: 1,
    sport_ids: [],
  };
}

function resolveInitialScheduleDay(): ScheduleDayFormValue {
  return {
    id: resolveRandomUuid(),
    date: "",
    start_time: "08:00",
    end_time: "18:00",
    break_start_time: "",
    break_end_time: "",
    locations: [],
  };
}

function resolveReplicatedScheduleDay(previousScheduleDay: ScheduleDayFormValue): ScheduleDayFormValue {
  return {
    id: resolveRandomUuid(),
    date: "",
    start_time: previousScheduleDay.start_time,
    end_time: previousScheduleDay.end_time,
    break_start_time: "",
    break_end_time: "",
    locations: previousScheduleDay.locations.map((location, locationIndex) => ({
      id: resolveRandomUuid(),
      location_template_id: location.location_template_id,
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
    location_template_id: schedule_location.location_template_id,
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
    should_replicate_previous_schedule_day: false,
    competition_config_by_key: {},
    group_assignments_by_competition_key: {},
    group_order_by_competition_key: {},
    schedule_days: [resolveInitialScheduleDay()],
  };
}

function resolveInitialLocationTemplateModalFormValue(): LocationTemplateModalFormValue {
  return {
    id: null,
    name: "",
    courts: [resolveInitialScheduleCourt()],
  };
}

function resolveLocationTemplateModalFormValueFromTemplate(
  location_template: ChampionshipBracketLocationTemplate,
): LocationTemplateModalFormValue {
  return {
    id: location_template.id,
    name: location_template.name,
    courts: location_template.courts.map((court) => ({
      id: court.id,
      name: court.name,
      position: court.position,
      sport_ids: [...court.sport_ids],
    })),
  };
}

function resolveLocationTemplateModalFormValueFromScheduleLocation(
  schedule_location: ScheduleLocationFormValue,
): LocationTemplateModalFormValue {
  return {
    id: schedule_location.location_template_id,
    name: schedule_location.name,
    courts: schedule_location.courts.map((court) => ({
      id: court.id,
      name: court.name,
      position: court.position,
      sport_ids: [...court.sport_ids],
    })),
  };
}

function resolveScheduleLocationFromTemplate(
  location_template: ChampionshipBracketLocationTemplate,
  location_id = resolveRandomUuid(),
  position = 1,
): ScheduleLocationFormValue {
  return {
    id: location_id,
    location_template_id: location_template.id,
    name: location_template.name,
    position,
    courts: location_template.courts.map((court, courtIndex) => ({
      id: resolveRandomUuid(),
      name: court.name,
      position: courtIndex + 1,
      sport_ids: [...court.sport_ids],
    })),
  };
}

function resolveScheduleLocationCourtCountSummaryBySport(
  schedule_location: ScheduleLocationFormValue,
  competition_options: ChampionshipBracketWizardCompetitionOption[],
): string {
  const sportNameBySportId = competition_options.reduce<Record<string, string>>((carry, competitionOption) => {
    carry[competitionOption.sport_id] = competitionOption.sport_name;
    return carry;
  }, {});

  const courtCountBySportName = schedule_location.courts.reduce<Record<string, number>>((carry, court) => {
    const supportedSportNames = [...new Set(court.sport_ids.map((sportId) => sportNameBySportId[sportId]).filter(Boolean))];

    supportedSportNames.forEach((sportName) => {
      carry[sportName] = (carry[sportName] ?? 0) + 1;
    });

    return carry;
  }, {});

  return Object.entries(courtCountBySportName)
    .sort(([leftSportName], [rightSportName]) => leftSportName.localeCompare(rightSportName, "pt-BR", { sensitivity: "base" }))
    .map(([sportName, courtCount]) => {
      return `${courtCount} quadra${courtCount == 1 ? "" : "s"} ${sportName}`;
    })
    .join(" • ");
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

function resolveEditableDraftSnapshot(draft_form_values: ChampionshipBracketWizardDraftFormValues): string {
  const normalized_draft = ChampionshipBracketWizardDraftDTO.fromFormValues(draft_form_values).bindToSave();

  return JSON.stringify({
    ...normalized_draft,
    current_step_index: 0,
  });
}

function resolveCompetitionGroupSlotSelectionKey(competitionKey: string, groupNumber: number, slotId: string): string {
  return `${competitionKey}::${groupNumber}::${slotId}`;
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
  const [shouldReplicatePreviousScheduleDay, setShouldReplicatePreviousScheduleDay] = useState(false);
  const [competitionConfigByKey, setCompetitionConfigByKey] = useState<Record<string, CompetitionConfig>>({});
  const [groupAssignmentsByCompetitionKey, setGroupAssignmentsByCompetitionKey] = useState<Record<string, Record<string, number>>>({});
  const [groupOrderByCompetitionKey, setGroupOrderByCompetitionKey] = useState<
    Record<string, ChampionshipBracketGroupOrderedTeamIdsByGroupNumber>
  >({});
  const [autoOpenCompetitionGroupSlotKey, setAutoOpenCompetitionGroupSlotKey] = useState<string | null>(null);
  const [activeNaipeTabBySportId, setActiveNaipeTabBySportId] = useState<Record<string, MatchNaipe>>({});
  const [transientGroupSlotIdsByCompetitionKey, setTransientGroupSlotIdsByCompetitionKey] = useState<
    Record<string, ChampionshipBracketGroupEditorTransientSlotIdsByGroupNumber>
  >({});
  const [scheduleDays, setScheduleDays] = useState<ScheduleDayFormValue[]>([resolveInitialScheduleDay()]);
  const [locationTemplates, setLocationTemplates] = useState<ChampionshipBracketLocationTemplate[]>([]);
  const [locationTemplatesLoading, setLocationTemplatesLoading] = useState(false);
  const [locationTemplatePickerDayId, setLocationTemplatePickerDayId] = useState<string | null>(null);
  const [locationTemplateModalOpen, setLocationTemplateModalOpen] = useState(false);
  const [locationTemplateModalTarget, setLocationTemplateModalTarget] = useState<LocationTemplateModalTarget | null>(null);
  const [locationTemplateModalFormValues, setLocationTemplateModalFormValues] = useState<LocationTemplateModalFormValue>(
    resolveInitialLocationTemplateModalFormValue(),
  );
  const [locationTemplateDeletionTarget, setLocationTemplateDeletionTarget] = useState<LocationTemplateDeletionTarget | null>(null);
  const [savingLocationTemplate, setSavingLocationTemplate] = useState(false);
  const [deletingLocationTemplate, setDeletingLocationTemplate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErrorBannerData, setSaveErrorBannerData] = useState<SaveErrorBannerData | null>(null);
  const [hasResolvedInitialDraftSnapshot, setHasResolvedInitialDraftSnapshot] = useState(false);
  const [lastSavedEditableDraftSnapshot, setLastSavedEditableDraftSnapshot] = useState<string>(() => {
    return resolveEditableDraftSnapshot(resolveInitialWizardDraftFormValues());
  });
  const saveErrorBannerReference = useRef<HTMLDivElement | null>(null);

  const applyWizardDraft = useCallback((draft_form_values: ChampionshipBracketWizardDraftFormValues) => {
    const nextCurrentStepIndex = Math.max(0, Math.min(draft_form_values.current_step_index, WIZARD_STEP_LABELS.length - 1));
    const resolvedScheduleDays =
      draft_form_values.schedule_days.length > 0
        ? draft_form_values.schedule_days.map((schedule_day) => resolveScheduleDayClone(schedule_day))
        : [resolveInitialScheduleDay()];
    const appliedDraftFormValues: ChampionshipBracketWizardDraftFormValues = {
      ...draft_form_values,
      current_step_index: nextCurrentStepIndex,
      schedule_days: resolvedScheduleDays.map((schedule_day) => resolveScheduleDayClone(schedule_day)),
    };

    setCurrentStepIndex(nextCurrentStepIndex);
    setSelectedTeamIds(draft_form_values.selected_team_ids);
    setSelectedSportIdsByTeamId(draft_form_values.selected_sport_ids_by_team_id);
    setSelectedCompetitionKeysByTeamId(draft_form_values.selected_competition_keys_by_team_id);
    setShouldApplyModalitiesToAllTeams(draft_form_values.should_apply_modalities_to_all_teams);
    setShouldApplyNaipesToAllTeams(draft_form_values.should_apply_naipes_to_all_teams);
    setShouldReplicatePreviousScheduleDay(draft_form_values.should_replicate_previous_schedule_day);
    setCompetitionConfigByKey(draft_form_values.competition_config_by_key);
    setGroupAssignmentsByCompetitionKey(draft_form_values.group_assignments_by_competition_key);
    setGroupOrderByCompetitionKey(draft_form_values.group_order_by_competition_key);
    setAutoOpenCompetitionGroupSlotKey(null);
    setActiveNaipeTabBySportId({});
    setTransientGroupSlotIdsByCompetitionKey({});
    setLocationTemplatePickerDayId(null);
    setLocationTemplateModalOpen(false);
    setLocationTemplateModalTarget(null);
    setLocationTemplateModalFormValues(resolveInitialLocationTemplateModalFormValue());
    setLocationTemplateDeletionTarget(null);
    setScheduleDays(resolvedScheduleDays);
    setSaveErrorBannerData(null);
    setLastSavedEditableDraftSnapshot(resolveEditableDraftSnapshot(appliedDraftFormValues));
    setHasResolvedInitialDraftSnapshot(true);
  }, []);

  const resetWizardState = useCallback(() => {
    applyWizardDraft(resolveInitialWizardDraftFormValues());
  }, [applyWizardDraft]);

  const loadLocationTemplates = useCallback(async () => {
    setLocationTemplatesLoading(true);

    const response = await fetchChampionshipBracketLocationTemplates();

    if (response.error) {
      toast.error(response.error.message || "Não foi possível carregar os locais cadastrados.");
      setLocationTemplatesLoading(false);
      return;
    }

    setLocationTemplates(response.data);
    setLocationTemplatesLoading(false);
  }, []);

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
      group_order_by_competition_key: Object.entries(groupOrderByCompetitionKey).reduce<
        Record<string, ChampionshipBracketGroupOrderedTeamIdsByGroupNumber>
      >((carry, [competition_key, ordered_team_ids_by_group_number]) => {
        carry[competition_key] = Object.entries(ordered_team_ids_by_group_number).reduce<
          ChampionshipBracketGroupOrderedTeamIdsByGroupNumber
        >((groupCarry, [group_number, team_ids]) => {
          groupCarry[group_number] = [...team_ids];
          return groupCarry;
        }, {});
        return carry;
      }, {}),
      schedule_days: scheduleDays.map((schedule_day) => resolveScheduleDayClone(schedule_day)),
    };
  }, [
    competitionConfigByKey,
    currentStepIndex,
    groupAssignmentsByCompetitionKey,
    groupOrderByCompetitionKey,
    scheduleDays,
    selectedCompetitionKeysByTeamId,
    selectedSportIdsByTeamId,
    selectedTeamIds,
    shouldApplyModalitiesToAllTeams,
    shouldApplyNaipesToAllTeams,
    shouldReplicatePreviousScheduleDay,
  ]);

  const currentWizardDraftFormValues = useMemo(() => {
    return resolveWizardDraftFormValues();
  }, [resolveWizardDraftFormValues]);

  const currentEditableDraftSnapshot = useMemo(() => {
    return resolveEditableDraftSnapshot(currentWizardDraftFormValues);
  }, [currentWizardDraftFormValues]);

  const isDraftSaveDisabled =
    saving || !hasResolvedInitialDraftSnapshot || currentEditableDraftSnapshot == lastSavedEditableDraftSnapshot;

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadLocationTemplates();

    const stored_draft = fetchChampionshipBracketWizardDraft(selectedChampionship.id);

    if (stored_draft) {
      applyWizardDraft(stored_draft);
      toast.success("Rascunho restaurado com sucesso.");
      return;
    }

    resetWizardState();
  }, [applyWizardDraft, loadLocationTemplates, open, resetWizardState, selectedChampionship.id]);

  useEffect(() => {
    if (!open) {
      setHasResolvedInitialDraftSnapshot(false);
    }
  }, [open]);

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
    if (errorMessage.includes("local compatível")) {
      return "Sugestão: revise os locais da etapa de agenda e confirme se cada modalidade tem ao menos um local compatível.";
    }

    return "Sugestão: revise as configurações das etapas anteriores e tente novamente.";
  }, []);

  const selectableTeams = useMemo(() => {
    return teams
      .filter((team) => {
        return team.division == TeamDivision.DIVISAO_PRINCIPAL || team.division == TeamDivision.DIVISAO_ACESSO;
      })
      .sort((firstTeam, secondTeam) => firstTeam.name.localeCompare(secondTeam.name, "pt-BR", { sensitivity: "base" }));
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

  const teamNameById = useMemo(() => {
    return teams.reduce<Record<string, string>>((carry, team) => {
      carry[team.id] = team.name;
      return carry;
    }, {});
  }, [teams]);

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

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
  }, [hasResolvedInitialDraftSnapshot, selectableTeamIds]);

  const competitionOptionsByTeamId = useMemo(() => {
    const nextCompetitionOptionsByTeamId: Record<string, ChampionshipBracketWizardCompetitionOption[]> = {};

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
          } as ChampionshipBracketWizardCompetitionOption;
        });
      });
    });

    return nextCompetitionOptionsByTeamId;
  }, [championshipSports, selectedChampionship.uses_divisions, selectedTeams]);

  const competitionOptionsByKey = useMemo(() => {
    const map = new Map<string, ChampionshipBracketWizardCompetitionOption>();

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

  const sortedActiveCompetitionKeys = useMemo(() => {
    return resolveSortedChampionshipBracketCompetitionKeys(activeCompetitionKeys, competitionOptionsByKey);
  }, [activeCompetitionKeys, competitionOptionsByKey]);

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

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
  }, [activeCompetitionKeys, hasResolvedInitialDraftSnapshot, teamIdsByCompetitionKey]);

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    setGroupAssignmentsByCompetitionKey((previousGroupAssignmentsByCompetitionKey) => {
      const nextGroupAssignmentsByCompetitionKey: Record<string, Record<string, number>> = {};

      activeCompetitionKeys.forEach((competitionKey) => {
        const teamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
        const groupCount = competitionConfigByKey[competitionKey]?.groups_count ?? 1;
        const previousAssignments = previousGroupAssignmentsByCompetitionKey[competitionKey] ?? {};

        nextGroupAssignmentsByCompetitionKey[competitionKey] = sanitizeGroupAssignments({
          participant_team_ids: teamIds,
          group_assignments: previousAssignments,
          groups_count: groupCount,
        });
      });

      return nextGroupAssignmentsByCompetitionKey;
    });
  }, [activeCompetitionKeys, competitionConfigByKey, hasResolvedInitialDraftSnapshot, teamIdsByCompetitionKey]);

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    setGroupOrderByCompetitionKey((currentGroupOrderByCompetitionKey) => {
      const nextGroupOrderByCompetitionKey: Record<string, ChampionshipBracketGroupOrderedTeamIdsByGroupNumber> = {};

      activeCompetitionKeys.forEach((competitionKey) => {
        const nextOrderedTeamIdsByGroupNumber = sanitizeGroupOrderedTeamIdsByGroupNumber({
          participant_team_ids: teamIdsByCompetitionKey[competitionKey] ?? [],
          group_assignments: groupAssignmentsByCompetitionKey[competitionKey] ?? {},
          groups_count: competitionConfigByKey[competitionKey]?.groups_count ?? 1,
          ordered_team_ids_by_group_number: currentGroupOrderByCompetitionKey[competitionKey] ?? {},
        });

        if (Object.keys(nextOrderedTeamIdsByGroupNumber).length == 0) {
          return;
        }

        nextGroupOrderByCompetitionKey[competitionKey] = nextOrderedTeamIdsByGroupNumber;
      });

      return nextGroupOrderByCompetitionKey;
    });
  }, [activeCompetitionKeys, competitionConfigByKey, groupAssignmentsByCompetitionKey, hasResolvedInitialDraftSnapshot, teamIdsByCompetitionKey]);

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    setTransientGroupSlotIdsByCompetitionKey((currentTransientGroupSlotIdsByCompetitionKey) => {
      const nextTransientGroupSlotIdsByCompetitionKey: Record<string, ChampionshipBracketGroupEditorTransientSlotIdsByGroupNumber> = {};

      activeCompetitionKeys.forEach((competitionKey) => {
        const groupsCount = competitionConfigByKey[competitionKey]?.groups_count ?? 1;
        const currentTransientSlotIdsByGroupNumber = currentTransientGroupSlotIdsByCompetitionKey[competitionKey] ?? {};
        const nextTransientSlotIdsByGroupNumber = Array.from({ length: groupsCount }, (_, groupIndex) => {
          const groupNumber = groupIndex + 1;
          const slotIds = currentTransientSlotIdsByGroupNumber[String(groupNumber)] ?? [];

          return [String(groupNumber), slotIds] as const;
        }).reduce<ChampionshipBracketGroupEditorTransientSlotIdsByGroupNumber>((carry, [groupNumber, slotIds]) => {
          if (slotIds.length == 0) {
            return carry;
          }

          carry[groupNumber] = slotIds;
          return carry;
        }, {});

        if (Object.keys(nextTransientSlotIdsByGroupNumber).length == 0) {
          return;
        }

        nextTransientGroupSlotIdsByCompetitionKey[competitionKey] = nextTransientSlotIdsByGroupNumber;
      });

      return nextTransientGroupSlotIdsByCompetitionKey;
    });
  }, [activeCompetitionKeys, competitionConfigByKey, hasResolvedInitialDraftSnapshot]);

  const selectedSportOptions = useMemo(() => {
    const sportsById = new Map<string, { id: string; name: string }>();

    activeCompetitionKeys.forEach((competitionKey) => {
      const competitionOption = competitionOptionsByKey.get(competitionKey);

      if (!competitionOption) {
        return;
      }

      sportsById.set(competitionOption.sport_id, {
        id: competitionOption.sport_id,
        name: competitionOption.sport_name,
      });
    });

    return [...sportsById.values()].sort((leftSportOption, rightSportOption) =>
      leftSportOption.name.localeCompare(rightSportOption.name, "pt-BR", { sensitivity: "base" }),
    );
  }, [activeCompetitionKeys, competitionOptionsByKey]);

  const locationTemplateById = useMemo(() => {
    return locationTemplates.reduce<Record<string, ChampionshipBracketLocationTemplate>>((carry, locationTemplate) => {
      carry[locationTemplate.id] = locationTemplate;
      return carry;
    }, {});
  }, [locationTemplates]);

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

  const modalityCards = useMemo(() => {
    return resolveChampionshipBracketWizardModalityCards({
      championship_sports: championshipSports,
      selected_teams: selectedTeams,
      selected_sport_ids_by_team_id: selectedSportIdsByTeamId,
      competition_options_by_team_id: competitionOptionsByTeamId,
    });
  }, [championshipSports, competitionOptionsByTeamId, selectedSportIdsByTeamId, selectedTeams]);

  const naipeCards = useMemo(() => {
    return resolveChampionshipBracketWizardNaipeCards({
      championship_sports: championshipSports,
      selected_teams: selectedTeams,
      selected_sport_ids_by_team_id: selectedSportIdsByTeamId,
      selected_competition_keys_by_team_id: selectedCompetitionKeysByTeamId,
      competition_options_by_team_id: competitionOptionsByTeamId,
    });
  }, [
    championshipSports,
    competitionOptionsByTeamId,
    selectedCompetitionKeysByTeamId,
    selectedSportIdsByTeamId,
    selectedTeams,
  ]);

  useEffect(() => {
    setActiveNaipeTabBySportId((currentActiveNaipeTabBySportId) => {
      const nextActiveNaipeTabBySportId = naipeCards.reduce<Record<string, MatchNaipe>>((carry, naipeCard) => {
        const supportedNaipes = naipeCard.tabs.map((tab) => tab.naipe);
        const currentActiveNaipe = currentActiveNaipeTabBySportId[naipeCard.sport_id];

        if (currentActiveNaipe && supportedNaipes.includes(currentActiveNaipe)) {
          carry[naipeCard.sport_id] = currentActiveNaipe;
          return carry;
        }

        const defaultNaipe = resolveDefaultWizardNaipeTabValue(supportedNaipes);

        if (defaultNaipe) {
          carry[naipeCard.sport_id] = defaultNaipe;
        }

        return carry;
      }, {});

      const currentActiveNaipeKeys = Object.keys(currentActiveNaipeTabBySportId);
      const nextActiveNaipeKeys = Object.keys(nextActiveNaipeTabBySportId);

      if (
        currentActiveNaipeKeys.length == nextActiveNaipeKeys.length &&
        nextActiveNaipeKeys.every((sportId) => currentActiveNaipeTabBySportId[sportId] == nextActiveNaipeTabBySportId[sportId])
      ) {
        return currentActiveNaipeTabBySportId;
      }

      return nextActiveNaipeTabBySportId;
    });
  }, [naipeCards]);

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

  const modalitySelectionSummary = useMemo(() => {
    const eligibleModalitiesCount = modalityCards.reduce((total, modalityCard) => total + modalityCard.eligible_team_count, 0);
    const selectedModalitiesCount = modalityCards.reduce((total, modalityCard) => total + modalityCard.selected_team_count, 0);

    return {
      eligible_modalities_count: eligibleModalitiesCount,
      selected_modalities_count: selectedModalitiesCount,
      are_all_selected: eligibleModalitiesCount > 0 && selectedModalitiesCount == eligibleModalitiesCount,
      has_at_least_one_selected: selectedModalitiesCount > 0,
    };
  }, [modalityCards]);

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

  const handleToggleModalityCardSelection = (sport_id: string, checked: boolean) => {
    setSelectedSportIdsByTeamId((currentSelectedSportIdsByTeamId) => {
      const nextSelectedSportIdsByTeamId = { ...currentSelectedSportIdsByTeamId };

      selectedTeamIds.forEach((team_id) => {
        const teamSupportsSport = (sportOptionsByTeamId[team_id] ?? []).some((sportOption) => sportOption.id == sport_id);

        if (!teamSupportsSport) {
          return;
        }

        const selectedSportIds = nextSelectedSportIdsByTeamId[team_id] ?? [];

        if (checked) {
          if (!selectedSportIds.includes(sport_id)) {
            nextSelectedSportIdsByTeamId[team_id] = [...selectedSportIds, sport_id];
          }

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

  const naipeSelectionSummary = useMemo(() => {
    const eligibleNaipesCount = naipeCards.reduce((total, naipeCard) => {
      return total + naipeCard.tabs.reduce((tabTotal, tab) => tabTotal + tab.eligible_team_count, 0);
    }, 0);
    const selectedNaipesCount = naipeCards.reduce((total, naipeCard) => {
      return total + naipeCard.tabs.reduce((tabTotal, tab) => tabTotal + tab.selected_team_count, 0);
    }, 0);

    return {
      eligible_naipes_count: eligibleNaipesCount,
      selected_naipes_count: selectedNaipesCount,
      are_all_selected: eligibleNaipesCount > 0 && selectedNaipesCount == eligibleNaipesCount,
      has_at_least_one_selected: selectedNaipesCount > 0,
    };
  }, [naipeCards]);

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

  const handleToggleNaipeTabSelection = (sport_id: string, naipe: MatchNaipe, checked: boolean) => {
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

  const competitionGroupEditorColumnsByCompetitionKey = useMemo(() => {
    return activeCompetitionKeys.reduce<Record<string, ChampionshipBracketGroupEditorColumn[]>>((carry, competitionKey) => {
      const participantTeamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
      const groupsCount = competitionConfigByKey[competitionKey]?.groups_count ?? 1;

      carry[competitionKey] = resolveGroupEditorColumns({
        participant_team_ids: participantTeamIds,
        group_assignments: groupAssignmentsByCompetitionKey[competitionKey] ?? {},
        groups_count: groupsCount,
        ordered_team_ids_by_group_number: groupOrderByCompetitionKey[competitionKey] ?? {},
        transient_slot_ids_by_group_number: transientGroupSlotIdsByCompetitionKey[competitionKey] ?? {},
      });

      return carry;
    }, {});
  }, [
    activeCompetitionKeys,
    competitionConfigByKey,
    groupAssignmentsByCompetitionKey,
    groupOrderByCompetitionKey,
    teamIdsByCompetitionKey,
    transientGroupSlotIdsByCompetitionKey,
  ]);

  const resolveCurrentOrderedTeamIdsForGroup = useCallback(
    (
      competitionKey: string,
      groupNumber: number,
      orderedTeamIdsByGroupNumber = groupOrderByCompetitionKey[competitionKey] ?? {},
    ): string[] => {
      return resolveOrderedAssignedTeamIds({
        participant_team_ids: teamIdsByCompetitionKey[competitionKey] ?? [],
        group_assignments: groupAssignmentsByCompetitionKey[competitionKey] ?? {},
        ordered_team_ids_by_group_number: orderedTeamIdsByGroupNumber,
        group_number: groupNumber,
      });
    },
    [groupAssignmentsByCompetitionKey, groupOrderByCompetitionKey, teamIdsByCompetitionKey],
  );

  const handleAddCompetitionGroupSlot = (competitionKey: string, groupNumber: number) => {
    const nextSlotId = resolveRandomUuid();

    setTransientGroupSlotIdsByCompetitionKey((currentTransientGroupSlotIdsByCompetitionKey) => ({
      ...currentTransientGroupSlotIdsByCompetitionKey,
      [competitionKey]: {
        ...(currentTransientGroupSlotIdsByCompetitionKey[competitionKey] ?? {}),
        [String(groupNumber)]: [
          ...((currentTransientGroupSlotIdsByCompetitionKey[competitionKey] ?? {})[String(groupNumber)] ?? []),
          nextSlotId,
        ],
      },
    }));
    setAutoOpenCompetitionGroupSlotKey(resolveCompetitionGroupSlotSelectionKey(competitionKey, groupNumber, nextSlotId));
  };

  const handleRemoveCompetitionGroupSlot = (competitionKey: string, groupNumber: number, slotId: string) => {
    const slotSelectionKey = resolveCompetitionGroupSlotSelectionKey(competitionKey, groupNumber, slotId);

    setTransientGroupSlotIdsByCompetitionKey((currentTransientGroupSlotIdsByCompetitionKey) => {
      const currentTransientSlotIdsByGroupNumber = currentTransientGroupSlotIdsByCompetitionKey[competitionKey] ?? {};
      const nextTransientSlotIds = (currentTransientSlotIdsByGroupNumber[String(groupNumber)] ?? []).filter(
        (currentSlotId) => currentSlotId != slotId,
      );
      const nextTransientSlotIdsByGroupNumber = Object.entries(currentTransientSlotIdsByGroupNumber).reduce<
        ChampionshipBracketGroupEditorTransientSlotIdsByGroupNumber
      >((carry, [currentGroupNumber, currentSlotIds]) => {
        if (currentGroupNumber != String(groupNumber) && currentSlotIds.length > 0) {
          carry[currentGroupNumber] = currentSlotIds;
        }

        return carry;
      }, {});

      if (nextTransientSlotIds.length > 0) {
        nextTransientSlotIdsByGroupNumber[String(groupNumber)] = nextTransientSlotIds;
      }

      if (Object.keys(nextTransientSlotIdsByGroupNumber).length == 0) {
        const { [competitionKey]: _removedCompetitionKey, ...remainingTransientGroupSlotIdsByCompetitionKey } =
          currentTransientGroupSlotIdsByCompetitionKey;

        return remainingTransientGroupSlotIdsByCompetitionKey;
      }

      return {
        ...currentTransientGroupSlotIdsByCompetitionKey,
        [competitionKey]: nextTransientSlotIdsByGroupNumber,
      };
    });
    setAutoOpenCompetitionGroupSlotKey((currentAutoOpenCompetitionGroupSlotKey) => {
      return currentAutoOpenCompetitionGroupSlotKey == slotSelectionKey ? null : currentAutoOpenCompetitionGroupSlotKey;
    });
  };

  const handleSelectCompetitionGroupTeam = (
    competitionKey: string,
    groupNumber: number,
    nextTeamId: string,
    currentTeamId: string | null,
    slotId: string,
  ) => {
    setAutoOpenCompetitionGroupSlotKey((currentAutoOpenCompetitionGroupSlotKey) => {
      const slotSelectionKey = resolveCompetitionGroupSlotSelectionKey(competitionKey, groupNumber, slotId);
      return currentAutoOpenCompetitionGroupSlotKey == slotSelectionKey ? null : currentAutoOpenCompetitionGroupSlotKey;
    });

    setGroupAssignmentsByCompetitionKey((currentGroupAssignmentsByCompetitionKey) => {
      const nextAssignments = {
        ...(currentGroupAssignmentsByCompetitionKey[competitionKey] ?? {}),
      };

      if (currentTeamId) {
        delete nextAssignments[currentTeamId];
      }

      nextAssignments[nextTeamId] = groupNumber;

      return {
        ...currentGroupAssignmentsByCompetitionKey,
        [competitionKey]: nextAssignments,
      };
    });

    setGroupOrderByCompetitionKey((currentGroupOrderByCompetitionKey) => {
      const currentOrderedTeamIdsByGroupNumber = currentGroupOrderByCompetitionKey[competitionKey] ?? {};
      const currentOrderedTeamIds = resolveCurrentOrderedTeamIdsForGroup(
        competitionKey,
        groupNumber,
        currentOrderedTeamIdsByGroupNumber,
      );
      const nextOrderedTeamIds = currentTeamId
        ? currentOrderedTeamIds.includes(currentTeamId)
          ? currentOrderedTeamIds.map((teamId) => (teamId == currentTeamId ? nextTeamId : teamId))
          : [...currentOrderedTeamIds, nextTeamId]
        : [...currentOrderedTeamIds, nextTeamId];
      const deduplicatedOrderedTeamIds = nextOrderedTeamIds.filter((teamId, teamIndex, currentTeamIds) => {
        return currentTeamIds.indexOf(teamId) == teamIndex;
      });

      return {
        ...currentGroupOrderByCompetitionKey,
        [competitionKey]: {
          ...currentOrderedTeamIdsByGroupNumber,
          [String(groupNumber)]: deduplicatedOrderedTeamIds,
        },
      };
    });

    if (!currentTeamId) {
      handleRemoveCompetitionGroupSlot(competitionKey, groupNumber, slotId);
    }
  };

  const handleRemoveCompetitionGroupTeam = (competitionKey: string, teamId: string) => {
    const currentGroupNumber = groupAssignmentsByCompetitionKey[competitionKey]?.[teamId] ?? null;

    setGroupAssignmentsByCompetitionKey((currentGroupAssignmentsByCompetitionKey) => {
      const currentAssignments = currentGroupAssignmentsByCompetitionKey[competitionKey] ?? {};
      const nextAssignments = Object.entries(currentAssignments).reduce<Record<string, number>>((carry, [currentTeamId, groupNumber]) => {
        if (currentTeamId != teamId) {
          carry[currentTeamId] = groupNumber;
        }

        return carry;
      }, {});

      return {
        ...currentGroupAssignmentsByCompetitionKey,
        [competitionKey]: nextAssignments,
      };
    });

    if (currentGroupNumber != null) {
      setGroupOrderByCompetitionKey((currentGroupOrderByCompetitionKey) => {
        const currentOrderedTeamIdsByGroupNumber = currentGroupOrderByCompetitionKey[competitionKey] ?? {};
        const nextOrderedTeamIds = (currentOrderedTeamIdsByGroupNumber[String(currentGroupNumber)] ?? []).filter(
          (currentTeamId) => currentTeamId != teamId,
        );
        const nextOrderedTeamIdsByGroupNumber = Object.entries(currentOrderedTeamIdsByGroupNumber).reduce<
          ChampionshipBracketGroupOrderedTeamIdsByGroupNumber
        >((carry, [groupNumber, currentTeamIds]) => {
          if (groupNumber == String(currentGroupNumber)) {
            if (nextOrderedTeamIds.length > 0) {
              carry[groupNumber] = nextOrderedTeamIds;
            }

            return carry;
          }

          if (currentTeamIds.length > 0) {
            carry[groupNumber] = currentTeamIds;
          }

          return carry;
        }, {});

        if (Object.keys(nextOrderedTeamIdsByGroupNumber).length == 0) {
          const { [competitionKey]: _removedCompetitionKey, ...remainingGroupOrderByCompetitionKey } = currentGroupOrderByCompetitionKey;
          return remainingGroupOrderByCompetitionKey;
        }

        return {
          ...currentGroupOrderByCompetitionKey,
          [competitionKey]: nextOrderedTeamIdsByGroupNumber,
        };
      });
    }
  };

  const handleAutoAssignCompetitionGroups = (competitionKey: string) => {
    const teamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
    const groupCount = competitionConfigByKey[competitionKey]?.groups_count ?? 1;

    setGroupAssignmentsByCompetitionKey((currentGroupAssignmentsByCompetitionKey) => ({
      ...currentGroupAssignmentsByCompetitionKey,
      [competitionKey]: resolveBalancedAssignments(teamIds, groupCount, competitionKey),
    }));
    setTransientGroupSlotIdsByCompetitionKey((currentTransientGroupSlotIdsByCompetitionKey) => {
      const { [competitionKey]: _removedCompetitionKey, ...remainingTransientGroupSlotIdsByCompetitionKey } =
        currentTransientGroupSlotIdsByCompetitionKey;

      return remainingTransientGroupSlotIdsByCompetitionKey;
    });
    setGroupOrderByCompetitionKey((currentGroupOrderByCompetitionKey) => {
      const { [competitionKey]: _removedCompetitionKey, ...remainingGroupOrderByCompetitionKey } = currentGroupOrderByCompetitionKey;
      return remainingGroupOrderByCompetitionKey;
    });
    setAutoOpenCompetitionGroupSlotKey(null);
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
    setTransientGroupSlotIdsByCompetitionKey({});
    setGroupOrderByCompetitionKey({});
    setAutoOpenCompetitionGroupSlotKey(null);
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
        toast.error("É necessário ao menos uma competição com duas atléticas para gerar grupos.");
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
        toast.error("Revise a configuração de grupos. Classificados por grupo deve ser 1 ou 2.");
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
            toast.error(`A distribuição de ${competitionDisplayLabel} possui atléticas sem grupo válido.`);
            return false;
          }

          groupSizes[assignedGroup - 1] = groupSizes[assignedGroup - 1] + 1;
        }

        const minimumGroupSize = Math.min(...groupSizes);
        const maximumGroupSize = Math.max(...groupSizes);

        if (minimumGroupSize < 2) {
          toast.error(`Em ${competitionDisplayLabel}, cada grupo precisa ter no mínimo 2 atléticas.`);
          return false;
        }

        if (maximumGroupSize - minimumGroupSize > 1) {
          toast.error(
            `Distribuição inválida em ${competitionDisplayLabel}: diferença entre grupos maior que 1 (${minimumGroupSize} até ${maximumGroupSize}).`,
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

        const startMinutes = resolveTimeValueToMinutes(scheduleDay.start_time);
        const endMinutes = resolveTimeValueToMinutes(scheduleDay.end_time);

        if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
          toast.error("Horário do dia inválido: fim deve ser maior que início.");
          return false;
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
    const next_draft_form_values = {
      ...currentWizardDraftFormValues,
      current_step_index: next_step_index,
    };

    saveChampionshipBracketWizardDraft(selectedChampionship.id, next_draft_form_values);
    setLastSavedEditableDraftSnapshot(resolveEditableDraftSnapshot(next_draft_form_values));
    setCurrentStepIndex(next_step_index);
  };

  const handlePreviousStep = () => {
    setCurrentStepIndex((currentStep) => Math.max(currentStep - 1, 0));
  };

  const handleSaveDraft = () => {
    saveChampionshipBracketWizardDraft(selectedChampionship.id, currentWizardDraftFormValues);
    setLastSavedEditableDraftSnapshot(resolveEditableDraftSnapshot(currentWizardDraftFormValues));
    toast.success("Rascunho salvo.");
  };

  const resolveParticipantsPayload = useCallback((): ChampionshipBracketParticipantInput[] => {
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
  }, [selectedCompetitionKeysByTeamId, selectedTeamIds]);

  const resolveCompetitionsPayload = useCallback((): ChampionshipBracketCompetitionInput[] => {
    return sortedActiveCompetitionKeys.map((competitionKey) => {
      const parsedCompetitionKey = parseCompetitionKey(competitionKey);
      const competitionConfig = competitionConfigByKey[competitionKey] ?? resolveDefaultCompetitionConfig(2);
      const assignments = groupAssignmentsByCompetitionKey[competitionKey] ?? {};
      const orderedTeamIdsByGroupNumber = groupOrderByCompetitionKey[competitionKey] ?? {};
      const groups: { group_number: number; team_ids: string[] }[] = [];

      for (let groupNumber = 1; groupNumber <= competitionConfig.groups_count; groupNumber += 1) {
        groups.push({
          group_number: groupNumber,
          team_ids: resolveOrderedAssignedTeamIds({
            participant_team_ids: teamIdsByCompetitionKey[competitionKey],
            group_assignments: assignments,
            ordered_team_ids_by_group_number: orderedTeamIdsByGroupNumber,
            group_number: groupNumber,
          }),
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
  }, [competitionConfigByKey, groupAssignmentsByCompetitionKey, groupOrderByCompetitionKey, sortedActiveCompetitionKeys, teamIdsByCompetitionKey]);

  const resolveScheduleDaysPayload = useCallback((): ChampionshipBracketScheduleDayInput[] => {
    return scheduleDays.map((scheduleDay) => ({
      date: scheduleDay.date,
      start_time: scheduleDay.start_time,
      end_time: scheduleDay.end_time,
      break_start_time: null,
      break_end_time: null,
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
  }, [scheduleDays]);

  const resolveSetupPayload = useCallback((): ChampionshipBracketSetupFormValues => {
    return ChampionshipBracketSetupDTO.fromFormValues({
      participants: resolveParticipantsPayload(),
      competitions: resolveCompetitionsPayload(),
      schedule_days: resolveScheduleDaysPayload(),
    }).bindToSave();
  }, [resolveCompetitionsPayload, resolveParticipantsPayload, resolveScheduleDaysPayload]);

  const handleSave = async () => {
    if (!validateCurrentStep()) {
      return;
    }

    setSaving(true);
    setSaveErrorBannerData(null);
    const payload = resolveSetupPayload();

    try {
      const response = await generateChampionshipBracketGroups(selectedChampionship.id, payload);

      if (response.error || !response.data) {
        throw new Error(response.error?.message ?? "Não foi possível gerar os grupos automaticamente.");
      }

      clearChampionshipBracketWizardDraft(selectedChampionship.id);
      await onGenerated(response.data);
      toast.success("Grupos e jogos da fase de grupos gerados com sucesso.");
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

  const removeScheduleLocation = useCallback(
    (scheduleDayId: string, locationId: string) => {
      updateScheduleDay(scheduleDayId, (scheduleDay) => {
        const nextLocations = scheduleDay.locations
          .filter((locationItem) => locationItem.id != locationId)
          .map((locationItem, locationIndex) => ({
            ...locationItem,
            position: locationIndex + 1,
          }));

        if (nextLocations.length == scheduleDay.locations.length) {
          return scheduleDay;
        }

        return {
          ...scheduleDay,
          locations: nextLocations,
        };
      });
    },
    [updateScheduleDay],
  );

  const handleSelectLocationTemplateForDay = useCallback(
    (scheduleDayId: string, locationTemplateId: string) => {
      const locationTemplate = locationTemplateById[locationTemplateId];

      if (!locationTemplate) {
        return;
      }

      updateScheduleDay(scheduleDayId, (scheduleDay) => {
        if (scheduleDay.locations.some((location) => location.location_template_id == locationTemplateId)) {
          return scheduleDay;
        }

        return {
          ...scheduleDay,
          locations: [
            ...scheduleDay.locations,
            resolveScheduleLocationFromTemplate(locationTemplate, resolveRandomUuid(), scheduleDay.locations.length + 1),
          ],
        };
      });
      setLocationTemplatePickerDayId((currentLocationTemplatePickerDayId) => {
        return currentLocationTemplatePickerDayId == scheduleDayId ? null : currentLocationTemplatePickerDayId;
      });
    },
    [locationTemplateById, updateScheduleDay],
  );

  const handleOpenCreateLocationTemplateModal = useCallback((scheduleDayId: string) => {
    setLocationTemplateModalTarget({
      schedule_day_id: scheduleDayId,
      location_id: null,
      location_template_id: null,
    });
    setLocationTemplateModalFormValues(resolveInitialLocationTemplateModalFormValue());
    setLocationTemplateModalOpen(true);
  }, []);

  const handleOpenEditLocationTemplateModal = useCallback(
    (scheduleDayId: string, scheduleLocation: ScheduleLocationFormValue) => {
      const locationTemplate =
        scheduleLocation.location_template_id != null ? locationTemplateById[scheduleLocation.location_template_id] ?? null : null;

      setLocationTemplateModalTarget({
        schedule_day_id: scheduleDayId,
        location_id: scheduleLocation.id,
        location_template_id: scheduleLocation.location_template_id,
      });
      setLocationTemplateModalFormValues(
        locationTemplate
          ? resolveLocationTemplateModalFormValueFromTemplate(locationTemplate)
          : resolveLocationTemplateModalFormValueFromScheduleLocation(scheduleLocation),
      );
      setLocationTemplateModalOpen(true);
    },
    [locationTemplateById],
  );

  const handleCloseLocationTemplateModal = useCallback(() => {
    if (savingLocationTemplate) {
      return;
    }

    setLocationTemplateModalOpen(false);
    setLocationTemplateModalTarget(null);
    setLocationTemplateModalFormValues(resolveInitialLocationTemplateModalFormValue());
  }, [savingLocationTemplate]);

  const handleSaveLocationTemplate = useCallback(async () => {
    const normalizedLocationName = locationTemplateModalFormValues.name.trim();

    if (!normalizedLocationName) {
      toast.error("Informe o nome do local.");
      return;
    }

    if (locationTemplateModalFormValues.courts.length == 0) {
      toast.error("O local precisa ter ao menos uma quadra.");
      return;
    }

    for (const court of locationTemplateModalFormValues.courts) {
      if (!court.name.trim()) {
        toast.error("Toda quadra precisa ter um nome.");
        return;
      }

      if (court.sport_ids.length == 0) {
        toast.error("Toda quadra precisa ter ao menos uma modalidade vinculada.");
        return;
      }
    }

    setSavingLocationTemplate(true);

    const payload: ChampionshipBracketLocationTemplateSaveInput = {
      id: locationTemplateModalFormValues.id,
      name: normalizedLocationName,
      courts: locationTemplateModalFormValues.courts.map((court, courtIndex) => ({
        id: court.id,
        name: court.name.trim(),
        position: courtIndex + 1,
        sport_ids: [...new Set(court.sport_ids)],
      })),
    };
    const saveResponse = await saveChampionshipBracketLocationTemplate(payload);

    if (saveResponse.error || !saveResponse.data) {
      toast.error(saveResponse.error?.message ?? "Não foi possível salvar o local no catálogo.");
      setSavingLocationTemplate(false);
      return;
    }

    const locationTemplatesResponse = await fetchChampionshipBracketLocationTemplates();

    if (locationTemplatesResponse.error) {
      toast.error(locationTemplatesResponse.error.message || "O local foi salvo, mas não foi possível recarregar o catálogo.");
      setSavingLocationTemplate(false);
      return;
    }

    const savedLocationTemplates = locationTemplatesResponse.data;
    const savedLocationTemplate = savedLocationTemplates.find((locationTemplate) => locationTemplate.id == saveResponse.data) ?? null;

    if (!savedLocationTemplate) {
      toast.error("O local foi salvo, mas não foi possível encontrá-lo no catálogo.");
      setSavingLocationTemplate(false);
      return;
    }

    setLocationTemplates(savedLocationTemplates);
    setScheduleDays((currentScheduleDays) => {
      return currentScheduleDays.map((scheduleDay) => {
        const nextLocations = scheduleDay.locations.map((scheduleLocation, locationIndex) => {
          const shouldSyncByTemplateId =
            locationTemplateModalTarget?.location_template_id != null &&
            scheduleLocation.location_template_id == locationTemplateModalTarget.location_template_id;
          const shouldSyncBySavedTemplateId = scheduleLocation.location_template_id == savedLocationTemplate.id;
          const isTargetLocation =
            locationTemplateModalTarget?.schedule_day_id == scheduleDay.id &&
            locationTemplateModalTarget.location_id != null &&
            scheduleLocation.id == locationTemplateModalTarget.location_id;

          if (!shouldSyncByTemplateId && !shouldSyncBySavedTemplateId && !isTargetLocation) {
            return scheduleLocation;
          }

          return resolveScheduleLocationFromTemplate(savedLocationTemplate, scheduleLocation.id, locationIndex + 1);
        });

        if (
          locationTemplateModalTarget?.schedule_day_id == scheduleDay.id &&
          locationTemplateModalTarget.location_id == null &&
          !nextLocations.some((scheduleLocation) => scheduleLocation.location_template_id == savedLocationTemplate.id)
        ) {
          nextLocations.push(
            resolveScheduleLocationFromTemplate(savedLocationTemplate, resolveRandomUuid(), nextLocations.length + 1),
          );
        }

        return {
          ...scheduleDay,
          locations: nextLocations.map((scheduleLocation, locationIndex) => ({
            ...scheduleLocation,
            position: locationIndex + 1,
          })),
        };
      });
    });

    setSavingLocationTemplate(false);
    setLocationTemplateModalOpen(false);
    setLocationTemplateModalTarget(null);
    setLocationTemplateModalFormValues(resolveInitialLocationTemplateModalFormValue());
    setLocationTemplatePickerDayId(null);
    toast.success("Local salvo no catálogo.");
  }, [locationTemplateModalFormValues, locationTemplateModalTarget]);

  const updateLocationTemplateModalCourt = useCallback(
    (courtId: string, updater: (court: ScheduleCourtFormValue, courtIndex: number) => ScheduleCourtFormValue) => {
      setLocationTemplateModalFormValues((currentLocationTemplateModalFormValues) => {
        const courtIndex = currentLocationTemplateModalFormValues.courts.findIndex((court) => court.id == courtId);

        if (courtIndex < 0) {
          return currentLocationTemplateModalFormValues;
        }

        const currentCourt = currentLocationTemplateModalFormValues.courts[courtIndex];
        const nextCourt = updater(currentCourt, courtIndex);

        if (nextCourt == currentCourt) {
          return currentLocationTemplateModalFormValues;
        }

        const nextCourts = [...currentLocationTemplateModalFormValues.courts];
        nextCourts[courtIndex] = nextCourt;

        return {
          ...currentLocationTemplateModalFormValues,
          courts: nextCourts,
        };
      });
    },
    [],
  );

  const handleAddLocationTemplateModalCourt = useCallback(() => {
    setLocationTemplateModalFormValues((currentLocationTemplateModalFormValues) => ({
      ...currentLocationTemplateModalFormValues,
      courts: [
        ...currentLocationTemplateModalFormValues.courts,
        {
          ...resolveInitialScheduleCourt(),
          position: currentLocationTemplateModalFormValues.courts.length + 1,
        },
      ],
    }));
  }, []);

  const handleRemoveLocationTemplateModalCourt = useCallback((courtId: string) => {
    setLocationTemplateModalFormValues((currentLocationTemplateModalFormValues) => {
      const nextCourts = currentLocationTemplateModalFormValues.courts
        .filter((court) => court.id != courtId)
        .map((court, courtIndex) => ({
          ...court,
          position: courtIndex + 1,
        }));

      if (nextCourts.length == currentLocationTemplateModalFormValues.courts.length) {
        return currentLocationTemplateModalFormValues;
      }

      return {
        ...currentLocationTemplateModalFormValues,
        courts: nextCourts,
      };
    });
  }, []);

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

  const availableLocationTemplatesByScheduleDayId = useMemo(() => {
    return scheduleDays.reduce<Record<string, ChampionshipBracketLocationTemplate[]>>((carry, scheduleDay) => {
      const selectedTemplateIdSet = new Set(
        scheduleDay.locations
          .map((location) => location.location_template_id)
          .filter((locationTemplateId): locationTemplateId is string => Boolean(locationTemplateId)),
      );

      carry[scheduleDay.id] = locationTemplates.filter((locationTemplate) => !selectedTemplateIdSet.has(locationTemplate.id));
      return carry;
    }, {});
  }, [locationTemplates, scheduleDays]);

  const reviewScheduleDaySummaries = useMemo(() => {
    return scheduleDays.map((scheduleDay, scheduleDayIndex) => {
      const totalCourts = scheduleDay.locations.reduce((carry, location) => carry + location.courts.length, 0);

      return {
        key: `review-schedule-day-${scheduleDay.id}`,
        day_label: `Dia ${scheduleDayIndex + 1}`,
        date: resolveBrazilianDateString(scheduleDay.date),
        start_time: scheduleDay.start_time || "--:--",
        end_time: scheduleDay.end_time || "--:--",
        location_count: scheduleDay.locations.length,
        total_courts: totalCourts,
      };
    });
  }, [scheduleDays]);

  const reviewCompetitionGroupSummariesByCompetitionKey = useMemo(() => {
    return activeCompetitionKeys.reduce<
      Record<string, { group_number: number; teams: { id: string; name: string }[] }[]>
    >((carry, competitionKey) => {
      const groupEditorColumns = competitionGroupEditorColumnsByCompetitionKey[competitionKey] ?? [];

      carry[competitionKey] = groupEditorColumns.map((groupColumn) => ({
        group_number: groupColumn.group_number,
        teams: groupColumn.slots
          .map((slot) => slot.team_id)
          .filter((teamId): teamId is string => teamId != null)
          .map((teamId) => ({
            id: teamId,
            name: teamNameById[teamId] ?? "Atlética",
          })),
      }));

      return carry;
    }, {});
  }, [activeCompetitionKeys, competitionGroupEditorColumnsByCompetitionKey, teamNameById]);

  const activeErrorBannerData = saveErrorBannerData;
  const shouldAllowDismissActiveErrorBanner = true;
  const isCreateButtonDisabled = saving;
  const isEditingLocationTemplate =
    locationTemplateModalTarget?.location_template_id != null || locationTemplateModalTarget?.location_id != null;
  const activeCompetitionOptions = useMemo(() => {
    return sortedActiveCompetitionKeys
      .map((competitionKey) => competitionOptionsByKey.get(competitionKey) ?? null)
      .filter((competitionOption): competitionOption is ChampionshipBracketWizardCompetitionOption => competitionOption != null);
  }, [competitionOptionsByKey, sortedActiveCompetitionKeys]);

  const handleDeleteLocationTemplate = useCallback(async () => {
    if (!locationTemplateDeletionTarget || deletingLocationTemplate) {
      return;
    }

    setDeletingLocationTemplate(true);

    const response = await deleteChampionshipBracketLocationTemplate(locationTemplateDeletionTarget.location_template_id);

    if (response.error) {
      toast.error(response.error.message || "Não foi possível excluir o local do catálogo.");
      setDeletingLocationTemplate(false);
      return;
    }

    setLocationTemplates((currentLocationTemplates) =>
      currentLocationTemplates.filter(
        (locationTemplate) => locationTemplate.id != locationTemplateDeletionTarget.location_template_id,
      ),
    );
    setScheduleDays((currentScheduleDays) =>
      currentScheduleDays.map((scheduleDay) => ({
        ...scheduleDay,
        locations: scheduleDay.locations
          .filter((location) => location.location_template_id != locationTemplateDeletionTarget.location_template_id)
          .map((location, locationIndex) => ({
            ...location,
            position: locationIndex + 1,
          })),
      })),
    );

    if (locationTemplateModalTarget?.location_template_id == locationTemplateDeletionTarget.location_template_id) {
      setLocationTemplateModalOpen(false);
      setLocationTemplateModalTarget(null);
      setLocationTemplateModalFormValues(resolveInitialLocationTemplateModalFormValue());
    }

    setLocationTemplateDeletionTarget(null);
    setDeletingLocationTemplate(false);
    toast.success("Local removido do catálogo.");
  }, [deletingLocationTemplate, locationTemplateDeletionTarget, locationTemplateModalTarget]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[780px] max-h-[88vh] w-[1120px] max-w-[95vw] flex-col overflow-hidden outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0">
          <DialogHeader>
            <DialogTitle>Hora de configurar o campeonato {selectedChampionship.name}!</DialogTitle>
            <DialogDescription>
              Configure participantes, grupos e agenda para criar os jogos automaticamente em fila por dia.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {activeErrorBannerData ? (
              <div ref={saveErrorBannerReference}>
                <Alert variant="destructive" className="border-destructive/60 bg-destructive/10 pr-10 dark:bg-destructive/10">
                  {shouldAllowDismissActiveErrorBanner ? (
                    <button
                      type="button"
                      aria-label="Fechar aviso de erro"
                      className="absolute right-3 top-3 rounded-sm p-1 text-destructive/80 transition hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setSaveErrorBannerData(null)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                  <AlertTitle>{activeErrorBannerData.title}</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>{activeErrorBannerData.message}</p>
                    {activeErrorBannerData.suggestion ? <p>{activeErrorBannerData.suggestion}</p> : null}
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
                <div className="mt-3 columns-1 gap-3 sm:columns-2 lg:columns-3">
                  {selectableTeams.map((team) => {
                    const isSelected = selectedTeamIdSet.has(team.id);

                    return (
                      <label key={team.id} className="mb-2 flex w-full break-inside-avoid-column items-center gap-2 rounded-lg bg-background/40 px-3 py-2">
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
                    <p className="text-sm font-semibold">Atléticas por modalidade</p>
                    <span className="text-xs text-muted-foreground">
                      {modalitySelectionSummary.selected_modalities_count}/{modalitySelectionSummary.eligible_modalities_count} selecionadas
                    </span>
                  </div>
                  <label className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
                    <Checkbox
                      data-testid="modalities-toggle-all"
                      className={SQUARE_CHECKBOX_CLASS_NAME}
                      checked={resolveCheckboxCheckedState(
                        modalitySelectionSummary.selected_modalities_count,
                        modalitySelectionSummary.eligible_modalities_count,
                      )}
                      onCheckedChange={(checked) => handleToggleAllModalitiesSelection(checked == true)}
                    />
                    Selecionar todas
                  </label>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cada card representa uma modalidade. Selecione as atléticas que participarão de cada uma.
                </p>

                <div className="mt-3 space-y-3">
                  {modalityCards.map((modalityCard) => {
                    return (
                      <div
                        key={`wizard-modality-card-${modalityCard.sport_id}`}
                        data-testid={`modality-card-${modalityCard.sport_id}`}
                        className="rounded-lg bg-background/70 p-3 shadow-[0_10px_18px_rgba(15,23,42,0.16)] dark:shadow-none"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <p className="text-sm font-semibold">{modalityCard.sport_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {modalityCard.selected_team_count}/{modalityCard.eligible_team_count} atléticas selecionadas
                            </p>
                          </div>
                          <label className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
                            <Checkbox
                              data-testid={`modality-card-${modalityCard.sport_id}-toggle-all`}
                              className={SQUARE_CHECKBOX_CLASS_NAME}
                              checked={resolveCheckboxCheckedState(
                                modalityCard.selected_team_count,
                                modalityCard.eligible_team_count,
                              )}
                              onCheckedChange={(checked) => handleToggleModalityCardSelection(modalityCard.sport_id, checked == true)}
                            />
                            Selecionar todas
                          </label>
                        </div>

                        {modalityCard.teams.length == 0 ? (
                          <p className="mt-2 text-xs text-muted-foreground">Nenhuma atlética elegível para esta modalidade.</p>
                        ) : (
                          <div className="mt-2 columns-1 gap-3 sm:columns-2 lg:columns-3">
                            {modalityCard.teams.map((team) => {
                              return (
                                <label
                                  key={`${modalityCard.sport_id}-${team.team_id}`}
                                  className="mb-2 flex w-full break-inside-avoid-column items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                                >
                                  <Checkbox
                                    data-testid={`modality-card-${modalityCard.sport_id}-team-${team.team_id}`}
                                    className={SQUARE_CHECKBOX_CLASS_NAME}
                                    checked={team.is_selected}
                                    onCheckedChange={(checked) => handleToggleTeamSport(team.team_id, modalityCard.sport_id, checked == true)}
                                  />
                                  <span className="font-medium">{team.team_name}</span>
                                  {team.division ? (
                                    <AppBadge tone={TEAM_DIVISION_BADGE_TONES[team.division]} className="shrink-0 whitespace-nowrap">
                                      {TEAM_DIVISION_LABELS[team.division]}
                                    </AppBadge>
                                  ) : null}
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
                    <p className="text-sm font-semibold">Naipes por modalidade</p>
                    <span className="text-xs text-muted-foreground">
                      {naipeSelectionSummary.selected_naipes_count}/{naipeSelectionSummary.eligible_naipes_count} selecionados
                    </span>
                  </div>
                  <label className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
                    <Checkbox
                      data-testid="naipes-toggle-all"
                      className={SQUARE_CHECKBOX_CLASS_NAME}
                      checked={resolveCheckboxCheckedState(
                        naipeSelectionSummary.selected_naipes_count,
                        naipeSelectionSummary.eligible_naipes_count,
                      )}
                      onCheckedChange={(checked) => handleToggleAllNaipesSelection(checked == true)}
                    />
                    Selecionar todas
                  </label>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Cada card representa uma modalidade. Em cada aba, selecione as atléticas do naipe correspondente.</p>

                <div className="mt-3 space-y-3">
                  {naipeCards.map((naipeCard) => {
                    const activeNaipe = activeNaipeTabBySportId[naipeCard.sport_id] ?? naipeCard.tabs[0]?.naipe;
                    const activeNaipeTab = naipeCard.tabs.find((tab) => tab.naipe == activeNaipe) ?? naipeCard.tabs[0] ?? null;

                    return (
                      <div
                        key={`wizard-naipe-card-${naipeCard.sport_id}`}
                        data-testid={`naipe-card-${naipeCard.sport_id}`}
                        className="rounded-lg bg-background/70 p-3 shadow-[0_10px_18px_rgba(15,23,42,0.16)] dark:shadow-none"
                      >
                        <div className="space-y-3">
                          <p className="text-sm font-semibold">{naipeCard.sport_name}</p>

                          <AnimatedTabBar
                            items={naipeCard.tabs.map((tab) => ({
                              value: tab.naipe,
                              label: tab.label,
                              test_id: `naipe-card-${naipeCard.sport_id}-tab-${tab.naipe}`,
                            }))}
                            value={activeNaipeTab?.naipe ?? ""}
                            onValueChange={(value) => setActiveNaipeTabBySportId((currentActiveNaipeTabBySportId) => ({
                              ...currentActiveNaipeTabBySportId,
                              [naipeCard.sport_id]: value as MatchNaipe,
                            }))}
                          />

                          {activeNaipeTab ? (
                            <div className="space-y-3 rounded-lg bg-background/40 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground">
                                  {activeNaipeTab.selected_team_count}/{activeNaipeTab.eligible_team_count} atléticas selecionadas em{" "}
                                  {activeNaipeTab.label.toLowerCase()}
                                </p>
                                <label className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
                                  <Checkbox
                                    data-testid={`naipe-card-${naipeCard.sport_id}-tab-${activeNaipeTab.naipe}-toggle-all`}
                                    className={SQUARE_CHECKBOX_CLASS_NAME}
                                    checked={resolveCheckboxCheckedState(
                                      activeNaipeTab.selected_team_count,
                                      activeNaipeTab.eligible_team_count,
                                    )}
                                    onCheckedChange={(checked) =>
                                      handleToggleNaipeTabSelection(naipeCard.sport_id, activeNaipeTab.naipe, checked == true)
                                    }
                                  />
                                  Selecionar todas
                                </label>
                              </div>

                              {activeNaipeTab.teams.length == 0 ? (
                                <p className="text-xs text-muted-foreground">Nenhuma atlética disponível nesta aba.</p>
                              ) : (
                                <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">
                                  {activeNaipeTab.teams.map((team) => (
                                    <label
                                      key={`${team.competition_key}-${team.team_id}`}
                                      className="mb-2 flex w-full break-inside-avoid-column items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                                    >
                                      <Checkbox
                                        data-testid={`naipe-card-${naipeCard.sport_id}-tab-${activeNaipeTab.naipe}-team-${team.team_id}`}
                                        className={SQUARE_CHECKBOX_CLASS_NAME}
                                        checked={team.is_selected}
                                        onCheckedChange={(checked) =>
                                          handleToggleTeamCompetition(team.team_id, team.competition_key, checked == true)
                                        }
                                      />
                                      <span className="font-medium">{team.team_name}</span>
                                      {team.division ? (
                                        <AppBadge tone={TEAM_DIVISION_BADGE_TONES[team.division]} className="shrink-0 whitespace-nowrap">
                                          {TEAM_DIVISION_LABELS[team.division]}
                                        </AppBadge>
                                      ) : null}
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedTeams.length == 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhuma atlética selecionada. Volte para a etapa anterior e selecione participantes.
                </p>
              ) : naipeCards.length == 0 ? (
                <p className="text-xs text-muted-foreground">
                  Selecione modalidades na etapa anterior para habilitar a configuração de naipes.
                </p>
              ) : null}
            </div>
          ) : null}

          {currentStepIndex == 3 ? (
            <div className="grid gap-3 p-1 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sortedActiveCompetitionKeys.map((competitionKey) => {
                const competitionOption = competitionOptionsByKey.get(competitionKey);

                if (!competitionOption) {
                  return null;
                }

                const competitionConfig = competitionConfigByKey[competitionKey] ?? resolveDefaultCompetitionConfig(2);
                const participantCount = teamIdsByCompetitionKey[competitionKey]?.length ?? 0;

                return (
                  <div
                    key={competitionKey}
                    data-testid={`competition-config-card-${competitionKey}`}
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
                        <Label className="text-xs">Quantidade de grupos</Label>
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
                        <Label className="text-xs">Classificados por grupo</Label>
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
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold">Monte os grupos por modalidade</p>
                    <p className="text-xs text-muted-foreground">
                      Cada coluna representa um grupo. Adicione selects extras com o botão + quando precisar incluir mais atléticas.
                    </p>
                  </div>

                  <Button size="sm" variant="outline" onClick={handleAutoAssignAllCompetitionGroups}>
                    Distribuir automaticamente tudo
                  </Button>
                </div>
              </div>

              {sortedActiveCompetitionKeys.map((competitionKey) => {
                const competitionOption = competitionOptionsByKey.get(competitionKey);
                const competitionConfig = competitionConfigByKey[competitionKey];

                if (!competitionOption || !competitionConfig) {
                  return null;
                }

                const assignments = groupAssignmentsByCompetitionKey[competitionKey] ?? {};
                const groupEditorColumns = competitionGroupEditorColumnsByCompetitionKey[competitionKey] ?? [];
                const participantCount = teamIdsByCompetitionKey[competitionKey]?.length ?? 0;

                return (
                  <div key={competitionKey} className="rounded-xl bg-background/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold">
                          {competitionOption.sport_name} • {MATCH_NAIPE_LABELS[competitionOption.naipe]}
                          {competitionOption.division ? ` • ${competitionOption.division}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {participantCount} atléticas • {competitionConfig.groups_count} grupos
                        </p>
                      </div>

                      <Button size="sm" variant="outline" onClick={() => handleAutoAssignCompetitionGroups(competitionKey)}>
                        Auto distribuir modalidade
                      </Button>
                    </div>

                    {groupEditorColumns.length == 0 ? null : (
                      <div className="mt-3 overflow-x-auto pb-1">
                        <div className="flex min-w-max gap-3">
                          {groupEditorColumns.map((groupColumn) => {
                            const assignedTeamCount = Object.values(assignments).filter(
                              (groupNumber) => groupNumber == groupColumn.group_number,
                            ).length;

                            return (
                              <div
                                key={`${competitionKey}-group-column-${groupColumn.group_number}`}
                                data-testid={`${competitionKey}-group-${groupColumn.group_number}-column`}
                                className="w-72 shrink-0 rounded-xl bg-background/45 p-3 shadow-[0_10px_18px_rgba(15,23,42,0.12)] dark:shadow-none"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold text-muted-foreground">
                                    {resolveChampionshipGroupLabel(groupColumn.group_number)}
                                  </p>
                                  <span className="rounded-full bg-background/70 px-2 py-0.5 text-[11px]">
                                    {assignedTeamCount} atlética{assignedTeamCount == 1 ? "" : "s"}
                                  </span>
                                </div>

                                <div className="mt-3 space-y-2">
                                  {groupColumn.slots.map((slot, slotIndex) => {
                                    const slotSelectionKey = resolveCompetitionGroupSlotSelectionKey(
                                      competitionKey,
                                      groupColumn.group_number,
                                      slot.slot_id,
                                    );
                                    const shouldAutoOpenSlot = autoOpenCompetitionGroupSlotKey == slotSelectionKey;
                                    const sortedAvailableTeamIds = [...slot.available_team_ids].sort((firstTeamId, secondTeamId) => {
                                      return (teamNameById[firstTeamId] ?? "Atlética").localeCompare(
                                        teamNameById[secondTeamId] ?? "Atlética",
                                        "pt-BR",
                                        { sensitivity: "base" },
                                      );
                                    });

                                    return (
                                      <div
                                        key={`${competitionKey}-group-${groupColumn.group_number}-slot-${slot.slot_id}`}
                                        className="flex items-start gap-2"
                                      >
                                        <Select
                                          open={shouldAutoOpenSlot ? true : undefined}
                                          onOpenChange={(open) => {
                                            if (!open && shouldAutoOpenSlot) {
                                              setAutoOpenCompetitionGroupSlotKey(null);
                                            }
                                          }}
                                          value={slot.team_id ?? undefined}
                                          onValueChange={(value) =>
                                            handleSelectCompetitionGroupTeam(
                                              competitionKey,
                                              groupColumn.group_number,
                                              value,
                                              slot.team_id,
                                              slot.slot_id,
                                            )
                                          }
                                          disabled={slot.team_id == null && slot.available_team_ids.length == 0}
                                        >
                                          <SelectTrigger
                                            data-testid={`${competitionKey}-group-${groupColumn.group_number}-slot-${slotIndex}-trigger`}
                                            aria-label={`${resolveChampionshipGroupLabel(groupColumn.group_number)} atlética ${slotIndex + 1}`}
                                            className="glass-input h-9 text-xs"
                                          >
                                            <SelectValue
                                              placeholder={
                                                slot.available_team_ids.length == 0
                                                  ? "Todas as atléticas já foram selecionadas"
                                                  : "Selecione a atlética"
                                              }
                                            />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {sortedAvailableTeamIds.map((teamId) => (
                                              <SelectItem
                                                key={`${competitionKey}-group-${groupColumn.group_number}-team-${teamId}`}
                                                value={teamId}
                                              >
                                                {teamNameById[teamId] ?? "Atlética"}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>

                                        {slot.is_removable ? (
                                          <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            data-testid={`${competitionKey}-group-${groupColumn.group_number}-slot-${slotIndex}-remove`}
                                            className="h-9 w-9 shrink-0"
                                            onClick={() => {
                                              if (slot.team_id) {
                                                handleRemoveCompetitionGroupTeam(competitionKey, slot.team_id);
                                                return;
                                              }

                                              handleRemoveCompetitionGroupSlot(
                                                competitionKey,
                                                groupColumn.group_number,
                                                slot.slot_id,
                                              );
                                            }}
                                          >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                          </Button>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>

                                <Button
                                  type="button"
                                  variant="outline"
                                  data-testid={`${competitionKey}-group-${groupColumn.group_number}-add-team`}
                                  aria-label={`Adicionar atlética ao ${resolveChampionshipGroupLabel(groupColumn.group_number)}`}
                                  className="mt-3 w-full justify-center rounded-lg border border-dashed border-destructive/35 bg-destructive/10 text-destructive shadow-none hover:bg-destructive/15 hover:text-destructive disabled:border-border/40 disabled:bg-muted/40 disabled:text-muted-foreground"
                                  onClick={() => handleAddCompetitionGroupSlot(competitionKey, groupColumn.group_number)}
                                  disabled={groupColumn.available_team_ids.length == 0}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            );
                          })}
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
                Replicar locais selecionados e horários do dia anterior ao adicionar novo dia
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
                    </div>

                    <div className="mt-4 rounded-lg bg-background/50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <p className="text-sm font-semibold">Locais do dia</p>
                          <p className="text-xs text-muted-foreground">
                            Selecione locais do catálogo para preencher automaticamente as quadras disponíveis.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setLocationTemplatePickerDayId((currentLocationTemplatePickerDayId) => {
                                return currentLocationTemplatePickerDayId == scheduleDay.id ? null : scheduleDay.id;
                              });
                            }}
                            disabled={locationTemplatesLoading || (availableLocationTemplatesByScheduleDayId[scheduleDay.id]?.length ?? 0) == 0}
                          >
                            <Plus className="mr-1 h-3 w-3" /> Adicionar local
                          </Button>

                          <Button size="sm" variant="outline" onClick={() => handleOpenCreateLocationTemplateModal(scheduleDay.id)}>
                            Cadastrar local
                          </Button>
                        </div>
                      </div>

                      {locationTemplatesLoading ? (
                        <div className="mt-3 flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Carregando catálogo de locais...
                        </div>
                      ) : null}

                      {locationTemplatePickerDayId == scheduleDay.id && !locationTemplatesLoading ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-background/40 p-3">
                          <Select onValueChange={(value) => handleSelectLocationTemplateForDay(scheduleDay.id, value)}>
                            <SelectTrigger className="glass-input h-9 min-w-[240px] flex-1 text-xs">
                              <SelectValue placeholder="Selecione um local cadastrado" />
                            </SelectTrigger>
                            <SelectContent>
                              {(availableLocationTemplatesByScheduleDayId[scheduleDay.id] ?? []).map((locationTemplate) => (
                                <SelectItem key={`${scheduleDay.id}-${locationTemplate.id}`} value={locationTemplate.id}>
                                  {locationTemplate.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 shrink-0"
                            onClick={() => setLocationTemplatePickerDayId(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : null}

                      {!locationTemplatesLoading && locationTemplates.length == 0 && scheduleDay.locations.length == 0 ? (
                        <div className="mt-3 rounded-lg border border-dashed border-border/70 bg-background/35 px-4 py-5 text-center">
                          <p className="text-sm font-medium">Nenhum local cadastrado ainda.</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Cadastre o primeiro local para reutilizar este catálogo em próximos campeonatos.
                          </p>
                          <Button size="sm" variant="outline" className="mt-3" onClick={() => handleOpenCreateLocationTemplateModal(scheduleDay.id)}>
                            Cadastrar local
                          </Button>
                        </div>
                      ) : null}

                      {!locationTemplatesLoading && locationTemplates.length > 0 && scheduleDay.locations.length == 0 ? (
                        <div className="mt-3 rounded-lg border border-dashed border-border/70 bg-background/35 px-4 py-5 text-center text-xs text-muted-foreground">
                          Nenhum local selecionado para este dia.
                        </div>
                      ) : null}

                      {scheduleDay.locations.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {scheduleDay.locations.map((location) => {
                            const locationCourtCountSummary = resolveScheduleLocationCourtCountSummaryBySport(
                              location,
                              activeCompetitionOptions,
                            );

                            return (
                              <div
                                key={location.id}
                                className="rounded-lg border border-transparent bg-background/45 px-3 py-2 shadow-[0_6px_14px_rgba(15,23,42,0.1)] dark:border-border/70 dark:shadow-none"
                              >
                                <div className="grid min-h-[92px] grid-cols-[1fr_auto] gap-3">
                                  <div className="space-y-0.5">
                                    <p className="text-sm font-semibold">{location.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {locationCourtCountSummary || "Sem quadras compatíveis com as modalidades selecionadas."}
                                    </p>
                                  </div>

                                  <div className="flex flex-col items-center justify-center gap-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      title="Editar local"
                                      aria-label="Editar local"
                                      onClick={() => handleOpenEditLocationTemplateModal(scheduleDay.id, location)}
                                    >
                                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                    </Button>

                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      title="Remover local do dia"
                                      aria-label="Remover local do dia"
                                      onClick={() => removeScheduleLocation(scheduleDay.id, location.id)}
                                    >
                                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                                    </Button>

                                    {location.location_template_id ? (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7"
                                        title="Apagar local do catálogo"
                                        aria-label="Apagar local do catálogo"
                                        onClick={() =>
                                          setLocationTemplateDeletionTarget({
                                            location_template_id: location.location_template_id!,
                                            location_name: location.name,
                                          })
                                        }
                                      >
                                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-destructive/35 bg-destructive/10 p-4 text-center text-destructive transition hover:border-destructive/55 hover:bg-destructive/15"
                  onClick={handleAddScheduleDay}
                >
                  <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-destructive/10">
                    <Plus className="h-5 w-5" />
                  </span>
                  <span className="font-semibold">Adicionar dia</span>
                  <span className="mt-1 text-xs text-destructive/80">
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
                      {" • "}
                      {scheduleDaySummary.location_count} locais •{" "}
                      {scheduleDaySummary.total_courts} quadras
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold">Visualização dos grupos por modalidade</p>

                {sortedActiveCompetitionKeys.map((competitionKey) => {
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
                          {participantTeamIds.length} atléticas • {competitionConfig.groups_count} grupos • {competitionConfig.qualifiers_per_group} classificados/grupo
                        </p>
                      </div>

                      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {groupSummaries.map((groupSummary) => {
                          return (
                            <div
                              key={`${competitionKey}-review-group-${groupSummary.group_number}`}
                              className="rounded-md bg-background/40 p-2 shadow-[0_6px_14px_rgba(15,23,42,0.1)] dark:shadow-none"
                            >
                              <p className="text-xs font-semibold">{resolveChampionshipGroupLabel(groupSummary.group_number)}</p>
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
                <Button variant="outline" onClick={handleSaveDraft} disabled={isDraftSaveDisabled}>
                  Salvar rascunho
                </Button>

                <Button variant="outline" onClick={handlePreviousStep} disabled={currentStepIndex == 0 || saving}>
                  Voltar
                </Button>

                {currentStepIndex < WIZARD_STEP_LABELS.length - 1 ? (
                  <Button onClick={handleNextStep} disabled={saving}>
                    Próximo
                  </Button>
                ) : (
                  <Button onClick={handleSave} disabled={isCreateButtonDisabled}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Criar campeonato
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open && locationTemplateModalOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            handleCloseLocationTemplateModal();
          }
        }}
      >
        <DialogContent className="max-h-[88vh] w-[1120px] max-w-[95vw] overflow-y-auto outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0">
          <DialogHeader>
            <DialogTitle>{isEditingLocationTemplate ? "Editar local" : "Cadastrar local"}</DialogTitle>
            <DialogDescription>
              Defina o local, as quadras e as modalidades suportadas para reutilizar esse cadastro em próximos campeonatos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome do local</Label>
              <Input
                value={locationTemplateModalFormValues.name}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setLocationTemplateModalFormValues((currentLocationTemplateModalFormValues) => ({
                    ...currentLocationTemplateModalFormValues,
                    name: nextName,
                  }));
                }}
                placeholder="Ex.: Praia de Piçarras"
                className="glass-input"
              />
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">Quadras do local</p>
                <p className="text-xs text-muted-foreground">
                  Organize as quadras em cards compactos e marque as modalidades que podem usar cada uma delas.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {locationTemplateModalFormValues.courts.map((court, courtIndex) => (
                  <div
                    key={court.id}
                    className="relative rounded-xl border border-transparent bg-background/50 p-3 shadow-[0_8px_16px_rgba(15,23,42,0.1)] dark:border-border/70 dark:shadow-none"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Quadra {courtIndex + 1}</p>
                      {locationTemplateModalFormValues.courts.length > 1 ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Remover quadra"
                          aria-label="Remover quadra"
                          onClick={() => handleRemoveLocationTemplateModalCourt(court.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : null}
                    </div>

                    <div className="mt-3 space-y-3">
                      <div className="space-y-1.5">
                        <Label>Nome da quadra</Label>
                        <Input
                          value={court.name}
                          onChange={(event) => {
                            const nextCourtName = event.target.value;
                            updateLocationTemplateModalCourt(court.id, (currentCourt) => ({
                              ...currentCourt,
                              name: nextCourtName,
                            }));
                          }}
                          placeholder={`Quadra ${courtIndex + 1}`}
                          className="glass-input h-9"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Modalidades disponíveis</Label>
                        {selectedSportOptions.length == 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Nenhuma modalidade selecionada no wizard para vincular a esta quadra.
                          </p>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {selectedSportOptions.map((sportOption) => {
                              const isSelected = court.sport_ids.includes(sportOption.id);

                              return (
                                <label
                                  key={`${court.id}-${sportOption.id}`}
                                  className="flex items-center gap-2 rounded-md bg-background/40 px-2 py-1.5 text-xs"
                                >
                                  <Checkbox
                                    className={SQUARE_CHECKBOX_CLASS_NAME}
                                    checked={isSelected}
                                    onCheckedChange={(checked) => {
                                      updateLocationTemplateModalCourt(court.id, (currentCourt) => {
                                        if (checked == true) {
                                          if (currentCourt.sport_ids.includes(sportOption.id)) {
                                            return currentCourt;
                                          }

                                          return {
                                            ...currentCourt,
                                            sport_ids: [...currentCourt.sport_ids, sportOption.id],
                                          };
                                        }

                                        return {
                                          ...currentCourt,
                                          sport_ids: currentCourt.sport_ids.filter((sportId) => sportId != sportOption.id),
                                        };
                                      });
                                    }}
                                  />
                                  <span>{sportOption.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-destructive/35 bg-destructive/10 p-4 text-center text-destructive transition hover:border-destructive/55 hover:bg-destructive/15"
                  onClick={handleAddLocationTemplateModalCourt}
                >
                  <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-destructive/10">
                    <Plus className="h-5 w-5" />
                  </span>
                  <span className="font-semibold">Adicionar quadra</span>
                  <span className="mt-1 text-xs text-destructive/80">Novo card para este local</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={handleCloseLocationTemplateModal} disabled={savingLocationTemplate}>
                Cancelar
              </Button>
              <Button onClick={handleSaveLocationTemplate} disabled={savingLocationTemplate || selectedSportOptions.length == 0}>
                {savingLocationTemplate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar local
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open && locationTemplateDeletionTarget != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !deletingLocationTemplate) {
            setLocationTemplateDeletionTarget(null);
          }
        }}
      >
        <DialogContent className="w-[460px] max-w-[92vw] outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0">
          <DialogHeader>
            <DialogTitle>Apagar local permanentemente</DialogTitle>
            <DialogDescription>
              Este local será removido do catálogo global e sairá de todos os dias já selecionados neste wizard.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm">
              {locationTemplateDeletionTarget?.location_name ?? "Local"}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                disabled={deletingLocationTemplate}
                onClick={() => setLocationTemplateDeletionTarget(null)}
              >
                Cancelar
              </Button>
              <Button variant="destructive" disabled={deletingLocationTemplate} onClick={handleDeleteLocationTemplate}>
                {deletingLocationTemplate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Apagar local
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
