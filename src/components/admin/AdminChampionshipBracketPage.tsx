import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Laptop2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Championship, ChampionshipSport, Team } from "@/lib/types";
import {
  AppBadgeTone,
  BracketThirdPlaceMode,
  ChampionshipCode,
  ChampionshipSchedulePeriod,
  ChampionshipSeasonDivisionFormat,
  ChampionshipSeasonDivisionSettlementMode,
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
import { CHAMPIONSHIP_BRACKET_DEFAULT_QUALIFIERS_PER_GROUP } from "@/domain/championship-brackets/championshipBracket.constants";
import {
  QUALIFICATION_MODE_OPTIONS,
  resolveCompetitionConfigByQualificationMode,
  resolveQualificationModeOption,
  type QualificationModeOption,
} from "@/domain/championship-brackets/championshipBracketQualification";
import { resolveDefaultCompetitionKnockoutPairingMode } from "@/domain/championship-brackets/championshipBracketPairing";
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
import {
  resolveChampionshipBracketKnockoutProjection,
  resolveChampionshipBracketProjectedKnockoutSummary,
  resolveChampionshipBracketQualificationSummary,
} from "@/domain/championship-brackets/championshipBracketKnockoutProjection";
import { ChampionshipBracketSetupDTO } from "@/domain/championship-brackets/ChampionshipBracketSetupDTO";
import { ChampionshipBracketWizardDraftDTO } from "@/domain/championship-brackets/ChampionshipBracketWizardDraftDTO";
import {
  resolveSelectableChampionshipTeams,
  sanitizeCompetitionDateAvailabilityValues,
  sanitizeIndividualEventConfigsValues,
  sanitizeIndividualSessionConfigsValues,
  sanitizeKnockoutProgramBlocksValues,
  sanitizeResourceLocksValues,
  sanitizeTeamCompetitionDateAvailabilityValues,
  sanitizeChampionshipBracketWizardDraft,
} from "@/domain/championship-brackets/championshipBracketWizardSync";
import {
  clearChampionshipBracketWizardDraft,
  fetchChampionshipBracketWizardDraft,
  saveChampionshipBracketWizardDraft,
} from "@/domain/championship-brackets/championshipBracketDraft.repository";
import {
  deleteChampionshipBracketLocationTemplate,
  generateChampionshipBracketGroups,
  previewChampionshipBracketGroups,
  fetchChampionshipBracketLocationTemplates,
  saveChampionshipBracketLocationTemplate,
} from "@/domain/championship-brackets/championshipBracket.repository";
import { saveChampionshipSeasonSettings } from "@/domain/championship-seasons/championshipSeason.repository";
import {
  syncChampionshipIndividualEventsFromSetup,
  syncChampionshipIndividualSessionsFromSetup,
} from "@/domain/individual-events/championshipIndividualEvents.repository";
import { useChampionshipSeasonSettings } from "@/hooks/useChampionshipSeasonSettings";
import type {
  ChampionshipBracketCompetitionConfigDraft,
  ChampionshipBracketCompetitionInput,
  ChampionshipBracketCourtSequenceMode,
  ChampionshipBracketCourtSportMatchTargetInput,
  ChampionshipBracketCourtSportPreferenceInput,
  ChampionshipBracketMatchNumberingMode,
  ChampionshipBracketLocationTemplate,
  ChampionshipBracketLocationTemplateSaveInput,
  ChampionshipBracketRemoteDraftMetadata,
  ChampionshipBracketCompetitionPeriodAvailabilityInput,
  ChampionshipBracketIndividualEventConfigInput,
  ChampionshipBracketSetupFormValues,
  ChampionshipBracketLocationInput,
  ChampionshipBracketKnockoutProgramBlockInput,
  ChampionshipBracketParticipantInput,
  ChampionshipBracketPreviewResult,
  ChampionshipBracketSchedulePeriodInput,
  ChampionshipSeasonSettingsInput,
  ChampionshipBracketScheduleCourtDraft,
  ChampionshipBracketScheduleDayDraft,
  ChampionshipBracketScheduleDayInput,
  ChampionshipBracketScheduleLocationDraft,
  ChampionshipBracketTeamCompetitionAvailabilityInput,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AdminBracketDrawModal } from "@/components/admin/AdminBracketDrawModal";
import {
  resolveLocationCatalogSportOptions,
  resolveLocationCatalogSupportSummary,
} from "@/components/admin/adminChampionshipLocationCatalog.utils";

interface Props {
  selectedChampionship: Championship;
  teams: Team[];
  championshipSports: ChampionshipSport[];
  onGenerated: () => Promise<void>;
}

type CompetitionConfig = ChampionshipBracketCompetitionConfigDraft;

interface ScheduleCourtFormValue {
  id: string;
  name: string;
  position: number;
  sport_ids: string[];
  sport_preference: ChampionshipBracketCourtSportPreferenceInput | null;
  sport_match_targets: ChampionshipBracketCourtSportMatchTargetInput[];
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
const NORMALIZED_BEACH_SOCCER_NAME = "beach soccer";
const INDIVIDUAL_SPORT_NAMES = new Set(["atletismo", "natacao"]);
const SCHEDULE_PERIOD_LABELS: Record<ChampionshipSchedulePeriod, string> = {
  [ChampionshipSchedulePeriod.MATUTINO]: "Matutino",
  [ChampionshipSchedulePeriod.VESPERTINO]: "Vespertino",
};
const SCHEDULE_PERIODS = [
  ChampionshipSchedulePeriod.MATUTINO,
  ChampionshipSchedulePeriod.VESPERTINO,
] as const;

const WIZARD_STEP_LABELS = [
  "Formato da Temporada",
  "Modalidades do Campeonato",
  "Participantes",
  "Atléticas por Modalidade",
  "Naipes",
  "Configuração de Grupos",
  "Agenda",
  "Sessões das Modalidades Individuais",
  "Disponibilidade por Modalidade",
  "Disponibilidade das Atléticas",
  "Prioridade, Reserva e Programação das Finais",
  "Sorteio dos Grupos",
  "Revisão",
] as const;

const WIZARD_STEP_ROW_BREAK_INDEX = 7;
const PERIOD_AVAILABILITY_CARD_COLUMNS = 3;

const SQUARE_CHECKBOX_CLASS_NAME = "h-4 w-4 rounded-[3px]";
const WIZARD_NAIPE_TAB_DEFAULT_ORDER = [
  MatchNaipe.MASCULINO,
  MatchNaipe.FEMININO,
  MatchNaipe.MISTO,
] as const;
const ALL_TEAMS_FILTER_VALUE = "ALL_TEAMS";

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

function resolveNormalizedSportName(sportName: string): string {
  return sportName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function resolveIsIndividualSportName(sportName: string): boolean {
  return INDIVIDUAL_SPORT_NAMES.has(resolveNormalizedSportName(sportName));
}

function resolveColumnFirstOrderedItems<T>(items: T[], columns: number): T[] {
  if (columns <= 1 || items.length <= 1) {
    return items;
  }

  const rowsPerColumn = Math.ceil(items.length / columns);
  const itemColumns = Array.from({ length: columns }, (_, columnIndex) =>
    items.slice(columnIndex * rowsPerColumn, (columnIndex + 1) * rowsPerColumn),
  );

  const orderedItems: T[] = [];

  for (let rowIndex = 0; rowIndex < rowsPerColumn; rowIndex += 1) {
    for (
      let columnIndex = 0;
      columnIndex < itemColumns.length;
      columnIndex += 1
    ) {
      const item = itemColumns[columnIndex]?.[rowIndex];

      if (item !== undefined) {
        orderedItems.push(item);
      }
    }
  }

  return orderedItems;
}

function resolveCompetitionKey(
  sport_id: string,
  naipe: MatchNaipe,
  division: TeamDivision | null,
): string {
  return [
    sport_id,
    naipe,
    division ?? COMPETITION_DIVISION_WITHOUT_DIVISION,
  ].join("::");
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
    division:
      division == COMPETITION_DIVISION_WITHOUT_DIVISION
        ? null
        : (division as TeamDivision),
  };
}

function resolveSupportedNaipesByMode(
  naipe_mode: ChampionshipSportNaipeMode,
): MatchNaipe[] {
  if (naipe_mode == ChampionshipSportNaipeMode.MISTO) {
    return [MatchNaipe.MISTO];
  }

  return [MatchNaipe.MASCULINO, MatchNaipe.FEMININO];
}

function resolveCheckboxCheckedState(
  selected_count: number,
  eligible_count: number,
): boolean | "indeterminate" {
  if (eligible_count == 0 || selected_count == 0) {
    return false;
  }

  if (selected_count == eligible_count) {
    return true;
  }

  return "indeterminate";
}

function resolveDefaultWizardNaipeTabValue(
  naipes: MatchNaipe[],
): MatchNaipe | null {
  return (
    WIZARD_NAIPE_TAB_DEFAULT_ORDER.find((naipe) => naipes.includes(naipe)) ??
    null
  );
}

function AnimatedTabBar({ items, value, onValueChange }: AnimatedTabBarProps) {
  const containerReference = useRef<HTMLDivElement | null>(null);
  const buttonByValueReference = useRef<
    Record<string, HTMLButtonElement | null>
  >({});
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

    setActiveIndicatorLeft(activeButtonElement.offsetLeft);
    setActiveIndicatorWidth(activeButtonElement.offsetWidth);
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

  useEffect(() => {
    const containerElement = containerReference.current;

    if (!containerElement) {
      return;
    }

    containerElement.addEventListener("scroll", updateActiveIndicator);

    return () => {
      containerElement.removeEventListener("scroll", updateActiveIndicator);
    };
  }, [updateActiveIndicator]);

  return (
    <div className="flex justify-center">
      <div
        ref={containerReference}
        role="tablist"
        className="app-pill-container relative inline-flex max-w-full items-center gap-0 overflow-x-auto rounded-xl p-0"
      >
        <span
          className="app-pill-active-indicator pointer-events-none absolute inset-y-0 left-0 rounded-xl transition-[transform,width,opacity] duration-500"
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
              className={`app-pill-option relative z-10 whitespace-nowrap rounded-none px-3 py-1.5 text-sm font-medium transition-colors first:rounded-l-xl last:rounded-r-xl ${
                isSelected
                  ? "text-primary-foreground font-bold"
                  : "text-secondary-foreground hover:text-foreground"
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

function resolveNextDrawSlot(
  groupsCount: number,
  assignments: Record<string, number>,
): { groupNumber: number; positionIndex: number } {
  const countByGroup: Record<number, number> = {};
  for (let g = 1; g <= groupsCount; g++) {
    countByGroup[g] = 0;
  }
  for (const groupNum of Object.values(assignments)) {
    countByGroup[groupNum] = (countByGroup[groupNum] ?? 0) + 1;
  }
  for (let pos = 0; pos <= 200; pos++) {
    for (let g = 1; g <= groupsCount; g++) {
      if ((countByGroup[g] ?? 0) <= pos) {
        return { groupNumber: g, positionIndex: pos };
      }
    }
  }
  return { groupNumber: 1, positionIndex: 0 };
}

function resolveInitialScheduleCourt(): ScheduleCourtFormValue {
  return {
    id: resolveRandomUuid(),
    name: "",
    position: 1,
    sport_ids: [],
    sport_preference: null,
    sport_match_targets: [],
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

function resolveReplicatedScheduleDay(
  previousScheduleDay: ScheduleDayFormValue,
): ScheduleDayFormValue {
  return {
    id: resolveRandomUuid(),
    date: "",
    start_time: previousScheduleDay.start_time,
    end_time: previousScheduleDay.end_time,
    break_start_time: previousScheduleDay.break_start_time,
    break_end_time: previousScheduleDay.break_end_time,
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
        sport_preference: court.sport_preference
          ? {
              ...court.sport_preference,
            }
          : null,
        sport_match_targets: court.sport_match_targets.map((target) => ({
          ...target,
        })),
      })),
    })),
  };
}

function resolveScheduleCourtClone(
  schedule_court: ChampionshipBracketScheduleCourtDraft,
): ScheduleCourtFormValue {
  return {
    id: schedule_court.id,
    name: schedule_court.name,
    position: schedule_court.position,
    sport_ids: [...schedule_court.sport_ids],
    sport_preference: schedule_court.sport_preference
      ? {
          ...schedule_court.sport_preference,
        }
      : null,
    sport_match_targets: (schedule_court.sport_match_targets ?? []).map(
      (target) => ({
        ...target,
      }),
    ),
  };
}

function resolveScheduleLocationClone(
  schedule_location: ChampionshipBracketScheduleLocationDraft,
): ScheduleLocationFormValue {
  return {
    id: schedule_location.id,
    location_template_id: schedule_location.location_template_id,
    name: schedule_location.name,
    position: schedule_location.position,
    courts: schedule_location.courts.map((schedule_court) =>
      resolveScheduleCourtClone(schedule_court),
    ),
  };
}

function resolveScheduleDayClone(
  schedule_day: ChampionshipBracketScheduleDayDraft,
): ScheduleDayFormValue {
  return {
    id: schedule_day.id,
    date: schedule_day.date,
    start_time: schedule_day.start_time,
    end_time: schedule_day.end_time,
    break_start_time: schedule_day.break_start_time,
    break_end_time: schedule_day.break_end_time,
    locations: schedule_day.locations.map((schedule_location) =>
      resolveScheduleLocationClone(schedule_location),
    ),
  };
}

function resolveDefaultSeasonSettings(
  championshipCode?: ChampionshipCode,
): ChampionshipSeasonSettingsInput {
  if (championshipCode == ChampionshipCode.INTERLAJE) {
    return {
      division_format: ChampionshipSeasonDivisionFormat.SEPARATED,
      division_settlement_mode:
        ChampionshipSeasonDivisionSettlementMode.PROMOTION_RELEGATION,
      principal_slots_count: null,
      principal_relegation_count: 2,
      access_promotion_count: 2,
    };
  }

  return {
    division_format: ChampionshipSeasonDivisionFormat.UNIFIED,
    division_settlement_mode: ChampionshipSeasonDivisionSettlementMode.NONE,
    principal_slots_count: null,
    principal_relegation_count: null,
    access_promotion_count: null,
  };
}

function resolveUsesSeasonDivisions(
  seasonSettings: ChampionshipSeasonSettingsInput,
) {
  return (
    seasonSettings.division_format == ChampionshipSeasonDivisionFormat.SEPARATED
  );
}

function resolveInitialWizardDraftFormValues(
  seasonSettings: ChampionshipSeasonSettingsInput = resolveDefaultSeasonSettings(),
  enabledSportIds: string[] = [],
): ChampionshipBracketWizardDraftFormValues {
  return {
    current_step_index: 0,
    season_settings: seasonSettings,
    enabled_sport_ids: [...enabledSportIds],
    selected_team_ids: [],
    selected_sport_ids_by_team_id: {},
    show_estimated_start_time_on_cards_by_sport_id: {},
    selected_competition_keys_by_team_id: {},
    should_apply_modalities_to_all_teams: true,
    should_apply_naipes_to_all_teams: true,
    should_replicate_previous_schedule_day: false,
    competition_config_by_key: {},
    group_assignments_by_competition_key: {},
    group_order_by_competition_key: {},
    schedule_days: [resolveInitialScheduleDay()],
    schedule_periods: [],
    competition_period_availability: [],
    team_competition_availability: [],
    competition_date_availability: [],
    team_competition_date_availability: [],
    individual_event_configs: [],
    individual_session_configs: [],
    resource_locks: [],
    match_numbering_mode: "COURT",
    knockout_program_blocks: [],
  };
}

function areRemoteDraftMetadataEqual(
  left: ChampionshipBracketRemoteDraftMetadata | null,
  right: ChampionshipBracketRemoteDraftMetadata | null,
) {
  if (left == right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.updated_at == right.updated_at &&
    left.updated_by_name == right.updated_by_name &&
    left.updated_by == right.updated_by
  );
}

function resolveIndividualSessionConfigKey(input: {
  sport_id: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
}) {
  return resolveCompetitionKey(input.sport_id, input.naipe, input.division);
}

function resolveResourceLockFromIndividualSession(
  sessionConfig: ChampionshipBracketWizardDraftFormValues["individual_session_configs"][number],
) {
  if (
    !sessionConfig.exclusive_lock_enabled ||
    !sessionConfig.scheduled_date ||
    !sessionConfig.period ||
    !sessionConfig.location_key ||
    !sessionConfig.court_key
  ) {
    return null;
  }

  return {
    date: sessionConfig.scheduled_date,
    period: sessionConfig.period,
    location_key: sessionConfig.location_key,
    court_key: sessionConfig.court_key,
    location_name: sessionConfig.location_name,
    court_name: sessionConfig.court_name,
    lock_mode: "HARD" as const,
    competition_key: null,
    sport_id: sessionConfig.sport_id,
    naipe: sessionConfig.naipe,
    division: sessionConfig.division,
  };
}

function resolveKnockoutProgramBlockKey(
  programBlock: ChampionshipBracketKnockoutProgramBlockInput,
) {
  return [
    programBlock.date,
    programBlock.period,
    programBlock.location_key,
    programBlock.court_key,
    programBlock.sport_id,
    programBlock.division_scope,
  ].join("::");
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
      sport_preference: null,
      sport_match_targets: [],
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
      sport_preference: court.sport_preference
        ? {
            ...court.sport_preference,
          }
        : null,
      sport_match_targets: court.sport_match_targets.map((target) => ({
        ...target,
      })),
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
      sport_preference: null,
      sport_match_targets: [],
    })),
  };
}

function resolveDefaultCompetitionConfig(
  team_count: number,
  competition_option?: ChampionshipBracketWizardCompetitionOption | null,
): CompetitionConfig {
  const safe_group_count = Math.max(1, Math.min(2, team_count));

  return {
    groups_count: safe_group_count,
    qualifiers_per_group: CHAMPIONSHIP_BRACKET_DEFAULT_QUALIFIERS_PER_GROUP,
    should_complete_knockout_with_best_second_placed_teams: true,
    knockout_pairing_mode: competition_option
      ? resolveDefaultCompetitionKnockoutPairingMode()
      : "LINEAR",
  };
}

function resolveTextHashValue(text_value: string): number {
  let hash_value = 0;

  for (
    let character_index = 0;
    character_index < text_value.length;
    character_index += 1
  ) {
    hash_value = (hash_value * 31 + text_value.charCodeAt(character_index)) | 0;
  }

  return Math.abs(hash_value);
}

function resolveShuffledTeamIds(
  team_ids: string[],
  competition_key: string,
): string[] {
  return [...team_ids].sort((left_team_id, right_team_id) => {
    const left_hash_value = resolveTextHashValue(
      `${competition_key}::${left_team_id}`,
    );
    const right_hash_value = resolveTextHashValue(
      `${competition_key}::${right_team_id}`,
    );

    if (left_hash_value == right_hash_value) {
      return left_team_id.localeCompare(right_team_id);
    }

    return left_hash_value - right_hash_value;
  });
}

function resolveBalancedAssignments(
  team_ids: string[],
  groups_count: number,
  competition_key: string,
): Record<string, number> {
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

function resolveDatePeriodKey(
  date: string,
  period: ChampionshipSchedulePeriod,
): string {
  return `${date}::${period}`;
}

function resolveDatePeriodEnabledMap(
  schedulePeriods: ChampionshipBracketSchedulePeriodInput[],
): Record<string, boolean> {
  return schedulePeriods.reduce<Record<string, boolean>>(
    (carry, schedulePeriod) => {
      carry[resolveDatePeriodKey(schedulePeriod.date, schedulePeriod.period)] =
        schedulePeriod.enabled != false;
      return carry;
    },
    {},
  );
}

function sanitizeSchedulePeriodsForDates(
  dates: string[],
  schedulePeriods: ChampionshipBracketSchedulePeriodInput[],
): ChampionshipBracketSchedulePeriodInput[] {
  const periodByDatePeriodKey = new Map(
    schedulePeriods.map((schedulePeriod) => [
      resolveDatePeriodKey(schedulePeriod.date, schedulePeriod.period),
      schedulePeriod,
    ]),
  );

  return dates.flatMap((date) =>
    SCHEDULE_PERIODS.map((period) => {
      const existingSchedulePeriod = periodByDatePeriodKey.get(
        resolveDatePeriodKey(date, period),
      );

      return {
        date,
        period,
        enabled: true,
      } satisfies ChampionshipBracketSchedulePeriodInput;
    }),
  );
}

function sanitizeCompetitionPeriodAvailabilityValues({
  schedulePeriods,
  competitionKeys,
  competitionPeriodAvailability,
}: {
  schedulePeriods: ChampionshipBracketSchedulePeriodInput[];
  competitionKeys: string[];
  competitionPeriodAvailability: ChampionshipBracketCompetitionPeriodAvailabilityInput[];
}): ChampionshipBracketCompetitionPeriodAvailabilityInput[] {
  const validCompetitionKeySet = new Set(competitionKeys);
  const availabilityByKey = new Map(
    competitionPeriodAvailability
      .filter((availabilityItem) =>
        validCompetitionKeySet.has(availabilityItem.competition_key),
      )
      .map((availabilityItem) => [
        `${availabilityItem.competition_key}::${resolveDatePeriodKey(
          availabilityItem.date,
          availabilityItem.period,
        )}`,
        availabilityItem,
      ]),
  );

  return competitionKeys.flatMap((competitionKey) =>
    schedulePeriods.map((schedulePeriod) => {
      const availabilityKey = `${competitionKey}::${resolveDatePeriodKey(
        schedulePeriod.date,
        schedulePeriod.period,
      )}`;
      const existingAvailability = availabilityByKey.get(availabilityKey);

      return {
        competition_key: competitionKey,
        date: schedulePeriod.date,
        period: schedulePeriod.period,
        enabled: existingAvailability?.enabled != false,
      } satisfies ChampionshipBracketCompetitionPeriodAvailabilityInput;
    }),
  );
}

function sanitizeTeamCompetitionAvailabilityValues({
  schedulePeriods,
  teamCompetitionKeysByTeamId,
  teamCompetitionAvailability,
}: {
  schedulePeriods: ChampionshipBracketSchedulePeriodInput[];
  teamCompetitionKeysByTeamId: Record<string, string[]>;
  teamCompetitionAvailability: ChampionshipBracketTeamCompetitionAvailabilityInput[];
}): ChampionshipBracketTeamCompetitionAvailabilityInput[] {
  const validTeamCompetitionKeySet = new Set(
    Object.entries(teamCompetitionKeysByTeamId).flatMap(
      ([teamId, competitionKeys]) =>
        competitionKeys.map((competitionKey) => `${teamId}::${competitionKey}`),
    ),
  );
  const availabilityByKey = new Map(
    teamCompetitionAvailability
      .filter((availabilityItem) =>
        validTeamCompetitionKeySet.has(
          `${availabilityItem.team_id}::${availabilityItem.competition_key}`,
        ),
      )
      .map((availabilityItem) => [
        `${availabilityItem.team_id}::${availabilityItem.competition_key}::${resolveDatePeriodKey(
          availabilityItem.date,
          availabilityItem.period,
        )}`,
        availabilityItem,
      ]),
  );

  return Object.entries(teamCompetitionKeysByTeamId).flatMap(
    ([teamId, competitionKeys]) =>
      competitionKeys.flatMap((competitionKey) =>
        schedulePeriods.map((schedulePeriod) => {
          const availabilityKey = `${teamId}::${competitionKey}::${resolveDatePeriodKey(
            schedulePeriod.date,
            schedulePeriod.period,
          )}`;
          const existingAvailability = availabilityByKey.get(availabilityKey);

          return {
            team_id: teamId,
            competition_key: competitionKey,
            date: schedulePeriod.date,
            period: schedulePeriod.period,
            enabled: existingAvailability?.enabled != false,
          } satisfies ChampionshipBracketTeamCompetitionAvailabilityInput;
        }),
      ),
  );
}

function resolveScheduleDayDateTimeValue(
  schedule_day: ScheduleDayFormValue,
  time_value: string,
): Date | null {
  if (!schedule_day.date || !time_value) {
    return null;
  }

  const [year_value, month_value, day_value] = schedule_day.date
    .split("-")
    .map(Number);
  const [hour_value, minute_value] = time_value.split(":").map(Number);

  if (
    !year_value ||
    !month_value ||
    !day_value ||
    Number.isNaN(hour_value) ||
    Number.isNaN(minute_value)
  ) {
    return null;
  }

  const resolved_date_time = new Date(
    year_value,
    month_value - 1,
    day_value,
    hour_value,
    minute_value,
    0,
    0,
  );

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

  return hourValue * 60 + minuteValue;
}

function resolveEditableDraftSnapshot(
  draft_form_values: ChampionshipBracketWizardDraftFormValues,
): string {
  const normalized_draft =
    ChampionshipBracketWizardDraftDTO.fromFormValues(
      draft_form_values,
    ).bindToSave();

  return JSON.stringify({
    ...normalized_draft,
    current_step_index: 0,
  });
}

function resolveSnapshotDraftFormValues(
  snapshot: string,
): ChampionshipBracketWizardDraftFormValues | null {
  try {
    const parsedSnapshot = JSON.parse(snapshot);

    if (typeof parsedSnapshot != "object" || parsedSnapshot == null) {
      return null;
    }

    return parsedSnapshot as ChampionshipBracketWizardDraftFormValues;
  } catch {
    return null;
  }
}

function resolveCompetitionGroupSlotSelectionKey(
  competitionKey: string,
  groupNumber: number,
  slotId: string,
): string {
  return `${competitionKey}::${groupNumber}::${slotId}`;
}

export function AdminChampionshipBracketPage({
  selectedChampionship,
  teams,
  championshipSports,
  onGenerated,
}: Props) {
  const defaultEnabledSportIds = useMemo(
    () =>
      championshipSports.map((championshipSport) => championshipSport.sport_id),
    [championshipSports],
  );
  const defaultSeasonSettings = useMemo(
    () => resolveDefaultSeasonSettings(selectedChampionship.code),
    [selectedChampionship.code],
  );
  const { seasonSettings: persistedSeasonSettings } =
    useChampionshipSeasonSettings({
      championshipId: selectedChampionship.id,
      seasonYear: selectedChampionship.current_season_year,
    });
  const resolvedDefaultSeasonSettings = useMemo(() => {
    if (!persistedSeasonSettings) {
      return defaultSeasonSettings;
    }

    return {
      division_format: persistedSeasonSettings.division_format,
      division_settlement_mode:
        persistedSeasonSettings.division_settlement_mode,
      principal_slots_count: persistedSeasonSettings.principal_slots_count,
      principal_relegation_count:
        persistedSeasonSettings.principal_relegation_count,
      access_promotion_count: persistedSeasonSettings.access_promotion_count,
    } satisfies ChampionshipSeasonSettingsInput;
  }, [defaultSeasonSettings, persistedSeasonSettings]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [seasonSettings, setSeasonSettings] =
    useState<ChampionshipSeasonSettingsInput>(resolvedDefaultSeasonSettings);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [enabledSportIds, setEnabledSportIds] = useState<string[]>([]);
  const [selectedSportIdsByTeamId, setSelectedSportIdsByTeamId] = useState<
    Record<string, string[]>
  >({});
  const [
    showEstimatedStartTimeOnCardsBySportId,
    setShowEstimatedStartTimeOnCardsBySportId,
  ] = useState<Record<string, boolean>>({});
  const [selectedCompetitionKeysByTeamId, setSelectedCompetitionKeysByTeamId] =
    useState<Record<string, string[]>>({});
  const [shouldApplyModalitiesToAllTeams, setShouldApplyModalitiesToAllTeams] =
    useState(true);
  const [shouldApplyNaipesToAllTeams, setShouldApplyNaipesToAllTeams] =
    useState(true);
  const [
    shouldReplicatePreviousScheduleDay,
    setShouldReplicatePreviousScheduleDay,
  ] = useState(false);
  const [competitionConfigByKey, setCompetitionConfigByKey] = useState<
    Record<string, CompetitionConfig>
  >({});
  const [groupCountInputByCompetitionKey, setGroupCountInputByCompetitionKey] =
    useState<Record<string, string>>({});
  const [
    groupAssignmentsByCompetitionKey,
    setGroupAssignmentsByCompetitionKey,
  ] = useState<Record<string, Record<string, number>>>({});
  const [groupOrderByCompetitionKey, setGroupOrderByCompetitionKey] = useState<
    Record<string, ChampionshipBracketGroupOrderedTeamIdsByGroupNumber>
  >({});
  const [autoOpenCompetitionGroupSlotKey, setAutoOpenCompetitionGroupSlotKey] =
    useState<string | null>(null);
  const [activeNaipeTabBySportId, setActiveNaipeTabBySportId] = useState<
    Record<string, MatchNaipe>
  >({});
  const [
    activeTeamAvailabilityNaipeTabByTeamSportKey,
    setActiveTeamAvailabilityNaipeTabByTeamSportKey,
  ] = useState<Record<string, MatchNaipe>>({});
  const [teamAvailabilitySearchTerm, setTeamAvailabilitySearchTerm] =
    useState("");
  const [
    selectedTeamAvailabilityFilterValue,
    setSelectedTeamAvailabilityFilterValue,
  ] = useState(ALL_TEAMS_FILTER_VALUE);
  const [
    transientGroupSlotIdsByCompetitionKey,
    setTransientGroupSlotIdsByCompetitionKey,
  ] = useState<
    Record<string, ChampionshipBracketGroupEditorTransientSlotIdsByGroupNumber>
  >({});
  const [scheduleDays, setScheduleDays] = useState<ScheduleDayFormValue[]>([
    resolveInitialScheduleDay(),
  ]);
  const [schedulePeriods, setSchedulePeriods] = useState<
    ChampionshipBracketSchedulePeriodInput[]
  >([]);
  const [competitionPeriodAvailability, setCompetitionPeriodAvailability] =
    useState<ChampionshipBracketCompetitionPeriodAvailabilityInput[]>([]);
  const [competitionDateAvailability, setCompetitionDateAvailability] =
    useState<
      NonNullable<
        ChampionshipBracketWizardDraftFormValues["competition_date_availability"]
      >
    >([]);
  const [teamCompetitionAvailability, setTeamCompetitionAvailability] =
    useState<ChampionshipBracketTeamCompetitionAvailabilityInput[]>([]);
  const [teamCompetitionDateAvailability, setTeamCompetitionDateAvailability] =
    useState<
      NonNullable<
        ChampionshipBracketWizardDraftFormValues["team_competition_date_availability"]
      >
    >([]);
  const [individualEventConfigs, setIndividualEventConfigs] = useState<
    ChampionshipBracketIndividualEventConfigInput[]
  >([]);
  const [individualSessionConfigs, setIndividualSessionConfigs] = useState<
    ChampionshipBracketWizardDraftFormValues["individual_session_configs"]
  >([]);
  const [resourceLocks, setResourceLocks] = useState<
    ChampionshipBracketWizardDraftFormValues["resource_locks"]
  >([]);
  const [matchNumberingMode, setMatchNumberingMode] =
    useState<ChampionshipBracketMatchNumberingMode>("COURT");
  const [knockoutProgramBlocks, setKnockoutProgramBlocks] = useState<
    ChampionshipBracketWizardDraftFormValues["knockout_program_blocks"]
  >([]);
  const [locationTemplates, setLocationTemplates] = useState<
    ChampionshipBracketLocationTemplate[]
  >([]);
  const [locationTemplatesLoading, setLocationTemplatesLoading] =
    useState(false);
  const [locationTemplateSelectionDayId, setLocationTemplateSelectionDayId] =
    useState<string | null>(null);
  const [locationTemplateModalOpen, setLocationTemplateModalOpen] =
    useState(false);
  const [locationTemplateModalTarget, setLocationTemplateModalTarget] =
    useState<LocationTemplateModalTarget | null>(null);
  const [locationTemplateModalFormValues, setLocationTemplateModalFormValues] =
    useState<LocationTemplateModalFormValue>(
      resolveInitialLocationTemplateModalFormValue(),
    );
  const [locationTemplateDeletionTarget, setLocationTemplateDeletionTarget] =
    useState<LocationTemplateDeletionTarget | null>(null);
  const [savingLocationTemplate, setSavingLocationTemplate] = useState(false);
  const [deletingLocationTemplate, setDeletingLocationTemplate] =
    useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErrorBannerData, setSaveErrorBannerData] =
    useState<SaveErrorBannerData | null>(null);

  const [operationalPreview, setOperationalPreview] =
    useState<ChampionshipBracketPreviewResult | null>(null);

  const [loadingOperationalPreview, setLoadingOperationalPreview] =
    useState(false);

  const [operationalPreviewError, setOperationalPreviewError] = useState<
    string | null
  >(null);
  const operationalPreviewStepRequestStartedRef = useRef(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [hasShownRemoteDraftWarning, setHasShownRemoteDraftWarning] =
    useState(false);
  const [remoteDraftMetadata, setRemoteDraftMetadata] =
    useState<ChampionshipBracketRemoteDraftMetadata | null>(null);
  const [hasResolvedInitialDraftSnapshot, setHasResolvedInitialDraftSnapshot] =
    useState(false);
  const [lastSavedEditableDraftSnapshot, setLastSavedEditableDraftSnapshot] =
    useState<string>(() => {
      return resolveEditableDraftSnapshot(
        resolveInitialWizardDraftFormValues(
          resolvedDefaultSeasonSettings,
          defaultEnabledSportIds,
        ),
      );
    });
  const saveErrorBannerReference = useRef<HTMLDivElement | null>(null);
  const applyWizardDraftReference = useRef<
    | ((
        draft_form_values: ChampionshipBracketWizardDraftFormValues,
        options?: {
          persistAsSavedSnapshot?: boolean;
          resetVisualState?: boolean;
        },
      ) => void)
    | null
  >(null);
  const resetWizardStateReference = useRef<(() => void) | null>(null);
  const lastAutoSanitizedSnapshotReference = useRef<string | null>(null);
  const [drawingCompetitionKey, setDrawingCompetitionKey] = useState<
    string | null
  >(null);
  const [showDrawModal, setShowDrawModal] = useState(false);
  const [pendingDrawResult, setPendingDrawResult] = useState<{
    teamId: string;
    groupNumber: number;
    slotId: string;
  } | null>(null);

  const sanitizeDraftFormValues = useCallback(
    (draftFormValues: ChampionshipBracketWizardDraftFormValues) => {
      return sanitizeChampionshipBracketWizardDraft({
        draftFormValues,
        teams,
        championshipSports,
        seasonSettings:
          draftFormValues.season_settings ?? resolvedDefaultSeasonSettings,
      });
    },
    [championshipSports, resolvedDefaultSeasonSettings, teams],
  );

  const applyWizardDraft = useCallback(
    (
      draft_form_values: ChampionshipBracketWizardDraftFormValues,
      options: {
        persistAsSavedSnapshot?: boolean;
        resetVisualState?: boolean;
      } = {},
    ) => {
      const sanitizedDraftFormValues =
        sanitizeDraftFormValues(draft_form_values);
      const defaultShowEstimatedStartTimeOnCardsBySportId =
        championshipSports.reduce<Record<string, boolean>>(
          (carry, championshipSport) => {
            carry[championshipSport.sport_id] =
              championshipSport.show_estimated_start_time_on_cards;
            return carry;
          },
          {},
        );
      const nextCurrentStepIndex = Math.max(
        0,
        Math.min(
          sanitizedDraftFormValues.current_step_index,
          WIZARD_STEP_LABELS.length - 1,
        ),
      );
      const resolvedScheduleDays =
        sanitizedDraftFormValues.schedule_days.length > 0
          ? sanitizedDraftFormValues.schedule_days.map((schedule_day) =>
              resolveScheduleDayClone(schedule_day),
            )
          : [resolveInitialScheduleDay()];
      const appliedDraftFormValues: ChampionshipBracketWizardDraftFormValues = {
        ...sanitizedDraftFormValues,
        current_step_index: nextCurrentStepIndex,
        schedule_days: resolvedScheduleDays.map((schedule_day) =>
          resolveScheduleDayClone(schedule_day),
        ),
      };

      setCurrentStepIndex(nextCurrentStepIndex);
      setSeasonSettings(appliedDraftFormValues.season_settings);
      setEnabledSportIds(appliedDraftFormValues.enabled_sport_ids);
      setSelectedTeamIds(appliedDraftFormValues.selected_team_ids);
      setSelectedSportIdsByTeamId(
        appliedDraftFormValues.selected_sport_ids_by_team_id,
      );
      setShowEstimatedStartTimeOnCardsBySportId({
        ...defaultShowEstimatedStartTimeOnCardsBySportId,
        ...appliedDraftFormValues.show_estimated_start_time_on_cards_by_sport_id,
      });
      setSelectedCompetitionKeysByTeamId(
        appliedDraftFormValues.selected_competition_keys_by_team_id,
      );
      setShouldApplyModalitiesToAllTeams(
        appliedDraftFormValues.should_apply_modalities_to_all_teams,
      );
      setShouldApplyNaipesToAllTeams(
        appliedDraftFormValues.should_apply_naipes_to_all_teams,
      );
      setShouldReplicatePreviousScheduleDay(
        appliedDraftFormValues.should_replicate_previous_schedule_day,
      );
      setCompetitionConfigByKey(
        appliedDraftFormValues.competition_config_by_key,
      );
      setGroupAssignmentsByCompetitionKey(
        appliedDraftFormValues.group_assignments_by_competition_key,
      );
      setGroupOrderByCompetitionKey(
        appliedDraftFormValues.group_order_by_competition_key,
      );
      setScheduleDays(resolvedScheduleDays);
      setSchedulePeriods(
        appliedDraftFormValues.schedule_periods.map((schedulePeriod) => ({
          ...schedulePeriod,
          enabled: true,
        })),
      );
      setCompetitionPeriodAvailability(
        appliedDraftFormValues.competition_period_availability,
      );
      setCompetitionDateAvailability(
        appliedDraftFormValues.competition_date_availability ?? [],
      );
      setTeamCompetitionAvailability(
        appliedDraftFormValues.team_competition_availability,
      );
      setTeamCompetitionDateAvailability(
        appliedDraftFormValues.team_competition_date_availability ?? [],
      );
      setIndividualEventConfigs(
        appliedDraftFormValues.individual_event_configs,
      );
      setIndividualSessionConfigs(
        appliedDraftFormValues.individual_session_configs,
      );
      setResourceLocks(appliedDraftFormValues.resource_locks);
      setMatchNumberingMode(appliedDraftFormValues.match_numbering_mode);
      setKnockoutProgramBlocks(appliedDraftFormValues.knockout_program_blocks);
      setSaveErrorBannerData(null);

      if (options.resetVisualState == true) {
        setGroupCountInputByCompetitionKey({});
        setAutoOpenCompetitionGroupSlotKey(null);
        setActiveNaipeTabBySportId({});
        setTransientGroupSlotIdsByCompetitionKey({});
        setLocationTemplateSelectionDayId(null);
        setLocationTemplateModalOpen(false);
        setLocationTemplateModalTarget(null);
        setLocationTemplateModalFormValues(
          resolveInitialLocationTemplateModalFormValue(),
        );
        setLocationTemplateDeletionTarget(null);
      }

      if (options.persistAsSavedSnapshot !== false) {
        setLastSavedEditableDraftSnapshot(
          resolveEditableDraftSnapshot(appliedDraftFormValues),
        );
      }
      setHasResolvedInitialDraftSnapshot(true);
    },
    [championshipSports, sanitizeDraftFormValues],
  );

  applyWizardDraftReference.current = applyWizardDraft;

  const resetWizardState = useCallback(() => {
    applyWizardDraft(
      resolveInitialWizardDraftFormValues(
        resolvedDefaultSeasonSettings,
        defaultEnabledSportIds,
      ),
      { resetVisualState: true },
    );
  }, [applyWizardDraft, defaultEnabledSportIds, resolvedDefaultSeasonSettings]);

  resetWizardStateReference.current = resetWizardState;

  const loadLocationTemplates = useCallback(async () => {
    setLocationTemplatesLoading(true);

    const response = await fetchChampionshipBracketLocationTemplates();

    if (response.error) {
      toast.error(
        response.error.message ||
          "Não foi possível carregar os locais cadastrados.",
      );
      setLocationTemplatesLoading(false);
      return;
    }

    setLocationTemplates(response.data);
    setLocationTemplatesLoading(false);
  }, []);

  const resolveWizardDraftFormValues =
    useCallback((): ChampionshipBracketWizardDraftFormValues => {
      return {
        current_step_index: currentStepIndex,
        season_settings: seasonSettings,
        enabled_sport_ids: [...enabledSportIds],
        selected_team_ids: [...selectedTeamIds],
        selected_sport_ids_by_team_id: Object.entries(
          selectedSportIdsByTeamId,
        ).reduce<Record<string, string[]>>(
          (carry, [team_id, selected_sport_ids]) => {
            carry[team_id] = [...selected_sport_ids];
            return carry;
          },
          {},
        ),
        show_estimated_start_time_on_cards_by_sport_id: Object.entries(
          showEstimatedStartTimeOnCardsBySportId,
        ).reduce<Record<string, boolean>>(
          (carry, [sport_id, shouldShowEstimatedStartTimeOnCards]) => {
            carry[sport_id] = shouldShowEstimatedStartTimeOnCards;
            return carry;
          },
          {},
        ),
        selected_competition_keys_by_team_id: Object.entries(
          selectedCompetitionKeysByTeamId,
        ).reduce<Record<string, string[]>>(
          (carry, [team_id, selected_competition_keys]) => {
            carry[team_id] = [...selected_competition_keys];
            return carry;
          },
          {},
        ),
        should_apply_modalities_to_all_teams: shouldApplyModalitiesToAllTeams,
        should_apply_naipes_to_all_teams: shouldApplyNaipesToAllTeams,
        should_replicate_previous_schedule_day:
          shouldReplicatePreviousScheduleDay,
        competition_config_by_key: Object.entries(
          competitionConfigByKey,
        ).reduce<Record<string, CompetitionConfig>>(
          (carry, [competition_key, competition_config]) => {
            carry[competition_key] = {
              groups_count: competition_config.groups_count,
              qualifiers_per_group: competition_config.qualifiers_per_group,
              should_complete_knockout_with_best_second_placed_teams:
                competition_config.should_complete_knockout_with_best_second_placed_teams,
              knockout_pairing_mode: competition_config.knockout_pairing_mode,
            };
            return carry;
          },
          {},
        ),
        group_assignments_by_competition_key: Object.entries(
          groupAssignmentsByCompetitionKey,
        ).reduce<Record<string, Record<string, number>>>(
          (carry, [competition_key, team_group_map]) => {
            carry[competition_key] = { ...team_group_map };
            return carry;
          },
          {},
        ),
        group_order_by_competition_key: Object.entries(
          groupOrderByCompetitionKey,
        ).reduce<
          Record<string, ChampionshipBracketGroupOrderedTeamIdsByGroupNumber>
        >((carry, [competition_key, ordered_team_ids_by_group_number]) => {
          carry[competition_key] = Object.entries(
            ordered_team_ids_by_group_number,
          ).reduce<ChampionshipBracketGroupOrderedTeamIdsByGroupNumber>(
            (groupCarry, [group_number, team_ids]) => {
              groupCarry[group_number] = [...team_ids];
              return groupCarry;
            },
            {},
          );
          return carry;
        }, {}),
        schedule_days: scheduleDays.map((schedule_day) =>
          resolveScheduleDayClone(schedule_day),
        ),
        schedule_periods: schedulePeriods.map((schedulePeriod) => ({
          date: schedulePeriod.date,
          period: schedulePeriod.period,
          enabled: schedulePeriod.enabled != false,
        })),
        competition_period_availability: competitionPeriodAvailability.map(
          (availabilityItem) => ({
            competition_key: availabilityItem.competition_key,
            date: availabilityItem.date,
            period: availabilityItem.period,
            enabled: availabilityItem.enabled != false,
          }),
        ),
        competition_date_availability: competitionDateAvailability.map(
          (availabilityItem) => ({
            competition_key: availabilityItem.competition_key,
            date: availabilityItem.date,
            mode: availabilityItem.mode,
            windows: availabilityItem.windows.map((window) => ({
              start_time: window.start_time,
              end_time: window.end_time,
            })),
          }),
        ),
        team_competition_availability: teamCompetitionAvailability.map(
          (availabilityItem) => ({
            team_id: availabilityItem.team_id,
            competition_key: availabilityItem.competition_key,
            date: availabilityItem.date,
            period: availabilityItem.period,
            enabled: availabilityItem.enabled != false,
          }),
        ),
        team_competition_date_availability:
          teamCompetitionDateAvailability.map((availabilityItem) => ({
            team_id: availabilityItem.team_id,
            competition_key: availabilityItem.competition_key,
            date: availabilityItem.date,
            mode: availabilityItem.mode,
            windows: availabilityItem.windows.map((window) => ({
              start_time: window.start_time,
              end_time: window.end_time,
            })),
          })),
        individual_event_configs: individualEventConfigs.map((configItem) => ({
          sport_id: configItem.sport_id,
          placements_count: configItem.placements_count,
          placement_points: configItem.placement_points.map(
            (placementPoint) => ({
              placement: placementPoint.placement,
              points: placementPoint.points,
            }),
          ),
          relay_multiplier: configItem.relay_multiplier,
        })),
        individual_session_configs: individualSessionConfigs.map(
          (sessionConfig) => ({
            ...sessionConfig,
          }),
        ),
        resource_locks: resourceLocks.map((resourceLock) => ({
          ...resourceLock,
        })),
        match_numbering_mode: matchNumberingMode,
        knockout_program_blocks: knockoutProgramBlocks.map((programBlock) => ({
          ...programBlock,
          naipe_sequence: [...programBlock.naipe_sequence],
        })),
      };
    }, [
      competitionDateAvailability,
      competitionPeriodAvailability,
      competitionConfigByKey,
      currentStepIndex,
      enabledSportIds,
      groupAssignmentsByCompetitionKey,
      groupOrderByCompetitionKey,
      individualEventConfigs,
      individualSessionConfigs,
      knockoutProgramBlocks,
      matchNumberingMode,
      resourceLocks,
      scheduleDays,
      schedulePeriods,
      seasonSettings,
      showEstimatedStartTimeOnCardsBySportId,
      selectedCompetitionKeysByTeamId,
      selectedSportIdsByTeamId,
      selectedTeamIds,
      teamCompetitionAvailability,
      teamCompetitionDateAvailability,
      shouldApplyModalitiesToAllTeams,
      shouldApplyNaipesToAllTeams,
      shouldReplicatePreviousScheduleDay,
    ]);

  const currentWizardDraftFormValues = useMemo(() => {
    return resolveWizardDraftFormValues();
  }, [resolveWizardDraftFormValues]);

  const sanitizedCurrentWizardDraftFormValues = useMemo(() => {
    return sanitizeDraftFormValues(currentWizardDraftFormValues);
  }, [currentWizardDraftFormValues, sanitizeDraftFormValues]);

  const currentEditableDraftSnapshot = useMemo(() => {
    return resolveEditableDraftSnapshot(currentWizardDraftFormValues);
  }, [currentWizardDraftFormValues]);

  const isDraftSaveDisabled =
    saving ||
    !hasResolvedInitialDraftSnapshot ||
    currentEditableDraftSnapshot == lastSavedEditableDraftSnapshot;

  useEffect(() => {
    const mediaQueryList = window.matchMedia("(max-width: 1023px)");
    const handleViewportChange = () => {
      setIsCompactViewport(mediaQueryList.matches);
    };

    handleViewportChange();
    mediaQueryList.addEventListener("change", handleViewportChange);

    return () => {
      mediaQueryList.removeEventListener("change", handleViewportChange);
    };
  }, []);

  const draftLastUpdatedLabel = useMemo(() => {
    if (!remoteDraftMetadata?.updated_at) {
      return null;
    }

    const parsedUpdatedAt = new Date(remoteDraftMetadata.updated_at);
    if (Number.isNaN(parsedUpdatedAt.getTime())) {
      return null;
    }

    const formattedDate = parsedUpdatedAt.toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });

    if (remoteDraftMetadata.updated_by_name) {
      return `Última atualização: ${formattedDate} por ${remoteDraftMetadata.updated_by_name}`;
    }

    return `Última atualização: ${formattedDate}`;
  }, [remoteDraftMetadata]);

  const writeWorkflowLog = useCallback(
    async ({
      actionType,
      stepIndex,
      description,
      workflowAction,
      changedFields,
    }: {
      actionType: "INSERT" | "UPDATE";
      stepIndex: number;
      description: string;
      workflowAction: string;
      changedFields?: string[];
    }) => {
      const { error } = await supabase.rpc(
        "write_championship_bracket_workflow_log",
        {
          _action_type: actionType,
          _step: WIZARD_STEP_LABELS[stepIndex] ?? "Fluxo de configuração",
          _description: description,
          _metadata: {
            workflow_action: workflowAction,
            championship_id: selectedChampionship.id,
            season_year: selectedChampionship.current_season_year,
            changed_fields: changedFields ?? [],
          },
        },
      );

      if (error) {
        console.error(
          "Erro ao registrar log do fluxo de configuração:",
          error.message,
        );
      }
    },
    [selectedChampionship.current_season_year, selectedChampionship.id],
  );

  const resolveWorkflowChangedFields = useCallback(
    (
      previousSnapshot: string,
      nextDraftFormValues: ChampionshipBracketWizardDraftFormValues,
      stepIndex: number,
    ): string[] => {
      const previousDraftFormValues =
        resolveSnapshotDraftFormValues(previousSnapshot);

      if (!previousDraftFormValues) {
        return [];
      }

      if (stepIndex == 1) {
        const previousEnabledSports =
          previousDraftFormValues.enabled_sport_ids.length;
        const nextEnabledSports = nextDraftFormValues.enabled_sport_ids.length;

        if (previousEnabledSports != nextEnabledSports) {
          return [
            `Modalidades habilitadas: ${previousEnabledSports} para ${nextEnabledSports}`,
          ];
        }

        return [];
      }

      if (stepIndex == 2) {
        const previousSelectedTeams =
          previousDraftFormValues.selected_team_ids.length;
        const nextSelectedTeams = nextDraftFormValues.selected_team_ids.length;

        if (previousSelectedTeams != nextSelectedTeams) {
          return [
            `Participantes selecionados: ${previousSelectedTeams} para ${nextSelectedTeams}`,
          ];
        }

        return [];
      }

      if (stepIndex == 5) {
        const previousConfigByKey =
          previousDraftFormValues.competition_config_by_key;
        const nextConfigByKey = nextDraftFormValues.competition_config_by_key;
        const competitionKeys = [
          ...new Set([
            ...Object.keys(previousConfigByKey),
            ...Object.keys(nextConfigByKey),
          ]),
        ];
        const changeLines: string[] = [];

        competitionKeys.forEach((competitionKey) => {
          const previousConfig = previousConfigByKey[competitionKey];
          const nextConfig = nextConfigByKey[competitionKey];
          const parsedCompetitionKey = parseCompetitionKey(competitionKey);
          const sportName =
            championshipSports.find(
              (championshipSport) =>
                championshipSport.sport_id == parsedCompetitionKey.sport_id,
            )?.sports?.name ?? "Modalidade";
          const competitionLabel = `${sportName} • ${
            MATCH_NAIPE_LABELS[parsedCompetitionKey.naipe]
          }${
            parsedCompetitionKey.division
              ? ` • ${TEAM_DIVISION_LABELS[parsedCompetitionKey.division]}`
              : ""
          }`;

          if (!previousConfig || !nextConfig) {
            return;
          }

          if (previousConfig.groups_count != nextConfig.groups_count) {
            changeLines.push(
              `${competitionLabel}: grupos de ${previousConfig.groups_count} para ${nextConfig.groups_count}`,
            );
          }

          if (
            previousConfig.qualifiers_per_group !=
            nextConfig.qualifiers_per_group
          ) {
            changeLines.push(
              `${competitionLabel}: classificados por grupo de ${previousConfig.qualifiers_per_group} para ${nextConfig.qualifiers_per_group}`,
            );
          }

          if (
            previousConfig.should_complete_knockout_with_best_second_placed_teams !=
            nextConfig.should_complete_knockout_with_best_second_placed_teams
          ) {
            changeLines.push(
              `${competitionLabel}: completar chave com melhores 2º ${
                nextConfig.should_complete_knockout_with_best_second_placed_teams
                  ? "ativado"
                  : "desativado"
              }`,
            );
          }
        });

        return changeLines.slice(0, 10);
      }

      if (stepIndex == 6) {
        const previousScheduleDays =
          previousDraftFormValues.schedule_days.length;
        const nextScheduleDays = nextDraftFormValues.schedule_days.length;

        if (previousScheduleDays != nextScheduleDays) {
          return [
            `Dias de agenda: ${previousScheduleDays} para ${nextScheduleDays}`,
          ];
        }
      }

      return [];
    },
    [championshipSports],
  );

  useEffect(() => {
    void loadLocationTemplates();
    let isMounted = true;

    const loadDraft = async () => {
      const storedDraftResult = await fetchChampionshipBracketWizardDraft(
        selectedChampionship.id,
      );

      if (!isMounted) {
        return;
      }

      setRemoteDraftMetadata((currentRemoteDraftMetadata) =>
        areRemoteDraftMetadataEqual(
          currentRemoteDraftMetadata,
          storedDraftResult.metadata,
        )
          ? currentRemoteDraftMetadata
          : storedDraftResult.metadata,
      );

      if (storedDraftResult.draft_form_values) {
        applyWizardDraftReference.current?.(
          storedDraftResult.draft_form_values,
          {
            resetVisualState: true,
          },
        );
        toast.success(
          storedDraftResult.source == "local"
            ? "Rascunho local restaurado e sincronizado com sucesso."
            : "Rascunho restaurado com sucesso.",
        );
        return;
      }

      resetWizardStateReference.current?.();
    };

    void loadDraft();

    return () => {
      isMounted = false;
    };
  }, [loadLocationTemplates, selectedChampionship.id]);

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

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    const currentSnapshot = resolveEditableDraftSnapshot(
      currentWizardDraftFormValues,
    );
    const sanitizedSnapshot = resolveEditableDraftSnapshot(
      sanitizedCurrentWizardDraftFormValues,
    );

    if (currentSnapshot == sanitizedSnapshot) {
      lastAutoSanitizedSnapshotReference.current = null;
      return;
    }

    if (lastAutoSanitizedSnapshotReference.current == sanitizedSnapshot) {
      return;
    }

    lastAutoSanitizedSnapshotReference.current = sanitizedSnapshot;

    applyWizardDraft(sanitizedCurrentWizardDraftFormValues, {
      persistAsSavedSnapshot: false,
      resetVisualState: false,
    });
  }, [
    applyWizardDraft,
    currentWizardDraftFormValues,
    hasResolvedInitialDraftSnapshot,
    sanitizedCurrentWizardDraftFormValues,
  ]);

  const resolveSaveErrorSuggestion = useCallback(
    (errorMessage: string): string => {
      if (errorMessage.includes("local compatível")) {
        return "Sugestão: Revise os locais da etapa de agenda e confirme se cada modalidade tem ao menos um local compatível.";
      }

      return "Sugestão: Revise as configurações das etapas anteriores e tente novamente.";
    },
    [],
  );

  const selectableTeams = useMemo(() => {
    return resolveSelectableChampionshipTeams(teams, seasonSettings).sort(
      (firstTeam, secondTeam) =>
        firstTeam.name.localeCompare(secondTeam.name, "pt-BR", {
          sensitivity: "base",
        }),
    );
  }, [seasonSettings, teams]);

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

  const selectedSportIdSet = useMemo(() => {
    return new Set(
      selectedTeamIds.flatMap(
        (teamId) => selectedSportIdsByTeamId[teamId] ?? [],
      ),
    );
  }, [selectedSportIdsByTeamId, selectedTeamIds]);

  const enabledSportIdSet = useMemo(() => {
    return new Set(enabledSportIds);
  }, [enabledSportIds]);

  const enabledChampionshipSports = useMemo(() => {
    return championshipSports.filter((championshipSport) =>
      enabledSportIdSet.has(championshipSport.sport_id),
    );
  }, [championshipSports, enabledSportIdSet]);

  const championshipSportCards = useMemo(() => {
    return [...championshipSports].sort(
      (leftChampionshipSport, rightChampionshipSport) =>
        (leftChampionshipSport.sports?.name ?? "Modalidade").localeCompare(
          rightChampionshipSport.sports?.name ?? "Modalidade",
          "pt-BR",
          { sensitivity: "base" },
        ),
    );
  }, [championshipSports]);

  const selectedIndividualSports = useMemo(() => {
    return enabledChampionshipSports
      .filter((championshipSport) => {
        return (
          selectedSportIdSet.has(championshipSport.sport_id) &&
          resolveIsIndividualSportName(championshipSport.sports?.name ?? "")
        );
      })
      .map((championshipSport) => ({
        sport_id: championshipSport.sport_id,
        sport_name: championshipSport.sports?.name ?? "Modalidade",
      }));
  }, [enabledChampionshipSports, selectedSportIdSet]);

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    const selectableTeamIdSet = new Set(selectableTeamIds);

    setSelectedTeamIds((currentSelectedTeamIds) => {
      const nextSelectedTeamIds = currentSelectedTeamIds.filter((team_id) =>
        selectableTeamIdSet.has(team_id),
      );

      if (nextSelectedTeamIds.length == currentSelectedTeamIds.length) {
        return currentSelectedTeamIds;
      }

      return nextSelectedTeamIds;
    });

    setSelectedSportIdsByTeamId((currentSelectedSportIdsByTeamId) => {
      const nextSelectedSportIdsByTeamId = Object.entries(
        currentSelectedSportIdsByTeamId,
      ).reduce<Record<string, string[]>>(
        (carry, [team_id, selectedSportIds]) => {
          if (!selectableTeamIdSet.has(team_id)) {
            return carry;
          }

          carry[team_id] = selectedSportIds;
          return carry;
        },
        {},
      );

      if (
        Object.keys(nextSelectedSportIdsByTeamId).length ==
        Object.keys(currentSelectedSportIdsByTeamId).length
      ) {
        return currentSelectedSportIdsByTeamId;
      }

      return nextSelectedSportIdsByTeamId;
    });

    setSelectedCompetitionKeysByTeamId(
      (currentSelectedCompetitionKeysByTeamId) => {
        const nextSelectedCompetitionKeysByTeamId = Object.entries(
          currentSelectedCompetitionKeysByTeamId,
        ).reduce<Record<string, string[]>>(
          (carry, [team_id, selectedCompetitionKeys]) => {
            if (!selectableTeamIdSet.has(team_id)) {
              return carry;
            }

            carry[team_id] = selectedCompetitionKeys;
            return carry;
          },
          {},
        );

        if (
          Object.keys(nextSelectedCompetitionKeysByTeamId).length ==
          Object.keys(currentSelectedCompetitionKeysByTeamId).length
        ) {
          return currentSelectedCompetitionKeysByTeamId;
        }

        return nextSelectedCompetitionKeysByTeamId;
      },
    );
  }, [hasResolvedInitialDraftSnapshot, selectableTeamIds]);

  const competitionOptionsByTeamId = useMemo(() => {
    const nextCompetitionOptionsByTeamId: Record<
      string,
      ChampionshipBracketWizardCompetitionOption[]
    > = {};

    selectedTeams.forEach((team) => {
      const teamDivision = resolveUsesSeasonDivisions(seasonSettings)
        ? team.division
        : null;

      if (resolveUsesSeasonDivisions(seasonSettings) && teamDivision == null) {
        nextCompetitionOptionsByTeamId[team.id] = [];
        return;
      }

      nextCompetitionOptionsByTeamId[team.id] = championshipSports.flatMap(
        (championshipSport) => {
          const supportedNaipes = resolveSupportedNaipesByMode(
            championshipSport.naipe_mode,
          );
          const sportName = championshipSport.sports?.name ?? "Modalidade";

          return supportedNaipes.map((naipe) => {
            const optionDivision = resolveUsesSeasonDivisions(seasonSettings)
              ? teamDivision
              : null;

            return {
              key: resolveCompetitionKey(
                championshipSport.sport_id,
                naipe,
                optionDivision,
              ),
              sport_id: championshipSport.sport_id,
              sport_name: sportName,
              naipe,
              division: optionDivision,
            } as ChampionshipBracketWizardCompetitionOption;
          });
        },
      );
    });

    return nextCompetitionOptionsByTeamId;
  }, [championshipSports, seasonSettings, selectedTeams]);

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

    Object.entries(selectedCompetitionKeysByTeamId).forEach(
      ([teamId, selectedCompetitionKeys]) => {
        selectedCompetitionKeys.forEach((competitionKey) => {
          if (!nextTeamIdsByCompetitionKey[competitionKey]) {
            nextTeamIdsByCompetitionKey[competitionKey] = [];
          }

          nextTeamIdsByCompetitionKey[competitionKey].push(teamId);
        });
      },
    );

    return nextTeamIdsByCompetitionKey;
  }, [selectedCompetitionKeysByTeamId]);

  const activeCompetitionKeys = useMemo(() => {
    return Object.keys(teamIdsByCompetitionKey).filter((competitionKey) => {
      if (teamIdsByCompetitionKey[competitionKey].length < 2) {
        return false;
      }

      const competitionOption = competitionOptionsByKey.get(competitionKey);

      if (!competitionOption) {
        return false;
      }

      return !resolveIsIndividualSportName(competitionOption.sport_name);
    });
  }, [competitionOptionsByKey, teamIdsByCompetitionKey]);

  const sortedActiveCompetitionKeys = useMemo(() => {
    return resolveSortedChampionshipBracketCompetitionKeys(
      activeCompetitionKeys,
      competitionOptionsByKey,
    );
  }, [activeCompetitionKeys, competitionOptionsByKey]);

  const activeCompetitionKeySet = useMemo(() => {
    return new Set(activeCompetitionKeys);
  }, [activeCompetitionKeys]);

  const selectedIndividualCompetitionOptions = useMemo(() => {
    return [
      ...new Map(
        Object.values(selectedCompetitionKeysByTeamId)
          .flat()
          .map(
            (competitionKey) =>
              competitionOptionsByKey.get(competitionKey) ?? null,
          )
          .filter(
            (
              competitionOption,
            ): competitionOption is ChampionshipBracketWizardCompetitionOption =>
              competitionOption != null &&
              resolveIsIndividualSportName(competitionOption.sport_name),
          )
          .map((competitionOption) => [
            competitionOption.key,
            competitionOption,
          ]),
      ).values(),
    ].sort((leftCompetitionOption, rightCompetitionOption) =>
      resolveSortedChampionshipBracketCompetitionKeys(
        [leftCompetitionOption.key, rightCompetitionOption.key],
        new Map([
          [leftCompetitionOption.key, leftCompetitionOption],
          [rightCompetitionOption.key, rightCompetitionOption],
        ]),
      )[0] == leftCompetitionOption.key
        ? -1
        : 1,
    );
  }, [competitionOptionsByKey, selectedCompetitionKeysByTeamId]);

  const scheduleDayDates = useMemo(() => {
    return [
      ...new Set(
        scheduleDays.map((scheduleDay) => scheduleDay.date).filter(Boolean),
      ),
    ];
  }, [scheduleDays]);

  const scheduleDayDatesOrderedByColumn = useMemo(() => {
    return resolveColumnFirstOrderedItems(
      scheduleDayDates,
      PERIOD_AVAILABILITY_CARD_COLUMNS,
    );
  }, [scheduleDayDates]);

  const scheduleResourcesByDate = useMemo(() => {
    return scheduleDays.reduce<
      Record<
        string,
        Array<{
          location_key: string;
          location_name: string;
          court_key: string;
          court_name: string;
          sport_ids: string[];
        }>
      >
    >((carry, scheduleDay) => {
      if (!scheduleDay.date) {
        return carry;
      }

      carry[scheduleDay.date] = scheduleDay.locations.flatMap((location) =>
        location.courts.map((court) => ({
          location_key: location.id,
          location_name: location.name,
          court_key: court.id,
          court_name: court.name,
          sport_ids: court.sport_ids,
        })),
      );

      return carry;
    }, {});
  }, [scheduleDays]);

  const teamCompetitionKeysByTeamId = useMemo(() => {
    return Object.entries(selectedCompetitionKeysByTeamId).reduce<
      Record<string, string[]>
    >((carry, [teamId, competitionKeys]) => {
      const filteredCompetitionKeys = competitionKeys.filter((competitionKey) =>
        activeCompetitionKeySet.has(competitionKey),
      );

      if (filteredCompetitionKeys.length > 0) {
        carry[teamId] = filteredCompetitionKeys;
      }

      return carry;
    }, {});
  }, [activeCompetitionKeySet, selectedCompetitionKeysByTeamId]);

  const schedulePeriodEnabledByDatePeriodKey = useMemo(() => {
    return resolveDatePeriodEnabledMap(schedulePeriods);
  }, [schedulePeriods]);

  const teamCompetitionDateAvailabilityByKey = useMemo(() => {
    return new Map(
      teamCompetitionDateAvailability.map((availabilityItem) => [
        `${availabilityItem.team_id}::${availabilityItem.competition_key}::${availabilityItem.date}`,
        availabilityItem,
      ]),
    );
  }, [teamCompetitionDateAvailability]);

  const competitionDateAvailabilityByKey = useMemo(() => {
    return new Map(
      competitionDateAvailability.map((availabilityItem) => [
        `${availabilityItem.competition_key}::${availabilityItem.date}`,
        availabilityItem,
      ]),
    );
  }, [competitionDateAvailability]);

  const updateCompetitionDateAvailabilityMode = useCallback(
    (
      competitionKey: string,
      date: string,
      mode: "UNAVAILABLE" | "FULL_DAY" | "CUSTOM",
    ) => {
      setCompetitionDateAvailability((currentAvailability) => {
        const availabilityIndex = currentAvailability.findIndex(
          (availabilityItem) =>
            availabilityItem.competition_key == competitionKey &&
            availabilityItem.date == date,
        );

        if (availabilityIndex < 0) {
          return currentAvailability;
        }

        const currentItem = currentAvailability[availabilityIndex];

        if (!currentItem) {
          return currentAvailability;
        }

        let windows = currentItem.windows;

        if (mode != "CUSTOM") {
          windows = [];
        } else if (
          currentItem.mode != "CUSTOM" ||
          currentItem.windows.length == 0
        ) {
          const scheduleDay = scheduleDays.find(
            (currentScheduleDay) => currentScheduleDay.date == date,
          );

          if (!scheduleDay) {
            windows = [];
          } else {
            const dayStartMinutes = resolveTimeValueToMinutes(
              scheduleDay.start_time,
            );
            const dayEndMinutes = resolveTimeValueToMinutes(
              scheduleDay.end_time,
            );
            const breakStartMinutes = resolveTimeValueToMinutes(
              scheduleDay.break_start_time,
            );
            const breakEndMinutes = resolveTimeValueToMinutes(
              scheduleDay.break_end_time,
            );

            const hasValidDay =
              dayStartMinutes != null &&
              dayEndMinutes != null &&
              dayEndMinutes > dayStartMinutes;

            const hasValidBreak =
              hasValidDay &&
              breakStartMinutes != null &&
              breakEndMinutes != null &&
              breakStartMinutes > dayStartMinutes &&
              breakEndMinutes > breakStartMinutes &&
              breakEndMinutes < dayEndMinutes;

            if (!hasValidDay) {
              windows = [];
            } else if (hasValidBreak) {
              windows = [
                {
                  start_time: scheduleDay.start_time,
                  end_time: scheduleDay.break_start_time,
                },
                {
                  start_time: scheduleDay.break_end_time,
                  end_time: scheduleDay.end_time,
                },
              ];
            } else {
              windows = [
                {
                  start_time: scheduleDay.start_time,
                  end_time: scheduleDay.end_time,
                },
              ];
            }
          }
        }

        const nextAvailability = [...currentAvailability];

        nextAvailability[availabilityIndex] = {
          ...currentItem,
          mode,
          windows,
        };

        return nextAvailability;
      });
    },
    [scheduleDays],
  );

  const updateCompetitionDateAvailabilityWindow = useCallback(
    (
      competitionKey: string,
      date: string,
      windowIndex: number,
      field: "start_time" | "end_time",
      value: string,
    ) => {
      setCompetitionDateAvailability((currentAvailability) =>
        currentAvailability.map((availabilityItem) => {
          if (
            availabilityItem.competition_key != competitionKey ||
            availabilityItem.date != date ||
            availabilityItem.mode != "CUSTOM"
          ) {
            return availabilityItem;
          }

          if (!availabilityItem.windows[windowIndex]) {
            return availabilityItem;
          }

          return {
            ...availabilityItem,
            windows: availabilityItem.windows.map(
              (window, currentWindowIndex) =>
                currentWindowIndex == windowIndex
                  ? {
                      ...window,
                      [field]: value,
                    }
                  : window,
            ),
          };
        }),
      );
    },
    [],
  );

  const addCompetitionDateAvailabilityWindow = useCallback(
    (competitionKey: string, date: string) => {
      const scheduleDay = scheduleDays.find(
        (currentScheduleDay) => currentScheduleDay.date == date,
      );

      if (!scheduleDay?.start_time || !scheduleDay.end_time) {
        return;
      }

      setCompetitionDateAvailability((currentAvailability) =>
        currentAvailability.map((availabilityItem) => {
          if (
            availabilityItem.competition_key != competitionKey ||
            availabilityItem.date != date ||
            availabilityItem.mode != "CUSTOM"
          ) {
            return availabilityItem;
          }

          return {
            ...availabilityItem,
            windows: [
              ...availabilityItem.windows,
              {
                start_time: scheduleDay.start_time,
                end_time: scheduleDay.end_time,
              },
            ],
          };
        }),
      );
    },
    [scheduleDays],
  );

  const removeCompetitionDateAvailabilityWindow = useCallback(
    (competitionKey: string, date: string, windowIndex: number) => {
      setCompetitionDateAvailability((currentAvailability) =>
        currentAvailability.map((availabilityItem) => {
          if (
            availabilityItem.competition_key != competitionKey ||
            availabilityItem.date != date ||
            availabilityItem.mode != "CUSTOM"
          ) {
            return availabilityItem;
          }

          return {
            ...availabilityItem,
            windows: availabilityItem.windows.filter(
              (_, currentWindowIndex) => currentWindowIndex != windowIndex,
            ),
          };
        }),
      );
    },
    [],
  );

  const updateCompetitionDateAvailabilityForAllDates = (
    competitionKey: string,
    mode: "FULL_DAY" | "UNAVAILABLE",
  ) => {
    setCompetitionDateAvailability((currentAvailability) =>
      currentAvailability.map((availabilityItem) => {
        if (availabilityItem.competition_key != competitionKey) {
          return availabilityItem;
        }

        return {
          ...availabilityItem,
          mode,
          windows: [],
        };
      }),
    );

    updateCompetitionAvailabilityForAllPeriods(
      competitionKey,
      mode == "FULL_DAY",
    );
  };

  const updateTeamCompetitionDateAvailabilityMode = useCallback(
    (
      teamId: string,
      competitionKey: string,
      date: string,
      mode: "UNAVAILABLE" | "FULL_DAY" | "CUSTOM",
    ) => {
      setTeamCompetitionDateAvailability((currentAvailability) => {
        const availabilityIndex = currentAvailability.findIndex(
          (availabilityItem) =>
            availabilityItem.team_id == teamId &&
            availabilityItem.competition_key == competitionKey &&
            availabilityItem.date == date,
        );

        if (availabilityIndex < 0) {
          return currentAvailability;
        }

        const currentItem = currentAvailability[availabilityIndex];

        if (!currentItem) {
          return currentAvailability;
        }

        let windows = currentItem.windows;

        if (mode != "CUSTOM") {
          windows = [];
        } else if (
          currentItem.mode != "CUSTOM" ||
          currentItem.windows.length == 0
        ) {
          const competitionAvailability =
            competitionDateAvailabilityByKey.get(
              `${competitionKey}::${date}`,
            );

          const scheduleDay =
            scheduleDays.find(
              (currentScheduleDay) => currentScheduleDay.date == date,
            ) ?? null;

          if (
            competitionAvailability?.mode == "CUSTOM" &&
            competitionAvailability.windows.length > 0
          ) {
            windows = competitionAvailability.windows.map((window) => ({
              start_time: window.start_time,
              end_time: window.end_time,
            }));
          } else if (
            competitionAvailability?.mode == "FULL_DAY" &&
            scheduleDay
          ) {
            const dayStartMinutes = resolveTimeValueToMinutes(
              scheduleDay.start_time,
            );
            const dayEndMinutes = resolveTimeValueToMinutes(
              scheduleDay.end_time,
            );
            const breakStartMinutes = resolveTimeValueToMinutes(
              scheduleDay.break_start_time,
            );
            const breakEndMinutes = resolveTimeValueToMinutes(
              scheduleDay.break_end_time,
            );

            const hasValidDay =
              dayStartMinutes != null &&
              dayEndMinutes != null &&
              dayEndMinutes > dayStartMinutes;

            const hasValidBreak =
              hasValidDay &&
              breakStartMinutes != null &&
              breakEndMinutes != null &&
              breakStartMinutes > dayStartMinutes &&
              breakEndMinutes > breakStartMinutes &&
              breakEndMinutes < dayEndMinutes;

            if (!hasValidDay) {
              windows = [];
            } else if (hasValidBreak) {
              windows = [
                {
                  start_time: scheduleDay.start_time,
                  end_time: scheduleDay.break_start_time,
                },
                {
                  start_time: scheduleDay.break_end_time,
                  end_time: scheduleDay.end_time,
                },
              ];
            } else {
              windows = [
                {
                  start_time: scheduleDay.start_time,
                  end_time: scheduleDay.end_time,
                },
              ];
            }
          } else {
            windows = [];
          }
        }

        const nextAvailability = [...currentAvailability];

        nextAvailability[availabilityIndex] = {
          ...currentItem,
          mode,
          windows,
        };

        return nextAvailability;
      });

      setTeamCompetitionAvailability((currentAvailability) =>
        currentAvailability.map((availabilityItem) => {
          if (
            availabilityItem.team_id != teamId ||
            availabilityItem.competition_key != competitionKey ||
            availabilityItem.date != date
          ) {
            return availabilityItem;
          }

          return {
            ...availabilityItem,
            enabled: mode != "UNAVAILABLE",
          };
        }),
      );
    },
    [competitionDateAvailabilityByKey, scheduleDays],
  );

  const updateTeamCompetitionDateAvailabilityWindow = useCallback(
    (
      teamId: string,
      competitionKey: string,
      date: string,
      windowIndex: number,
      field: "start_time" | "end_time",
      value: string,
    ) => {
      setTeamCompetitionDateAvailability((currentAvailability) =>
        currentAvailability.map((availabilityItem) => {
          if (
            availabilityItem.team_id != teamId ||
            availabilityItem.competition_key != competitionKey ||
            availabilityItem.date != date ||
            availabilityItem.mode != "CUSTOM"
          ) {
            return availabilityItem;
          }

          if (!availabilityItem.windows[windowIndex]) {
            return availabilityItem;
          }

          return {
            ...availabilityItem,
            windows: availabilityItem.windows.map(
              (window, currentWindowIndex) =>
                currentWindowIndex == windowIndex
                  ? {
                      ...window,
                      [field]: value,
                    }
                  : window,
            ),
          };
        }),
      );
    },
    [],
  );

  const addTeamCompetitionDateAvailabilityWindow = useCallback(
    (teamId: string, competitionKey: string, date: string) => {
      const competitionAvailability =
        competitionDateAvailabilityByKey.get(
          `${competitionKey}::${date}`,
        );

      const scheduleDay =
        scheduleDays.find(
          (currentScheduleDay) => currentScheduleDay.date == date,
        ) ?? null;

      let nextWindow:
        | {
            start_time: string;
            end_time: string;
          }
        | null = null;

      if (
        competitionAvailability?.mode == "CUSTOM" &&
        competitionAvailability.windows.length > 0
      ) {
        const firstCompetitionWindow = competitionAvailability.windows[0];

        if (firstCompetitionWindow) {
          nextWindow = {
            start_time: firstCompetitionWindow.start_time,
            end_time: firstCompetitionWindow.end_time,
          };
        }
      } else if (
        competitionAvailability?.mode == "FULL_DAY" &&
        scheduleDay?.start_time &&
        scheduleDay.end_time
      ) {
        nextWindow = {
          start_time: scheduleDay.start_time,
          end_time: scheduleDay.end_time,
        };
      }

      if (!nextWindow) {
        return;
      }

      setTeamCompetitionDateAvailability((currentAvailability) =>
        currentAvailability.map((availabilityItem) => {
          if (
            availabilityItem.team_id != teamId ||
            availabilityItem.competition_key != competitionKey ||
            availabilityItem.date != date ||
            availabilityItem.mode != "CUSTOM"
          ) {
            return availabilityItem;
          }

          return {
            ...availabilityItem,
            windows: [
              ...availabilityItem.windows,
              {
                ...nextWindow,
              },
            ],
          };
        }),
      );
    },
    [competitionDateAvailabilityByKey, scheduleDays],
  );

  const removeTeamCompetitionDateAvailabilityWindow = useCallback(
    (
      teamId: string,
      competitionKey: string,
      date: string,
      windowIndex: number,
    ) => {
      setTeamCompetitionDateAvailability((currentAvailability) =>
        currentAvailability.map((availabilityItem) => {
          if (
            availabilityItem.team_id != teamId ||
            availabilityItem.competition_key != competitionKey ||
            availabilityItem.date != date ||
            availabilityItem.mode != "CUSTOM"
          ) {
            return availabilityItem;
          }

          return {
            ...availabilityItem,
            windows: availabilityItem.windows.filter(
              (_, currentWindowIndex) =>
                currentWindowIndex != windowIndex,
            ),
          };
        }),
      );
    },
    [],
  );

  const updateTeamCompetitionDateAvailabilityForAllDates = useCallback(
    (
      teamId: string,
      competitionKey: string,
      mode: "FULL_DAY" | "UNAVAILABLE",
    ) => {
      const eligibleDateSet = new Set(
        scheduleDayDates.filter((scheduleDate) => {
          const competitionAvailability =
            competitionDateAvailabilityByKey.get(
              `${competitionKey}::${scheduleDate}`,
            );

          return (
            competitionAvailability != null &&
            competitionAvailability.mode != "UNAVAILABLE"
          );
        }),
      );

      setTeamCompetitionDateAvailability((currentAvailability) =>
        currentAvailability.map((availabilityItem) => {
          if (
            availabilityItem.team_id != teamId ||
            availabilityItem.competition_key != competitionKey ||
            !eligibleDateSet.has(availabilityItem.date)
          ) {
            return availabilityItem;
          }

          return {
            ...availabilityItem,
            mode,
            windows: [],
          };
        }),
      );

      setTeamCompetitionAvailability((currentAvailability) =>
        currentAvailability.map((availabilityItem) => {
          if (
            availabilityItem.team_id != teamId ||
            availabilityItem.competition_key != competitionKey ||
            !eligibleDateSet.has(availabilityItem.date)
          ) {
            return availabilityItem;
          }

          return {
            ...availabilityItem,
            enabled: mode != "UNAVAILABLE",
          };
        }),
      );
    },
    [competitionDateAvailabilityByKey, scheduleDayDates],
  );

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    setCompetitionConfigByKey((previousCompetitionConfigByKey) => {
      const nextCompetitionConfigByKey: Record<string, CompetitionConfig> = {};

      activeCompetitionKeys.forEach((competitionKey) => {
        const previousCompetitionConfig =
          previousCompetitionConfigByKey[competitionKey];

        if (previousCompetitionConfig) {
          nextCompetitionConfigByKey[competitionKey] =
            previousCompetitionConfig;
          return;
        }

        const participantCount =
          teamIdsByCompetitionKey[competitionKey]?.length ?? 2;
        const competitionOption =
          competitionOptionsByKey.get(competitionKey) ?? null;

        nextCompetitionConfigByKey[competitionKey] =
          resolveDefaultCompetitionConfig(participantCount, competitionOption);
      });

      return nextCompetitionConfigByKey;
    });
  }, [
    activeCompetitionKeys,
    competitionOptionsByKey,
    hasResolvedInitialDraftSnapshot,
    teamIdsByCompetitionKey,
  ]);

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    setSchedulePeriods((currentSchedulePeriods) => {
      const nextSchedulePeriods = sanitizeSchedulePeriodsForDates(
        scheduleDayDates,
        currentSchedulePeriods,
      );

      if (
        JSON.stringify(nextSchedulePeriods) ==
        JSON.stringify(currentSchedulePeriods)
      ) {
        return currentSchedulePeriods;
      }

      return nextSchedulePeriods;
    });
  }, [hasResolvedInitialDraftSnapshot, scheduleDayDates]);

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    setCompetitionPeriodAvailability((currentCompetitionPeriodAvailability) => {
      const nextCompetitionPeriodAvailability =
        sanitizeCompetitionPeriodAvailabilityValues({
          schedulePeriods,
          competitionKeys: sortedActiveCompetitionKeys,
          competitionPeriodAvailability: currentCompetitionPeriodAvailability,
        });

      if (
        JSON.stringify(nextCompetitionPeriodAvailability) ==
        JSON.stringify(currentCompetitionPeriodAvailability)
      ) {
        return currentCompetitionPeriodAvailability;
      }

      return nextCompetitionPeriodAvailability;
    });
  }, [
    hasResolvedInitialDraftSnapshot,
    schedulePeriods,
    sortedActiveCompetitionKeys,
  ]);

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    setCompetitionDateAvailability((currentCompetitionDateAvailability) => {
      const nextCompetitionDateAvailability =
        sanitizeCompetitionDateAvailabilityValues({
          scheduleDays,
          competitionKeys: sortedActiveCompetitionKeys,
          competitionDateAvailability: currentCompetitionDateAvailability,
        });

      if (
        JSON.stringify(nextCompetitionDateAvailability) ==
        JSON.stringify(currentCompetitionDateAvailability)
      ) {
        return currentCompetitionDateAvailability;
      }

      return nextCompetitionDateAvailability;
    });
  }, [
    hasResolvedInitialDraftSnapshot,
    scheduleDays,
    sortedActiveCompetitionKeys,
  ]);

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    setTeamCompetitionAvailability((currentTeamCompetitionAvailability) => {
      const nextTeamCompetitionAvailability =
        sanitizeTeamCompetitionAvailabilityValues({
          schedulePeriods,
          teamCompetitionKeysByTeamId,
          teamCompetitionAvailability: currentTeamCompetitionAvailability,
        });

      if (
        JSON.stringify(nextTeamCompetitionAvailability) ==
        JSON.stringify(currentTeamCompetitionAvailability)
      ) {
        return currentTeamCompetitionAvailability;
      }

      return nextTeamCompetitionAvailability;
    });
  }, [
    hasResolvedInitialDraftSnapshot,
    schedulePeriods,
    teamCompetitionKeysByTeamId,
  ]);

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    setTeamCompetitionDateAvailability(
      (currentTeamCompetitionDateAvailability) => {
        const nextTeamCompetitionDateAvailability =
          sanitizeTeamCompetitionDateAvailabilityValues({
            scheduleDays,
            teamCompetitionKeysByTeamId,
            teamCompetitionDateAvailability:
              currentTeamCompetitionDateAvailability,
          });

        if (
          JSON.stringify(nextTeamCompetitionDateAvailability) ==
          JSON.stringify(currentTeamCompetitionDateAvailability)
        ) {
          return currentTeamCompetitionDateAvailability;
        }

        return nextTeamCompetitionDateAvailability;
      },
    );
  }, [
    hasResolvedInitialDraftSnapshot,
    scheduleDays,
    teamCompetitionKeysByTeamId,
  ]);

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    setIndividualEventConfigs((currentIndividualEventConfigs) => {
      const nextIndividualEventConfigs = sanitizeIndividualEventConfigsValues({
        individualSports: selectedIndividualSports,
        individualEventConfigs: currentIndividualEventConfigs,
      });

      if (
        JSON.stringify(nextIndividualEventConfigs) ==
        JSON.stringify(currentIndividualEventConfigs)
      ) {
        return currentIndividualEventConfigs;
      }

      return nextIndividualEventConfigs;
    });
  }, [hasResolvedInitialDraftSnapshot, selectedIndividualSports]);

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    setIndividualSessionConfigs((currentIndividualSessionConfigs) => {
      const nextIndividualSessionConfigs =
        sanitizeIndividualSessionConfigsValues({
          schedulePeriods,
          individualCompetitionOptions: selectedIndividualCompetitionOptions,
          individualSessionConfigs: currentIndividualSessionConfigs,
        });

      if (
        JSON.stringify(nextIndividualSessionConfigs) ==
        JSON.stringify(currentIndividualSessionConfigs)
      ) {
        return currentIndividualSessionConfigs;
      }

      return nextIndividualSessionConfigs;
    });
  }, [
    hasResolvedInitialDraftSnapshot,
    schedulePeriods,
    selectedIndividualCompetitionOptions,
  ]);

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    setResourceLocks((currentResourceLocks) => {
      const individualSessionKeySet = new Set(
        selectedIndividualCompetitionOptions.map((competitionOption) =>
          resolveIndividualSessionConfigKey(competitionOption),
        ),
      );
      const preservedManualLocks = currentResourceLocks.filter(
        (resourceLock) => {
          if (
            resourceLock.lock_mode != "HARD" ||
            !resourceLock.sport_id ||
            resourceLock.naipe == null
          ) {
            return true;
          }

          return !individualSessionKeySet.has(
            resolveIndividualSessionConfigKey({
              sport_id: resourceLock.sport_id,
              naipe: resourceLock.naipe,
              division: resourceLock.division ?? null,
            }),
          );
        },
      );
      const derivedSessionLocks = [
        ...new Map(
          individualSessionConfigs
            .map((sessionConfig) =>
              resolveResourceLockFromIndividualSession(sessionConfig),
            )
            .filter(
              (
                resourceLock,
              ): resourceLock is NonNullable<
                ReturnType<typeof resolveResourceLockFromIndividualSession>
              > => resourceLock != null,
            )
            .map(
              (resourceLock) =>
                [
                  [
                    resourceLock.date,
                    resourceLock.period,
                    resourceLock.location_key,
                    resourceLock.court_key,
                  ].join("::"),
                  resourceLock,
                ] as const,
            ),
        ).values(),
      ];
      const nextResourceLocks = sanitizeResourceLocksValues({
        schedulePeriods,
        resourceLocks: [...preservedManualLocks, ...derivedSessionLocks],
      });

      if (
        JSON.stringify(nextResourceLocks) ==
        JSON.stringify(currentResourceLocks)
      ) {
        return currentResourceLocks;
      }

      return nextResourceLocks;
    });
  }, [
    hasResolvedInitialDraftSnapshot,
    individualSessionConfigs,
    schedulePeriods,
    selectedIndividualCompetitionOptions,
  ]);

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    setGroupAssignmentsByCompetitionKey(
      (previousGroupAssignmentsByCompetitionKey) => {
        const nextGroupAssignmentsByCompetitionKey: Record<
          string,
          Record<string, number>
        > = {};

        activeCompetitionKeys.forEach((competitionKey) => {
          const teamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
          const groupCount =
            competitionConfigByKey[competitionKey]?.groups_count ?? 1;
          const previousAssignments =
            previousGroupAssignmentsByCompetitionKey[competitionKey] ?? {};

          nextGroupAssignmentsByCompetitionKey[competitionKey] =
            sanitizeGroupAssignments({
              participant_team_ids: teamIds,
              group_assignments: previousAssignments,
              groups_count: groupCount,
            });
        });

        return nextGroupAssignmentsByCompetitionKey;
      },
    );
  }, [
    activeCompetitionKeys,
    competitionConfigByKey,
    hasResolvedInitialDraftSnapshot,
    teamIdsByCompetitionKey,
  ]);

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    setGroupOrderByCompetitionKey((currentGroupOrderByCompetitionKey) => {
      const nextGroupOrderByCompetitionKey: Record<
        string,
        ChampionshipBracketGroupOrderedTeamIdsByGroupNumber
      > = {};

      activeCompetitionKeys.forEach((competitionKey) => {
        const nextOrderedTeamIdsByGroupNumber =
          sanitizeGroupOrderedTeamIdsByGroupNumber({
            participant_team_ids: teamIdsByCompetitionKey[competitionKey] ?? [],
            group_assignments:
              groupAssignmentsByCompetitionKey[competitionKey] ?? {},
            groups_count:
              competitionConfigByKey[competitionKey]?.groups_count ?? 1,
            ordered_team_ids_by_group_number:
              currentGroupOrderByCompetitionKey[competitionKey] ?? {},
          });

        if (Object.keys(nextOrderedTeamIdsByGroupNumber).length == 0) {
          return;
        }

        nextGroupOrderByCompetitionKey[competitionKey] =
          nextOrderedTeamIdsByGroupNumber;
      });

      return nextGroupOrderByCompetitionKey;
    });
  }, [
    activeCompetitionKeys,
    competitionConfigByKey,
    groupAssignmentsByCompetitionKey,
    hasResolvedInitialDraftSnapshot,
    teamIdsByCompetitionKey,
  ]);

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    setTransientGroupSlotIdsByCompetitionKey(
      (currentTransientGroupSlotIdsByCompetitionKey) => {
        const nextTransientGroupSlotIdsByCompetitionKey: Record<
          string,
          ChampionshipBracketGroupEditorTransientSlotIdsByGroupNumber
        > = {};

        activeCompetitionKeys.forEach((competitionKey) => {
          const groupsCount =
            competitionConfigByKey[competitionKey]?.groups_count ?? 1;
          const currentTransientSlotIdsByGroupNumber =
            currentTransientGroupSlotIdsByCompetitionKey[competitionKey] ?? {};
          const nextTransientSlotIdsByGroupNumber = Array.from(
            { length: groupsCount },
            (_, groupIndex) => {
              const groupNumber = groupIndex + 1;
              const slotIds =
                currentTransientSlotIdsByGroupNumber[String(groupNumber)] ?? [];

              return [String(groupNumber), slotIds] as const;
            },
          ).reduce<ChampionshipBracketGroupEditorTransientSlotIdsByGroupNumber>(
            (carry, [groupNumber, slotIds]) => {
              if (slotIds.length == 0) {
                return carry;
              }

              carry[groupNumber] = slotIds;
              return carry;
            },
            {},
          );

          if (Object.keys(nextTransientSlotIdsByGroupNumber).length == 0) {
            return;
          }

          nextTransientGroupSlotIdsByCompetitionKey[competitionKey] =
            nextTransientSlotIdsByGroupNumber;
        });

        return nextTransientGroupSlotIdsByCompetitionKey;
      },
    );
  }, [
    activeCompetitionKeys,
    competitionConfigByKey,
    hasResolvedInitialDraftSnapshot,
  ]);

  const selectedSportOptions = useMemo(() => {
    return resolveLocationCatalogSportOptions(
      championshipSports,
      enabledSportIdSet,
    );
  }, [championshipSports, enabledSportIdSet]);

  const locationTemplateById = useMemo(() => {
    return locationTemplates.reduce<
      Record<string, ChampionshipBracketLocationTemplate>
    >((carry, locationTemplate) => {
      carry[locationTemplate.id] = locationTemplate;
      return carry;
    }, {});
  }, [locationTemplates]);

  const sportOptionsByTeamId = useMemo(() => {
    const nextSportOptionsByTeamId: Record<
      string,
      { id: string; name: string }[]
    > = {};

    Object.entries(competitionOptionsByTeamId).forEach(
      ([team_id, competitionOptions]) => {
        const teamSportOptionsById = new Map<
          string,
          { id: string; name: string }
        >();

        competitionOptions.forEach((competitionOption) => {
          teamSportOptionsById.set(competitionOption.sport_id, {
            id: competitionOption.sport_id,
            name: competitionOption.sport_name,
          });
        });

        nextSportOptionsByTeamId[team_id] = [...teamSportOptionsById.values()];
      },
    );

    return nextSportOptionsByTeamId;
  }, [competitionOptionsByTeamId]);

  const modalityCards = useMemo(() => {
    return resolveChampionshipBracketWizardModalityCards({
      championship_sports: enabledChampionshipSports,
      selected_teams: selectedTeams,
      selected_sport_ids_by_team_id: selectedSportIdsByTeamId,
      competition_options_by_team_id: competitionOptionsByTeamId,
    });
  }, [
    enabledChampionshipSports,
    competitionOptionsByTeamId,
    selectedSportIdsByTeamId,
    selectedTeams,
  ]);

  const naipeCards = useMemo(() => {
    return resolveChampionshipBracketWizardNaipeCards({
      championship_sports: enabledChampionshipSports,
      selected_teams: selectedTeams,
      selected_sport_ids_by_team_id: selectedSportIdsByTeamId,
      selected_competition_keys_by_team_id: selectedCompetitionKeysByTeamId,
      competition_options_by_team_id: competitionOptionsByTeamId,
    });
  }, [
    enabledChampionshipSports,
    competitionOptionsByTeamId,
    selectedCompetitionKeysByTeamId,
    selectedSportIdsByTeamId,
    selectedTeams,
  ]);

  useEffect(() => {
    setActiveNaipeTabBySportId((currentActiveNaipeTabBySportId) => {
      const nextActiveNaipeTabBySportId = naipeCards.reduce<
        Record<string, MatchNaipe>
      >((carry, naipeCard) => {
        const supportedNaipes = naipeCard.tabs.map((tab) => tab.naipe);
        const currentActiveNaipe =
          currentActiveNaipeTabBySportId[naipeCard.sport_id];

        if (
          currentActiveNaipe &&
          supportedNaipes.includes(currentActiveNaipe)
        ) {
          carry[naipeCard.sport_id] = currentActiveNaipe;
          return carry;
        }

        const defaultNaipe = resolveDefaultWizardNaipeTabValue(supportedNaipes);

        if (defaultNaipe) {
          carry[naipeCard.sport_id] = defaultNaipe;
        }

        return carry;
      }, {});

      const currentActiveNaipeKeys = Object.keys(
        currentActiveNaipeTabBySportId,
      );
      const nextActiveNaipeKeys = Object.keys(nextActiveNaipeTabBySportId);

      if (
        currentActiveNaipeKeys.length == nextActiveNaipeKeys.length &&
        nextActiveNaipeKeys.every(
          (sportId) =>
            currentActiveNaipeTabBySportId[sportId] ==
            nextActiveNaipeTabBySportId[sportId],
        )
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

      return currentSelectedTeamIds.filter(
        (selectedTeamId) => selectedTeamId != team_id,
      );
    });

    if (!checked) {
      setSelectedSportIdsByTeamId((currentSelectedSportIdsByTeamId) => {
        const nextSelectedSportIdsByTeamId = {
          ...currentSelectedSportIdsByTeamId,
        };
        delete nextSelectedSportIdsByTeamId[team_id];
        return nextSelectedSportIdsByTeamId;
      });

      setSelectedCompetitionKeysByTeamId(
        (currentSelectedCompetitionKeysByTeamId) => {
          const nextSelectedCompetitionKeysByTeamId = {
            ...currentSelectedCompetitionKeysByTeamId,
          };
          delete nextSelectedCompetitionKeysByTeamId[team_id];
          return nextSelectedCompetitionKeysByTeamId;
        },
      );
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
      return Object.entries(currentSelectedSportIdsByTeamId).reduce<
        Record<string, string[]>
      >((carry, [team_id, selectedSportIds]) => {
        if (!selectableTeamIdSet.has(team_id)) {
          return carry;
        }

        carry[team_id] = selectedSportIds;
        return carry;
      }, {});
    });
    setSelectedCompetitionKeysByTeamId(
      (currentSelectedCompetitionKeysByTeamId) => {
        return Object.entries(currentSelectedCompetitionKeysByTeamId).reduce<
          Record<string, string[]>
        >((carry, [team_id, selectedCompetitionKeys]) => {
          if (!selectableTeamIdSet.has(team_id)) {
            return carry;
          }

          carry[team_id] = selectedCompetitionKeys;
          return carry;
        }, {});
      },
    );
  };

  const enabledSportsSummary = useMemo(() => {
    const eligibleSportsCount = championshipSports.length;
    const selectedSportsCount = enabledSportIds.length;

    return {
      eligible_sports_count: eligibleSportsCount,
      selected_sports_count: selectedSportsCount,
    };
  }, [championshipSports.length, enabledSportIds.length]);

  const handleToggleEnabledSport = (sportId: string, checked: boolean) => {
    setEnabledSportIds((currentEnabledSportIds) => {
      if (checked) {
        if (currentEnabledSportIds.includes(sportId)) {
          return currentEnabledSportIds;
        }

        return [...currentEnabledSportIds, sportId];
      }

      return currentEnabledSportIds.filter(
        (currentEnabledSportId) => currentEnabledSportId != sportId,
      );
    });
  };

  const handleToggleAllEnabledSports = (checked: boolean) => {
    if (!checked) {
      setEnabledSportIds([]);
      return;
    }

    setEnabledSportIds(
      championshipSports.map((championshipSport) => championshipSport.sport_id),
    );
  };

  const handleToggleTeamSport = (
    team_id: string,
    sport_id: string,
    checked: boolean,
  ) => {
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
        [team_id]: selectedSportIds.filter(
          (selectedSportId) => selectedSportId != sport_id,
        ),
      };
    });

    if (!checked) {
      setSelectedCompetitionKeysByTeamId(
        (currentSelectedCompetitionKeysByTeamId) => {
          const selectedCompetitionKeys =
            currentSelectedCompetitionKeysByTeamId[team_id] ?? [];

          return {
            ...currentSelectedCompetitionKeysByTeamId,
            [team_id]: selectedCompetitionKeys.filter((competitionKey) => {
              const parsedCompetitionKey = parseCompetitionKey(competitionKey);
              return parsedCompetitionKey.sport_id != sport_id;
            }),
          };
        },
      );
    }
  };

  const handleToggleTeamCompetition = (
    team_id: string,
    competition_key: string,
    checked: boolean,
  ) => {
    setSelectedCompetitionKeysByTeamId(
      (currentSelectedCompetitionKeysByTeamId) => {
        const selectedCompetitionKeys =
          currentSelectedCompetitionKeysByTeamId[team_id] ?? [];

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
          [team_id]: selectedCompetitionKeys.filter(
            (key) => key != competition_key,
          ),
        };
      },
    );
  };

  const modalitySelectionSummary = useMemo(() => {
    const eligibleModalitiesCount = modalityCards.reduce(
      (total, modalityCard) => total + modalityCard.eligible_team_count,
      0,
    );
    const selectedModalitiesCount = modalityCards.reduce(
      (total, modalityCard) => total + modalityCard.selected_team_count,
      0,
    );

    return {
      eligible_modalities_count: eligibleModalitiesCount,
      selected_modalities_count: selectedModalitiesCount,
      are_all_selected:
        eligibleModalitiesCount > 0 &&
        selectedModalitiesCount == eligibleModalitiesCount,
      has_at_least_one_selected: selectedModalitiesCount > 0,
    };
  }, [modalityCards]);

  const handleToggleAllModalitiesSelection = (checked: boolean) => {
    if (!checked) {
      setSelectedSportIdsByTeamId((currentSelectedSportIdsByTeamId) => {
        const nextSelectedSportIdsByTeamId = {
          ...currentSelectedSportIdsByTeamId,
        };

        selectedTeamIds.forEach((team_id) => {
          nextSelectedSportIdsByTeamId[team_id] = [];
        });

        return nextSelectedSportIdsByTeamId;
      });

      setSelectedCompetitionKeysByTeamId(
        (currentSelectedCompetitionKeysByTeamId) => {
          const nextSelectedCompetitionKeysByTeamId = {
            ...currentSelectedCompetitionKeysByTeamId,
          };

          selectedTeamIds.forEach((team_id) => {
            nextSelectedCompetitionKeysByTeamId[team_id] = [];
          });

          return nextSelectedCompetitionKeysByTeamId;
        },
      );

      return;
    }

    setSelectedSportIdsByTeamId((currentSelectedSportIdsByTeamId) => {
      const nextSelectedSportIdsByTeamId = {
        ...currentSelectedSportIdsByTeamId,
      };

      selectedTeamIds.forEach((team_id) => {
        const teamSportIds = (sportOptionsByTeamId[team_id] ?? []).map(
          (sportOption) => sportOption.id,
        );
        nextSelectedSportIdsByTeamId[team_id] = teamSportIds;
      });

      return nextSelectedSportIdsByTeamId;
    });
  };

  const handleToggleModalityCardSelection = (
    sport_id: string,
    checked: boolean,
  ) => {
    setSelectedSportIdsByTeamId((currentSelectedSportIdsByTeamId) => {
      const nextSelectedSportIdsByTeamId = {
        ...currentSelectedSportIdsByTeamId,
      };

      selectedTeamIds.forEach((team_id) => {
        const teamSupportsSport = (sportOptionsByTeamId[team_id] ?? []).some(
          (sportOption) => sportOption.id == sport_id,
        );

        if (!teamSupportsSport) {
          return;
        }

        const selectedSportIds = nextSelectedSportIdsByTeamId[team_id] ?? [];

        if (checked) {
          if (!selectedSportIds.includes(sport_id)) {
            nextSelectedSportIdsByTeamId[team_id] = [
              ...selectedSportIds,
              sport_id,
            ];
          }

          return;
        }

        nextSelectedSportIdsByTeamId[team_id] = selectedSportIds.filter(
          (selectedSportId) => selectedSportId != sport_id,
        );
      });

      return nextSelectedSportIdsByTeamId;
    });

    if (!checked) {
      setSelectedCompetitionKeysByTeamId(
        (currentSelectedCompetitionKeysByTeamId) => {
          const nextSelectedCompetitionKeysByTeamId = {
            ...currentSelectedCompetitionKeysByTeamId,
          };

          selectedTeamIds.forEach((team_id) => {
            const selectedCompetitionKeys =
              nextSelectedCompetitionKeysByTeamId[team_id] ?? [];
            nextSelectedCompetitionKeysByTeamId[team_id] =
              selectedCompetitionKeys.filter((competitionKey) => {
                const parsedCompetitionKey =
                  parseCompetitionKey(competitionKey);
                return parsedCompetitionKey.sport_id != sport_id;
              });
          });

          return nextSelectedCompetitionKeysByTeamId;
        },
      );
    }
  };

  const naipeSelectionSummary = useMemo(() => {
    const eligibleNaipesCount = naipeCards.reduce((total, naipeCard) => {
      return (
        total +
        naipeCard.tabs.reduce(
          (tabTotal, tab) => tabTotal + tab.eligible_team_count,
          0,
        )
      );
    }, 0);
    const selectedNaipesCount = naipeCards.reduce((total, naipeCard) => {
      return (
        total +
        naipeCard.tabs.reduce(
          (tabTotal, tab) => tabTotal + tab.selected_team_count,
          0,
        )
      );
    }, 0);

    return {
      eligible_naipes_count: eligibleNaipesCount,
      selected_naipes_count: selectedNaipesCount,
      are_all_selected:
        eligibleNaipesCount > 0 && selectedNaipesCount == eligibleNaipesCount,
      has_at_least_one_selected: selectedNaipesCount > 0,
    };
  }, [naipeCards]);

  const handleToggleAllNaipesSelection = (checked: boolean) => {
    setSelectedCompetitionKeysByTeamId(
      (currentSelectedCompetitionKeysByTeamId) => {
        const nextSelectedCompetitionKeysByTeamId = {
          ...currentSelectedCompetitionKeysByTeamId,
        };

        selectedTeamIds.forEach((team_id) => {
          const selectedSportIds = selectedSportIdsByTeamId[team_id] ?? [];
          const selectedSportIdSet = new Set(selectedSportIds);
          const teamCompetitionOptions = (
            competitionOptionsByTeamId[team_id] ?? []
          ).filter((competitionOption) => {
            return selectedSportIdSet.has(competitionOption.sport_id);
          });

          if (!checked) {
            const teamCompetitionKeySet = new Set(
              teamCompetitionOptions.map(
                (competitionOption) => competitionOption.key,
              ),
            );
            const selectedCompetitionKeys =
              nextSelectedCompetitionKeysByTeamId[team_id] ?? [];
            nextSelectedCompetitionKeysByTeamId[team_id] =
              selectedCompetitionKeys.filter(
                (competitionKey) => !teamCompetitionKeySet.has(competitionKey),
              );
            return;
          }

          const selectedCompetitionKeys =
            nextSelectedCompetitionKeysByTeamId[team_id] ?? [];
          const selectedCompetitionKeySet = new Set(selectedCompetitionKeys);
          teamCompetitionOptions.forEach((competitionOption) => {
            selectedCompetitionKeySet.add(competitionOption.key);
          });
          nextSelectedCompetitionKeysByTeamId[team_id] = [
            ...selectedCompetitionKeySet,
          ];
        });

        return nextSelectedCompetitionKeysByTeamId;
      },
    );
  };

  const handleToggleNaipeTabSelection = (
    sport_id: string,
    naipe: MatchNaipe,
    checked: boolean,
  ) => {
    setSelectedCompetitionKeysByTeamId(
      (currentSelectedCompetitionKeysByTeamId) => {
        const nextSelectedCompetitionKeysByTeamId = {
          ...currentSelectedCompetitionKeysByTeamId,
        };

        selectedTeamIds.forEach((team_id) => {
          const selectedSportIds = selectedSportIdsByTeamId[team_id] ?? [];

          if (!selectedSportIds.includes(sport_id)) {
            return;
          }

          const teamCompetitionOption = (
            competitionOptionsByTeamId[team_id] ?? []
          ).find((competitionOption) => {
            return (
              competitionOption.sport_id == sport_id &&
              competitionOption.naipe == naipe
            );
          });

          if (!teamCompetitionOption) {
            return;
          }

          const selectedCompetitionKeys =
            nextSelectedCompetitionKeysByTeamId[team_id] ?? [];

          if (checked) {
            if (selectedCompetitionKeys.includes(teamCompetitionOption.key)) {
              return;
            }

            nextSelectedCompetitionKeysByTeamId[team_id] = [
              ...selectedCompetitionKeys,
              teamCompetitionOption.key,
            ];
            return;
          }

          nextSelectedCompetitionKeysByTeamId[team_id] =
            selectedCompetitionKeys.filter(
              (competitionKey) => competitionKey != teamCompetitionOption.key,
            );
        });

        return nextSelectedCompetitionKeysByTeamId;
      },
    );
  };

  const competitionGroupEditorColumnsByCompetitionKey = useMemo(() => {
    return activeCompetitionKeys.reduce<
      Record<string, ChampionshipBracketGroupEditorColumn[]>
    >((carry, competitionKey) => {
      const participantTeamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
      const groupsCount =
        competitionConfigByKey[competitionKey]?.groups_count ?? 1;

      carry[competitionKey] = resolveGroupEditorColumns({
        participant_team_ids: participantTeamIds,
        group_assignments:
          groupAssignmentsByCompetitionKey[competitionKey] ?? {},
        groups_count: groupsCount,
        ordered_team_ids_by_group_number:
          groupOrderByCompetitionKey[competitionKey] ?? {},
        transient_slot_ids_by_group_number:
          transientGroupSlotIdsByCompetitionKey[competitionKey] ?? {},
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
      orderedTeamIdsByGroupNumber = groupOrderByCompetitionKey[
        competitionKey
      ] ?? {},
    ): string[] => {
      return resolveOrderedAssignedTeamIds({
        participant_team_ids: teamIdsByCompetitionKey[competitionKey] ?? [],
        group_assignments:
          groupAssignmentsByCompetitionKey[competitionKey] ?? {},
        ordered_team_ids_by_group_number: orderedTeamIdsByGroupNumber,
        group_number: groupNumber,
      });
    },
    [
      groupAssignmentsByCompetitionKey,
      groupOrderByCompetitionKey,
      teamIdsByCompetitionKey,
    ],
  );

  const handleAddCompetitionGroupSlot = (
    competitionKey: string,
    groupNumber: number,
  ) => {
    const nextSlotId = resolveRandomUuid();

    setTransientGroupSlotIdsByCompetitionKey(
      (currentTransientGroupSlotIdsByCompetitionKey) => ({
        ...currentTransientGroupSlotIdsByCompetitionKey,
        [competitionKey]: {
          ...(currentTransientGroupSlotIdsByCompetitionKey[competitionKey] ??
            {}),
          [String(groupNumber)]: [
            ...((currentTransientGroupSlotIdsByCompetitionKey[competitionKey] ??
              {})[String(groupNumber)] ?? []),
            nextSlotId,
          ],
        },
      }),
    );
    setAutoOpenCompetitionGroupSlotKey(
      resolveCompetitionGroupSlotSelectionKey(
        competitionKey,
        groupNumber,
        nextSlotId,
      ),
    );
  };

  const handleRemoveCompetitionGroupSlot = (
    competitionKey: string,
    groupNumber: number,
    slotId: string,
  ) => {
    const slotSelectionKey = resolveCompetitionGroupSlotSelectionKey(
      competitionKey,
      groupNumber,
      slotId,
    );

    setTransientGroupSlotIdsByCompetitionKey(
      (currentTransientGroupSlotIdsByCompetitionKey) => {
        const currentTransientSlotIdsByGroupNumber =
          currentTransientGroupSlotIdsByCompetitionKey[competitionKey] ?? {};
        const nextTransientSlotIds = (
          currentTransientSlotIdsByGroupNumber[String(groupNumber)] ?? []
        ).filter((currentSlotId) => currentSlotId != slotId);
        const nextTransientSlotIdsByGroupNumber = Object.entries(
          currentTransientSlotIdsByGroupNumber,
        ).reduce<ChampionshipBracketGroupEditorTransientSlotIdsByGroupNumber>(
          (carry, [currentGroupNumber, currentSlotIds]) => {
            if (
              currentGroupNumber != String(groupNumber) &&
              currentSlotIds.length > 0
            ) {
              carry[currentGroupNumber] = currentSlotIds;
            }

            return carry;
          },
          {},
        );

        if (nextTransientSlotIds.length > 0) {
          nextTransientSlotIdsByGroupNumber[String(groupNumber)] =
            nextTransientSlotIds;
        }

        if (Object.keys(nextTransientSlotIdsByGroupNumber).length == 0) {
          const {
            [competitionKey]: _removedCompetitionKey,
            ...remainingTransientGroupSlotIdsByCompetitionKey
          } = currentTransientGroupSlotIdsByCompetitionKey;

          return remainingTransientGroupSlotIdsByCompetitionKey;
        }

        return {
          ...currentTransientGroupSlotIdsByCompetitionKey,
          [competitionKey]: nextTransientSlotIdsByGroupNumber,
        };
      },
    );
    setAutoOpenCompetitionGroupSlotKey(
      (currentAutoOpenCompetitionGroupSlotKey) => {
        return currentAutoOpenCompetitionGroupSlotKey == slotSelectionKey
          ? null
          : currentAutoOpenCompetitionGroupSlotKey;
      },
    );
  };

  const handleSelectCompetitionGroupTeam = (
    competitionKey: string,
    groupNumber: number,
    nextTeamId: string,
    currentTeamId: string | null,
    slotId: string,
  ) => {
    setAutoOpenCompetitionGroupSlotKey(
      (currentAutoOpenCompetitionGroupSlotKey) => {
        const slotSelectionKey = resolveCompetitionGroupSlotSelectionKey(
          competitionKey,
          groupNumber,
          slotId,
        );
        return currentAutoOpenCompetitionGroupSlotKey == slotSelectionKey
          ? null
          : currentAutoOpenCompetitionGroupSlotKey;
      },
    );

    setGroupAssignmentsByCompetitionKey(
      (currentGroupAssignmentsByCompetitionKey) => {
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
      },
    );

    setGroupOrderByCompetitionKey((currentGroupOrderByCompetitionKey) => {
      const currentOrderedTeamIdsByGroupNumber =
        currentGroupOrderByCompetitionKey[competitionKey] ?? {};
      const currentOrderedTeamIds = resolveCurrentOrderedTeamIdsForGroup(
        competitionKey,
        groupNumber,
        currentOrderedTeamIdsByGroupNumber,
      );
      const nextOrderedTeamIds = currentTeamId
        ? currentOrderedTeamIds.includes(currentTeamId)
          ? currentOrderedTeamIds.map((teamId) =>
              teamId == currentTeamId ? nextTeamId : teamId,
            )
          : [...currentOrderedTeamIds, nextTeamId]
        : [...currentOrderedTeamIds, nextTeamId];
      const deduplicatedOrderedTeamIds = nextOrderedTeamIds.filter(
        (teamId, teamIndex, currentTeamIds) => {
          return currentTeamIds.indexOf(teamId) == teamIndex;
        },
      );

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

  const handleRemoveCompetitionGroupTeam = (
    competitionKey: string,
    teamId: string,
  ) => {
    const currentGroupNumber =
      groupAssignmentsByCompetitionKey[competitionKey]?.[teamId] ?? null;

    setGroupAssignmentsByCompetitionKey(
      (currentGroupAssignmentsByCompetitionKey) => {
        const currentAssignments =
          currentGroupAssignmentsByCompetitionKey[competitionKey] ?? {};
        const nextAssignments = Object.entries(currentAssignments).reduce<
          Record<string, number>
        >((carry, [currentTeamId, groupNumber]) => {
          if (currentTeamId != teamId) {
            carry[currentTeamId] = groupNumber;
          }

          return carry;
        }, {});

        return {
          ...currentGroupAssignmentsByCompetitionKey,
          [competitionKey]: nextAssignments,
        };
      },
    );

    if (currentGroupNumber != null) {
      setGroupOrderByCompetitionKey((currentGroupOrderByCompetitionKey) => {
        const currentOrderedTeamIdsByGroupNumber =
          currentGroupOrderByCompetitionKey[competitionKey] ?? {};
        const nextOrderedTeamIds = (
          currentOrderedTeamIdsByGroupNumber[String(currentGroupNumber)] ?? []
        ).filter((currentTeamId) => currentTeamId != teamId);
        const nextOrderedTeamIdsByGroupNumber = Object.entries(
          currentOrderedTeamIdsByGroupNumber,
        ).reduce<ChampionshipBracketGroupOrderedTeamIdsByGroupNumber>(
          (carry, [groupNumber, currentTeamIds]) => {
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
          },
          {},
        );

        if (Object.keys(nextOrderedTeamIdsByGroupNumber).length == 0) {
          const {
            [competitionKey]: _removedCompetitionKey,
            ...remainingGroupOrderByCompetitionKey
          } = currentGroupOrderByCompetitionKey;
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
    const groupCount =
      competitionConfigByKey[competitionKey]?.groups_count ?? 1;

    setGroupAssignmentsByCompetitionKey(
      (currentGroupAssignmentsByCompetitionKey) => ({
        ...currentGroupAssignmentsByCompetitionKey,
        [competitionKey]: resolveBalancedAssignments(
          teamIds,
          groupCount,
          competitionKey,
        ),
      }),
    );
    setTransientGroupSlotIdsByCompetitionKey(
      (currentTransientGroupSlotIdsByCompetitionKey) => {
        const {
          [competitionKey]: _removedCompetitionKey,
          ...remainingTransientGroupSlotIdsByCompetitionKey
        } = currentTransientGroupSlotIdsByCompetitionKey;

        return remainingTransientGroupSlotIdsByCompetitionKey;
      },
    );
    setGroupOrderByCompetitionKey((currentGroupOrderByCompetitionKey) => {
      const {
        [competitionKey]: _removedCompetitionKey,
        ...remainingGroupOrderByCompetitionKey
      } = currentGroupOrderByCompetitionKey;
      return remainingGroupOrderByCompetitionKey;
    });
    setAutoOpenCompetitionGroupSlotKey(null);
  };

  const handleAutoAssignAllCompetitionGroups = () => {
    setGroupAssignmentsByCompetitionKey(
      (currentGroupAssignmentsByCompetitionKey) => {
        const nextGroupAssignmentsByCompetitionKey = {
          ...currentGroupAssignmentsByCompetitionKey,
        };

        activeCompetitionKeys.forEach((competitionKey) => {
          const teamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
          const groupCount =
            competitionConfigByKey[competitionKey]?.groups_count ?? 1;
          nextGroupAssignmentsByCompetitionKey[competitionKey] =
            resolveBalancedAssignments(teamIds, groupCount, competitionKey);
        });

        return nextGroupAssignmentsByCompetitionKey;
      },
    );
    setTransientGroupSlotIdsByCompetitionKey({});
    setGroupOrderByCompetitionKey({});
    setAutoOpenCompetitionGroupSlotKey(null);
  };

  const handleDrawNextTeam = (competitionKey: string) => {
    const allTeamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
    const assignments = groupAssignmentsByCompetitionKey[competitionKey] ?? {};
    const assignedTeamIds = new Set(Object.keys(assignments));
    const availableTeamIds = allTeamIds.filter(
      (id) => !assignedTeamIds.has(id),
    );

    if (availableTeamIds.length === 0) {
      return;
    }

    const groupsCount =
      competitionConfigByKey[competitionKey]?.groups_count ?? 2;
    const nextSlot = resolveNextDrawSlot(groupsCount, assignments);
    const drawnTeamId =
      availableTeamIds[Math.floor(Math.random() * availableTeamIds.length)];
    const newSlotId = resolveRandomUuid();

    setPendingDrawResult({
      teamId: drawnTeamId,
      groupNumber: nextSlot.groupNumber,
      slotId: newSlotId,
    });
    setDrawingCompetitionKey(competitionKey);
    setShowDrawModal(true);
  };

  const handleDrawResultReady = () => {
    if (!pendingDrawResult || !drawingCompetitionKey) return;

    handleSelectCompetitionGroupTeam(
      drawingCompetitionKey,
      pendingDrawResult.groupNumber,
      pendingDrawResult.teamId,
      null,
      pendingDrawResult.slotId,
    );
  };

  const drawingTeamIds = useMemo(() => {
    if (!drawingCompetitionKey) {
      return [];
    }

    const allTeamIds = teamIdsByCompetitionKey[drawingCompetitionKey] ?? [];
    const assignedIds = new Set(
      Object.keys(
        groupAssignmentsByCompetitionKey[drawingCompetitionKey] ?? {},
      ),
    );

    return allTeamIds.filter((id) => !assignedIds.has(id));
  }, [
    drawingCompetitionKey,
    groupAssignmentsByCompetitionKey,
    teamIdsByCompetitionKey,
  ]);

  const drawingCompetitionOption = useMemo(() => {
    if (!drawingCompetitionKey) {
      return null;
    }

    return competitionOptionsByKey.get(drawingCompetitionKey) ?? null;
  }, [competitionOptionsByKey, drawingCompetitionKey]);

  const handleCloseDrawModal = () => {
    setShowDrawModal(false);
    setPendingDrawResult(null);
    setDrawingCompetitionKey(null);

    // Auto-save silencioso para garantir persistência dos resultados do sorteio
    const currentDraft = resolveWizardDraftFormValues();
    void saveChampionshipBracketWizardDraft(
      selectedChampionship.id,
      currentDraft,
    ).then((response) => {
      if (!response.error && response.metadata) {
        setRemoteDraftMetadata(response.metadata);
      }
    });
    setLastSavedEditableDraftSnapshot(
      resolveEditableDraftSnapshot(currentDraft),
    );
  };

  const handleDrawConfirm = () => {
    handleCloseDrawModal();
  };

  const validateCurrentStep = () => {
    if (currentStepIndex == 0) {
      if (
        seasonSettings.division_format ==
          ChampionshipSeasonDivisionFormat.SEPARATED &&
        seasonSettings.division_settlement_mode ==
          ChampionshipSeasonDivisionSettlementMode.PROMOTION_RELEGATION &&
        ((seasonSettings.principal_relegation_count ?? 0) <= 0 ||
          (seasonSettings.access_promotion_count ?? 0) <= 0)
      ) {
        toast.error(
          "Informe quantas atléticas sobem e caem na temporada separada.",
        );
        return false;
      }

      if (
        seasonSettings.division_format ==
          ChampionshipSeasonDivisionFormat.UNIFIED &&
        seasonSettings.division_settlement_mode ==
          ChampionshipSeasonDivisionSettlementMode.TOP_N_TO_PRINCIPAL &&
        (seasonSettings.principal_slots_count ?? 0) <= 0
      ) {
        toast.error(
          "Informe quantas atléticas irão compor a divisão principal após a temporada unificada.",
        );
        return false;
      }
    }

    if (currentStepIndex == 1) {
      if (enabledSportIds.length == 0) {
        toast.error(
          "Selecione ao menos uma modalidade ativa para a temporada.",
        );
        return false;
      }
    }

    if (currentStepIndex == 2) {
      if (selectedTeamIds.length == 0) {
        toast.error("Selecione ao menos uma atlética participante.");
        return false;
      }
    }

    if (currentStepIndex == 3) {
      const hasSelectedTeamWithoutSport = selectedTeamIds.some((team_id) => {
        return (selectedSportIdsByTeamId[team_id] ?? []).length == 0;
      });

      if (hasSelectedTeamWithoutSport) {
        toast.error(
          "Todas as atléticas selecionadas precisam ter ao menos uma modalidade.",
        );
        return false;
      }
    }

    if (currentStepIndex == 4) {
      const hasSelectedTeamSportWithoutNaipe = selectedTeamIds.some(
        (team_id) => {
          const selectedSportIds = selectedSportIdsByTeamId[team_id] ?? [];
          const selectedCompetitionKeys =
            selectedCompetitionKeysByTeamId[team_id] ?? [];

          return selectedSportIds.some((sport_id) => {
            return !selectedCompetitionKeys.some((competitionKey) => {
              const parsedCompetitionKey = parseCompetitionKey(competitionKey);
              return parsedCompetitionKey.sport_id == sport_id;
            });
          });
        },
      );

      if (hasSelectedTeamSportWithoutNaipe) {
        toast.error(
          "Selecione ao menos um naipe para cada modalidade de cada atlética.",
        );
        return false;
      }

      const selectedCompetitionCount = Object.values(
        selectedCompetitionKeysByTeamId,
      ).reduce((total, selectedCompetitionKeys) => {
        return total + selectedCompetitionKeys.length;
      }, 0);

      if (selectedCompetitionCount == 0) {
        toast.error(
          "Selecione ao menos uma modalidade/naipe para as atléticas participantes.",
        );
        return false;
      }

      if (activeCompetitionKeys.length == 0) {
        toast.error(
          "É necessário ao menos uma competição com duas atléticas para gerar grupos.",
        );
        return false;
      }
    }

    if (currentStepIndex == 5) {
      const hasInvalidCompetition = activeCompetitionKeys.some(
        (competitionKey) => {
          const competitionConfig = competitionConfigByKey[competitionKey];
          if (!competitionConfig) {
            return true;
          }

          return (
            competitionConfig.groups_count < 1 ||
            competitionConfig.qualifiers_per_group < 1 ||
            competitionConfig.qualifiers_per_group > 2
          );
        },
      );

      if (hasInvalidCompetition) {
        toast.error(
          "Revise a configuração de grupos. Classificados por grupo deve ser 1 ou 2.",
        );
        return false;
      }
    }

    if (currentStepIndex == 11) {
      for (const competitionKey of activeCompetitionKeys) {
        const teamIds = teamIdsByCompetitionKey[competitionKey] ?? [];
        const assignments =
          groupAssignmentsByCompetitionKey[competitionKey] ?? {};
        const groupCount =
          competitionConfigByKey[competitionKey]?.groups_count ?? 1;
        const competitionOption = competitionOptionsByKey.get(competitionKey);
        const groupSizes = Array.from({ length: groupCount }, () => 0);
        const competitionDisplayLabel = competitionOption
          ? `${competitionOption.sport_name} • ${MATCH_NAIPE_LABELS[competitionOption.naipe]}${
              competitionOption.division
                ? ` • ${TEAM_DIVISION_LABELS[competitionOption.division]}`
                : ""
            }`
          : "modalidade selecionada";

        for (const teamId of teamIds) {
          const assignedGroup = assignments[teamId];

          if (
            !assignedGroup ||
            assignedGroup < 1 ||
            assignedGroup > groupCount
          ) {
            toast.error(
              `A distribuição de ${competitionDisplayLabel} possui atléticas sem grupo válido.`,
            );
            return false;
          }

          groupSizes[assignedGroup - 1] = groupSizes[assignedGroup - 1] + 1;
        }

        const minimumGroupSize = Math.min(...groupSizes);
        const maximumGroupSize = Math.max(...groupSizes);

        if (minimumGroupSize < 2) {
          toast.error(
            `Em ${competitionDisplayLabel}, cada grupo precisa ter no mínimo 2 atléticas.`,
          );
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

    if (currentStepIndex == 6) {
      if (scheduleDays.length == 0) {
        toast.error("Configure ao menos um dia de agenda.");
        return false;
      }

      for (const scheduleDay of scheduleDays) {
        if (
          !scheduleDay.date ||
          !scheduleDay.start_time ||
          !scheduleDay.end_time
        ) {
          toast.error(
            "Preencha data, início e fim de todos os dias da agenda.",
          );
          return false;
        }

        const startMinutes = resolveTimeValueToMinutes(scheduleDay.start_time);
        const endMinutes = resolveTimeValueToMinutes(scheduleDay.end_time);

        if (
          startMinutes == null ||
          endMinutes == null ||
          endMinutes <= startMinutes
        ) {
          toast.error(
            "Horário do dia inválido: fim deve ser maior que início.",
          );
          return false;
        }

        const breakStartTimeValue = scheduleDay.break_start_time.trim();
        const breakEndTimeValue = scheduleDay.break_end_time.trim();
        const hasBreakStartTime = breakStartTimeValue.length > 0;
        const hasBreakEndTime = breakEndTimeValue.length > 0;

        if (hasBreakStartTime != hasBreakEndTime) {
          toast.error(
            "Preencha início e fim do intervalo ou deixe os dois vazios.",
          );
          return false;
        }

        if (hasBreakStartTime && hasBreakEndTime) {
          const breakStartMinutes =
            resolveTimeValueToMinutes(breakStartTimeValue);
          const breakEndMinutes = resolveTimeValueToMinutes(breakEndTimeValue);

          if (
            breakStartMinutes == null ||
            breakEndMinutes == null ||
            breakEndMinutes <= breakStartMinutes
          ) {
            toast.error("Intervalo inválido: fim deve ser maior que início.");
            return false;
          }

          if (
            breakStartMinutes < startMinutes ||
            breakEndMinutes > endMinutes
          ) {
            toast.error(
              "Intervalo inválido: precisa estar dentro da janela do dia.",
            );
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
            toast.error("Todo local precisa de ao menos um recurso/quadra.");
            return false;
          }

          for (const court of location.courts) {
            if (!court.name.trim()) {
              toast.error("Todo recurso/quadra precisa ter um nome.");
              return false;
            }

            if (court.sport_ids.length == 0) {
              toast.error(
                "Todo recurso/quadra precisa ter ao menos uma modalidade vinculada.",
              );
              return false;
            }
          }
        }
      }
    }

    if (currentStepIndex == 7) {
      if (selectedIndividualCompetitionOptions.length > 0) {
        const sessionConfigByKey = new Map(
          individualSessionConfigs.map((sessionConfig) => [
            resolveIndividualSessionConfigKey(sessionConfig),
            sessionConfig,
          ]),
        );
        const hasSessionWithoutSlot = selectedIndividualCompetitionOptions.some(
          (competitionOption) => {
            const sessionConfig = sessionConfigByKey.get(
              resolveIndividualSessionConfigKey(competitionOption),
            );

            return (
              !sessionConfig ||
              !sessionConfig.scheduled_date ||
              sessionConfig.period == null ||
              !sessionConfig.location_key ||
              !sessionConfig.court_key
            );
          },
        );

        if (hasSessionWithoutSlot) {
          toast.error(
            "Toda sessão individual precisa ter dia, período e recurso oficial definidos.",
          );
          return false;
        }
      }
    }

    if (currentStepIndex == 8) {
      for (const competitionKey of sortedActiveCompetitionKeys) {
        let hasAvailableDate = false;

        for (const scheduleDate of scheduleDayDates) {
          const availabilityItem = competitionDateAvailabilityByKey.get(
            `${competitionKey}::${scheduleDate}`,
          );

          if (!availabilityItem) {
            toast.error(
              `A disponibilidade de ${
                competitionLabelByKey[competitionKey] ?? "uma competição"
              } está incompleta. Revise todos os dias da agenda.`,
            );
            return false;
          }

          if (availabilityItem.mode == "UNAVAILABLE") {
            continue;
          }

          if (availabilityItem.mode == "FULL_DAY") {
            hasAvailableDate = true;
            continue;
          }

          if (availabilityItem.windows.length == 0) {
            toast.error(
              `Adicione ao menos uma janela de horário em ${
                competitionLabelByKey[competitionKey] ?? "uma competição"
              } no dia ${resolveBrazilianDateString(scheduleDate)}.`,
            );
            return false;
          }

          const scheduleDay = scheduleDays.find(
            (currentScheduleDay) => currentScheduleDay.date == scheduleDate,
          );

          if (!scheduleDay) {
            toast.error(
              "Uma disponibilidade está vinculada a um dia que não existe mais na agenda.",
            );
            return false;
          }

          const dayStartMinutes = resolveTimeValueToMinutes(
            scheduleDay.start_time,
          );
          const dayEndMinutes = resolveTimeValueToMinutes(
            scheduleDay.end_time,
          );

          if (
            dayStartMinutes == null ||
            dayEndMinutes == null ||
            dayEndMinutes <= dayStartMinutes
          ) {
            toast.error(
              `Revise o horário da agenda em ${resolveBrazilianDateString(
                scheduleDate,
              )}.`,
            );
            return false;
          }

          const resolvedWindows = availabilityItem.windows
            .map((window) => {
              const startMinutes = resolveTimeValueToMinutes(
                window.start_time,
              );
              const endMinutes = resolveTimeValueToMinutes(window.end_time);

              if (
                startMinutes == null ||
                endMinutes == null ||
                endMinutes <= startMinutes
              ) {
                return null;
              }

              return {
                start: startMinutes,
                end: endMinutes,
              };
            })
            .filter(
              (
                window,
              ): window is {
                start: number;
                end: number;
              } => window != null,
            )
            .sort((left, right) => left.start - right.start);

          if (resolvedWindows.length != availabilityItem.windows.length) {
            toast.error(
              `Existe uma janela com horário inválido em ${
                competitionLabelByKey[competitionKey] ?? "uma competição"
              } no dia ${resolveBrazilianDateString(scheduleDate)}.`,
            );
            return false;
          }

          const hasWindowOutsideDay = resolvedWindows.some(
            (window) => window.start < dayStartMinutes || window.end > dayEndMinutes,
          );

          if (hasWindowOutsideDay) {
            toast.error(
              `As janelas de ${
                competitionLabelByKey[competitionKey] ?? "uma competição"
              } precisam permanecer dentro da agenda de ${resolveBrazilianDateString(
                scheduleDate,
              )}.`,
            );
            return false;
          }

          for (
            let windowIndex = 1;
            windowIndex < resolvedWindows.length;
            windowIndex += 1
          ) {
            const previousWindow = resolvedWindows[windowIndex - 1];
            const currentWindow = resolvedWindows[windowIndex];

            if (
              previousWindow &&
              currentWindow &&
              currentWindow.start < previousWindow.end
            ) {
              toast.error(
                `Existem janelas sobrepostas em ${
                  competitionLabelByKey[competitionKey] ?? "uma competição"
                } no dia ${resolveBrazilianDateString(scheduleDate)}.`,
              );
              return false;
            }
          }

          const breakStartMinutes = scheduleDay.break_start_time
            ? resolveTimeValueToMinutes(scheduleDay.break_start_time)
            : null;
          const breakEndMinutes = scheduleDay.break_end_time
            ? resolveTimeValueToMinutes(scheduleDay.break_end_time)
            : null;

          const hasUsableWindow = resolvedWindows.some((window) => {
            if (
              breakStartMinutes == null ||
              breakEndMinutes == null ||
              breakEndMinutes <= breakStartMinutes
            ) {
              return true;
            }

            return (
              window.start < breakStartMinutes ||
              window.end > breakEndMinutes
            );
          });

          if (!hasUsableWindow) {
            toast.error(
              `As janelas de ${
                competitionLabelByKey[competitionKey] ?? "uma competição"
              } em ${resolveBrazilianDateString(
                scheduleDate,
              )} ficaram totalmente dentro do intervalo da agenda.`,
            );
            return false;
          }

          hasAvailableDate = true;
        }

        if (!hasAvailableDate) {
          toast.error(
            `${
              competitionLabelByKey[competitionKey] ?? "Uma competição"
            } precisa ter ao menos um dia disponível.`,
          );
          return false;
        }
      }
    }

    if (currentStepIndex == 9) {
      type AvailabilityInterval = {
        start: number;
        end: number;
      };

      const resolveAvailabilityIntervals = ({
        scheduleDay,
        mode,
        windows,
      }: {
        scheduleDay: ScheduleDayFormValue;
        mode: "UNAVAILABLE" | "FULL_DAY" | "CUSTOM";
        windows: Array<{
          start_time: string;
          end_time: string;
        }>;
      }): AvailabilityInterval[] | null => {
        const dayStartMinutes = resolveTimeValueToMinutes(
          scheduleDay.start_time,
        );
        const dayEndMinutes = resolveTimeValueToMinutes(scheduleDay.end_time);

        if (
          dayStartMinutes == null ||
          dayEndMinutes == null ||
          dayEndMinutes <= dayStartMinutes
        ) {
          return null;
        }

        if (mode == "UNAVAILABLE") {
          return [];
        }

        let intervals: AvailabilityInterval[];

        if (mode == "FULL_DAY") {
          intervals = [
            {
              start: dayStartMinutes,
              end: dayEndMinutes,
            },
          ];
        } else {
          if (windows.length == 0) {
            return null;
          }

          const parsedWindows = windows.map((window) => {
            const startMinutes = resolveTimeValueToMinutes(
              window.start_time,
            );
            const endMinutes = resolveTimeValueToMinutes(window.end_time);

            if (
              startMinutes == null ||
              endMinutes == null ||
              endMinutes <= startMinutes
            ) {
              return null;
            }

            if (startMinutes < dayStartMinutes || endMinutes > dayEndMinutes) {
              return null;
            }

            return {
              start: startMinutes,
              end: endMinutes,
            };
          });

          if (parsedWindows.some((window): window is null => window == null)) {
            return null;
          }

          intervals = (parsedWindows as AvailabilityInterval[]).sort(
            (left, right) => left.start - right.start,
          );

          for (
            let intervalIndex = 1;
            intervalIndex < intervals.length;
            intervalIndex += 1
          ) {
            const previousInterval = intervals[intervalIndex - 1];
            const currentInterval = intervals[intervalIndex];

            if (
              previousInterval &&
              currentInterval &&
              currentInterval.start < previousInterval.end
            ) {
              return null;
            }
          }
        }

        const hasBreakStart = scheduleDay.break_start_time.trim() != "";
        const hasBreakEnd = scheduleDay.break_end_time.trim() != "";

        if (!hasBreakStart && !hasBreakEnd) {
          return intervals;
        }

        if (hasBreakStart != hasBreakEnd) {
          return null;
        }

        const breakStartMinutes = resolveTimeValueToMinutes(
          scheduleDay.break_start_time,
        );
        const breakEndMinutes = resolveTimeValueToMinutes(
          scheduleDay.break_end_time,
        );

        if (
          breakStartMinutes == null ||
          breakEndMinutes == null ||
          breakEndMinutes <= breakStartMinutes ||
          breakStartMinutes < dayStartMinutes ||
          breakEndMinutes > dayEndMinutes
        ) {
          return null;
        }

        return intervals.flatMap((interval) => {
          if (
            interval.end <= breakStartMinutes ||
            interval.start >= breakEndMinutes
          ) {
            return [interval];
          }

          const availableIntervals: AvailabilityInterval[] = [];

          if (interval.start < breakStartMinutes) {
            availableIntervals.push({
              start: interval.start,
              end: breakStartMinutes,
            });
          }

          if (interval.end > breakEndMinutes) {
            availableIntervals.push({
              start: breakEndMinutes,
              end: interval.end,
            });
          }

          return availableIntervals;
        });
      };

      for (const [teamId, competitionKeys] of Object.entries(
        teamCompetitionKeysByTeamId,
      )) {
        for (const competitionKey of competitionKeys) {
          let hasPlayableIntersection = false;

          for (const scheduleDate of scheduleDayDates) {
            const scheduleDay = scheduleDays.find(
              (currentScheduleDay) => currentScheduleDay.date == scheduleDate,
            );

            if (!scheduleDay) {
              toast.error(
                "Uma disponibilidade está vinculada a um dia que não existe mais na agenda.",
              );
              return false;
            }

            const competitionAvailability =
              competitionDateAvailabilityByKey.get(
                `${competitionKey}::${scheduleDate}`,
              );

            if (!competitionAvailability) {
              toast.error(
                `A disponibilidade de ${
                  competitionLabelByKey[competitionKey] ??
                  "uma competição"
                } está incompleta.`,
              );
              return false;
            }

            const teamAvailability =
              teamCompetitionDateAvailabilityByKey.get(
                `${teamId}::${competitionKey}::${scheduleDate}`,
              );

            if (!teamAvailability) {
              toast.error(
                `A disponibilidade de ${
                  teamNameById[teamId] ?? "uma atlética"
                } está incompleta em ${
                  competitionLabelByKey[competitionKey] ??
                  "uma competição"
                }.`,
              );
              return false;
            }

            const competitionIntervals = resolveAvailabilityIntervals({
              scheduleDay,
              mode: competitionAvailability.mode,
              windows: competitionAvailability.windows,
            });

            if (competitionIntervals == null) {
              toast.error(
                `Revise as janelas de ${
                  competitionLabelByKey[competitionKey] ??
                  "uma competição"
                } em ${resolveBrazilianDateString(scheduleDate)}.`,
              );
              return false;
            }

            if (competitionIntervals.length == 0) {
              continue;
            }

            const teamIntervals = resolveAvailabilityIntervals({
              scheduleDay,
              mode: teamAvailability.mode,
              windows: teamAvailability.windows,
            });

            if (teamIntervals == null) {
              toast.error(
                `Revise as janelas de ${
                  teamNameById[teamId] ?? "uma atlética"
                } em ${
                  competitionLabelByKey[competitionKey] ??
                  "uma competição"
                } no dia ${resolveBrazilianDateString(scheduleDate)}.`,
              );
              return false;
            }

            const hasIntersectionOnDate = competitionIntervals.some(
              (competitionInterval) =>
                teamIntervals.some((teamInterval) => {
                  const intersectionStart = Math.max(
                    competitionInterval.start,
                    teamInterval.start,
                  );
                  const intersectionEnd = Math.min(
                    competitionInterval.end,
                    teamInterval.end,
                  );

                  return intersectionEnd > intersectionStart;
                }),
            );

            if (hasIntersectionOnDate) {
              hasPlayableIntersection = true;
            }
          }

          if (!hasPlayableIntersection) {
            toast.error(
              `${teamNameById[teamId] ?? "A atlética"} precisa ter ao menos uma janela jogável em ${
                competitionLabelByKey[competitionKey] ??
                "cada competição selecionada"
              }.`,
            );
            return false;
          }
        }
      }
    }

    if (currentStepIndex == 10) {
      const activeCollectiveSportIdSet = new Set(
        activeCompetitionOptions.map(
          (competitionOption) => competitionOption.sport_id,
        ),
      );
      const plannedCollectiveSportIdSet = new Set<string>();

      for (const scheduleDay of scheduleDays) {
        for (const scheduleLocation of scheduleDay.locations) {
          for (const court of scheduleLocation.courts) {
            const courtDisplayLabel = `${court.name || "Quadra sem nome"} • ${
              scheduleLocation.name || "Local sem nome"
            } • ${
              scheduleDay.date
                ? resolveBrazilianDateString(scheduleDay.date)
                : "Data não informada"
            }`;

            for (const target of court.sport_match_targets) {
              if (
                !court.sport_ids.includes(target.sport_id) ||
                !activeCollectiveSportIdSet.has(target.sport_id)
              ) {
                toast.error(
                  `Existe uma modalidade inválida no planejamento de ${courtDisplayLabel}.`,
                );
                return false;
              }

              if (
                !Number.isInteger(target.planned_match_count) ||
                target.planned_match_count <= 0
              ) {
                toast.error(
                  `A quantidade planejada de jogos de ${courtDisplayLabel} precisa ser um número inteiro maior que zero.`,
                );
                return false;
              }

              plannedCollectiveSportIdSet.add(target.sport_id);
            }

            const sportPreference = court.sport_preference;

            if (!sportPreference) {
              continue;
            }

            if (!court.sport_ids.includes(sportPreference.preferred_sport_id)) {
              toast.error(
                `A modalidade preferencial de ${courtDisplayLabel} não está mais vinculada à quadra.`,
              );
              return false;
            }

            const preferredSportOptions = activeCompetitionOptions.filter(
              (competitionOption) =>
                competitionOption.sport_id ==
                sportPreference.preferred_sport_id,
            );

            if (preferredSportOptions.length == 0) {
              toast.error(
                `A modalidade preferencial de ${courtDisplayLabel} não está ativa no campeonato.`,
              );
              return false;
            }

            if (
              sportPreference.preferred_naipe != null &&
              !preferredSportOptions.some(
                (competitionOption) =>
                  competitionOption.naipe == sportPreference.preferred_naipe,
              )
            ) {
              toast.error(
                `O naipe preferencial de ${courtDisplayLabel} não está disponível para a modalidade selecionada.`,
              );
              return false;
            }

            if (
              seasonSettings.division_format !=
                ChampionshipSeasonDivisionFormat.SEPARATED &&
              sportPreference.preferred_division != null
            ) {
              toast.error(
                `A divisão preferencial de ${courtDisplayLabel} não pode ser utilizada em uma temporada unificada.`,
              );
              return false;
            }

            if (
              sportPreference.preferred_division != null &&
              !preferredSportOptions.some(
                (competitionOption) =>
                  competitionOption.division ==
                  sportPreference.preferred_division,
              )
            ) {
              toast.error(
                `A divisão preferencial de ${courtDisplayLabel} não está disponível para a modalidade selecionada.`,
              );
              return false;
            }

            if (
              sportPreference.preferred_naipe != null &&
              sportPreference.preferred_division != null &&
              !preferredSportOptions.some(
                (competitionOption) =>
                  competitionOption.naipe == sportPreference.preferred_naipe &&
                  competitionOption.division ==
                    sportPreference.preferred_division,
              )
            ) {
              toast.error(
                `A combinação de naipe e divisão preferencial de ${courtDisplayLabel} não está disponível.`,
              );
              return false;
            }
          }
        }
      }

      const collectiveSportWithoutPlan = activeCompetitionOptions.find(
        (competitionOption) =>
          !plannedCollectiveSportIdSet.has(competitionOption.sport_id),
      );

      if (collectiveSportWithoutPlan) {
        toast.error(
          `Defina ao menos uma quantidade planejada de jogos para ${collectiveSportWithoutPlan.sport_name}.`,
        );
        return false;
      }

      const hasInvalidKnockoutProgramBlock = knockoutProgramBlocks.some(
        (programBlock) =>
          !programBlock.date ||
          !programBlock.location_key ||
          !programBlock.court_key ||
          !programBlock.sport_id ||
          programBlock.naipe_sequence.length == 0,
      );

      if (hasInvalidKnockoutProgramBlock) {
        toast.error(
          "Revise os blocos manuais das finais. Todo bloco precisa de data, recurso, modalidade e ao menos um naipe.",
        );
        return false;
      }

      const hasInvalidKnockoutProgramBlockDuration = knockoutProgramBlocks.some(
        (programBlock) => {
          const duration = programBlock.match_duration_minutes_override;

          return (
            duration != null && (!Number.isInteger(duration) || duration <= 0)
          );
        },
      );

      if (hasInvalidKnockoutProgramBlockDuration) {
        toast.error(
          "A duração especial das finais precisa ser informada em minutos inteiros e ser maior que zero.",
        );
        return false;
      }

      const hasDuplicatedKnockoutProgramBlock =
        new Set(knockoutProgramBlocks.map(resolveKnockoutProgramBlockKey))
          .size != knockoutProgramBlocks.length;

      if (hasDuplicatedKnockoutProgramBlock) {
        toast.error(
          "Não é possível repetir a mesma modalidade e o mesmo escopo de divisão no mesmo recurso e período. Para ordenar os naipes, utilize a sequência de naipes do próprio bloco.",
        );
        return false;
      }
    }

    return true;
  };

  const handleNextStep = async () => {
    if (!validateCurrentStep()) {
      return;
    }

    const next_step_index = Math.min(
      currentStepIndex + 1,
      WIZARD_STEP_LABELS.length - 1,
    );
    const next_draft_form_values = sanitizeDraftFormValues({
      ...sanitizedCurrentWizardDraftFormValues,
      current_step_index: next_step_index,
    });

    const draftSaveResponse = await saveChampionshipBracketWizardDraft(
      selectedChampionship.id,
      next_draft_form_values,
    );

    if (draftSaveResponse.error) {
      if (!hasShownRemoteDraftWarning) {
        toast.warning(
          "Rascunho salvo localmente. A sincronização com o banco falhou nesta tentativa.",
        );
        setHasShownRemoteDraftWarning(true);
      }
    }

    if (draftSaveResponse.metadata) {
      setRemoteDraftMetadata(draftSaveResponse.metadata);
      setHasShownRemoteDraftWarning(false);
    }

    setLastSavedEditableDraftSnapshot(
      resolveEditableDraftSnapshot(next_draft_form_values),
    );
    setCurrentStepIndex(next_step_index);
    const changedFields = resolveWorkflowChangedFields(
      lastSavedEditableDraftSnapshot,
      next_draft_form_values,
      currentStepIndex,
    );

    await writeWorkflowLog({
      actionType: "UPDATE",
      stepIndex: next_step_index,
      description: `Etapa "${WIZARD_STEP_LABELS[next_step_index]}" atualizada e avançada.`,
      workflowAction: "STEP_ADVANCED",
      changedFields,
    });
  };

  const handlePreviousStep = () => {
    setCurrentStepIndex((currentStep) => Math.max(currentStep - 1, 0));
  };

  const handleSaveDraft = async () => {
    const nextDraftFormValues = sanitizeDraftFormValues(
      sanitizedCurrentWizardDraftFormValues,
    );

    const draftSaveResponse = await saveChampionshipBracketWizardDraft(
      selectedChampionship.id,
      nextDraftFormValues,
    );

    if (draftSaveResponse.error) {
      toast.warning(
        "Rascunho salvo localmente. A sincronização com o banco falhou nesta tentativa.",
      );
      return;
    }

    if (draftSaveResponse.metadata) {
      setRemoteDraftMetadata(draftSaveResponse.metadata);
      setHasShownRemoteDraftWarning(false);
    }

    setLastSavedEditableDraftSnapshot(
      resolveEditableDraftSnapshot(nextDraftFormValues),
    );
    applyWizardDraft(nextDraftFormValues);
    const changedFields = resolveWorkflowChangedFields(
      lastSavedEditableDraftSnapshot,
      nextDraftFormValues,
      currentStepIndex,
    );
    await writeWorkflowLog({
      actionType: "UPDATE",
      stepIndex: currentStepIndex,
      description: `Rascunho salvo na etapa "${WIZARD_STEP_LABELS[currentStepIndex]}".`,
      workflowAction: "DRAFT_SAVED",
      changedFields,
    });
    toast.success("Rascunho salvo.");
  };

  const resolveParticipantsPayload =
    useCallback((): ChampionshipBracketParticipantInput[] => {
      return selectedTeamIds.map((team_id) => {
        const selectedCompetitionKeys =
          selectedCompetitionKeysByTeamId[team_id] ?? [];

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

  const resolveCompetitionsPayload =
    useCallback((): ChampionshipBracketCompetitionInput[] => {
      return sortedActiveCompetitionKeys.map((competitionKey) => {
        const parsedCompetitionKey = parseCompetitionKey(competitionKey);
        const competitionOption =
          competitionOptionsByKey.get(competitionKey) ?? null;
        const competitionConfig =
          competitionConfigByKey[competitionKey] ??
          resolveDefaultCompetitionConfig(2, competitionOption);
        const assignments =
          groupAssignmentsByCompetitionKey[competitionKey] ?? {};
        const orderedTeamIdsByGroupNumber =
          groupOrderByCompetitionKey[competitionKey] ?? {};
        const groups: { group_number: number; team_ids: string[] }[] = [];

        for (
          let groupNumber = 1;
          groupNumber <= competitionConfig.groups_count;
          groupNumber += 1
        ) {
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
          should_complete_knockout_with_best_second_placed_teams:
            competitionConfig.should_complete_knockout_with_best_second_placed_teams,
          knockout_pairing_mode: competitionConfig.knockout_pairing_mode,
          third_place_mode: BracketThirdPlaceMode.CHAMPION_SEMIFINAL_LOSER,
          groups,
        };
      });
    }, [
      competitionOptionsByKey,
      competitionConfigByKey,
      groupAssignmentsByCompetitionKey,
      groupOrderByCompetitionKey,
      sortedActiveCompetitionKeys,
      teamIdsByCompetitionKey,
    ]);

  const resolveScheduleDaysPayload =
    useCallback((): ChampionshipBracketScheduleDayInput[] => {
      return scheduleDays.map((scheduleDay) => ({
        date: scheduleDay.date,
        start_time: scheduleDay.start_time,
        end_time: scheduleDay.end_time,
        break_start_time: scheduleDay.break_start_time.trim() || null,
        break_end_time: scheduleDay.break_end_time.trim() || null,
        locations: scheduleDay.locations.map(
          (location, locationIndex): ChampionshipBracketLocationInput => ({
            location_key: location.id,
            name: location.name,
            position: locationIndex + 1,
            courts: location.courts.map((court, courtIndex) => ({
              court_key: court.id,
              name: court.name,
              position: courtIndex + 1,
              sport_ids: court.sport_ids,
              sport_match_targets: court.sport_match_targets.map((target) => ({
                sport_id: target.sport_id,
                planned_match_count: target.planned_match_count,
              })),
              sport_preference:
                court.sport_preference != null &&
                court.sport_ids.includes(
                  court.sport_preference.preferred_sport_id,
                )
                  ? {
                      preferred_sport_id:
                        court.sport_preference.preferred_sport_id,

                      preferred_naipe: court.sport_preference.preferred_naipe,

                      preferred_division:
                        seasonSettings.division_format ==
                        ChampionshipSeasonDivisionFormat.SEPARATED
                          ? court.sport_preference.preferred_division
                          : null,

                      sequence_mode:
                        court.sport_preference.sequence_mode ?? "FLEXIBLE",
                    }
                  : null,
            })),
          }),
        ),
      }));
    }, [scheduleDays, seasonSettings.division_format]);

  const resolveSetupPayload =
    useCallback((): ChampionshipBracketSetupFormValues => {
      return ChampionshipBracketSetupDTO.fromFormValues({
        season_settings: seasonSettings,
        enabled_sport_ids: enabledSportIds,
        participants: resolveParticipantsPayload(),
        competitions: resolveCompetitionsPayload(),
        schedule_days: resolveScheduleDaysPayload(),
        schedule_periods: schedulePeriods,
        competition_period_availability: competitionPeriodAvailability,
        team_competition_availability: teamCompetitionAvailability,
        individual_event_configs: individualEventConfigs,
        individual_session_configs: individualSessionConfigs,
        resource_locks: resourceLocks,
        match_numbering_mode: matchNumberingMode,
        knockout_program_blocks: knockoutProgramBlocks.map(
          (programBlock, programBlockIndex) => ({
            ...programBlock,
            display_order: programBlockIndex + 1,
          }),
        ),
      }).bindToSave();
    }, [
      competitionPeriodAvailability,
      enabledSportIds,
      individualEventConfigs,
      individualSessionConfigs,
      knockoutProgramBlocks,
      matchNumberingMode,
      resourceLocks,
      seasonSettings,
      resolveCompetitionsPayload,
      resolveParticipantsPayload,
      resolveScheduleDaysPayload,
      schedulePeriods,
      teamCompetitionAvailability,
    ]);

  const loadOperationalPreview = useCallback(async () => {
    setLoadingOperationalPreview(true);
    setOperationalPreviewError(null);

    try {
      const payload = resolveSetupPayload();

      const response = await previewChampionshipBracketGroups(
        selectedChampionship.id,
        payload,
      );

      if (response.error) {
        throw response.error;
      }

      if (!response.data) {
        throw new Error(
          "A prévia operacional não retornou dados do chaveamento.",
        );
      }

      if (!response.data.ok) {
        throw new Error(
          response.data.message ||
            "Não foi possível calcular a prévia operacional do chaveamento.",
        );
      }

      setOperationalPreview(response.data);
    } catch (error) {
      setOperationalPreview(null);

      setOperationalPreviewError(
        error instanceof Error
          ? error.message
          : "Não foi possível calcular a prévia operacional do chaveamento.",
      );
    } finally {
      setLoadingOperationalPreview(false);
    }
  }, [resolveSetupPayload, selectedChampionship.id]);

  useEffect(() => {
    if (currentStepIndex != 12) {
      operationalPreviewStepRequestStartedRef.current = false;
      return;
    }

    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    if (operationalPreviewStepRequestStartedRef.current) {
      return;
    }

    setOperationalPreviewError(null);
    setOperationalPreview(null);

    const previewTimer = window.setTimeout(() => {
      if (operationalPreviewStepRequestStartedRef.current) {
        return;
      }

      operationalPreviewStepRequestStartedRef.current = true;

      void loadOperationalPreview();
    }, 250);

    return () => {
      window.clearTimeout(previewTimer);
    };
  }, [
    currentStepIndex,
    hasResolvedInitialDraftSnapshot,
    loadOperationalPreview,
  ]);

  const persistBeachSoccerEstimatedStartTimeSetting = useCallback(async () => {
    const beachSoccerChampionshipSports = championshipSports.filter(
      (championshipSport) =>
        resolveNormalizedSportName(championshipSport.sports?.name ?? "") ==
        NORMALIZED_BEACH_SOCCER_NAME,
    );

    for (const championshipSport of beachSoccerChampionshipSports) {
      const nextShowEstimatedStartTimeOnCards =
        showEstimatedStartTimeOnCardsBySportId[championshipSport.sport_id] ??
        championshipSport.show_estimated_start_time_on_cards;

      const { error } = await supabase
        .from("championship_sports")
        .update({
          show_estimated_start_time_on_cards: nextShowEstimatedStartTimeOnCards,
        })
        .eq("id", championshipSport.id);

      if (error) {
        throw new Error(
          error.message ||
            "Não foi possível salvar a configuração de horário estimado do Beach Soccer.",
        );
      }
    }
  }, [championshipSports, showEstimatedStartTimeOnCardsBySportId]);

  const handleSave = async () => {
    if (!validateCurrentStep()) {
      return;
    }

    setSaving(true);
    setSaveErrorBannerData(null);
    const payload = resolveSetupPayload();

    try {
      await persistBeachSoccerEstimatedStartTimeSetting();
      const seasonSettingsSaveResponse = await saveChampionshipSeasonSettings({
        championship_id: selectedChampionship.id,
        season_year: selectedChampionship.current_season_year,
        division_format: seasonSettings.division_format,
        division_settlement_mode: seasonSettings.division_settlement_mode,
        principal_slots_count: seasonSettings.principal_slots_count,
        principal_relegation_count: seasonSettings.principal_relegation_count,
        access_promotion_count: seasonSettings.access_promotion_count,
      });

      if (seasonSettingsSaveResponse.error) {
        throw new Error(
          seasonSettingsSaveResponse.error.message ||
            "Não foi possível salvar a configuração sazonal do campeonato.",
        );
      }

      const response = await generateChampionshipBracketGroups(
        selectedChampionship.id,
        payload,
      );

      if (response.error || !response.data) {
        throw new Error(
          response.error?.message ??
            "Não foi possível gerar os grupos automaticamente.",
        );
      }

      if (selectedChampionship.code == ChampionshipCode.INTERLAJE) {
        const [eventsSyncResponse, sessionsSyncResponse] = await Promise.all([
          syncChampionshipIndividualEventsFromSetup(
            selectedChampionship.id,
            selectedChampionship.current_season_year,
          ),
          syncChampionshipIndividualSessionsFromSetup(
            selectedChampionship.id,
            selectedChampionship.current_season_year,
          ),
        ]);

        if (eventsSyncResponse.error || sessionsSyncResponse.error) {
          throw new Error(
            eventsSyncResponse.error?.message ??
              sessionsSyncResponse.error?.message ??
              "Não foi possível sincronizar as sessões individuais do campeonato.",
          );
        }
      }

      clearChampionshipBracketWizardDraft(selectedChampionship.id);
      await writeWorkflowLog({
        actionType: "INSERT",
        stepIndex: currentStepIndex,
        description: "Configuração do campeonato concluída e chave gerada.",
        workflowAction: "BRACKET_GENERATED",
      });
      await onGenerated();
      toast.success("Grupos e jogos da fase de grupos gerados com sucesso.");
    } catch (error) {
      const resolvedMessage =
        error instanceof Error
          ? error.message
          : "Erro inesperado ao criar campeonato.";
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

  const updateScheduleDay = useCallback(
    (
      scheduleDayId: string,
      updater: (scheduleDay: ScheduleDayFormValue) => ScheduleDayFormValue,
    ) => {
      setScheduleDays((currentScheduleDays) => {
        const scheduleDayIndex = currentScheduleDays.findIndex(
          (item) => item.id == scheduleDayId,
        );

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
    },
    [],
  );

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

  const updateSchedulePeriodAvailability = useCallback(
    (date: string, period: ChampionshipSchedulePeriod, enabled: boolean) => {
      setSchedulePeriods((currentSchedulePeriods) =>
        currentSchedulePeriods.map((schedulePeriod) => {
          if (schedulePeriod.date != date || schedulePeriod.period != period) {
            return schedulePeriod;
          }

          return {
            ...schedulePeriod,
            enabled,
          };
        }),
      );
    },
    [],
  );

  const updateCompetitionPeriodAvailability = useCallback(
    (
      competitionKey: string,
      date: string,
      period: ChampionshipSchedulePeriod,
      enabled: boolean,
    ) => {
      setCompetitionPeriodAvailability((currentCompetitionPeriodAvailability) =>
        currentCompetitionPeriodAvailability.map((availabilityItem) => {
          if (
            availabilityItem.competition_key != competitionKey ||
            availabilityItem.date != date ||
            availabilityItem.period != period
          ) {
            return availabilityItem;
          }

          return {
            ...availabilityItem,
            enabled,
          };
        }),
      );
    },
    [],
  );

  const updateCompetitionAvailabilityForAllPeriods = useCallback(
    (competitionKey: string, enabled: boolean) => {
      setCompetitionPeriodAvailability((currentCompetitionPeriodAvailability) =>
        currentCompetitionPeriodAvailability.map((availabilityItem) => {
          if (availabilityItem.competition_key != competitionKey) {
            return availabilityItem;
          }

          return {
            ...availabilityItem,
            enabled,
          };
        }),
      );
    },
    [],
  );

  const updateIndividualEventConfig = useCallback(
    (
      sportId: string,
      updater: (
        configItem: ChampionshipBracketWizardDraftFormValues["individual_event_configs"][number],
      ) => ChampionshipBracketWizardDraftFormValues["individual_event_configs"][number],
    ) => {
      setIndividualEventConfigs((currentIndividualEventConfigs) =>
        currentIndividualEventConfigs.map((configItem) => {
          if (configItem.sport_id != sportId) {
            return configItem;
          }

          return updater(configItem);
        }),
      );
    },
    [],
  );

  const updateIndividualEventPlacementsCount = useCallback(
    (sportId: string, placementsCount: number) => {
      updateIndividualEventConfig(
        sportId,
        (configItem) =>
          sanitizeIndividualEventConfigsValues({
            individualSports: [{ sport_id: sportId }],
            individualEventConfigs: [
              {
                ...configItem,
                placements_count: Math.max(1, Math.trunc(placementsCount)),
              },
            ],
          })[0],
      );
    },
    [updateIndividualEventConfig],
  );

  const updateIndividualEventPlacementPoints = useCallback(
    (sportId: string, placement: number, points: number | null) => {
      updateIndividualEventConfig(sportId, (configItem) => ({
        ...configItem,
        placement_points: configItem.placement_points.map((placementPoint) =>
          placementPoint.placement == placement
            ? {
                ...placementPoint,
                points,
              }
            : placementPoint,
        ),
      }));
    },
    [updateIndividualEventConfig],
  );

  const updateIndividualEventRelayMultiplier = useCallback(
    (sportId: string, relayMultiplier: number) => {
      updateIndividualEventConfig(sportId, (configItem) => ({
        ...configItem,
        relay_multiplier: relayMultiplier,
      }));
    },
    [updateIndividualEventConfig],
  );

  const updateIndividualSessionConfig = useCallback(
    (
      sessionKey: string,
      changes: Partial<
        ChampionshipBracketWizardDraftFormValues["individual_session_configs"][number]
      >,
    ) => {
      setIndividualSessionConfigs((currentIndividualSessionConfigs) =>
        currentIndividualSessionConfigs.map((sessionConfig) => {
          if (resolveIndividualSessionConfigKey(sessionConfig) != sessionKey) {
            return sessionConfig;
          }

          return {
            ...sessionConfig,
            ...changes,
          };
        }),
      );
    },
    [],
  );

  const handleSelectLocationTemplateForDay = useCallback(
    (scheduleDayId: string, locationTemplateId: string) => {
      const locationTemplate = locationTemplateById[locationTemplateId];

      if (!locationTemplate) {
        return;
      }

      updateScheduleDay(scheduleDayId, (scheduleDay) => {
        if (
          scheduleDay.locations.some(
            (location) => location.location_template_id == locationTemplateId,
          )
        ) {
          return scheduleDay;
        }

        return {
          ...scheduleDay,
          locations: [
            ...scheduleDay.locations,
            resolveScheduleLocationFromTemplate(
              locationTemplate,
              resolveRandomUuid(),
              scheduleDay.locations.length + 1,
            ),
          ],
        };
      });
      setLocationTemplateSelectionDayId(
        (currentLocationTemplateSelectionDayId) => {
          return currentLocationTemplateSelectionDayId == scheduleDayId
            ? null
            : currentLocationTemplateSelectionDayId;
        },
      );
    },
    [locationTemplateById, updateScheduleDay],
  );

  const handleOpenLocationTemplateSelectionModal = useCallback(
    (scheduleDayId: string) => {
      setLocationTemplateSelectionDayId(scheduleDayId);
    },
    [],
  );

  const handleCloseLocationTemplateSelectionModal = useCallback(() => {
    setLocationTemplateSelectionDayId(null);
  }, []);

  const handleOpenCreateLocationTemplateModal = useCallback(
    (scheduleDayId: string) => {
      setLocationTemplateSelectionDayId(null);
      setLocationTemplateModalTarget({
        schedule_day_id: scheduleDayId,
        location_id: null,
        location_template_id: null,
      });
      setLocationTemplateModalFormValues(
        resolveInitialLocationTemplateModalFormValue(),
      );
      setLocationTemplateModalOpen(true);
    },
    [],
  );

  const handleOpenEditLocationTemplateModal = useCallback(
    (scheduleDayId: string, scheduleLocation: ScheduleLocationFormValue) => {
      const locationTemplate =
        scheduleLocation.location_template_id != null
          ? (locationTemplateById[scheduleLocation.location_template_id] ??
            null)
          : null;

      setLocationTemplateModalTarget({
        schedule_day_id: scheduleDayId,
        location_id: scheduleLocation.id,
        location_template_id: scheduleLocation.location_template_id,
      });
      setLocationTemplateModalFormValues(
        locationTemplate
          ? resolveLocationTemplateModalFormValueFromTemplate(locationTemplate)
          : resolveLocationTemplateModalFormValueFromScheduleLocation(
              scheduleLocation,
            ),
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
    setLocationTemplateModalFormValues(
      resolveInitialLocationTemplateModalFormValue(),
    );
  }, [savingLocationTemplate]);

  const handleSaveLocationTemplate = useCallback(async () => {
    const normalizedLocationName = locationTemplateModalFormValues.name.trim();

    if (!normalizedLocationName) {
      toast.error("Informe o nome do local.");
      return;
    }

    if (locationTemplateModalFormValues.courts.length == 0) {
      toast.error("O local precisa ter ao menos um recurso/quadra.");
      return;
    }

    for (const court of locationTemplateModalFormValues.courts) {
      if (!court.name.trim()) {
        toast.error("Todo recurso/quadra precisa ter um nome.");
        return;
      }

      if (court.sport_ids.length == 0) {
        toast.error(
          "Todo recurso/quadra precisa ter ao menos uma modalidade vinculada.",
        );
        return;
      }
    }

    setSavingLocationTemplate(true);

    const payload: ChampionshipBracketLocationTemplateSaveInput = {
      id: locationTemplateModalFormValues.id,
      name: normalizedLocationName,
      courts: locationTemplateModalFormValues.courts.map(
        (court, courtIndex) => ({
          id: court.id,
          name: court.name.trim(),
          position: courtIndex + 1,
          sport_ids: [...new Set(court.sport_ids)],
        }),
      ),
    };
    const saveResponse = await saveChampionshipBracketLocationTemplate(payload);

    if (saveResponse.error || !saveResponse.data) {
      toast.error(
        saveResponse.error?.message ??
          "Não foi possível salvar o local no catálogo.",
      );
      setSavingLocationTemplate(false);
      return;
    }

    const locationTemplatesResponse =
      await fetchChampionshipBracketLocationTemplates();

    if (locationTemplatesResponse.error) {
      toast.error(
        locationTemplatesResponse.error.message ||
          "O local foi salvo, mas não foi possível recarregar o catálogo.",
      );
      setSavingLocationTemplate(false);
      return;
    }

    const savedLocationTemplates = locationTemplatesResponse.data;
    const savedLocationTemplate =
      savedLocationTemplates.find(
        (locationTemplate) => locationTemplate.id == saveResponse.data,
      ) ?? null;

    if (!savedLocationTemplate) {
      toast.error(
        "O local foi salvo, mas não foi possível encontrá-lo no catálogo.",
      );
      setSavingLocationTemplate(false);
      return;
    }

    setLocationTemplates(savedLocationTemplates);
    setScheduleDays((currentScheduleDays) => {
      return currentScheduleDays.map((scheduleDay) => {
        const nextLocations = scheduleDay.locations.map(
          (scheduleLocation, locationIndex) => {
            const shouldSyncByTemplateId =
              locationTemplateModalTarget?.location_template_id != null &&
              scheduleLocation.location_template_id ==
                locationTemplateModalTarget.location_template_id;
            const shouldSyncBySavedTemplateId =
              scheduleLocation.location_template_id == savedLocationTemplate.id;
            const isTargetLocation =
              locationTemplateModalTarget?.schedule_day_id == scheduleDay.id &&
              locationTemplateModalTarget.location_id != null &&
              scheduleLocation.id == locationTemplateModalTarget.location_id;

            if (
              !shouldSyncByTemplateId &&
              !shouldSyncBySavedTemplateId &&
              !isTargetLocation
            ) {
              return scheduleLocation;
            }

            return resolveScheduleLocationFromTemplate(
              savedLocationTemplate,
              scheduleLocation.id,
              locationIndex + 1,
            );
          },
        );

        if (
          locationTemplateModalTarget?.schedule_day_id == scheduleDay.id &&
          locationTemplateModalTarget.location_id == null &&
          !nextLocations.some(
            (scheduleLocation) =>
              scheduleLocation.location_template_id == savedLocationTemplate.id,
          )
        ) {
          nextLocations.push(
            resolveScheduleLocationFromTemplate(
              savedLocationTemplate,
              resolveRandomUuid(),
              nextLocations.length + 1,
            ),
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
    setLocationTemplateModalFormValues(
      resolveInitialLocationTemplateModalFormValue(),
    );
    setLocationTemplateSelectionDayId(null);
    toast.success("Local salvo no catálogo.");
  }, [locationTemplateModalFormValues, locationTemplateModalTarget]);

  const updateLocationTemplateModalCourt = useCallback(
    (
      courtId: string,
      updater: (
        court: ScheduleCourtFormValue,
        courtIndex: number,
      ) => ScheduleCourtFormValue,
    ) => {
      setLocationTemplateModalFormValues(
        (currentLocationTemplateModalFormValues) => {
          const courtIndex =
            currentLocationTemplateModalFormValues.courts.findIndex(
              (court) => court.id == courtId,
            );

          if (courtIndex < 0) {
            return currentLocationTemplateModalFormValues;
          }

          const currentCourt =
            currentLocationTemplateModalFormValues.courts[courtIndex];
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
        },
      );
    },
    [],
  );

  const handleAddLocationTemplateModalCourt = useCallback(() => {
    setLocationTemplateModalFormValues(
      (currentLocationTemplateModalFormValues) => ({
        ...currentLocationTemplateModalFormValues,
        courts: [
          ...currentLocationTemplateModalFormValues.courts,
          {
            ...resolveInitialScheduleCourt(),
            position: currentLocationTemplateModalFormValues.courts.length + 1,
          },
        ],
      }),
    );
  }, []);

  const handleRemoveLocationTemplateModalCourt = useCallback(
    (courtId: string) => {
      setLocationTemplateModalFormValues(
        (currentLocationTemplateModalFormValues) => {
          const nextCourts = currentLocationTemplateModalFormValues.courts
            .filter((court) => court.id != courtId)
            .map((court, courtIndex) => ({
              ...court,
              position: courtIndex + 1,
            }));

          if (
            nextCourts.length ==
            currentLocationTemplateModalFormValues.courts.length
          ) {
            return currentLocationTemplateModalFormValues;
          }

          return {
            ...currentLocationTemplateModalFormValues,
            courts: nextCourts,
          };
        },
      );
    },
    [],
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
      const previousScheduleDay =
        currentScheduleDays[currentScheduleDays.length - 1];

      if (shouldReplicatePreviousScheduleDay && previousScheduleDay) {
        return [
          ...currentScheduleDays,
          resolveReplicatedScheduleDay(previousScheduleDay),
        ];
      }

      return [...currentScheduleDays, resolveInitialScheduleDay()];
    });
  }, [shouldReplicatePreviousScheduleDay]);

  const availableLocationTemplatesByScheduleDayId = useMemo(() => {
    return scheduleDays.reduce<
      Record<string, ChampionshipBracketLocationTemplate[]>
    >((carry, scheduleDay) => {
      const selectedTemplateIdSet = new Set(
        scheduleDay.locations
          .map((location) => location.location_template_id)
          .filter((locationTemplateId): locationTemplateId is string =>
            Boolean(locationTemplateId),
          ),
      );

      carry[scheduleDay.id] = locationTemplates.filter(
        (locationTemplate) => !selectedTemplateIdSet.has(locationTemplate.id),
      );
      return carry;
    }, {});
  }, [locationTemplates, scheduleDays]);

  const selectedLocationTemplateScheduleDay = useMemo(() => {
    if (locationTemplateSelectionDayId == null) {
      return null;
    }

    return (
      scheduleDays.find(
        (scheduleDay) => scheduleDay.id == locationTemplateSelectionDayId,
      ) ?? null
    );
  }, [locationTemplateSelectionDayId, scheduleDays]);

  const availableLocationTemplatesForSelection = useMemo(() => {
    if (locationTemplateSelectionDayId == null) {
      return [];
    }

    return (
      availableLocationTemplatesByScheduleDayId[
        locationTemplateSelectionDayId
      ] ?? []
    );
  }, [
    availableLocationTemplatesByScheduleDayId,
    locationTemplateSelectionDayId,
  ]);

  const reviewScheduleDaySummaries = useMemo(() => {
    return scheduleDays.map((scheduleDay, scheduleDayIndex) => {
      const totalCourts = scheduleDay.locations.reduce(
        (carry, location) => carry + location.courts.length,
        0,
      );

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
      Record<
        string,
        { group_number: number; teams: { id: string; name: string }[] }[]
      >
    >((carry, competitionKey) => {
      const groupEditorColumns =
        competitionGroupEditorColumnsByCompetitionKey[competitionKey] ?? [];

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
  }, [
    activeCompetitionKeys,
    competitionGroupEditorColumnsByCompetitionKey,
    teamNameById,
  ]);

  const activeErrorBannerData = saveErrorBannerData;
  const shouldAllowDismissActiveErrorBanner = true;
  const isCreateButtonDisabled = saving;
  const isEditingLocationTemplate =
    locationTemplateModalTarget?.location_template_id != null ||
    locationTemplateModalTarget?.location_id != null;
  const activeCompetitionOptions = useMemo(() => {
    return sortedActiveCompetitionKeys
      .map(
        (competitionKey) => competitionOptionsByKey.get(competitionKey) ?? null,
      )
      .filter(
        (
          competitionOption,
        ): competitionOption is ChampionshipBracketWizardCompetitionOption =>
          competitionOption != null,
      );
  }, [competitionOptionsByKey, sortedActiveCompetitionKeys]);

  const competitionLabelByKey = useMemo(() => {
    return activeCompetitionOptions.reduce<Record<string, string>>(
      (carry, competitionOption) => {
        const divisionSuffix = competitionOption.division
          ? ` • ${TEAM_DIVISION_LABELS[competitionOption.division]}`
          : "";

        carry[competitionOption.key] =
          `${competitionOption.sport_name} • ${MATCH_NAIPE_LABELS[competitionOption.naipe]}${divisionSuffix}`;
        return carry;
      },
      {},
    );
  }, [activeCompetitionOptions]);

  const teamAvailabilityFilterOptions = useMemo(() => {
    return Object.keys(teamCompetitionKeysByTeamId)
      .map((teamId) => ({
        team_id: teamId,
        team_name: teamNameById[teamId] ?? "Atlética",
      }))
      .sort((left, right) => left.team_name.localeCompare(right.team_name));
  }, [teamCompetitionKeysByTeamId, teamNameById]);

  const teamDateAvailabilityCards = useMemo(() => {
    return Object.entries(teamCompetitionKeysByTeamId)
      .map(([teamId, competitionKeys]) => {
        const sportCardByKey = new Map<
          string,
          {
            team_sport_key: string;
            sport_id: string;
            sport_name: string;
            tabs: Array<{
              competition_key: string;
              naipe: MatchNaipe;
              label: string;
              eligible_date_count: number;
              available_date_count: number;
              custom_date_count: number;
              unavailable_date_count: number;
              all_dates_full_day: boolean;
              all_dates_unavailable: boolean;
              visible_date_cards: Array<{
                date: string;
                availability_key: string;
                competition_mode: "UNAVAILABLE" | "FULL_DAY" | "CUSTOM";
                competition_windows: Array<{
                  start_time: string;
                  end_time: string;
                }>;
                team_mode: "UNAVAILABLE" | "FULL_DAY" | "CUSTOM";
                team_windows: Array<{
                  start_time: string;
                  end_time: string;
                }>;
              }>;
            }>;
          }
        >();

        competitionKeys.forEach((competitionKey) => {
          const competitionOption = competitionOptionsByKey.get(competitionKey);

          if (!competitionOption) {
            return;
          }

          const visibleDateCards =
            scheduleDayDatesOrderedByColumn.flatMap((scheduleDate) => {
              const competitionAvailability =
                competitionDateAvailabilityByKey.get(
                  `${competitionKey}::${scheduleDate}`,
                );

              if (
                !competitionAvailability ||
                competitionAvailability.mode == "UNAVAILABLE"
              ) {
                return [];
              }

              const availabilityKey =
                `${teamId}::${competitionKey}::${scheduleDate}`;

              const teamAvailability =
                teamCompetitionDateAvailabilityByKey.get(availabilityKey);

              return [
                {
                  date: scheduleDate,
                  availability_key: availabilityKey,
                  competition_mode: competitionAvailability.mode,
                  competition_windows: competitionAvailability.windows.map(
                    (window) => ({
                      start_time: window.start_time,
                      end_time: window.end_time,
                    }),
                  ),
                  team_mode: teamAvailability?.mode ?? "FULL_DAY",
                  team_windows:
                    teamAvailability?.windows.map((window) => ({
                      start_time: window.start_time,
                      end_time: window.end_time,
                    })) ?? [],
                },
              ];
            });

          const eligibleDateCount = visibleDateCards.length;
          const availableDateCount = visibleDateCards.filter(
            (dateCard) => dateCard.team_mode != "UNAVAILABLE",
          ).length;
          const customDateCount = visibleDateCards.filter(
            (dateCard) => dateCard.team_mode == "CUSTOM",
          ).length;
          const unavailableDateCount = visibleDateCards.filter(
            (dateCard) => dateCard.team_mode == "UNAVAILABLE",
          ).length;

          const teamSportKey = `${teamId}::${competitionOption.sport_id}`;
          const currentSportCard = sportCardByKey.get(teamSportKey);
          const tabItem = {
            competition_key: competitionKey,
            naipe: competitionOption.naipe,
            label: MATCH_NAIPE_LABELS[competitionOption.naipe],
            eligible_date_count: eligibleDateCount,
            available_date_count: availableDateCount,
            custom_date_count: customDateCount,
            unavailable_date_count: unavailableDateCount,
            all_dates_full_day:
              eligibleDateCount > 0 &&
              visibleDateCards.every(
                (dateCard) => dateCard.team_mode == "FULL_DAY",
              ),
            all_dates_unavailable:
              eligibleDateCount > 0 &&
              visibleDateCards.every(
                (dateCard) => dateCard.team_mode == "UNAVAILABLE",
              ),
            visible_date_cards: visibleDateCards,
          };

          if (!currentSportCard) {
            sportCardByKey.set(teamSportKey, {
              team_sport_key: teamSportKey,
              sport_id: competitionOption.sport_id,
              sport_name: competitionOption.sport_name,
              tabs: [tabItem],
            });
            return;
          }

          currentSportCard.tabs.push(tabItem);
        });

        const sportCards = [...sportCardByKey.values()]
          .map((sportCard) => ({
            ...sportCard,
            tabs: [...sportCard.tabs].sort(
              (left, right) =>
                WIZARD_NAIPE_TAB_DEFAULT_ORDER.indexOf(left.naipe) -
                WIZARD_NAIPE_TAB_DEFAULT_ORDER.indexOf(right.naipe),
            ),
          }))
          .sort((left, right) =>
            left.sport_name.localeCompare(right.sport_name, "pt-BR", {
              sensitivity: "base",
            }),
          );

        return {
          team_id: teamId,
          team_name: teamNameById[teamId] ?? "Atlética",
          sport_cards: sportCards,
        };
      })
      .filter((teamAvailabilityCard) => teamAvailabilityCard.sport_cards.length > 0)
      .sort((left, right) =>
        left.team_name.localeCompare(right.team_name, "pt-BR", {
          sensitivity: "base",
        }),
      );
  }, [
    competitionDateAvailabilityByKey,
    competitionOptionsByKey,
    scheduleDayDatesOrderedByColumn,
    teamCompetitionDateAvailabilityByKey,
    teamCompetitionKeysByTeamId,
    teamNameById,
  ]);

  const filteredTeamDateAvailabilityCards = useMemo(() => {
    const normalizedSearchTerm =
      teamAvailabilitySearchTerm.trim().toLocaleLowerCase();

    return teamDateAvailabilityCards.filter((teamAvailabilityCard) => {
      if (
        selectedTeamAvailabilityFilterValue != ALL_TEAMS_FILTER_VALUE &&
        teamAvailabilityCard.team_id != selectedTeamAvailabilityFilterValue
      ) {
        return false;
      }

      if (!normalizedSearchTerm) {
        return true;
      }

      return teamAvailabilityCard.team_name
        .toLocaleLowerCase()
        .includes(normalizedSearchTerm);
    });
  }, [
    selectedTeamAvailabilityFilterValue,
    teamAvailabilitySearchTerm,
    teamDateAvailabilityCards,
  ]);

  useEffect(() => {
    setActiveTeamAvailabilityNaipeTabByTeamSportKey(
      (currentActiveTeamAvailabilityNaipeTabByTeamSportKey) => {
        const nextActiveTeamAvailabilityNaipeTabByTeamSportKey =
          teamDateAvailabilityCards.reduce<Record<string, MatchNaipe>>(
            (carry, teamAvailabilityCard) => {
              teamAvailabilityCard.sport_cards.forEach((sportCard) => {
                const supportedNaipes = sportCard.tabs.map((tab) => tab.naipe);
                const currentActiveNaipe =
                  currentActiveTeamAvailabilityNaipeTabByTeamSportKey[
                    sportCard.team_sport_key
                  ];

                if (
                  currentActiveNaipe &&
                  supportedNaipes.includes(currentActiveNaipe)
                ) {
                  carry[sportCard.team_sport_key] = currentActiveNaipe;
                  return;
                }

                const defaultNaipe =
                  resolveDefaultWizardNaipeTabValue(supportedNaipes);

                if (defaultNaipe) {
                  carry[sportCard.team_sport_key] = defaultNaipe;
                }
              });

              return carry;
            },
            {},
          );

        const currentKeys = Object.keys(
          currentActiveTeamAvailabilityNaipeTabByTeamSportKey,
        );
        const nextKeys = Object.keys(
          nextActiveTeamAvailabilityNaipeTabByTeamSportKey,
        );

        if (
          currentKeys.length == nextKeys.length &&
          nextKeys.every(
            (teamSportKey) =>
              currentActiveTeamAvailabilityNaipeTabByTeamSportKey[
                teamSportKey
              ] ==
              nextActiveTeamAvailabilityNaipeTabByTeamSportKey[teamSportKey],
          )
        ) {
          return currentActiveTeamAvailabilityNaipeTabByTeamSportKey;
        }

        return nextActiveTeamAvailabilityNaipeTabByTeamSportKey;
      },
    );
  }, [teamDateAvailabilityCards]);

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    setKnockoutProgramBlocks((currentKnockoutProgramBlocks) => {
      const nextKnockoutProgramBlocks = sanitizeKnockoutProgramBlocksValues({
        schedulePeriods,
        seasonSettings,
        collectiveCompetitionOptions: activeCompetitionOptions,
        knockoutProgramBlocks: currentKnockoutProgramBlocks,
      });

      if (
        JSON.stringify(nextKnockoutProgramBlocks) ==
        JSON.stringify(currentKnockoutProgramBlocks)
      ) {
        return currentKnockoutProgramBlocks;
      }

      return nextKnockoutProgramBlocks;
    });
  }, [
    activeCompetitionOptions,
    hasResolvedInitialDraftSnapshot,
    schedulePeriods,
    seasonSettings,
  ]);

  const reviewSchedulePeriodEnabledCount = useMemo(() => {
    return schedulePeriods.filter(
      (schedulePeriod) => schedulePeriod.enabled != false,
    ).length;
  }, [schedulePeriods]);

  const reviewCompetitionAvailabilityEnabledCount = useMemo(() => {
    return competitionPeriodAvailability.filter(
      (availabilityItem) => availabilityItem.enabled != false,
    ).length;
  }, [competitionPeriodAvailability]);

  const reviewTeamAvailabilityEnabledCount = useMemo(() => {
    return teamCompetitionAvailability.filter(
      (availabilityItem) => availabilityItem.enabled != false,
    ).length;
  }, [teamCompetitionAvailability]);

  const individualSessionConfigByKey = useMemo(() => {
    return new Map(
      individualSessionConfigs.map((sessionConfig) => [
        resolveIndividualSessionConfigKey(sessionConfig),
        sessionConfig,
      ]),
    );
  }, [individualSessionConfigs]);

  const reviewEnabledSportSummaries = useMemo(() => {
    return enabledChampionshipSports
      .map((championshipSport) => ({
        key: championshipSport.sport_id,
        name: championshipSport.sports?.name ?? "Modalidade",
        type: resolveIsIndividualSportName(championshipSport.sports?.name ?? "")
          ? "Individual"
          : "Coletiva",
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [enabledChampionshipSports]);

  const reviewIndividualEventConfigSummaries = useMemo(() => {
    return selectedIndividualSports.map((individualSport) => {
      const individualConfig =
        individualEventConfigs.find(
          (configItem) => configItem.sport_id == individualSport.sport_id,
        ) ?? null;
      const placementsCount = individualConfig?.placements_count ?? 0;
      const incompletePlacements =
        individualConfig?.placement_points.filter(
          (placementPoint) => placementPoint.points == null,
        ).length ?? placementsCount;

      return {
        key: individualSport.sport_id,
        sport_name: individualSport.sport_name,
        placements_count: placementsCount,
        relay_multiplier: individualConfig?.relay_multiplier ?? 2,
        has_incomplete_points: incompletePlacements > 0,
        points_summary: (individualConfig?.placement_points ?? [])
          .slice(0, 4)
          .map(
            (placementPoint) =>
              `${placementPoint.placement}º=${placementPoint.points ?? "--"}`,
          )
          .join(" • "),
      };
    });
  }, [individualEventConfigs, selectedIndividualSports]);

  const reviewIndividualSessionSummaries = useMemo(() => {
    return selectedIndividualCompetitionOptions.map((competitionOption) => {
      const sessionKey = resolveIndividualSessionConfigKey(competitionOption);
      const sessionConfig =
        individualSessionConfigByKey.get(sessionKey) ?? null;
      const divisionSuffix = competitionOption.division
        ? ` • ${TEAM_DIVISION_LABELS[competitionOption.division]}`
        : "";

      return {
        key: sessionKey,
        label: `${competitionOption.sport_name} • ${
          MATCH_NAIPE_LABELS[competitionOption.naipe]
        }${divisionSuffix}`,
        scheduled_date: sessionConfig?.scheduled_date ?? null,
        period: sessionConfig?.period ?? null,
        resource_label:
          sessionConfig?.location_name && sessionConfig?.court_name
            ? `${sessionConfig.location_name} • ${sessionConfig.court_name}`
            : null,
        exclusive_lock_enabled: sessionConfig?.exclusive_lock_enabled == true,
        has_slot:
          Boolean(sessionConfig?.scheduled_date) &&
          sessionConfig?.period != null &&
          Boolean(sessionConfig?.location_key) &&
          Boolean(sessionConfig?.court_key),
      };
    });
  }, [individualSessionConfigByKey, selectedIndividualCompetitionOptions]);

  const reviewResourceLockSummaries = useMemo(() => {
    return resourceLocks.map((resourceLock) => ({
      key: [
        resourceLock.date,
        resourceLock.period,
        resourceLock.location_key,
        resourceLock.court_key,
      ].join("::"),
      label: `${
        resourceLock.location_name ?? "Local"
      } • ${resourceLock.court_name ?? "Recurso"}`,
      slot_label: `${resolveBrazilianDateString(resourceLock.date)} • ${
        SCHEDULE_PERIOD_LABELS[resourceLock.period]
      }`,
      lock_mode_label:
        resourceLock.lock_mode == "HARD"
          ? "Reserva exclusiva"
          : "Preferência flexível",
    }));
  }, [resourceLocks]);

  const knockoutProgramBlockSummaries = useMemo(() => {
    const sportNameById = activeCompetitionOptions.reduce<
      Record<string, string>
    >((carry, competitionOption) => {
      carry[competitionOption.sport_id] = competitionOption.sport_name;
      return carry;
    }, {});

    return knockoutProgramBlocks.map((programBlock, programBlockIndex) => {
      const divisionLabel =
        programBlock.division_scope == "ALL"
          ? "Todas as divisões"
          : TEAM_DIVISION_LABELS[programBlock.division_scope];

      const naipeLabel = programBlock.naipe_sequence
        .map((naipe) => MATCH_NAIPE_LABELS[naipe])
        .join(" → ");

      const durationLabel =
        programBlock.match_duration_minutes_override == null
          ? "Duração padrão da modalidade"
          : `${programBlock.match_duration_minutes_override} min por final`;

      return {
        key: resolveKnockoutProgramBlockKey(programBlock),
        label: `${sportNameById[programBlock.sport_id] ?? "Modalidade"} • Final`,
        slot_label: `${resolveBrazilianDateString(programBlock.date)} • ${
          SCHEDULE_PERIOD_LABELS[programBlock.period]
        } • ${programBlock.location_name ?? "Local"} • ${
          programBlock.court_name ?? "Quadra"
        }`,
        division_label: divisionLabel,
        naipe_label: naipeLabel,
        duration_label: durationLabel,
        display_order: programBlockIndex + 1,
      };
    });
  }, [activeCompetitionOptions, knockoutProgramBlocks]);

  const reviewDiagnosticItems = useMemo(() => {
    const diagnostics: Array<{
      key: string;
      tone: "amber" | "red";
      title: string;
      description: string;
    }> = [];

    enabledChampionshipSports.forEach((championshipSport) => {
      const hasSelectedParticipant = selectedTeamIds.some((teamId) =>
        (selectedSportIdsByTeamId[teamId] ?? []).includes(
          championshipSport.sport_id,
        ),
      );

      if (!hasSelectedParticipant) {
        diagnostics.push({
          key: `enabled-sport-without-participants-${championshipSport.sport_id}`,
          tone: "amber",
          title: `${championshipSport.sports?.name ?? "Modalidade"} sem participantes`,
          description:
            "A modalidade está habilitada na temporada, mas nenhuma atlética foi vinculada a ela nas etapas seguintes.",
        });
      }
    });

    reviewIndividualEventConfigSummaries.forEach((configSummary) => {
      if (configSummary.has_incomplete_points) {
        diagnostics.push({
          key: `individual-points-incomplete-${configSummary.key}`,
          tone: "red",
          title: `${configSummary.sport_name} com pontuação incompleta`,
          description:
            "Preencha a tabela de pontos de todas as colocações configuradas antes de fechar o setup.",
        });
      }
    });

    reviewIndividualSessionSummaries.forEach((sessionSummary) => {
      if (!sessionSummary.has_slot) {
        diagnostics.push({
          key: `session-without-slot-${sessionSummary.key}`,
          tone: "red",
          title: `${sessionSummary.label} sem slot oficial`,
          description:
            "Defina dia, período e recurso para a sessão individual antes de fechar o setup.",
        });
      }
    });

    const resourceLockCounts = resourceLocks.reduce<Record<string, number>>(
      (carry, resourceLock) => {
        const key = [
          resourceLock.date,
          resourceLock.period,
          resourceLock.location_key,
          resourceLock.court_key,
        ].join("::");
        carry[key] = (carry[key] ?? 0) + 1;
        return carry;
      },
      {},
    );

    Object.entries(resourceLockCounts).forEach(([lockKey, count]) => {
      if (count > 1) {
        const resourceLock = resourceLocks.find(
          (currentResourceLock) =>
            [
              currentResourceLock.date,
              currentResourceLock.period,
              currentResourceLock.location_key,
              currentResourceLock.court_key,
            ].join("::") == lockKey,
        );

        diagnostics.push({
          key: `resource-lock-collision-${lockKey}`,
          tone: "red",
          title: "Reserva de recurso conflitante",
          description: `${
            resourceLock?.location_name ?? "Local"
          } • ${resourceLock?.court_name ?? "Recurso"} aparece reservado ${count} vezes no mesmo dia/período.`,
        });
      }
    });

    const knockoutBlockCounts = knockoutProgramBlocks.reduce<
      Record<string, number>
    >((carry, programBlock) => {
      const key = resolveKnockoutProgramBlockKey(programBlock);

      carry[key] = (carry[key] ?? 0) + 1;

      return carry;
    }, {});

    Object.entries(knockoutBlockCounts).forEach(([blockKey, count]) => {
      if (count <= 1) {
        return;
      }

      const knockoutProgramBlock = knockoutProgramBlocks.find(
        (currentProgramBlock) =>
          resolveKnockoutProgramBlockKey(currentProgramBlock) == blockKey,
      );

      diagnostics.push({
        key: `knockout-block-collision-${blockKey}`,
        tone: "red",
        title: "Bloco manual de final duplicado",
        description: `${knockoutProgramBlock?.location_name ?? "Local"} • ${
          knockoutProgramBlock?.court_name ?? "Quadra"
        } possui ${count} blocos da mesma modalidade e do mesmo escopo de divisão no mesmo dia/período.`,
      });
    });

    knockoutProgramBlocks.forEach((programBlock) => {
      if (programBlock.naipe_sequence.length == 0) {
        diagnostics.push({
          key: `knockout-block-without-naipe-${resolveKnockoutProgramBlockKey(programBlock)}`,
          tone: "red",
          title: "Bloco manual sem naipe configurado",
          description:
            "Toda programação manual de final precisa informar ao menos um naipe na sequência do bloco.",
        });
      }
    });

    const resolveReviewAvailabilityIntervals = (
      scheduleDay: ScheduleDayFormValue,
      mode: "UNAVAILABLE" | "FULL_DAY" | "CUSTOM",
      windows: Array<{
        start_time: string;
        end_time: string;
      }>,
    ) => {
      const dayStartMinutes = resolveTimeValueToMinutes(
        scheduleDay.start_time,
      );
      const dayEndMinutes = resolveTimeValueToMinutes(scheduleDay.end_time);

      if (
        dayStartMinutes == null ||
        dayEndMinutes == null ||
        dayEndMinutes <= dayStartMinutes
      ) {
        return null;
      }

      if (mode == "UNAVAILABLE") {
        return [];
      }

      let intervals: Array<{
        start: number;
        end: number;
      }>;

      if (mode == "FULL_DAY") {
        intervals = [
          {
            start: dayStartMinutes,
            end: dayEndMinutes,
          },
        ];
      } else {
        if (windows.length == 0) {
          return null;
        }

        const parsedIntervals = windows.map((window) => {
          const startMinutes = resolveTimeValueToMinutes(window.start_time);
          const endMinutes = resolveTimeValueToMinutes(window.end_time);

          if (
            startMinutes == null ||
            endMinutes == null ||
            endMinutes <= startMinutes ||
            startMinutes < dayStartMinutes ||
            endMinutes > dayEndMinutes
          ) {
            return null;
          }

          return {
            start: startMinutes,
            end: endMinutes,
          };
        });

        if (parsedIntervals.some((interval) => interval == null)) {
          return null;
        }

        intervals = (
          parsedIntervals as Array<{
            start: number;
            end: number;
          }>
        ).sort((left, right) => left.start - right.start);

        for (
          let intervalIndex = 1;
          intervalIndex < intervals.length;
          intervalIndex += 1
        ) {
          const previousInterval = intervals[intervalIndex - 1];
          const currentInterval = intervals[intervalIndex];

          if (
            previousInterval &&
            currentInterval &&
            currentInterval.start < previousInterval.end
          ) {
            return null;
          }
        }
      }

      const hasBreakStart = scheduleDay.break_start_time.trim() != "";
      const hasBreakEnd = scheduleDay.break_end_time.trim() != "";

      if (!hasBreakStart && !hasBreakEnd) {
        return intervals;
      }

      if (hasBreakStart != hasBreakEnd) {
        return null;
      }

      const breakStartMinutes = resolveTimeValueToMinutes(
        scheduleDay.break_start_time,
      );
      const breakEndMinutes = resolveTimeValueToMinutes(
        scheduleDay.break_end_time,
      );

      if (
        breakStartMinutes == null ||
        breakEndMinutes == null ||
        breakEndMinutes <= breakStartMinutes ||
        breakStartMinutes < dayStartMinutes ||
        breakEndMinutes > dayEndMinutes
      ) {
        return null;
      }

      return intervals.flatMap((interval) => {
        if (
          interval.end <= breakStartMinutes ||
          interval.start >= breakEndMinutes
        ) {
          return [interval];
        }

        const availableIntervals: Array<{
          start: number;
          end: number;
        }> = [];

        if (interval.start < breakStartMinutes) {
          availableIntervals.push({
            start: interval.start,
            end: breakStartMinutes,
          });
        }

        if (interval.end > breakEndMinutes) {
          availableIntervals.push({
            start: breakEndMinutes,
            end: interval.end,
          });
        }

        return availableIntervals;
      });
    };

    sortedActiveCompetitionKeys.forEach((competitionKey) => {
      const hasValidWindow = scheduleDays.some((scheduleDay) => {
        if (!scheduleDay.date) {
          return false;
        }

        const competitionAvailability =
          competitionDateAvailabilityByKey.get(
            `${competitionKey}::${scheduleDay.date}`,
          );

        if (!competitionAvailability) {
          return false;
        }

        const intervals = resolveReviewAvailabilityIntervals(
          scheduleDay,
          competitionAvailability.mode,
          competitionAvailability.windows,
        );

        return intervals != null && intervals.length > 0;
      });

      if (!hasValidWindow) {
        diagnostics.push({
          key: `competition-without-window-${competitionKey}`,
          tone: "red",
          title: `${competitionLabelByKey[competitionKey] ?? "Competição"} sem janela válida`,
          description:
            "Nenhuma janela real de horário ficou disponível para essa competição coletiva.",
        });
      }
    });

    Object.entries(teamCompetitionKeysByTeamId).forEach(
      ([teamId, competitionKeys]) => {
        competitionKeys.forEach((competitionKey) => {
          const hasValidWindow = scheduleDays.some((scheduleDay) => {
            if (!scheduleDay.date) {
              return false;
            }

            const competitionAvailability =
              competitionDateAvailabilityByKey.get(
                `${competitionKey}::${scheduleDay.date}`,
              );

            const teamAvailability =
              teamCompetitionDateAvailabilityByKey.get(
                `${teamId}::${competitionKey}::${scheduleDay.date}`,
              );

            if (!competitionAvailability || !teamAvailability) {
              return false;
            }

            const competitionIntervals = resolveReviewAvailabilityIntervals(
              scheduleDay,
              competitionAvailability.mode,
              competitionAvailability.windows,
            );

            const teamIntervals = resolveReviewAvailabilityIntervals(
              scheduleDay,
              teamAvailability.mode,
              teamAvailability.windows,
            );

            if (competitionIntervals == null || teamIntervals == null) {
              return false;
            }

            return competitionIntervals.some((competitionInterval) =>
              teamIntervals.some((teamInterval) => {
                const intersectionStart = Math.max(
                  competitionInterval.start,
                  teamInterval.start,
                );
                const intersectionEnd = Math.min(
                  competitionInterval.end,
                  teamInterval.end,
                );

                return intersectionEnd > intersectionStart;
              }),
            );
          });

          if (!hasValidWindow) {
            diagnostics.push({
              key: `team-without-window-${teamId}-${competitionKey}`,
              tone: "red",
              title: `${teamNameById[teamId] ?? "Atlética"} sem janela jogável`,
              description: `${
                competitionLabelByKey[competitionKey] ?? "Competição"
              } não tem interseção temporal válida entre agenda, modalidade e restrições da atlética.`,
            });
          }
        });
      },
    );

    return diagnostics;
  }, [
    competitionLabelByKey,
    competitionDateAvailabilityByKey,
    enabledChampionshipSports,
    reviewIndividualEventConfigSummaries,
    resourceLocks,
    reviewIndividualSessionSummaries,
    scheduleDays,
    selectedSportIdsByTeamId,
    selectedTeamIds,
    sortedActiveCompetitionKeys,
    teamCompetitionDateAvailabilityByKey,
    teamCompetitionKeysByTeamId,
    teamNameById,
    knockoutProgramBlocks,
  ]);

  const courtPreferenceStepRows = useMemo(() => {
    const sportConfigurationById = activeCompetitionOptions.reduce<
      Record<
        string,
        {
          sport_id: string;
          sport_name: string;
          naipe_options: MatchNaipe[];
          division_options: TeamDivision[];
        }
      >
    >((carry, competitionOption) => {
      const currentSportConfiguration = carry[competitionOption.sport_id];

      if (!currentSportConfiguration) {
        carry[competitionOption.sport_id] = {
          sport_id: competitionOption.sport_id,
          sport_name: competitionOption.sport_name,
          naipe_options: [competitionOption.naipe],
          division_options:
            competitionOption.division != null
              ? [competitionOption.division]
              : [],
        };

        return carry;
      }

      if (
        !currentSportConfiguration.naipe_options.includes(
          competitionOption.naipe,
        )
      ) {
        currentSportConfiguration.naipe_options = [
          ...currentSportConfiguration.naipe_options,
          competitionOption.naipe,
        ];
      }

      if (
        competitionOption.division != null &&
        !currentSportConfiguration.division_options.includes(
          competitionOption.division,
        )
      ) {
        currentSportConfiguration.division_options = [
          ...currentSportConfiguration.division_options,
          competitionOption.division,
        ];
      }

      return carry;
    }, {});

    return scheduleDays.flatMap((scheduleDay, scheduleDayIndex) => {
      const courtCards = scheduleDay.locations.flatMap((scheduleLocation) =>
        scheduleLocation.courts.flatMap((court) => {
          const sportOptions = court.sport_ids
            .flatMap((sportId) => {
              const sportConfiguration = sportConfigurationById[sportId];

              if (!sportConfiguration) {
                return [];
              }

              return [
                {
                  ...sportConfiguration,

                  naipe_options: [...sportConfiguration.naipe_options],

                  division_options: [...sportConfiguration.division_options],
                },
              ];
            })
            .sort((left, right) =>
              left.sport_name.localeCompare(right.sport_name, "pt-BR", {
                sensitivity: "base",
              }),
            );

          if (sportOptions.length == 0) {
            return [];
          }

          return [
            {
              key: [scheduleDay.id, scheduleLocation.id, court.id].join("::"),

              schedule_day_id: scheduleDay.id,

              location_id: scheduleLocation.id,

              location_name: scheduleLocation.name || "Local sem nome",

              court,
              sport_options: sportOptions,
              planned_match_count: court.sport_match_targets.reduce(
                (total, target) => total + target.planned_match_count,
                0,
              ),
            },
          ];
        }),
      );

      if (courtCards.length == 0) {
        return [];
      }

      return [
        {
          key: `court-preference-day-${scheduleDay.id}`,

          day_label: `Dia ${scheduleDayIndex + 1}`,

          date_label: scheduleDay.date
            ? resolveBrazilianDateString(scheduleDay.date)
            : "Data não informada",

          court_cards: courtCards,
          planned_match_count: courtCards.reduce(
            (total, courtCard) => total + courtCard.planned_match_count,
            0,
          ),
        },
      ];
    });
  }, [activeCompetitionOptions, scheduleDays]);

  const collectiveSportOptions = useMemo(() => {
    return [
      ...new Map(
        activeCompetitionOptions.map((competitionOption) => [
          competitionOption.sport_id,
          {
            sport_id: competitionOption.sport_id,
            sport_name: competitionOption.sport_name,
          },
        ]),
      ).values(),
    ].sort((left, right) =>
      left.sport_name.localeCompare(right.sport_name, "pt-BR", {
        sensitivity: "base",
      }),
    );
  }, [activeCompetitionOptions]);

  const collectiveCompetitionOptionsBySportId = useMemo(() => {
    return activeCompetitionOptions.reduce<
      Record<string, ChampionshipBracketWizardCompetitionOption[]>
    >((carry, competitionOption) => {
      if (!carry[competitionOption.sport_id]) {
        carry[competitionOption.sport_id] = [];
      }

      carry[competitionOption.sport_id].push(competitionOption);
      return carry;
    }, {});
  }, [activeCompetitionOptions]);

  const scheduleLocationOptionsByDate = useMemo(() => {
    return scheduleDays.reduce<
      Record<
        string,
        Array<{
          location_key: string;
          location_name: string;
        }>
      >
    >((carry, scheduleDay) => {
      if (!scheduleDay.date) {
        return carry;
      }

      carry[scheduleDay.date] = scheduleDay.locations.map((location) => ({
        location_key: location.id,
        location_name: location.name,
      }));
      return carry;
    }, {});
  }, [scheduleDays]);

  const resolveKnockoutProgramCourtOptions = useCallback(
    (date: string, locationKey: string) => {
      return (scheduleResourcesByDate[date] ?? []).filter(
        (resource) => resource.location_key == locationKey,
      );
    },
    [scheduleResourcesByDate],
  );

  const updateKnockoutProgramBlock = useCallback(
    (
      targetKey: string,
      updater: (
        programBlock: ChampionshipBracketKnockoutProgramBlockInput,
      ) => ChampionshipBracketKnockoutProgramBlockInput,
    ) => {
      setKnockoutProgramBlocks((currentKnockoutProgramBlocks) =>
        currentKnockoutProgramBlocks.map((programBlock) =>
          resolveKnockoutProgramBlockKey(programBlock) == targetKey
            ? updater(programBlock)
            : programBlock,
        ),
      );
    },
    [],
  );

  const removeKnockoutProgramBlock = useCallback((targetKey: string) => {
    setKnockoutProgramBlocks((currentKnockoutProgramBlocks) =>
      currentKnockoutProgramBlocks
        .filter(
          (programBlock) =>
            resolveKnockoutProgramBlockKey(programBlock) != targetKey,
        )
        .map((programBlock, programBlockIndex) => ({
          ...programBlock,
          display_order: programBlockIndex + 1,
        })),
    );
  }, []);

  const moveKnockoutProgramBlock = useCallback(
    (targetKey: string, direction: -1 | 1) => {
      setKnockoutProgramBlocks((currentKnockoutProgramBlocks) => {
        const currentIndex = currentKnockoutProgramBlocks.findIndex(
          (programBlock) =>
            resolveKnockoutProgramBlockKey(programBlock) == targetKey,
        );

        if (currentIndex < 0) {
          return currentKnockoutProgramBlocks;
        }

        const nextIndex = currentIndex + direction;

        if (nextIndex < 0 || nextIndex >= currentKnockoutProgramBlocks.length) {
          return currentKnockoutProgramBlocks;
        }

        const nextKnockoutProgramBlocks = [...currentKnockoutProgramBlocks];

        const [movedProgramBlock] = nextKnockoutProgramBlocks.splice(
          currentIndex,
          1,
        );

        if (!movedProgramBlock) {
          return currentKnockoutProgramBlocks;
        }

        nextKnockoutProgramBlocks.splice(nextIndex, 0, movedProgramBlock);

        return nextKnockoutProgramBlocks.map(
          (programBlock, programBlockIndex) => ({
            ...programBlock,
            display_order: programBlockIndex + 1,
          }),
        );
      });
    },
    [],
  );

  const addKnockoutProgramBlock = useCallback(() => {
    const firstSchedulePeriod =
      schedulePeriods.find(
        (schedulePeriod) => schedulePeriod.enabled != false,
      ) ??
      schedulePeriods[0] ??
      null;
    const firstSportOption = collectiveSportOptions[0] ?? null;

    if (!firstSchedulePeriod || !firstSportOption) {
      toast.error(
        "Configure ao menos um período de agenda e uma competição coletiva antes de programar finais.",
      );
      return;
    }

    const firstLocationOption =
      scheduleLocationOptionsByDate[firstSchedulePeriod.date]?.[0] ?? null;
    const firstCourtOption = firstLocationOption
      ? (resolveKnockoutProgramCourtOptions(
          firstSchedulePeriod.date,
          firstLocationOption.location_key,
        )[0] ?? null)
      : null;
    const availableCompetitionOptions =
      collectiveCompetitionOptionsBySportId[firstSportOption.sport_id] ?? [];
    const defaultNaipeSequence = [
      ...new Set(
        availableCompetitionOptions.map(
          (competitionOption) => competitionOption.naipe,
        ),
      ),
    ];
    const defaultDivisionScope =
      seasonSettings.division_format == ChampionshipSeasonDivisionFormat.UNIFIED
        ? "ALL"
        : (availableCompetitionOptions[0]?.division ??
          TeamDivision.DIVISAO_PRINCIPAL);

    setKnockoutProgramBlocks((currentKnockoutProgramBlocks) => [
      ...currentKnockoutProgramBlocks,
      {
        date: firstSchedulePeriod.date,
        period: firstSchedulePeriod.period,
        location_key: firstLocationOption?.location_key ?? "",
        court_key: firstCourtOption?.court_key ?? "",
        location_name: firstLocationOption?.location_name ?? null,
        court_name: firstCourtOption?.court_name ?? null,
        sport_id: firstSportOption.sport_id,
        phase: "FINAL",
        division_scope: defaultDivisionScope,
        naipe_sequence: defaultNaipeSequence,
        match_duration_minutes_override: null,
        display_order: currentKnockoutProgramBlocks.length + 1,
      },
    ]);
  }, [
    collectiveCompetitionOptionsBySportId,
    collectiveSportOptions,
    resolveKnockoutProgramCourtOptions,
    scheduleLocationOptionsByDate,
    schedulePeriods,
    seasonSettings.division_format,
  ]);

  const updateCourtSportPreference = useCallback(
    (
      scheduleDayId: string,
      locationId: string,
      courtId: string,
      preferredSportId: string | null,
      patch: Partial<
        Omit<ChampionshipBracketCourtSportPreferenceInput, "preferred_sport_id">
      > = {},
    ) => {
      updateScheduleDay(scheduleDayId, (scheduleDay) => ({
        ...scheduleDay,

        locations: scheduleDay.locations.map((scheduleLocation) => {
          if (scheduleLocation.id != locationId) {
            return scheduleLocation;
          }

          return {
            ...scheduleLocation,

            courts: scheduleLocation.courts.map((court) => {
              if (court.id != courtId) {
                return court;
              }

              if (preferredSportId == null) {
                return {
                  ...court,
                  sport_preference: null,
                };
              }

              const currentPreference =
                court.sport_preference?.preferred_sport_id == preferredSportId
                  ? court.sport_preference
                  : null;

              const nextSequenceMode =
                patch.sequence_mode ??
                currentPreference?.sequence_mode ??
                "FLEXIBLE";

              let nextPreferredNaipe =
                patch.preferred_naipe !== undefined
                  ? patch.preferred_naipe
                  : (currentPreference?.preferred_naipe ?? null);

              let nextPreferredDivision =
                patch.preferred_division !== undefined
                  ? patch.preferred_division
                  : (currentPreference?.preferred_division ?? null);

              if (nextSequenceMode == "GROUP_NAIPE") {
                nextPreferredDivision = null;
              }

              if (nextSequenceMode == "GROUP_DIVISION") {
                nextPreferredNaipe = null;
              }

              return {
                ...court,

                sport_preference: {
                  preferred_sport_id: preferredSportId,

                  preferred_naipe: nextPreferredNaipe,

                  preferred_division:
                    seasonSettings.division_format ==
                    ChampionshipSeasonDivisionFormat.SEPARATED
                      ? nextPreferredDivision
                      : null,

                  sequence_mode: nextSequenceMode,
                },
              };
            }),
          };
        }),
      }));
    },
    [seasonSettings.division_format, updateScheduleDay],
  );

  const updateCourtSportMatchTarget = useCallback(
    (
      scheduleDayId: string,
      locationId: string,
      courtId: string,
      sportId: string,
      plannedMatchCount: number | null,
    ) => {
      updateScheduleDay(scheduleDayId, (scheduleDay) => ({
        ...scheduleDay,
        locations: scheduleDay.locations.map((scheduleLocation) => {
          if (scheduleLocation.id != locationId) {
            return scheduleLocation;
          }

          return {
            ...scheduleLocation,
            courts: scheduleLocation.courts.map((court) => {
              if (court.id != courtId) {
                return court;
              }

              const remainingTargets = court.sport_match_targets.filter(
                (target) => target.sport_id != sportId,
              );

              if (
                plannedMatchCount == null ||
                !Number.isInteger(plannedMatchCount) ||
                plannedMatchCount <= 0
              ) {
                return {
                  ...court,
                  sport_match_targets: remainingTargets,
                };
              }

              return {
                ...court,
                sport_match_targets: [
                  ...remainingTargets,
                  {
                    sport_id: sportId,
                    planned_match_count: plannedMatchCount,
                  },
                ],
              };
            }),
          };
        }),
      }));
    },
    [updateScheduleDay],
  );

  const handleDeleteLocationTemplate = useCallback(async () => {
    if (!locationTemplateDeletionTarget || deletingLocationTemplate) {
      return;
    }

    setDeletingLocationTemplate(true);

    const response = await deleteChampionshipBracketLocationTemplate(
      locationTemplateDeletionTarget.location_template_id,
    );

    if (response.error) {
      toast.error(
        response.error.message ||
          "Não foi possível excluir o local do catálogo.",
      );
      setDeletingLocationTemplate(false);
      return;
    }

    setLocationTemplates((currentLocationTemplates) =>
      currentLocationTemplates.filter(
        (locationTemplate) =>
          locationTemplate.id !=
          locationTemplateDeletionTarget.location_template_id,
      ),
    );
    setScheduleDays((currentScheduleDays) =>
      currentScheduleDays.map((scheduleDay) => ({
        ...scheduleDay,
        locations: scheduleDay.locations
          .filter(
            (location) =>
              location.location_template_id !=
              locationTemplateDeletionTarget.location_template_id,
          )
          .map((location, locationIndex) => ({
            ...location,
            position: locationIndex + 1,
          })),
      })),
    );

    if (
      locationTemplateModalTarget?.location_template_id ==
      locationTemplateDeletionTarget.location_template_id
    ) {
      setLocationTemplateModalOpen(false);
      setLocationTemplateModalTarget(null);
      setLocationTemplateModalFormValues(
        resolveInitialLocationTemplateModalFormValue(),
      );
    }

    setLocationTemplateDeletionTarget(null);
    setDeletingLocationTemplate(false);
    toast.success("Local removido do catálogo.");
  }, [
    deletingLocationTemplate,
    locationTemplateDeletionTarget,
    locationTemplateModalTarget,
  ]);

  if (isCompactViewport) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <Alert className="border-primary/30 bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
              <Laptop2 className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <AlertTitle>
                Configuração disponível apenas em telas maiores
              </AlertTitle>
              <AlertDescription>
                Para configurar o campeonato, acesse esta área em desktop ou
                tablet.
              </AlertDescription>
            </div>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-semibold leading-none tracking-tight">
            Hora de configurar o campeonato {selectedChampionship.name}!
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure participantes, grupos e agenda para criar os jogos
            automaticamente em fila por dia.
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {activeErrorBannerData ? (
            <div ref={saveErrorBannerReference}>
              <Alert
                variant="destructive"
                className="border-destructive/60 bg-destructive/10 pr-10 dark:bg-destructive/10"
              >
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
                  {activeErrorBannerData.suggestion ? (
                    <p>{activeErrorBannerData.suggestion}</p>
                  ) : null}
                </AlertDescription>
              </Alert>
            </div>
          ) : null}

          <div className="rounded-2xl border border-transparent bg-background/60 p-1 shadow-[0_12px_24px_rgba(15,23,42,0.14)] dark:shadow-none dark:border-border/60">
            <div className="space-y-1">
              {[0, WIZARD_STEP_ROW_BREAK_INDEX].map((startIndex) => {
                const stepLabels =
                  startIndex == 0
                    ? WIZARD_STEP_LABELS.slice(0, WIZARD_STEP_ROW_BREAK_INDEX)
                    : WIZARD_STEP_LABELS.slice(WIZARD_STEP_ROW_BREAK_INDEX);

                return (
                  <div
                    key={`wizard-step-row-${startIndex}`}
                    className="grid gap-1"
                    style={{
                      gridTemplateColumns: `repeat(${stepLabels.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {stepLabels.map((label, stepOffset) => {
                      const stepIndex = startIndex + stepOffset;

                      return (
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
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex-1 px-2 py-2">
            {currentStepIndex == 0 ? (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                <div className="glass-card rounded-xl border border-border/50 p-6 shadow-sm">
                  <div className="border-b border-border/50 pb-4 mb-6">
                    <p className="text-lg font-bold">Formato da temporada</p>
                    <p className="text-sm text-muted-foreground">
                      Defina como a temporada{" "}
                      {selectedChampionship.current_season_year} será disputada.
                      O formato escolhido passa a dirigir participantes,
                      competições e o fechamento sazonal.
                    </p>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-3 rounded-xl border border-border/40 bg-background/30 p-4">
                      <p className="text-sm font-bold">Formato de divisões</p>
                      <RadioGroup
                        value={seasonSettings.division_format}
                        onValueChange={(value) =>
                          setSeasonSettings((currentSeasonSettings) => {
                            const nextDivisionFormat =
                              value as ChampionshipSeasonDivisionFormat;

                            if (
                              nextDivisionFormat ==
                              ChampionshipSeasonDivisionFormat.SEPARATED
                            ) {
                              return {
                                ...currentSeasonSettings,
                                division_format: nextDivisionFormat,
                                division_settlement_mode:
                                  ChampionshipSeasonDivisionSettlementMode.PROMOTION_RELEGATION,
                                principal_slots_count: null,
                                principal_relegation_count:
                                  currentSeasonSettings.principal_relegation_count ??
                                  2,
                                access_promotion_count:
                                  currentSeasonSettings.access_promotion_count ??
                                  2,
                              };
                            }

                            return {
                              ...currentSeasonSettings,
                              division_format: nextDivisionFormat,
                              division_settlement_mode:
                                ChampionshipSeasonDivisionSettlementMode.TOP_N_TO_PRINCIPAL,
                              principal_slots_count:
                                currentSeasonSettings.principal_slots_count ??
                                (selectedChampionship.code ==
                                ChampionshipCode.INTERLAJE
                                  ? 12
                                  : null),
                            };
                          })
                        }
                      >
                        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/40 bg-background/40 p-3">
                          <RadioGroupItem
                            value={ChampionshipSeasonDivisionFormat.SEPARATED}
                          />
                          <div className="space-y-1">
                            <p className="text-sm font-semibold">
                              Divisões separadas
                            </p>
                            <p className="text-xs text-muted-foreground">
                              A divisão principal e a divisão de acesso seguem
                              em trilhas independentes.
                            </p>
                          </div>
                        </label>

                        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/40 bg-background/40 p-3">
                          <RadioGroupItem
                            value={ChampionshipSeasonDivisionFormat.UNIFIED}
                          />
                          <div className="space-y-1">
                            <p className="text-sm font-semibold">
                              Divisão unificada
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Todas as atléticas jogam juntas na temporada atual
                              e a divisão futura é definida no encerramento.
                            </p>
                          </div>
                        </label>
                      </RadioGroup>
                    </div>

                    <div className="space-y-4 rounded-xl border border-border/40 bg-background/30 p-4">
                      <div className="space-y-1">
                        <p className="text-sm font-bold">
                          Fechamento da temporada
                        </p>
                        <p className="text-xs text-muted-foreground">
                          A movimentação de divisões é gerada como prévia e
                          aplicada só após confirmação administrativa.
                        </p>
                      </div>

                      {seasonSettings.division_format ==
                      ChampionshipSeasonDivisionFormat.SEPARATED ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              Caem da principal
                            </Label>
                            <Input
                              type="number"
                              min={1}
                              value={
                                seasonSettings.principal_relegation_count ?? ""
                              }
                              onChange={(event) =>
                                setSeasonSettings((currentSeasonSettings) => ({
                                  ...currentSeasonSettings,
                                  principal_relegation_count: event.target.value
                                    ? Number(event.target.value)
                                    : null,
                                }))
                              }
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              Sobem do acesso
                            </Label>
                            <Input
                              type="number"
                              min={1}
                              value={
                                seasonSettings.access_promotion_count ?? ""
                              }
                              onChange={(event) =>
                                setSeasonSettings((currentSeasonSettings) => ({
                                  ...currentSeasonSettings,
                                  access_promotion_count: event.target.value
                                    ? Number(event.target.value)
                                    : null,
                                }))
                              }
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Vagas na principal
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            value={seasonSettings.principal_slots_count ?? ""}
                            onChange={(event) =>
                              setSeasonSettings((currentSeasonSettings) => ({
                                ...currentSeasonSettings,
                                principal_slots_count: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              }))
                            }
                          />
                        </div>
                      )}

                      <div className="rounded-lg border border-border/40 bg-background/40 p-3 text-xs text-muted-foreground">
                        {seasonSettings.division_format ==
                        ChampionshipSeasonDivisionFormat.SEPARATED
                          ? `Prévia esperada: ${seasonSettings.principal_relegation_count ?? 0} caem da principal e ${seasonSettings.access_promotion_count ?? 0} sobem do acesso, filtrando a classificação geral oficial final pela divisão de origem.`
                          : `Prévia esperada: os ${seasonSettings.principal_slots_count ?? 0} primeiros da classificação geral oficial final formam a divisão principal da próxima temporada.`}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {currentStepIndex == 1 ? (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                <div className="glass-card rounded-xl border border-border/50 p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4 mb-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-bold">
                          Modalidades do Campeonato
                        </p>
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                          {enabledSportsSummary.selected_sports_count}/
                          {enabledSportsSummary.eligible_sports_count} ativas
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Escolha quais modalidades entram na temporada atual
                        antes de selecionar participantes e naipes.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors">
                      <Checkbox
                        className={SQUARE_CHECKBOX_CLASS_NAME}
                        checked={resolveCheckboxCheckedState(
                          enabledSportsSummary.selected_sports_count,
                          enabledSportsSummary.eligible_sports_count,
                        )}
                        onCheckedChange={(checked) =>
                          handleToggleAllEnabledSports(checked == true)
                        }
                      />
                      Selecionar todas
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {championshipSportCards.map((championshipSport) => {
                      const isEnabled = enabledSportIdSet.has(
                        championshipSport.sport_id,
                      );
                      const sportName =
                        championshipSport.sports?.name ?? "Modalidade";
                      const isIndividualSport =
                        resolveIsIndividualSportName(sportName);

                      return (
                        <label
                          key={`enabled-sport-${championshipSport.sport_id}`}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all",
                            isEnabled
                              ? "border-primary/30 bg-primary/5 ring-1 ring-primary/20"
                              : "border-border/40 bg-background/30",
                          )}
                        >
                          <Checkbox
                            className={SQUARE_CHECKBOX_CLASS_NAME}
                            checked={isEnabled}
                            onCheckedChange={(checked) =>
                              handleToggleEnabledSport(
                                championshipSport.sport_id,
                                checked == true,
                              )
                            }
                          />
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold">
                                {sportName}
                              </p>
                              <AppBadge
                                tone={
                                  isIndividualSport
                                    ? AppBadgeTone.SKY
                                    : AppBadgeTone.NEUTRAL
                                }
                                className="shrink-0"
                              >
                                {isIndividualSport ? "Individual" : "Coletiva"}
                              </AppBadge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {championshipSport.naipe_mode ==
                              ChampionshipSportNaipeMode.MISTO
                                ? "Naipe misto."
                                : "Naipes masculino e feminino."}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {currentStepIndex == 2 ? (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                <div className="glass-card rounded-xl border border-border/50 p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4 mb-4">
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-bold">
                        Selecione as atléticas participantes
                      </p>
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                        {selectedTeamIds.length}/{selectableTeams.length}{" "}
                        selecionadas
                      </span>
                    </div>
                    <label className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors">
                      <Checkbox
                        className={SQUARE_CHECKBOX_CLASS_NAME}
                        checked={
                          allSelectableTeamsSelected
                            ? true
                            : hasAtLeastOneSelectableTeamSelected
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={(checked) =>
                          handleToggleAllTeamSelection(checked == true)
                        }
                      />
                      Selecionar todas
                    </label>
                  </div>
                  <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
                    {selectableTeams.map((team) => {
                      const isSelected = selectedTeamIdSet.has(team.id);

                      return (
                        <label
                          key={team.id}
                          className={cn(
                            "mb-3 flex w-full break-inside-avoid-column items-center gap-3 rounded-xl border p-3 transition-all cursor-pointer",
                            isSelected
                              ? "border-primary/30 bg-primary/5 ring-1 ring-primary/20"
                              : "",
                          )}
                        >
                          <Checkbox
                            className={SQUARE_CHECKBOX_CLASS_NAME}
                            checked={isSelected}
                            onCheckedChange={(checked) =>
                              handleToggleTeamSelection(
                                team.id,
                                checked == true,
                              )
                            }
                          />
                          <span className="text-sm font-semibold">
                            {team.name}
                          </span>
                          {team.division ? (
                            <AppBadge
                              tone={TEAM_DIVISION_BADGE_TONES[team.division]}
                              className="ml-auto shrink-0 whitespace-nowrap"
                            >
                              {TEAM_DIVISION_LABELS[team.division]}
                            </AppBadge>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                  {selectableTeams.length == 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground text-center py-8">
                      Nenhuma atlética elegível foi encontrada para o formato
                      sazonal selecionado.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {currentStepIndex == 3 ? (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                <div className="glass-card rounded-xl border border-border/50 p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4 mb-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-bold">
                          Atléticas por modalidade
                        </p>
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                          {modalitySelectionSummary.selected_modalities_count}/
                          {modalitySelectionSummary.eligible_modalities_count}{" "}
                          selecionadas
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Cada card representa uma modalidade. Selecione as
                        atléticas que participarão de cada uma.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors">
                      <Checkbox
                        data-testid="modalities-toggle-all"
                        className={SQUARE_CHECKBOX_CLASS_NAME}
                        checked={resolveCheckboxCheckedState(
                          modalitySelectionSummary.selected_modalities_count,
                          modalitySelectionSummary.eligible_modalities_count,
                        )}
                        onCheckedChange={(checked) =>
                          handleToggleAllModalitiesSelection(checked == true)
                        }
                      />
                      Selecionar todas
                    </label>
                  </div>

                  <div className="grid gap-6">
                    {modalityCards.map((modalityCard) => {
                      const isBeachSoccerCard =
                        resolveNormalizedSportName(modalityCard.sport_name) ==
                        NORMALIZED_BEACH_SOCCER_NAME;
                      const shouldShowEstimatedStartTimeOnCards =
                        showEstimatedStartTimeOnCardsBySportId[
                          modalityCard.sport_id
                        ] ?? false;

                      return (
                        <div
                          key={`wizard-modality-card-${modalityCard.sport_id}`}
                          data-testid={`modality-card-${modalityCard.sport_id}`}
                          className="rounded-xl border border-border/40 bg-background/30 p-3 shadow-sm"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="space-y-0.5">
                              <p className="text-sm font-semibold">
                                {modalityCard.sport_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {modalityCard.selected_team_count}/
                                {modalityCard.eligible_team_count} atléticas
                                selecionadas
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
                                onCheckedChange={(checked) =>
                                  handleToggleModalityCardSelection(
                                    modalityCard.sport_id,
                                    checked == true,
                                  )
                                }
                              />
                              Selecionar todas
                            </label>
                          </div>

                          {isBeachSoccerCard ? (
                            <div className="mt-3 rounded-md border border-border/60 bg-background/45 p-3">
                              <p className="text-xs font-semibold text-foreground">
                                Exibir horário estimado nos cards
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                Mantém a fila normal e adiciona apenas o horário
                                estimado para jogos agendados.
                              </p>

                              <RadioGroup
                                className="mt-2 flex items-center gap-4"
                                value={
                                  shouldShowEstimatedStartTimeOnCards
                                    ? "YES"
                                    : "NO"
                                }
                                onValueChange={(value) => {
                                  setShowEstimatedStartTimeOnCardsBySportId(
                                    (
                                      currentShowEstimatedStartTimeOnCardsBySportId,
                                    ) => ({
                                      ...currentShowEstimatedStartTimeOnCardsBySportId,
                                      [modalityCard.sport_id]: value == "YES",
                                    }),
                                  );
                                }}
                              >
                                <label className="flex cursor-pointer items-center gap-2 text-xs">
                                  <RadioGroupItem value="YES" />
                                  Sim
                                </label>
                                <label className="flex cursor-pointer items-center gap-2 text-xs">
                                  <RadioGroupItem value="NO" />
                                  Não
                                </label>
                              </RadioGroup>
                            </div>
                          ) : null}

                          {modalityCard.teams.length == 0 ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Nenhuma atlética elegível para esta modalidade.
                            </p>
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
                                      onCheckedChange={(checked) =>
                                        handleToggleTeamSport(
                                          team.team_id,
                                          modalityCard.sport_id,
                                          checked == true,
                                        )
                                      }
                                    />
                                    <span className="font-medium">
                                      {team.team_name}
                                    </span>
                                    {team.division ? (
                                      <AppBadge
                                        tone={
                                          TEAM_DIVISION_BADGE_TONES[
                                            team.division
                                          ]
                                        }
                                        className="shrink-0 whitespace-nowrap"
                                      >
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
                    Nenhuma atlética selecionada. Volte para a etapa anterior e
                    selecione participantes.
                  </p>
                ) : null}
              </div>
            ) : null}

            {currentStepIndex == 4 ? (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                <div className="glass-card rounded-xl border border-border/50 p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4 mb-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-bold">
                          Naipes por modalidade
                        </p>
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                          {naipeSelectionSummary.selected_naipes_count}/
                          {naipeSelectionSummary.eligible_naipes_count}{" "}
                          selecionadas
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Cada card representa uma modalidade. Em cada aba,
                        selecione as atléticas do naipe correspondente.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors">
                      <Checkbox
                        className={SQUARE_CHECKBOX_CLASS_NAME}
                        checked={resolveCheckboxCheckedState(
                          naipeSelectionSummary.selected_naipes_count,
                          naipeSelectionSummary.eligible_naipes_count,
                        )}
                        onCheckedChange={(checked) =>
                          handleToggleAllNaipesSelection(checked == true)
                        }
                      />
                      Selecionar todos os naipes
                    </label>
                  </div>

                  <div className="grid gap-6">
                    {naipeCards.map((naipeCard) => {
                      const activeNaipeTabValue =
                        activeNaipeTabBySportId[naipeCard.sport_id];
                      const activeNaipeTab = naipeCard.tabs.find(
                        (tab) => tab.naipe == activeNaipeTabValue,
                      );

                      return (
                        <div
                          key={`wizard-naipe-card-${naipeCard.sport_id}`}
                          className="rounded-xl border border-border/40 bg-background/30 overflow-hidden shadow-sm"
                        >
                          <div className="bg-background/40 p-4 border-b border-border/40">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <p className="text-base font-bold">
                                {naipeCard.sport_name}
                              </p>

                              <AnimatedTabBar
                                items={naipeCard.tabs.map((tab) => ({
                                  value: tab.naipe,
                                  label: tab.label,
                                  test_id: `naipe-card-${naipeCard.sport_id}-tab-${tab.naipe}`,
                                }))}
                                value={activeNaipeTab?.naipe ?? ""}
                                onValueChange={(value) =>
                                  setActiveNaipeTabBySportId(
                                    (currentActiveNaipeTabBySportId) => ({
                                      ...currentActiveNaipeTabBySportId,
                                      [naipeCard.sport_id]: value as MatchNaipe,
                                    }),
                                  )
                                }
                              />
                            </div>
                          </div>

                          {activeNaipeTab ? (
                            <div className="p-4 space-y-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-medium text-muted-foreground">
                                  {activeNaipeTab.selected_team_count}/
                                  {activeNaipeTab.eligible_team_count} atléticas
                                  selecionadas em{" "}
                                  {activeNaipeTab.label.toLowerCase()}
                                </p>
                                <label className="flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium cursor-pointer transition-colors">
                                  <Checkbox
                                    data-testid={`naipe-card-${naipeCard.sport_id}-tab-${activeNaipeTab.naipe}-toggle-all`}
                                    className={SQUARE_CHECKBOX_CLASS_NAME}
                                    checked={resolveCheckboxCheckedState(
                                      activeNaipeTab.selected_team_count,
                                      activeNaipeTab.eligible_team_count,
                                    )}
                                    onCheckedChange={(checked) =>
                                      handleToggleNaipeTabSelection(
                                        naipeCard.sport_id,
                                        activeNaipeTab.naipe,
                                        checked == true,
                                      )
                                    }
                                  />
                                  Selecionar todas
                                </label>
                              </div>

                              {activeNaipeTab.teams.length == 0 ? (
                                <p className="text-xs text-muted-foreground py-4 text-center">
                                  Nenhuma atlética disponível nesta aba.
                                </p>
                              ) : (
                                <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">
                                  {activeNaipeTab.teams.map((team) => (
                                    <label
                                      key={`${team.competition_key}-${team.team_id}`}
                                      className={cn(
                                        "mb-2 flex w-full break-inside-avoid-column items-center gap-2 rounded-lg border p-2 text-xs transition-all cursor-pointer",
                                        team.is_selected
                                          ? "border-primary/20 bg-primary/5"
                                          : "border-border/30 bg-background/20 hover:bg-background/40",
                                      )}
                                    >
                                      <Checkbox
                                        data-testid={`naipe-card-${naipeCard.sport_id}-tab-${activeNaipeTab.naipe}-team-${team.team_id}`}
                                        className={SQUARE_CHECKBOX_CLASS_NAME}
                                        checked={team.is_selected}
                                        onCheckedChange={(checked) =>
                                          handleToggleTeamCompetition(
                                            team.team_id,
                                            team.competition_key,
                                            checked == true,
                                          )
                                        }
                                      />
                                      <span className="font-semibold">
                                        {team.team_name}
                                      </span>
                                      {team.division ? (
                                        <AppBadge
                                          tone={
                                            TEAM_DIVISION_BADGE_TONES[
                                              team.division
                                            ]
                                          }
                                          className="ml-auto shrink-0 whitespace-nowrap scale-90"
                                        >
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
                      );
                    })}
                  </div>

                  {selectedTeams.length == 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-12">
                      Nenhuma atlética selecionada. Volte para a etapa anterior
                      e selecione participantes.
                    </p>
                  ) : naipeCards.length == 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-12">
                      Selecione modalidades na etapa anterior para habilitar a
                      configuração de naipes.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {currentStepIndex == 5 ? (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                <div className="glass-card rounded-xl border border-border/50 p-6 shadow-sm">
                  <div className="border-b border-border/50 pb-4 mb-6">
                    <p className="text-lg font-bold">Configuração de Grupos</p>
                    <p className="text-sm text-muted-foreground">
                      Defina a quantidade de grupos e classificados por grupo
                      para cada competição.
                    </p>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {sortedActiveCompetitionKeys.map((competitionKey) => {
                      const competitionOption =
                        competitionOptionsByKey.get(competitionKey);
                      const competitionConfig =
                        competitionConfigByKey[competitionKey];

                      if (!competitionOption || !competitionConfig) {
                        return null;
                      }

                      return (
                        <div
                          key={competitionKey}
                          className="rounded-xl border border-border/40 bg-background/30 p-5 space-y-5 shadow-sm transition-all hover:border-border/60"
                        >
                          <div>
                            <p className="text-base font-bold leading-tight">
                              {competitionOption.sport_name} •{" "}
                              {MATCH_NAIPE_LABELS[competitionOption.naipe]}
                            </p>
                            {competitionOption.division ? (
                              <p className="text-xs font-medium text-muted-foreground mt-1">
                                {
                                  TEAM_DIVISION_LABELS[
                                    competitionOption.division
                                  ]
                                }
                              </p>
                            ) : null}
                            <div className="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
                              <span>
                                Participantes:{" "}
                                <strong>
                                  {teamIdsByCompetitionKey[competitionKey]
                                    ?.length ?? 0}
                                </strong>
                              </span>
                              {(() => {
                                const pc =
                                  teamIdsByCompetitionKey[competitionKey]
                                    ?.length ?? 0;
                                const gc = Math.max(
                                  1,
                                  competitionConfig.groups_count,
                                );
                                if (pc === 0) return null;
                                const base = Math.floor(pc / gc);
                                const extra = pc % gc;
                                const plural = (n: number, w: string) =>
                                  `${n} ${n === 1 ? w : `${w}s`}`;
                                const text =
                                  extra === 0
                                    ? `${plural(gc, "chave")} de ${base} ${base === 1 ? "atlética" : "atléticas"}`
                                    : `${plural(extra, "chave")} de ${base + 1} + ${plural(gc - extra, "chave")} de ${base} ${base === 1 ? "atlética" : "atléticas"}`;
                                return <span>{text}</span>;
                              })()}
                              <span className="font-medium text-foreground/70">
                                {resolveChampionshipBracketQualificationSummary(
                                  {
                                    groups_count:
                                      competitionConfig.groups_count,
                                    qualifiers_per_group:
                                      competitionConfig.qualifiers_per_group,
                                    should_complete_knockout_with_best_second_placed_teams:
                                      competitionConfig.should_complete_knockout_with_best_second_placed_teams,
                                  },
                                )}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Quantidade de grupos
                              </Label>
                              <Input
                                type="number"
                                min={1}
                                max={16}
                                className="h-10 bg-background/50 border-border/40 focus:border-primary/40 focus:ring-primary/20"
                                value={
                                  groupCountInputByCompetitionKey[
                                    competitionKey
                                  ] ?? String(competitionConfig.groups_count)
                                }
                                onChange={(e) => {
                                  const nextRawValue = e.target.value;

                                  setGroupCountInputByCompetitionKey(
                                    (previousInputs) => ({
                                      ...previousInputs,
                                      [competitionKey]: nextRawValue,
                                    }),
                                  );

                                  if (nextRawValue.trim() == "") {
                                    return;
                                  }

                                  const parsedValue = parseInt(
                                    nextRawValue,
                                    10,
                                  );

                                  if (isNaN(parsedValue)) {
                                    return;
                                  }

                                  setCompetitionConfigByKey((prev) => ({
                                    ...prev,
                                    [competitionKey]: {
                                      ...prev[competitionKey],
                                      groups_count: parsedValue,
                                    },
                                  }));
                                }}
                                onBlur={() => {
                                  const rawValue =
                                    groupCountInputByCompetitionKey[
                                      competitionKey
                                    ];

                                  if (rawValue == null) {
                                    return;
                                  }

                                  if (rawValue.trim() == "") {
                                    setGroupCountInputByCompetitionKey(
                                      (previousInputs) => {
                                        const nextInputs = {
                                          ...previousInputs,
                                        };
                                        delete nextInputs[competitionKey];
                                        return nextInputs;
                                      },
                                    );
                                    return;
                                  }

                                  const parsedValue = parseInt(rawValue, 10);

                                  setGroupCountInputByCompetitionKey(
                                    (previousInputs) => ({
                                      ...previousInputs,
                                      [competitionKey]: String(
                                        isNaN(parsedValue)
                                          ? competitionConfig.groups_count
                                          : parsedValue,
                                      ),
                                    }),
                                  );
                                }}
                              />
                            </div>

                            <div className="space-y-2">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Classificados por grupo
                              </Label>
                              <RadioGroup
                                value={resolveQualificationModeOption(
                                  competitionConfig,
                                )}
                                onValueChange={(value) =>
                                  setCompetitionConfigByKey((prev) => ({
                                    ...prev,
                                    [competitionKey]:
                                      resolveCompetitionConfigByQualificationMode(
                                        prev[competitionKey] ??
                                          resolveDefaultCompetitionConfig(
                                            2,
                                            competitionOption,
                                          ),
                                        value as QualificationModeOption,
                                      ),
                                  }))
                                }
                                className="flex flex-col gap-2"
                              >
                                {QUALIFICATION_MODE_OPTIONS.map((option) => (
                                  <label
                                    key={option.value}
                                    className={cn(
                                      "flex items-start gap-3 rounded-lg border p-2.5 transition-all cursor-pointer",
                                      resolveQualificationModeOption(
                                        competitionConfig,
                                      ) == option.value
                                        ? "border-primary/40 bg-primary/5 ring-1 ring-primary/10"
                                        : "border-border/40 bg-background/20 hover:bg-background/40",
                                    )}
                                  >
                                    <RadioGroupItem
                                      value={option.value}
                                      id={`qpg-${competitionKey}-${option.value}`}
                                    />
                                    <div className="space-y-1">
                                      <p className="text-xs font-semibold">
                                        {option.label}
                                      </p>
                                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                                        {option.helper}
                                      </p>
                                    </div>
                                  </label>
                                ))}
                              </RadioGroup>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {currentStepIndex == 11 ? (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                <div className="glass-card rounded-xl border border-border/50 p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4 mb-6">
                    <div className="space-y-1">
                      <p className="text-lg font-bold">
                        Monte os grupos por modalidade
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Cada coluna representa um grupo. Adicione selects extras
                        com o botão + quando precisar incluir mais atléticas.
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-background/40 border-border/40 hover:bg-background/60"
                      onClick={handleAutoAssignAllCompetitionGroups}
                    >
                      Distribuir automaticamente tudo
                    </Button>
                  </div>
                </div>

                {sortedActiveCompetitionKeys.map((competitionKey) => {
                  const competitionOption =
                    competitionOptionsByKey.get(competitionKey);
                  const competitionConfig =
                    competitionConfigByKey[competitionKey];

                  if (!competitionOption || !competitionConfig) {
                    return null;
                  }

                  const assignments =
                    groupAssignmentsByCompetitionKey[competitionKey] ?? {};
                  const groupEditorColumns =
                    competitionGroupEditorColumnsByCompetitionKey[
                      competitionKey
                    ] ?? [];
                  const participantCount =
                    teamIdsByCompetitionKey[competitionKey]?.length ?? 0;

                  return (
                    <div
                      key={competitionKey}
                      className="glass-card overflow-hidden rounded-xl border border-border/50 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-4 bg-background/40 p-4 border-b border-border/50">
                        <div className="space-y-1">
                          <h3 className="text-lg font-bold tracking-tight">
                            {competitionOption.sport_name} •{" "}
                            {MATCH_NAIPE_LABELS[competitionOption.naipe]}
                            {competitionOption.division
                              ? ` • ${TEAM_DIVISION_LABELS[competitionOption.division]}`
                              : ""}
                          </h3>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-muted-foreground bg-background/50 px-2 py-0.5 rounded-md">
                              {participantCount} atléticas
                            </span>
                            <span className="text-sm font-medium text-muted-foreground bg-background/50 px-2 py-0.5 rounded-md">
                              {competitionConfig.groups_count} grupos
                            </span>
                          </div>
                        </div>

                        <Button
                          size="lg"
                          className="h-12 px-8 text-base font-bold shadow-lg shadow-primary/20"
                          onClick={() => handleDrawNextTeam(competitionKey)}
                          disabled={(() => {
                            const allTeamIds =
                              teamIdsByCompetitionKey[competitionKey] ?? [];
                            const assignedIds = new Set(
                              Object.keys(
                                groupAssignmentsByCompetitionKey[
                                  competitionKey
                                ] ?? {},
                              ),
                            );
                            return (
                              allTeamIds.filter((id) => !assignedIds.has(id))
                                .length === 0
                            );
                          })()}
                        >
                          Sortear
                        </Button>
                      </div>

                      <div className="p-4">
                        {groupEditorColumns.length == 0 ? null : (
                          <div className="mt-3 overflow-x-auto pb-1">
                            <div className="flex min-w-max gap-3">
                              {groupEditorColumns.map((groupColumn) => {
                                const assignedTeamCount = Object.values(
                                  assignments,
                                ).filter(
                                  (groupNumber) =>
                                    groupNumber == groupColumn.group_number,
                                ).length;

                                return (
                                  <div
                                    key={`${competitionKey}-group-column-${groupColumn.group_number}`}
                                    data-testid={`${competitionKey}-group-${groupColumn.group_number}-column`}
                                    className="w-80 shrink-0 rounded-xl border border-border/30 bg-background/30 p-4 shadow-sm"
                                  >
                                    <div className="flex items-center justify-between gap-2 border-b border-border/30 pb-3 mb-4">
                                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        {resolveChampionshipGroupLabel(
                                          groupColumn.group_number,
                                        )}
                                      </p>
                                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                                        {assignedTeamCount} atlética
                                        {assignedTeamCount == 1 ? "" : "s"}
                                      </span>
                                    </div>

                                    <div className="space-y-3">
                                      {groupColumn.slots.map(
                                        (slot, slotIndex) => {
                                          const slotSelectionKey =
                                            resolveCompetitionGroupSlotSelectionKey(
                                              competitionKey,
                                              groupColumn.group_number,
                                              slot.slot_id,
                                            );
                                          const shouldAutoOpenSlot =
                                            autoOpenCompetitionGroupSlotKey ==
                                            slotSelectionKey;
                                          const sortedAvailableTeamIds = [
                                            ...slot.available_team_ids,
                                          ].sort(
                                            (firstTeamId, secondTeamId) => {
                                              return (
                                                teamNameById[firstTeamId] ??
                                                "Atlética"
                                              ).localeCompare(
                                                teamNameById[secondTeamId] ??
                                                  "Atlética",
                                                "pt-BR",
                                                { sensitivity: "base" },
                                              );
                                            },
                                          );

                                          return (
                                            <div
                                              key={`${competitionKey}-group-${groupColumn.group_number}-slot-${slot.slot_id}`}
                                              className="flex items-center gap-2 group/slot"
                                            >
                                              <div className="flex-1">
                                                <Select
                                                  open={
                                                    shouldAutoOpenSlot
                                                      ? true
                                                      : undefined
                                                  }
                                                  onOpenChange={(open) => {
                                                    if (
                                                      !open &&
                                                      shouldAutoOpenSlot
                                                    ) {
                                                      setAutoOpenCompetitionGroupSlotKey(
                                                        null,
                                                      );
                                                    }
                                                  }}
                                                  value={
                                                    slot.team_id ?? undefined
                                                  }
                                                  onValueChange={(value) =>
                                                    handleSelectCompetitionGroupTeam(
                                                      competitionKey,
                                                      groupColumn.group_number,
                                                      value,
                                                      slot.team_id,
                                                      slot.slot_id,
                                                    )
                                                  }
                                                  disabled={
                                                    slot.team_id == null &&
                                                    slot.available_team_ids
                                                      .length == 0
                                                  }
                                                >
                                                  <SelectTrigger
                                                    data-testid={`${competitionKey}-group-${groupColumn.group_number}-slot-${slotIndex}-trigger`}
                                                    aria-label={`${resolveChampionshipGroupLabel(groupColumn.group_number)} atlética ${slotIndex + 1}`}
                                                    className="h-10 bg-background/50 border-border/40 text-xs font-medium focus:ring-primary/20"
                                                  >
                                                    <SelectValue
                                                      placeholder={
                                                        slot.available_team_ids
                                                          .length == 0
                                                          ? "Nenhuma disponível"
                                                          : "Selecione..."
                                                      }
                                                    />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    {sortedAvailableTeamIds.map(
                                                      (teamId) => (
                                                        <SelectItem
                                                          key={`${competitionKey}-group-${groupColumn.group_number}-team-${teamId}`}
                                                          value={teamId}
                                                        >
                                                          {teamNameById[
                                                            teamId
                                                          ] ?? "Atlética"}
                                                        </SelectItem>
                                                      ),
                                                    )}
                                                  </SelectContent>
                                                </Select>
                                              </div>

                                              {slot.is_removable ? (
                                                <Button
                                                  type="button"
                                                  size="icon"
                                                  variant="ghost"
                                                  data-testid={`${competitionKey}-group-${groupColumn.group_number}-slot-${slotIndex}-remove`}
                                                  className="h-10 w-9 shrink-0 text-destructive/75 hover:text-destructive hover:bg-destructive/10 opacity-100 dark:text-destructive/85"
                                                  onClick={() => {
                                                    if (slot.team_id) {
                                                      handleRemoveCompetitionGroupTeam(
                                                        competitionKey,
                                                        slot.team_id,
                                                      );
                                                      return;
                                                    }

                                                    handleRemoveCompetitionGroupSlot(
                                                      competitionKey,
                                                      groupColumn.group_number,
                                                      slot.slot_id,
                                                    );
                                                  }}
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </Button>
                                              ) : (
                                                <div className="w-9 shrink-0" />
                                              )}
                                            </div>
                                          );
                                        },
                                      )}
                                    </div>

                                    <Button
                                      type="button"
                                      variant="outline"
                                      data-testid={`${competitionKey}-group-${groupColumn.group_number}-add-team`}
                                      aria-label={`Adicionar atlética ao ${resolveChampionshipGroupLabel(groupColumn.group_number)}`}
                                      className="mt-4 w-full justify-center rounded-lg border border-dashed border-border/60 bg-background/20 text-muted-foreground shadow-none hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all disabled:opacity-50"
                                      onClick={() =>
                                        handleAddCompetitionGroupSlot(
                                          competitionKey,
                                          groupColumn.group_number,
                                        )
                                      }
                                      disabled={
                                        groupColumn.available_team_ids.length ==
                                        0
                                      }
                                    >
                                      <Plus className="h-4 w-4 mr-2" />{" "}
                                      Adicionar vaga
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {currentStepIndex == 6 ? (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                <div className="glass-card rounded-xl border border-border/50 p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4 mb-6">
                    <div className="space-y-1">
                      <p className="text-lg font-bold">Agenda</p>
                      <p className="text-sm text-muted-foreground">
                        Configure os dias, horários e locais disponíveis para os
                        jogos.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 rounded-md  px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-background/60 transition-colors">
                      <Checkbox
                        className={SQUARE_CHECKBOX_CLASS_NAME}
                        checked={shouldReplicatePreviousScheduleDay}
                        onCheckedChange={(checked) =>
                          setShouldReplicatePreviousScheduleDay(checked == true)
                        }
                      />
                      Replicar locais e horários do dia anterior
                    </label>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    {scheduleDays.map((scheduleDay, scheduleDayIndex) => (
                      <div
                        key={scheduleDay.id}
                        className="rounded-xl border border-border/40 bg-background/30 overflow-hidden shadow-sm flex flex-col"
                      >
                        <div className="bg-background/40 px-4 py-3 border-b border-border/40 flex items-center justify-between">
                          <p className="text-sm font-bold">
                            Dia {scheduleDayIndex + 1}
                          </p>
                          {scheduleDays.length > 1 ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => removeScheduleDay(scheduleDay.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>

                        <div className="p-4 space-y-5 flex-1">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Início
                              </Label>
                              <DateTimePicker
                                value={resolveScheduleDayDateTimeValue(
                                  scheduleDay,
                                  scheduleDay.start_time,
                                )}
                                onChange={(nextStartDateTime) => {
                                  if (!nextStartDateTime) return;
                                  const nextDate =
                                    resolveDatePartAsString(nextStartDateTime);
                                  const nextStartTime =
                                    resolveTimePartAsString(nextStartDateTime);
                                  updateScheduleDay(scheduleDay.id, (prev) => ({
                                    ...prev,
                                    date: nextDate,
                                    start_time: nextStartTime,
                                  }));
                                }}
                                placeholder="Início"
                                defaultTime="08:00"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Fim
                              </Label>
                              <DateTimePicker
                                value={resolveScheduleDayDateTimeValue(
                                  scheduleDay,
                                  scheduleDay.end_time,
                                )}
                                onChange={(nextEndDateTime) => {
                                  if (!nextEndDateTime) return;
                                  const nextDate =
                                    resolveDatePartAsString(nextEndDateTime);
                                  const nextEndTime =
                                    resolveTimePartAsString(nextEndDateTime);
                                  updateScheduleDay(scheduleDay.id, (prev) => ({
                                    ...prev,
                                    date: nextDate,
                                    end_time: nextEndTime,
                                  }));
                                }}
                                placeholder="Fim"
                                defaultTime="18:00"
                              />
                            </div>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Início Intervalo
                              </Label>
                              <div className="app-input-field flex h-10 w-full items-center justify-start overflow-hidden rounded-md border px-3 py-2 text-left font-normal shadow-[0_4px_10px_rgba(15,23,42,0.06)] ring-offset-background transition-[color,box-shadow,border-color,background-color] focus-within:shadow-[0_6px_14px_rgba(15,23,42,0.08)] focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 dark:shadow-none dark:focus-within:shadow-none sm:max-w-[220px]">
                                <Clock className="mr-2 h-4 w-4 shrink-0 text-foreground/80 stroke-[2.25]" />
                                <input
                                  type="time"
                                  value={scheduleDay.break_start_time}
                                  onChange={(e) =>
                                    updateScheduleDay(
                                      scheduleDay.id,
                                      (prev) => ({
                                        ...prev,
                                        break_start_time: e.target.value,
                                      }),
                                    )
                                  }
                                  className="h-full w-full border-0 bg-transparent p-0 text-left text-sm text-foreground outline-none [appearance:textfield] [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-clear-button]:hidden [&::-webkit-inner-spin-button]:hidden"
                                />
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Fim Intervalo
                              </Label>
                              <div className="app-input-field flex h-10 w-full items-center justify-start overflow-hidden rounded-md border px-3 py-2 text-left font-normal shadow-[0_4px_10px_rgba(15,23,42,0.06)] ring-offset-background transition-[color,box-shadow,border-color,background-color] focus-within:shadow-[0_6px_14px_rgba(15,23,42,0.08)] focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 dark:shadow-none dark:focus-within:shadow-none sm:max-w-[220px]">
                                <Clock className="mr-2 h-4 w-4 shrink-0 text-foreground/80 stroke-[2.25]" />
                                <input
                                  type="time"
                                  value={scheduleDay.break_end_time}
                                  onChange={(e) =>
                                    updateScheduleDay(
                                      scheduleDay.id,
                                      (prev) => ({
                                        ...prev,
                                        break_end_time: e.target.value,
                                      }),
                                    )
                                  }
                                  className="h-full w-full border-0 bg-transparent p-0 text-left text-sm text-foreground outline-none [appearance:textfield] [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-clear-button]:hidden [&::-webkit-inner-spin-button]:hidden"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3 pt-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Locais do dia
                              </Label>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[10px] font-bold bg-background/40 border-border/40"
                                  onClick={() =>
                                    handleOpenLocationTemplateSelectionModal(
                                      scheduleDay.id,
                                    )
                                  }
                                  disabled={locationTemplatesLoading}
                                >
                                  <Plus className="mr-1 h-3 w-3" /> Adicionar
                                  local
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[10px] font-bold bg-background/40 border-border/40"
                                  onClick={() =>
                                    handleOpenCreateLocationTemplateModal(
                                      scheduleDay.id,
                                    )
                                  }
                                >
                                  Cadastrar local
                                </Button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {scheduleDay.locations.map((location) => (
                                <div
                                  key={location.id}
                                  className="rounded-lg border border-border/30 bg-background/40 p-3 flex items-start justify-between group"
                                >
                                  <div className="space-y-1">
                                    <p className="text-sm font-bold">
                                      {location.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {resolveLocationCatalogSupportSummary(
                                        location,
                                        selectedSportOptions,
                                      )}
                                    </p>
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-primary"
                                      onClick={() =>
                                        handleOpenEditLocationTemplateModal(
                                          scheduleDay.id,
                                          location,
                                        )
                                      }
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                      onClick={() =>
                                        removeScheduleLocation(
                                          scheduleDay.id,
                                          location.id,
                                        )
                                      }
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                              {scheduleDay.locations.length == 0 && (
                                <p className="text-[10px] text-center py-4 text-muted-foreground italic border border-dashed border-border/40 rounded-lg">
                                  Nenhum local selecionado.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/40 bg-background/20 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all group"
                      onClick={handleAddScheduleDay}
                    >
                      <div className="rounded-full bg-background/60 p-3 shadow-sm group-hover:scale-110 transition-transform">
                        <Plus className="h-6 w-6" />
                      </div>
                      <div className="text-center mt-3">
                        <p className="text-sm font-bold">Adicionar dia</p>
                        <p className="text-[10px] mt-1 opacity-70">
                          {shouldReplicatePreviousScheduleDay
                            ? "Novo dia com dados replicados"
                            : "Criar novo card de agenda"}
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {currentStepIndex == 7 ? (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                <div className="glass-card rounded-xl border border-border/50 p-6 shadow-sm">
                  <div className="border-b border-border/50 pb-4 mb-6">
                    <p className="text-lg font-bold">
                      Sessões das Modalidades Individuais
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Defina o slot oficial de cada sessão de atletismo e
                      natação por modalidade, naipe e divisão. Esse slot passa a
                      ser a reserva operacional da sessão ao vivo.
                    </p>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                      <div className="mb-4">
                        <p className="text-sm font-bold">
                          Pontuação por colocação
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Defina quantas colocações pontuam e quantos pontos
                          cada posição recebe em cada modalidade individual.
                          Essa regra será aplicada na consolidação oficial das
                          provas.
                        </p>
                      </div>

                      {selectedIndividualSports.length == 0 ? (
                        <div className="rounded-lg border border-dashed border-border/40 bg-background/20 p-6 text-center text-sm text-muted-foreground">
                          Nenhuma modalidade individual ativa nesta temporada.
                        </div>
                      ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                          {selectedIndividualSports.map((individualSport) => {
                            const individualConfig =
                              individualEventConfigs.find(
                                (configItem) =>
                                  configItem.sport_id ==
                                  individualSport.sport_id,
                              ) ?? null;

                            return (
                              <div
                                key={`individual-sport-${individualSport.sport_id}`}
                                className="rounded-lg border border-border/30 bg-background/40 p-4"
                              >
                                <p className="text-sm font-bold">
                                  {individualSport.sport_name}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  A regra vale para todos os naipes da
                                  modalidade nesta temporada.
                                </p>

                                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,220px)_minmax(0,220px)]">
                                  <div className="space-y-1.5">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                      Quantidade de colocações pontuadas
                                    </Label>
                                    <Input
                                      type="number"
                                      min={1}
                                      step={1}
                                      value={
                                        individualConfig?.placements_count ?? 20
                                      }
                                      onChange={(event) =>
                                        updateIndividualEventPlacementsCount(
                                          individualSport.sport_id,
                                          Math.max(
                                            1,
                                            Number(event.target.value) || 1,
                                          ),
                                        )
                                      }
                                      className="h-10 bg-background/50 border-border/40"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                      Multiplicador do revezamento
                                    </Label>
                                    <Input
                                      type="number"
                                      min={1}
                                      step={1}
                                      value={
                                        individualConfig?.relay_multiplier ?? 2
                                      }
                                      onChange={(event) =>
                                        updateIndividualEventRelayMultiplier(
                                          individualSport.sport_id,
                                          Math.max(
                                            1,
                                            Number(event.target.value) || 1,
                                          ),
                                        )
                                      }
                                      className="h-10 bg-background/50 border-border/40"
                                    />
                                  </div>
                                </div>

                                <div className="mt-4 rounded-lg border border-border/30 bg-background/30 p-4">
                                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        Pontos por colocação
                                      </p>
                                      <p className="mt-1 text-[11px] text-muted-foreground">
                                        Preencha da 1ª até a{" "}
                                        {individualConfig?.placements_count ??
                                          0}
                                        ª colocação.
                                      </p>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                      Deslize horizontalmente para revisar todas
                                      as posições.
                                    </p>
                                  </div>

                                  <div className="overflow-x-auto pb-1">
                                    <div className="flex min-w-max gap-3">
                                      {(
                                        individualConfig?.placement_points ?? []
                                      ).map((placementPoint) => (
                                        <div
                                          key={`${individualSport.sport_id}-placement-${placementPoint.placement}`}
                                          className="w-48 shrink-0 rounded-lg border border-border/30 bg-background/40 p-3"
                                        >
                                          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                            {placementPoint.placement}º lugar
                                          </Label>
                                          <Input
                                            type="number"
                                            min={0}
                                            step={1}
                                            value={placementPoint.points ?? ""}
                                            onChange={(event) =>
                                              updateIndividualEventPlacementPoints(
                                                individualSport.sport_id,
                                                placementPoint.placement,
                                                event.target.value.trim() === ""
                                                  ? null
                                                  : Math.max(
                                                      0,
                                                      Number(
                                                        event.target.value,
                                                      ) || 0,
                                                    ),
                                              )
                                            }
                                            className={cn(
                                              "mt-2 h-10 bg-background/50 border-border/40",
                                              placementPoint.points == null
                                                ? "border-rose-500/40 focus-visible:ring-rose-500/30"
                                                : "",
                                            )}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                      <div className="mb-4">
                        <p className="text-sm font-bold">Sessões oficiais</p>
                        <p className="text-xs text-muted-foreground">
                          Cada sessão individual precisa de um único dia,
                          período e recurso oficial. Se marcar "Reserva
                          exclusiva do recurso", o recurso fica reservado
                          exclusivamente para a sessão.
                        </p>
                      </div>

                      {selectedIndividualCompetitionOptions.length == 0 ? (
                        <div className="rounded-lg border border-dashed border-border/40 bg-background/20 p-6 text-center text-sm text-muted-foreground">
                          Nenhuma sessão individual foi gerada com a seleção
                          atual de modalidades, naipes e divisões.
                        </div>
                      ) : (
                        <div className="grid gap-4 xl:grid-cols-2">
                          {selectedIndividualCompetitionOptions.map(
                            (competitionOption) => {
                              const sessionKey =
                                resolveIndividualSessionConfigKey(
                                  competitionOption,
                                );
                              const sessionConfig =
                                individualSessionConfigByKey.get(sessionKey) ??
                                null;
                              const divisionSuffix = competitionOption.division
                                ? ` • ${TEAM_DIVISION_LABELS[competitionOption.division]}`
                                : "";
                              const selectedDate =
                                sessionConfig?.scheduled_date ?? null;
                              const availableResources = selectedDate
                                ? (
                                    scheduleResourcesByDate[selectedDate] ?? []
                                  ).filter((resource) =>
                                    resource.sport_ids.includes(
                                      competitionOption.sport_id,
                                    ),
                                  )
                                : [];
                              const selectedResourceValue =
                                sessionConfig?.location_key &&
                                sessionConfig?.court_key
                                  ? `${sessionConfig.location_key}::${sessionConfig.court_key}`
                                  : "UNSELECTED";
                              const hasConfiguredSlot =
                                Boolean(sessionConfig?.scheduled_date) &&
                                sessionConfig?.period != null &&
                                Boolean(sessionConfig?.location_key) &&
                                Boolean(sessionConfig?.court_key);
                              return (
                                <div
                                  key={`individual-session-${sessionKey}`}
                                  className="rounded-lg border border-border/30 bg-background/40 p-4"
                                >
                                  <div className="mb-4 space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <p className="text-sm font-bold">
                                        {competitionOption.sport_name} •{" "}
                                        {
                                          MATCH_NAIPE_LABELS[
                                            competitionOption.naipe
                                          ]
                                        }
                                        {divisionSuffix}
                                      </p>
                                      <AppBadge
                                        tone={
                                          hasConfiguredSlot
                                            ? AppBadgeTone.EMERALD
                                            : AppBadgeTone.AMBER
                                        }
                                        className="shrink-0"
                                      >
                                        {hasConfiguredSlot
                                          ? "Configurado"
                                          : "Pendente"}
                                      </AppBadge>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <p className="text-xs text-muted-foreground">
                                        Sessão única que aparecerá no controle
                                        ao vivo e na agenda pública.
                                      </p>
                                      <label className="flex items-center gap-2 rounded-md border border-border/40 bg-background/40 px-3 py-2 text-xs font-medium">
                                        <Checkbox
                                          className={SQUARE_CHECKBOX_CLASS_NAME}
                                          checked={
                                            sessionConfig?.exclusive_lock_enabled ==
                                            true
                                          }
                                          onCheckedChange={(checked) =>
                                            updateIndividualSessionConfig(
                                              sessionKey,
                                              {
                                                exclusive_lock_enabled:
                                                  checked == true,
                                              },
                                            )
                                          }
                                        />
                                        Reserva exclusiva do recurso
                                      </label>
                                    </div>
                                  </div>

                                  <div className="grid gap-4 sm:grid-cols-3">
                                    <div className="space-y-1.5">
                                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        Dia oficial
                                      </Label>
                                      <Select
                                        value={selectedDate ?? "UNSELECTED"}
                                        onValueChange={(value) => {
                                          const nextDate =
                                            value == "UNSELECTED"
                                              ? null
                                              : value;
                                          const nextPeriod =
                                            nextDate &&
                                            sessionConfig?.period &&
                                            schedulePeriodEnabledByDatePeriodKey[
                                              resolveDatePeriodKey(
                                                nextDate,
                                                sessionConfig.period,
                                              )
                                            ] != false
                                              ? sessionConfig.period
                                              : null;

                                          updateIndividualSessionConfig(
                                            sessionKey,
                                            {
                                              scheduled_date: nextDate,
                                              period: nextPeriod,
                                              location_key: null,
                                              court_key: null,
                                              location_name: null,
                                              court_name: null,
                                            },
                                          );
                                        }}
                                      >
                                        <SelectTrigger className="h-10 bg-background/50 border-border/40">
                                          <SelectValue placeholder="Selecione o dia" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="UNSELECTED">
                                            Selecione
                                          </SelectItem>
                                          {scheduleDayDates.map(
                                            (scheduleDate) => (
                                              <SelectItem
                                                key={`${sessionKey}-date-${scheduleDate}`}
                                                value={scheduleDate}
                                              >
                                                {resolveBrazilianDateString(
                                                  scheduleDate,
                                                )}
                                              </SelectItem>
                                            ),
                                          )}
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        Período
                                      </Label>
                                      <Select
                                        value={
                                          sessionConfig?.period ?? "UNSELECTED"
                                        }
                                        onValueChange={(value) =>
                                          updateIndividualSessionConfig(
                                            sessionKey,
                                            {
                                              period:
                                                value == "UNSELECTED"
                                                  ? null
                                                  : (value as ChampionshipSchedulePeriod),
                                            },
                                          )
                                        }
                                        disabled={!selectedDate}
                                      >
                                        <SelectTrigger className="h-10 bg-background/50 border-border/40">
                                          <SelectValue placeholder="Selecione o período" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="UNSELECTED">
                                            Selecione
                                          </SelectItem>
                                          {SCHEDULE_PERIODS.map((period) => (
                                            <SelectItem
                                              key={`${sessionKey}-period-${period}`}
                                              value={period}
                                              disabled={
                                                !selectedDate ||
                                                schedulePeriodEnabledByDatePeriodKey[
                                                  resolveDatePeriodKey(
                                                    selectedDate,
                                                    period,
                                                  )
                                                ] == false
                                              }
                                            >
                                              {SCHEDULE_PERIOD_LABELS[period]}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        Recurso
                                      </Label>
                                      <Select
                                        value={selectedResourceValue}
                                        onValueChange={(value) => {
                                          if (value == "UNSELECTED") {
                                            updateIndividualSessionConfig(
                                              sessionKey,
                                              {
                                                location_key: null,
                                                court_key: null,
                                                location_name: null,
                                                court_name: null,
                                              },
                                            );
                                            return;
                                          }

                                          const nextResource =
                                            availableResources.find(
                                              (resource) =>
                                                `${resource.location_key}::${resource.court_key}` ==
                                                value,
                                            );

                                          if (!nextResource) {
                                            return;
                                          }

                                          updateIndividualSessionConfig(
                                            sessionKey,
                                            {
                                              location_key:
                                                nextResource.location_key,
                                              court_key: nextResource.court_key,
                                              location_name:
                                                nextResource.location_name,
                                              court_name:
                                                nextResource.court_name,
                                            },
                                          );
                                        }}
                                        disabled={!selectedDate}
                                      >
                                        <SelectTrigger className="h-10 bg-background/50 border-border/40">
                                          <SelectValue placeholder="Selecione o recurso" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="UNSELECTED">
                                            Selecione
                                          </SelectItem>
                                          {availableResources.map(
                                            (resource) => (
                                              <SelectItem
                                                key={`${sessionKey}-resource-${resource.location_key}-${resource.court_key}`}
                                                value={`${resource.location_key}::${resource.court_key}`}
                                              >
                                                {resource.location_name} •{" "}
                                                {resource.court_name}
                                              </SelectItem>
                                            ),
                                          )}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>

                                  {selectedDate &&
                                  availableResources.length == 0 ? (
                                    <div className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                                      Nenhum recurso compatível com{" "}
                                      {competitionOption.sport_name} foi
                                      encontrado no dia selecionado.
                                    </div>
                                  ) : null}
                                </div>
                              );
                            },
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {currentStepIndex == 8 ? (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                <div className="glass-card rounded-xl border border-border/50 p-6 shadow-sm">
                  <div className="border-b border-border/50 pb-4 mb-6">
                    <p className="text-lg font-bold">
                      Disponibilidade por Modalidade
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Defina em quais dias e horários cada competição coletiva
                      poderá receber jogos. As modalidades individuais continuam
                      utilizando o slot oficial configurado na etapa anterior.
                    </p>
                  </div>

                  {activeCompetitionOptions.length == 0 ? (
                    <div className="rounded-lg border border-dashed border-border/40 bg-background/20 p-6 text-center text-sm text-muted-foreground">
                      Nenhuma competição coletiva ativa para configurar nesta
                      etapa.
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {activeCompetitionOptions.map((competitionOption) => {
                        const competitionAvailabilityItems =
                          scheduleDayDatesOrderedByColumn.map(
                            (scheduleDate) =>
                              competitionDateAvailabilityByKey.get(
                                `${competitionOption.key}::${scheduleDate}`,
                              ) ?? null,
                          );

                        const allDaysFullDay =
                          competitionAvailabilityItems.length > 0 &&
                          competitionAvailabilityItems.every(
                            (availabilityItem) =>
                              availabilityItem?.mode == "FULL_DAY",
                          );

                        const allDaysUnavailable =
                          competitionAvailabilityItems.length > 0 &&
                          competitionAvailabilityItems.every(
                            (availabilityItem) =>
                              availabilityItem?.mode == "UNAVAILABLE",
                          );

                        return (
                          <div
                            key={`competition-date-availability-${competitionOption.key}`}
                            className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm"
                          >
                            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                              <div>
                                <p className="text-sm font-bold">
                                  {competitionLabelByKey[
                                    competitionOption.key
                                  ] ?? "Competição"}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Configure o dia inteiro ou restrinja a
                                  modalidade a horários específicos.
                                </p>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    allDaysFullDay ? "default" : "secondary"
                                  }
                                  onClick={() =>
                                    updateCompetitionDateAvailabilityForAllDates(
                                      competitionOption.key,
                                      "FULL_DAY",
                                    )
                                  }
                                >
                                  Todos os dias
                                </Button>

                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    allDaysUnavailable
                                      ? "default"
                                      : "secondary"
                                  }
                                  onClick={() =>
                                    updateCompetitionDateAvailabilityForAllDates(
                                      competitionOption.key,
                                      "UNAVAILABLE",
                                    )
                                  }
                                >
                                  Indisponível em todos
                                </Button>
                              </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                              {scheduleDayDatesOrderedByColumn.map(
                                (scheduleDate) => {
                                  const availabilityKey = `${competitionOption.key}::${scheduleDate}`;
                                  const availabilityItem =
                                    competitionDateAvailabilityByKey.get(
                                      availabilityKey,
                                    );
                                  const availabilityMode =
                                    availabilityItem?.mode ?? "FULL_DAY";
                                  const availabilityWindows =
                                    availabilityItem?.windows ?? [];
                                  const scheduleDay =
                                    scheduleDays.find(
                                      (currentScheduleDay) =>
                                        currentScheduleDay.date ==
                                        scheduleDate,
                                    ) ?? null;
                                  const hasBreak =
                                    Boolean(
                                      scheduleDay?.break_start_time,
                                    ) &&
                                    Boolean(scheduleDay?.break_end_time);

                                  return (
                                    <div
                                      key={availabilityKey}
                                      className={cn(
                                        "rounded-xl border p-4 transition-colors",
                                        availabilityMode == "UNAVAILABLE"
                                          ? "border-border/30 bg-background/20 opacity-75"
                                          : "border-border/40 bg-background/40",
                                      )}
                                    >
                                      <div className="mb-4">
                                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                          {resolveBrazilianDateString(
                                            scheduleDate,
                                          )}
                                        </p>

                                        {scheduleDay ? (
                                          <p className="mt-1 text-[11px] text-muted-foreground">
                                            Agenda: {scheduleDay.start_time} às{" "}
                                            {scheduleDay.end_time}
                                            {hasBreak
                                              ? ` • intervalo ${scheduleDay.break_start_time} às ${scheduleDay.break_end_time}`
                                              : ""}
                                          </p>
                                        ) : null}
                                      </div>

                                      <RadioGroup
                                        value={availabilityMode}
                                        className="grid gap-2"
                                        onValueChange={(value) => {
                                          const nextMode = value as
                                            | "FULL_DAY"
                                            | "UNAVAILABLE"
                                            | "CUSTOM";

                                          updateCompetitionDateAvailabilityMode(
                                            competitionOption.key,
                                            scheduleDate,
                                            nextMode,
                                          );

                                          SCHEDULE_PERIODS.forEach(
                                            (period) => {
                                              updateCompetitionPeriodAvailability(
                                                competitionOption.key,
                                                scheduleDate,
                                                period,
                                                nextMode != "UNAVAILABLE",
                                              );
                                            },
                                          );
                                        }}
                                      >
                                        <label
                                          className={cn(
                                            "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                                            availabilityMode == "FULL_DAY"
                                              ? "border-primary/30 bg-primary/5"
                                              : "border-border/30 bg-background/30",
                                          )}
                                        >
                                          <RadioGroupItem value="FULL_DAY" />
                                          Dia inteiro
                                        </label>

                                        <label
                                          className={cn(
                                            "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                                            availabilityMode == "CUSTOM"
                                              ? "border-primary/30 bg-primary/5"
                                              : "border-border/30 bg-background/30",
                                          )}
                                        >
                                          <RadioGroupItem value="CUSTOM" />
                                          Horário personalizado
                                        </label>

                                        <label
                                          className={cn(
                                            "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                                            availabilityMode == "UNAVAILABLE"
                                              ? "border-primary/30 bg-primary/5"
                                              : "border-border/30 bg-background/30",
                                          )}
                                        >
                                          <RadioGroupItem value="UNAVAILABLE" />
                                          Indisponível
                                        </label>
                                      </RadioGroup>

                                      {availabilityMode == "CUSTOM" ? (
                                        <div className="mt-4 space-y-3 border-t border-border/30 pt-4">
                                          <div className="flex items-center justify-between gap-3">
                                            <p className="text-xs font-semibold">
                                              Janelas disponíveis
                                            </p>

                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="secondary"
                                              onClick={() =>
                                                addCompetitionDateAvailabilityWindow(
                                                  competitionOption.key,
                                                  scheduleDate,
                                                )
                                              }
                                            >
                                              <Plus className="mr-1.5 h-3.5 w-3.5" />
                                              Adicionar
                                            </Button>
                                          </div>

                                          {availabilityWindows.length == 0 ? (
                                            <div className="rounded-lg border border-dashed border-border/40 p-3 text-center text-xs text-muted-foreground">
                                              Adicione ao menos uma janela de
                                              horário.
                                            </div>
                                          ) : (
                                            <div className="space-y-3">
                                              {availabilityWindows.map(
                                                (
                                                  availabilityWindow,
                                                  windowIndex,
                                                ) => (
                                                  <div
                                                    key={`${availabilityKey}-window-${windowIndex}`}
                                                    className="rounded-lg border border-border/30 bg-background/30 p-3"
                                                  >
                                                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-end gap-2">
                                                      <div className="space-y-1.5">
                                                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                          Início
                                                        </Label>
                                                        <Input
                                                          type="time"
                                                          value={
                                                            availabilityWindow.start_time
                                                          }
                                                          onChange={(event) =>
                                                            updateCompetitionDateAvailabilityWindow(
                                                              competitionOption.key,
                                                              scheduleDate,
                                                              windowIndex,
                                                              "start_time",
                                                              event.target
                                                                .value,
                                                            )
                                                          }
                                                          className="h-9"
                                                        />
                                                      </div>

                                                      <span className="pb-2 text-xs text-muted-foreground">
                                                        até
                                                      </span>

                                                      <div className="space-y-1.5">
                                                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                          Fim
                                                        </Label>
                                                        <Input
                                                          type="time"
                                                          value={
                                                            availabilityWindow.end_time
                                                          }
                                                          onChange={(event) =>
                                                            updateCompetitionDateAvailabilityWindow(
                                                              competitionOption.key,
                                                              scheduleDate,
                                                              windowIndex,
                                                              "end_time",
                                                              event.target
                                                                .value,
                                                            )
                                                          }
                                                          className="h-9"
                                                        />
                                                      </div>

                                                      <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() =>
                                                          removeCompetitionDateAvailabilityWindow(
                                                            competitionOption.key,
                                                            scheduleDate,
                                                            windowIndex,
                                                          )
                                                        }
                                                        aria-label={`Remover janela ${windowIndex + 1}`}
                                                        title="Remover janela"
                                                      >
                                                        <Trash2 className="h-4 w-4" />
                                                      </Button>
                                                    </div>
                                                  </div>
                                                ),
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      ) : availabilityMode == "FULL_DAY" ? (
                                        <p className="mt-3 text-[11px] text-muted-foreground">
                                          A competição poderá ser programada em
                                          toda a janela da agenda deste dia,
                                          respeitando os intervalos configurados.
                                        </p>
                                      ) : (
                                        <p className="mt-3 text-[11px] text-muted-foreground">
                                          Nenhum jogo desta competição será
                                          programado neste dia.
                                        </p>
                                      )}
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {currentStepIndex == 9 ? (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                <div className="glass-card rounded-xl border border-border/50 p-6 shadow-sm">
                  <div className="border-b border-border/50 pb-4 mb-6">
                    <p className="text-lg font-bold">
                      Disponibilidade das Atléticas
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Defina os dias e horários em que cada atlética poderá
                      jogar durante a fase de grupos. A disponibilidade efetiva
                      será sempre a interseção entre a janela da modalidade e a
                      janela da atlética.
                    </p>
                  </div>

                  {Object.keys(teamCompetitionKeysByTeamId).length == 0 ? (
                    <div className="rounded-xl border border-dashed border-border/40 bg-background/20 p-8 text-center text-sm text-muted-foreground">
                      Nenhuma combinação válida de atlética e competição
                      coletiva para configurar.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
                        <Input
                          value={teamAvailabilitySearchTerm}
                          onChange={(event) =>
                            setTeamAvailabilitySearchTerm(event.target.value)
                          }
                          placeholder="Buscar atlética"
                          className="h-10"
                        />

                        <Select
                          value={selectedTeamAvailabilityFilterValue}
                          onValueChange={
                            setSelectedTeamAvailabilityFilterValue
                          }
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Todas as atléticas" />
                          </SelectTrigger>

                          <SelectContent>
                            <SelectItem value={ALL_TEAMS_FILTER_VALUE}>
                              Todas as atléticas
                            </SelectItem>

                            {teamAvailabilityFilterOptions.map(
                              (teamOption) => (
                                <SelectItem
                                  key={`team-availability-filter-${teamOption.team_id}`}
                                  value={teamOption.team_id}
                                >
                                  {teamOption.team_name}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {filteredTeamDateAvailabilityCards.length == 0 ? (
                        <div className="rounded-xl border border-dashed border-border/40 bg-background/20 p-8 text-center text-sm text-muted-foreground">
                          Nenhuma atlética encontrada para os filtros
                          aplicados.
                        </div>
                      ) : (
                        filteredTeamDateAvailabilityCards.map(
                          (teamAvailabilityCard) => (
                            <div
                              key={`team-date-availability-${teamAvailabilityCard.team_id}`}
                              className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm"
                            >
                              <div className="mb-5">
                                <p className="text-base font-bold">
                                  {teamAvailabilityCard.team_name}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Estas restrições são aplicadas somente aos
                                  jogos da fase de grupos.
                                </p>
                              </div>

                              <div className="space-y-4">
                                {teamAvailabilityCard.sport_cards.map(
                                  (sportCard) => {
                                    const supportedNaipes =
                                      sportCard.tabs.map((tab) => tab.naipe);

                                    const activeNaipe =
                                      activeTeamAvailabilityNaipeTabByTeamSportKey[
                                        sportCard.team_sport_key
                                      ] ??
                                      resolveDefaultWizardNaipeTabValue(
                                        supportedNaipes,
                                      );

                                    const activeTab =
                                      sportCard.tabs.find(
                                        (tab) => tab.naipe == activeNaipe,
                                      ) ??
                                      sportCard.tabs[0] ??
                                      null;

                                    if (!activeTab) {
                                      return null;
                                    }

                                    return (
                                      <div
                                        key={`team-date-sport-${sportCard.team_sport_key}`}
                                        className="rounded-xl border border-border/30 bg-background/20 p-4 shadow-sm dark:bg-transparent dark:shadow-none"
                                      >
                                        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                                          <div>
                                            <p className="text-sm font-bold">
                                              {competitionLabelByKey[
                                                activeTab.competition_key
                                              ] ?? "Competição"}
                                            </p>

                                            <p className="mt-1 text-xs text-muted-foreground">
                                              {activeTab.available_date_count}/
                                              {activeTab.eligible_date_count}{" "}
                                              dias disponíveis
                                              {activeTab.custom_date_count > 0
                                                ? ` • ${activeTab.custom_date_count} personalizados`
                                                : ""}
                                              {activeTab.unavailable_date_count >
                                              0
                                                ? ` • ${activeTab.unavailable_date_count} indisponíveis`
                                                : ""}
                                            </p>
                                          </div>

                                          <div className="flex flex-wrap items-center justify-end gap-3">
                                            <div className="flex flex-wrap gap-2">
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant={
                                                  activeTab.all_dates_full_day
                                                    ? "default"
                                                    : "secondary"
                                                }
                                                disabled={
                                                  activeTab.eligible_date_count ==
                                                  0
                                                }
                                                onClick={() =>
                                                  updateTeamCompetitionDateAvailabilityForAllDates(
                                                    teamAvailabilityCard.team_id,
                                                    activeTab.competition_key,
                                                    "FULL_DAY",
                                                  )
                                                }
                                              >
                                                Disponível em todos
                                              </Button>

                                              <Button
                                                type="button"
                                                size="sm"
                                                variant={
                                                  activeTab.all_dates_unavailable
                                                    ? "default"
                                                    : "secondary"
                                                }
                                                disabled={
                                                  activeTab.eligible_date_count ==
                                                  0
                                                }
                                                onClick={() =>
                                                  updateTeamCompetitionDateAvailabilityForAllDates(
                                                    teamAvailabilityCard.team_id,
                                                    activeTab.competition_key,
                                                    "UNAVAILABLE",
                                                  )
                                                }
                                              >
                                                Indisponível em todos
                                              </Button>
                                            </div>

                                            {sportCard.tabs.length > 1 ? (
                                              <AnimatedTabBar
                                                items={sportCard.tabs.map(
                                                  (tab) => ({
                                                    value: tab.naipe,
                                                    label: tab.label,
                                                    test_id: `team-date-availability-naipe-${teamAvailabilityCard.team_id}-${sportCard.sport_id}-${tab.naipe}`,
                                                  }),
                                                )}
                                                value={activeTab.naipe}
                                                onValueChange={(
                                                  nextValue,
                                                ) =>
                                                  setActiveTeamAvailabilityNaipeTabByTeamSportKey(
                                                    (
                                                      currentActiveTeamAvailabilityNaipeTabByTeamSportKey,
                                                    ) => ({
                                                      ...currentActiveTeamAvailabilityNaipeTabByTeamSportKey,
                                                      [sportCard.team_sport_key]:
                                                        nextValue as MatchNaipe,
                                                    }),
                                                  )
                                                }
                                              />
                                            ) : null}
                                          </div>
                                        </div>

                                        {activeTab.visible_date_cards.length ==
                                        0 ? (
                                          <div className="rounded-xl border border-dashed border-border/40 bg-background/20 p-4 text-center text-sm text-muted-foreground">
                                            Nenhum dia está disponível para
                                            esta competição na etapa anterior.
                                          </div>
                                        ) : (
                                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                            {activeTab.visible_date_cards.map(
                                              (dateCard) => {
                                                const scheduleDay =
                                                  scheduleDays.find(
                                                    (
                                                      currentScheduleDay,
                                                    ) =>
                                                      currentScheduleDay.date ==
                                                      dateCard.date,
                                                  ) ?? null;

                                                return (
                                                  <div
                                                    key={
                                                      dateCard.availability_key
                                                    }
                                                    className={cn(
                                                      "rounded-xl border p-4 transition-colors",
                                                      dateCard.team_mode ==
                                                        "UNAVAILABLE"
                                                        ? "border-border/30 bg-background/20 opacity-75"
                                                        : "border-border/40 bg-background/40",
                                                    )}
                                                  >
                                                    <div className="mb-4 space-y-2">
                                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                                          {resolveBrazilianDateString(
                                                            dateCard.date,
                                                          )}
                                                        </p>

                                                        <AppBadge
                                                          tone={
                                                            dateCard.competition_mode ==
                                                            "CUSTOM"
                                                              ? AppBadgeTone.SKY
                                                              : AppBadgeTone.NEUTRAL
                                                          }
                                                        >
                                                          {dateCard.competition_mode ==
                                                          "CUSTOM"
                                                            ? "Modalidade restrita"
                                                            : "Modalidade livre"}
                                                        </AppBadge>
                                                      </div>

                                                      {dateCard.competition_mode ==
                                                      "CUSTOM" ? (
                                                        <div className="rounded-lg border border-border/30 bg-background/30 px-3 py-2">
                                                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                            Janela da modalidade
                                                          </p>

                                                          <p className="mt-1 text-xs font-medium">
                                                            {dateCard.competition_windows
                                                              .map(
                                                                (
                                                                  window,
                                                                ) =>
                                                                  `${window.start_time}–${window.end_time}`,
                                                              )
                                                              .join(" • ")}
                                                          </p>
                                                        </div>
                                                      ) : scheduleDay ? (
                                                        <p className="text-[11px] text-muted-foreground">
                                                          Modalidade disponível
                                                          durante a agenda do
                                                          dia:{" "}
                                                          {
                                                            scheduleDay.start_time
                                                          }{" "}
                                                          às{" "}
                                                          {
                                                            scheduleDay.end_time
                                                          }
                                                          .
                                                        </p>
                                                      ) : null}
                                                    </div>

                                                    <RadioGroup
                                                      value={
                                                        dateCard.team_mode
                                                      }
                                                      className="grid gap-2"
                                                      onValueChange={(
                                                        value,
                                                      ) =>
                                                        updateTeamCompetitionDateAvailabilityMode(
                                                          teamAvailabilityCard.team_id,
                                                          activeTab.competition_key,
                                                          dateCard.date,
                                                          value as
                                                            | "FULL_DAY"
                                                            | "UNAVAILABLE"
                                                            | "CUSTOM",
                                                        )
                                                      }
                                                    >
                                                      <label
                                                        className={cn(
                                                          "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                                                          dateCard.team_mode ==
                                                            "FULL_DAY"
                                                            ? "border-primary/30 bg-primary/5"
                                                            : "border-border/30 bg-background/30",
                                                        )}
                                                      >
                                                        <RadioGroupItem value="FULL_DAY" />
                                                        Disponível em toda a
                                                        janela
                                                      </label>

                                                      <label
                                                        className={cn(
                                                          "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                                                          dateCard.team_mode ==
                                                            "CUSTOM"
                                                            ? "border-primary/30 bg-primary/5"
                                                            : "border-border/30 bg-background/30",
                                                        )}
                                                      >
                                                        <RadioGroupItem value="CUSTOM" />
                                                        Horário personalizado
                                                      </label>

                                                      <label
                                                        className={cn(
                                                          "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                                                          dateCard.team_mode ==
                                                            "UNAVAILABLE"
                                                            ? "border-primary/30 bg-primary/5"
                                                            : "border-border/30 bg-background/30",
                                                        )}
                                                      >
                                                        <RadioGroupItem value="UNAVAILABLE" />
                                                        Indisponível
                                                      </label>
                                                    </RadioGroup>

                                                    {dateCard.team_mode ==
                                                    "CUSTOM" ? (
                                                      <div className="mt-4 space-y-3 border-t border-border/30 pt-4">
                                                        <div className="flex items-center justify-between gap-3">
                                                          <p className="text-xs font-semibold">
                                                            Janelas da
                                                            atlética
                                                          </p>

                                                          <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="secondary"
                                                            onClick={() =>
                                                              addTeamCompetitionDateAvailabilityWindow(
                                                                teamAvailabilityCard.team_id,
                                                                activeTab.competition_key,
                                                                dateCard.date,
                                                              )
                                                            }
                                                          >
                                                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                                                            Adicionar
                                                          </Button>
                                                        </div>

                                                        {dateCard.team_windows.length ==
                                                        0 ? (
                                                          <div className="rounded-lg border border-dashed border-border/40 p-3 text-center text-xs text-muted-foreground">
                                                            Adicione ao menos
                                                            uma janela de
                                                            horário.
                                                          </div>
                                                        ) : (
                                                          <div className="space-y-3">
                                                            {dateCard.team_windows.map(
                                                              (
                                                                window,
                                                                windowIndex,
                                                              ) => (
                                                                <div
                                                                  key={`${dateCard.availability_key}-window-${windowIndex}`}
                                                                  className="rounded-lg border border-border/30 bg-background/30 p-3"
                                                                >
                                                                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-end gap-2">
                                                                    <div className="space-y-1.5">
                                                                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                                        Início
                                                                      </Label>

                                                                      <Input
                                                                        type="time"
                                                                        value={
                                                                          window.start_time
                                                                        }
                                                                        onChange={(
                                                                          event,
                                                                        ) =>
                                                                          updateTeamCompetitionDateAvailabilityWindow(
                                                                            teamAvailabilityCard.team_id,
                                                                            activeTab.competition_key,
                                                                            dateCard.date,
                                                                            windowIndex,
                                                                            "start_time",
                                                                            event
                                                                              .target
                                                                              .value,
                                                                          )
                                                                        }
                                                                        className="h-9"
                                                                      />
                                                                    </div>

                                                                    <span className="pb-2 text-xs text-muted-foreground">
                                                                      até
                                                                    </span>

                                                                    <div className="space-y-1.5">
                                                                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                                        Fim
                                                                      </Label>

                                                                      <Input
                                                                        type="time"
                                                                        value={
                                                                          window.end_time
                                                                        }
                                                                        onChange={(
                                                                          event,
                                                                        ) =>
                                                                          updateTeamCompetitionDateAvailabilityWindow(
                                                                            teamAvailabilityCard.team_id,
                                                                            activeTab.competition_key,
                                                                            dateCard.date,
                                                                            windowIndex,
                                                                            "end_time",
                                                                            event
                                                                              .target
                                                                              .value,
                                                                          )
                                                                        }
                                                                        className="h-9"
                                                                      />
                                                                    </div>

                                                                    <Button
                                                                      type="button"
                                                                      variant="ghost"
                                                                      size="icon"
                                                                      onClick={() =>
                                                                        removeTeamCompetitionDateAvailabilityWindow(
                                                                          teamAvailabilityCard.team_id,
                                                                          activeTab.competition_key,
                                                                          dateCard.date,
                                                                          windowIndex,
                                                                        )
                                                                      }
                                                                      aria-label={`Remover janela ${windowIndex + 1}`}
                                                                      title="Remover janela"
                                                                    >
                                                                      <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                  </div>
                                                                </div>
                                                              ),
                                                            )}
                                                          </div>
                                                        )}
                                                      </div>
                                                    ) : dateCard.team_mode ==
                                                      "FULL_DAY" ? (
                                                      <p className="mt-3 text-[11px] text-muted-foreground">
                                                        A atlética poderá jogar
                                                        em toda a janela
                                                        permitida pela
                                                        modalidade neste dia.
                                                      </p>
                                                    ) : (
                                                      <p className="mt-3 text-[11px] text-muted-foreground">
                                                        A atlética não poderá
                                                        disputar jogos desta
                                                        competição neste dia.
                                                      </p>
                                                    )}
                                                  </div>
                                                );
                                              },
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                            </div>
                          ),
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {currentStepIndex == 10 ? (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                <div className="glass-card rounded-xl border border-border/50 p-6 shadow-sm">
                  <div className="border-b border-border/50 pb-4 mb-6">
                    <p className="text-lg font-bold">
                      Prioridade, Reserva e Programação das Finais
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Quando duas ou mais quadras atendem a mesma modalidade,
                      defina a preferência de naipe
                      {resolveUsesSeasonDivisions(seasonSettings)
                        ? " ou divisão"
                        : ""}{" "}
                      de cada quadra. A preferência é flexível: a quadra aceita
                      outros jogos quando não há jogo do tipo preferido
                      pendente. Sessões individuais podem gerar reservas
                      exclusivas opcionais para o recurso escolhido. Aqui você
                      também pode programar blocos manuais de finais para
                      reservar quadras e manter os dois naipes da modalidade em
                      sequência.
                    </p>
                  </div>

                  <div className="mb-6 rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                    <div>
                      <p className="text-sm font-bold">Numeração dos jogos</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Defina como o número visual dos jogos será organizado
                        durante todo o campeonato.
                      </p>
                    </div>

                    <RadioGroup
                      value={matchNumberingMode}
                      onValueChange={(value) =>
                        setMatchNumberingMode(
                          value as ChampionshipBracketMatchNumberingMode,
                        )
                      }
                      className="mt-4 grid gap-3 lg:grid-cols-2"
                    >
                      <label
                        htmlFor="match-numbering-mode-court"
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                          matchNumberingMode == "COURT"
                            ? "border-primary/50 bg-primary/5"
                            : "border-border/40 bg-background/20 hover:border-border/70",
                        )}
                      >
                        <RadioGroupItem
                          id="match-numbering-mode-court"
                          value="COURT"
                          className="mt-0.5"
                        />

                        <div className="min-w-0">
                          <p className="text-sm font-bold">Por quadra</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            Cada quadra possui sua própria sequência de jogos. A
                            numeração continua nos dias seguintes e não reinicia
                            a cada novo dia.
                          </p>

                          <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                            Ex.: Quadra Interna — Jogo 1, Jogo 2, Jogo 3...
                          </p>
                        </div>
                      </label>

                      <label
                        htmlFor="match-numbering-mode-sport-naipe"
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                          matchNumberingMode == "SPORT_NAIPE"
                            ? "border-primary/50 bg-primary/5"
                            : "border-border/40 bg-background/20 hover:border-border/70",
                        )}
                      >
                        <RadioGroupItem
                          id="match-numbering-mode-sport-naipe"
                          value="SPORT_NAIPE"
                          className="mt-0.5"
                        />

                        <div className="min-w-0">
                          <p className="text-sm font-bold">
                            Por modalidade e naipe
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            Cada combinação de modalidade e naipe possui sua
                            própria sequência, mesmo quando os jogos mudam de
                            quadra.
                          </p>

                          <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                            Ex.: Futsal Feminino — Jogo 1, Jogo 2, Jogo 3...
                          </p>
                        </div>
                      </label>
                    </RadioGroup>
                  </div>

                  <div className="mb-6 rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-bold">
                          Programação manual das finais
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Crie blocos de final por quadra, dia e período. A
                          exceção de compatibilidade vale apenas para essas
                          finais programadas com reserva exclusiva do recurso.
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="secondary"
                        onClick={addKnockoutProgramBlock}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar bloco de final
                      </Button>
                    </div>

                    {knockoutProgramBlocks.length == 0 ? (
                      <div className="mt-4 rounded-lg border border-dashed border-border/40 bg-background/20 p-4 text-center text-sm text-muted-foreground">
                        Nenhum bloco manual configurado. Sem blocos, o mata-mata
                        final continua na distribuição genérica.
                      </div>
                    ) : (
                      <div className="mt-4 space-y-4">
                        {knockoutProgramBlocks.map(
                          (programBlock, programBlockIndex) => {
                            const programBlockKey =
                              resolveKnockoutProgramBlockKey(programBlock);
                            const availableCompetitionOptions =
                              collectiveCompetitionOptionsBySportId[
                                programBlock.sport_id
                              ] ?? [];
                            const availableLocationOptions =
                              scheduleLocationOptionsByDate[
                                programBlock.date
                              ] ?? [];
                            const availableCourtOptions =
                              resolveKnockoutProgramCourtOptions(
                                programBlock.date,
                                programBlock.location_key,
                              );
                            const availableNaipeOptions = [
                              ...new Set(
                                availableCompetitionOptions
                                  .filter((competitionOption) => {
                                    if (
                                      programBlock.division_scope != "ALL" &&
                                      competitionOption.division !=
                                        programBlock.division_scope
                                    ) {
                                      return false;
                                    }

                                    return true;
                                  })
                                  .map(
                                    (competitionOption) =>
                                      competitionOption.naipe,
                                  ),
                              ),
                            ];

                            return (
                              <div
                                key={`knockout-program-block-${programBlockKey}`}
                                className="rounded-xl border border-border/30 bg-background/40 p-4 shadow-sm"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-bold">
                                        Bloco {programBlockIndex + 1}
                                      </p>
                                      <AppBadge tone={AppBadgeTone.NEUTRAL}>
                                        Final
                                      </AppBadge>
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      As finais seguem a ordem dos naipes
                                      configurados aqui e não sofrem
                                      interleaving com outra modalidade dentro
                                      do bloco.
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      disabled={programBlockIndex == 0}
                                      onClick={() =>
                                        moveKnockoutProgramBlock(
                                          programBlockKey,
                                          -1,
                                        )
                                      }
                                      aria-label={`Mover bloco ${
                                        programBlockIndex + 1
                                      } para cima`}
                                      title="Mover bloco para cima"
                                    >
                                      <ArrowUp className="h-4 w-4" />
                                    </Button>

                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      disabled={
                                        programBlockIndex ==
                                        knockoutProgramBlocks.length - 1
                                      }
                                      onClick={() =>
                                        moveKnockoutProgramBlock(
                                          programBlockKey,
                                          1,
                                        )
                                      }
                                      aria-label={`Mover bloco ${
                                        programBlockIndex + 1
                                      } para baixo`}
                                      title="Mover bloco para baixo"
                                    >
                                      <ArrowDown className="h-4 w-4" />
                                    </Button>

                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        removeKnockoutProgramBlock(
                                          programBlockKey,
                                        )
                                      }
                                      aria-label={`Remover bloco ${
                                        programBlockIndex + 1
                                      } da programação das finais`}
                                      title="Remover bloco"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>

                                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                                  <div>
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                      Dia
                                    </p>
                                    <Select
                                      value={programBlock.date || "NONE"}
                                      onValueChange={(value) => {
                                        const nextDate =
                                          value == "NONE" ? "" : value;
                                        const nextLocationOption =
                                          scheduleLocationOptionsByDate[
                                            nextDate
                                          ]?.find(
                                            (locationOption) =>
                                              locationOption.location_key ==
                                              programBlock.location_key,
                                          ) ??
                                          scheduleLocationOptionsByDate[
                                            nextDate
                                          ]?.[0] ??
                                          null;
                                        const nextCourtOption =
                                          nextLocationOption
                                            ? (resolveKnockoutProgramCourtOptions(
                                                nextDate,
                                                nextLocationOption.location_key,
                                              ).find(
                                                (courtOption) =>
                                                  courtOption.court_key ==
                                                  programBlock.court_key,
                                              ) ??
                                              resolveKnockoutProgramCourtOptions(
                                                nextDate,
                                                nextLocationOption.location_key,
                                              )[0] ??
                                              null)
                                            : null;

                                        updateKnockoutProgramBlock(
                                          programBlockKey,
                                          (currentProgramBlock) => ({
                                            ...currentProgramBlock,
                                            date: nextDate,
                                            location_key:
                                              nextLocationOption?.location_key ??
                                              "",
                                            location_name:
                                              nextLocationOption?.location_name ??
                                              null,
                                            court_key:
                                              nextCourtOption?.court_key ?? "",
                                            court_name:
                                              nextCourtOption?.court_name ??
                                              null,
                                          }),
                                        );
                                      }}
                                    >
                                      <SelectTrigger className="h-10">
                                        <SelectValue placeholder="Selecione o dia" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {scheduleDayDates.map(
                                          (scheduleDate) => (
                                            <SelectItem
                                              key={scheduleDate}
                                              value={scheduleDate}
                                            >
                                              {resolveBrazilianDateString(
                                                scheduleDate,
                                              )}
                                            </SelectItem>
                                          ),
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div>
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                      Período
                                    </p>
                                    <Select
                                      value={programBlock.period}
                                      onValueChange={(value) =>
                                        updateKnockoutProgramBlock(
                                          programBlockKey,
                                          (currentProgramBlock) => ({
                                            ...currentProgramBlock,
                                            period:
                                              value as ChampionshipSchedulePeriod,
                                          }),
                                        )
                                      }
                                    >
                                      <SelectTrigger className="h-10">
                                        <SelectValue placeholder="Selecione o período" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {SCHEDULE_PERIODS.map((period) => (
                                          <SelectItem
                                            key={period}
                                            value={period}
                                          >
                                            {SCHEDULE_PERIOD_LABELS[period]}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div>
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                      Local
                                    </p>
                                    <Select
                                      value={
                                        programBlock.location_key || "NONE"
                                      }
                                      onValueChange={(value) => {
                                        const nextLocationKey =
                                          value == "NONE" ? "" : value;
                                        const nextLocationOption =
                                          availableLocationOptions.find(
                                            (locationOption) =>
                                              locationOption.location_key ==
                                              nextLocationKey,
                                          ) ?? null;
                                        const nextCourtOption =
                                          resolveKnockoutProgramCourtOptions(
                                            programBlock.date,
                                            nextLocationKey,
                                          )[0] ?? null;

                                        updateKnockoutProgramBlock(
                                          programBlockKey,
                                          (currentProgramBlock) => ({
                                            ...currentProgramBlock,
                                            location_key: nextLocationKey,
                                            location_name:
                                              nextLocationOption?.location_name ??
                                              null,
                                            court_key:
                                              nextCourtOption?.court_key ?? "",
                                            court_name:
                                              nextCourtOption?.court_name ??
                                              null,
                                          }),
                                        );
                                      }}
                                    >
                                      <SelectTrigger className="h-10">
                                        <SelectValue placeholder="Selecione o local" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {availableLocationOptions.map(
                                          (locationOption) => (
                                            <SelectItem
                                              key={locationOption.location_key}
                                              value={
                                                locationOption.location_key
                                              }
                                            >
                                              {locationOption.location_name}
                                            </SelectItem>
                                          ),
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>

                                <div
                                  className={cn(
                                    "mt-4 grid gap-4",
                                    seasonSettings.division_format ==
                                      ChampionshipSeasonDivisionFormat.UNIFIED
                                      ? "lg:grid-cols-4"
                                      : "lg:grid-cols-2",
                                  )}
                                >
                                  <div>
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                      Quadra / recurso
                                    </p>
                                    <Select
                                      value={programBlock.court_key || "NONE"}
                                      onValueChange={(value) => {
                                        const nextCourtKey =
                                          value == "NONE" ? "" : value;
                                        const nextCourtOption =
                                          availableCourtOptions.find(
                                            (courtOption) =>
                                              courtOption.court_key ==
                                              nextCourtKey,
                                          ) ?? null;

                                        updateKnockoutProgramBlock(
                                          programBlockKey,
                                          (currentProgramBlock) => ({
                                            ...currentProgramBlock,
                                            court_key: nextCourtKey,
                                            court_name:
                                              nextCourtOption?.court_name ??
                                              null,
                                          }),
                                        );
                                      }}
                                    >
                                      <SelectTrigger className="h-10">
                                        <SelectValue placeholder="Selecione a quadra" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {availableCourtOptions.map(
                                          (courtOption) => (
                                            <SelectItem
                                              key={courtOption.court_key}
                                              value={courtOption.court_key}
                                            >
                                              {courtOption.court_name}
                                            </SelectItem>
                                          ),
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div>
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                      Modalidade da final
                                    </p>
                                    <Select
                                      value={programBlock.sport_id || "NONE"}
                                      onValueChange={(value) => {
                                        const nextSportId =
                                          value == "NONE" ? "" : value;
                                        const nextCompetitionOptions =
                                          collectiveCompetitionOptionsBySportId[
                                            nextSportId
                                          ] ?? [];
                                        const nextNaipeSequence = [
                                          ...new Set(
                                            nextCompetitionOptions.map(
                                              (competitionOption) =>
                                                competitionOption.naipe,
                                            ),
                                          ),
                                        ];
                                        const nextDivisionScope =
                                          seasonSettings.division_format ==
                                          ChampionshipSeasonDivisionFormat.UNIFIED
                                            ? "ALL"
                                            : (nextCompetitionOptions[0]
                                                ?.division ??
                                              TeamDivision.DIVISAO_PRINCIPAL);

                                        updateKnockoutProgramBlock(
                                          programBlockKey,
                                          (currentProgramBlock) => ({
                                            ...currentProgramBlock,
                                            sport_id: nextSportId,
                                            division_scope: nextDivisionScope,
                                            naipe_sequence: nextNaipeSequence,
                                            match_duration_minutes_override:
                                              null,
                                          }),
                                        );
                                      }}
                                    >
                                      <SelectTrigger className="h-10">
                                        <SelectValue placeholder="Selecione a modalidade" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {collectiveSportOptions.map(
                                          (sportOption) => (
                                            <SelectItem
                                              key={sportOption.sport_id}
                                              value={sportOption.sport_id}
                                            >
                                              {sportOption.sport_name}
                                            </SelectItem>
                                          ),
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div>
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                      Duração de cada final
                                    </p>

                                    <div className="relative">
                                      <Input
                                        type="number"
                                        min={1}
                                        step={1}
                                        placeholder="Usar duração padrão"
                                        className="pr-12"
                                        value={
                                          programBlock.match_duration_minutes_override ??
                                          ""
                                        }
                                        onChange={(event) => {
                                          const nextValue = event.target.value;

                                          updateKnockoutProgramBlock(
                                            programBlockKey,
                                            (currentProgramBlock) => ({
                                              ...currentProgramBlock,
                                              match_duration_minutes_override:
                                                nextValue == ""
                                                  ? null
                                                  : Number(nextValue),
                                            }),
                                          );
                                        }}
                                      />

                                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">
                                        min
                                      </span>
                                    </div>
                                  </div>

                                  <div>
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                      Sequência dos naipes na final
                                    </p>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                      {WIZARD_NAIPE_TAB_DEFAULT_ORDER.filter(
                                        (naipeOption) =>
                                          availableNaipeOptions.includes(
                                            naipeOption,
                                          ),
                                      ).map((naipeOption) => {
                                        const isChecked =
                                          programBlock.naipe_sequence.includes(
                                            naipeOption,
                                          );

                                        return (
                                          <label
                                            key={`${programBlockKey}-${naipeOption}`}
                                            className="flex items-center gap-2 py-2 text-xs font-medium"
                                          >
                                            <Checkbox
                                              className={
                                                SQUARE_CHECKBOX_CLASS_NAME
                                              }
                                              checked={isChecked}
                                              onCheckedChange={(checked) =>
                                                updateKnockoutProgramBlock(
                                                  programBlockKey,
                                                  (currentProgramBlock) => {
                                                    const filteredNaipes =
                                                      currentProgramBlock.naipe_sequence.filter(
                                                        (naipe) =>
                                                          naipe != naipeOption,
                                                      );

                                                    return {
                                                      ...currentProgramBlock,
                                                      naipe_sequence:
                                                        checked == true
                                                          ? [
                                                              ...filteredNaipes,
                                                              naipeOption,
                                                            ]
                                                          : filteredNaipes,
                                                    };
                                                  },
                                                )
                                              }
                                            />
                                            {MATCH_NAIPE_LABELS[naipeOption]}
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                  {seasonSettings.division_format !=
                                  ChampionshipSeasonDivisionFormat.UNIFIED ? (
                                    <div>
                                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        Escopo da divisão
                                      </p>

                                      <Select
                                        value={programBlock.division_scope}
                                        onValueChange={(value) =>
                                          updateKnockoutProgramBlock(
                                            programBlockKey,
                                            (currentProgramBlock) => ({
                                              ...currentProgramBlock,
                                              division_scope:
                                                value == "ALL"
                                                  ? "ALL"
                                                  : (value as TeamDivision),
                                            }),
                                          )
                                        }
                                      >
                                        <SelectTrigger className="h-10">
                                          <SelectValue placeholder="Selecione o escopo" />
                                        </SelectTrigger>

                                        <SelectContent>
                                          <SelectItem value="ALL">
                                            Todas as divisões
                                          </SelectItem>

                                          {Object.values(TeamDivision).map(
                                            (divisionOption) => (
                                              <SelectItem
                                                key={divisionOption}
                                                value={divisionOption}
                                              >
                                                {
                                                  TEAM_DIVISION_LABELS[
                                                    divisionOption
                                                  ]
                                                }
                                              </SelectItem>
                                            ),
                                          )}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          },
                        )}
                      </div>
                    )}
                  </div>

                  {courtPreferenceStepRows.length == 0 ? (
                    <div className="rounded-xl border border-dashed border-border/40 bg-background/20 p-8 text-center text-sm text-muted-foreground">
                      Nenhuma quadra possui modalidades coletivas disponíveis
                      para configuração.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {courtPreferenceStepRows.map((preferenceRow) => (
                        <section
                          key={preferenceRow.key}
                          className="overflow-hidden rounded-xl border border-border/40 bg-background/30 shadow-sm"
                        >
                          <div className="flex flex-col gap-2 border-b border-border/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-base font-bold">
                                {preferenceRow.day_label}
                              </p>

                              <p className="mt-1 text-xs text-muted-foreground">
                                {preferenceRow.date_label}
                              </p>
                            </div>

                            <div className="text-right text-xs font-medium text-muted-foreground">
                              <p>
                                {preferenceRow.court_cards.length}{" "}
                                {preferenceRow.court_cards.length == 1
                                  ? "quadra"
                                  : "quadras"}
                              </p>

                              <p className="mt-1">
                                {preferenceRow.planned_match_count}{" "}
                                {preferenceRow.planned_match_count == 1
                                  ? "jogo automático planejado"
                                  : "jogos automáticos planejados"}
                              </p>
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <div
                              className="grid min-w-full gap-px bg-border/40"
                              style={{
                                gridTemplateColumns: `repeat(${Math.max(
                                  preferenceRow.court_cards.length,
                                  1,
                                )}, minmax(280px, 1fr))`,
                              }}
                            >
                              {preferenceRow.court_cards.map(
                                (preferenceCard) => {
                                  const currentPreference =
                                    preferenceCard.court.sport_preference;

                                  const preferredSportId =
                                    currentPreference?.preferred_sport_id ??
                                    null;

                                  const preferredSportOption =
                                    preferenceCard.sport_options.find(
                                      (sportOption) =>
                                        sportOption.sport_id ==
                                        preferredSportId,
                                    ) ?? null;

                                  const availableNaipeOptions =
                                    preferredSportOption?.naipe_options ?? [];

                                  const availableDivisionOptions =
                                    preferredSportOption?.division_options ??
                                    [];

                                  const currentSequenceMode: ChampionshipBracketCourtSequenceMode =
                                    currentPreference?.sequence_mode ??
                                    "FLEXIBLE";

                                  const canGroupByNaipe =
                                    availableNaipeOptions.length > 1;

                                  const canGroupByDivision =
                                    resolveUsesSeasonDivisions(
                                      seasonSettings,
                                    ) && availableDivisionOptions.length > 1;

                                  return (
                                    <div
                                      key={preferenceCard.key}
                                      className="min-w-0 bg-background/60 p-5"
                                    >
                                      <div className="flex items-start justify-between gap-4 border-b border-border/30 pb-4">
                                        <div className="min-w-0">
                                          <p className="text-sm font-bold">
                                            {preferenceCard.court.name ||
                                              "Quadra sem nome"}
                                          </p>

                                          <p className="mt-1 text-xs text-muted-foreground">
                                            {preferenceCard.location_name}
                                          </p>
                                        </div>

                                        <div className="shrink-0 text-right">
                                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                            Planejado
                                          </p>

                                          <p className="mt-1 text-sm font-bold">
                                            {preferenceCard.planned_match_count >
                                            0
                                              ? `${
                                                  preferenceCard.planned_match_count
                                                } ${
                                                  preferenceCard.planned_match_count ==
                                                  1
                                                    ? "jogo"
                                                    : "jogos"
                                                }`
                                              : "Nenhum"}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="mt-4 space-y-4">
                                        <div>
                                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                            Jogos planejados por modalidade
                                          </p>

                                          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                                            Defina quantos jogos de cada
                                            modalidade devem ser programados
                                            nesta quadra neste dia.
                                          </p>

                                          <div className="space-y-2">
                                            {preferenceCard.sport_options.map(
                                              (sportOption) => {
                                                const currentTarget =
                                                  preferenceCard.court.sport_match_targets.find(
                                                    (target) =>
                                                      target.sport_id ==
                                                      sportOption.sport_id,
                                                  ) ?? null;

                                                return (
                                                  <div
                                                    key={`${preferenceCard.key}-target-${sportOption.sport_id}`}
                                                    className="grid grid-cols-[minmax(0,1fr)_100px] items-center gap-3 rounded-lg border border-border/30 bg-background/30 px-3 py-2"
                                                  >
                                                    <div className="min-w-0">
                                                      <p className="truncate text-xs font-bold text-foreground">
                                                        {
                                                          sportOption.sport_name
                                                        }
                                                      </p>

                                                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                                                        Jogos automáticos neste
                                                        dia
                                                      </p>
                                                    </div>

                                                    <Input
                                                      type="number"
                                                      min={1}
                                                      step={1}
                                                      placeholder="0"
                                                      value={
                                                        currentTarget?.planned_match_count ??
                                                        ""
                                                      }
                                                      onChange={(event) => {
                                                        const nextValue =
                                                          event.target.value;

                                                        updateCourtSportMatchTarget(
                                                          preferenceCard.schedule_day_id,
                                                          preferenceCard.location_id,
                                                          preferenceCard.court.id,
                                                          sportOption.sport_id,
                                                          nextValue == ""
                                                            ? null
                                                            : Number(
                                                                nextValue,
                                                              ),
                                                        );
                                                      }}
                                                      className="h-9 text-center"
                                                    />
                                                  </div>
                                                );
                                              },
                                            )}
                                          </div>

                                          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                                            Campo vazio significa que essa
                                            modalidade não terá jogos
                                            automáticos nesta quadra neste dia.
                                            A quantidade inclui todos os naipes
                                            da modalidade. Finais programadas
                                            manualmente são tratadas
                                            separadamente.
                                          </p>
                                        </div>

                                        <div>
                                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                            Modalidade preferencial
                                          </p>

                                          <Select
                                            value={preferredSportId ?? "NONE"}
                                            onValueChange={(value) =>
                                              updateCourtSportPreference(
                                                preferenceCard.schedule_day_id,
                                                preferenceCard.location_id,
                                                preferenceCard.court.id,
                                                value == "NONE" ? null : value,
                                              )
                                            }
                                          >
                                            <SelectTrigger className="h-10">
                                              <SelectValue placeholder="Sem preferência" />
                                            </SelectTrigger>

                                            <SelectContent>
                                              <SelectItem value="NONE">
                                                Sem preferência
                                              </SelectItem>

                                              {preferenceCard.sport_options.map(
                                                (sportOption) => (
                                                  <SelectItem
                                                    key={sportOption.sport_id}
                                                    value={sportOption.sport_id}
                                                  >
                                                    {sportOption.sport_name}
                                                  </SelectItem>
                                                ),
                                              )}
                                            </SelectContent>
                                          </Select>
                                        </div>

                                        <div>
                                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                            Estratégia de sequenciamento
                                          </p>

                                          <Select
                                            disabled={preferredSportId == null}
                                            value={currentSequenceMode}
                                            onValueChange={(value) => {
                                              if (!preferredSportId) {
                                                return;
                                              }

                                              const nextSequenceMode =
                                                value as ChampionshipBracketCourtSequenceMode;

                                              if (
                                                nextSequenceMode ==
                                                "GROUP_NAIPE"
                                              ) {
                                                const nextPreferredNaipe =
                                                  currentPreference?.preferred_naipe !=
                                                    null &&
                                                  availableNaipeOptions.includes(
                                                    currentPreference.preferred_naipe,
                                                  )
                                                    ? currentPreference.preferred_naipe
                                                    : (availableNaipeOptions[0] ??
                                                      null);

                                                updateCourtSportPreference(
                                                  preferenceCard.schedule_day_id,
                                                  preferenceCard.location_id,
                                                  preferenceCard.court.id,
                                                  preferredSportId,
                                                  {
                                                    sequence_mode:
                                                      "GROUP_NAIPE",

                                                    preferred_naipe:
                                                      nextPreferredNaipe,

                                                    preferred_division: null,
                                                  },
                                                );

                                                return;
                                              }

                                              if (
                                                nextSequenceMode ==
                                                "GROUP_DIVISION"
                                              ) {
                                                const nextPreferredDivision =
                                                  currentPreference?.preferred_division !=
                                                    null &&
                                                  availableDivisionOptions.includes(
                                                    currentPreference.preferred_division,
                                                  )
                                                    ? currentPreference.preferred_division
                                                    : (availableDivisionOptions[0] ??
                                                      null);

                                                updateCourtSportPreference(
                                                  preferenceCard.schedule_day_id,
                                                  preferenceCard.location_id,
                                                  preferenceCard.court.id,
                                                  preferredSportId,
                                                  {
                                                    sequence_mode:
                                                      "GROUP_DIVISION",

                                                    preferred_naipe: null,

                                                    preferred_division:
                                                      nextPreferredDivision,
                                                  },
                                                );

                                                return;
                                              }

                                              updateCourtSportPreference(
                                                preferenceCard.schedule_day_id,
                                                preferenceCard.location_id,
                                                preferenceCard.court.id,
                                                preferredSportId,
                                                {
                                                  sequence_mode: "FLEXIBLE",
                                                },
                                              );
                                            }}
                                          >
                                            <SelectTrigger className="h-10">
                                              <SelectValue
                                                placeholder={
                                                  preferredSportId
                                                    ? "Distribuição flexível"
                                                    : "Selecione uma modalidade"
                                                }
                                              />
                                            </SelectTrigger>

                                            <SelectContent>
                                              <SelectItem value="FLEXIBLE">
                                                Distribuição flexível
                                              </SelectItem>

                                              {canGroupByNaipe ? (
                                                <SelectItem value="GROUP_NAIPE">
                                                  Agrupar por naipe
                                                </SelectItem>
                                              ) : null}

                                              {canGroupByDivision ? (
                                                <SelectItem value="GROUP_DIVISION">
                                                  Agrupar por divisão
                                                </SelectItem>
                                              ) : null}
                                            </SelectContent>
                                          </Select>

                                          {currentSequenceMode ==
                                          "GROUP_NAIPE" ? (
                                            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                                              O sistema prioriza manter os
                                              jogos do mesmo naipe agrupados.
                                              Se nenhum jogo desse naipe puder
                                              ocorrer no próximo horário, outro
                                              naipe da mesma modalidade poderá
                                              utilizar o espaço.
                                            </p>
                                          ) : null}

                                          {currentSequenceMode ==
                                          "GROUP_DIVISION" ? (
                                            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                                              O sistema prioriza manter os
                                              jogos da mesma divisão agrupados.
                                              Se nenhum jogo dessa divisão
                                              puder ocorrer no próximo horário,
                                              outra divisão da mesma modalidade
                                              poderá utilizar o espaço.
                                            </p>
                                          ) : null}
                                        </div>

                                        {currentSequenceMode !=
                                        "GROUP_DIVISION" ? (
                                          <div>
                                            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                              {currentSequenceMode ==
                                              "GROUP_NAIPE"
                                                ? "Primeiro naipe"
                                                : "Naipe preferencial"}
                                            </p>

                                            <Select
                                              disabled={
                                                preferredSportId == null
                                              }
                                              value={
                                                currentPreference?.preferred_naipe ??
                                                "NONE"
                                              }
                                              onValueChange={(value) => {
                                                if (!preferredSportId) {
                                                  return;
                                                }

                                                updateCourtSportPreference(
                                                  preferenceCard.schedule_day_id,
                                                  preferenceCard.location_id,
                                                  preferenceCard.court.id,
                                                  preferredSportId,
                                                  {
                                                    preferred_naipe:
                                                      value == "NONE"
                                                        ? null
                                                        : (value as MatchNaipe),
                                                  },
                                                );
                                              }}
                                            >
                                              <SelectTrigger className="h-10">
                                                <SelectValue
                                                  placeholder={
                                                    preferredSportId
                                                      ? "Sem preferência"
                                                      : "Selecione uma modalidade"
                                                  }
                                                />
                                              </SelectTrigger>

                                              <SelectContent>
                                                {currentSequenceMode ==
                                                "FLEXIBLE" ? (
                                                  <SelectItem value="NONE">
                                                    Sem preferência
                                                  </SelectItem>
                                                ) : null}

                                                {availableNaipeOptions.map(
                                                  (naipeOption) => (
                                                    <SelectItem
                                                      key={naipeOption}
                                                      value={naipeOption}
                                                    >
                                                      {
                                                        MATCH_NAIPE_LABELS[
                                                          naipeOption
                                                        ]
                                                      }
                                                    </SelectItem>
                                                  ),
                                                )}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        ) : null}

                                        {resolveUsesSeasonDivisions(
                                          seasonSettings,
                                        ) &&
                                        currentSequenceMode != "GROUP_NAIPE" ? (
                                          <div>
                                            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                              {currentSequenceMode ==
                                              "GROUP_DIVISION"
                                                ? "Primeira divisão"
                                                : "Divisão preferencial"}
                                            </p>

                                            <Select
                                              disabled={
                                                preferredSportId == null
                                              }
                                              value={
                                                currentPreference?.preferred_division ??
                                                "NONE"
                                              }
                                              onValueChange={(value) => {
                                                if (!preferredSportId) {
                                                  return;
                                                }

                                                updateCourtSportPreference(
                                                  preferenceCard.schedule_day_id,
                                                  preferenceCard.location_id,
                                                  preferenceCard.court.id,
                                                  preferredSportId,
                                                  {
                                                    preferred_division:
                                                      value == "NONE"
                                                        ? null
                                                        : (value as TeamDivision),
                                                  },
                                                );
                                              }}
                                            >
                                              <SelectTrigger className="h-10">
                                                <SelectValue
                                                  placeholder={
                                                    preferredSportId
                                                      ? "Sem preferência"
                                                      : "Selecione uma modalidade"
                                                  }
                                                />
                                              </SelectTrigger>

                                              <SelectContent>
                                                {currentSequenceMode ==
                                                "FLEXIBLE" ? (
                                                  <SelectItem value="NONE">
                                                    Sem preferência
                                                  </SelectItem>
                                                ) : null}

                                                {availableDivisionOptions.map(
                                                  (divisionOption) => (
                                                    <SelectItem
                                                      key={divisionOption}
                                                      value={divisionOption}
                                                    >
                                                      {
                                                        TEAM_DIVISION_LABELS[
                                                          divisionOption
                                                        ]
                                                      }
                                                    </SelectItem>
                                                  ),
                                                )}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {currentStepIndex == 12 ? (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                <div className="glass-card rounded-xl border border-border/50 p-6 shadow-sm">
                  <div className="border-b border-border/50 pb-4 mb-6">
                    <p className="text-lg font-bold">Revisão Final</p>
                    <p className="text-sm text-muted-foreground">
                      Confira a programação operacional antes de gerar o
                      chaveamento definitivo.
                    </p>
                  </div>

                  {loadingOperationalPreview ? (
                    <div className="mb-6 flex min-h-28 items-center justify-center rounded-xl border border-border/50 bg-muted/20">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Calculando grupos, mata-mata e ocupação das quadras...
                      </div>
                    </div>
                  ) : operationalPreviewError ? (
                    <Alert className="mb-6">
                      <AlertTitle>
                        Não foi possível calcular a prévia operacional
                      </AlertTitle>
                      <AlertDescription>
                        {operationalPreviewError}
                      </AlertDescription>
                    </Alert>
                  ) : operationalPreview?.summary ? (
                    <div className="mb-6 space-y-4">
                      <div className="grid grid-cols-5 gap-3">
                        <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                          <p className="text-xs font-medium text-muted-foreground">
                            Jogos totais
                          </p>
                          <p className="mt-1 text-2xl font-bold">
                            {operationalPreview.summary.total_matches}
                          </p>
                        </div>

                        <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                          <p className="text-xs font-medium text-muted-foreground">
                            Grupos
                          </p>
                          <p className="mt-1 text-2xl font-bold">
                            {operationalPreview.summary.group_stage_matches}
                          </p>
                        </div>

                        <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                          <p className="text-xs font-medium text-muted-foreground">
                            Mata-mata
                          </p>
                          <p className="mt-1 text-2xl font-bold">
                            {operationalPreview.summary.knockout_matches}
                          </p>
                        </div>

                        <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                          <p className="text-xs font-medium text-muted-foreground">
                            Janelas livres
                          </p>
                          <p className="mt-1 text-2xl font-bold">
                            {operationalPreview.summary.free_windows}
                          </p>
                        </div>

                        <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                          <p className="text-xs font-medium text-muted-foreground">
                            Conflitos
                          </p>
                          <p className="mt-1 text-2xl font-bold">
                            {operationalPreview.summary.conflict_count}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold">
                            Prévia operacional calculada
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {operationalPreview.days.length} dia(s) com timeline
                            disponível.
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-sm font-semibold">
                            {operationalPreview.summary.utilization_percentage}%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            ocupação geral
                          </p>
                        </div>
                      </div>

                      {operationalPreview.diagnostics.length > 0 ? (
                        <Alert>
                          <AlertTitle>
                            Pendências encontradas na programação
                          </AlertTitle>

                          <AlertDescription className="space-y-3">
                            <p>
                              {operationalPreview.diagnostics.length}{" "}
                              conflito(s) ou pendência(s) precisam ser
                              revisados.
                            </p>

                            <div className="space-y-2">
                              {operationalPreview.diagnostics.map(
                                (diagnostic, diagnosticIndex) => (
                                  <div
                                    key={[
                                      diagnostic.code,
                                      diagnostic.sport_id ?? "sem-modalidade",
                                      diagnostic.naipe ?? "sem-naipe",
                                      diagnostic.division ?? "sem-divisao",
                                      diagnostic.phase ?? "sem-fase",
                                      diagnosticIndex,
                                    ].join("::")}
                                    className="rounded-lg border border-border/50 bg-background/60 px-3 py-2"
                                  >
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <span className="text-sm font-semibold">
                                        {diagnostic.sport_name ?? "Programação"}
                                      </span>

                                      {diagnostic.naipe ? (
                                        <span className="text-xs text-muted-foreground">
                                          •{" "}
                                          {MATCH_NAIPE_LABELS[diagnostic.naipe]}
                                        </span>
                                      ) : null}

                                      {diagnostic.division ? (
                                        <span className="text-xs text-muted-foreground">
                                          •{" "}
                                          {
                                            TEAM_DIVISION_LABELS[
                                              diagnostic.division
                                            ]
                                          }
                                        </span>
                                      ) : null}

                                      {diagnostic.phase ? (
                                        <span className="text-xs text-muted-foreground">
                                          •{" "}
                                          {diagnostic.phase == "FINAL"
                                            ? "Final"
                                            : diagnostic.phase == "SEMIFINAL"
                                              ? "Semifinal"
                                              : diagnostic.phase ==
                                                  "QUARTERFINAL"
                                                ? "Quartas de final"
                                                : diagnostic.phase ==
                                                    "ROUND_OF_16"
                                                  ? "Oitavas de final"
                                                  : diagnostic.phase ==
                                                      "ROUND_OF_32"
                                                    ? "32-avos de final"
                                                    : "Fase de grupos"}
                                        </span>
                                      ) : null}
                                    </div>

                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {diagnostic.message}
                                    </p>

                                    <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">
                                      {diagnostic.code}
                                    </p>
                                  </div>
                                ),
                              )}
                            </div>
                          </AlertDescription>
                        </Alert>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                    <div className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Modalidades ativas
                      </p>
                      <p className="mt-2 text-2xl font-bold">
                        {enabledSportIds.length}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Atléticas participantes
                      </p>
                      <p className="mt-2 text-2xl font-bold">
                        {selectedTeamIds.length}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Competições ativas
                      </p>
                      <p className="mt-2 text-2xl font-bold">
                        {activeCompetitionKeys.length}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Dias de agenda
                      </p>
                      <p className="mt-2 text-2xl font-bold">
                        {scheduleDays.length}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Períodos globais ativos
                      </p>
                      <p className="mt-2 text-2xl font-bold">
                        {reviewSchedulePeriodEnabledCount}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Janelas por competição
                      </p>
                      <p className="mt-2 text-2xl font-bold">
                        {reviewCompetitionAvailabilityEnabledCount}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Janelas por atlética
                      </p>
                      <p className="mt-2 text-2xl font-bold">
                        {reviewTeamAvailabilityEnabledCount}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Sessões individuais
                      </p>
                      <p className="mt-2 text-2xl font-bold">
                        {reviewIndividualSessionSummaries.length}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Reservas de recurso
                      </p>
                      <p className="mt-2 text-2xl font-bold">
                        {reviewResourceLockSummaries.length}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Blocos de finais
                      </p>
                      <p className="mt-2 text-2xl font-bold">
                        {knockoutProgramBlockSummaries.length}
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 grid gap-6 xl:grid-cols-2">
                    <div className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                      <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
                        Modalidades habilitadas
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {reviewEnabledSportSummaries.map(
                          (enabledSportSummary) => (
                            <AppBadge
                              key={`review-enabled-sport-${enabledSportSummary.key}`}
                              tone={
                                enabledSportSummary.type == "Individual"
                                  ? AppBadgeTone.SKY
                                  : AppBadgeTone.NEUTRAL
                              }
                            >
                              {enabledSportSummary.name}
                            </AppBadge>
                          ),
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                      <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
                        Diagnóstico final
                      </p>
                      {reviewDiagnosticItems.length == 0 ? (
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200">
                          Nenhum conflito estrutural encontrado no setup atual.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {reviewDiagnosticItems.map((diagnosticItem) => (
                            <div
                              key={diagnosticItem.key}
                              className={cn(
                                "rounded-lg border px-3 py-3 text-sm",
                                diagnosticItem.tone == "red"
                                  ? "border-rose-500/20 bg-rose-500/10 text-rose-100"
                                  : "border-amber-500/20 bg-amber-500/10 text-amber-100",
                              )}
                            >
                              <p className="font-bold">
                                {diagnosticItem.title}
                              </p>
                              <p className="mt-1 text-xs opacity-90">
                                {diagnosticItem.description}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-8 rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                    <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
                      Agenda configurada
                    </p>
                    <div className="space-y-2">
                      {reviewScheduleDaySummaries.map((scheduleDaySummary) => (
                        <div
                          key={scheduleDaySummary.key}
                          className="rounded-lg border border-border/30 bg-background/40 px-3 py-2 text-xs"
                        >
                          <span className="font-bold text-foreground">
                            {scheduleDaySummary.day_label}:
                          </span>{" "}
                          {scheduleDaySummary.date} •{" "}
                          {scheduleDaySummary.start_time} até{" "}
                          {scheduleDaySummary.end_time}
                          {scheduleDaySummary.break_start_time &&
                          scheduleDaySummary.break_end_time
                            ? ` • Intervalo ${scheduleDaySummary.break_start_time} até ${scheduleDaySummary.break_end_time}`
                            : ""}
                          <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                            <span>
                              {scheduleDaySummary.location_count} locais
                            </span>
                            <div className="h-1 w-1 rounded-full bg-border" />
                            <span>
                              {scheduleDaySummary.total_courts} quadras
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-8 grid gap-6 xl:grid-cols-3">
                    <div className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                      <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
                        Resumo das disponibilidades
                      </p>
                      <div className="space-y-2 text-xs text-muted-foreground">
                        <p>
                          {reviewSchedulePeriodEnabledCount} períodos globais
                          habilitados.
                        </p>
                        <p>
                          {reviewCompetitionAvailabilityEnabledCount}{" "}
                          combinações ativas de competição, dia e período.
                        </p>
                        <p>
                          {reviewTeamAvailabilityEnabledCount} combinações
                          ativas de atlética, competição, dia e período.
                        </p>
                      </div>
                    </div>

                    {selectedIndividualSports.length > 0 ? (
                      <div className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                        <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
                          Pontuação das individuais
                        </p>
                        <div className="space-y-2">
                          {reviewIndividualEventConfigSummaries.map(
                            (configSummary) => (
                              <div
                                key={`review-individual-config-${configSummary.key}`}
                                className="rounded-lg border border-border/30 bg-background/40 px-3 py-2 text-xs"
                              >
                                <span className="font-bold text-foreground">
                                  {configSummary.sport_name}
                                </span>
                                {` • ${configSummary.placements_count} colocações • revezamento x${configSummary.relay_multiplier}`}
                                <div className="mt-1 text-muted-foreground">
                                  {configSummary.points_summary}
                                  {configSummary.placements_count > 4
                                    ? " • ..."
                                    : ""}
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    ) : null}

                    {selectedIndividualSports.length > 0 ? (
                      <div className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                        <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
                          Sessões individuais
                        </p>
                        <div className="space-y-2">
                          {reviewIndividualSessionSummaries.map(
                            (sessionSummary) => {
                              return (
                                <div
                                  key={`review-individual-session-${sessionSummary.key}`}
                                  className="rounded-lg border border-border/30 bg-background/40 px-3 py-2 text-xs"
                                >
                                  <span className="font-bold text-foreground">
                                    {sessionSummary.label}
                                  </span>
                                  {sessionSummary.has_slot
                                    ? ` • ${resolveBrazilianDateString(
                                        sessionSummary.scheduled_date ?? "",
                                      )} • ${
                                        sessionSummary.period
                                          ? SCHEDULE_PERIOD_LABELS[
                                              sessionSummary.period
                                            ]
                                          : "--"
                                      } • ${
                                        sessionSummary.resource_label ??
                                        "recurso pendente"
                                      }${
                                        sessionSummary.exclusive_lock_enabled
                                          ? " • bloqueio duro"
                                          : ""
                                      }`
                                    : " • slot oficial pendente"}
                                </div>
                              );
                            },
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {knockoutProgramBlockSummaries.length > 0 ? (
                    <div className="mt-8 rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm">
                      <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
                        Programação das finais
                      </p>
                      <div className="grid gap-3 xl:grid-cols-2">
                        {knockoutProgramBlockSummaries.map(
                          (programBlockSummary) => (
                            <div
                              key={`review-knockout-program-block-${programBlockSummary.key}`}
                              className="rounded-lg border border-border/30 bg-background/40 px-3 py-3 text-xs"
                            >
                              <p className="font-bold text-foreground">
                                {programBlockSummary.label}
                              </p>
                              <p className="mt-1 text-muted-foreground">
                                {programBlockSummary.slot_label}
                              </p>
                              <p className="mt-1 text-muted-foreground">
                                {programBlockSummary.division_label} •{" "}
                                {programBlockSummary.naipe_label} • bloco{" "}
                                {programBlockSummary.display_order}
                              </p>
                              <p className="mt-1 text-muted-foreground">
                                {programBlockSummary.duration_label}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-8 space-y-6">
                    <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                      Visualização dos grupos por modalidade
                    </p>

                    <div className="grid gap-6">
                      {sortedActiveCompetitionKeys.map((competitionKey) => {
                        const competitionOption =
                          competitionOptionsByKey.get(competitionKey);
                        const competitionConfig =
                          competitionConfigByKey[competitionKey];
                        const participantTeamIds =
                          teamIdsByCompetitionKey[competitionKey] ?? [];
                        const groupSummaries =
                          reviewCompetitionGroupSummariesByCompetitionKey[
                            competitionKey
                          ] ?? [];
                        const qualificationSummary =
                          resolveChampionshipBracketQualificationSummary({
                            groups_count: competitionConfig?.groups_count ?? 0,
                            qualifiers_per_group:
                              competitionConfig?.qualifiers_per_group ?? 1,
                            should_complete_knockout_with_best_second_placed_teams:
                              competitionConfig?.should_complete_knockout_with_best_second_placed_teams,
                          });
                        const projectedKnockoutSummary =
                          resolveChampionshipBracketProjectedKnockoutSummary({
                            groups_count: competitionConfig?.groups_count ?? 0,
                            qualifiers_per_group:
                              competitionConfig?.qualifiers_per_group ?? 1,
                            should_complete_knockout_with_best_second_placed_teams:
                              competitionConfig?.should_complete_knockout_with_best_second_placed_teams,
                          });

                        if (!competitionOption || !competitionConfig) {
                          return null;
                        }

                        return (
                          <div
                            key={`review-${competitionKey}`}
                            className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/40 pb-4 mb-4">
                              <div className="space-y-1">
                                <p className="text-base font-bold">
                                  {competitionOption.sport_name} •{" "}
                                  {MATCH_NAIPE_LABELS[competitionOption.naipe]}
                                  {competitionOption.division
                                    ? ` • ${TEAM_DIVISION_LABELS[competitionOption.division]}`
                                    : ""}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>
                                    {participantTeamIds.length} atléticas
                                  </span>
                                  <div className="h-1 w-1 rounded-full bg-border" />
                                  <span>
                                    {competitionConfig.groups_count} grupos
                                  </span>
                                  <div className="h-1 w-1 rounded-full bg-border" />
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-semibold text-primary">
                                  {qualificationSummary}
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {projectedKnockoutSummary}
                                </p>
                              </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                              {groupSummaries.map((groupSummary) => {
                                return (
                                  <div
                                    key={`${competitionKey}-review-group-${groupSummary.group_number}`}
                                    className="rounded-lg bg-background/40 p-3 border border-border/30"
                                  >
                                    <p className="text-xs font-bold text-muted-foreground mb-2">
                                      {resolveChampionshipGroupLabel(
                                        groupSummary.group_number,
                                      )}
                                    </p>
                                    <div className="flex flex-col gap-1.5">
                                      {groupSummary.teams.length == 0 ? (
                                        <span className="text-[10px] text-muted-foreground italic">
                                          Sem atléticas
                                        </span>
                                      ) : (
                                        groupSummary.teams.map((groupTeam) => (
                                          <div
                                            key={`${competitionKey}-review-group-${groupSummary.group_number}-${groupTeam.id}`}
                                            className="flex items-center gap-2"
                                          >
                                            <div className="h-1 w-1 rounded-full bg-primary/40" />
                                            <span className="text-xs font-medium">
                                              {groupTeam.name}
                                            </span>
                                          </div>
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
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-4 mt-2 bg-background/40 p-4 rounded-2xl backdrop-blur-md shadow-lg">
            <div className="flex flex-col gap-1">
              <Button
                variant="outline"
                size="lg"
                className="px-8 border-border/40 bg-background/40 hover:bg-background/60 font-bold transition-all"
                onClick={() => {
                  void handleSaveDraft();
                }}
                disabled={isDraftSaveDisabled}
              >
                Salvar rascunho
              </Button>
              {draftLastUpdatedLabel ? (
                <p className="text-[11px] text-muted-foreground">
                  {draftLastUpdatedLabel}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="lg"
                className="px-8 border-border/40 bg-background/40 hover:bg-background/60 font-bold transition-all"
                onClick={handlePreviousStep}
                disabled={currentStepIndex == 0 || saving}
              >
                Voltar
              </Button>

              {currentStepIndex < WIZARD_STEP_LABELS.length - 1 ? (
                <Button
                  size="lg"
                  className="px-10 bg-primary hover:bg-primary/90 text-white font-bold shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  onClick={() => {
                    void handleNextStep();
                  }}
                  disabled={saving}
                >
                  Próximo
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="px-10 bg-primary hover:bg-primary/90 text-white font-bold shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  onClick={handleSave}
                  disabled={isCreateButtonDisabled}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : null}
                  Criar campeonato
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={locationTemplateSelectionDayId != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            handleCloseLocationTemplateSelectionModal();
          }
        }}
      >
        <DialogContent className="max-h-[88vh] w-[960px] max-w-[95vw] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar local do catálogo</DialogTitle>
            <DialogDescription>
              Reaproveite um local global já cadastrado e adicione-o ao dia
              atual da agenda.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-border/40 bg-background/30 px-3 py-2 text-sm text-muted-foreground">
              {selectedLocationTemplateScheduleDay?.date
                ? `Dia ${resolveBrazilianDateString(selectedLocationTemplateScheduleDay.date)}`
                : "Selecione um local do catálogo para este dia."}
            </div>

            {availableLocationTemplatesForSelection.length == 0 ? (
              <div className="rounded-xl border border-dashed border-border/40 bg-background/20 p-8 text-center">
                <p className="text-sm font-bold">Nenhum local disponível</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Todos os locais do catálogo já foram adicionados a este dia ou
                  ainda não existe local global cadastrado.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {availableLocationTemplatesForSelection.map(
                  (locationTemplate) => (
                    <div
                      key={`location-template-selection-${locationTemplate.id}`}
                      className="rounded-xl border border-border/40 bg-background/30 p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-bold">
                            {locationTemplate.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {locationTemplate.courts.length}{" "}
                            {locationTemplate.courts.length == 1
                              ? "recurso/quadra cadastrado"
                              : "recursos/quadras cadastrados"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {resolveLocationCatalogSupportSummary(
                              locationTemplate,
                              selectedSportOptions,
                            ) || "Sem modalidades vinculadas"}
                          </p>
                        </div>

                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            if (locationTemplateSelectionDayId == null) {
                              return;
                            }

                            handleSelectLocationTemplateForDay(
                              locationTemplateSelectionDayId,
                              locationTemplate.id,
                            );
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Adicionar
                        </Button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}

            <div className="flex items-center justify-end">
              <Button
                variant="outline"
                onClick={handleCloseLocationTemplateSelectionModal}
              >
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={locationTemplateModalOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            handleCloseLocationTemplateModal();
          }
        }}
      >
        <DialogContent className="max-h-[88vh] w-[1120px] max-w-[95vw] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditingLocationTemplate ? "Editar local" : "Cadastrar local"}
            </DialogTitle>
            <DialogDescription>
              Defina o local, os recursos/quadras e as modalidades suportadas
              para reutilizar esse cadastro em próximos campeonatos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome do local</Label>
              <Input
                value={locationTemplateModalFormValues.name}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setLocationTemplateModalFormValues(
                    (currentLocationTemplateModalFormValues) => ({
                      ...currentLocationTemplateModalFormValues,
                      name: nextName,
                    }),
                  );
                }}
                placeholder="Ex.: Praia de Piçarras"
                className="app-input-field"
              />
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">
                  Recursos/quadras do local
                </p>
                <p className="text-xs text-muted-foreground">
                  Organize os recursos em cards compactos e marque as
                  modalidades que podem usar cada um deles.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {locationTemplateModalFormValues.courts.map(
                  (court, courtIndex) => (
                    <div
                      key={court.id}
                      className="relative rounded-xl border border-transparent bg-background/50 p-3 shadow-[0_8px_16px_rgba(15,23,42,0.1)] dark:border-border/70 dark:shadow-none"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">
                          Recurso {courtIndex + 1}
                        </p>
                        {locationTemplateModalFormValues.courts.length > 1 ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title="Remover recurso"
                            aria-label="Remover recurso"
                            onClick={() =>
                              handleRemoveLocationTemplateModalCourt(court.id)
                            }
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        ) : null}
                      </div>

                      <div className="mt-3 space-y-3">
                        <div className="space-y-1.5">
                          <Label>Nome do recurso/quadra</Label>
                          <Input
                            value={court.name}
                            onChange={(event) => {
                              const nextCourtName = event.target.value;
                              updateLocationTemplateModalCourt(
                                court.id,
                                (currentCourt) => ({
                                  ...currentCourt,
                                  name: nextCourtName,
                                }),
                              );
                            }}
                            placeholder={`Recurso ${courtIndex + 1}`}
                            className="app-input-field h-10"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Modalidades disponíveis</Label>
                          {selectedSportOptions.length == 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Nenhuma modalidade selecionada no wizard para
                              vincular a este recurso/quadra.
                            </p>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {selectedSportOptions.map((sportOption) => {
                                const isSelected = court.sport_ids.includes(
                                  sportOption.id,
                                );

                                return (
                                  <label
                                    key={`${court.id}-${sportOption.id}`}
                                    className="flex items-center gap-2 rounded-md bg-background/40 px-2 py-1.5 text-xs"
                                  >
                                    <Checkbox
                                      className={SQUARE_CHECKBOX_CLASS_NAME}
                                      checked={isSelected}
                                      onCheckedChange={(checked) => {
                                        updateLocationTemplateModalCourt(
                                          court.id,
                                          (currentCourt) => {
                                            if (checked == true) {
                                              if (
                                                currentCourt.sport_ids.includes(
                                                  sportOption.id,
                                                )
                                              ) {
                                                return currentCourt;
                                              }

                                              return {
                                                ...currentCourt,
                                                sport_ids: [
                                                  ...currentCourt.sport_ids,
                                                  sportOption.id,
                                                ],
                                              };
                                            }

                                            const nextSportIds =
                                              currentCourt.sport_ids.filter(
                                                (sportId) =>
                                                  sportId != sportOption.id,
                                              );

                                            const shouldClearSportPreference =
                                              currentCourt.sport_preference
                                                ?.preferred_sport_id ==
                                              sportOption.id;

                                            return {
                                              ...currentCourt,
                                              sport_ids: nextSportIds,
                                              sport_preference:
                                                shouldClearSportPreference
                                                  ? null
                                                  : currentCourt.sport_preference,
                                            };
                                          },
                                        );
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
                  ),
                )}

                <button
                  type="button"
                  className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-destructive/35 bg-destructive/10 p-4 text-center text-destructive transition hover:border-destructive/55 hover:bg-destructive/15"
                  onClick={handleAddLocationTemplateModalCourt}
                >
                  <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-destructive/10">
                    <Plus className="h-5 w-5" />
                  </span>
                  <span className="font-semibold">Adicionar recurso</span>
                  <span className="mt-1 text-xs text-destructive/80">
                    Novo recurso/quadra para este local
                  </span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleCloseLocationTemplateModal}
                disabled={savingLocationTemplate}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveLocationTemplate}
                disabled={
                  savingLocationTemplate || selectedSportOptions.length == 0
                }
              >
                {savingLocationTemplate ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Salvar local
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={locationTemplateDeletionTarget != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !deletingLocationTemplate) {
            setLocationTemplateDeletionTarget(null);
          }
        }}
      >
        <DialogContent className="w-[460px] max-w-[92vw]">
          <DialogHeader>
            <DialogTitle>Apagar local permanentemente</DialogTitle>
            <DialogDescription>
              Este local será removido do catálogo global e sairá de todos os
              dias já selecionados neste wizard.
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
              <Button
                variant="destructive"
                disabled={deletingLocationTemplate}
                onClick={handleDeleteLocationTemplate}
              >
                {deletingLocationTemplate ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Apagar local
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showDrawModal ? (
        <AdminBracketDrawModal
          open={showDrawModal}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              handleCloseDrawModal();
            }
          }}
          onConfirm={handleDrawConfirm}
          onResultReady={handleDrawResultReady}
          drawnTeamId={pendingDrawResult?.teamId ?? null}
          drawingTeamIds={drawingTeamIds}
          teamNameById={teamNameById}
          competitionOption={drawingCompetitionOption}
          groupNumber={pendingDrawResult?.groupNumber ?? null}
        />
      ) : null}
    </>
  );
}
