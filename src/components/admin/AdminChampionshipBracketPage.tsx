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
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Copy,
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
  ChampionshipSeasonDivisionFormat,
  ChampionshipSeasonDivisionSettlementMode,
  ChampionshipSportNaipeMode,
  MatchNaipe,
  TeamDivision,
} from "@/lib/enums";
import {
  MATCH_NAIPE_BADGE_TONES,
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
  resolveChampionshipBracketExactPreviewCacheValidity,
  resolveChampionshipBracketExactPreviewPayloadSignature,
  resolveChampionshipBracketSportMatchTargetRecommendations,
  resolveChampionshipBracketStructuralReview,
} from "@/domain/championship-brackets/championshipBracketStructuralReview";
import { resolveIndividualSessionSharedSlotKey } from "@/domain/championship-brackets/championshipBracketIndividualSessionSharing";
import {
  resolveFixedTimeRangeInterval,
  resolveScheduleDayInterval,
  resolveTimeIntervalsOverlap,
} from "@/domain/championship-brackets/championshipBracketFixedTimeRange";
import {
  resolveSelectableChampionshipTeams,
  resolveAutomaticKnockoutProgramNaipeSequence,
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
  cancelChampionshipBracketPreviewJob,
  createChampionshipBracketFromPreviewJob,
  deleteChampionshipBracketLocationTemplate,
  fetchChampionshipBracketPreviewJobDay,
  fetchChampionshipBracketPreviewJobStatus,
  fetchChampionshipBracketLocationTemplates,
  saveChampionshipBracketLocationTemplate,
  startChampionshipBracketPreviewJob,
} from "@/domain/championship-brackets/championshipBracket.repository";
import { saveChampionshipSeasonSettings } from "@/domain/championship-seasons/championshipSeason.repository";
import {
  syncChampionshipIndividualEventsFromSetup,
  syncChampionshipIndividualSessionsFromSetup,
} from "@/domain/individual-events/championshipIndividualEvents.repository";
import { useChampionshipSeasonSettings } from "@/hooks/useChampionshipSeasonSettings";
import type {
  ChampionshipBracketCompetitionMatchTargetRecommendationSummary,
  ChampionshipBracketCompetitionConfigDraft,
  ChampionshipBracketCompetitionInput,
  ChampionshipBracketCourtSequenceMode,
  ChampionshipBracketCourtSportMatchTargetPlanningMode,
  ChampionshipBracketExactPreviewCache,
  ChampionshipBracketCourtSportMatchTargetInput,
  ChampionshipBracketCourtSportPreferenceInput,
  ChampionshipBracketResourceLockInput,
  ChampionshipBracketSportMatchTargetRecommendationLine,
  ChampionshipBracketSportMatchTargetRecommendationSummary,
  ChampionshipBracketMatchNumberingMode,
  ChampionshipBracketLocationTemplate,
  ChampionshipBracketLocationTemplateSaveInput,
  ChampionshipBracketRemoteDraftMetadata,
  ChampionshipBracketIndividualEventConfigInput,
  ChampionshipBracketSetupFormValues,
  ChampionshipBracketLocationInput,
  ChampionshipBracketKnockoutProgramBlockInput,
  ChampionshipBracketParticipantInput,
  ChampionshipBracketPreviewResult,
  ChampionshipBracketPreviewJob,
  ChampionshipSeasonSettingsInput,
  ChampionshipBracketScheduleCourtDraft,
  ChampionshipBracketScheduleDayDraft,
  ChampionshipBracketScheduleDayInput,
  ChampionshipBracketScheduleLocationDraft,
  ChampionshipBracketStructuralReviewCourt,
  ChampionshipBracketStructuralReviewResult,
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
import { TimeInput } from "@/components/ui/time-input";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

function ChampionshipBracketFieldLabel({
  label,
  helpText,
}: {
  label: string;
  helpText?: string | null;
}) {
  return (
    <div className="mb-1 min-h-[32px]">
      <div className="inline-flex max-w-full items-center gap-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>

        {helpText ? (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={`Ajuda sobre ${label.toLowerCase()}`}
                >
                  <CircleHelp className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>

              <TooltipContent className="max-w-xs whitespace-pre-line text-xs leading-relaxed">
                {helpText}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
    </div>
  );
}

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

function resolveAutomaticKnockoutProgramBlockNaipeSequence({
  competitionOptions,
  divisionScope,
  divisionFormat,
}: {
  competitionOptions: ChampionshipBracketWizardCompetitionOption[];
  divisionScope: TeamDivision | "ALL";
  divisionFormat: ChampionshipSeasonDivisionFormat;
}): MatchNaipe[] {
  const availableNaipes = [
    ...new Set(
      competitionOptions
        .filter(
          (competitionOption) =>
            divisionFormat == ChampionshipSeasonDivisionFormat.UNIFIED ||
            divisionScope == "ALL" ||
            competitionOption.division == divisionScope,
        )
        .map((competitionOption) => competitionOption.naipe),
    ),
  ];

  return resolveAutomaticKnockoutProgramNaipeSequence(availableNaipes);
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
    highest_unlocked_step_index: 0,
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
    competition_date_availability: [],
    team_competition_date_availability: [],
    individual_event_configs: [],
    individual_session_configs: [],
    resource_locks: [],
    match_numbering_mode: "COURT",
    knockout_program_blocks: [],
    exact_preview_cache: null,
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
    !sessionConfig.start_time ||
    !sessionConfig.end_time ||
    !sessionConfig.location_key ||
    !sessionConfig.court_key
  ) {
    return null;
  }

  return {
    date: sessionConfig.scheduled_date,
    start_time: sessionConfig.start_time,
    end_time: sessionConfig.end_time,
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

function isGenericManualCourtResourceLock(
  resourceLock: ChampionshipBracketResourceLockInput,
) {
  return (
    resourceLock.lock_mode == "HARD" &&
    !resourceLock.sport_id &&
    resourceLock.naipe == null &&
    resourceLock.division == null
  );
}

function resolveCourtDayResourceLockKey(input: {
  date: string;
  location_key: string;
  court_key: string;
}) {
  return [input.date, input.location_key, input.court_key].join("::");
}

function resolveKnockoutProgramBlockKey(
  programBlock: ChampionshipBracketKnockoutProgramBlockInput,
) {
  return [
    programBlock.date,
    programBlock.start_time,
    programBlock.end_time,
    programBlock.location_key,
    programBlock.court_key,
    programBlock.sport_id,
    programBlock.division_scope,
    programBlock.display_order,
  ].join("::");
}

function resolveKnockoutProgramBlockConfigurationKey(
  programBlock: ChampionshipBracketKnockoutProgramBlockInput,
) {
  return [
    programBlock.date,
    programBlock.start_time,
    programBlock.end_time,
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

function resolveMinutesToTimeValue(minutes: number): string {
  const safeMinutes = Math.max(0, Math.trunc(minutes));
  const hourValue = Math.floor(safeMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minuteValue = (safeMinutes % 60).toString().padStart(2, "0");

  return `${hourValue}:${minuteValue}`;
}

function resolveMinutesWithHourLabel(minutes: number): string {
  const safeMinutes = Math.max(0, Math.trunc(minutes));
  const hourValue = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;

  if (remainingMinutes == 0) {
    return `${hourValue}h`;
  }

  return `${hourValue}h ${remainingMinutes.toString().padStart(2, "0")}min`;
}

function resolveMinuteSummaryLabel(minutes: number): string {
  return `${minutes} min (${resolveMinutesWithHourLabel(minutes)})`;
}

function resolveTimeRangeDurationMinutes(
  startTime: string,
  endTime: string,
): number | null {
  const startMinutes = resolveTimeValueToMinutes(startTime);
  const endMinutes = resolveTimeValueToMinutes(endTime);

  if (
    startMinutes == null ||
    endMinutes == null ||
    endMinutes <= startMinutes
  ) {
    return null;
  }

  return endMinutes - startMinutes;
}

function resolveStructuralDiagnosticTitle(
  diagnostic: ChampionshipBracketStructuralReviewResult["diagnostics"][number],
): string {
  switch (diagnostic.code) {
    case "STRUCTURAL_COLLECTIVE_SPORT_WITHOUT_TARGET":
      return "Modalidade coletiva sem quantidade planejada";

    case "STRUCTURAL_TARGET_WITHOUT_PLAYABLE_WINDOW":
      return "Quantidade planejada em data incompatível";

    case "STRUCTURAL_RESTRICTED_TEAM_AVAILABILITY":
      return "Disponibilidade das atléticas muito apertada";

    case "STRUCTURAL_COURT_DAY_OVERFLOW":
      return "Planejamento acima do espaço disponível";

    case "STRUCTURAL_FIXED_BLOCK_CONFLICT":
      return "Horários fixos em conflito";

    default:
      return diagnostic.severity == "ERROR" ? "Erro de configuração" : "Aviso";
  }
}

function resolveEstimatedMatchEntryToneClassName(
  entry: ChampionshipBracketStructuralReviewResult["days"][number]["locations"][number]["courts"][number]["estimated_match_entries"][number],
): string {
  if (entry.phase == "GROUP_STAGE") {
    return "border-emerald-500/20 bg-emerald-500/10 dark:border-emerald-500/30 dark:bg-emerald-950/35";
  }

  return "border-emerald-500/20 bg-emerald-500/10 dark:border-emerald-500/30 dark:bg-emerald-950/35";
}

type StructuralReviewCourtDisplayEntry =
  | {
      kind: "TIMELINE";
      key: string;
      start_minutes: number;
      end_minutes: number;
      entry: ChampionshipBracketStructuralReviewResult["days"][number]["locations"][number]["courts"][number]["timeline_entries"][number];
    }
  | {
      kind: "ESTIMATED";
      key: string;
      start_minutes: number;
      end_minutes: number;
      entry: ChampionshipBracketStructuralReviewResult["days"][number]["locations"][number]["courts"][number]["estimated_match_entries"][number];
    };

function resolveStructuralReviewCourtDisplayEntries(
  reviewDay: ChampionshipBracketStructuralReviewResult["days"][number],
  court: ChampionshipBracketStructuralReviewResult["days"][number]["locations"][number]["courts"][number],
): StructuralReviewCourtDisplayEntry[] {
  const estimatedEntries = [...court.estimated_match_entries].sort(
    (left, right) => {
      const leftStartMinutes = resolveTimeValueToMinutes(left.start_time) ?? 0;
      const rightStartMinutes =
        resolveTimeValueToMinutes(right.start_time) ?? 0;

      if (leftStartMinutes != rightStartMinutes) {
        return leftStartMinutes - rightStartMinutes;
      }

      return left.match_number - right.match_number;
    },
  );
  const consumedEstimatedEntryKeySet = new Set<string>();
  const displayEntries: StructuralReviewCourtDisplayEntry[] = [];

  court.timeline_entries.forEach((timelineEntry, timelineEntryIndex) => {
    const timelineStartMinutes =
      resolveTimeValueToMinutes(timelineEntry.start_time) ?? 0;
    const timelineEndMinutes =
      resolveTimeValueToMinutes(timelineEntry.end_time) ?? 0;

    if (timelineEntry.type != "FREE_WINDOW") {
      displayEntries.push({
        kind: "TIMELINE",
        key: `timeline-${reviewDay.date}-${court.court_key}-${timelineEntryIndex}`,
        start_minutes: timelineStartMinutes,
        end_minutes: timelineEndMinutes,
        entry: timelineEntry,
      });
      return;
    }

    const freeWindowEstimatedEntries = estimatedEntries.filter(
      (estimatedEntry) => {
        const estimatedEntryKey = [
          estimatedEntry.match_number,
          estimatedEntry.sport_id,
          estimatedEntry.naipe,
          estimatedEntry.phase_label,
          estimatedEntry.start_time,
        ].join("::");
        const estimatedStartMinutes =
          resolveTimeValueToMinutes(estimatedEntry.start_time) ?? 0;
        const estimatedEndMinutes =
          resolveTimeValueToMinutes(estimatedEntry.end_time) ?? 0;

        if (consumedEstimatedEntryKeySet.has(estimatedEntryKey)) {
          return false;
        }

        return (
          estimatedStartMinutes >= timelineStartMinutes &&
          estimatedEndMinutes <= timelineEndMinutes
        );
      },
    );

    let currentCursorMinutes = timelineStartMinutes;

    freeWindowEstimatedEntries.forEach(
      (estimatedEntry, estimatedEntryIndex) => {
        const estimatedEntryKey = [
          estimatedEntry.match_number,
          estimatedEntry.sport_id,
          estimatedEntry.naipe,
          estimatedEntry.phase_label,
          estimatedEntry.start_time,
        ].join("::");
        const estimatedStartMinutes =
          resolveTimeValueToMinutes(estimatedEntry.start_time) ??
          currentCursorMinutes;
        const estimatedEndMinutes =
          resolveTimeValueToMinutes(estimatedEntry.end_time) ??
          estimatedStartMinutes;

        if (estimatedStartMinutes > currentCursorMinutes) {
          displayEntries.push({
            kind: "TIMELINE",
            key: `free-window-segment-${reviewDay.date}-${court.court_key}-${timelineEntryIndex}-${estimatedEntryIndex}`,
            start_minutes: currentCursorMinutes,
            end_minutes: estimatedStartMinutes,
            entry: {
              ...timelineEntry,
              start_time: resolveMinutesToTimeValue(currentCursorMinutes),
              end_time: resolveMinutesToTimeValue(estimatedStartMinutes),
              duration_minutes: estimatedStartMinutes - currentCursorMinutes,
            },
          });
        }

        displayEntries.push({
          kind: "ESTIMATED",
          key: `estimated-entry-${reviewDay.date}-${court.court_key}-${estimatedEntryKey}`,
          start_minutes: estimatedStartMinutes,
          end_minutes: estimatedEndMinutes,
          entry: estimatedEntry,
        });
        consumedEstimatedEntryKeySet.add(estimatedEntryKey);
        currentCursorMinutes = estimatedEndMinutes;
      },
    );

    if (currentCursorMinutes < timelineEndMinutes) {
      displayEntries.push({
        kind: "TIMELINE",
        key: `free-window-tail-${reviewDay.date}-${court.court_key}-${timelineEntryIndex}`,
        start_minutes: currentCursorMinutes,
        end_minutes: timelineEndMinutes,
        entry: {
          ...timelineEntry,
          start_time: resolveMinutesToTimeValue(currentCursorMinutes),
          end_time: resolveMinutesToTimeValue(timelineEndMinutes),
          duration_minutes: timelineEndMinutes - currentCursorMinutes,
        },
      });
    }
  });

  estimatedEntries.forEach((estimatedEntry) => {
    const estimatedEntryKey = [
      estimatedEntry.match_number,
      estimatedEntry.sport_id,
      estimatedEntry.naipe,
      estimatedEntry.phase_label,
      estimatedEntry.start_time,
    ].join("::");

    if (consumedEstimatedEntryKeySet.has(estimatedEntryKey)) {
      return;
    }

    displayEntries.push({
      kind: "ESTIMATED",
      key: `estimated-entry-unmatched-${reviewDay.date}-${court.court_key}-${estimatedEntryKey}`,
      start_minutes: resolveTimeValueToMinutes(estimatedEntry.start_time) ?? 0,
      end_minutes: resolveTimeValueToMinutes(estimatedEntry.end_time) ?? 0,
      entry: estimatedEntry,
    });
  });

  return displayEntries.sort((left, right) => {
    if (left.start_minutes != right.start_minutes) {
      return left.start_minutes - right.start_minutes;
    }

    if (left.kind != right.kind) {
      return left.kind == "TIMELINE" ? -1 : 1;
    }

    return left.end_minutes - right.end_minutes;
  });
}

function resolveOperationalPreviewPhaseLabel(
  phase: ChampionshipBracketPreviewResult["diagnostics"][number]["phase"],
  phase_label: string | null,
): string | null {
  if (phase_label) {
    return phase_label;
  }

  if (phase == "FINAL") {
    return "Final";
  }

  if (phase == "SEMIFINAL") {
    return "Semifinal";
  }

  if (phase == "QUARTERFINAL") {
    return "Quartas de final";
  }

  if (phase == "ROUND_OF_16") {
    return "Oitavas de final";
  }

  if (phase == "ROUND_OF_32") {
    return "32-avos de final";
  }

  if (phase == "GROUP_STAGE") {
    return "Grupos";
  }

  return null;
}

function resolveOperationalPreviewEntryToneClassName(
  entry: ChampionshipBracketPreviewResult["days"][number]["locations"][number]["courts"][number]["entries"][number],
): string {
  if (entry.type == "MATCH") {
    return "border-emerald-500/20 bg-emerald-500/10 dark:border-emerald-500/30 dark:bg-emerald-950/35";
  }

  if (entry.type == "EMPTY") {
    return "border-dashed border-amber-500/20 bg-amber-500/5";
  }

  if (entry.type == "BREAK") {
    return "border-sky-500/20 bg-sky-500/10";
  }

  if (entry.type == "RESERVATION") {
    return "border-violet-500/20 bg-violet-500/10";
  }

  if (entry.type == "INDIVIDUAL_SESSION") {
    return "border-emerald-500/20 bg-emerald-500/10";
  }

  return "border-border/40 bg-background/50";
}

function resolveOperationalPreviewEntryTypeLabel(
  entry: ChampionshipBracketPreviewResult["days"][number]["locations"][number]["courts"][number]["entries"][number],
): string {
  if (entry.type == "MATCH") {
    if (entry.manual_final) {
      return "Final manual";
    }

    if (entry.projected) {
      return "Slot projetado";
    }

    return "Jogo";
  }

  if (entry.type == "BREAK") {
    return "Intervalo";
  }

  if (entry.type == "RESERVATION") {
    return "Reserva";
  }

  if (entry.type == "INDIVIDUAL_SESSION") {
    return "Sessão individual";
  }

  return "Janela livre";
}

function resolveStructuralReviewEntryToneClassName(
  entry: ChampionshipBracketStructuralReviewResult["days"][number]["locations"][number]["courts"][number]["timeline_entries"][number],
): string {
  if (entry.type == "FREE_WINDOW") {
    return "border-dashed border-amber-500/20 bg-amber-500/5";
  }

  if (entry.type == "BREAK") {
    return "border-sky-500/20 bg-sky-500/10";
  }

  if (entry.type == "RESOURCE_LOCK") {
    return "border-violet-500/20 bg-violet-500/10";
  }

  if (entry.type == "INDIVIDUAL_SESSION") {
    return "border-emerald-500/20 bg-emerald-500/10";
  }

  return "border-primary/30 bg-primary/10";
}

function resolveStructuralReviewEntryTypeLabel(
  entry: ChampionshipBracketStructuralReviewResult["days"][number]["locations"][number]["courts"][number]["timeline_entries"][number],
): string {
  if (entry.type == "BREAK") {
    return "Intervalo";
  }

  if (entry.type == "RESOURCE_LOCK") {
    return entry.lock_mode == "HARD" ? "Reserva fixa" : "Reserva";
  }

  if (entry.type == "INDIVIDUAL_SESSION") {
    return "Sessão individual";
  }

  if (entry.type == "MANUAL_FINAL_BLOCK") {
    return "Bloco manual de final";
  }

  return "Janela livre";
}

function resolvePreviewGeneratedAtLabel(generatedAt: string): string | null {
  const parsedDate = new Date(generatedAt);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function resolveExactPreviewCacheFromJob({
  job,
  localPayloadSignature,
  matchNumberingMode,
  previousResult,
}: {
  job: ChampionshipBracketPreviewJob;
  localPayloadSignature: string;
  matchNumberingMode: ChampionshipBracketMatchNumberingMode;
  previousResult: ChampionshipBracketPreviewResult | null;
}): ChampionshipBracketExactPreviewCache {
  const availableDays = new Map(
    (previousResult?.days ?? []).map((previewDay) => [
      previewDay.date,
      previewDay,
    ]),
  );

  return {
    job_id: job.job_id,
    payload_signature: localPayloadSignature,
    server_payload_signature: job.payload_signature,
    generation_signature: job.generation_signature ?? "",
    dependency_signature: job.dependency_signature,
    algorithm_version: job.algorithm_version,
    status: job.status,
    stage: job.stage,
    current_date: job.current_date,
    progress_percentage: job.progress_percentage,
    processed_slots: job.processed_slots,
    total_slots: job.total_slots,
    expires_at: job.expires_at,
    is_valid_for_creation: job.is_valid_for_creation,
    generated_at: job.completed_at ?? job.created_at,
    result: {
      ok: job.status == "COMPLETED",
      message: job.error_message,
      server_payload_signature: job.payload_signature,
      generation_signature: job.generation_signature,
      match_numbering_mode: matchNumberingMode,
      summary: job.summary,
      days: (job.summary?.games_by_day ?? []).map(
        (daySummary) =>
          availableDays.get(daySummary.date) ?? {
            date: daySummary.date,
            start_time: "",
            end_time: "",
            breaks: [],
            occupied_minutes: 0,
            available_minutes: 0,
            utilization_percentage: 0,
            free_windows: 0,
            locations: [],
          },
      ),
      diagnostics: job.diagnostics,
    },
  };
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
    exact_preview_cache: null,
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

function resolveWizardDraftSanitizationToastMessage({
  previousDraftFormValues,
  nextDraftFormValues,
}: {
  previousDraftFormValues: ChampionshipBracketWizardDraftFormValues;
  nextDraftFormValues: ChampionshipBracketWizardDraftFormValues;
}) {
  const resolveSportMatchTargetCount = (
    draftFormValues: ChampionshipBracketWizardDraftFormValues,
  ) =>
    draftFormValues.schedule_days.reduce(
      (total, scheduleDay) =>
        total +
        scheduleDay.locations.reduce(
          (locationTotal, location) =>
            locationTotal +
            location.courts.reduce(
              (courtTotal, court) =>
                courtTotal + (court.sport_match_targets?.length ?? 0),
              0,
            ),
          0,
        ),
      0,
    );
  const nextCourtPreferenceByKey = new Map(
    nextDraftFormValues.schedule_days.flatMap((scheduleDay) =>
      scheduleDay.locations.flatMap((location) =>
        location.courts.map((court) => [
          [scheduleDay.id, location.id, court.id].join("::"),
          court.sport_preference,
        ]),
      ),
    ),
  );
  const clearedCourtPreferenceCount =
    previousDraftFormValues.schedule_days.flatMap((scheduleDay) =>
      scheduleDay.locations.flatMap((location) =>
        location.courts.filter((court) => {
          if (!court.sport_preference) {
            return false;
          }

          return (
            nextCourtPreferenceByKey.get(
              [scheduleDay.id, location.id, court.id].join("::"),
            ) == null
          );
        }),
      ),
    ).length;
  const nextFinalBlockByKey = new Map(
    nextDraftFormValues.knockout_program_blocks.map((programBlock) => [
      resolveKnockoutProgramBlockKey(programBlock),
      programBlock,
    ]),
  );
  const adjustedFinalBlockCount =
    previousDraftFormValues.knockout_program_blocks.filter((programBlock) => {
      const nextProgramBlock = nextFinalBlockByKey.get(
        resolveKnockoutProgramBlockKey(programBlock),
      );

      return (
        !nextProgramBlock ||
        JSON.stringify(nextProgramBlock.naipe_sequence) !=
          JSON.stringify(programBlock.naipe_sequence)
      );
    }).length;
  const removedSportMatchTargetCount = Math.max(
    0,
    resolveSportMatchTargetCount(previousDraftFormValues) -
      resolveSportMatchTargetCount(nextDraftFormValues),
  );
  const messageParts = [
    removedSportMatchTargetCount > 0
      ? `${removedSportMatchTargetCount} meta${
          removedSportMatchTargetCount == 1 ? "" : "s"
        } de jogos`
      : null,
    clearedCourtPreferenceCount > 0
      ? `${clearedCourtPreferenceCount} preferência${
          clearedCourtPreferenceCount == 1 ? "" : "s"
        } de quadra`
      : null,
    adjustedFinalBlockCount > 0
      ? `${adjustedFinalBlockCount} bloco${
          adjustedFinalBlockCount == 1 ? "" : "s"
        } de final`
      : null,
  ].filter((messagePart): messagePart is string => messagePart != null);

  if (messageParts.length == 0) {
    return null;
  }

  return `O rascunho foi ajustado conforme as configurações anteriores: ${messageParts.join(
    ", ",
  )}.`;
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
  const [highestUnlockedStepIndex, setHighestUnlockedStepIndex] = useState(0);
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
  const [competitionDateAvailability, setCompetitionDateAvailability] =
    useState<
      NonNullable<
        ChampionshipBracketWizardDraftFormValues["competition_date_availability"]
      >
    >([]);
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

  const [exactPreviewCache, setExactPreviewCache] =
    useState<ChampionshipBracketExactPreviewCache | null>(null);

  const [loadingOperationalPreview, setLoadingOperationalPreview] =
    useState(false);
  const operationalPreviewRequestInFlightReference = useRef(false);
  const [expandedOperationalPreviewDates, setExpandedOperationalPreviewDates] =
    useState<Set<string>>(new Set());
  const [loadingOperationalPreviewDate, setLoadingOperationalPreviewDate] =
    useState<string | null>(null);

  const [operationalPreviewError, setOperationalPreviewError] = useState<
    string | null
  >(null);
  const [expandedStructuralReviewDayByDate, setExpandedStructuralReviewDayByDate] =
    useState<Record<string, boolean>>({});
  const [expandedCourtPreferenceDayByKey, setExpandedCourtPreferenceDayByKey] =
    useState<Record<string, boolean>>({});
  const [expandedTeamAvailabilityByTeamId, setExpandedTeamAvailabilityByTeamId] =
    useState<Record<string, boolean>>({});
  const [expandedTeamAvailabilitySportByKey, setExpandedTeamAvailabilitySportByKey] =
    useState<Record<string, boolean>>({});
  const [expandedCompetitionAvailabilityByKey, setExpandedCompetitionAvailabilityByKey] =
    useState<Record<string, boolean>>({});
  const [expandedModalityCardBySportId, setExpandedModalityCardBySportId] =
    useState<Record<string, boolean>>({});
  const [expandedNaipeCardBySportId, setExpandedNaipeCardBySportId] =
    useState<Record<string, boolean>>({});
  const [expandedScheduleDayById, setExpandedScheduleDayById] = useState<
    Record<string, boolean>
  >({});
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
  const [expandedCompetitionGroupEditorByKey, setExpandedCompetitionGroupEditorByKey] =
    useState<Record<string, boolean>>({});

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
      const sanitizationToastMessage =
        resolveWizardDraftSanitizationToastMessage({
          previousDraftFormValues: draft_form_values,
          nextDraftFormValues: sanitizedDraftFormValues,
        });
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
        highest_unlocked_step_index: Math.max(
          nextCurrentStepIndex,
          sanitizedDraftFormValues.highest_unlocked_step_index ??
            nextCurrentStepIndex,
        ),
        schedule_days: resolvedScheduleDays.map((schedule_day) =>
          resolveScheduleDayClone(schedule_day),
        ),
      };

      setCurrentStepIndex(nextCurrentStepIndex);
      setHighestUnlockedStepIndex(
        appliedDraftFormValues.highest_unlocked_step_index ??
          nextCurrentStepIndex,
      );
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
      setCompetitionDateAvailability(
        appliedDraftFormValues.competition_date_availability ?? [],
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
      setExactPreviewCache(appliedDraftFormValues.exact_preview_cache ?? null);
      setLoadingOperationalPreview(false);
      setOperationalPreviewError(null);
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

      if (sanitizationToastMessage) {
        toast.info(sanitizationToastMessage);
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
        highest_unlocked_step_index: Math.max(
          currentStepIndex,
          highestUnlockedStepIndex,
        ),
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
        team_competition_date_availability: teamCompetitionDateAvailability.map(
          (availabilityItem) => ({
            team_id: availabilityItem.team_id,
            competition_key: availabilityItem.competition_key,
            date: availabilityItem.date,
            mode: availabilityItem.mode,
            windows: availabilityItem.windows.map((window) => ({
              start_time: window.start_time,
              end_time: window.end_time,
            })),
          }),
        ),
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
        exact_preview_cache: exactPreviewCache
          ? {
              job_id: exactPreviewCache.job_id,
              payload_signature: exactPreviewCache.payload_signature,
              server_payload_signature:
                exactPreviewCache.server_payload_signature,
              generation_signature: exactPreviewCache.generation_signature,
              dependency_signature: exactPreviewCache.dependency_signature,
              algorithm_version: exactPreviewCache.algorithm_version,
              status: exactPreviewCache.status,
              stage: exactPreviewCache.stage,
              current_date: exactPreviewCache.current_date,
              progress_percentage: exactPreviewCache.progress_percentage,
              processed_slots: exactPreviewCache.processed_slots,
              total_slots: exactPreviewCache.total_slots,
              expires_at: exactPreviewCache.expires_at,
              is_valid_for_creation:
                exactPreviewCache.is_valid_for_creation,
              generated_at: exactPreviewCache.generated_at,
              // A lista de jogos da prévia não deve aumentar o rascunho salvo.
              result: null,
            }
          : null,
      };
    }, [
      exactPreviewCache,
      competitionDateAvailability,
      competitionConfigByKey,
      currentStepIndex,
      highestUnlockedStepIndex,
      enabledSportIds,
      groupAssignmentsByCompetitionKey,
      groupOrderByCompetitionKey,
      individualEventConfigs,
      individualSessionConfigs,
      knockoutProgramBlocks,
      matchNumberingMode,
      resourceLocks,
      scheduleDays,
      seasonSettings,
      showEstimatedStartTimeOnCardsBySportId,
      selectedCompetitionKeysByTeamId,
      selectedSportIdsByTeamId,
      selectedTeamIds,
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

    applyWizardDraft(currentWizardDraftFormValues, {
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

  const scheduleDayByDate = useMemo(() => {
    return new Map(
      scheduleDays
        .filter((scheduleDay) => scheduleDay.date)
        .map((scheduleDay) => [scheduleDay.date, scheduleDay] as const),
    );
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
          const competitionAvailability = competitionDateAvailabilityByKey.get(
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
      const competitionAvailability = competitionDateAvailabilityByKey.get(
        `${competitionKey}::${date}`,
      );

      const scheduleDay =
        scheduleDays.find(
          (currentScheduleDay) => currentScheduleDay.date == date,
        ) ?? null;

      let nextWindow: {
        start_time: string;
        end_time: string;
      } | null = null;

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
              (_, currentWindowIndex) => currentWindowIndex != windowIndex,
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
          const competitionAvailability = competitionDateAvailabilityByKey.get(
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
          scheduleDays,
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
    scheduleDays,
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
                    resourceLock.start_time,
                    resourceLock.end_time,
                    resourceLock.location_key,
                    resourceLock.court_key,
                  ].join("::"),
                  resourceLock,
                ] as const,
            ),
        ).values(),
      ];
      const nextResourceLocks = sanitizeResourceLocksValues({
        scheduleDays,
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
    scheduleDays,
    selectedIndividualCompetitionOptions,
  ]);

  useEffect(() => {
    if (!hasResolvedInitialDraftSnapshot) {
      return;
    }

    setResourceLocks((currentResourceLocks) => {
      const nextResourceLocks = sanitizeResourceLocksValues({
        scheduleDays,
        resourceLocks: currentResourceLocks.map((resourceLock) => {
          if (!isGenericManualCourtResourceLock(resourceLock)) {
            return resourceLock;
          }

          for (const scheduleDay of scheduleDays) {
            for (const location of scheduleDay.locations) {
              if (location.id != resourceLock.location_key) {
                continue;
              }

              for (const court of location.courts) {
                if (court.id != resourceLock.court_key) {
                  continue;
                }

                return {
                  ...resourceLock,
                  date: scheduleDay.date,
                  location_name: location.name || null,
                  court_name: court.name || null,
                };
              }
            }
          }

          return resourceLock;
        }),
      });

      if (
        JSON.stringify(nextResourceLocks) ==
        JSON.stringify(currentResourceLocks)
      ) {
        return currentResourceLocks;
      }

      return nextResourceLocks;
    });
  }, [hasResolvedInitialDraftSnapshot, scheduleDays]);

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

      const genericManualCourtResourceLocks = resourceLocks.filter(
        isGenericManualCourtResourceLock,
      );

      const hasInvalidGenericManualCourtResourceLock =
        genericManualCourtResourceLocks.some((resourceLock) => {
          const scheduleDay = scheduleDayByDate.get(resourceLock.date) ?? null;

          return (
            !resourceLock.date ||
            !resourceLock.location_key ||
            !resourceLock.court_key ||
            !resourceLock.start_time ||
            !resourceLock.end_time ||
            !scheduleDay ||
            !resolveFixedTimeRangeInterval({
              scheduleDay,
              start_time: resourceLock.start_time,
              end_time: resourceLock.end_time,
            })
          );
        });

      if (hasInvalidGenericManualCourtResourceLock) {
        toast.error(
          "Revise os bloqueios personalizados das quadras. Todo bloqueio precisa ter início, fim e permanecer dentro da agenda do dia.",
        );
        return false;
      }

      const hasOverlappingGenericManualCourtResourceLock =
        genericManualCourtResourceLocks.some(
          (resourceLock, resourceLockIndex) => {
            const scheduleDay =
              scheduleDayByDate.get(resourceLock.date) ?? null;

            if (!scheduleDay) {
              return false;
            }

            const interval = resolveFixedTimeRangeInterval({
              scheduleDay,
              start_time: resourceLock.start_time,
              end_time: resourceLock.end_time,
            });

            if (!interval) {
              return false;
            }

            return genericManualCourtResourceLocks.some(
              (otherResourceLock, otherResourceLockIndex) => {
                if (otherResourceLockIndex <= resourceLockIndex) {
                  return false;
                }

                if (
                  otherResourceLock.date != resourceLock.date ||
                  otherResourceLock.location_key != resourceLock.location_key ||
                  otherResourceLock.court_key != resourceLock.court_key
                ) {
                  return false;
                }

                const otherInterval = resolveFixedTimeRangeInterval({
                  scheduleDay,
                  start_time: otherResourceLock.start_time,
                  end_time: otherResourceLock.end_time,
                });

                if (!otherInterval) {
                  return false;
                }

                return (
                  interval.start < otherInterval.end &&
                  otherInterval.start < interval.end
                );
              },
            );
          },
        );

      if (hasOverlappingGenericManualCourtResourceLock) {
        toast.error(
          "Existem bloqueios personalizados sobrepostos na mesma quadra e no mesmo dia.",
        );
        return false;
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
              !sessionConfig.start_time ||
              !sessionConfig.end_time ||
              !sessionConfig.location_key ||
              !sessionConfig.court_key
            );
          },
        );

        if (hasSessionWithoutSlot) {
          toast.error(
            "Toda sessão individual precisa ter dia, horário e recurso oficial definidos.",
          );
          return false;
        }

        const hasSessionWithInvalidTimeRange =
          selectedIndividualCompetitionOptions.some((competitionOption) => {
            const sessionConfig = sessionConfigByKey.get(
              resolveIndividualSessionConfigKey(competitionOption),
            );

            if (
              !sessionConfig?.scheduled_date ||
              !sessionConfig.start_time ||
              !sessionConfig.end_time
            ) {
              return false;
            }

            const scheduleDay =
              scheduleDayByDate.get(sessionConfig.scheduled_date) ?? null;

            return (
              !scheduleDay ||
              !resolveFixedTimeRangeInterval({
                scheduleDay,
                start_time: sessionConfig.start_time,
                end_time: sessionConfig.end_time,
              })
            );
          });

        if (hasSessionWithInvalidTimeRange) {
          toast.error(
            "Revise as sessões individuais. O horário precisa ser válido e permanecer dentro da agenda do dia.",
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
          const dayEndMinutes = resolveTimeValueToMinutes(scheduleDay.end_time);

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
              const startMinutes = resolveTimeValueToMinutes(window.start_time);
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
            (window) =>
              window.start < dayStartMinutes || window.end > dayEndMinutes,
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
              window.start < breakStartMinutes || window.end > breakEndMinutes
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
            const startMinutes = resolveTimeValueToMinutes(window.start_time);
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
                  competitionLabelByKey[competitionKey] ?? "uma competição"
                } está incompleta.`,
              );
              return false;
            }

            const teamAvailability = teamCompetitionDateAvailabilityByKey.get(
              `${teamId}::${competitionKey}::${scheduleDate}`,
            );

            if (!teamAvailability) {
              toast.error(
                `A disponibilidade de ${
                  teamNameById[teamId] ?? "uma atlética"
                } está incompleta em ${
                  competitionLabelByKey[competitionKey] ?? "uma competição"
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
                  competitionLabelByKey[competitionKey] ?? "uma competição"
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
                  competitionLabelByKey[competitionKey] ?? "uma competição"
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
          !programBlock.start_time ||
          !programBlock.end_time ||
          !programBlock.location_key ||
          !programBlock.court_key ||
          !programBlock.sport_id ||
          programBlock.naipe_sequence.length == 0,
      );

      if (hasInvalidKnockoutProgramBlock) {
        toast.error(
          "Revise os blocos manuais das finais. Todo bloco precisa de data, horário, recurso, modalidade e ao menos um naipe.",
        );
        return false;
      }

      const hasInvalidKnockoutProgramBlockTimeRange =
        knockoutProgramBlocks.some((programBlock) => {
          const scheduleDay = scheduleDayByDate.get(programBlock.date) ?? null;

          return (
            !scheduleDay ||
            !resolveFixedTimeRangeInterval({
              scheduleDay,
              start_time: programBlock.start_time,
              end_time: programBlock.end_time,
            })
          );
        });

      if (hasInvalidKnockoutProgramBlockTimeRange) {
        toast.error(
          "Revise os blocos manuais das finais. O horário precisa ser válido e permanecer dentro da agenda do dia.",
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
        new Set(
          knockoutProgramBlocks.map(
            resolveKnockoutProgramBlockConfigurationKey,
          ),
        ).size != knockoutProgramBlocks.length;

      if (hasDuplicatedKnockoutProgramBlock) {
        toast.error(
          "Não é possível repetir a mesma modalidade e o mesmo escopo de divisão no mesmo recurso e horário. Para ordenar os naipes, utilize a sequência do próprio bloco.",
        );
        return false;
      }

      const derivedSessionLockKeySet = new Set(
        individualSessionConfigs
          .filter(
            (sessionConfig) =>
              sessionConfig.exclusive_lock_enabled == true &&
              sessionConfig.scheduled_date &&
              sessionConfig.start_time &&
              sessionConfig.end_time &&
              sessionConfig.location_key &&
              sessionConfig.court_key,
          )
          .map((sessionConfig) =>
            resolveIndividualSessionSharedSlotKey({
              sport_id: sessionConfig.sport_id,
              division: sessionConfig.division,
              scheduled_date: sessionConfig.scheduled_date,
              start_time: sessionConfig.start_time,
              end_time: sessionConfig.end_time,
              location_key: sessionConfig.location_key,
              court_key: sessionConfig.court_key,
            }),
          )
          .filter((sessionKey): sessionKey is string => sessionKey != null),
      );

      const fixedBlocks = [
        ...individualSessionConfigs.flatMap((sessionConfig) => {
          if (
            !sessionConfig.scheduled_date ||
            !sessionConfig.start_time ||
            !sessionConfig.end_time ||
            !sessionConfig.location_key ||
            !sessionConfig.court_key
          ) {
            return [];
          }

          const scheduleDay =
            scheduleDayByDate.get(sessionConfig.scheduled_date) ?? null;
          const interval = scheduleDay
            ? resolveFixedTimeRangeInterval({
                scheduleDay,
                start_time: sessionConfig.start_time,
                end_time: sessionConfig.end_time,
              })
            : null;

          if (!interval) {
            return [];
          }

          return [
            {
              type: "INDIVIDUAL_SESSION" as const,
              date: sessionConfig.scheduled_date,
              location_key: sessionConfig.location_key,
              court_key: sessionConfig.court_key,
              interval,
              sport_id: sessionConfig.sport_id,
              naipe: sessionConfig.naipe,
              division: sessionConfig.division,
              shared_slot_key: resolveIndividualSessionSharedSlotKey({
                sport_id: sessionConfig.sport_id,
                naipe: sessionConfig.naipe,
                division: sessionConfig.division,
                scheduled_date: sessionConfig.scheduled_date,
                start_time: sessionConfig.start_time,
                end_time: sessionConfig.end_time,
                location_key: sessionConfig.location_key,
                court_key: sessionConfig.court_key,
              }),
            },
          ];
        }),
        ...resourceLocks.flatMap((resourceLock) => {
          if (
            derivedSessionLockKeySet.has(
              resolveIndividualSessionSharedSlotKey({
                sport_id: resourceLock.sport_id,
                division: resourceLock.division,
                date: resourceLock.date,
                start_time: resourceLock.start_time,
                end_time: resourceLock.end_time,
                location_key: resourceLock.location_key,
                court_key: resourceLock.court_key,
              }),
            )
          ) {
            return [];
          }

          const scheduleDay = scheduleDayByDate.get(resourceLock.date) ?? null;
          const interval = scheduleDay
            ? resolveFixedTimeRangeInterval({
                scheduleDay,
                start_time: resourceLock.start_time,
                end_time: resourceLock.end_time,
              })
            : null;

          if (!interval) {
            return [];
          }

          return [
            {
              type: "RESOURCE_LOCK" as const,
              date: resourceLock.date,
              location_key: resourceLock.location_key,
              court_key: resourceLock.court_key,
              interval,
              sport_id: resourceLock.sport_id,
              naipe: resourceLock.naipe,
              division: resourceLock.division,
              shared_slot_key: null,
            },
          ];
        }),
        ...knockoutProgramBlocks.flatMap((programBlock) => {
          const scheduleDay = scheduleDayByDate.get(programBlock.date) ?? null;
          const interval = scheduleDay
            ? resolveFixedTimeRangeInterval({
                scheduleDay,
                start_time: programBlock.start_time,
                end_time: programBlock.end_time,
              })
            : null;

          if (!interval) {
            return [];
          }

          return [
            {
              type: "MANUAL_FINAL_BLOCK" as const,
              date: programBlock.date,
              location_key: programBlock.location_key,
              court_key: programBlock.court_key,
              interval,
              sport_id: programBlock.sport_id,
              naipe: null,
              division: null,
              shared_slot_key: null,
            },
          ];
        }),
      ];

      const hasFixedBlockOverlap = fixedBlocks.some(
        (fixedBlock, fixedBlockIndex) =>
          fixedBlocks.slice(fixedBlockIndex + 1).some((otherFixedBlock) => {
            const canShareIndividualSessionSlot =
              fixedBlock.type == "INDIVIDUAL_SESSION" &&
              otherFixedBlock.type == "INDIVIDUAL_SESSION" &&
              fixedBlock.shared_slot_key != null &&
              fixedBlock.shared_slot_key == otherFixedBlock.shared_slot_key &&
              fixedBlock.naipe != null &&
              otherFixedBlock.naipe != null &&
              fixedBlock.naipe != otherFixedBlock.naipe;

            return (
              fixedBlock.date == otherFixedBlock.date &&
              fixedBlock.location_key == otherFixedBlock.location_key &&
              fixedBlock.court_key == otherFixedBlock.court_key &&
              !canShareIndividualSessionSlot &&
              resolveTimeIntervalsOverlap(
                fixedBlock.interval,
                otherFixedBlock.interval,
              )
            );
          }),
      );

      if (hasFixedBlockOverlap) {
        toast.error(
          "Existem blocos fixos com horários sobrepostos no mesmo recurso. Revise sessões, reservas e finais manuais.",
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
    const nextHighestUnlockedStepIndex = Math.max(
      highestUnlockedStepIndex,
      next_step_index,
    );
    const next_draft_form_values = sanitizeDraftFormValues({
      ...sanitizedCurrentWizardDraftFormValues,
      current_step_index: next_step_index,
      highest_unlocked_step_index: nextHighestUnlockedStepIndex,
    });

    await persistWizardDraft(next_draft_form_values);
    setCurrentStepIndex(next_step_index);
    setHighestUnlockedStepIndex(nextHighestUnlockedStepIndex);
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

  const persistWizardDraft = useCallback(
    async (
      nextDraftFormValues: ChampionshipBracketWizardDraftFormValues,
      options: {
        showRemoteWarningToast?: boolean;
      } = {},
    ) => {
      const draftSaveResponse = await saveChampionshipBracketWizardDraft(
        selectedChampionship.id,
        nextDraftFormValues,
      );

      if (draftSaveResponse.error) {
        if (
          options.showRemoteWarningToast !== false &&
          !hasShownRemoteDraftWarning
        ) {
          toast.warning(
            "Rascunho salvo localmente. A sincronização com o banco falhou nesta tentativa.",
          );
          setHasShownRemoteDraftWarning(true);
        }
      } else {
        setHasShownRemoteDraftWarning(false);
      }

      if (draftSaveResponse.metadata) {
        setRemoteDraftMetadata(draftSaveResponse.metadata);
      }

      setLastSavedEditableDraftSnapshot(
        resolveEditableDraftSnapshot(nextDraftFormValues),
      );

      return draftSaveResponse;
    },
    [hasShownRemoteDraftWarning, selectedChampionship.id],
  );

  const handleStepNavigation = useCallback(
    async (stepIndex: number) => {
      if (
        saving ||
        stepIndex == currentStepIndex ||
        stepIndex > highestUnlockedStepIndex
      ) {
        return;
      }

      const nextDraftFormValues = sanitizeDraftFormValues({
        ...sanitizedCurrentWizardDraftFormValues,
        current_step_index: stepIndex,
        highest_unlocked_step_index: Math.max(
          highestUnlockedStepIndex,
          sanitizedCurrentWizardDraftFormValues.highest_unlocked_step_index ??
            currentStepIndex,
        ),
      });

      await persistWizardDraft(nextDraftFormValues);
      setCurrentStepIndex(stepIndex);
    },
    [
      currentStepIndex,
      highestUnlockedStepIndex,
      persistWizardDraft,
      sanitizeDraftFormValues,
      sanitizedCurrentWizardDraftFormValues,
      saving,
    ],
  );

  const handleSaveDraft = useCallback(async () => {
    const nextDraftFormValues = sanitizeDraftFormValues(
      sanitizedCurrentWizardDraftFormValues,
    );

    const draftSaveResponse = await persistWizardDraft(nextDraftFormValues);

    if (draftSaveResponse.error) {
      return;
    }

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
  }, [
    applyWizardDraft,
    currentStepIndex,
    lastSavedEditableDraftSnapshot,
    persistWizardDraft,
    resolveWorkflowChangedFields,
    sanitizeDraftFormValues,
    sanitizedCurrentWizardDraftFormValues,
    writeWorkflowLog,
  ]);

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

  const sportMatchTargetRecommendationState = useMemo(() => {
    try {
      const competitions = resolveCompetitionsPayload();
      const participants = resolveParticipantsPayload();

      return {
        result: resolveChampionshipBracketSportMatchTargetRecommendations({
          scheduleDays,
          competitions,
          participants,
          competitionDateAvailability,
          individualSessionConfigs,
          resourceLocks,
          knockoutProgramBlocks,
          championshipSports,
        }),
        error: null,
      };
    } catch (error) {
      return {
        result: null,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível calcular as metas automáticas das quadras.",
      };
    }
  }, [
    championshipSports,
    competitionDateAvailability,
    individualSessionConfigs,
    knockoutProgramBlocks,
    resolveCompetitionsPayload,
    resolveParticipantsPayload,
    resourceLocks,
    scheduleDays,
  ]);

  const sportMatchTargetRecommendationByKey = useMemo(() => {
    return new Map<
      string,
      ChampionshipBracketSportMatchTargetRecommendationLine
    >(
      (
        sportMatchTargetRecommendationState.result?.line_recommendations ?? []
      ).map((recommendationLine) => [
        recommendationLine.key,
        recommendationLine,
      ]),
    );
  }, [sportMatchTargetRecommendationState.result]);

  const sportMatchTargetSummaryBySportId = useMemo(() => {
    return new Map<
      string,
      ChampionshipBracketSportMatchTargetRecommendationSummary
    >(
      (sportMatchTargetRecommendationState.result?.sport_summaries ?? []).map(
        (sportSummary) => [sportSummary.sport_id, sportSummary],
      ),
    );
  }, [sportMatchTargetRecommendationState.result]);

  const competitionMatchTargetSummaryByCompetitionKey = useMemo(() => {
    return new Map<
      string,
      ChampionshipBracketCompetitionMatchTargetRecommendationSummary
    >(
      (
        sportMatchTargetRecommendationState.result?.competition_summaries ?? []
      ).map((competitionSummary) => [
        competitionSummary.competition_key,
        competitionSummary,
      ]),
    );
  }, [sportMatchTargetRecommendationState.result]);

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
            courts: location.courts.map((court, courtIndex) => {
              const resolvedSportMatchTargets = court.sport_match_targets
                .map((target) => {
                  const recommendationLine =
                    sportMatchTargetRecommendationByKey.get(
                      [
                        scheduleDay.id,
                        location.id,
                        court.id,
                        target.sport_id,
                      ].join("::"),
                    ) ?? null;
                  const resolvedMatchCount =
                    (target.planning_mode ?? "MANUAL") == "AUTO"
                      ? (recommendationLine?.recommended_match_count ?? 0)
                      : target.planned_match_count;

                  if (
                    !Number.isInteger(resolvedMatchCount) ||
                    resolvedMatchCount <= 0
                  ) {
                    return null;
                  }

                  return {
                    sport_id: target.sport_id,
                    planned_match_count: resolvedMatchCount,
                  };
                })
                .filter(
                  (
                    target,
                  ): target is {
                    sport_id: string;
                    planned_match_count: number;
                  } => target != null,
                );

              return {
                court_key: court.id,
                name: court.name,
                position: courtIndex + 1,
                sport_ids: court.sport_ids,
                sport_match_targets: resolvedSportMatchTargets,
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

                        alternate_naipe_after_exclusive_knockout_phase:
                          court.sport_preference
                            .alternate_naipe_after_exclusive_knockout_phase ===
                          true,
                      }
                    : null,
              };
            }),
          }),
        ),
      }));
    }, [
      scheduleDays,
      seasonSettings.division_format,
      sportMatchTargetRecommendationByKey,
    ]);

  const resolveSetupPayload =
    useCallback((): ChampionshipBracketSetupFormValues => {
      return ChampionshipBracketSetupDTO.fromFormValues({
        season_settings: seasonSettings,
        enabled_sport_ids: enabledSportIds,
        participants: resolveParticipantsPayload(),
        competitions: resolveCompetitionsPayload(),
        schedule_days: resolveScheduleDaysPayload(),
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
        team_competition_date_availability: teamCompetitionDateAvailability.map(
          (availabilityItem) => ({
            team_id: availabilityItem.team_id,
            competition_key: availabilityItem.competition_key,
            date: availabilityItem.date,
            mode: availabilityItem.mode,
            windows: availabilityItem.windows.map((window) => ({
              start_time: window.start_time,
              end_time: window.end_time,
            })),
          }),
        ),
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
      competitionDateAvailability,
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
      teamCompetitionDateAvailability,
    ]);

  const structuralReviewState = useMemo(() => {
    try {
      const payload = resolveSetupPayload();
      const payloadSignature =
        resolveChampionshipBracketExactPreviewPayloadSignature(payload);

      return {
        payload,
        payloadSignature,
        review: resolveChampionshipBracketStructuralReview({
          payload,
          championshipSports,
          teams,
        }),
        error: null,
      };
    } catch (error) {
      return {
        payload: null,
        payloadSignature: null,
        review: null,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível montar a revisão estrutural da programação.",
      };
    }
  }, [championshipSports, resolveSetupPayload, teams]);

  const operationalPreview = exactPreviewCache?.result ?? null;
  const isExactPreviewJobRunning = [
    "QUEUED",
    "INITIALIZING",
    "SCHEDULING",
    "FINALIZING",
  ].includes(exactPreviewCache?.status ?? "");
  const hasValidExactPreviewCache =
    structuralReviewState.payloadSignature != null &&
    resolveChampionshipBracketExactPreviewCacheValidity({
      cache: exactPreviewCache,
      payloadSignature: structuralReviewState.payloadSignature,
    });
  const hasBlockingExactPreviewDiagnostics =
    exactPreviewCache?.status == "COMPLETED" &&
    hasValidExactPreviewCache &&
    (exactPreviewCache.is_valid_for_creation === false ||
      (operationalPreview?.summary?.conflict_count ?? 0) > 0 ||
      operationalPreview?.diagnostics.some(
        (diagnostic) => diagnostic.severity == "ERROR",
      ) === true);
  const exactPreviewGeneratedAtLabel = useMemo(() => {
    if (!exactPreviewCache?.generated_at) {
      return null;
    }

    return resolvePreviewGeneratedAtLabel(exactPreviewCache.generated_at);
  }, [exactPreviewCache?.generated_at]);

  const scheduleDayDateById = useMemo(
    () =>
      new Map(
        scheduleDays.map((scheduleDay) => [scheduleDay.id, scheduleDay.date]),
      ),
    [scheduleDays],
  );

  const structuralReviewCourtByStep11Key = useMemo(() => {
    const review = structuralReviewState.review;

    if (!review) {
      return new Map<string, ChampionshipBracketStructuralReviewCourt>();
    }

    const nextMap = new Map<string, ChampionshipBracketStructuralReviewCourt>();

    review.days.forEach((reviewDay) => {
      reviewDay.locations.forEach((location) => {
        location.courts.forEach((court) => {
          nextMap.set(
            [reviewDay.date, location.location_key, court.court_key].join("::"),
            court,
          );
        });
      });
    });

    return nextMap;
  }, [structuralReviewState.review]);

  const pendingStructuralReviewMatchEntries = useMemo(() => {
    const review = structuralReviewState.review;

    if (!review) {
      return [];
    }

    return review.days.flatMap((reviewDay) =>
      reviewDay.locations.flatMap((location) =>
        location.courts.flatMap((court) =>
          court.pending_match_entries.map((pendingEntry) => ({
            ...pendingEntry,
            date: reviewDay.date,
            location_name: location.location_name,
            court_name: court.court_name,
          })),
        ),
      ),
    );
  }, [structuralReviewState.review]);

  const loadOperationalPreview = useCallback(async () => {
    if (
      operationalPreviewRequestInFlightReference.current ||
      !structuralReviewState.payload ||
      !structuralReviewState.payloadSignature
    ) {
      return;
    }

    operationalPreviewRequestInFlightReference.current = true;
    setLoadingOperationalPreview(true);
    setOperationalPreviewError(null);

    try {
      const response = await startChampionshipBracketPreviewJob(
        selectedChampionship.id,
        structuralReviewState.payload,
      );

      if (response.error) {
        throw response.error;
      }

      if (!response.data) {
        throw new Error("O job de prévia não retornou dados.");
      }

      const nextExactPreviewCache = resolveExactPreviewCacheFromJob({
        job: response.data,
        localPayloadSignature: structuralReviewState.payloadSignature,
        matchNumberingMode,
        previousResult: null,
      });

      setExactPreviewCache(nextExactPreviewCache);
      setExpandedOperationalPreviewDates(new Set());

      const nextDraftFormValues = {
        ...resolveWizardDraftFormValues(),
        exact_preview_cache: {
          ...nextExactPreviewCache,
          result: null,
        },
      } satisfies ChampionshipBracketWizardDraftFormValues;

      void saveChampionshipBracketWizardDraft(
        selectedChampionship.id,
        nextDraftFormValues,
      ).then((draftSaveResponse) => {
        if (draftSaveResponse.error) {
          toast.info(
            "O cálculo foi iniciado, mas não foi possível sincronizar o identificador do job no rascunho.",
          );
          return;
        }

        if (draftSaveResponse.metadata) {
          setRemoteDraftMetadata(draftSaveResponse.metadata);
        }
      });
    } catch (error) {
      setOperationalPreviewError(
        error instanceof Error
          ? error.message
          : "Não foi possível calcular a prévia operacional do chaveamento.",
      );
    } finally {
      operationalPreviewRequestInFlightReference.current = false;
      setLoadingOperationalPreview(false);
    }
  }, [
    resolveWizardDraftFormValues,
    matchNumberingMode,
    selectedChampionship.id,
    structuralReviewState.payload,
    structuralReviewState.payloadSignature,
  ]);

  useEffect(() => {
    const jobId = exactPreviewCache?.job_id;
    const jobStatus = exactPreviewCache?.status;

    if (
      !jobId ||
      !jobStatus ||
      !["QUEUED", "INITIALIZING", "SCHEDULING", "FINALIZING"].includes(
        jobStatus,
      ) ||
      !structuralReviewState.payloadSignature ||
      exactPreviewCache?.payload_signature !=
        structuralReviewState.payloadSignature
    ) {
      return;
    }

    let cancelled = false;
    const pollJob = async () => {
      const response = await fetchChampionshipBracketPreviewJobStatus(jobId);
      if (cancelled || response.error || !response.data) return;
      const previewJob = response.data;

      setExactPreviewCache((currentCache) => {
        if (!currentCache || currentCache.job_id != jobId) return currentCache;
        return resolveExactPreviewCacheFromJob({
          job: previewJob,
          localPayloadSignature: currentCache.payload_signature,
          matchNumberingMode,
          previousResult: currentCache.result,
        });
      });
    };

    void pollJob();
    const intervalId = window.setInterval(() => void pollJob(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    exactPreviewCache?.job_id,
    exactPreviewCache?.payload_signature,
    exactPreviewCache?.status,
    matchNumberingMode,
    structuralReviewState.payloadSignature,
  ]);

  const toggleOperationalPreviewDay = useCallback(
    async (date: string) => {
      const isExpanded = expandedOperationalPreviewDates.has(date);
      if (isExpanded) {
        setExpandedOperationalPreviewDates((currentDates) => {
          const nextDates = new Set(currentDates);
          nextDates.delete(date);
          return nextDates;
        });
        return;
      }

      setExpandedOperationalPreviewDates((currentDates) =>
        new Set(currentDates).add(date),
      );

      const cachedDay = exactPreviewCache?.result?.days.find(
        (previewDay) =>
          previewDay.date == date && previewDay.locations.length > 0,
      );
      if (cachedDay || !exactPreviewCache?.job_id) return;

      setLoadingOperationalPreviewDate(date);
      const response = await fetchChampionshipBracketPreviewJobDay(
        exactPreviewCache.job_id,
        date,
      );
      setLoadingOperationalPreviewDate(null);

      if (response.error || !response.data) {
        setOperationalPreviewError(
          response.error?.message ?? "Não foi possível carregar este dia.",
        );
        return;
      }

      setExactPreviewCache((currentCache) => {
        if (!currentCache?.result) return currentCache;
        return {
          ...currentCache,
          result: {
            ...currentCache.result,
            days: currentCache.result.days.map((previewDay) =>
              previewDay.date == date ? response.data! : previewDay,
            ),
          },
        };
      });
    },
    [exactPreviewCache, expandedOperationalPreviewDates],
  );

  const cancelOperationalPreview = useCallback(async () => {
    if (!exactPreviewCache?.job_id) return;
    const response = await cancelChampionshipBracketPreviewJob(
      exactPreviewCache.job_id,
    );
    if (response.data && structuralReviewState.payloadSignature) {
      setExactPreviewCache(
        resolveExactPreviewCacheFromJob({
          job: response.data,
          localPayloadSignature: structuralReviewState.payloadSignature,
          matchNumberingMode,
          previousResult: exactPreviewCache.result,
        }),
      );
    }
  }, [exactPreviewCache, matchNumberingMode, structuralReviewState.payloadSignature]);

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

    if (!hasValidExactPreviewCache || !exactPreviewCache) {
      setSaveErrorBannerData({
        title: "Calcule a programação exata antes de criar o campeonato",
        message:
          "A criação só é liberada após uma prévia exata válida para a configuração atual.",
        suggestion:
          "Use o botão Calcular programação exata na revisão final e tente criar novamente.",
      });
      return;
    }

    if (hasBlockingExactPreviewDiagnostics) {
      setSaveErrorBannerData({
        title: "Corrija as pendências da programação exata",
        message:
          "A prévia encontrou conflitos impeditivos. Corrija-os e calcule novamente antes de criar o campeonato.",
        suggestion:
          "Revise as pendências da prévia exata, ajuste a configuração necessária e faça um novo cálculo.",
      });
      return;
    }

    setSaving(true);
    setSaveErrorBannerData(null);
    const payload = resolveSetupPayload();

    try {
      const response = await createChampionshipBracketFromPreviewJob(
        selectedChampionship.id,
        payload,
        exactPreviewCache.job_id,
      );

      if (response.error || !response.data) {
        throw new Error(
          response.error?.message ??
            "Não foi possível gerar os grupos automaticamente.",
        );
      }

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

  const updateManualCourtResourceLock = useCallback(
    (
      resourceLockIndex: number,
      changes: Partial<ChampionshipBracketResourceLockInput>,
    ) => {
      setResourceLocks((currentResourceLocks) =>
        sanitizeResourceLocksValues({
          scheduleDays,
          resourceLocks: currentResourceLocks.map((resourceLock, index) =>
            index == resourceLockIndex
              ? {
                  ...resourceLock,
                  ...changes,
                }
              : resourceLock,
          ),
        }),
      );
    },
    [scheduleDays],
  );

  const removeManualCourtResourceLock = useCallback(
    (resourceLockIndex: number) => {
      setResourceLocks((currentResourceLocks) =>
        sanitizeResourceLocksValues({
          scheduleDays,
          resourceLocks: currentResourceLocks.filter(
            (_, index) => index != resourceLockIndex,
          ),
        }),
      );
    },
    [scheduleDays],
  );

  const handleAddManualCourtResourceLock = useCallback(
    (
      scheduleDay: ScheduleDayFormValue,
      location: ScheduleLocationFormValue,
      court: ScheduleCourtFormValue,
    ) => {
      setResourceLocks((currentResourceLocks) =>
        sanitizeResourceLocksValues({
          scheduleDays,
          resourceLocks: [
            ...currentResourceLocks,
            {
              date: scheduleDay.date,
              start_time: "",
              end_time: "",
              location_key: location.id,
              court_key: court.id,
              location_name: location.name || null,
              court_name: court.name || null,
              lock_mode: "HARD",
              competition_key: null,
              sport_id: null,
              naipe: null,
              division: null,
            },
          ],
        }),
      );
    },
    [scheduleDays],
  );

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

  const manualCourtResourceLocksByStep7Key = useMemo(() => {
    const nextMap = new Map<
      string,
      Array<{
        resourceLock: ChampionshipBracketResourceLockInput;
        index: number;
      }>
    >();

    resourceLocks.forEach((resourceLock, index) => {
      if (!isGenericManualCourtResourceLock(resourceLock)) {
        return;
      }

      const key = resolveCourtDayResourceLockKey({
        date: resourceLock.date,
        location_key: resourceLock.location_key,
        court_key: resourceLock.court_key,
      });
      const currentEntries = nextMap.get(key) ?? [];

      nextMap.set(key, [...currentEntries, { resourceLock, index }]);
    });

    return nextMap;
  }, [resourceLocks]);

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

  const activeErrorBannerData = saveErrorBannerData;
  const shouldAllowDismissActiveErrorBanner = true;
  const isCreateButtonDisabled =
    saving || !hasValidExactPreviewCache || hasBlockingExactPreviewDiagnostics;
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

          const visibleDateCards = scheduleDayDatesOrderedByColumn.flatMap(
            (scheduleDate) => {
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

              const availabilityKey = `${teamId}::${competitionKey}::${scheduleDate}`;

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
            },
          );

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
      .filter(
        (teamAvailabilityCard) => teamAvailabilityCard.sport_cards.length > 0,
      )
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
    const normalizedSearchTerm = teamAvailabilitySearchTerm
      .trim()
      .toLocaleLowerCase();

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
        scheduleDays,
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
    scheduleDays,
    seasonSettings,
  ]);

  const individualSessionConfigByKey = useMemo(() => {
    return new Map(
      individualSessionConfigs.map((sessionConfig) => [
        resolveIndividualSessionConfigKey(sessionConfig),
        sessionConfig,
      ]),
    );
  }, [individualSessionConfigs]);

  const courtPreferenceStepRows = useMemo(() => {
    const sportConfigurationById = activeCompetitionOptions.reduce<
      Record<
        string,
        {
          sport_id: string;
          sport_name: string;
          naipe_options: MatchNaipe[];
          division_options: TeamDivision[];
          competition_keys: string[];
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
          competition_keys: [
            resolveCompetitionKey(
              competitionOption.sport_id,
              competitionOption.naipe,
              competitionOption.division,
            ),
          ],
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

      const competitionKey = resolveCompetitionKey(
        competitionOption.sport_id,
        competitionOption.naipe,
        competitionOption.division,
      );

      if (
        !currentSportConfiguration.competition_keys.includes(competitionKey)
      ) {
        currentSportConfiguration.competition_keys = [
          ...currentSportConfiguration.competition_keys,
          competitionKey,
        ];
      }

      return carry;
    }, {});

    const competitionOptionsBySportId = activeCompetitionOptions.reduce<
      Record<string, ChampionshipBracketWizardCompetitionOption[]>
    >((carry, competitionOption) => {
      if (!carry[competitionOption.sport_id]) {
        carry[competitionOption.sport_id] = [];
      }

      carry[competitionOption.sport_id]?.push(competitionOption);
      return carry;
    }, {});

    const isCompetitionPlayableOnScheduleDate = (
      competitionOption: ChampionshipBracketWizardCompetitionOption,
      scheduleDate: string,
    ) => {
      const availabilityItem =
        competitionDateAvailabilityByKey.get(
          `${resolveCompetitionKey(
            competitionOption.sport_id,
            competitionOption.naipe,
            competitionOption.division,
          )}::${scheduleDate}`,
        ) ?? null;

      if (!availabilityItem || availabilityItem.mode == "FULL_DAY") {
        return true;
      }

      if (availabilityItem.mode == "UNAVAILABLE") {
        return false;
      }

      return availabilityItem.windows.some(
        (window) => window.start_time < window.end_time,
      );
    };

    return scheduleDays.flatMap((scheduleDay, scheduleDayIndex) => {
      const courtCards = scheduleDay.locations.flatMap((scheduleLocation) =>
        scheduleLocation.courts.flatMap((court) => {
          const sportOptions = court.sport_ids
            .flatMap((sportId) => {
              const sportConfiguration = sportConfigurationById[sportId];
              const sportCompetitionOptions =
                competitionOptionsBySportId[sportId] ?? [];
              const playableCompetitionOptions = scheduleDay.date
                ? sportCompetitionOptions.filter((competitionOption) =>
                    isCompetitionPlayableOnScheduleDate(
                      competitionOption,
                      scheduleDay.date,
                    ),
                  )
                : sportCompetitionOptions;

              if (
                !sportConfiguration ||
                playableCompetitionOptions.length == 0
              ) {
                return [];
              }

              return [
                {
                  ...sportConfiguration,

                  naipe_options: sportConfiguration.naipe_options.filter(
                    (naipe) =>
                      playableCompetitionOptions.some(
                        (competitionOption) => competitionOption.naipe == naipe,
                      ),
                  ),

                  division_options: sportConfiguration.division_options.filter(
                    (division) =>
                      playableCompetitionOptions.some(
                        (competitionOption) =>
                          competitionOption.division == division,
                      ),
                  ),
                  competition_keys: playableCompetitionOptions.map(
                    (competitionOption) =>
                      resolveCompetitionKey(
                        competitionOption.sport_id,
                        competitionOption.naipe,
                        competitionOption.division,
                      ),
                  ),
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
              planned_sport_summaries: sportOptions
                .map((sportOption) => {
                  const currentTarget = court.sport_match_targets.find(
                    (target) => target.sport_id == sportOption.sport_id,
                  );
                  const recommendationLine =
                    sportMatchTargetRecommendationByKey.get(
                      [
                        scheduleDay.id,
                        scheduleLocation.id,
                        court.id,
                        sportOption.sport_id,
                      ].join("::"),
                    ) ?? null;
                  const plannedMatchCount = Math.max(
                    0,
                    (currentTarget?.planning_mode ?? "MANUAL") == "AUTO"
                      ? (recommendationLine?.recommended_match_count ?? 0)
                      : (currentTarget?.planned_match_count ?? 0),
                  );

                  return {
                    sport_id: sportOption.sport_id,
                    sport_name: sportOption.sport_name,
                    planned_match_count: plannedMatchCount,
                  };
                })
                .filter((summary) => summary.planned_match_count > 0),
              planned_match_count: court.sport_match_targets.reduce(
                (total, target) => {
                  const recommendationLine =
                    sportMatchTargetRecommendationByKey.get(
                      [
                        scheduleDay.id,
                        scheduleLocation.id,
                        court.id,
                        target.sport_id,
                      ].join("::"),
                    ) ?? null;
                  const effectiveMatchCount =
                    (target.planning_mode ?? "MANUAL") == "AUTO"
                      ? (recommendationLine?.recommended_match_count ?? 0)
                      : target.planned_match_count;

                  return total + Math.max(0, effectiveMatchCount);
                },
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

          date: scheduleDay.date,

          day_label: `Dia ${scheduleDayIndex + 1}`,

          date_label: scheduleDay.date
            ? resolveBrazilianDateString(scheduleDay.date)
            : "Data não informada",

          schedule_time_label:
            scheduleDay.start_time && scheduleDay.end_time
              ? `${scheduleDay.start_time} às ${scheduleDay.end_time}`
              : null,

          break_time_label:
            scheduleDay.break_start_time && scheduleDay.break_end_time
              ? `${scheduleDay.break_start_time} às ${scheduleDay.break_end_time}`
              : null,

          court_cards: courtCards,
          planned_match_count: courtCards.reduce(
            (total, courtCard) => total + courtCard.planned_match_count,
            0,
          ),
        },
      ];
    });
  }, [
    activeCompetitionOptions,
    competitionDateAvailabilityByKey,
    scheduleDays,
    sportMatchTargetRecommendationByKey,
  ]);

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

  const duplicateKnockoutProgramBlock = useCallback((targetKey: string) => {
    setKnockoutProgramBlocks((currentKnockoutProgramBlocks) => {
      const sourceProgramBlock = currentKnockoutProgramBlocks.find(
        (programBlock) =>
          resolveKnockoutProgramBlockKey(programBlock) == targetKey,
      );

      if (!sourceProgramBlock) {
        return currentKnockoutProgramBlocks;
      }

      return [
        ...currentKnockoutProgramBlocks,
        {
          ...sourceProgramBlock,
          naipe_sequence: [...sourceProgramBlock.naipe_sequence],
          display_order: currentKnockoutProgramBlocks.length + 1,
        },
      ];
    });
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
    const firstScheduleDay =
      scheduleDays.find(
        (scheduleDay) =>
          scheduleDay.date && scheduleDay.start_time && scheduleDay.end_time,
      ) ??
      scheduleDays[0] ??
      null;
    const firstSportOption = collectiveSportOptions[0] ?? null;

    if (!firstScheduleDay?.date || !firstSportOption) {
      toast.error(
        "Configure ao menos um dia de agenda com horário válido e uma competição coletiva antes de programar finais.",
      );
      return;
    }

    const firstLocationOption =
      scheduleLocationOptionsByDate[firstScheduleDay.date]?.[0] ?? null;
    const firstCourtOption = firstLocationOption
      ? (resolveKnockoutProgramCourtOptions(
          firstScheduleDay.date,
          firstLocationOption.location_key,
        )[0] ?? null)
      : null;
    const availableCompetitionOptions =
      collectiveCompetitionOptionsBySportId[firstSportOption.sport_id] ?? [];
    const defaultDivisionScope =
      seasonSettings.division_format == ChampionshipSeasonDivisionFormat.UNIFIED
        ? "ALL"
        : (availableCompetitionOptions[0]?.division ??
          TeamDivision.DIVISAO_PRINCIPAL);
    const defaultNaipeSequence =
      resolveAutomaticKnockoutProgramBlockNaipeSequence({
        competitionOptions: availableCompetitionOptions,
        divisionScope: defaultDivisionScope,
        divisionFormat: seasonSettings.division_format,
      });

    setKnockoutProgramBlocks((currentKnockoutProgramBlocks) => [
      ...currentKnockoutProgramBlocks,
      {
        date: firstScheduleDay.date,
        start_time: firstScheduleDay.start_time || "",
        end_time: firstScheduleDay.end_time || "",
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
    scheduleDays,
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

              const nextAlternateNaipeAfterExclusiveKnockoutPhase =
                patch.alternate_naipe_after_exclusive_knockout_phase ??
                currentPreference?.alternate_naipe_after_exclusive_knockout_phase ??
                false;

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

                  alternate_naipe_after_exclusive_knockout_phase:
                    nextSequenceMode == "GROUP_NAIPE"
                      ? nextAlternateNaipeAfterExclusiveKnockoutPhase
                      : false,
                },
              };
            }),
          };
        }),
      }));
    },
    [seasonSettings.division_format, updateScheduleDay],
  );

  const normalizeCourtSportPreferenceByMatchTargets = useCallback(
    (court: ScheduleCourtFormValue): ScheduleCourtFormValue => {
      const activeTargetSportIds = [
        ...new Set(
          court.sport_match_targets
            .filter(
              (target) =>
                target.planned_match_count > 0 ||
                (target.planning_mode ?? "MANUAL") == "AUTO",
            )
            .map((target) => target.sport_id),
        ),
      ];

      if (activeTargetSportIds.length == 0) {
        if (court.sport_preference == null) {
          return court;
        }

        return {
          ...court,
          sport_preference: null,
        };
      }

      if (activeTargetSportIds.length == 1) {
        const soleSportId = activeTargetSportIds[0]!;

        if (
          court.sport_preference == null ||
          court.sport_preference.preferred_sport_id == soleSportId
        ) {
          return court;
        }

        return {
          ...court,
          sport_preference: {
            ...court.sport_preference,
            preferred_sport_id: soleSportId,
          },
        };
      }

      if (
        court.sport_preference != null &&
        !activeTargetSportIds.includes(
          court.sport_preference.preferred_sport_id,
        )
      ) {
        return {
          ...court,
          sport_preference: null,
        };
      }

      return court;
    },
    [],
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

              const existingTarget =
                court.sport_match_targets.find(
                  (target) => target.sport_id == sportId,
                ) ?? null;
              const remainingTargets = court.sport_match_targets.filter(
                (target) => target.sport_id != sportId,
              );

              if (
                plannedMatchCount == null ||
                !Number.isInteger(plannedMatchCount) ||
                plannedMatchCount <= 0
              ) {
                if ((existingTarget?.planning_mode ?? "MANUAL") == "AUTO") {
                  return normalizeCourtSportPreferenceByMatchTargets({
                    ...court,
                    sport_match_targets: [
                      ...remainingTargets,
                      {
                        sport_id: sportId,
                        planned_match_count: 0,
                        planning_mode: "AUTO",
                      },
                    ],
                  });
                }

                return normalizeCourtSportPreferenceByMatchTargets({
                  ...court,
                  sport_match_targets: remainingTargets,
                });
              }

              return normalizeCourtSportPreferenceByMatchTargets({
                ...court,
                sport_match_targets: [
                  ...remainingTargets,
                  {
                    sport_id: sportId,
                    planned_match_count: plannedMatchCount,
                    planning_mode: existingTarget?.planning_mode ?? "MANUAL",
                  },
                ],
              });
            }),
          };
        }),
      }));
    },
    [normalizeCourtSportPreferenceByMatchTargets, updateScheduleDay],
  );

  const updateCourtSportMatchTargetPlanningMode = useCallback(
    (
      scheduleDayId: string,
      locationId: string,
      courtId: string,
      sportId: string,
      planningMode: ChampionshipBracketCourtSportMatchTargetPlanningMode,
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

              const existingTarget =
                court.sport_match_targets.find(
                  (target) => target.sport_id == sportId,
                ) ?? null;
              const remainingTargets = court.sport_match_targets.filter(
                (target) => target.sport_id != sportId,
              );

              if (planningMode == "MANUAL" && existingTarget == null) {
                return normalizeCourtSportPreferenceByMatchTargets(court);
              }

              return normalizeCourtSportPreferenceByMatchTargets({
                ...court,
                sport_match_targets: [
                  ...remainingTargets,
                  {
                    sport_id: sportId,
                    planned_match_count:
                      existingTarget?.planned_match_count ?? 0,
                    planning_mode: planningMode,
                  },
                ],
              });
            }),
          };
        }),
      }));
    },
    [normalizeCourtSportPreferenceByMatchTargets, updateScheduleDay],
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
                      const isStepUnlocked =
                        stepIndex <= highestUnlockedStepIndex;
                      const isCurrentStep = stepIndex == currentStepIndex;

                      return (
                        <button
                          type="button"
                          key={label}
                          onClick={() => {
                            void handleStepNavigation(stepIndex);
                          }}
                          disabled={!isStepUnlocked || saving}
                          className={`flex min-h-[56px] items-center justify-center rounded-xl px-3 py-2 text-center text-xs font-semibold transition-colors ${
                            isCurrentStep
                              ? "bg-primary text-primary-foreground shadow-[0_6px_14px_rgba(220,38,38,0.32)] dark:shadow-none"
                              : isStepUnlocked
                                ? "bg-primary/10 text-primary hover:bg-primary/15"
                                : "bg-transparent text-muted-foreground/60 cursor-not-allowed"
                          }`}
                        >
                          <div className="leading-tight">
                            {stepIndex + 1}. {label}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-border/40 bg-background/40 dark:border-none p-2 pl-4 pr-4 shadow-lg backdrop-blur-md">
            <div className="flex items-center justify-between gap-4">
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
                      const isModalityCardExpanded =
                        expandedModalityCardBySportId[
                          modalityCard.sport_id
                        ] === true;
                      const modalityCardContentId =
                        `modality-card-content-${modalityCard.sport_id}`;

                      return (
                        <div
                          key={`wizard-modality-card-${modalityCard.sport_id}`}
                          data-testid={`modality-card-${modalityCard.sport_id}`}
                          className="overflow-hidden rounded-xl border border-border/40 bg-background/30 shadow-sm"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 bg-background/40 p-4">
                            <div className="space-y-0.5">
                              <p className="text-base font-bold">
                                {modalityCard.sport_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {modalityCard.selected_team_count}/
                                {modalityCard.eligible_team_count} atléticas
                                selecionadas
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs">
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
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`${
                                  isModalityCardExpanded
                                    ? "Recolher"
                                    : "Expandir"
                                } ${modalityCard.sport_name}`}
                                aria-expanded={isModalityCardExpanded}
                                aria-controls={modalityCardContentId}
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  setExpandedModalityCardBySportId(
                                    (currentValue) => ({
                                      ...currentValue,
                                      [modalityCard.sport_id]:
                                        !isModalityCardExpanded,
                                    }),
                                  );
                                }}
                              >
                                {isModalityCardExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>

                          {isModalityCardExpanded ? (
                            <div
                              id={modalityCardContentId}
                              className="space-y-3 p-4"
                            >
                          {isBeachSoccerCard ? (
                            <div className="rounded-md border border-border/60 bg-background/45 p-3">
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
                            <p className="text-xs text-muted-foreground">
                              Nenhuma atlética elegível para esta modalidade.
                            </p>
                          ) : (
                            <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">
                              {modalityCard.teams.map((team) => {
                                return (
                                  <label
                                    key={`${modalityCard.sport_id}-${team.team_id}`}
                                    className={cn(
                                      "mb-2 flex w-full break-inside-avoid-column items-center gap-2 rounded-lg border p-2 text-xs transition-all cursor-pointer",
                                      team.is_selected
                                        ? "border-primary/20 bg-primary/5"
                                        : "border-border/30 bg-background/20 hover:bg-background/40",
                                    )}
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
                                );
                              })}
                            </div>
                          )}
                            </div>
                          ) : null}
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
                      const isNaipeCardExpanded =
                        expandedNaipeCardBySportId[naipeCard.sport_id] ===
                        true;
                      const naipeCardContentId =
                        `naipe-card-content-${naipeCard.sport_id}`;
                      const naipeTabsInHeader = [
                        MatchNaipe.FEMININO,
                        MatchNaipe.MASCULINO,
                        MatchNaipe.MISTO,
                      ]
                        .map((naipe) =>
                          naipeCard.tabs.find((tab) => tab.naipe == naipe),
                        )
                        .filter((tab) => tab != null);

                      return (
                        <div
                          key={`wizard-naipe-card-${naipeCard.sport_id}`}
                          className="rounded-xl border border-border/40 bg-background/30 overflow-hidden shadow-sm"
                        >
                          <div className="bg-background/40 p-4 border-b border-border/40">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-base font-bold">
                                  {naipeCard.sport_name}
                                </p>
                              </div>

                              <div className="flex items-center gap-4">
                                <div className="space-y-1 text-right text-xs text-muted-foreground">
                                  {naipeTabsInHeader.map((tab) => (
                                    <p key={tab.naipe}>
                                      {MATCH_NAIPE_LABELS[tab.naipe]}: {" "}
                                      <span className="font-semibold text-foreground">
                                        {tab.selected_team_count}/
                                        {tab.eligible_team_count}
                                      </span>
                                    </p>
                                  ))}
                                </div>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`${
                                    isNaipeCardExpanded
                                      ? "Recolher"
                                      : "Expandir"
                                  } ${naipeCard.sport_name}`}
                                  aria-expanded={isNaipeCardExpanded}
                                  aria-controls={naipeCardContentId}
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    setExpandedNaipeCardBySportId(
                                      (currentValue) => ({
                                        ...currentValue,
                                        [naipeCard.sport_id]:
                                          !isNaipeCardExpanded,
                                      }),
                                    );
                                  }}
                                >
                                  {isNaipeCardExpanded ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          </div>

                          {isNaipeCardExpanded && activeNaipeTab ? (
                            <div
                              id={naipeCardContentId}
                              className="space-y-4 p-4"
                            >
                              <AnimatedTabBar
                                items={naipeCard.tabs.map((tab) => ({
                                  value: tab.naipe,
                                  label: tab.label,
                                  test_id: `naipe-card-${naipeCard.sport_id}-tab-${tab.naipe}`,
                                }))}
                                value={activeNaipeTab.naipe}
                                onValueChange={(value) =>
                                  setActiveNaipeTabBySportId(
                                    (currentActiveNaipeTabBySportId) => ({
                                      ...currentActiveNaipeTabBySportId,
                                      [naipeCard.sport_id]: value as MatchNaipe,
                                    }),
                                  )
                                }
                              />

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
                            <div className="flex flex-col items-start gap-1.5">
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
                  const isCompetitionGroupEditorExpanded =
                    expandedCompetitionGroupEditorByKey[competitionKey] ===
                    true;
                  const competitionGroupEditorContentId =
                    `competition-group-editor-${competitionKey}`;

                  return (
                    <div
                      key={competitionKey}
                      className="glass-card overflow-hidden rounded-xl border border-border/50 shadow-sm"
                    >
                      <div
                        className={cn(
                          "flex flex-wrap items-center justify-between gap-4 bg-background/40 p-4",
                          isCompetitionGroupEditorExpanded &&
                            "border-b border-border/50",
                        )}
                      >
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

                        <div className="flex items-center gap-2">
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
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            aria-label={`${isCompetitionGroupEditorExpanded ? "Recolher" : "Expandir"} grupos de ${competitionOption.sport_name} ${MATCH_NAIPE_LABELS[competitionOption.naipe]}`}
                            aria-expanded={isCompetitionGroupEditorExpanded}
                            aria-controls={competitionGroupEditorContentId}
                            className="h-12 w-12 border-border/40 bg-background/40 hover:bg-background/60"
                            onClick={() =>
                              setExpandedCompetitionGroupEditorByKey(
                                (currentValue) => ({
                                  ...currentValue,
                                  [competitionKey]:
                                    !isCompetitionGroupEditorExpanded,
                                }),
                              )
                            }
                          >
                            {isCompetitionGroupEditorExpanded ? (
                              <ChevronUp className="h-5 w-5" />
                            ) : (
                              <ChevronDown className="h-5 w-5" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {isCompetitionGroupEditorExpanded ? (
                        <div
                          id={competitionGroupEditorContentId}
                          className="p-4"
                        >
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
                      ) : null}
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
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-background/60">
                        <Checkbox
                          className={SQUARE_CHECKBOX_CLASS_NAME}
                          checked={shouldReplicatePreviousScheduleDay}
                          onCheckedChange={(checked) =>
                            setShouldReplicatePreviousScheduleDay(
                              checked == true,
                            )
                          }
                        />
                        Replicar locais e horários do dia anterior
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={handleAddScheduleDay}
                      >
                        <Plus className="h-4 w-4" />
                        Adicionar dia
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {scheduleDays.map((scheduleDay, scheduleDayIndex) => {
                      const isScheduleDayExpanded =
                        expandedScheduleDayById[scheduleDay.id] === true;
                      const scheduleDayContentId =
                        `schedule-day-content-${scheduleDay.id}`;

                      return (
                      <div
                        key={scheduleDay.id}
                        className="overflow-hidden rounded-xl border border-border/40 bg-background/30 shadow-sm"
                      >
                        <div className="bg-background/40 px-4 py-3 border-b border-border/40 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold">
                              Dia {scheduleDayIndex + 1}
                            </p>
                            {scheduleDay.date ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {resolveBrazilianDateString(scheduleDay.date)}
                                {scheduleDay.start_time && scheduleDay.end_time
                                  ? ` • ${scheduleDay.start_time} às ${scheduleDay.end_time}`
                                  : ""}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1">
                            {scheduleDays.length > 1 ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => removeScheduleDay(scheduleDay.id)}
                                aria-label={`Remover Dia ${scheduleDayIndex + 1}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`${
                                isScheduleDayExpanded ? "Recolher" : "Expandir"
                              } Dia ${scheduleDayIndex + 1}`}
                              aria-expanded={isScheduleDayExpanded}
                              aria-controls={scheduleDayContentId}
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setExpandedScheduleDayById((currentValue) => ({
                                  ...currentValue,
                                  [scheduleDay.id]: !isScheduleDayExpanded,
                                }));
                              }}
                            >
                              {isScheduleDayExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {isScheduleDayExpanded ? (
                        <div
                          id={scheduleDayContentId}
                          className="grid gap-6 p-4 xl:grid-cols-[minmax(0,200px)_minmax(0,1fr)]"
                        >
                          <div className="space-y-5">
                          <div className="space-y-4">
                            <div className="flex flex-col items-start gap-1.5">
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
                                className="max-w-[220px]"
                              />
                            </div>

                            <div className="flex flex-col items-start gap-1.5">
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
                                className="max-w-[220px]"
                              />
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="flex flex-col items-start gap-1.5">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Início Intervalo
                              </Label>
                              <TimeInput
                                value={scheduleDay.break_start_time}
                                onChange={(value) =>
                                  updateScheduleDay(scheduleDay.id, (prev) => ({
                                    ...prev,
                                    break_start_time: value,
                                  }))
                                }
                                className="sm:max-w-[220px]"
                              />
                            </div>
                            <div className="flex flex-col items-start gap-1.5">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Fim Intervalo
                              </Label>
                              <TimeInput
                                value={scheduleDay.break_end_time}
                                onChange={(value) =>
                                  updateScheduleDay(scheduleDay.id, (prev) => ({
                                    ...prev,
                                    break_end_time: value,
                                  }))
                                }
                                className="sm:max-w-[220px]"
                              />
                            </div>
                          </div>

                          </div>

                          <div className="space-y-3 border-t border-border/30 pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
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
                                  className="rounded-lg border border-border/30 bg-background/40 p-3"
                                >
                                  <div className="flex items-start justify-between gap-3">
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

                                  <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border/30 pt-3 md:grid-cols-2 xl:grid-cols-3">
                                    {location.courts.map((court) => {
                                      const courtResourceLocks =
                                        manualCourtResourceLocksByStep7Key.get(
                                          resolveCourtDayResourceLockKey({
                                            date: scheduleDay.date,
                                            location_key: location.id,
                                            court_key: court.id,
                                          }),
                                        ) ?? [];

                                      return (
                                        <div
                                          key={`${scheduleDay.id}-${location.id}-${court.id}-locks`}
                                          className="rounded-lg border border-border/20 bg-background/30 p-3"
                                        >
                                          <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-1.5">
                                              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                                {court.name}
                                              </p>
                                              <TooltipProvider delayDuration={100}>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <button
                                                      type="button"
                                                      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                                                      aria-label={`Ajuda sobre os bloqueios da quadra ${court.name}`}
                                                    >
                                                      <CircleHelp className="h-3.5 w-3.5" />
                                                    </button>
                                                  </TooltipTrigger>

                                                  <TooltipContent className="max-w-xs text-xs leading-relaxed">
                                                    Intervalos personalizados e bloqueios desta quadra neste dia. Use para ocupações de terceiros, manutenção, limpeza ou para deixar esta quadra com uma janela menor que a agenda geral.
                                                  </TooltipContent>
                                                </Tooltip>
                                              </TooltipProvider>
                                            </div>

                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              aria-label={`Adicionar bloqueio à quadra ${court.name}`}
                                              className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                              onClick={() =>
                                                handleAddManualCourtResourceLock(
                                                  scheduleDay,
                                                  location,
                                                  court,
                                                )
                                              }
                                            >
                                              <Plus className="h-4 w-4" />
                                            </Button>
                                          </div>

                                          <div className="mt-3 space-y-2">
                                            {courtResourceLocks.length == 0 ? (
                                              <p className="rounded-md border border-dashed border-border/30 px-3 py-2 text-[11px] italic text-muted-foreground">
                                                Nenhum bloqueio específico nesta
                                                quadra neste dia.
                                              </p>
                                            ) : (
                                              courtResourceLocks.map(
                                                ({
                                                  resourceLock,
                                                  index: resourceLockIndex,
                                                }) => (
                                                  <div
                                                    key={`${scheduleDay.id}-${location.id}-${court.id}-lock-${resourceLockIndex}`}
                                                    className="rounded-md border border-border/20 bg-background/50 p-3"
                                                  >
                                                    <div className="flex items-start gap-2">
                                                      <div className="min-w-0 flex-1 space-y-3">
                                                        <div className="space-y-1.5">
                                                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                            Início do bloqueio
                                                          </Label>
                                                          <TimeInput
                                                            value={
                                                              resourceLock.start_time
                                                            }
                                                            onChange={(value) =>
                                                              updateManualCourtResourceLock(
                                                                resourceLockIndex,
                                                                {
                                                                  start_time:
                                                                    value,
                                                                },
                                                              )
                                                            }
                                                          />
                                                        </div>

                                                        <div className="space-y-1.5">
                                                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                            Fim do bloqueio
                                                          </Label>
                                                          <TimeInput
                                                            value={
                                                              resourceLock.end_time
                                                            }
                                                            onChange={(value) =>
                                                              updateManualCourtResourceLock(
                                                                resourceLockIndex,
                                                                {
                                                                  end_time:
                                                                    value,
                                                                },
                                                              )
                                                            }
                                                          />
                                                        </div>
                                                      </div>

                                                      <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        aria-label="Remover bloqueio"
                                                        className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                        onClick={() =>
                                                          removeManualCourtResourceLock(
                                                            resourceLockIndex,
                                                          )
                                                        }
                                                      >
                                                        <Trash2 className="h-4 w-4" />
                                                      </Button>
                                                    </div>

                                                    <p className="mt-2 text-[10px] text-muted-foreground">
                                                      Agenda do dia:{" "}
                                                      {scheduleDay.start_time}{" "}
                                                      às {scheduleDay.end_time}
                                                      {scheduleDay.break_start_time &&
                                                      scheduleDay.break_end_time
                                                        ? ` • intervalo ${scheduleDay.break_start_time} às ${scheduleDay.break_end_time}`
                                                        : ""}
                                                    </p>
                                                  </div>
                                                ),
                                              )
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
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
                        ) : null}
                      </div>
                      );
                    })}

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
                          horário e recurso oficial. Se marcar "Reserva
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
                              const selectedScheduleDay = selectedDate
                                ? (scheduleDayByDate.get(selectedDate) ?? null)
                                : null;
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
                                Boolean(sessionConfig?.start_time) &&
                                Boolean(sessionConfig?.end_time) &&
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

                                  <div className="grid gap-4 sm:grid-cols-4">
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

                                          updateIndividualSessionConfig(
                                            sessionKey,
                                            {
                                              scheduled_date: nextDate,
                                              start_time: null,
                                              end_time: null,
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

                                    <div className="space-y-1.5 sm:col-span-2">
                                      <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="space-y-1.5">
                                          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                            Início
                                          </Label>
                                          <TimeInput
                                            value={
                                              sessionConfig?.start_time ?? ""
                                            }
                                            onChange={(value) =>
                                              updateIndividualSessionConfig(
                                                sessionKey,
                                                {
                                                  start_time: value || null,
                                                },
                                              )
                                            }
                                            disabled={!selectedDate}
                                            className="bg-background/50 border-border/40"
                                          />
                                        </div>

                                        <div className="space-y-1.5">
                                          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                            Fim
                                          </Label>
                                          <TimeInput
                                            value={
                                              sessionConfig?.end_time ?? ""
                                            }
                                            onChange={(value) =>
                                              updateIndividualSessionConfig(
                                                sessionKey,
                                                {
                                                  end_time: value || null,
                                                },
                                              )
                                            }
                                            disabled={!selectedDate}
                                            className="bg-background/50 border-border/40"
                                          />
                                        </div>
                                      </div>

                                      {selectedScheduleDay ? (
                                        <p className="pt-0.5 text-center text-[11px] text-muted-foreground">
                                          Agenda:{" "}
                                          {selectedScheduleDay.start_time} às{" "}
                                          {selectedScheduleDay.end_time}
                                        </p>
                                      ) : null}
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
                        const availableDayCount =
                          competitionAvailabilityItems.filter(
                            (availabilityItem) =>
                              availabilityItem?.mode != "UNAVAILABLE",
                          ).length;
                        const customDayCount =
                          competitionAvailabilityItems.filter(
                            (availabilityItem) =>
                              availabilityItem?.mode == "CUSTOM",
                          ).length;
                        const isCompetitionAvailabilityExpanded =
                          expandedCompetitionAvailabilityByKey[
                            competitionOption.key
                          ] === true;
                        const competitionAvailabilityContentId =
                          `competition-date-availability-content-${competitionOption.key}`;

                        return (
                          <div
                            key={`competition-date-availability-${competitionOption.key}`}
                            className="overflow-hidden rounded-xl border border-border/40 bg-background/30 shadow-sm"
                          >
                            <button
                              type="button"
                              aria-expanded={isCompetitionAvailabilityExpanded}
                              aria-controls={competitionAvailabilityContentId}
                              aria-label={`${
                                isCompetitionAvailabilityExpanded
                                  ? "Recolher"
                                  : "Expandir"
                              } disponibilidade de ${
                                competitionLabelByKey[
                                  competitionOption.key
                                ] ?? "Competição"
                              }`}
                              onClick={() => {
                                setExpandedCompetitionAvailabilityByKey(
                                  (currentValue) => ({
                                    ...currentValue,
                                    [competitionOption.key]:
                                      !isCompetitionAvailabilityExpanded,
                                  }),
                                );
                              }}
                              className={cn(
                                "flex w-full items-start justify-between gap-4 p-5 text-left transition-colors hover:text-foreground",
                                isCompetitionAvailabilityExpanded &&
                                  "border-b border-border/40",
                              )}
                            >
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

                              <div className="flex items-center gap-3 text-right text-xs font-medium text-muted-foreground">
                                <div>
                                  <p>
                                    {availableDayCount}/
                                    {competitionAvailabilityItems.length} dias
                                    disponíveis
                                  </p>
                                  {customDayCount > 0 ? (
                                    <p className="mt-1">
                                      {customDayCount} personalizado
                                      {customDayCount == 1 ? "" : "s"}
                                    </p>
                                  ) : null}
                                </div>
                                {isCompetitionAvailabilityExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </div>
                            </button>

                            {isCompetitionAvailabilityExpanded ? (
                              <div
                                id={competitionAvailabilityContentId}
                                className="p-5"
                              >
                            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
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
                                    allDaysUnavailable ? "default" : "secondary"
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
                                        currentScheduleDay.date == scheduleDate,
                                    ) ?? null;
                                  const hasBreak =
                                    Boolean(scheduleDay?.break_start_time) &&
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
                                                        <TimeInput
                                                          value={
                                                            availabilityWindow.start_time
                                                          }
                                                          onChange={(value) =>
                                                            updateCompetitionDateAvailabilityWindow(
                                                              competitionOption.key,
                                                              scheduleDate,
                                                              windowIndex,
                                                              "start_time",
                                                              value,
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
                                                        <TimeInput
                                                          value={
                                                            availabilityWindow.end_time
                                                          }
                                                          onChange={(value) =>
                                                            updateCompetitionDateAvailabilityWindow(
                                                              competitionOption.key,
                                                              scheduleDate,
                                                              windowIndex,
                                                              "end_time",
                                                              value,
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
                                          respeitando os intervalos
                                          configurados.
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
                          ) : null}
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
                          onValueChange={setSelectedTeamAvailabilityFilterValue}
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Todas as atléticas" />
                          </SelectTrigger>

                          <SelectContent>
                            <SelectItem value={ALL_TEAMS_FILTER_VALUE}>
                              Todas as atléticas
                            </SelectItem>

                            {teamAvailabilityFilterOptions.map((teamOption) => (
                              <SelectItem
                                key={`team-availability-filter-${teamOption.team_id}`}
                                value={teamOption.team_id}
                              >
                                {teamOption.team_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {filteredTeamDateAvailabilityCards.length == 0 ? (
                        <div className="rounded-xl border border-dashed border-border/40 bg-background/20 p-8 text-center text-sm text-muted-foreground">
                          Nenhuma atlética encontrada para os filtros aplicados.
                        </div>
                      ) : (
                        filteredTeamDateAvailabilityCards.map(
                          (teamAvailabilityCard) => {
                            const isTeamAvailabilityExpanded =
                              expandedTeamAvailabilityByTeamId[
                                teamAvailabilityCard.team_id
                              ] === true;
                            const teamAvailabilityContentId =
                              `team-date-availability-content-${teamAvailabilityCard.team_id}`;

                            return (
                            <div
                              key={`team-date-availability-${teamAvailabilityCard.team_id}`}
                              className="overflow-hidden rounded-xl border border-border/40 bg-background/30 shadow-sm"
                            >
                              <button
                                type="button"
                                aria-expanded={isTeamAvailabilityExpanded}
                                aria-controls={teamAvailabilityContentId}
                                aria-label={`${
                                  isTeamAvailabilityExpanded
                                    ? "Recolher"
                                    : "Expandir"
                                } modalidades de ${teamAvailabilityCard.team_name}`}
                                onClick={() => {
                                  setExpandedTeamAvailabilityByTeamId(
                                    (currentValue) => ({
                                      ...currentValue,
                                      [teamAvailabilityCard.team_id]:
                                        !isTeamAvailabilityExpanded,
                                    }),
                                  );
                                }}
                                className={cn(
                                  "flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:text-foreground",
                                  isTeamAvailabilityExpanded &&
                                    "border-b border-border/40",
                                )}
                              >
                                <div>
                                <p className="text-base font-bold">
                                  {teamAvailabilityCard.team_name}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Estas restrições são aplicadas somente aos
                                  jogos da fase de grupos.
                                </p>
                                </div>

                                <div className="flex items-center gap-3 text-right text-xs font-medium text-muted-foreground">
                                  <span>
                                    {teamAvailabilityCard.sport_cards.length}{" "}
                                    {teamAvailabilityCard.sport_cards.length ==
                                    1
                                      ? "modalidade"
                                      : "modalidades"}
                                  </span>
                                  {isTeamAvailabilityExpanded ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </div>
                              </button>

                              {isTeamAvailabilityExpanded ? (
                              <div
                                id={teamAvailabilityContentId}
                                className="space-y-4 p-5"
                              >
                                {teamAvailabilityCard.sport_cards.map(
                                  (sportCard) => {
                                    const supportedNaipes = sportCard.tabs.map(
                                      (tab) => tab.naipe,
                                    );

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

                                    const isTeamAvailabilitySportExpanded =
                                      expandedTeamAvailabilitySportByKey[
                                        sportCard.team_sport_key
                                      ] === true;
                                    const teamAvailabilitySportContentId =
                                      `team-date-availability-sport-content-${sportCard.team_sport_key}`;

                                    return (
                                      <div
                                        key={`team-date-sport-${sportCard.team_sport_key}`}
                                        className="rounded-xl border border-border/30 bg-background/20 p-4 shadow-sm dark:bg-transparent dark:shadow-none"
                                      >
                                        <button
                                          type="button"
                                          aria-expanded={
                                            isTeamAvailabilitySportExpanded
                                          }
                                          aria-controls={
                                            teamAvailabilitySportContentId
                                          }
                                          aria-label={`${
                                            isTeamAvailabilitySportExpanded
                                              ? "Recolher"
                                              : "Expandir"
                                          } disponibilidade de ${sportCard.sport_name} da ${teamAvailabilityCard.team_name}`}
                                          onClick={() => {
                                            setExpandedTeamAvailabilitySportByKey(
                                              (currentValue) => ({
                                                ...currentValue,
                                                [sportCard.team_sport_key]:
                                                  !isTeamAvailabilitySportExpanded,
                                              }),
                                            );
                                          }}
                                          className={cn(
                                            "flex w-full items-start justify-between gap-4 text-left transition-colors hover:text-foreground",
                                            isTeamAvailabilitySportExpanded &&
                                              "border-b border-border/30 pb-4",
                                          )}
                                        >
                                          <div>
                                            <p className="text-sm font-bold">
                                              {sportCard.sport_name}
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                              {sportCard.tabs.length} {" "}
                                              {sportCard.tabs.length == 1
                                                ? "naipe configurado"
                                                : "naipes configurados"}
                                            </p>
                                          </div>

                                          {isTeamAvailabilitySportExpanded ? (
                                            <ChevronUp className="h-4 w-4" />
                                          ) : (
                                            <ChevronDown className="h-4 w-4" />
                                          )}
                                        </button>

                                        {isTeamAvailabilitySportExpanded ? (
                                          <div
                                            id={teamAvailabilitySportContentId}
                                            className="mt-4"
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
                                                onValueChange={(nextValue) =>
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
                                            Nenhum dia está disponível para esta
                                            competição na etapa anterior.
                                          </div>
                                        ) : (
                                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                            {activeTab.visible_date_cards.map(
                                              (dateCard) => {
                                                const scheduleDay =
                                                  scheduleDays.find(
                                                    (currentScheduleDay) =>
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
                                                                (window) =>
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
                                                          {scheduleDay.end_time}
                                                          .
                                                        </p>
                                                      ) : null}
                                                    </div>

                                                    <RadioGroup
                                                      value={dateCard.team_mode}
                                                      className="grid gap-2"
                                                      onValueChange={(value) =>
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
                                                            Janelas da atlética
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

                                                        {dateCard.team_windows
                                                          .length == 0 ? (
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

                                                                      <TimeInput
                                                                        value={
                                                                          window.start_time
                                                                        }
                                                                        onChange={(
                                                                          value,
                                                                        ) =>
                                                                          updateTeamCompetitionDateAvailabilityWindow(
                                                                            teamAvailabilityCard.team_id,
                                                                            activeTab.competition_key,
                                                                            dateCard.date,
                                                                            windowIndex,
                                                                            "start_time",
                                                                            value,
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

                                                                      <TimeInput
                                                                        value={
                                                                          window.end_time
                                                                        }
                                                                        onChange={(
                                                                          value,
                                                                        ) =>
                                                                          updateTeamCompetitionDateAvailabilityWindow(
                                                                            teamAvailabilityCard.team_id,
                                                                            activeTab.competition_key,
                                                                            dateCard.date,
                                                                            windowIndex,
                                                                            "end_time",
                                                                            value,
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
                                        ) : null}
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                              ) : null}
                            </div>
                            );
                          },
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
                      className="mt-4 grid gap-3 lg:grid-cols-3"
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

                      <label
                        htmlFor="match-numbering-mode-sport"
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                          matchNumberingMode == "SPORT"
                            ? "border-primary/50 bg-primary/5"
                            : "border-border/40 bg-background/20 hover:border-border/70",
                        )}
                      >
                        <RadioGroupItem
                          id="match-numbering-mode-sport"
                          value="SPORT"
                          className="mt-0.5"
                        />

                        <div className="min-w-0">
                          <p className="text-sm font-bold">Por modalidade</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            Cada modalidade possui uma única sequência de jogos,
                            incluindo todos os naipes e mesmo quando os jogos
                            mudam de quadra.
                          </p>

                          <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                            Ex.: Futsal — Jogo 1, Jogo 2, Jogo 3...
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
                          Crie blocos de final por quadra, dia e horário. A
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
                            const selectedScheduleDay =
                              scheduleDayByDate.get(programBlock.date) ?? null;
                            const availableCourtOptions =
                              resolveKnockoutProgramCourtOptions(
                                programBlock.date,
                                programBlock.location_key,
                              );
                            const selectedCourtFixedBlocks = resourceLocks
                              .filter(
                                (resourceLock) =>
                                  resourceLock.date == programBlock.date &&
                                  resourceLock.location_key ==
                                    programBlock.location_key &&
                                  resourceLock.court_key ==
                                    programBlock.court_key &&
                                  resourceLock.start_time &&
                                  resourceLock.end_time,
                              )
                              .map(
                                (resourceLock) =>
                                  `${resourceLock.start_time} às ${resourceLock.end_time}`,
                              );
                            const blockDurationMinutes =
                              resolveTimeRangeDurationMinutes(
                                programBlock.start_time,
                                programBlock.end_time,
                              );
                            const selectedFinalCount =
                              programBlock.naipe_sequence.length > 0
                                ? programBlock.naipe_sequence.length
                                : 1;
                            const suggestedPerFinalDurationMinutes =
                              blockDurationMinutes != null
                                ? Math.max(
                                    1,
                                    Math.floor(
                                      blockDurationMinutes / selectedFinalCount,
                                    ),
                                  )
                                : null;
                            const finalDurationHelpText =
                              blockDurationMinutes == null
                                ? "Informe início e fim válidos para calcular a duração total reservada."
                                : selectedFinalCount > 1
                                  ? `Bloco reservado: ${blockDurationMinutes} min (${resolveMinutesWithHourLabel(blockDurationMinutes)}). Com ${selectedFinalCount} finais marcadas, a sugestão inicial é ${suggestedPerFinalDurationMinutes} min por final.`
                                  : `Bloco reservado: ${blockDurationMinutes} min (${resolveMinutesWithHourLabel(blockDurationMinutes)}). Com 1 final, este campo só precisa ser menor que o bloco se você quiser deixar sobra intencional.`;

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
                                        duplicateKnockoutProgramBlock(
                                          programBlockKey,
                                        )
                                      }
                                      aria-label={`Duplicar bloco ${
                                        programBlockIndex + 1
                                      }`}
                                      title="Duplicar bloco"
                                    >
                                      <Copy className="h-4 w-4" />
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

                                <div className="mt-4 grid gap-4 lg:grid-cols-7">
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
                                            start_time:
                                              scheduleDayByDate.get(nextDate)
                                                ?.start_time ?? "",
                                            end_time:
                                              scheduleDayByDate.get(nextDate)
                                                ?.end_time ?? "",
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
                                      Início
                                    </p>
                                    <TimeInput
                                      value={programBlock.start_time}
                                      onChange={(value) =>
                                        updateKnockoutProgramBlock(
                                          programBlockKey,
                                          (currentProgramBlock) => ({
                                            ...currentProgramBlock,
                                            start_time: value,
                                          }),
                                        )
                                      }
                                    />
                                  </div>

                                  <div>
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                      Fim
                                    </p>
                                    <TimeInput
                                      value={programBlock.end_time}
                                      onChange={(value) =>
                                        updateKnockoutProgramBlock(
                                          programBlockKey,
                                          (currentProgramBlock) => ({
                                            ...currentProgramBlock,
                                            end_time: value,
                                          }),
                                        )
                                      }
                                    />
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
                                        const nextDivisionScope =
                                          seasonSettings.division_format ==
                                          ChampionshipSeasonDivisionFormat.UNIFIED
                                            ? "ALL"
                                            : (nextCompetitionOptions[0]
                                              ?.division ??
                                              TeamDivision.DIVISAO_PRINCIPAL);
                                        const nextNaipeSequence =
                                          resolveAutomaticKnockoutProgramBlockNaipeSequence(
                                            {
                                              competitionOptions:
                                                nextCompetitionOptions,
                                              divisionScope: nextDivisionScope,
                                              divisionFormat:
                                                seasonSettings.division_format,
                                            },
                                          );

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
                                    <div className="mb-1 flex items-center gap-1.5">
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        Duração
                                      </p>
                                      <TooltipProvider delayDuration={100}>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              type="button"
                                              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                                              aria-label="Ajuda sobre a duração de cada final"
                                            >
                                              <CircleHelp className="h-3.5 w-3.5" />
                                            </button>
                                          </TooltipTrigger>

                                          <TooltipContent className="max-w-xs text-xs leading-relaxed">
                                            {finalDurationHelpText}
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </div>

                                    <div className="relative">
                                      <Input
                                        type="number"
                                        min={1}
                                        step={1}
                                        placeholder={
                                          suggestedPerFinalDurationMinutes !=
                                          null
                                            ? `${suggestedPerFinalDurationMinutes}`
                                            : "Usar duração padrão"
                                        }
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

                                  {selectedScheduleDay ? (
                                    <p className="lg:col-start-2 lg:col-span-2 lg:-mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
                                      Agenda: {selectedScheduleDay.start_time}{" "}
                                      às {selectedScheduleDay.end_time}
                                      {selectedScheduleDay.break_start_time &&
                                      selectedScheduleDay.break_end_time
                                        ? ` • intervalo ${selectedScheduleDay.break_start_time} às ${selectedScheduleDay.break_end_time}`
                                        : ""}
                                      {selectedCourtFixedBlocks.length > 0
                                        ? ` • bloqueios da quadra ${selectedCourtFixedBlocks.join(", ")}`
                                        : ""}
                                      .
                                    </p>
                                  ) : null}

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
                                        onValueChange={(value) => {
                                          const nextDivisionScope =
                                            value == "ALL"
                                              ? "ALL"
                                              : (value as TeamDivision);
                                          const nextNaipeSequence =
                                            resolveAutomaticKnockoutProgramBlockNaipeSequence(
                                              {
                                                competitionOptions:
                                                  availableCompetitionOptions,
                                                divisionScope:
                                                  nextDivisionScope,
                                                divisionFormat:
                                                  seasonSettings.division_format,
                                              },
                                            );

                                          updateKnockoutProgramBlock(
                                            programBlockKey,
                                            (currentProgramBlock) => ({
                                              ...currentProgramBlock,
                                              division_scope:
                                                nextDivisionScope,
                                              naipe_sequence:
                                                nextNaipeSequence,
                                            }),
                                          );
                                        }}
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
                      {courtPreferenceStepRows.map((preferenceRow) => {
                        const isCourtPreferenceDayExpanded =
                          expandedCourtPreferenceDayByKey[
                            preferenceRow.key
                          ] === true;
                        const courtPreferenceDayContentId =
                          `court-preference-day-content-${preferenceRow.key}`;
                        const dayDiagnostics =
                          structuralReviewState.review?.diagnostics.filter(
                            (diagnostic) =>
                              diagnostic.date == preferenceRow.date,
                          ) ?? [];
                        const dayStatusLabel =
                          dayDiagnostics.length == 0
                            ? "Tudo certo neste dia"
                            : `${dayDiagnostics.length} ${
                                dayDiagnostics.length == 1
                                  ? "pendência para revisar"
                                  : "pendências para revisar"
                              }`;

                        return (
                        <section
                          key={preferenceRow.key}
                          className="overflow-hidden rounded-xl border border-border/40 bg-background/30 shadow-sm"
                        >
                          <button
                            type="button"
                            aria-expanded={isCourtPreferenceDayExpanded}
                            aria-controls={courtPreferenceDayContentId}
                            aria-label={`${
                              isCourtPreferenceDayExpanded
                                ? "Recolher"
                                : "Expandir"
                            } programação de ${preferenceRow.day_label}`}
                            onClick={() => {
                              setExpandedCourtPreferenceDayByKey(
                                (currentValue) => ({
                                  ...currentValue,
                                  [preferenceRow.key]:
                                    !isCourtPreferenceDayExpanded,
                                }),
                              );
                            }}
                            className={cn(
                              "grid w-full gap-3 px-5 py-4 text-left transition-colors hover:text-foreground lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center",
                              isCourtPreferenceDayExpanded &&
                                "border-b border-border/40",
                            )}
                          >
                            <div>
                              <p className="text-base font-bold">
                                {preferenceRow.day_label}
                              </p>

                              <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                                <span>{preferenceRow.date_label}</span>
                                {preferenceRow.schedule_time_label ? (
                                  <span>
                                    • {preferenceRow.schedule_time_label}
                                  </span>
                                ) : null}
                                {preferenceRow.break_time_label ? (
                                  <span>
                                    • intervalo {preferenceRow.break_time_label}
                                  </span>
                                ) : null}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2 lg:justify-center">
                              {preferenceRow.court_cards.map(
                                (preferenceCard) => (
                                  <span
                                    key={`${preferenceCard.key}-header-summary`}
                                    className="rounded-md bg-background/50 px-2.5 py-1 text-[11px] text-muted-foreground"
                                  >
                                    <span className="font-semibold text-foreground">
                                      {preferenceCard.court.name ||
                                        "Quadra sem nome"}
                                      :
                                    </span>{" "}
                                    {preferenceCard.planned_sport_summaries
                                      .length > 0
                                      ? preferenceCard.planned_sport_summaries
                                          .map(
                                            (summary) =>
                                              `${summary.sport_name}: ${summary.planned_match_count} ${
                                                summary.planned_match_count ==
                                                1
                                                  ? "jogo"
                                                  : "jogos"
                                              }`,
                                          )
                                          .join(" • ")
                                      : "Sem jogos definidos"}
                                  </span>
                                ),
                              )}
                            </div>

                            <div className="flex items-center gap-3 text-right text-xs font-medium text-muted-foreground">
                              <div>
                                <p
                                  className={cn(
                                    "font-semibold",
                                    dayDiagnostics.length == 0
                                      ? "text-emerald-700 dark:text-emerald-400"
                                      : "text-amber-700 dark:text-amber-400",
                                  )}
                                >
                                  {dayStatusLabel}
                                </p>
                                <p>
                                  {preferenceRow.court_cards.length}{" "}
                                  {preferenceRow.court_cards.length == 1
                                    ? "quadra"
                                    : "quadras"}
                                </p>
                              </div>
                              {isCourtPreferenceDayExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </div>
                          </button>

                          {isCourtPreferenceDayExpanded ? (
                            <div
                              id={courtPreferenceDayContentId}
                              className="overflow-x-auto"
                            >
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
                                  const scheduleDayDate =
                                    scheduleDayDateById.get(
                                      preferenceCard.schedule_day_id,
                                    ) ?? "";
                                  const reviewCourt =
                                    structuralReviewCourtByStep11Key.get(
                                      [
                                        scheduleDayDate,
                                        preferenceCard.location_id,
                                        preferenceCard.court.id,
                                      ].join("::"),
                                    ) ?? null;
                                  const remainingCourtMinutes = reviewCourt
                                    ? Math.max(
                                        0,
                                        reviewCourt.free_minutes -
                                          reviewCourt.planned_collective_minutes,
                                      )
                                    : 0;

                                  const activePlannedSportOptions =
                                    preferenceCard.sport_options.filter(
                                      (sportOption) => {
                                        const currentTarget =
                                          preferenceCard.court.sport_match_targets.find(
                                            (target) =>
                                              target.sport_id ==
                                              sportOption.sport_id,
                                          ) ?? null;
                                        const recommendationLine =
                                          sportMatchTargetRecommendationByKey.get(
                                            [
                                              preferenceCard.schedule_day_id,
                                              preferenceCard.location_id,
                                              preferenceCard.court.id,
                                              sportOption.sport_id,
                                            ].join("::"),
                                          ) ?? null;
                                        const effectiveMatchCount =
                                          (currentTarget?.planning_mode ??
                                            "MANUAL") == "AUTO"
                                            ? (recommendationLine?.recommended_match_count ??
                                              0)
                                            : (currentTarget?.planned_match_count ??
                                              0);

                                        return (
                                          currentTarget != null &&
                                          ((currentTarget.planning_mode ??
                                            "MANUAL") == "AUTO" ||
                                            effectiveMatchCount > 0)
                                        );
                                      },
                                    );

                                  const implicitPreferredSportId =
                                    activePlannedSportOptions.length == 1
                                      ? activePlannedSportOptions[0]!.sport_id
                                      : null;

                                  const preferredSportId =
                                    currentPreference?.preferred_sport_id ??
                                    implicitPreferredSportId;

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
                                  const preferredSportCompetitionSummaries = (
                                    preferredSportOption?.competition_keys ?? []
                                  )
                                    .map(
                                      (competitionKey) =>
                                        competitionMatchTargetSummaryByCompetitionKey.get(
                                          competitionKey,
                                        ) ?? null,
                                    )
                                    .filter(
                                      (
                                        competitionSummary,
                                      ): competitionSummary is ChampionshipBracketCompetitionMatchTargetRecommendationSummary =>
                                        competitionSummary != null,
                                    );
                                  const availableNaipeCountForPreferredSport =
                                    new Set(
                                      preferredSportCompetitionSummaries.map(
                                        (competitionSummary) =>
                                          competitionSummary.naipe,
                                      ),
                                    ).size;

                                  const currentSequenceMode: ChampionshipBracketCourtSequenceMode =
                                    currentPreference?.sequence_mode ??
                                    "FLEXIBLE";
                                  const sequenceModeHelperText =
                                    currentSequenceMode == "GROUP_NAIPE"
                                      ? "O sistema divide os jogos do dia em blocos contínuos por naipe: primeiro usa o naipe prioritário configurado abaixo e, depois, continua com o outro naipe disponível da mesma modalidade. Se só um naipe estiver jogável nesta data, ele ocupa todo o bloco."
                                      : currentSequenceMode == "GROUP_DIVISION"
                                        ? "O sistema prioriza manter os jogos da mesma divisão agrupados. Se nenhum jogo dessa divisão puder ocorrer no próximo horário, outra divisão da mesma modalidade poderá utilizar o espaço."
                                        : null;

                                  const canGroupByNaipe =
                                    availableNaipeCountForPreferredSport > 1;
                                  const canAlternateNaipeAfterExclusiveKnockoutPhase =
                                    currentSequenceMode == "GROUP_NAIPE" &&
                                    availableNaipeCountForPreferredSport == 2;

                                  const canGroupByDivision =
                                    resolveUsesSeasonDivisions(
                                      seasonSettings,
                                    ) && availableDivisionOptions.length > 1;
                                  const shouldShowPreferredSportField =
                                    activePlannedSportOptions.length > 1;
                                  const shouldShowPreferredNaipeField =
                                    currentSequenceMode != "GROUP_DIVISION";
                                  const shouldShowPreferredDivisionField =
                                    resolveUsesSeasonDivisions(
                                      seasonSettings,
                                    ) && currentSequenceMode != "GROUP_NAIPE";
                                  const preferenceFieldCount = [
                                    shouldShowPreferredSportField,
                                    true,
                                    shouldShowPreferredNaipeField,
                                    shouldShowPreferredDivisionField,
                                  ].filter(Boolean).length;
                                  const preferenceFieldSpanClass =
                                    preferenceFieldCount <= 1
                                      ? "xl:col-span-12"
                                      : preferenceFieldCount == 2
                                        ? "xl:col-span-6"
                                        : preferenceFieldCount == 3
                                          ? "xl:col-span-4"
                                          : "xl:col-span-3";
                                  const compactCompetitionBalanceItems =
                                    activePlannedSportOptions.flatMap(
                                      (sportOption) =>
                                        sportOption.competition_keys
                                          .map(
                                            (competitionKey) =>
                                              competitionMatchTargetSummaryByCompetitionKey.get(
                                                competitionKey,
                                              ) ?? null,
                                          )
                                          .filter(
                                            (
                                              competitionSummary,
                                            ): competitionSummary is ChampionshipBracketCompetitionMatchTargetRecommendationSummary =>
                                              competitionSummary != null,
                                          )
                                          .flatMap((competitionSummary) => {
                                            const balanceLabel = [
                                              MATCH_NAIPE_LABELS[
                                                competitionSummary.naipe
                                              ],
                                              competitionSummary.division
                                                ? TEAM_DIVISION_LABELS[
                                                    competitionSummary.division
                                                  ]
                                                : null,
                                            ]
                                              .filter(Boolean)
                                              .join(" • ");

                                            if (
                                              competitionSummary.shortage_match_count >
                                              0
                                            ) {
                                              return [
                                                {
                                                  key: `${competitionSummary.competition_key}-shortage`,
                                                  tone: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                                                  text: `Faltam ${competitionSummary.shortage_match_count} ${balanceLabel}`,
                                                },
                                              ];
                                            }

                                            if (
                                              competitionSummary.excess_match_count >
                                              0
                                            ) {
                                              return [
                                                {
                                                  key: `${competitionSummary.competition_key}-excess`,
                                                  tone: "border-destructive/20 bg-destructive/10 text-destructive",
                                                  text: `Sobram ${competitionSummary.excess_match_count} ${balanceLabel}`,
                                                },
                                              ];
                                            }

                                            return [];
                                          }),
                                    );

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
                                        {compactCompetitionBalanceItems.length >
                                        0 ? (
                                          <div className="rounded-lg border border-border/30 bg-muted/20 px-3 py-3">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                              Resumo rápido por naipe
                                            </p>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                              {compactCompetitionBalanceItems.map(
                                                (balanceItem) => (
                                                  <span
                                                    key={`${preferenceCard.key}-${balanceItem.key}`}
                                                    className={cn(
                                                      "rounded-full border px-2 py-1 text-[10px] font-medium",
                                                      balanceItem.tone,
                                                    )}
                                                  >
                                                    {balanceItem.text}
                                                  </span>
                                                ),
                                              )}
                                            </div>
                                          </div>
                                        ) : null}

                                        {reviewCourt ? (
                                          <div className="grid gap-2 sm:grid-cols-3">
                                            <div className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
                                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                Janela livre do dia
                                              </p>
                                              <p className="mt-1 text-sm font-semibold">
                                                {reviewCourt.free_minutes} min
                                              </p>
                                              <p className="text-[11px] text-muted-foreground">
                                                {resolveMinutesWithHourLabel(
                                                  reviewCourt.free_minutes,
                                                )}
                                              </p>
                                            </div>

                                            <div className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
                                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                Tempo já reservado
                                              </p>
                                              <p className="mt-1 text-sm font-semibold">
                                                {
                                                  reviewCourt.planned_collective_minutes
                                                }{" "}
                                                min
                                              </p>
                                              <p className="text-[11px] text-muted-foreground">
                                                {resolveMinutesWithHourLabel(
                                                  reviewCourt.planned_collective_minutes,
                                                )}
                                              </p>
                                            </div>

                                            <div className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
                                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                Sobra após o planejado
                                              </p>
                                              <p className="mt-1 text-sm font-semibold">
                                                {remainingCourtMinutes} min
                                              </p>
                                              <p
                                                className={cn(
                                                  "text-[11px]",
                                                  reviewCourt.overflow_minutes >
                                                    0
                                                    ? "text-destructive"
                                                    : remainingCourtMinutes > 0
                                                      ? "text-emerald-700 dark:text-emerald-400"
                                                      : "text-muted-foreground",
                                                )}
                                              >
                                                {reviewCourt.overflow_minutes >
                                                0
                                                  ? `Faltam ${reviewCourt.overflow_minutes} min para acomodar tudo`
                                                  : remainingCourtMinutes > 0
                                                    ? "Ainda existe espaço neste dia"
                                                    : "Dia preenchido exatamente"}
                                              </p>
                                            </div>
                                          </div>
                                        ) : null}

                                        <div>
                                          <ChampionshipBracketFieldLabel
                                            label="Jogos planejados por modalidade"
                                            helpText={`Defina quantos jogos de cada modalidade devem ser programados nesta quadra neste dia. A lista já considera apenas modalidades e naipes com janela jogável nesta data.

Campo vazio significa que essa modalidade não terá jogos automáticos nesta quadra neste dia.
A quantidade inclui todos os naipes da modalidade. Finais programadas manualmente são tratadas separadamente.`}
                                          />

                                          <div className="space-y-2">
                                            {preferenceCard.sport_options.map(
                                              (sportOption) => {
                                                const currentTarget =
                                                  preferenceCard.court.sport_match_targets.find(
                                                    (target) =>
                                                      target.sport_id ==
                                                      sportOption.sport_id,
                                                  ) ?? null;
                                                const recommendationLine =
                                                  sportMatchTargetRecommendationByKey.get(
                                                    [
                                                      preferenceCard.schedule_day_id,
                                                      preferenceCard.location_id,
                                                      preferenceCard.court.id,
                                                      sportOption.sport_id,
                                                    ].join("::"),
                                                  ) ?? null;
                                                const sportSummary =
                                                  sportMatchTargetSummaryBySportId.get(
                                                    sportOption.sport_id,
                                                  ) ?? null;
                                                const competitionSummaries =
                                                  sportOption.competition_keys
                                                    .map(
                                                      (competitionKey) =>
                                                        competitionMatchTargetSummaryByCompetitionKey.get(
                                                          competitionKey,
                                                        ) ?? null,
                                                    )
                                                    .filter(
                                                      (
                                                        competitionSummary,
                                                      ): competitionSummary is ChampionshipBracketCompetitionMatchTargetRecommendationSummary =>
                                                        competitionSummary !=
                                                        null,
                                                    );
                                                const lineCompetitionBreakdownByKey =
                                                  new Map(
                                                    (
                                                      recommendationLine?.competition_breakdowns ??
                                                      []
                                                    ).map((breakdown) => [
                                                      breakdown.competition_key,
                                                      breakdown,
                                                    ]),
                                                  );
                                                const planningMode: ChampionshipBracketCourtSportMatchTargetPlanningMode =
                                                  currentTarget?.planning_mode ??
                                                  "MANUAL";
                                                const effectiveMatchCount =
                                                  planningMode == "AUTO"
                                                    ? (recommendationLine?.recommended_match_count ??
                                                      0)
                                                    : (currentTarget?.planned_match_count ??
                                                      0);
                                                const reviewPlanningItem =
                                                  reviewCourt?.planning_items.find(
                                                    (planningItem) =>
                                                      planningItem.sport_id ==
                                                      sportOption.sport_id,
                                                  ) ?? null;
                                                const lineDistributedCompetitionMatchCount =
                                                  [
                                                    ...lineCompetitionBreakdownByKey.values(),
                                                  ].reduce(
                                                    (
                                                      total,
                                                      competitionBreakdown,
                                                    ) =>
                                                      total +
                                                      competitionBreakdown.planned_match_count,
                                                    0,
                                                  );
                                                const lineExcessAboveRequiredMatchCount =
                                                  Math.max(
                                                    0,
                                                    effectiveMatchCount -
                                                      lineDistributedCompetitionMatchCount,
                                                  );

                                                return (
                                                  <div
                                                    key={`${preferenceCard.key}-target-${sportOption.sport_id}`}
                                                    className="space-y-2 rounded-lg border border-border/30 bg-background/30 px-3 py-3"
                                                  >
                                                    <div className="flex items-start justify-between gap-3">
                                                      <div className="min-w-0 flex-1">
                                                        <p className="truncate text-xs font-bold text-foreground">
                                                          {
                                                            sportOption.sport_name
                                                          }
                                                        </p>

                                                        {reviewPlanningItem ? (
                                                          <p
                                                            className={cn(
                                                              "mt-1 text-[10px] leading-relaxed",
                                                              reviewPlanningItem.overflow_minutes >
                                                                0
                                                                ? "text-destructive"
                                                                : "text-muted-foreground",
                                                            )}
                                                          >
                                                            {reviewPlanningItem.overflow_minutes >
                                                            0 ? (
                                                              <>
                                                                Faltam{" "}
                                                                {
                                                                  reviewPlanningItem.overflow_minutes
                                                                }{" "}
                                                                min para essa
                                                                quantidade
                                                                caber.
                                                              </>
                                                            ) : (
                                                              <>
                                                                Ainda sobram{" "}
                                                                {
                                                                  reviewPlanningItem.remaining_minutes
                                                                }{" "}
                                                                min; cabem
                                                                aprox.{" "}
                                                                {
                                                                  reviewPlanningItem.additional_match_capacity
                                                                }{" "}
                                                                jogo(s) extras.
                                                              </>
                                                            )}
                                                          </p>
                                                        ) : null}

                                                        {sportSummary &&
                                                        competitionSummaries.length ==
                                                          0 ? (
                                                          <p
                                                            className={cn(
                                                              "mt-1 text-[10px] leading-relaxed",
                                                              sportSummary.shortage_match_count >
                                                                0
                                                                ? "text-amber-700 dark:text-amber-400"
                                                                : sportSummary.excess_match_count >
                                                                    0
                                                                  ? "text-destructive"
                                                                  : "text-emerald-700 dark:text-emerald-400",
                                                            )}
                                                          >
                                                            {sportSummary.shortage_match_count >
                                                            0
                                                              ? competitionSummaries.every(
                                                                  (
                                                                    competitionSummary,
                                                                  ) =>
                                                                    competitionSummary.shortage_match_count ==
                                                                      0 &&
                                                                    competitionSummary.excess_match_count ==
                                                                      0,
                                                                )
                                                                ? `Ainda faltam ${sportSummary.shortage_match_count} jogo(s) desta modalidade em outras datas ou quadras do campeonato.`
                                                                : `Saldo total da modalidade: ainda faltam ${sportSummary.shortage_match_count} jogo(s) no campeonato.`
                                                              : sportSummary.excess_match_count >
                                                                  0
                                                                ? competitionSummaries.every(
                                                                    (
                                                                      competitionSummary,
                                                                    ) =>
                                                                      competitionSummary.shortage_match_count ==
                                                                        0 &&
                                                                      competitionSummary.excess_match_count ==
                                                                        0,
                                                                  )
                                                                  ? `Existem ${sportSummary.excess_match_count} jogo(s) desta modalidade acima do necessário em outras datas ou quadras do campeonato.`
                                                                  : `Saldo total da modalidade: existem ${sportSummary.excess_match_count} jogo(s) planejados acima do necessário no campeonato.`
                                                                : "Saldo total da modalidade em equilíbrio no campeonato."}
                                                          </p>
                                                        ) : null}

                                                        {lineExcessAboveRequiredMatchCount >
                                                        0 ? (
                                                          <p className="mt-1 text-[10px] leading-relaxed text-destructive">
                                                            Desta linha,{" "}
                                                            {
                                                              lineExcessAboveRequiredMatchCount
                                                            }{" "}
                                                            jogo(s) não
                                                            encontraram encaixe
                                                            válido entre os
                                                            naipes e fases
                                                            elegíveis desta
                                                            modalidade no
                                                            campeonato.
                                                          </p>
                                                        ) : null}
                                                      </div>

                                                      <div className="grid shrink-0 grid-cols-[132px_88px] gap-3 self-start">
                                                        <Select
                                                          value={planningMode}
                                                          onValueChange={(
                                                            value,
                                                          ) =>
                                                            updateCourtSportMatchTargetPlanningMode(
                                                              preferenceCard.schedule_day_id,
                                                              preferenceCard.location_id,
                                                              preferenceCard
                                                                .court.id,
                                                              sportOption.sport_id,
                                                              value as ChampionshipBracketCourtSportMatchTargetPlanningMode,
                                                            )
                                                          }
                                                        >
                                                          <SelectTrigger className="h-9">
                                                            <SelectValue />
                                                          </SelectTrigger>

                                                          <SelectContent>
                                                            <SelectItem value="MANUAL">
                                                              Manual
                                                            </SelectItem>
                                                            <SelectItem value="AUTO">
                                                              Automático
                                                            </SelectItem>
                                                          </SelectContent>
                                                        </Select>

                                                        <Input
                                                          type="number"
                                                          min={0}
                                                          step={1}
                                                          placeholder="0"
                                                          value={
                                                            planningMode ==
                                                            "AUTO"
                                                              ? effectiveMatchCount
                                                              : (currentTarget?.planned_match_count ??
                                                                "")
                                                          }
                                                          readOnly={
                                                            planningMode ==
                                                            "AUTO"
                                                          }
                                                          disabled={
                                                            planningMode ==
                                                            "AUTO"
                                                          }
                                                          onChange={(event) => {
                                                            const nextValue =
                                                              event.target
                                                                .value;

                                                            updateCourtSportMatchTarget(
                                                              preferenceCard.schedule_day_id,
                                                              preferenceCard.location_id,
                                                              preferenceCard
                                                                .court.id,
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
                                                    </div>

                                                    {competitionSummaries.length >
                                                    0 ? (
                                                      <div className="w-full">
                                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                          Saldo por naipe
                                                          {resolveUsesSeasonDivisions(
                                                            seasonSettings,
                                                          )
                                                            ? " / divisão"
                                                            : ""}
                                                        </p>
                                                        <div className="mt-1.5 grid w-full gap-2 md:grid-cols-2">
                                                          {competitionSummaries.map(
                                                            (
                                                              competitionSummary,
                                                            ) => {
                                                              const lineBreakdown =
                                                                lineCompetitionBreakdownByKey.get(
                                                                  competitionSummary.competition_key,
                                                                ) ?? null;

                                                              return (
                                                                <div
                                                                  key={`${preferenceCard.key}-competition-balance-${competitionSummary.competition_key}`}
                                                                  className={cn(
                                                                    "min-w-0 rounded-md border px-2 py-1.5 text-[10px] leading-relaxed",
                                                                    competitionSummary.shortage_match_count >
                                                                      0
                                                                      ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                                                      : competitionSummary.excess_match_count >
                                                                          0
                                                                        ? "border-destructive/20 bg-destructive/10 text-destructive"
                                                                        : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                                                                  )}
                                                                >
                                                                  <span className="block font-semibold">
                                                                    {[
                                                                      MATCH_NAIPE_LABELS[
                                                                        competitionSummary
                                                                          .naipe
                                                                      ],
                                                                      competitionSummary.division
                                                                        ? TEAM_DIVISION_LABELS[
                                                                            competitionSummary
                                                                              .division
                                                                          ]
                                                                        : null,
                                                                    ]
                                                                      .filter(
                                                                        Boolean,
                                                                      )
                                                                      .join(
                                                                        " • ",
                                                                      )}
                                                                  </span>
                                                                  <span className="mt-0.5 block text-current/80">
                                                                    Nesta
                                                                    quadra/dia:{" "}
                                                                    {lineBreakdown?.planned_match_count ??
                                                                      0}
                                                                  </span>
                                                                  <span className="block text-current/80">
                                                                    Total do
                                                                    campeonato:{" "}
                                                                    {
                                                                      competitionSummary.resolved_match_count
                                                                    }{" "}
                                                                    de{" "}
                                                                    {
                                                                      competitionSummary.required_match_count
                                                                    }
                                                                  </span>
                                                                  <span className="mt-0.5 block">
                                                                    {competitionSummary.shortage_match_count >
                                                                    0
                                                                      ? `Ainda faltam ${competitionSummary.shortage_match_count} jogo(s) deste naipe no campeonato.`
                                                                      : competitionSummary.excess_match_count >
                                                                          0
                                                                        ? `Existem ${competitionSummary.excess_match_count} jogo(s) deste naipe acima do necessário no campeonato.`
                                                                        : "Quantidade em equilíbrio para este naipe no campeonato."}
                                                                  </span>
                                                                </div>
                                                              );
                                                            },
                                                          )}
                                                        </div>
                                                      </div>
                                                    ) : null}
                                                  </div>
                                                );
                                              },
                                            )}
                                          </div>
                                        </div>

                                        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-12">
                                          {shouldShowPreferredSportField ? (
                                            <div
                                              className={cn(
                                                "min-w-0 self-start",
                                                preferenceFieldSpanClass,
                                              )}
                                            >
                                              <ChampionshipBracketFieldLabel label="Modalidade preferencial" />

                                              <Select
                                                value={
                                                  preferredSportId ?? "NONE"
                                                }
                                                onValueChange={(value) =>
                                                  updateCourtSportPreference(
                                                    preferenceCard.schedule_day_id,
                                                    preferenceCard.location_id,
                                                    preferenceCard.court.id,
                                                    value == "NONE"
                                                      ? null
                                                      : value,
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

                                                  {activePlannedSportOptions.map(
                                                    (sportOption) => (
                                                      <SelectItem
                                                        key={
                                                          sportOption.sport_id
                                                        }
                                                        value={
                                                          sportOption.sport_id
                                                        }
                                                      >
                                                        {sportOption.sport_name}
                                                      </SelectItem>
                                                    ),
                                                  )}
                                                </SelectContent>
                                              </Select>
                                            </div>
                                          ) : null}

                                          <div
                                            className={cn(
                                              "min-w-0 self-start",
                                              preferenceFieldSpanClass,
                                            )}
                                          >
                                            <ChampionshipBracketFieldLabel
                                              label="Sequenciamento"
                                              helpText={sequenceModeHelperText}
                                            />

                                            <Select
                                              disabled={
                                                preferredSportId == null
                                              }
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
                                          </div>

                                          {shouldShowPreferredNaipeField ? (
                                            <div
                                              className={cn(
                                                "min-w-0 self-start",
                                                preferenceFieldSpanClass,
                                              )}
                                            >
                                              <ChampionshipBracketFieldLabel
                                                label={
                                                  currentSequenceMode ==
                                                  "GROUP_NAIPE"
                                                    ? "Primeiro naipe"
                                                    : "Naipe preferencial"
                                                }
                                              />

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
                                          ) : shouldShowPreferredDivisionField ? (
                                            <div
                                              className={cn(
                                                "min-w-0 self-start",
                                                preferenceFieldSpanClass,
                                              )}
                                            >
                                              <ChampionshipBracketFieldLabel
                                                label={
                                                  currentSequenceMode ==
                                                  "GROUP_DIVISION"
                                                    ? "Primeira divisão"
                                                    : "Divisão preferencial"
                                                }
                                              />

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

                                          {canAlternateNaipeAfterExclusiveKnockoutPhase ? (
                                            <div className="flex min-w-0 items-center gap-2 self-end pt-1 xl:col-span-12">
                                              <Checkbox
                                                id={`alternate-naipe-after-exclusive-knockout-${preferenceCard.key}`}
                                                checked={
                                                  currentPreference?.alternate_naipe_after_exclusive_knockout_phase ===
                                                  true
                                                }
                                                onCheckedChange={(checked) => {
                                                  if (!preferredSportId) {
                                                    return;
                                                  }

                                                  updateCourtSportPreference(
                                                    preferenceCard.schedule_day_id,
                                                    preferenceCard.location_id,
                                                    preferenceCard.court.id,
                                                    preferredSportId,
                                                    {
                                                      alternate_naipe_after_exclusive_knockout_phase:
                                                        checked === true,
                                                    },
                                                  );
                                                }}
                                              />

                                              <Label
                                                htmlFor={`alternate-naipe-after-exclusive-knockout-${preferenceCard.key}`}
                                                className="cursor-pointer text-xs font-medium leading-tight"
                                              >
                                                Alternar prioridade após fase eliminatória exclusiva
                                              </Label>

                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <button
                                                    type="button"
                                                    className="text-muted-foreground transition-colors hover:text-foreground"
                                                    aria-label="Entenda a alternância de prioridade após fase eliminatória exclusiva"
                                                  >
                                                    <CircleHelp className="size-3.5" />
                                                  </button>
                                                </TooltipTrigger>

                                                <TooltipContent className="max-w-72">
                                                  Quando apenas um naipe disputar uma fase do mata-mata, a próxima fase com os dois naipes começará pelo outro, preservando um intervalo maior de descanso. Blocos manuais de final continuam prevalecendo.
                                                </TooltipContent>
                                              </Tooltip>
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          </div>
                          ) : null}
                        </section>
                        );
                      })}
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
                      Confira a capacidade estrutural da agenda e, após isso,
                      rode manualmente a simulação exata antes de gerar o
                      chaveamento definitivo.
                    </p>
                  </div>

                  {structuralReviewState.error ? (
                    <Alert className="mb-6">
                      <AlertTitle>
                        Não foi possível montar a revisão estrutural
                      </AlertTitle>
                      <AlertDescription>
                        {structuralReviewState.error}
                      </AlertDescription>
                    </Alert>
                  ) : structuralReviewState.review ? (
                    <div className="space-y-6">
                      {isExactPreviewJobRunning && exactPreviewCache ? (
                        <div className="space-y-2 rounded-xl border border-border/40 bg-background/30 p-4">
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="font-semibold">
                              {exactPreviewCache.stage}
                            </span>
                            <span className="text-muted-foreground">
                              {Math.round(
                                exactPreviewCache.progress_percentage,
                              )}%
                            </span>
                          </div>
                          <Progress
                            value={exactPreviewCache.progress_percentage}
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Job {exactPreviewCache.job_id.slice(0, 8)} ·{" "}
                            {exactPreviewCache.processed_slots} de{" "}
                            {exactPreviewCache.total_slots} janela(s)
                            processada(s)
                            {exactPreviewCache.current_date
                              ? ` · ${resolveBrazilianDateString(
                                  exactPreviewCache.current_date,
                                )}`
                              : ""}
                            . Os lotes são retomados automaticamente após
                            falhas de rede ou recarregamento da página.
                          </p>
                        </div>
                      ) : null}

                      <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold">
                            Revisão estrutural pronta instantaneamente
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            type="button"
                            onClick={() => {
                              void loadOperationalPreview();
                            }}
                            disabled={
                              loadingOperationalPreview ||
                              isExactPreviewJobRunning ||
                              !structuralReviewState.payload
                            }
                          >
                            {loadingOperationalPreview ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Calculando...
                              </>
                            ) : isExactPreviewJobRunning ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Processando em segundo plano
                              </>
                            ) : exactPreviewCache ? (
                              "Atualizar programação exata"
                            ) : (
                              "Calcular programação exata"
                            )}
                          </Button>

                          {isExactPreviewJobRunning ? (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void cancelOperationalPreview()}
                            >
                              Cancelar cálculo
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {pendingStructuralReviewMatchEntries.length > 0 ? (
                        <Alert>
                          <AlertTitle>
                            Jogos que ainda não encontraram espaço nesta revisão
                          </AlertTitle>

                          <AlertDescription className="space-y-2">
                            <p>
                              {pendingStructuralReviewMatchEntries.length}{" "}
                              jogo(s) planejado(s) ainda não couberam na agenda
                              local desta simulação.
                            </p>

                            {structuralReviewState.review.summary
                              .overflow_minutes == 0 ? (
                              <p className="text-xs text-muted-foreground">
                                Aqui o problema não foi falta de minutos no dia
                                inteiro. Faltou uma janela contínua compatível
                                depois de considerar pausas, bloqueios e a ordem
                                local dos jogos.
                              </p>
                            ) : null}

                            <div className="space-y-1">
                              {pendingStructuralReviewMatchEntries
                                .slice(0, 5)
                                .map((pendingEntry) => (
                                  <p
                                    key={`top-pending-match-${pendingEntry.date}-${pendingEntry.court_name}-${pendingEntry.match_number}-${pendingEntry.sport_id}-${pendingEntry.naipe}`}
                                    className="text-xs text-muted-foreground"
                                  >
                                    Jogo {pendingEntry.match_number}:{" "}
                                    {pendingEntry.sport_name} •{" "}
                                    {MATCH_NAIPE_LABELS[pendingEntry.naipe]}
                                    {pendingEntry.division
                                      ? ` • ${TEAM_DIVISION_LABELS[pendingEntry.division]}`
                                      : ""}
                                    {" • "}
                                    {pendingEntry.phase_label}
                                    {" • "}
                                    {resolveBrazilianDateString(
                                      pendingEntry.date,
                                    )}
                                    {" • "}
                                    {pendingEntry.location_name}
                                    {" • "}
                                    {pendingEntry.court_name}
                                  </p>
                                ))}
                            </div>
                          </AlertDescription>
                        </Alert>
                      ) : null}

                      {structuralReviewState.review.diagnostics.length > 0 ? (
                        <Alert>
                          <AlertTitle>
                            Pontos para revisar antes de gerar a programação
                          </AlertTitle>

                          <AlertDescription className="space-y-3">
                            <p>
                              {structuralReviewState.review.diagnostics.length}{" "}
                              ajuste(s) foi(ram) identificado(s) antes da
                              montagem final da agenda.
                            </p>

                            <div className="space-y-2">
                              {structuralReviewState.review.diagnostics.map(
                                (diagnostic, diagnosticIndex) => {
                                  const detailParts = [
                                    diagnostic.sport_name,
                                    diagnostic.team_name,
                                    diagnostic.date
                                      ? resolveBrazilianDateString(
                                          diagnostic.date,
                                        )
                                      : null,
                                    diagnostic.location_name,
                                    diagnostic.court_name,
                                  ].filter(Boolean);

                                  return (
                                    <div
                                      key={[
                                        diagnostic.code,
                                        diagnostic.sport_id ?? "sem-modalidade",
                                        diagnostic.team_id ?? "sem-atletica",
                                        diagnostic.date ?? "sem-data",
                                        diagnosticIndex,
                                      ].join("::")}
                                      className="rounded-lg border border-border/50 bg-background/60 px-3 py-2"
                                    >
                                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className="text-sm font-semibold">
                                          {resolveStructuralDiagnosticTitle(
                                            diagnostic,
                                          )}
                                        </span>

                                        {detailParts.length > 0 ? (
                                          <span className="text-xs text-muted-foreground">
                                            {detailParts.join(" • ")}
                                          </span>
                                        ) : null}
                                      </div>

                                      <p className="mt-1 text-xs text-muted-foreground">
                                        {diagnostic.message}
                                      </p>
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                          Nenhum ajuste importante foi encontrado nesta revisão
                          local.
                        </div>
                      )}

                      <div className="space-y-6">
                        {structuralReviewState.review.days.map((reviewDay) => {
                          const isReviewDayExpanded =
                            expandedStructuralReviewDayByDate[
                              reviewDay.date
                            ] === true;
                          const reviewDayContentId = `structural-review-day-content-${reviewDay.date}`;

                          return (
                            <section
                              key={`structural-review-day-${reviewDay.date}`}
                              className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm"
                            >
                              <button
                                type="button"
                                aria-expanded={isReviewDayExpanded}
                                aria-controls={reviewDayContentId}
                                aria-label={`${
                                  isReviewDayExpanded ? "Recolher" : "Expandir"
                                } prévia de ${resolveBrazilianDateString(
                                  reviewDay.date,
                                )}`}
                                onClick={() => {
                                  setExpandedStructuralReviewDayByDate(
                                    (currentValue) => ({
                                      ...currentValue,
                                      [reviewDay.date]: !isReviewDayExpanded,
                                    }),
                                  );
                                }}
                                className={cn(
                                  "flex w-full items-center justify-between gap-4 text-left transition-colors hover:text-foreground",
                                  isReviewDayExpanded &&
                                    "border-b border-border/40 pb-4",
                                )}
                              >
                              <div>
                                <p className="text-base font-bold">
                                  {resolveBrazilianDateString(reviewDay.date)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {reviewDay.start_time} até{" "}
                                  {reviewDay.end_time}
                                </p>
                              </div>

                              <div className="flex items-center gap-3 text-right text-xs text-muted-foreground">
                                <div>
                                  <p>{reviewDay.locations.length} local(is)</p>
                                  <p>
                                    {reviewDay.locations.reduce(
                                      (totalCourts, location) =>
                                        totalCourts + location.courts.length,
                                      0,
                                    )}{" "}
                                    quadra(s)
                                  </p>
                                </div>
                                {isReviewDayExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </div>
                              </button>

                              {isReviewDayExpanded ? (
                                <div
                                  id={reviewDayContentId}
                                  className="mt-5 space-y-5"
                                >
                              {reviewDay.locations.map((location) => (
                                <div
                                  key={`structural-review-day-${reviewDay.date}-location-${location.location_key}`}
                                  className="space-y-3"
                                >
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold">
                                      {location.location_name}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                      {location.courts.length} quadra(s)
                                    </p>
                                  </div>

                                  <div
                                    className="grid gap-4"
                                    style={{
                                      gridTemplateColumns: `repeat(${Math.max(
                                        location.courts.length,
                                        1,
                                      )}, minmax(0, 1fr))`,
                                    }}
                                  >
                                    {location.courts.map((court) => {
                                      const courtDisplayEntries =
                                        resolveStructuralReviewCourtDisplayEntries(
                                          reviewDay,
                                          court,
                                        );
                                      const remainingCourtMinutes = Math.max(
                                        0,
                                        court.free_minutes -
                                          court.planned_collective_minutes,
                                      );

                                      return (
                                        <div
                                          key={`structural-review-day-${reviewDay.date}-court-${court.court_key}`}
                                          className="min-w-0 overflow-hidden rounded-xl border border-border/40 bg-background/40 p-4"
                                        >
                                          <div className="flex items-start justify-between gap-3 border-b border-border/30 pb-3">
                                            <div>
                                              <p className="text-sm font-bold">
                                                {court.court_name}
                                              </p>
                                              <p className="text-[11px] text-muted-foreground">
                                                {
                                                  court.estimated_match_entries
                                                    .length
                                                }{" "}
                                                jogo(s) previstos
                                              </p>
                                            </div>

                                            <div className="text-right text-[11px] text-muted-foreground">
                                              <p>
                                                {court.free_minutes} min
                                                disponíveis
                                              </p>
                                              <p>
                                                {
                                                  court.planned_collective_minutes
                                                }{" "}
                                                min reservados para jogos
                                              </p>
                                              <p>
                                                {remainingCourtMinutes} min
                                                livres ainda
                                              </p>
                                            </div>
                                          </div>

                                          <div className="mt-4 space-y-3">
                                            <div>
                                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                Sequência cronológica da quadra
                                              </p>

                                              {courtDisplayEntries.length ==
                                              0 ? (
                                                <div className="rounded-lg border border-dashed border-border/40 px-3 py-3 text-sm text-muted-foreground">
                                                  Nenhum bloco pôde ser exibido
                                                  nesta quadra neste dia.
                                                </div>
                                              ) : (
                                                <div className="space-y-2">
                                                  {courtDisplayEntries.map(
                                                    (displayEntry) => {
                                                      if (
                                                        displayEntry.kind ==
                                                        "ESTIMATED"
                                                      ) {
                                                        const estimatedEntry =
                                                          displayEntry.entry;

                                                        return (
                                                          <div
                                                            key={
                                                              displayEntry.key
                                                            }
                                                            className={cn(
                                                              "structural-review-timeline-entry rounded-md border px-2.5 py-2",
                                                              resolveEstimatedMatchEntryToneClassName(
                                                                estimatedEntry,
                                                              ),
                                                            )}
                                                          >
                                                            <div className="flex items-start justify-between gap-2">
                                                              <div className="min-w-0 flex-1">
                                                                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
                                                                  <AppBadge
                                                                    tone={
                                                                      AppBadgeTone.SILVER
                                                                    }
                                                                    className="border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] leading-none text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                                                  >
                                                                    Jogo{" "}
                                                                    {
                                                                      estimatedEntry.match_number
                                                                    }
                                                                  </AppBadge>
                                                                  <AppBadge
                                                                    tone={
                                                                      AppBadgeTone.AMBER
                                                                    }
                                                                    className="border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] leading-none text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
                                                                  >
                                                                    Previsão
                                                                    local
                                                                  </AppBadge>
                                                                  <AppBadge
                                                                    tone={
                                                                      MATCH_NAIPE_BADGE_TONES[
                                                                        estimatedEntry
                                                                          .naipe
                                                                      ]
                                                                    }
                                                                    className="px-1.5 py-0.5 text-[10px] leading-none"
                                                                  >
                                                                    {
                                                                      MATCH_NAIPE_LABELS[
                                                                        estimatedEntry
                                                                          .naipe
                                                                      ]
                                                                    }
                                                                  </AppBadge>
                                                                  <span className="rounded-full border border-border/40 bg-background/60 px-1.5 py-0.5 text-foreground/90 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                                                                    {
                                                                      estimatedEntry.phase_label
                                                                    }
                                                                  </span>
                                                                  {estimatedEntry.division ? (
                                                                    <AppBadge
                                                                      tone={
                                                                        TEAM_DIVISION_BADGE_TONES[
                                                                          estimatedEntry
                                                                            .division
                                                                        ]
                                                                      }
                                                                      className="px-1.5 py-0.5 text-[10px] leading-none"
                                                                    >
                                                                      {
                                                                        TEAM_DIVISION_LABELS[
                                                                          estimatedEntry
                                                                            .division
                                                                        ]
                                                                      }
                                                                    </AppBadge>
                                                                  ) : null}
                                                                </div>

                                                                <p className="mt-1 truncate text-sm font-semibold leading-tight">
                                                                  {
                                                                    estimatedEntry.sport_name
                                                                  }
                                                                </p>
                                                              </div>

                                                              <div className="shrink-0 text-right">
                                                                <p className="text-sm font-semibold tabular-nums leading-tight">
                                                                  {
                                                                    estimatedEntry.start_time
                                                                  }{" "}
                                                                  -{" "}
                                                                  {
                                                                    estimatedEntry.end_time
                                                                  }
                                                                </p>
                                                                <p className="text-[10px] text-muted-foreground">
                                                                  {
                                                                    estimatedEntry.duration_minutes
                                                                  }{" "}
                                                                  min
                                                                </p>
                                                              </div>
                                                            </div>

                                                          </div>
                                                        );
                                                      }

                                                      const entry =
                                                        displayEntry.entry;
                                                      const isScheduleMarker =
                                                        entry.type ==
                                                          "FREE_WINDOW" ||
                                                        entry.type == "BREAK" ||
                                                        entry.type ==
                                                          "RESOURCE_LOCK";
                                                      const detailParts = [
                                                        entry.sport_name,
                                                        entry.naipe
                                                          ? MATCH_NAIPE_LABELS[
                                                              entry.naipe
                                                            ]
                                                          : null,
                                                        entry.division
                                                          ? TEAM_DIVISION_LABELS[
                                                              entry.division
                                                            ]
                                                          : null,
                                                        entry.division_scope ==
                                                        "ALL"
                                                          ? "Todas as divisões"
                                                          : entry.division_scope
                                                            ? TEAM_DIVISION_LABELS[
                                                                entry
                                                                  .division_scope
                                                              ]
                                                            : null,
                                                      ].filter(Boolean);

                                                      return (
                                                        <div
                                                          key={displayEntry.key}
                                                          className={cn(
                                                            "structural-review-timeline-entry rounded-lg border px-3 py-3",
                                                            resolveStructuralReviewEntryToneClassName(
                                                              entry,
                                                            ),
                                                          )}
                                                        >
                                                          {isScheduleMarker ? (
                                                            <div className="flex items-center justify-between gap-3">
                                                              <p className="text-sm font-semibold">
                                                                {resolveStructuralReviewEntryTypeLabel(
                                                                  entry,
                                                                )}
                                                              </p>
                                                              <div className="text-right">
                                                                <p className="text-sm font-semibold">
                                                                  {
                                                                    entry.start_time
                                                                  }{" "}
                                                                  -{" "}
                                                                  {
                                                                    entry.end_time
                                                                  }
                                                                </p>
                                                                <p className="text-[11px] text-muted-foreground">
                                                                  {
                                                                    entry.duration_minutes
                                                                  }{" "}
                                                                  min
                                                                </p>
                                                              </div>
                                                            </div>
                                                          ) : (
                                                            <div className="flex items-start justify-between gap-3">
                                                              <div>
                                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                                  {resolveStructuralReviewEntryTypeLabel(
                                                                    entry,
                                                                  )}
                                                                </p>
                                                                <p className="mt-1 text-sm font-semibold">
                                                                  {entry.type ==
                                                                  "FREE_WINDOW"
                                                                    ? "Janela disponível"
                                                                    : (entry.sport_name ??
                                                                      resolveStructuralReviewEntryTypeLabel(
                                                                        entry,
                                                                      ))}
                                                                </p>
                                                              </div>

                                                              <div className="text-right">
                                                                <p className="text-sm font-semibold">
                                                                  {
                                                                    entry.start_time
                                                                  }{" "}
                                                                  -{" "}
                                                                  {
                                                                    entry.end_time
                                                                  }
                                                                </p>
                                                                <p className="text-[11px] text-muted-foreground">
                                                                  {
                                                                    entry.duration_minutes
                                                                  }{" "}
                                                                  min
                                                                </p>
                                                              </div>
                                                            </div>
                                                          )}

                                                          {detailParts.length >
                                                          0 ? (
                                                            <p className="mt-2 text-xs text-muted-foreground">
                                                              {detailParts.join(
                                                                " • ",
                                                              )}
                                                            </p>
                                                          ) : null}
                                                        </div>
                                                      );
                                                    },
                                                  )}
                                                </div>
                                              )}
                                            </div>

                                            {court.unallocated_match_count >
                                            0 ? (
                                              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3">
                                                <p className="text-sm font-semibold text-destructive">
                                                  {
                                                    court.unallocated_match_count
                                                  }{" "}
                                                  jogo(s) ainda ficaram sem
                                                  encaixe nesta previsão
                                                </p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                  {court.overflow_minutes > 0
                                                    ? "A agenda real desta quadra não comporta toda a quantidade planejada com os blocos fixos atuais."
                                                    : "Os minutos totais até cabem, mas a quadra não possui uma janela contínua compatível para encaixar todo o restante na ordem prevista."}
                                                </p>
                                                {court.pending_match_entries
                                                  .length > 0 ? (
                                                  <div className="mt-2 space-y-1">
                                                    {court.pending_match_entries.map(
                                                      (pendingEntry) => (
                                                        <p
                                                          key={`pending-entry-${reviewDay.date}-${court.court_key}-${pendingEntry.match_number}-${pendingEntry.sport_id}-${pendingEntry.naipe}-${pendingEntry.phase_label}`}
                                                          className="text-[11px] text-destructive"
                                                        >
                                                          Jogo{" "}
                                                          {
                                                            pendingEntry.match_number
                                                          }
                                                          :{" "}
                                                          {
                                                            pendingEntry.sport_name
                                                          }{" "}
                                                          •{" "}
                                                          {
                                                            MATCH_NAIPE_LABELS[
                                                              pendingEntry.naipe
                                                            ]
                                                          }{" "}
                                                          •{" "}
                                                          {
                                                            pendingEntry.phase_label
                                                          }
                                                          {pendingEntry.division
                                                            ? ` • ${
                                                                TEAM_DIVISION_LABELS[
                                                                  pendingEntry
                                                                    .division
                                                                ]
                                                              }`
                                                            : ""}
                                                          {" • "}
                                                          {resolveBrazilianDateString(
                                                            reviewDay.date,
                                                          )}
                                                        </p>
                                                      ),
                                                    )}
                                                  </div>
                                                ) : null}
                                              </div>
                                            ) : null}

                                            <div>
                                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                Resumo por modalidade nesta
                                                quadra
                                              </p>

                                              {court.planning_items.length ==
                                              0 ? (
                                                <div className="rounded-lg border border-dashed border-border/40 px-3 py-3 text-sm text-muted-foreground">
                                                  Nenhuma modalidade foi
                                                  planejada para esta quadra
                                                  neste dia.
                                                </div>
                                              ) : (
                                                <div className="space-y-2">
                                                  {court.planning_items.map(
                                                    (planningItem) => (
                                                      <div
                                                        key={`structural-review-day-${reviewDay.date}-court-${court.court_key}-target-summary-${planningItem.sport_id}`}
                                                        className="rounded-lg border border-border/40 bg-background/50 px-3 py-3"
                                                      >
                                                        <div className="flex items-start justify-between gap-3">
                                                          <div>
                                                            <p className="text-sm font-semibold">
                                                              {
                                                                planningItem.sport_name
                                                              }
                                                            </p>
                                                            <p className="mt-1 text-xs text-muted-foreground">
                                                              {
                                                                planningItem.planned_match_count
                                                              }{" "}
                                                              jogo(s) •{" "}
                                                              {
                                                                planningItem.match_duration_minutes
                                                              }{" "}
                                                              min por jogo
                                                            </p>
                                                          </div>

                                                          <div className="text-right">
                                                            <p className="text-sm font-semibold">
                                                              {
                                                                planningItem.planned_minutes
                                                              }{" "}
                                                              min
                                                            </p>
                                                            <p
                                                              className={cn(
                                                                "text-[11px]",
                                                                planningItem.status ==
                                                                  "OVERFLOW"
                                                                  ? "text-destructive"
                                                                  : "text-emerald-800 dark:text-emerald-400",
                                                              )}
                                                            >
                                                              {planningItem.status ==
                                                              "OVERFLOW"
                                                                ? "Falta espaço na agenda"
                                                                : "Cabe na agenda"}
                                                            </p>
                                                          </div>
                                                        </div>

                                                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                                          <span className="min-w-0 break-words">
                                                            {
                                                              planningItem.free_minutes
                                                            }{" "}
                                                            min disponíveis
                                                          </span>
                                                          <span className="min-w-0 break-words">
                                                            {
                                                              planningItem.remaining_minutes
                                                            }{" "}
                                                            min ainda sobram
                                                          </span>
                                                          <span className="min-w-0 break-words">
                                                            Ainda cabem aprox.{" "}
                                                            {
                                                              planningItem.additional_match_capacity
                                                            }{" "}
                                                            jogo(s)
                                                          </span>
                                                          <span className="min-w-0 break-words basis-full">
                                                            {planningItem.has_playable_window
                                                              ? "Data compatível com a modalidade"
                                                              : "Data incompatível com a modalidade"}
                                                          </span>
                                                        </div>
                                                      </div>
                                                    ),
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                                </div>
                              ) : null}
                            </section>
                          );
                        })}
                      </div>

                      <div className="space-y-4 border-t border-border/40 pt-6">
                        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
                          <div>
                            <p className="text-sm font-semibold">
                              {hasBlockingExactPreviewDiagnostics
                                ? "Prévia exata com pendências impeditivas"
                                : isExactPreviewJobRunning
                                  ? "Prévia exata em processamento"
                                  : exactPreviewCache?.status == "FAILED"
                                    ? "Falha ao calcular a prévia exata"
                                    : exactPreviewCache?.status == "CANCELLED"
                                      ? "Cálculo da prévia cancelado"
                                : hasValidExactPreviewCache
                                  ? "Prévia exata validada"
                                  : exactPreviewCache
                                    ? "Última simulação exata desatualizada"
                                    : "Prévia exata manual"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {hasBlockingExactPreviewDiagnostics
                                ? "A prévia encontrou conflitos impeditivos. Corrija-os e recalcule antes de criar o campeonato."
                                : isExactPreviewJobRunning
                                  ? `${exactPreviewCache?.result?.message ?? "O cálculo continua mesmo se esta aba for fechada."}`
                                  : exactPreviewCache?.status == "FAILED"
                                    ? exactPreviewCache.result?.message ??
                                      "O worker preservou o diagnóstico para uma nova tentativa."
                                    : exactPreviewCache?.status == "CANCELLED"
                                      ? "Inicie um novo cálculo quando desejar."
                                      : hasValidExactPreviewCache
                                        ? exactPreviewGeneratedAtLabel
                                          ? operationalPreview
                                            ? `Prévia válida gerada em ${exactPreviewGeneratedAtLabel}. A criação confirmará a mesma programação em transação.`
                                            : `Prévia válida gerada em ${exactPreviewGeneratedAtLabel}. Calcule novamente para exibir a cronologia.`
                                          : "A criação confirmará esta programação em transação."
                                        : exactPreviewCache
                                          ? "O payload mudou após a última simulação. Recalcule antes de confiar nesta seção."
                                          : "Calcule a programação exata para liberar a criação do campeonato."}
                            </p>
                          </div>

                          {operationalPreview?.summary ? (
                            <div className="text-right text-[11px] text-muted-foreground">
                              <p>
                                Numeração{" "}
                                {operationalPreview.match_numbering_mode ==
                                "SPORT_NAIPE"
                                  ? "por modalidade + naipe"
                                  : operationalPreview.match_numbering_mode ==
                                      "SPORT"
                                    ? "por modalidade"
                                    : "por quadra"}
                              </p>
                              <p>Fonte: job durável do backend</p>
                            </div>
                          ) : null}
                        </div>

                        {operationalPreviewError ? (
                          <Alert>
                            <AlertTitle>
                              Não foi possível calcular a prévia exata
                            </AlertTitle>
                            <AlertDescription>
                              {operationalPreviewError}
                            </AlertDescription>
                          </Alert>
                        ) : null}

                        {operationalPreview?.diagnostics.length ? (
                          <Alert>
                            <AlertTitle>
                              Pendências encontradas na programação
                            </AlertTitle>

                            <AlertDescription className="space-y-3">
                              <p>
                                {operationalPreview.diagnostics.length}{" "}
                                jogo(s) ou pendência(s) precisam ser revisados.
                              </p>

                              <div className="space-y-2">
                                {operationalPreview.diagnostics.map(
                                  (diagnostic, diagnosticIndex) => {
                                    const hasMatchTeams =
                                      diagnostic.home_team_name &&
                                      diagnostic.away_team_name;

                                    return (
                                      <div
                                        key={[
                                          diagnostic.code,
                                          diagnostic.match_id ??
                                            diagnostic.sport_id ??
                                            "sem-modalidade",
                                          diagnosticIndex,
                                        ].join("::")}
                                        className="rounded-lg border border-border/50 bg-background/60 px-3 py-2"
                                      >
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                          <span className="text-sm font-semibold">
                                            {hasMatchTeams
                                              ? `${diagnostic.home_team_name} × ${diagnostic.away_team_name}`
                                              : (diagnostic.sport_name ??
                                                "Programação")}
                                          </span>

                                          {hasMatchTeams &&
                                          diagnostic.sport_name ? (
                                            <span className="text-xs text-muted-foreground">
                                              • {diagnostic.sport_name}
                                            </span>
                                          ) : null}

                                          {diagnostic.naipe ? (
                                            <span className="text-xs text-muted-foreground">
                                              • {MATCH_NAIPE_LABELS[diagnostic.naipe]}
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

                                          {diagnostic.group_number != null ? (
                                            <span className="text-xs text-muted-foreground">
                                              •{" "}
                                              {resolveChampionshipGroupLabel(
                                                diagnostic.group_number,
                                              )}
                                            </span>
                                          ) : null}

                                          {diagnostic.round_number != null ? (
                                            <span className="text-xs text-muted-foreground">
                                              • Rodada {diagnostic.round_number}
                                            </span>
                                          ) : null}

                                          {diagnostic.phase &&
                                          diagnostic.phase != "GROUP_STAGE" ? (
                                            <span className="text-xs text-muted-foreground">
                                              •{" "}
                                              {resolveOperationalPreviewPhaseLabel(
                                                diagnostic.phase,
                                                null,
                                              )}
                                            </span>
                                          ) : null}
                                        </div>

                                        <p className="mt-1 text-xs text-muted-foreground">
                                          {diagnostic.message}
                                        </p>
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                            </AlertDescription>
                          </Alert>
                        ) : null}

                        {operationalPreview?.summary ? (
                          <div className="space-y-6">
                            {!hasValidExactPreviewCache ? (
                              <Alert>
                                <AlertTitle>
                                  Prévia exata desatualizada
                                </AlertTitle>
                                <AlertDescription>
                                  Os dados abaixo pertencem à última simulação
                                  salva e não refletem mais o payload atual do
                                  wizard.
                                </AlertDescription>
                              </Alert>
                            ) : null}

                            {operationalPreview.message ? (
                              <Alert>
                                <AlertTitle>Resumo da prévia</AlertTitle>
                                <AlertDescription>
                                  {operationalPreview.message}
                                </AlertDescription>
                              </Alert>
                            ) : null}

                            <div className="space-y-6">
                              {operationalPreview.days.map((previewDay) => {
                                const isPreviewDayExpanded =
                                  expandedOperationalPreviewDates.has(
                                    previewDay.date,
                                  );
                                const previewDayContentId = `operational-preview-day-content-${previewDay.date}`;
                                const dayCourtCount =
                                  previewDay.locations.reduce(
                                    (totalCourts, location) =>
                                      totalCourts + location.courts.length,
                                    0,
                                  );

                                return (
                                  <section
                                    key={`preview-day-${previewDay.date}`}
                                    className="rounded-xl border border-border/40 bg-background/30 p-5 shadow-sm"
                                  >
                                    <button
                                      type="button"
                                      className={cn(
                                        "flex w-full items-center justify-between gap-4 text-left transition-colors hover:text-foreground",
                                        isPreviewDayExpanded &&
                                          "border-b border-border/40 pb-4",
                                      )}
                                      aria-expanded={isPreviewDayExpanded}
                                      aria-controls={previewDayContentId}
                                      aria-label={`${
                                        isPreviewDayExpanded
                                          ? "Recolher"
                                          : "Expandir"
                                      } programação de ${resolveBrazilianDateString(
                                        previewDay.date,
                                      )}`}
                                      onClick={() =>
                                        void toggleOperationalPreviewDay(
                                          previewDay.date,
                                        )
                                      }
                                    >
                                      <div>
                                        <p className="text-base font-bold">
                                          {resolveBrazilianDateString(
                                            previewDay.date,
                                          )}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {previewDay.start_time} até{" "}
                                          {previewDay.end_time}
                                        </p>
                                      </div>

                                      <div className="flex items-center gap-3 text-right text-xs text-muted-foreground">
                                        <div>
                                          <p>
                                            {previewDay.locations.length}{" "}
                                            local(is)
                                          </p>
                                          <p>{dayCourtCount} quadra(s)</p>
                                        </div>
                                        {isPreviewDayExpanded ? (
                                          <ChevronUp className="h-4 w-4" />
                                        ) : (
                                          <ChevronDown className="h-4 w-4" />
                                        )}
                                      </div>
                                    </button>

                                    {isPreviewDayExpanded ? (
                                      <div
                                        id={previewDayContentId}
                                        className="mt-5 space-y-5"
                                      >
                                    {loadingOperationalPreviewDate ==
                                    previewDay.date ? (
                                      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Carregando programação deste dia...
                                      </div>
                                    ) : (
                                      <>

                                    {previewDay.breaks.length > 0 ? (
                                      <div className="flex flex-wrap gap-2">
                                        {previewDay.breaks.map(
                                          (previewBreak, breakIndex) => (
                                            <AppBadge
                                              key={`preview-day-${previewDay.date}-break-${breakIndex}`}
                                              tone={AppBadgeTone.SKY}
                                              className="px-2 py-1 text-[10px] leading-none"
                                            >
                                              Intervalo{" "}
                                              {previewBreak.start_time} até{" "}
                                              {previewBreak.end_time}
                                            </AppBadge>
                                          ),
                                        )}
                                      </div>
                                    ) : null}

                                    <div className="space-y-5">
                                      {previewDay.locations.map((location) => (
                                        <div
                                          key={`preview-day-${previewDay.date}-location-${location.location_key}`}
                                          className="space-y-3"
                                        >
                                          <div className="flex items-center justify-between">
                                            <p className="text-sm font-semibold">
                                              {location.location_name}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground">
                                              {location.courts.length} quadra(s)
                                            </p>
                                          </div>

                                          <div
                                            className="grid gap-4"
                                            style={{
                                              gridTemplateColumns: `repeat(${Math.max(
                                                location.courts.length,
                                                1,
                                              )}, minmax(0, 1fr))`,
                                            }}
                                          >
                                              {location.courts.map((court) => (
                                                <div
                                                  key={`preview-day-${previewDay.date}-court-${court.court_key}`}
                                                  className="min-w-0 overflow-hidden rounded-xl border border-border/40 bg-background/40 p-4"
                                                >
                                                  <div className="flex items-start justify-between gap-3 border-b border-border/30 pb-3">
                                                    <div>
                                                      <p className="text-sm font-bold">
                                                        {court.court_name}
                                                      </p>
                                                      <p className="text-[11px] text-muted-foreground">
                                                        {
                                                          court.entries.filter(
                                                            (entry) =>
                                                              entry.type ==
                                                              "MATCH",
                                                          ).length
                                                        }
                                                        {" "}
                                                        jogo(s) programados
                                                      </p>
                                                    </div>

                                                    <div className="text-right text-[11px] text-muted-foreground">
                                                      <p>
                                                        {court.available_minutes}{" "}
                                                        min disponíveis
                                                      </p>
                                                      <p>
                                                        {court.occupied_minutes}{" "}
                                                        min reservados para jogos
                                                      </p>
                                                      <p>
                                                        {Math.max(
                                                          0,
                                                          court.available_minutes -
                                                            court.occupied_minutes,
                                                        )}{" "}
                                                        min livres ainda
                                                      </p>
                                                    </div>
                                                  </div>

                                                  <div className="mt-4 space-y-3">
                                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                      Sequência cronológica da
                                                      quadra
                                                    </p>

                                                    <div className="space-y-2">
                                                    {court.entries.map(
                                                      (entry, entryIndex) => {
                                                        const matchDetailParts =
                                                          [
                                                            entry.sport_name,
                                                            entry.naipe
                                                              ? MATCH_NAIPE_LABELS[
                                                                  entry.naipe
                                                                ]
                                                              : null,
                                                            entry.division
                                                              ? TEAM_DIVISION_LABELS[
                                                                  entry.division
                                                                ]
                                                              : null,
                                                            resolveOperationalPreviewPhaseLabel(
                                                              entry.phase,
                                                              entry.phase_label,
                                                            ),
                                                            entry.group_number !=
                                                              null &&
                                                            entry.phase ==
                                                              "GROUP_STAGE"
                                                              ? resolveChampionshipGroupLabel(
                                                                  entry.group_number,
                                                                )
                                                              : null,
                                                          ].filter(Boolean);

                                                        if (
                                                          entry.type == "MATCH"
                                                        ) {
                                                          const phaseLabel =
                                                            resolveOperationalPreviewPhaseLabel(
                                                              entry.phase,
                                                              entry.phase_label,
                                                            );

                                                          return (
                                                            <div
                                                              key={`preview-day-${previewDay.date}-court-${court.court_key}-entry-${entryIndex}`}
                                                              className={cn(
                                                                "structural-review-timeline-entry rounded-md border px-2.5 py-2",
                                                                resolveOperationalPreviewEntryToneClassName(
                                                                  entry,
                                                                ),
                                                              )}
                                                            >
                                                              <div className="flex items-start justify-between gap-2">
                                                                <div className="min-w-0 flex-1">
                                                                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
                                                                    <AppBadge
                                                                      tone={
                                                                        AppBadgeTone.SILVER
                                                                      }
                                                                      className="border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] leading-none text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                                                    >
                                                                      Jogo{" "}
                                                                      {entry.match_number ??
                                                                        "—"}
                                                                    </AppBadge>
                                                                    <AppBadge
                                                                      tone={
                                                                        AppBadgeTone.AMBER
                                                                      }
                                                                      className="border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] leading-none text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
                                                                    >
                                                                      Programação
                                                                      exata
                                                                    </AppBadge>
                                                                    {entry.naipe ? (
                                                                      <AppBadge
                                                                        tone={
                                                                          MATCH_NAIPE_BADGE_TONES[
                                                                            entry
                                                                              .naipe
                                                                          ]
                                                                        }
                                                                        className="px-1.5 py-0.5 text-[10px] leading-none"
                                                                      >
                                                                        {
                                                                          MATCH_NAIPE_LABELS[
                                                                            entry
                                                                              .naipe
                                                                          ]
                                                                        }
                                                                      </AppBadge>
                                                                    ) : null}
                                                                    {phaseLabel ? (
                                                                      <span className="rounded-full border border-border/40 bg-background/60 px-1.5 py-0.5 text-foreground/90 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                                                                        {
                                                                          phaseLabel
                                                                        }
                                                                      </span>
                                                                    ) : null}
                                                                    {entry.group_number !=
                                                                      null &&
                                                                    entry.phase ==
                                                                      "GROUP_STAGE" ? (
                                                                      <span className="rounded-full border border-border/40 bg-background/60 px-1.5 py-0.5 text-foreground/90 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                                                                        {resolveChampionshipGroupLabel(
                                                                          entry.group_number,
                                                                        )}
                                                                      </span>
                                                                    ) : null}
                                                                    {entry.division ? (
                                                                      <AppBadge
                                                                        tone={
                                                                          TEAM_DIVISION_BADGE_TONES[
                                                                            entry
                                                                              .division
                                                                          ]
                                                                        }
                                                                        className="px-1.5 py-0.5 text-[10px] leading-none"
                                                                      >
                                                                        {
                                                                          TEAM_DIVISION_LABELS[
                                                                            entry
                                                                              .division
                                                                          ]
                                                                        }
                                                                      </AppBadge>
                                                                    ) : null}
                                                                  </div>

                                                                  <p className="mt-1 truncate text-sm font-semibold leading-tight">
                                                                    {entry.sport_name ??
                                                                      "Jogo"}
                                                                  </p>

                                                                  {entry.projected ? (
                                                                    <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
                                                                      Horário
                                                                      previsto do
                                                                      mata-mata
                                                                      automático.
                                                                    </p>
                                                                  ) : null}

                                                                  {entry.manual_final ? (
                                                                    <p className="mt-1 text-[10px] text-primary/90">
                                                                      Programação
                                                                      manual de
                                                                      final.
                                                                    </p>
                                                                  ) : null}

                                                                  {entry.reason ? (
                                                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                                                      {
                                                                        entry.reason
                                                                      }
                                                                    </p>
                                                                  ) : null}
                                                                </div>

                                                                <div className="shrink-0 text-right">
                                                                  <p className="text-sm font-semibold tabular-nums leading-tight">
                                                                    {
                                                                      entry.start_time
                                                                    }{" "}
                                                                    -{" "}
                                                                    {entry.end_time}
                                                                  </p>
                                                                  <p className="text-[10px] text-muted-foreground">
                                                                    {
                                                                      entry.duration_minutes
                                                                    }{" "}
                                                                    min
                                                                  </p>
                                                                </div>
                                                              </div>
                                                            </div>
                                                          );
                                                        }

                                                        return (
                                                          <div
                                                            key={`preview-day-${previewDay.date}-court-${court.court_key}-entry-${entryIndex}`}
                                                            className={cn(
                                                              "rounded-lg border px-3 py-3",
                                                              resolveOperationalPreviewEntryToneClassName(
                                                                entry,
                                                              ),
                                                            )}
                                                          >
                                                            <div className="flex items-start justify-between gap-3">
                                                              <div>
                                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                                  {resolveOperationalPreviewEntryTypeLabel(
                                                                    entry,
                                                                  )}
                                                                </p>
                                                                <p className="mt-1 text-sm font-semibold">
                                                                  {entry.type ==
                                                                  "EMPTY"
                                                                      ? "Janela livre"
                                                                      : entry.type ==
                                                                          "BREAK"
                                                                        ? "Intervalo"
                                                                        : entry.type ==
                                                                            "RESERVATION"
                                                                          ? (entry.reason ??
                                                                            "Reserva")
                                                                          : (entry.sport_name ??
                                                                            "Sessão individual")}
                                                                </p>
                                                              </div>

                                                              <div className="text-right">
                                                                <p className="text-sm font-semibold">
                                                                  {
                                                                    entry.start_time
                                                                  }{" "}
                                                                  -{" "}
                                                                  {
                                                                    entry.end_time
                                                                  }
                                                                </p>
                                                                <p className="text-[11px] text-muted-foreground">
                                                                  {
                                                                    entry.duration_minutes
                                                                  }{" "}
                                                                  min
                                                                </p>
                                                              </div>
                                                            </div>

                                                            {matchDetailParts.length >
                                                            0 ? (
                                                              <p className="mt-2 text-xs text-muted-foreground">
                                                                {matchDetailParts.join(
                                                                  " • ",
                                                                )}
                                                              </p>
                                                            ) : null}

                                                            {entry.reason &&
                                                            entry.type !=
                                                              "RESERVATION" ? (
                                                              <p className="mt-2 text-[11px] text-muted-foreground">
                                                                {entry.reason}
                                                              </p>
                                                            ) : null}
                                                          </div>
                                                        );
                                                      },
                                                    )}
                                                    </div>
                                                  </div>
                                                </div>
                                              ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                      </>
                                    )}
                                      </div>
                                    ) : null}
                                  </section>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
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
