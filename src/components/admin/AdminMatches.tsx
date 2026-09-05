import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MatchListSkeleton } from "@/components/skeletons/MatchListSkeleton";
import {
  type ScheduledKnockoutPlaceholder,
  resolvePublicScheduleTimeLabel,
} from "@/domain/public-schedule/publicScheduleTimeline";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  Award,
  Check,
  Clock,
  CircleHelp,
  EyeOff,
  Loader2,
  Medal,
  Minus,
  MoreVertical,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Square,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { shouldRenderIndividualSessions } from "@/components/admin/adminMatchesPagination.utils";
import {
  fetchChampionshipBracketLocationTemplates,
  fetchChampionshipBracketPendingTieBreaks,
  generateChampionshipKnockout,
  applyChampionshipBracketReconfiguration,
  getBracketCourtSports,
  getBracketDaySchedules,
  listEditableMatchScheduleSlots,
  saveMatchSets,
  saveChampionshipBracketTieBreakResolution,
  swapChampionshipKnockoutBracketTeams,
  updateScheduledMatchLogistics,
  updateBracketDaySchedule,
  previewChampionshipBracketReconfiguration,
  applyManualMatchRelocation,
  applyManualMatchRelocationSlot,
  applyDayScheduleReorganization,
  applyOperationalKnockoutScheduleAdjustment,
  holdMatchesForManualRelocation,
  listOperationalKnockoutScheduleAdjustmentCandidates,
  previewDayScheduleReorganization,
  previewOperationalKnockoutScheduleAdjustment,
  previewManualMatchRelocation,
  previewManualMatchRelocationSlot,
} from "@/domain/championship-brackets/championshipBracket.repository";
import type {
  BracketDayCourtSports,
  BracketDaySchedule,
  ChampionshipCorrectedGroupStanding,
  ChampionshipBracketLocationTemplate,
  ChampionshipBracketScheduleDayInput,
  ChampionshipBracketTieBreakPendingContext,
  EditableMatchScheduleSlot,
  ManualMatchRelocationInput,
  ManualMatchRelocationPosition,
  ManualMatchRelocationPreview,
  ManualMatchRelocationReason,
  ManualMatchRelocationSlotPreview,
  DayScheduleReorganizationBreakPolicy,
  DayScheduleReorganizationInput,
  DayScheduleReorganizationPreview,
  MatchSetInput,
  OperationalKnockoutScheduleAdjustmentCandidates,
  OperationalKnockoutScheduleAdjustmentInput,
  OperationalKnockoutScheduleAdjustmentPreview,
} from "@/domain/championship-brackets/championshipBracket.types";
import {
  resolveChampionshipBracketFirstRoundSeedIndexes,
  resolveChampionshipBracketKnockoutProjection,
  resolveChampionshipBracketSeedPlaceholderLabels,
} from "@/domain/championship-brackets/championshipBracketKnockoutProjection";
import { resolveKnockoutDisplayMatchNumberById } from "@/domain/championship-brackets/championshipBracketDisplayMatchNumbers";
import type {
  Championship,
  ChampionshipBracketCompetition,
  ChampionshipBracketView,
  ChampionshipIndividualSession,
  ChampionshipSport,
  Match,
  Sport,
  Team,
} from "@/lib/types";
import {
  AppBadgeTone,
  BracketPhase,
  ChampionshipCode,
  ChampionshipAwardType,
  ChampionshipIndividualSessionStatus,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
  MatchManualRepresentationMode,
  MatchNaipe,
  MatchStatus,
  TeamDivision,
} from "@/lib/enums";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tabs,
  TabsNavigationList,
  TabsNavigationTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type MatchBracketContext,
  compareAdminMatchCardOrder,
  doesChampionshipSportSupportNaipe,
  CHAMPIONSHIP_SPORT_TIE_BREAKER_RULE_LABELS,
  MATCH_NAIPE_LABELS,
  TEAM_DIVISION_BADGE_TONES,
  TEAM_DIVISION_LABELS,
  isMatchNaipe,
  isTeamDivision,
  resolveBracketGroupFilterOptions,
  resolveChampionshipBracketGroupStageOptions,
  resolveChampionshipGroupLabel,
  resolveDisplayedMatchQueueLabel,
  resolveDisplayedMatchQueuePosition,
  resolveGroupStageMatchBindingByMatchId,
  resolveMatchQueueLabel,
  resolveMatchNaipeBadgeTone,
  resolveMatchNaipeLabel,
  resolveMatchPenaltyShootoutSummary,
  resolveRecordedMatchSets,
  resolveMatchScheduledDateValue,
  resolveMatchSetSummary,
  resolveSaoPauloTimeLabel,
  resolveVisualQueuePositionByMatchId,
  resolveMatchStartedAtLabel,
  resolveMatchDisplayStatusLabel,
  resolveMatchStatusBadgeTone,
  resolveMatchStatusLabel,
  resolveMatchTieBreakRuleLabel,
  resolveKnockoutRoundLabel,
  isSocietyKnockoutMatch,
} from "@/lib/championship";
import { AppBadge } from "@/components/ui/app-badge";
import { scrollToTopOfPage } from "@/lib/scroll";
import {
  AppPaginationControls,
  DEFAULT_PAGINATION_ITEMS_PER_PAGE,
} from "@/components/ui/app-pagination-controls";
import { SportFilter } from "@/components/SportFilter";
import {
  resolveIsTieBreakTeamOrderReady,
  resolveNormalizedTieBreakTeamOrder,
} from "@/components/admin/adminMatchesTieBreak.utils";
import {
  resolveMatchSwapDisplaySlot,
  resolveMatchSwapOptionLabel,
} from "@/components/admin/adminMatchesSwap.utils";
import {
  resolveBracketDayScheduleUpdates,
  resolveMatchScheduleMoveSortValue,
  resolveShouldRedistributeBracketScheduleAfterMatchEdit,
} from "@/components/admin/adminMatchesSchedule.utils";
import { AdminMatchesViewMode } from "@/components/admin/adminMatches.types";
import {
  resolveAdminMatchesKnockoutPlaceholders,
  resolveAdminMatchesScheduleItems,
} from "@/components/admin/adminMatchesScheduleItems.utils";
import { useChampionshipCorrectedGroupStandings } from "@/hooks/useChampionshipCorrectedGroupStandings";
import { useChampionshipIndividualEvents } from "@/hooks/useChampionshipIndividualEvents";
import { useChampionshipSeasonRuntime } from "@/hooks/useChampionshipSeasonRuntime";
import {
  type AwardDrawPendingContext,
  usePendingAwardDraws,
} from "@/hooks/usePendingAwardDraws";
import {
  formatPointsAverageForStandings,
  formatStandingsPoints,
} from "@/lib/standings";
import { resolveSportCode } from "@/lib/modalidadeConfig";
import { INDIVIDUAL_SESSION_STATUS_LABELS } from "@/lib/individualEvents";

type BracketMatchRowLite = {
  id: string;
  slot_number: number | null;
};

interface IndividualSessionEditDraft {
  scheduledDate: string;
  startTime: string;
  endTime: string;
  locationGroupId: string;
  courtGroupId: string;
  exclusiveLockEnabled: boolean;
}

type SupabaseLooseQueryError = {
  message: string;
};

type SupabaseLooseQueryResult<TData> = {
  data: TData | null;
  error: SupabaseLooseQueryError | null;
};

type SupabaseLooseOrderOptions = {
  ascending?: boolean;
};

type SupabaseLooseSelectBuilder<TData> = {
  eq: (column: string, value: string) => SupabaseLooseSelectBuilder<TData>;
  order: (
    column: string,
    options?: SupabaseLooseOrderOptions,
  ) => SupabaseLooseSelectBuilder<TData>;
  limit: (count: number) => Promise<SupabaseLooseQueryResult<TData>>;
};

type SupabaseLooseTableClient = {
  select: (columns: string) => SupabaseLooseSelectBuilder<unknown[]>;
  insert: (
    values: Record<string, unknown>,
  ) => Promise<SupabaseLooseQueryResult<unknown>>;
  update: (values: Record<string, unknown>) => {
    eq: (
      column: string,
      value: string,
    ) => Promise<SupabaseLooseQueryResult<unknown>>;
  };
};

type SupabaseLooseClient = {
  from: (table: string) => SupabaseLooseTableClient;
  rpc: (
    functionName: string,
    payload?: Record<string, unknown>,
  ) => Promise<SupabaseLooseQueryResult<unknown>>;
};

const supabaseLoose = supabase as unknown as SupabaseLooseClient;

interface ScoreSheetAwardPlayerOption {
  id: string;
  name: string;
}

interface ScoreSheetAwardSelectionOption {
  player_id?: string;
  player_name?: string;
}

interface MatchScoreSheetAwardsContext {
  match_id: string;
  home_team_id: string;
  away_team_id: string;
  requires_goal_scorers: boolean;
  required_home_goals: number;
  required_away_goals: number;
  required_home_yellow_cards: number;
  required_away_yellow_cards: number;
  required_home_red_cards: number;
  required_away_red_cards: number;
  required_home_blue_cards: number;
  required_away_blue_cards: number;
  supports_cards: boolean;
  is_walkover: boolean;
  home_players: ScoreSheetAwardPlayerOption[];
  away_players: ScoreSheetAwardPlayerOption[];
  home_goals: Array<{
    player_id: string | null;
    player_name: string | null;
  }>;
  away_goals: Array<{
    player_id: string | null;
    player_name: string | null;
  }>;
  home_yellow_cards: Array<{
    player_id: string | null;
    player_name: string | null;
  }>;
  away_yellow_cards: Array<{
    player_id: string | null;
    player_name: string | null;
  }>;
  home_red_cards: Array<{
    player_id: string | null;
    player_name: string | null;
  }>;
  away_red_cards: Array<{
    player_id: string | null;
    player_name: string | null;
  }>;
  home_blue_cards: Array<{
    player_id: string | null;
    player_name: string | null;
  }>;
  away_blue_cards: Array<{
    player_id: string | null;
    player_name: string | null;
  }>;
}

interface GoalSelection {
  scorerId: string;
}

interface ScoreSheetDisciplineSelectionFieldsProps {
  ariaLabelPrefix: string;
  emptyMessage: string;
  eventLabel: string;
  noEventMessage: string;
  playerOptions: ScoreSheetAwardPlayerOption[];
  selections: GoalSelection[];
  title: string;
  onSelectionChange: (selectionIndex: number, value: string) => void;
}

function ScoreSheetDisciplineSelectionFields({
  ariaLabelPrefix,
  emptyMessage,
  eventLabel,
  noEventMessage,
  playerOptions,
  selections,
  title,
  onSelectionChange,
}: ScoreSheetDisciplineSelectionFieldsProps) {
  return (
    <div className="mt-4 space-y-2 border-t border-border/50 pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <p className="text-xs text-muted-foreground">
        O vínculo com o atleta é obrigatório.
      </p>
      {selections.length > 0 ? (
        playerOptions.length > 0 ? (
          <div className="space-y-2">
            {selections.map((selection, selectionIndex) => (
              <div
                key={`${ariaLabelPrefix}-${selectionIndex + 1}`}
                className="space-y-1"
              >
                <Label className="text-xs text-muted-foreground">
                  {selectionIndex + 1}º {eventLabel}
                </Label>
                <Select
                  value={
                    selection.scorerId || EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE
                  }
                  onValueChange={(value) =>
                    onSelectionChange(
                      selectionIndex,
                      value == EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE ? "" : value,
                    )
                  }
                >
                  <SelectTrigger
                    className="app-input-field"
                    aria-label={`${ariaLabelPrefix} ${selectionIndex + 1}`}
                  >
                    <SelectValue placeholder="Selecione o atleta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE}>
                      Selecione o atleta
                    </SelectItem>
                    {playerOptions.map((playerOption) => (
                      <SelectItem key={playerOption.id} value={playerOption.id}>
                        {playerOption.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-destructive/30 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
            Cadastre um atleta abaixo para vincular {emptyMessage} desta
            atlética.
          </div>
        )
      ) : (
        <p className="text-sm text-muted-foreground">{noEventMessage}</p>
      )}
    </div>
  );
}

interface MatchScoreSheetAwardsDraft {
  homePlayerOptions: ScoreSheetAwardPlayerOption[];
  awayPlayerOptions: ScoreSheetAwardPlayerOption[];
  homeGoalSelections: GoalSelection[];
  awayGoalSelections: GoalSelection[];
  homeYellowCardSelections: GoalSelection[];
  awayYellowCardSelections: GoalSelection[];
  homeRedCardSelections: GoalSelection[];
  awayRedCardSelections: GoalSelection[];
  homeBlueCardSelections: GoalSelection[];
  awayBlueCardSelections: GoalSelection[];
  newHomePlayerName: string;
  newAwayPlayerName: string;
  requiredHomeGoals: number;
  requiredAwayGoals: number;
  requiredHomeYellowCards: number;
  requiredAwayYellowCards: number;
  requiredHomeRedCards: number;
  requiredAwayRedCards: number;
  requiredHomeBlueCards: number;
  requiredAwayBlueCards: number;
  requiresGoalScorers: boolean;
  supportsCards: boolean;
  isWalkover: boolean;
}

const NEW_PLAYER_OPTION_PREFIX = "__NEW_PLAYER__:";

interface KnockoutMatchBinding {
  competition: ChampionshipBracketCompetition;
  round_number: number;
  slot_number: number;
  is_third_place: boolean;
}

interface KnockoutMatchSourceLabels {
  home: string;
  away: string;
}

function resolveKnockoutTotalRounds(bracketSize: number): number {
  let totalRounds = 1;

  while (2 ** totalRounds < bracketSize) {
    totalRounds += 1;
  }

  return totalRounds;
}

function resolveWinnerSourceLabel(
  roundNumber: number,
  slotNumber: number,
  totalRounds: number,
): string {
  const shortRoundLabel = resolveKnockoutRoundLabel(
    roundNumber,
    totalRounds,
  ).replace(" de final", "");
  const article =
    shortRoundLabel == "Semifinal" || shortRoundLabel == "Final" ? "da" : "das";

  return `Vencedor ${article} ${shortRoundLabel} ${slotNumber}`;
}

function resolveKnockoutMatchSourceLabels(
  knockoutMatchBinding: KnockoutMatchBinding | null,
): KnockoutMatchSourceLabels | null {
  if (!knockoutMatchBinding) {
    return null;
  }

  if (knockoutMatchBinding.is_third_place) {
    return {
      home: "Perdedor da Semifinal 1",
      away: "Perdedor da Semifinal 2",
    };
  }

  const knockoutProjection = resolveChampionshipBracketKnockoutProjection({
    groups_count: knockoutMatchBinding.competition.groups_count,
    qualifiers_per_group: knockoutMatchBinding.competition.qualifiers_per_group,
    should_complete_knockout_with_best_second_placed_teams:
      knockoutMatchBinding.competition
        .should_complete_knockout_with_best_second_placed_teams,
  });

  if (
    knockoutProjection.projected_bracket_size < 2 ||
    knockoutMatchBinding.slot_number < 1 ||
    knockoutMatchBinding.round_number < 1
  ) {
    return null;
  }

  const totalRounds = resolveKnockoutTotalRounds(
    knockoutProjection.projected_bracket_size,
  );

  if (knockoutMatchBinding.round_number == 1) {
    const seedLabels = resolveChampionshipBracketSeedPlaceholderLabels({
      groups_count: knockoutMatchBinding.competition.groups_count,
      qualifiers_per_group:
        knockoutMatchBinding.competition.qualifiers_per_group,
      should_complete_knockout_with_best_second_placed_teams:
        knockoutMatchBinding.competition
          .should_complete_knockout_with_best_second_placed_teams,
    });
    const firstRoundSeedIndexes =
      resolveChampionshipBracketFirstRoundSeedIndexes(
        knockoutProjection.projected_bracket_size,
        knockoutMatchBinding.slot_number,
      );

    return {
      home: seedLabels[firstRoundSeedIndexes.home_seed_index] ?? "A definir",
      away: seedLabels[firstRoundSeedIndexes.away_seed_index] ?? "A definir",
    };
  }

  return {
    home: resolveWinnerSourceLabel(
      knockoutMatchBinding.round_number - 1,
      knockoutMatchBinding.slot_number * 2 - 1,
      totalRounds,
    ),
    away: resolveWinnerSourceLabel(
      knockoutMatchBinding.round_number - 1,
      knockoutMatchBinding.slot_number * 2,
      totalRounds,
    ),
  };
}

function normalizeBracketEntityName(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

function resolveIndividualSessionStatusBadgeTone(
  status: ChampionshipIndividualSessionStatus,
) {
  switch (status) {
    case ChampionshipIndividualSessionStatus.LIVE:
      return AppBadgeTone.PRIMARY;
    case ChampionshipIndividualSessionStatus.FINISHED:
      return AppBadgeTone.RED;
    case ChampionshipIndividualSessionStatus.SCHEDULED:
      return AppBadgeTone.SILVER;
    default:
      return AppBadgeTone.NEUTRAL;
  }
}

interface Props {
  matches: Match[];
  championshipSports: ChampionshipSport[];
  teams: Team[];
  selectedChampionship: Championship;
  championshipBracketView: ChampionshipBracketView;
  loadingChampionshipBracket: boolean;
  matchBracketContextByMatchId: Record<string, MatchBracketContext>;
  matchRepresentationByMatchId?: Record<string, string>;
  visualQueuePositionByMatchId?: Record<string, number>;
  estimatedStartTimeByMatchId?: Record<string, string>;
  isInitialLoading?: boolean;
  isFetchingMatches?: boolean;
  canManageMatches?: boolean;
  hasMatchesEditPermission?: boolean;
  availableSeasonYears?: number[];
  selectedSeasonYear?: number | null;
  onSeasonYearChange?: (seasonYear: number) => void;
  viewMode?: AdminMatchesViewMode;
  onOpenTieBreaksTab?: () => void;
  onRefetch: (options?: {
    showLoading?: boolean;
    showFetching?: boolean;
  }) => void | Promise<void>;
  onRefetchChampionshipBracket: () => void;
  /** Dados externos de sorteios de premiação (vindos de AdminPage para o badge funcionar antes de entrar na aba). Quando fornecidos, o hook interno é desabilitado. */
  externalPendingAwardDrawContexts?: AwardDrawPendingContext[];
  externalLoadingPendingAwardDraws?: boolean;
  externalRefetchPendingAwardDraws?: () => void | Promise<void>;
}

interface MatchEditDraft {
  sportId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
  homeYellowCards: number;
  homeRedCards: number;
  homeBlueCards: number;
  homeTwoMinutePenalties: number;
  awayYellowCards: number;
  awayRedCards: number;
  awayBlueCards: number;
  awayTwoMinutePenalties: number;
  location: string;
  courtName: string;
  scheduledDate: Date | null;
  startTime: Date | null;
  gameSlot: string;
  isEstimatedStartTimeManuallySelected: boolean;
  manualRepresentationMode: MatchManualRepresentationMode;
  division: TeamDivision | null;
  naipe: MatchNaipe;
  status: MatchStatus;
  selectedGroupOptionValue: string;
  resolvedTieBreakerRule: ChampionshipSportTieBreakerRule | "";
}

type ScoreSheetReviewSaveDecision = "KEEP_REVIEW" | "REMOVE_REVIEW";
type BulkReviewAction = "MARK" | "UNMARK";

const NAIPE_OPTIONS: MatchNaipe[] = [
  MatchNaipe.MASCULINO,
  MatchNaipe.FEMININO,
  MatchNaipe.MISTO,
];
const ALL_MATCHES_SPORT_FILTER = "ALL_MATCHES_SPORTS";
const ALL_MATCHES_STATUS_FILTER = "ALL_MATCHES_STATUS";
const ALL_MATCHES_TEAM_FILTER = "ALL_MATCHES_TEAMS";
const ALL_MATCHES_NAIPE_FILTER = "ALL_MATCHES_NAIPES";
const ALL_MATCHES_DIVISION_FILTER = "ALL_MATCHES_DIVISIONS";
const ALL_MATCHES_GROUP_FILTER = "ALL_MATCHES_GROUPS";
const ALL_MATCHES_LOCATION_FILTER = "ALL_MATCHES_LOCATIONS";
const ALL_MATCHES_COURT_FILTER = "ALL_MATCHES_COURTS";
const ALL_MATCHES_DATE_FILTER = "ALL_MATCHES_DATES";
const MATCHES_STATUS_FILTER_LIVE = "MATCHES_STATUS_FILTER_LIVE";
const MATCHES_STATUS_FILTER_FINISHED = "MATCHES_STATUS_FILTER_FINISHED";
const MATCHES_STATUS_FILTER_OPEN = "MATCHES_STATUS_FILTER_OPEN";
const EMPTY_GROUP_OPTION_VALUE = "EMPTY_GROUP_OPTION_VALUE";
const EMPTY_TIE_BREAKER_RULE_OPTION_VALUE =
  "EMPTY_TIE_BREAKER_RULE_OPTION_VALUE";
const EMPTY_TIE_BREAK_TEAM_OPTION_VALUE = "EMPTY_TIE_BREAK_TEAM_OPTION_VALUE";
const EMPTY_SWAP_MATCH_OPTION_VALUE = "EMPTY_SWAP_MATCH_OPTION_VALUE";
const EMPTY_KNOCKOUT_SWAP_OPTION_VALUE =
  "EMPTY_KNOCKOUT_SWAP_OPTION_VALUE";
const EMPTY_MANUAL_RELOCATION_OPTION_VALUE =
  "EMPTY_MANUAL_RELOCATION_OPTION_VALUE";
const EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE =
  "EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE";
const EMPTY_AWARD_DRAW_PLAYER_OPTION_VALUE =
  "EMPTY_AWARD_DRAW_PLAYER_OPTION_VALUE";

const MANUAL_MATCH_RELOCATION_REASON_LABELS: Record<
  ManualMatchRelocationReason,
  string
> = {
  WEATHER: "Condições climáticas",
  COURT_UNAVAILABLE: "Quadra indisponível",
  OPERATIONAL_DELAY: "Atraso operacional",
  SAFETY: "Segurança",
  OTHER: "Outro motivo",
};

function resolveAwardDrawDisplayText(value: string): string {
  return value
    .split(TeamDivision.DIVISAO_PRINCIPAL)
    .join(TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_PRINCIPAL])
    .split(TeamDivision.DIVISAO_ACESSO)
    .join(TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_ACESSO]);
}

type SwapMatchQueueSlotsResponse = {
  source_match_id: string;
  target_match_id: string;
  source_previous_slot: number;
  target_previous_slot: number;
  source_next_slot: number;
  target_next_slot: number;
};

type ListMatchQueueSwapCandidatesResponseItem = {
  match_id: string;
  scheduled_date: string | null;
  start_time: string | null;
  queue_position: number | null;
  scheduled_slot: number | null;
  created_at: string;
  home_team_name: string | null;
  away_team_name: string | null;
  uses_reduced_cross_sport_rest_gap: boolean;
};

type ListKnockoutScheduleSwapCandidatesResponseItem = {
  bracket_match_id: string;
  match_id: string | null;
  is_placeholder: boolean;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  round_number: number;
  is_third_place: boolean;
  scheduled_date: string | null;
  start_time: string | null;
  queue_position: number | null;
  scheduled_slot: number | null;
  home_team_name: string | null;
  away_team_name: string | null;
};

type SwapKnockoutScheduleSlotsResponse = {
  source_bracket_match_id: string;
  target_bracket_match_id: string;
  source_previous_slot: number;
  target_previous_slot: number;
};

type DayScheduleReorganizationTimelineItem =
  DayScheduleReorganizationPreview["timeline"][number];

type DayScheduleReorganizationTimelineDisplayItem =
  | DayScheduleReorganizationTimelineItem
  | {
      item_type: "BREAK";
      item_id: string;
      match_id: null;
      placeholder_id: null;
      label: "Intervalo";
      status: "SCHEDULED";
      start_time: string;
      end_time: string;
      location: string;
      court_name: string;
      is_relocated: false;
      is_displaced: boolean;
      is_fixed: true;
    rest_conflicts: string[];
  };

function resolveDayScheduleReorganizationTimelineItemId(
  item: DayScheduleReorganizationTimelineItem,
): string | null {
  return item.item_id ?? item.match_id ?? item.placeholder_id ?? null;
}

function resolveDayScheduleReorganizationManualCourtItemOrder(
  preview: DayScheduleReorganizationPreview,
): Record<string, string[]> {
  return preview.timeline.reduce<Record<string, string[]>>((courtItemOrder, item) => {
    const itemId = resolveDayScheduleReorganizationTimelineItemId(item);

    if (!itemId) {
      return courtItemOrder;
    }

    const courtItems = courtItemOrder[item.court_name] ?? [];
    courtItems.push(itemId);
    courtItemOrder[item.court_name] = courtItems;
    return courtItemOrder;
  }, {});
}

function resolveDateOnlyString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function resolveBrazilianDateLabel(dateValue: string | null): string {
  if (!dateValue) {
    return "Sem data";
  }

  return format(new Date(`${dateValue}T12:00:00`), "dd/MM/yyyy", {
    locale: ptBR,
  });
}

function isManualRelocationPlaceholderItem(item: {
  item_type?: "MATCH" | "KNOCKOUT_PLACEHOLDER";
}) {
  return item.item_type == "KNOCKOUT_PLACEHOLDER";
}

function resolveManualRelocationItemLabel(item: {
  label?: string | null;
  item_type?: "MATCH" | "KNOCKOUT_PLACEHOLDER";
}) {
  if (item.label) {
    return item.label;
  }

  return isManualRelocationPlaceholderItem(item) ? "A definir" : "Jogo";
}

function resolvePendingManualRelocationScheduleValue(
  match: Match,
  key:
    | "scheduled_date"
    | "location"
    | "court_name"
    | "start_time"
    | "scheduled_slot"
    | "queue_position",
): string | number | null {
  const schedule = match.pending_manual_relocation_previous_schedule;

  if (!schedule || typeof schedule != "object") {
    return null;
  }

  const value = schedule[key];

  if (
    key == "scheduled_date" ||
    key == "location" ||
    key == "court_name" ||
    key == "start_time"
  ) {
    return typeof value == "string" ? value : null;
  }

  return typeof value == "number" ? value : null;
}

function resolveKnockoutScheduleSwapOptionLabel(
  item: ListKnockoutScheduleSwapCandidatesResponseItem,
  displayMatchNumber: number | null,
): string {
  const dateLabel = resolveBrazilianDateLabel(item.scheduled_date);
  const timeLabel = resolveSaoPauloTimeLabel(item.start_time);
  const queuePosition = item.scheduled_slot ?? item.queue_position ?? null;
  const queueLabel =
    queuePosition != null ? `Posição ${queuePosition} na fila` : null;
  const stageLabel = item.is_third_place
    ? "Disputa de 3º lugar"
    : `Mata-mata • Rodada ${item.round_number}`;
  const participantLabel = item.is_placeholder
    ? "A definir x A definir"
    : `${item.home_team_name ?? "Casa"} x ${item.away_team_name ?? "Visitante"}`;

  return [
    item.sport_name,
    MATCH_NAIPE_LABELS[item.naipe],
    item.division ? TEAM_DIVISION_LABELS[item.division] : null,
    stageLabel,
    dateLabel,
    timeLabel,
    displayMatchNumber != null ? `Jogo ${displayMatchNumber}` : null,
    queueLabel,
    participantLabel,
  ]
    .filter(Boolean)
    .join(" • ");
}

function resolveKnockoutScheduleSwapSourceLabel(
  placeholder: ScheduledKnockoutPlaceholder,
): string {
  const queuePosition =
    placeholder.scheduled_slot ?? placeholder.queue_position ?? null;

  return [
    placeholder.sport_name,
    MATCH_NAIPE_LABELS[placeholder.naipe],
    placeholder.division
      ? TEAM_DIVISION_LABELS[placeholder.division]
      : null,
    placeholder.stage_label,
    resolveBrazilianDateLabel(placeholder.scheduled_date),
    resolveSaoPauloTimeLabel(placeholder.start_time),
    placeholder.display_match_number != null
      ? `Jogo ${placeholder.display_match_number}`
      : null,
    queuePosition != null
      ? `Posição ${queuePosition} na fila`
      : null,
    "A definir x A definir",
  ]
    .filter(Boolean)
    .join(" • ");
}

function resolveOperationalKnockoutScheduleAdjustmentItemLabel(item: {
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  round_number: number;
  slot_number: number;
  is_third_place: boolean;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  is_placeholder: boolean;
  home_team_name: string | null;
  away_team_name: string | null;
}) {
  const participantLabel = item.is_placeholder
    ? "A definir x A definir"
    : `${item.home_team_name ?? "Casa"} x ${item.away_team_name ?? "Visitante"}`;

  return [
    item.sport_name,
    MATCH_NAIPE_LABELS[item.naipe],
    item.division ? TEAM_DIVISION_LABELS[item.division] : null,
    item.is_third_place ? "Disputa de 3º lugar" : `Rodada ${item.round_number}`,
    `${resolveSaoPauloTimeLabel(item.start_time) ?? "Sem horário"}–${resolveSaoPauloTimeLabel(item.end_time) ?? ""}`,
    `${item.duration_minutes} min`,
    participantLabel,
  ]
    .filter(Boolean)
    .join(" • ");
}

function resolveKnockoutBracketMatchIdForMatch(
  championshipBracketView: ChampionshipBracketView,
  matchId: string,
) {
  for (const competition of championshipBracketView.competitions) {
    const knockoutMatch = competition.knockout_matches.find(
      (candidate) => candidate.match_id == matchId,
    );

    if (knockoutMatch) {
      return knockoutMatch.id;
    }
  }

  return null;
}

function AdminMatchesKnockoutPlaceholderCard({
  placeholder,
  canManageMatches,
  isScoreSheetReviewMode,
  disabled,
  onSwap,
  onAdjustSchedule,
}: {
  placeholder: ScheduledKnockoutPlaceholder;
  canManageMatches: boolean;
  isScoreSheetReviewMode: boolean;
  disabled: boolean;
  onSwap: (placeholder: ScheduledKnockoutPlaceholder) => void;
  onAdjustSchedule: (bracketMatchId: string) => void;
}) {
  const scheduledTimeLabel = resolvePublicScheduleTimeLabel(
    placeholder.start_time,
  );
  const slotLabel =
    placeholder.display_match_number ??
    placeholder.scheduled_slot ??
    placeholder.queue_position ??
    null;

  return (
    <div className="list-item-card px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-2 sm:w-44 sm:shrink-0">
          <span className="shrink-0 text-xs font-medium uppercase text-muted-foreground">
            {placeholder.sport_name}
          </span>
          <div className="flex flex-wrap items-center gap-1.5 sm:flex-col sm:items-start sm:gap-1">
            <AppBadge tone={resolveMatchNaipeBadgeTone(placeholder.naipe)}>
              {MATCH_NAIPE_LABELS[placeholder.naipe]}
            </AppBadge>
            <AppBadge tone={AppBadgeTone.AMBER}>A definir</AppBadge>
            {placeholder.division ? (
              <AppBadge tone={TEAM_DIVISION_BADGE_TONES[placeholder.division]}>
                {TEAM_DIVISION_LABELS[placeholder.division]}
              </AppBadge>
            ) : null}
            <AppBadge tone={AppBadgeTone.NEUTRAL}>
              {placeholder.stage_label}
            </AppBadge>
          </div>
        </div>

        <div className="min-w-0 flex-1 text-center">
          <p className="font-display text-sm font-semibold text-muted-foreground">
            A definir <span className="mx-2">×</span> A definir
          </p>
          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            <p>Representação: {placeholder.stage_label}</p>
            {scheduledTimeLabel ? (
              <p>Horário planejado: {scheduledTimeLabel}</p>
            ) : null}
            <p>
              Local: {placeholder.location ?? "A definir"}
              {placeholder.court_name ? ` • ${placeholder.court_name}` : ""}
              {slotLabel != null ? ` • Jogo ${slotLabel}` : ""}
            </p>
            <p>{resolveBrazilianDateLabel(placeholder.scheduled_date)}</p>
          </div>
        </div>

        {canManageMatches && !isScoreSheetReviewMode ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Ações do slot ${placeholder.stage_label} ${MATCH_NAIPE_LABELS[placeholder.naipe]}`}
                disabled={disabled}
              >
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => onSwap(placeholder)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Trocar jogo
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAdjustSchedule(placeholder.id)}>
                <Clock className="mr-2 h-4 w-4" />
                Ajustar programação futura
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}

function resolveSafeScoreValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function MatchEditCounter({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const safeValue = resolveSafeScoreValue(value);

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-10 w-10"
        onClick={() => onChange(Math.max(0, safeValue - 1))}
        disabled={safeValue == 0}
        aria-label={`Diminuir ${label}`}
      >
        <Minus className="h-3 w-3" />
      </Button>
      <output
        aria-label={label}
        className="app-input-field flex h-10 min-w-14 items-center justify-center px-3 text-center font-semibold"
      >
        {safeValue}
      </output>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-10 w-10"
        onClick={() => onChange(safeValue + 1)}
        aria-label={`Aumentar ${label}`}
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}

function resolveParsedScoreInputValue(value: string): number {
  const trimmedValue = value.trim();

  if (trimmedValue.length == 0) {
    return 0;
  }

  return resolveSafeScoreValue(Number.parseInt(trimmedValue, 10));
}

function resolveParsedNullableScoreInputValue(value: string): number | null {
  const trimmedValue = value.trim();

  if (trimmedValue.length == 0) {
    return null;
  }

  return resolveSafeScoreValue(Number.parseInt(trimmedValue, 10));
}

function resolveNormalizedGameSlotDraft(value: string): string {
  const trimmedValue = value.trim();

  if (trimmedValue.length == 0) {
    return "";
  }

  const parsedSlotNumber = Number.parseInt(trimmedValue, 10);

  if (!Number.isFinite(parsedSlotNumber) || parsedSlotNumber <= 0) {
    return "";
  }

  return String(parsedSlotNumber);
}

function resolveSetWins(matchSets: MatchSetInput[]) {
  return matchSets.reduce(
    (total, matchSet) => {
      if (matchSet.home_points > matchSet.away_points) {
        return {
          home_sets: total.home_sets + 1,
          away_sets: total.away_sets,
        };
      }

      if (matchSet.away_points > matchSet.home_points) {
        return {
          home_sets: total.home_sets,
          away_sets: total.away_sets + 1,
        };
      }

      return total;
    },
    {
      home_sets: 0,
      away_sets: 0,
    },
  );
}

function resolveNormalizedMatchSetsDraft(
  matchSetsDraft: MatchSetInput[],
): MatchSetInput[] {
  return matchSetsDraft.map((matchSet, matchSetIndex) => ({
    set_number: matchSetIndex + 1,
    home_points: resolveSafeScoreValue(matchSet.home_points),
    away_points: resolveSafeScoreValue(matchSet.away_points),
  }));
}

function areMatchSetInputsEqual(
  firstMatchSets: MatchSetInput[],
  secondMatchSets: MatchSetInput[],
): boolean {
  if (firstMatchSets.length != secondMatchSets.length) {
    return false;
  }

  return firstMatchSets.every((matchSet, matchSetIndex) => {
    const secondMatchSet = secondMatchSets[matchSetIndex];

    if (!secondMatchSet) {
      return false;
    }

    return (
      matchSet.set_number == secondMatchSet.set_number &&
      matchSet.home_points == secondMatchSet.home_points &&
      matchSet.away_points == secondMatchSet.away_points
    );
  });
}

function resolveScheduledDateDraftValue(match: Match): Date | null {
  const scheduledDateValue = resolveMatchScheduledDateValue(match);

  if (!scheduledDateValue) {
    return null;
  }

  return new Date(`${scheduledDateValue}T12:00:00`);
}

function resolveInitialEditingMatchDraft(
  match: Match,
  selectedGroupOptionValue: string,
): MatchEditDraft {
  const displaySlot = resolveDisplayedMatchQueuePosition(match);
  const currentGameSlot =
    displaySlot === Number.MAX_SAFE_INTEGER ? null : displaySlot;

  return {
    sportId: match.sport_id,
    homeTeamId: match.home_team_id,
    awayTeamId: match.away_team_id,
    homeScore: match.home_score,
    awayScore: match.away_score,
    homePenaltyScore: match.home_penalty_score ?? null,
    awayPenaltyScore: match.away_penalty_score ?? null,
    homeYellowCards: match.home_yellow_cards ?? 0,
    homeRedCards: match.home_red_cards ?? 0,
    homeBlueCards: match.home_blue_cards ?? 0,
    homeTwoMinutePenalties: match.home_two_minute_penalties ?? 0,
    awayYellowCards: match.away_yellow_cards ?? 0,
    awayRedCards: match.away_red_cards ?? 0,
    awayBlueCards: match.away_blue_cards ?? 0,
    awayTwoMinutePenalties: match.away_two_minute_penalties ?? 0,
    location: match.location,
    courtName: match.court_name ?? "",
    scheduledDate: resolveScheduledDateDraftValue(match),
    startTime: match.start_time ? new Date(match.start_time) : null,
    gameSlot: currentGameSlot == null ? "" : String(currentGameSlot),
    isEstimatedStartTimeManuallySelected: false,
    manualRepresentationMode:
      match.manual_representation_mode ?? MatchManualRepresentationMode.AUTO,
    division: match.division,
    naipe: match.naipe,
    status: match.status,
    selectedGroupOptionValue,
    resolvedTieBreakerRule: match.resolved_tie_breaker_rule ?? "",
  };
}

function isHandballSportName(sportName: string | undefined): boolean {
  return resolveSportCode(sportName ?? "") == "HANDEBOL";
}

function shouldUseSocietyPenaltyShootout(params: {
  championship: Pick<Championship, "code">;
  bracketContext?: MatchBracketContext | null;
  status: MatchStatus;
  homeScore: number;
  awayScore: number;
}): boolean {
  return (
    params.championship.code == ChampionshipCode.SOCIETY &&
    params.bracketContext?.phase == BracketPhase.KNOCKOUT &&
    params.status == MatchStatus.FINISHED &&
    params.homeScore == params.awayScore
  );
}

function resolveScheduledQueueSummary(
  match: Match & { scheduled_slot?: number | null },
  visualQueuePosition: number | undefined,
): string {
  const scheduledDateValue = resolveMatchScheduledDateValue(match);
  const queueLabel = resolveDisplayedMatchQueueLabel(
    match,
    visualQueuePosition,
  );

  if (!scheduledDateValue) {
    return queueLabel;
  }

  return `${format(new Date(`${scheduledDateValue}T12:00:00`), "dd/MM", { locale: ptBR })} • ${queueLabel}`;
}

function resolveAdminMatchesOperationalErrorMessage(error: {
  code?: string;
  message: string;
}): string {
  if (
    error.code == "PGRST204" &&
    (error.message.includes("current_set_home_score") ||
      error.message.includes("current_set_away_score") ||
      error.message.includes("home_penalty_score") ||
      error.message.includes("away_penalty_score") ||
      error.message.includes("home_blue_cards") ||
      error.message.includes("away_blue_cards") ||
      error.message.includes("home_two_minute_penalties") ||
      error.message.includes("away_two_minute_penalties"))
  ) {
    return "As migrations operacionais de placar/cartões ainda não foram aplicadas no banco. Rode npx supabase db push e recarregue o schema.";
  }

  if (error.code == "42702" && error.message.includes("team_id_value")) {
    return "A função de sorteio manual no banco está desatualizada. Rode npx supabase db push para aplicar a migration de correção de ambiguidade do team_id_value.";
  }

  if (error.code == "42702" && error.message.includes("bracket_edition_id")) {
    return "A função generate_championship_knockout do banco está desatualizada. Rode npx supabase db push para aplicar a migration de correção de ambiguidade do bracket_edition_id.";
  }

  if (
    error.code == "22P02" &&
    error.message.includes("bracket_third_place_mode") &&
    error.message.includes("REQUIRED")
  ) {
    return "A função de geração do mata-mata no banco está desatualizada (third_place_mode inválido). Rode npx supabase db push para aplicar a migration de correção.";
  }

  return error.message;
}

function resolveChampionshipBracketScheduleDays(
  championshipBracketView: ChampionshipBracketView,
): ChampionshipBracketScheduleDayInput[] {
  const scheduleDays = (
    championshipBracketView.edition?.payload_snapshot as {
      schedule_days?: unknown;
    } | null
  )?.schedule_days;

  if (!Array.isArray(scheduleDays)) {
    return [];
  }

  return scheduleDays.filter(
    (scheduleDay): scheduleDay is ChampionshipBracketScheduleDayInput => {
      return (
        typeof scheduleDay == "object" &&
        scheduleDay != null &&
        typeof scheduleDay.date == "string" &&
        Array.isArray(scheduleDay.locations)
      );
    },
  );
}

function resolveAllowedEditingStatuses(
  currentStatus: MatchStatus,
): MatchStatus[] {
  if (currentStatus == MatchStatus.SCHEDULED) {
    return [MatchStatus.SCHEDULED, MatchStatus.LIVE];
  }

  if (currentStatus == MatchStatus.LIVE) {
    return [MatchStatus.LIVE, MatchStatus.FINISHED];
  }

  if (currentStatus == MatchStatus.FINISHED) {
    return [MatchStatus.FINISHED, MatchStatus.LIVE];
  }

  return [currentStatus];
}

function resolveSportsByNaipe(
  championshipSports: ChampionshipSport[],
  naipe: MatchNaipe,
): Sport[] {
  const sportsById = new Map<string, Sport>();

  championshipSports
    .filter((championshipSport) =>
      doesChampionshipSportSupportNaipe(championshipSport.naipe_mode, naipe),
    )
    .forEach((championshipSport) => {
      const sport = championshipSport.sports;

      if (sport && !sportsById.has(sport.id)) {
        sportsById.set(sport.id, sport);
      }
    });

  return [...sportsById.values()].sort((firstSport, secondSport) =>
    firstSport.name.localeCompare(secondSport.name),
  );
}

function shuffleTeamIds(teamIds: string[]): string[] {
  const shuffledTeamIds = [...teamIds];

  for (
    let currentIndex = shuffledTeamIds.length - 1;
    currentIndex > 0;
    currentIndex -= 1
  ) {
    const randomIndex = Math.floor(Math.random() * (currentIndex + 1));
    const currentValue = shuffledTeamIds[currentIndex];

    shuffledTeamIds[currentIndex] = shuffledTeamIds[randomIndex];
    shuffledTeamIds[randomIndex] = currentValue;
  }

  return shuffledTeamIds;
}

function resolveScoreSheetSelectionOptionByValue(
  value: string,
  options: ScoreSheetAwardPlayerOption[],
): ScoreSheetAwardSelectionOption {
  if (value.startsWith(NEW_PLAYER_OPTION_PREFIX)) {
    return {
      player_name: value.replace(NEW_PLAYER_OPTION_PREFIX, ""),
    };
  }

  const option = options.find((playerOption) => playerOption.id == value);

  if (option) {
    return {
      player_id: option.id,
    };
  }

  return {
    player_name: value,
  };
}

function resolveScoreSheetDraftFromContext(
  context: MatchScoreSheetAwardsContext,
): MatchScoreSheetAwardsDraft {
  const homePlayerOptions = [...context.home_players];
  const awayPlayerOptions = [...context.away_players];

  const resolvePlayerSelection = (
    selection: { player_id: string | null; player_name: string | null } | null,
    options: ScoreSheetAwardPlayerOption[],
  ): string => {
    if (!selection) {
      return "";
    }

    if (selection.player_id) {
      if (
        !options.some((option) => option.id == selection.player_id) &&
        selection.player_name
      ) {
        options.push({ id: selection.player_id, name: selection.player_name });
      }
      return selection.player_id;
    }

    if (selection.player_name) {
      return `${NEW_PLAYER_OPTION_PREFIX}${selection.player_name}`;
    }

    return "";
  };

  const homeGoalSelections: GoalSelection[] = (context.home_goals ?? []).map(
    (goal) => ({
      scorerId: resolvePlayerSelection(goal, homePlayerOptions),
    }),
  );

  const awayGoalSelections: GoalSelection[] = (context.away_goals ?? []).map(
    (goal) => ({
      scorerId: resolvePlayerSelection(goal, awayPlayerOptions),
    }),
  );
  const homeYellowCardSelections: GoalSelection[] = (
    context.home_yellow_cards ?? []
  ).map((yellowCard) => ({
    scorerId: resolvePlayerSelection(yellowCard, homePlayerOptions),
  }));
  const awayYellowCardSelections: GoalSelection[] = (
    context.away_yellow_cards ?? []
  ).map((yellowCard) => ({
    scorerId: resolvePlayerSelection(yellowCard, awayPlayerOptions),
  }));
  const homeRedCardSelections: GoalSelection[] = (context.home_red_cards ?? []).map(
    (redCard) => ({
      scorerId: resolvePlayerSelection(redCard, homePlayerOptions),
    }),
  );
  const awayRedCardSelections: GoalSelection[] = (context.away_red_cards ?? []).map(
    (redCard) => ({
      scorerId: resolvePlayerSelection(redCard, awayPlayerOptions),
    }),
  );
  const homeBlueCardSelections: GoalSelection[] = (
    context.home_blue_cards ?? []
  ).map((blueCard) => ({
    scorerId: resolvePlayerSelection(blueCard, homePlayerOptions),
  }));
  const awayBlueCardSelections: GoalSelection[] = (
    context.away_blue_cards ?? []
  ).map((blueCard) => ({
    scorerId: resolvePlayerSelection(blueCard, awayPlayerOptions),
  }));

  while (homeGoalSelections.length < context.required_home_goals) {
    homeGoalSelections.push({ scorerId: "" });
  }

  while (awayGoalSelections.length < context.required_away_goals) {
    awayGoalSelections.push({ scorerId: "" });
  }

  while (homeYellowCardSelections.length < context.required_home_yellow_cards) {
    homeYellowCardSelections.push({ scorerId: "" });
  }

  while (awayYellowCardSelections.length < context.required_away_yellow_cards) {
    awayYellowCardSelections.push({ scorerId: "" });
  }

  while (homeRedCardSelections.length < (context.required_home_red_cards ?? 0)) {
    homeRedCardSelections.push({ scorerId: "" });
  }

  while (awayRedCardSelections.length < (context.required_away_red_cards ?? 0)) {
    awayRedCardSelections.push({ scorerId: "" });
  }

  while (homeBlueCardSelections.length < (context.required_home_blue_cards ?? 0)) {
    homeBlueCardSelections.push({ scorerId: "" });
  }

  while (awayBlueCardSelections.length < (context.required_away_blue_cards ?? 0)) {
    awayBlueCardSelections.push({ scorerId: "" });
  }

  return {
    homePlayerOptions: homePlayerOptions.sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    awayPlayerOptions: awayPlayerOptions.sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    homeGoalSelections: homeGoalSelections.slice(
      0,
      context.required_home_goals,
    ),
    awayGoalSelections: awayGoalSelections.slice(
      0,
      context.required_away_goals,
    ),
    homeYellowCardSelections: homeYellowCardSelections.slice(
      0,
      context.required_home_yellow_cards,
    ),
    awayYellowCardSelections: awayYellowCardSelections.slice(
      0,
      context.required_away_yellow_cards,
    ),
    homeRedCardSelections: homeRedCardSelections.slice(
      0,
      context.required_home_red_cards ?? 0,
    ),
    awayRedCardSelections: awayRedCardSelections.slice(
      0,
      context.required_away_red_cards ?? 0,
    ),
    homeBlueCardSelections: homeBlueCardSelections.slice(
      0,
      context.required_home_blue_cards ?? 0,
    ),
    awayBlueCardSelections: awayBlueCardSelections.slice(
      0,
      context.required_away_blue_cards ?? 0,
    ),
    newHomePlayerName: "",
    newAwayPlayerName: "",
    requiredHomeGoals: context.required_home_goals,
    requiredAwayGoals: context.required_away_goals,
    requiredHomeYellowCards: context.required_home_yellow_cards,
    requiredAwayYellowCards: context.required_away_yellow_cards,
    requiredHomeRedCards: context.required_home_red_cards ?? 0,
    requiredAwayRedCards: context.required_away_red_cards ?? 0,
    requiredHomeBlueCards: context.required_home_blue_cards ?? 0,
    requiredAwayBlueCards: context.required_away_blue_cards ?? 0,
    requiresGoalScorers:
      context.requires_goal_scorers ??
      context.required_home_goals + context.required_away_goals > 0,
    supportsCards: context.supports_cards,
    isWalkover: context.is_walkover,
  };
}

function resolveScoreSheetAwardsContextWithMatchDisciplineFallback(
  context: MatchScoreSheetAwardsContext,
  match: Match,
  supportsCards: boolean,
): MatchScoreSheetAwardsContext {
  const shouldUseMatchDisciplineFallback =
    supportsCards && !context.supports_cards;

  const resolveRequiredDisciplineCount = (
    contextValue: number | undefined,
    matchValue: number | null,
  ) =>
    shouldUseMatchDisciplineFallback || contextValue == null
      ? (matchValue ?? 0)
      : contextValue;

  return {
    ...context,
    supports_cards: context.supports_cards || supportsCards,
    required_home_yellow_cards: resolveRequiredDisciplineCount(
      context.required_home_yellow_cards,
      match.home_yellow_cards,
    ),
    required_away_yellow_cards: resolveRequiredDisciplineCount(
      context.required_away_yellow_cards,
      match.away_yellow_cards,
    ),
    required_home_red_cards: resolveRequiredDisciplineCount(
      context.required_home_red_cards,
      match.home_red_cards,
    ),
    required_away_red_cards: resolveRequiredDisciplineCount(
      context.required_away_red_cards,
      match.away_red_cards,
    ),
    required_home_blue_cards: resolveRequiredDisciplineCount(
      context.required_home_blue_cards,
      match.home_blue_cards,
    ),
    required_away_blue_cards: resolveRequiredDisciplineCount(
      context.required_away_blue_cards,
      match.away_blue_cards,
    ),
  };
}

export function AdminMatches({
  matches,
  championshipSports,
  teams,
  selectedChampionship,
  championshipBracketView,
  loadingChampionshipBracket,
  matchBracketContextByMatchId,
  matchRepresentationByMatchId = {},
  visualQueuePositionByMatchId = {},
  estimatedStartTimeByMatchId = {},
  isInitialLoading = false,
  isFetchingMatches = false,
  canManageMatches: canManageMatchesProp = true,
  hasMatchesEditPermission = canManageMatchesProp,
  availableSeasonYears = [],
  selectedSeasonYear = null,
  onSeasonYearChange,
  viewMode = AdminMatchesViewMode.DEFAULT,
  onOpenTieBreaksTab,
  onRefetch,
  onRefetchChampionshipBracket,
  externalPendingAwardDrawContexts,
  externalLoadingPendingAwardDraws,
  externalRefetchPendingAwardDraws,
}: Props) {
  const isScoreSheetReviewMode =
    viewMode == AdminMatchesViewMode.SCORE_SHEET_REVIEW;
  const isTieBreaksMode = viewMode == AdminMatchesViewMode.TIE_BREAKS;
  const isHistoricalSeasonView =
    !isScoreSheetReviewMode &&
    !isTieBreaksMode &&
    selectedSeasonYear != null &&
    selectedChampionship.current_season_year != null &&
    selectedSeasonYear != selectedChampionship.current_season_year;
  const canManageMatches = canManageMatchesProp && !isHistoricalSeasonView;
  const defaultMatchesStatusFilter = isScoreSheetReviewMode
    ? MATCHES_STATUS_FILTER_FINISHED
    : ALL_MATCHES_STATUS_FILTER;
  const [naipe, setNaipe] = useState<MatchNaipe>(MatchNaipe.MASCULINO);
  const [sportId, setSportId] = useState("");
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [location, setLocation] = useState("");
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [division, setDivision] = useState<TeamDivision>(
    TeamDivision.DIVISAO_PRINCIPAL,
  );
  const [selectedGroupOptionValue, setSelectedGroupOptionValue] = useState("");
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editingMatchDraft, setEditingMatchDraft] =
    useState<MatchEditDraft | null>(null);
  const [matchesSportFilter, setMatchesSportFilter] = useState<string>(
    ALL_MATCHES_SPORT_FILTER,
  );
  const [matchesStatusFilter, setMatchesStatusFilter] = useState<string>(
    defaultMatchesStatusFilter,
  );
  const [matchesTeamFilter, setMatchesTeamFilter] = useState<string>(
    ALL_MATCHES_TEAM_FILTER,
  );
  const [matchesNaipeFilter, setMatchesNaipeFilter] = useState<string>(
    ALL_MATCHES_NAIPE_FILTER,
  );
  const [matchesDivisionFilter, setMatchesDivisionFilter] = useState<string>(
    ALL_MATCHES_DIVISION_FILTER,
  );
  const [matchesGroupFilter, setMatchesGroupFilter] = useState<string>(
    ALL_MATCHES_GROUP_FILTER,
  );
  const [matchesLocationFilter, setMatchesLocationFilter] = useState<string>(
    ALL_MATCHES_LOCATION_FILTER,
  );
  const [matchesCourtFilter, setMatchesCourtFilter] = useState<string>(
    ALL_MATCHES_COURT_FILTER,
  );
  const [matchesDateFilter, setMatchesDateFilter] = useState<string>(
    ALL_MATCHES_DATE_FILTER,
  );
  const [activeMatchesSection, setActiveMatchesSection] = useState("ACTIVE");
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [matchesCurrentPage, setMatchesCurrentPage] = useState(1);
  const [matchesItemsPerPage, setMatchesItemsPerPage] = useState(
    DEFAULT_PAGINATION_ITEMS_PER_PAGE,
  );
  const [deletingMatches, setDeletingMatches] = useState(false);
  const [applyingBulkAction, setApplyingBulkAction] = useState(false);
  const [savingEditingMatch, setSavingEditingMatch] = useState(false);
  const [editingIndividualSession, setEditingIndividualSession] =
    useState<ChampionshipIndividualSession | null>(null);
  const [individualSessionEditDraft, setIndividualSessionEditDraft] =
    useState<IndividualSessionEditDraft | null>(null);
  const [individualSessionScheduleDays, setIndividualSessionScheduleDays] =
    useState<BracketDaySchedule[]>([]);
  const [savingIndividualSession, setSavingIndividualSession] = useState(false);
  const [showCreateMatchModal, setShowCreateMatchModal] = useState(false);
  const [showDeleteMatchDialog, setShowDeleteMatchDialog] = useState(false);
  const [pendingDeleteMatchId, setPendingDeleteMatchId] = useState<
    string | null
  >(null);
  const [pendingDeleteMatchLabel, setPendingDeleteMatchLabel] = useState("");
  const [showSwapMatchDialog, setShowSwapMatchDialog] = useState(false);
  const [pendingSwapSourceMatchId, setPendingSwapSourceMatchId] = useState<
    string | null
  >(null);
  const [pendingSwapTargetMatchId, setPendingSwapTargetMatchId] = useState("");
  const [
    eligibleSwapTargetMatchCandidates,
    setEligibleSwapTargetMatchCandidates,
  ] = useState<ListMatchQueueSwapCandidatesResponseItem[]>([]);
  const [loadingSwapTargetMatchOptions, setLoadingSwapTargetMatchOptions] =
    useState(false);
  const [swappingMatches, setSwappingMatches] = useState(false);
  const [showKnockoutScheduleSwapDialog, setShowKnockoutScheduleSwapDialog] =
    useState(false);
  const [pendingKnockoutScheduleSwapSource, setPendingKnockoutScheduleSwapSource] =
    useState<ScheduledKnockoutPlaceholder | null>(null);
  const [pendingKnockoutScheduleSwapTargetId, setPendingKnockoutScheduleSwapTargetId] =
    useState("");
  const [eligibleKnockoutScheduleSwapCandidates, setEligibleKnockoutScheduleSwapCandidates] =
    useState<ListKnockoutScheduleSwapCandidatesResponseItem[]>([]);
  const [loadingKnockoutScheduleSwapCandidates, setLoadingKnockoutScheduleSwapCandidates] =
    useState(false);
  const [showOperationalKnockoutScheduleAdjustmentDialog, setShowOperationalKnockoutScheduleAdjustmentDialog] =
    useState(false);
  const [operationalKnockoutScheduleAdjustmentSourceBracketMatchId, setOperationalKnockoutScheduleAdjustmentSourceBracketMatchId] =
    useState("");
  const [operationalKnockoutScheduleAdjustmentCandidates, setOperationalKnockoutScheduleAdjustmentCandidates] =
    useState<OperationalKnockoutScheduleAdjustmentCandidates | null>(null);
  const [operationalKnockoutScheduleAdjustmentSchedules, setOperationalKnockoutScheduleAdjustmentSchedules] =
    useState<BracketDaySchedule[]>([]);
  const [selectedOperationalKnockoutScheduleAdjustmentItemIds, setSelectedOperationalKnockoutScheduleAdjustmentItemIds] =
    useState<string[]>([]);
  const [operationalKnockoutScheduleAdjustmentDuration, setOperationalKnockoutScheduleAdjustmentDuration] =
    useState("");
  const [operationalKnockoutScheduleAdjustmentBreakAction, setOperationalKnockoutScheduleAdjustmentBreakAction] =
    useState<OperationalKnockoutScheduleAdjustmentInput["break"]["action"]>("KEEP");
  const [operationalKnockoutScheduleAdjustmentBreakId, setOperationalKnockoutScheduleAdjustmentBreakId] =
    useState("");
  const [operationalKnockoutScheduleAdjustmentBreakScopeType, setOperationalKnockoutScheduleAdjustmentBreakScopeType] =
    useState<OperationalKnockoutScheduleAdjustmentInput["break"]["scope_type"]>("ALL_COURTS");
  const [operationalKnockoutScheduleAdjustmentBreakStartTime, setOperationalKnockoutScheduleAdjustmentBreakStartTime] =
    useState("");
  const [operationalKnockoutScheduleAdjustmentBreakEndTime, setOperationalKnockoutScheduleAdjustmentBreakEndTime] =
    useState("");
  const [operationalKnockoutScheduleAdjustmentPreview, setOperationalKnockoutScheduleAdjustmentPreview] =
    useState<OperationalKnockoutScheduleAdjustmentPreview | null>(null);
  const [loadingOperationalKnockoutScheduleAdjustment, setLoadingOperationalKnockoutScheduleAdjustment] =
    useState(false);
  const [applyingOperationalKnockoutScheduleAdjustment, setApplyingOperationalKnockoutScheduleAdjustment] =
    useState(false);
  const [showManualRelocationDialog, setShowManualRelocationDialog] =
    useState(false);
  const [manualRelocationTargetDate, setManualRelocationTargetDate] =
    useState("");
  const [manualRelocationTargetLocation, setManualRelocationTargetLocation] =
    useState("");
  const [manualRelocationTargetCourt, setManualRelocationTargetCourt] =
    useState("");
  const [manualRelocationTargetStartTime, setManualRelocationTargetStartTime] =
    useState("");
  const [manualRelocationPosition, setManualRelocationPosition] =
    useState<ManualMatchRelocationPosition>("END");
  const [manualRelocationReason, setManualRelocationReason] =
    useState<ManualMatchRelocationReason>("WEATHER");
  const [manualRelocationNotes, setManualRelocationNotes] = useState("");
  const [manualRelocationPreview, setManualRelocationPreview] =
    useState<ManualMatchRelocationPreview | null>(null);
  const [loadingManualRelocationPreview, setLoadingManualRelocationPreview] =
    useState(false);
  const [applyingManualRelocation, setApplyingManualRelocation] =
    useState(false);
  const [showManualRelocationSlotDialog, setShowManualRelocationSlotDialog] =
    useState(false);
  const [manualRelocationSlotMatch, setManualRelocationSlotMatch] =
    useState<Match | null>(null);
  const [manualRelocationSlotTargetDate, setManualRelocationSlotTargetDate] =
    useState("");
  const [manualRelocationSlotTargetLocation, setManualRelocationSlotTargetLocation] =
    useState("");
  const [manualRelocationSlotTargetCourt, setManualRelocationSlotTargetCourt] =
    useState("");
  const [manualRelocationSlotId, setManualRelocationSlotId] = useState("");
  const [manualRelocationSlotReason, setManualRelocationSlotReason] =
    useState<ManualMatchRelocationReason>("WEATHER");
  const [manualRelocationSlotNotes, setManualRelocationSlotNotes] = useState("");
  const [manualRelocationSlotPreview, setManualRelocationSlotPreview] =
    useState<ManualMatchRelocationSlotPreview | null>(null);
  const [loadingManualRelocationSlots, setLoadingManualRelocationSlots] =
    useState(false);
  const [applyingManualRelocationSlot, setApplyingManualRelocationSlot] =
    useState(false);
  const [selectedPendingManualRelocationMatchIds, setSelectedPendingManualRelocationMatchIds] =
    useState<string[]>([]);
  const [showDayScheduleReorganizationDialog, setShowDayScheduleReorganizationDialog] =
    useState(false);
  const [dayScheduleReorganizationTargetDate, setDayScheduleReorganizationTargetDate] =
    useState("");
  const [dayScheduleReorganizationTargetLocation, setDayScheduleReorganizationTargetLocation] =
    useState("");
  const [dayScheduleReorganizationTargetCourt, setDayScheduleReorganizationTargetCourt] =
    useState("");
  const [dayScheduleReorganizationDayStartTime, setDayScheduleReorganizationDayStartTime] =
    useState("");
  const [dayScheduleReorganizationBreakPolicy, setDayScheduleReorganizationBreakPolicy] =
    useState<DayScheduleReorganizationBreakPolicy>("KEEP_BEFORE_KNOCKOUT");
  const [dayScheduleReorganizationReason, setDayScheduleReorganizationReason] =
    useState<ManualMatchRelocationReason>("WEATHER");
  const [dayScheduleReorganizationSchedules, setDayScheduleReorganizationSchedules] =
    useState<BracketDaySchedule[]>([]);
  const [dayScheduleReorganizationManualPreview, setDayScheduleReorganizationManualPreview] =
    useState<DayScheduleReorganizationPreview | null>(null);
  const [dayScheduleReorganizationManualCourtItemOrder, setDayScheduleReorganizationManualCourtItemOrder] =
    useState<Record<string, string[]>>({});
  const [draggedDayScheduleReorganizationItem, setDraggedDayScheduleReorganizationItem] =
    useState<
      | { type: "PENDING"; itemId: string }
      | { type: "TIMELINE"; courtName: string; itemId: string }
      | null
    >(null);
  const dayScheduleReorganizationDialogContentRef = useRef<HTMLDivElement>(null);
  const [placedDayScheduleReorganizationMatchIds, setPlacedDayScheduleReorganizationMatchIds] =
    useState<string[]>([]);
  const [loadingDayScheduleReorganizationPreview, setLoadingDayScheduleReorganizationPreview] =
    useState(false);
  const [applyingDayScheduleReorganization, setApplyingDayScheduleReorganization] =
    useState(false);
  const [showHoldMatchesDialog, setShowHoldMatchesDialog] = useState(false);
  const [holdingMatchesForRelocation, setHoldingMatchesForRelocation] =
    useState(false);
  const [holdMatchesReason, setHoldMatchesReason] =
    useState<ManualMatchRelocationReason>("WEATHER");
  const [holdMatchesNotes, setHoldMatchesNotes] = useState("");
  const [showDeleteSelectedMatchesDialog, setShowDeleteSelectedMatchesDialog] =
    useState(false);
  const [creatingMatch, setCreatingMatch] = useState(false);
  const [locationTemplates, setLocationTemplates] = useState<
    ChampionshipBracketLocationTemplate[]
  >([]);
  const [loadingLocationTemplates, setLoadingLocationTemplates] =
    useState(false);
  const [bracketCourtSportsDays, setBracketCourtSportsDays] = useState<
    BracketDayCourtSports[]
  >([]);
  const [loadingBracketCourtSportsDays, setLoadingBracketCourtSportsDays] =
    useState(false);
  const [pendingTieBreakContexts, setPendingTieBreakContexts] = useState<
    ChampionshipBracketTieBreakPendingContext[]
  >([]);
  const [loadingPendingTieBreakContexts, setLoadingPendingTieBreakContexts] =
    useState(false);
  const [showTieBreakDialog, setShowTieBreakDialog] = useState(false);
  const [savingTieBreakResolutions, setSavingTieBreakResolutions] =
    useState(false);
  const [
    savingTieBreakResolutionByContextKey,
    setSavingTieBreakResolutionByContextKey,
  ] = useState<Record<string, boolean>>({});
  const [
    draftTieBreakTeamIdsByContextKey,
    setDraftTieBreakTeamIdsByContextKey,
  ] = useState<Record<string, string[]>>({});
  const [editingMatchSetsDraft, setEditingMatchSetsDraft] = useState<
    MatchSetInput[]
  >([]);
  const [editingAvailableScheduleSlots, setEditingAvailableScheduleSlots] =
    useState<EditableMatchScheduleSlot[]>([]);
  const [
    loadingEditingAvailableScheduleSlots,
    setLoadingEditingAvailableScheduleSlots,
  ] = useState(false);
  const [hideReviewedMatches, setHideReviewedMatches] = useState(
    isScoreSheetReviewMode,
  );
  const [savingReviewStateByMatchId, setSavingReviewStateByMatchId] = useState<
    Record<string, boolean>
  >({});
  const [bulkReviewAction, setBulkReviewAction] =
    useState<BulkReviewAction | null>(null);
  const [
    showEditReviewConfirmationDialog,
    setShowEditReviewConfirmationDialog,
  ] = useState(false);
  const [activeScoreSheetReviewMatchId, setActiveScoreSheetReviewMatchId] =
    useState<string | null>(null);
  const [scoreSheetAwardsDraftByMatchId, setScoreSheetAwardsDraftByMatchId] =
    useState<Record<string, MatchScoreSheetAwardsDraft | undefined>>({});
  const [
    loadingScoreSheetAwardsByMatchId,
    setLoadingScoreSheetAwardsByMatchId,
  ] = useState<Record<string, boolean>>({});
  const [savingScoreSheetAwardsByMatchId, setSavingScoreSheetAwardsByMatchId] =
    useState<Record<string, boolean>>({});
  const [addPlayerButtonStateByKey, setAddPlayerButtonStateByKey] = useState<
    Record<string, "loading" | "success">
  >({});
  const newPlayerInputRefs = useRef<Record<string, HTMLInputElement | null>>(
    {},
  );
  const [editingPlayerByKey, setEditingPlayerByKey] = useState<
    Record<string, { playerId: string; name: string } | null>
  >({});
  const [draftAwardDrawOrderByContextKey, setDraftAwardDrawOrderByContextKey] =
    useState<Record<string, string[]>>({});
  const [savingAwardDrawByContextKey, setSavingAwardDrawByContextKey] =
    useState<Record<string, boolean>>({});
  const hasHandledPaginationScrollRef = useRef(false);
  const hasAttemptedKnockoutCatchUpRef = useRef<string | null>(null);
  const hasInitializedFilterRefetchRef = useRef(false);
  const hasInitializedPaginationRefetchRef = useRef(false);
  const {
    correctedGroupStandings,
    loading: loadingCorrectedGroupStandings,
    refetch: refetchCorrectedGroupStandings,
  } = useChampionshipCorrectedGroupStandings({
    championshipId: selectedChampionship.id,
    seasonYear: selectedChampionship.current_season_year ?? null,
    enabled: isTieBreaksMode,
  });
  const hasExternalAwardDrawData =
    externalPendingAwardDrawContexts !== undefined;
  const {
    pendingContexts: hookAwardDrawContexts,
    loading: hookLoadingPendingAwardDraws,
    refetch: hookRefetchPendingAwardDraws,
  } = usePendingAwardDraws({
    // Desabilita o hook interno quando dados externos são fornecidos (evita duplo fetch e conflito de canal)
    championshipId: hasExternalAwardDrawData
      ? null
      : isTieBreaksMode
        ? selectedChampionship.id
        : null,
    seasonYear: hasExternalAwardDrawData
      ? null
      : isTieBreaksMode
        ? (selectedChampionship.current_season_year ?? null)
        : null,
  });
  const pendingAwardDrawContexts =
    externalPendingAwardDrawContexts ?? hookAwardDrawContexts;
  const loadingPendingAwardDraws =
    externalLoadingPendingAwardDraws ?? hookLoadingPendingAwardDraws;
  const refetchPendingAwardDraws =
    externalRefetchPendingAwardDraws ?? hookRefetchPendingAwardDraws;
  const { usesDivisions: championshipUsesDivisions } =
    useChampionshipSeasonRuntime({
      championship: selectedChampionship,
      seasonYear:
        selectedSeasonYear ?? selectedChampionship.current_season_year ?? null,
    });

  const hasConfiguredBracket =
    championshipBracketView.edition != null &&
    championshipBracketView.competitions.length > 0;
  const bracketEditionId = championshipBracketView.edition?.id ?? null;
  const availableSportsForCreate = useMemo(() => {
    return resolveSportsByNaipe(championshipSports, naipe);
  }, [championshipSports, naipe]);

  const availableSportsForEditing = useMemo(() => {
    if (!editingMatchDraft) {
      return [];
    }

    return resolveSportsByNaipe(championshipSports, editingMatchDraft.naipe);
  }, [championshipSports, editingMatchDraft]);

  const championshipSportResultRuleBySportId = useMemo(() => {
    const championshipSportResultRuleMap = new Map<
      string,
      ChampionshipSportResultRule
    >();

    championshipSports.forEach((championshipSport) => {
      championshipSportResultRuleMap.set(
        championshipSport.sport_id,
        championshipSport.result_rule,
      );
    });

    return championshipSportResultRuleMap;
  }, [championshipSports]);

  const supportsIndividualAwardsBySportId = useMemo(() => {
    const map = new Map<string, boolean>();

    championshipSports.forEach((championshipSport) => {
      map.set(
        championshipSport.sport_id,
        championshipSport.supports_individual_awards,
      );
    });

    return map;
  }, [championshipSports]);

  const requiresIndividualScoreSheetReview = useCallback(
    (match: Match) => {
      const sportName =
        match.sports?.name ??
        championshipSports.find(
          (championshipSport) => championshipSport.sport_id == match.sport_id,
        )?.sports?.name ??
        "";

      const hasDisciplineOccurrences =
        (match.home_yellow_cards ?? 0) +
          (match.away_yellow_cards ?? 0) +
          (match.home_red_cards ?? 0) +
          (match.away_red_cards ?? 0) +
          (match.home_blue_cards ?? 0) +
          (match.away_blue_cards ?? 0) >
        0;

      const hasGoalsRequiringScorers =
        (match.home_score ?? 0) + (match.away_score ?? 0) > 0;
      const supportsCards =
        match.supports_cards ||
        championshipSports.find(
          (championshipSport) => championshipSport.sport_id == match.sport_id,
        )?.supports_cards === true;

      return (
        !match.is_walkover &&
        ((supportsCards && hasDisciplineOccurrences) ||
          (hasGoalsRequiringScorers &&
            selectedChampionship.code == ChampionshipCode.SOCIETY &&
            supportsIndividualAwardsBySportId.get(match.sport_id) === true &&
            resolveSportCode(sportName) == "FUTEBOL_SOCIETY"))
      );
    },
    [
      championshipSports,
      selectedChampionship.code,
      supportsIndividualAwardsBySportId,
    ],
  );

  const championshipSportSupportsCardsBySportId = useMemo(() => {
    const championshipSportSupportsCardsMap = new Map<string, boolean>();

    championshipSports.forEach((championshipSport) => {
      championshipSportSupportsCardsMap.set(
        championshipSport.sport_id,
        championshipSport.supports_cards,
      );
    });

    return championshipSportSupportsCardsMap;
  }, [championshipSports]);

  const availableSports = useMemo(() => {
    const sportsById = new Map<string, Sport>();

    championshipSports.forEach((championshipSport) => {
      if (
        championshipSport.sports &&
        !sportsById.has(championshipSport.sport_id)
      ) {
        sportsById.set(championshipSport.sport_id, championshipSport.sports);
      }
    });

    matches.forEach((match) => {
      if (match.sports && !sportsById.has(match.sports.id)) {
        sportsById.set(match.sports.id, match.sports);
      }
    });

    return [...sportsById.values()].sort((firstSport, secondSport) =>
      firstSport.name.localeCompare(secondSport.name),
    );
  }, [championshipSports, matches]);

  const individualSportIds = useMemo(() => {
    return championshipSports
      .filter((championshipSport) => {
        const sportCode = resolveSportCode(
          championshipSport.sports?.name ?? "",
        );
        return sportCode == "ATLETISMO" || sportCode == "NATACAO";
      })
      .map((championshipSport) => championshipSport.sport_id);
  }, [championshipSports]);

  const displayedSeasonYear =
    selectedSeasonYear ?? selectedChampionship.current_season_year;
  const { sessions: championshipIndividualSessions } =
    useChampionshipIndividualEvents({
      championshipId: selectedChampionship.id,
      seasonYear: displayedSeasonYear,
      sportIds: individualSportIds,
      participantTeamId:
        matchesTeamFilter != ALL_MATCHES_TEAM_FILTER
          ? matchesTeamFilter
          : null,
    });
  const individualSessions = useMemo(() => {
    return championshipIndividualSessions.filter((session) =>
      individualSportIds.includes(session.sport_id),
    );
  }, [championshipIndividualSessions, individualSportIds]);

  const isEditingSetRuleMatch = useMemo(() => {
    if (!editingMatchDraft) {
      return false;
    }

    return (
      championshipSportResultRuleBySportId.get(editingMatchDraft.sportId) ==
      ChampionshipSportResultRule.SETS
    );
  }, [championshipSportResultRuleBySportId, editingMatchDraft]);

  const isEditingSportWithCards = useMemo(() => {
    if (!editingMatchDraft) {
      return false;
    }

    return (
      championshipSportSupportsCardsBySportId.get(editingMatchDraft.sportId) ==
      true
    );
  }, [championshipSportSupportsCardsBySportId, editingMatchDraft]);

  const isEditingHandballSport = useMemo(() => {
    if (!editingMatchDraft) {
      return false;
    }

    const editingSport = availableSports.find(
      (sport) => sport.id == editingMatchDraft.sportId,
    );
    return isHandballSportName(editingSport?.name);
  }, [availableSports, editingMatchDraft]);

  const championshipBracketScheduleDays = useMemo(() => {
    return resolveChampionshipBracketScheduleDays(championshipBracketView);
  }, [championshipBracketView]);

  const shouldUseScheduledSlotInMatchList =
    matchesSportFilter === ALL_MATCHES_SPORT_FILTER;

  const championshipDayDates = useMemo(() => {
    const payloadScheduleDayDates = championshipBracketScheduleDays
      .map((scheduleDay) => scheduleDay.date)
      .filter((scheduleDayDate, scheduleDayIndex, scheduleDayDates) => {
        return (
          scheduleDayDate.trim() &&
          scheduleDayDates.indexOf(scheduleDayDate) == scheduleDayIndex
        );
      })
      .sort((leftDate, rightDate) => leftDate.localeCompare(rightDate));

    if (payloadScheduleDayDates.length > 0) {
      return payloadScheduleDayDates;
    }

    const matchScheduleDates = matches
      .map((match) => resolveMatchScheduledDateValue(match))
      .filter(
        (scheduledDateValue): scheduledDateValue is string =>
          scheduledDateValue != null,
      )
      .filter((scheduledDateValue, scheduledDateIndex, scheduledDateValues) => {
        return (
          scheduledDateValues.indexOf(scheduledDateValue) == scheduledDateIndex
        );
      })
      .sort((leftDate, rightDate) => leftDate.localeCompare(rightDate));

    return matchScheduleDates;
  }, [championshipBracketScheduleDays, matches]);

  const availableLocationOptions = useMemo(() => {
    const locationNameSet = new Set<string>();

    if (selectedChampionship.default_location?.trim()) {
      locationNameSet.add(selectedChampionship.default_location.trim());
    }

    locationTemplates.forEach((locationTemplate) => {
      if (locationTemplate.name.trim()) {
        locationNameSet.add(locationTemplate.name.trim());
      }
    });

    championshipBracketScheduleDays.forEach((scheduleDay) => {
      scheduleDay.locations.forEach((scheduleLocation) => {
        if (scheduleLocation.name.trim()) {
          locationNameSet.add(scheduleLocation.name.trim());
        }
      });
    });

    return [...locationNameSet].sort((leftLocationName, rightLocationName) => {
      return leftLocationName.localeCompare(rightLocationName, "pt-BR", {
        sensitivity: "base",
      });
    });
  }, [
    championshipBracketScheduleDays,
    locationTemplates,
    selectedChampionship.default_location,
  ]);

  const createLocationOptions = useMemo(() => {
    if (
      !location.trim() ||
      availableLocationOptions.includes(location.trim())
    ) {
      return availableLocationOptions;
    }

    return [...availableLocationOptions, location.trim()].sort(
      (leftLocationName, rightLocationName) => {
        return leftLocationName.localeCompare(rightLocationName, "pt-BR", {
          sensitivity: "base",
        });
      },
    );
  }, [availableLocationOptions, location]);

  const editingLocationOptions = useMemo(() => {
    const editingLocation = editingMatchDraft?.location.trim();

    if (
      !editingLocation ||
      availableLocationOptions.includes(editingLocation)
    ) {
      return availableLocationOptions;
    }

    return [...availableLocationOptions, editingLocation].sort(
      (leftLocationName, rightLocationName) => {
        return leftLocationName.localeCompare(rightLocationName, "pt-BR", {
          sensitivity: "base",
        });
      },
    );
  }, [availableLocationOptions, editingMatchDraft?.location]);

  const bracketCourtSportsDayByDate = useMemo(() => {
    return bracketCourtSportsDays.reduce<Record<string, BracketDayCourtSports>>(
      (carry, day) => {
        carry[day.event_date] = day;
        return carry;
      },
      {},
    );
  }, [bracketCourtSportsDays]);

  const editingCourtOptions = useMemo(() => {
    const currentCourtName = editingMatchDraft?.courtName.trim() ?? "";

    if (
      !editingMatchDraft?.scheduledDate ||
      !editingMatchDraft.location.trim()
    ) {
      return currentCourtName ? [currentCourtName] : [];
    }

    const scheduledDateString = resolveDateOnlyString(
      editingMatchDraft.scheduledDate,
    );
    const bracketDay = bracketCourtSportsDayByDate[scheduledDateString];

    if (!bracketDay) {
      return currentCourtName ? [currentCourtName] : [];
    }

    const normalizedLocation = normalizeBracketEntityName(
      editingMatchDraft.location,
    );
    const compatibleCourts = bracketDay.locations
      .filter(
        (locationOption) =>
          normalizeBracketEntityName(locationOption.name) == normalizedLocation,
      )
      .flatMap((locationOption) =>
        locationOption.courts
          .filter(
            (courtOption) =>
              !editingMatchDraft.sportId ||
              courtOption.sports.some(
                (sportEntry) =>
                  sportEntry.sport_id == editingMatchDraft.sportId,
              ),
          )
          .map((courtOption) => ({
            name: courtOption.name,
            position: courtOption.position,
          })),
      )
      .sort(
        (leftCourtOption, rightCourtOption) =>
          leftCourtOption.position - rightCourtOption.position,
      )
      .map((courtOption) => courtOption.name);

    if (!editingMatchDraft.sportId) {
      if (!currentCourtName || compatibleCourts.includes(currentCourtName)) {
        return compatibleCourts;
      }

      return [...compatibleCourts, currentCourtName].sort(
        (leftCourtName, rightCourtName) => {
          return leftCourtName.localeCompare(rightCourtName, "pt-BR", {
            sensitivity: "base",
          });
        },
      );
    }

    if (compatibleCourts.length > 0) {
      return compatibleCourts;
    }

    return [];
  }, [
    bracketCourtSportsDayByDate,
    editingMatchDraft?.courtName,
    editingMatchDraft?.location,
    editingMatchDraft?.scheduledDate,
    editingMatchDraft?.sportId,
  ]);

  const currentEditingCourtName = editingMatchDraft?.courtName ?? "";

  useEffect(() => {
    if (!editingMatchDraft) {
      return;
    }

    if (editingCourtOptions.length == 0) {
      if (!currentEditingCourtName) {
        return;
      }

      setEditingMatchDraft((currentDraft) =>
        currentDraft
          ? {
              ...currentDraft,
              courtName: "",
            }
          : currentDraft,
      );
      return;
    }

    if (editingCourtOptions.includes(currentEditingCourtName)) {
      return;
    }

    setEditingMatchDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            courtName: editingCourtOptions[0] ?? "",
          }
        : currentDraft,
    );
  }, [currentEditingCourtName, editingCourtOptions, editingMatchDraft]);

  const editingScheduleSlotOptions = useMemo(() => {
    if (!editingMatchDraft?.startTime || !editingMatchId) {
      return editingAvailableScheduleSlots;
    }

    const persistedEditingMatch = matches.find(
      (match) => match.id == editingMatchId,
    );
    const persistedStartTime = persistedEditingMatch?.start_time ?? null;
    const currentStartTime = editingMatchDraft.startTime.toISOString();
    const hasPersistedCurrentStartTime =
      persistedStartTime != null &&
      new Date(persistedStartTime).getTime() ==
        editingMatchDraft.startTime.getTime();
    const isCurrentManualSchedule =
      persistedEditingMatch != null &&
      persistedEditingMatch.is_manual_schedule_override == true &&
      hasPersistedCurrentStartTime &&
      resolveMatchScheduledDateValue(persistedEditingMatch) ==
        resolveDateOnlyString(editingMatchDraft.scheduledDate) &&
      normalizeBracketEntityName(persistedEditingMatch.location) ==
        normalizeBracketEntityName(editingMatchDraft.location) &&
      normalizeBracketEntityName(persistedEditingMatch.court_name) ==
        normalizeBracketEntityName(editingMatchDraft.courtName);

    if (
      !isCurrentManualSchedule ||
      editingAvailableScheduleSlots.some(
        (slot) => slot.start_time == currentStartTime,
      )
    ) {
      return editingAvailableScheduleSlots;
    }

    return [
      {
        slot_number:
          resolveDisplayedMatchQueuePosition(persistedEditingMatch) ?? 0,
        start_time: currentStartTime,
        start_time_label:
          estimatedStartTimeByMatchId[editingMatchId] ??
          resolveSaoPauloTimeLabel(currentStartTime) ??
          "Horário atual",
        is_current_slot: true,
      },
      ...editingAvailableScheduleSlots,
    ];
  }, [
    editingAvailableScheduleSlots,
    editingMatchDraft,
    editingMatchId,
    estimatedStartTimeByMatchId,
    matches,
  ]);

  const selectedEditingScheduleSlot = useMemo(() => {
    if (!editingMatchDraft) {
      return null;
    }

    if (
      editingMatchDraft.isEstimatedStartTimeManuallySelected &&
      editingMatchDraft.startTime
    ) {
      const manuallySelectedSlot = editingScheduleSlotOptions.find(
        (slot) =>
          slot.start_time == editingMatchDraft.startTime?.toISOString(),
      );

      if (manuallySelectedSlot) {
        return manuallySelectedSlot;
      }
    }

    const estimatedStartTime = editingMatchId
      ? estimatedStartTimeByMatchId[editingMatchId]
      : null;

    if (estimatedStartTime) {
      const matchedByEstimatedTime = editingScheduleSlotOptions.find(
        (slot) => slot.start_time_label == estimatedStartTime,
      );

      if (matchedByEstimatedTime) {
        return matchedByEstimatedTime;
      }
    }

    if (editingMatchDraft.gameSlot) {
      const matchedByGameNumber = editingScheduleSlotOptions.find(
        (slot) => String(slot.slot_number) == editingMatchDraft.gameSlot,
      );

      if (matchedByGameNumber) {
        return matchedByGameNumber;
      }
    }

    const currentStartTimeValue =
      editingMatchDraft.startTime?.toISOString() ?? null;

    if (currentStartTimeValue) {
      const matchedByCurrentStartTime = editingScheduleSlotOptions.find(
        (slot) => slot.start_time == currentStartTimeValue,
      );

      if (matchedByCurrentStartTime) {
        return matchedByCurrentStartTime;
      }
    }

    return (
      editingScheduleSlotOptions.find((slot) => slot.is_current_slot) ?? null
    );
  }, [
    editingMatchDraft,
    editingMatchId,
    editingScheduleSlotOptions,
    estimatedStartTimeByMatchId,
  ]);

  const teamsAllowedForMatches = useMemo(() => {
    if (!championshipUsesDivisions) {
      return teams;
    }
    return teams.filter((team) => team.division != null);
  }, [championshipUsesDivisions, teams]);

  const loadPendingTieBreakContexts = useCallback(async () => {
    if (!championshipBracketView.edition?.id) {
      setPendingTieBreakContexts([]);
      setDraftTieBreakTeamIdsByContextKey({});
      setSavingTieBreakResolutionByContextKey({});
      setLoadingPendingTieBreakContexts(false);
      return;
    }

    setLoadingPendingTieBreakContexts(true);

    const response = await fetchChampionshipBracketPendingTieBreaks(
      selectedChampionship.id,
      championshipBracketView.edition.id,
    );

    setLoadingPendingTieBreakContexts(false);

    if (response.error) {
      toast.error(resolveAdminMatchesOperationalErrorMessage(response.error));
      return;
    }

    setPendingTieBreakContexts(response.data);
    setSavingTieBreakResolutionByContextKey({});
    setDraftTieBreakTeamIdsByContextKey(() => {
      return response.data.reduce<Record<string, string[]>>(
        (carry, pendingTieBreakContext) => {
          carry[pendingTieBreakContext.context_key] = [];
          return carry;
        },
        {},
      );
    });
  }, [championshipBracketView.edition?.id, selectedChampionship.id]);

  const loadLocationTemplates = useCallback(async () => {
    setLoadingLocationTemplates(true);

    const response = await fetchChampionshipBracketLocationTemplates();

    setLoadingLocationTemplates(false);

    if (response.error) {
      toast.error(response.error.message);
      return;
    }

    setLocationTemplates(response.data);
  }, []);

  const resetCreateMatchForm = () => {
    setNaipe(MatchNaipe.MASCULINO);
    setSportId("");
    setHomeTeamId("");
    setAwayTeamId("");
    setLocation("");
    setScheduledDate(null);
    setDivision(TeamDivision.DIVISAO_PRINCIPAL);
    setSelectedGroupOptionValue("");
  };

  useEffect(() => {
    setNaipe(MatchNaipe.MASCULINO);
    setSportId("");
    setHomeTeamId("");
    setAwayTeamId("");
    setLocation("");
    setScheduledDate(null);
    setDivision(TeamDivision.DIVISAO_PRINCIPAL);
    setSelectedGroupOptionValue("");
    setEditingMatchId(null);
    setEditingMatchDraft(null);
    setEditingMatchSetsDraft([]);
    setSavingEditingMatch(false);
    setShowSwapMatchDialog(false);
    setPendingSwapSourceMatchId(null);
    setPendingSwapTargetMatchId("");
    setSwappingMatches(false);
    setShowEditReviewConfirmationDialog(false);
    setMatchesSportFilter(ALL_MATCHES_SPORT_FILTER);
    setMatchesStatusFilter(defaultMatchesStatusFilter);
    setMatchesTeamFilter(ALL_MATCHES_TEAM_FILTER);
    setMatchesNaipeFilter(ALL_MATCHES_NAIPE_FILTER);
    setMatchesDivisionFilter(ALL_MATCHES_DIVISION_FILTER);
    setMatchesGroupFilter(ALL_MATCHES_GROUP_FILTER);
    setMatchesLocationFilter(ALL_MATCHES_LOCATION_FILTER);
    setMatchesCourtFilter(ALL_MATCHES_COURT_FILTER);
    setMatchesDateFilter(ALL_MATCHES_DATE_FILTER);
    setActiveMatchesSection("ACTIVE");
    setSelectedPendingManualRelocationMatchIds([]);
    setShowHoldMatchesDialog(false);
    setHoldingMatchesForRelocation(false);
    setHoldMatchesReason("WEATHER");
    setHoldMatchesNotes("");
    setHideReviewedMatches(isScoreSheetReviewMode);
    setCreatingMatch(false);
    setBulkReviewAction(null);
    setSavingReviewStateByMatchId({});
    setActiveScoreSheetReviewMatchId(null);
    setScoreSheetAwardsDraftByMatchId({});
    setLoadingScoreSheetAwardsByMatchId({});
    setSavingScoreSheetAwardsByMatchId({});

    setSelectedMatchIds([]);
    setMatchesCurrentPage(1);
    setMatchesItemsPerPage(DEFAULT_PAGINATION_ITEMS_PER_PAGE);
  }, [
    defaultMatchesStatusFilter,
    isScoreSheetReviewMode,
    selectedChampionship.id,
  ]);

  useEffect(() => {
    setMatchesStatusFilter(defaultMatchesStatusFilter);
    setHideReviewedMatches(isScoreSheetReviewMode);
    setBulkReviewAction(null);
    setSelectedMatchIds([]);
  }, [defaultMatchesStatusFilter, isScoreSheetReviewMode]);

  useEffect(() => {
    void loadPendingTieBreakContexts();
  }, [loadPendingTieBreakContexts]);

  useEffect(() => {
    if (
      !isScoreSheetReviewMode ||
      !canManageMatches ||
      !championshipBracketView.edition?.id
    ) {
      return;
    }

    const reconciliationKey = `${selectedChampionship.id}:${championshipBracketView.edition.id}`;

    if (hasAttemptedKnockoutCatchUpRef.current == reconciliationKey) {
      return;
    }

    hasAttemptedKnockoutCatchUpRef.current = reconciliationKey;

    void (async () => {
      const knockoutResponse = await generateChampionshipKnockout(
        selectedChampionship.id,
        championshipBracketView.edition?.id,
      );

      if (knockoutResponse.error) {
        console.info(
          "Reconciliação automática do mata-mata não aplicou alterações:",
          knockoutResponse.error.message,
        );
        return;
      }

      await Promise.all([
        onRefetchChampionshipBracket(),
        loadPendingTieBreakContexts(),
      ]);
    })();
  }, [
    canManageMatches,
    championshipBracketView.edition?.id,
    isScoreSheetReviewMode,
    loadPendingTieBreakContexts,
    onRefetchChampionshipBracket,
    selectedChampionship.id,
  ]);

  useEffect(() => {
    if (isTieBreaksMode) {
      return;
    }

    void loadLocationTemplates();
  }, [isTieBreaksMode, loadLocationTemplates]);

  useEffect(() => {
    if (!bracketEditionId) {
      setBracketCourtSportsDays([]);
      setLoadingBracketCourtSportsDays(false);
      return;
    }

    let isActive = true;
    setLoadingBracketCourtSportsDays(true);

    void getBracketCourtSports(bracketEditionId).then(({ data, error }) => {
      if (!isActive) {
        return;
      }

      setLoadingBracketCourtSportsDays(false);

      if (error) {
        toast.error(resolveAdminMatchesOperationalErrorMessage(error));
        return;
      }

      setBracketCourtSportsDays(data);
    });

    return () => {
      isActive = false;
    };
  }, [bracketEditionId]);

  useEffect(() => {
    if (
      !editingMatchId ||
      !editingMatchDraft?.scheduledDate ||
      !editingMatchDraft.location.trim() ||
      !editingMatchDraft.courtName.trim() ||
      !editingMatchDraft.sportId
    ) {
      setEditingAvailableScheduleSlots([]);
      setLoadingEditingAvailableScheduleSlots(false);
      return;
    }

    let isActive = true;
    const scheduledDateString = resolveDateOnlyString(
      editingMatchDraft.scheduledDate,
    );

    setLoadingEditingAvailableScheduleSlots(true);

    void (async () => {
      try {
        const { data, error } = await listEditableMatchScheduleSlots({
          match_id: editingMatchId,
          target_date: scheduledDateString,
          target_location: editingMatchDraft.location.trim(),
          target_court_name: editingMatchDraft.courtName.trim(),
          sport_id: editingMatchDraft.sportId,
          naipe: editingMatchDraft.naipe,
          home_team_id: editingMatchDraft.homeTeamId || null,
          away_team_id: editingMatchDraft.awayTeamId || null,
        });

        if (!isActive) {
          return;
        }

        if (error) {
          setEditingAvailableScheduleSlots([]);
          toast.error(resolveAdminMatchesOperationalErrorMessage(error));
          return;
        }

        setEditingAvailableScheduleSlots(data);
        setEditingMatchDraft((currentDraft) => {
          if (!currentDraft) {
            return currentDraft;
          }

          const currentStartTimeValue =
            currentDraft.startTime?.toISOString() ?? null;

          if (currentDraft.gameSlot && currentStartTimeValue) {
            return currentDraft;
          }

          const matchedSlotByGameNumber = currentDraft.gameSlot
            ? (data.find(
                (slot) => String(slot.slot_number) == currentDraft.gameSlot,
              ) ?? null)
            : null;

          if (currentDraft.gameSlot && !matchedSlotByGameNumber) {
            return currentDraft;
          }

          const matchedSlot =
            matchedSlotByGameNumber ??
            (currentStartTimeValue
              ? data.find((slot) => slot.start_time == currentStartTimeValue)
              : null) ??
            data.find((slot) => slot.is_current_slot) ??
            data[0] ??
            null;

          return {
            ...currentDraft,
            startTime: matchedSlot ? new Date(matchedSlot.start_time) : null,
            gameSlot: matchedSlot ? String(matchedSlot.slot_number) : "",
          };
        });
      } catch (error) {
        if (!isActive) {
          return;
        }

        setEditingAvailableScheduleSlots([]);
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os horários disponíveis.",
        );
      } finally {
        if (isActive) {
          setLoadingEditingAvailableScheduleSlots(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [
    editingMatchDraft?.awayTeamId,
    editingMatchDraft?.courtName,
    editingMatchDraft?.homeTeamId,
    editingMatchDraft?.location,
    editingMatchDraft?.naipe,
    editingMatchDraft?.scheduledDate,
    editingMatchDraft?.sportId,
    editingMatchId,
  ]);

  useEffect(() => {
    setSportId("");
    setHomeTeamId("");
    setAwayTeamId("");
    setSelectedGroupOptionValue("");
  }, [naipe]);

  const sportsForMatchesFilter = availableSports;

  const teamsForMatchesFilter = useMemo(() => {
    const teamIds = new Set<string>();

    matches.forEach((match) => {
      teamIds.add(match.home_team_id);
      teamIds.add(match.away_team_id);
    });

    return teams
      .filter((team) => teamIds.has(team.id))
      .sort((firstTeam, secondTeam) =>
        firstTeam.name.localeCompare(secondTeam.name),
      );
  }, [matches, teams]);

  const groupsForMatchesFilter = useMemo(() => {
    const allOptions = resolveChampionshipBracketGroupStageOptions(
      championshipBracketView,
    );

    const filteredOptions = allOptions.filter((option) => {
      const sportMatch =
        matchesSportFilter == ALL_MATCHES_SPORT_FILTER ||
        option.sport_id == matchesSportFilter;
      const naipeMatch =
        matchesNaipeFilter == ALL_MATCHES_NAIPE_FILTER ||
        option.naipe == matchesNaipeFilter;
      const divisionMatch =
        matchesDivisionFilter == ALL_MATCHES_DIVISION_FILTER ||
        option.division == matchesDivisionFilter;

      return sportMatch && naipeMatch && divisionMatch;
    });

    const uniqueGroups = new Map<string, string>();
    filteredOptions.forEach((option) => {
      const groupLabel = resolveChampionshipGroupLabel(option.group_number);
      uniqueGroups.set(groupLabel, groupLabel);
    });

    return [...uniqueGroups.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((firstGroupOption, secondGroupOption) =>
        firstGroupOption.label.localeCompare(secondGroupOption.label),
      );
  }, [
    championshipBracketView,
    matchesDivisionFilter,
    matchesNaipeFilter,
    matchesSportFilter,
  ]);

  const matchesFilteredByBaseCriteria = useMemo(() => {
    return matches.filter((match) => {
      if (match.is_pending_manual_relocation) {
        return false;
      }
      if (
        matchesSportFilter !== ALL_MATCHES_SPORT_FILTER &&
        match.sport_id != matchesSportFilter
      ) {
        return false;
      }

      if (
        matchesDateFilter != ALL_MATCHES_DATE_FILTER &&
        resolveMatchScheduledDateValue(match) != matchesDateFilter
      ) {
        return false;
      }

      if (isScoreSheetReviewMode && match.status != MatchStatus.FINISHED) {
        return false;
      }

      if (
        matchesStatusFilter == MATCHES_STATUS_FILTER_LIVE &&
        match.status != MatchStatus.LIVE
      ) {
        return false;
      }

      if (
        matchesStatusFilter == MATCHES_STATUS_FILTER_FINISHED &&
        match.status != MatchStatus.FINISHED
      ) {
        return false;
      }

      if (
        matchesStatusFilter == MATCHES_STATUS_FILTER_OPEN &&
        match.status != MatchStatus.SCHEDULED
      ) {
        return false;
      }

      if (matchesTeamFilter !== ALL_MATCHES_TEAM_FILTER) {
        const isHomeTeamMatch = match.home_team_id == matchesTeamFilter;
        const isAwayTeamMatch = match.away_team_id == matchesTeamFilter;

        if (!isHomeTeamMatch && !isAwayTeamMatch) {
          return false;
        }
      }

      if (
        matchesNaipeFilter !== ALL_MATCHES_NAIPE_FILTER &&
        match.naipe != matchesNaipeFilter
      ) {
        return false;
      }

      if (
        championshipUsesDivisions &&
        matchesDivisionFilter != ALL_MATCHES_DIVISION_FILTER &&
        match.division != matchesDivisionFilter
      ) {
        return false;
      }

      if (matchesGroupFilter != ALL_MATCHES_GROUP_FILTER) {
        const matchBracketContext = matchBracketContextByMatchId[match.id];

        if (
          !matchBracketContext ||
          matchBracketContext.groupFilterValue != matchesGroupFilter
        ) {
          return false;
        }
      }

      if (
        isScoreSheetReviewMode &&
        hideReviewedMatches &&
        match.is_score_sheet_reviewed
      ) {
        return false;
      }

      return true;
    });
  }, [
    championshipUsesDivisions,
    hideReviewedMatches,
    isScoreSheetReviewMode,
    matchBracketContextByMatchId,
    matches,
    matchesDateFilter,
    matchesDivisionFilter,
    matchesGroupFilter,
    matchesNaipeFilter,
    matchesSportFilter,
    matchesStatusFilter,
    matchesTeamFilter,
  ]);

  const individualSessionsFilteredByBaseCriteria = useMemo(() => {
    if (isScoreSheetReviewMode || isTieBreaksMode) {
      return [];
    }

    return individualSessions.filter((session) => {
      if (
        matchesSportFilter != ALL_MATCHES_SPORT_FILTER &&
        session.sport_id != matchesSportFilter
      ) {
        return false;
      }

      if (
        matchesDateFilter != ALL_MATCHES_DATE_FILTER &&
        session.scheduled_date?.slice(0, 10) != matchesDateFilter
      ) {
        return false;
      }

      if (
        matchesStatusFilter == MATCHES_STATUS_FILTER_LIVE &&
        session.status != ChampionshipIndividualSessionStatus.LIVE
      ) {
        return false;
      }

      if (
        matchesStatusFilter == MATCHES_STATUS_FILTER_FINISHED &&
        session.status != ChampionshipIndividualSessionStatus.FINISHED
      ) {
        return false;
      }

      if (
        matchesStatusFilter == MATCHES_STATUS_FILTER_OPEN &&
        session.status != ChampionshipIndividualSessionStatus.DRAFT &&
        session.status != ChampionshipIndividualSessionStatus.SCHEDULED
      ) {
        return false;
      }

      if (
        matchesNaipeFilter != ALL_MATCHES_NAIPE_FILTER &&
        session.naipe != matchesNaipeFilter
      ) {
        return false;
      }

      if (
        championshipUsesDivisions &&
        matchesDivisionFilter != ALL_MATCHES_DIVISION_FILTER &&
        session.division != matchesDivisionFilter
      ) {
        return false;
      }

      return matchesGroupFilter == ALL_MATCHES_GROUP_FILTER;
    });
  }, [
    championshipUsesDivisions,
    individualSessions,
    isScoreSheetReviewMode,
    isTieBreaksMode,
    matchesDivisionFilter,
    matchesDateFilter,
    matchesGroupFilter,
    matchesNaipeFilter,
    matchesSportFilter,
    matchesStatusFilter,
  ]);

  const availableNaipeOptions = useMemo(() => {
    const availableNaipes = new Set<MatchNaipe>();

    matches.forEach((match) => {
      if (
        matchesSportFilter == ALL_MATCHES_SPORT_FILTER ||
        match.sport_id == matchesSportFilter
      ) {
        availableNaipes.add(match.naipe);
      }
    });

    individualSessions.forEach((session) => {
      if (
        matchesSportFilter == ALL_MATCHES_SPORT_FILTER ||
        session.sport_id == matchesSportFilter
      ) {
        availableNaipes.add(session.naipe);
      }
    });

    return NAIPE_OPTIONS.filter((naipeOption) =>
      availableNaipes.has(naipeOption),
    );
  }, [individualSessions, matches, matchesSportFilter]);

  const locationsForMatchesFilter = useMemo(() => {
    return [
      ...new Set(
        [
          ...matchesFilteredByBaseCriteria.map((match) => match.location),
          ...individualSessionsFilteredByBaseCriteria.map(
            (session) => session.location_name,
          ),
        ].filter((location): location is string => Boolean(location)),
      ),
    ].sort((firstLocation, secondLocation) =>
      firstLocation.localeCompare(secondLocation),
    );
  }, [individualSessionsFilteredByBaseCriteria, matchesFilteredByBaseCriteria]);

  const courtsForMatchesFilter = useMemo(() => {
    const uniqueCourtNames = new Set<string>();

    matchesFilteredByBaseCriteria.forEach((match) => {
      if (!match.court_name) {
        return;
      }

      if (
        matchesLocationFilter != ALL_MATCHES_LOCATION_FILTER &&
        match.location != matchesLocationFilter
      ) {
        return;
      }

      uniqueCourtNames.add(match.court_name);
    });

    individualSessionsFilteredByBaseCriteria.forEach((session) => {
      if (!session.court_name) {
        return;
      }

      if (
        matchesLocationFilter != ALL_MATCHES_LOCATION_FILTER &&
        session.location_name != matchesLocationFilter
      ) {
        return;
      }

      uniqueCourtNames.add(session.court_name);
    });

    return [...uniqueCourtNames].sort((firstCourtName, secondCourtName) =>
      firstCourtName.localeCompare(secondCourtName),
    );
  }, [
    individualSessionsFilteredByBaseCriteria,
    matchesFilteredByBaseCriteria,
    matchesLocationFilter,
  ]);

  const championshipBracketGroupStageOptions = useMemo(() => {
    return resolveChampionshipBracketGroupStageOptions(championshipBracketView);
  }, [championshipBracketView]);

  const createMatchGroupOptions = useMemo(() => {
    const resolvedDivision = championshipUsesDivisions ? division : null;

    return championshipBracketGroupStageOptions.filter((groupOption) => {
      return (
        groupOption.sport_id == sportId &&
        groupOption.naipe == naipe &&
        groupOption.division == resolvedDivision
      );
    });
  }, [
    championshipBracketGroupStageOptions,
    championshipUsesDivisions,
    division,
    naipe,
    sportId,
  ]);

  const selectedCreateGroupOption = useMemo(() => {
    if (!selectedGroupOptionValue) {
      return null;
    }

    return (
      createMatchGroupOptions.find(
        (groupOption) => groupOption.value == selectedGroupOptionValue,
      ) ?? null
    );
  }, [createMatchGroupOptions, selectedGroupOptionValue]);

  const eligibleTeams = useMemo(() => {
    if (selectedCreateGroupOption) {
      const selectedCreateGroupTeamIdSet = new Set(
        selectedCreateGroupOption.team_ids,
      );

      return teamsAllowedForMatches.filter((team) =>
        selectedCreateGroupTeamIdSet.has(team.id),
      );
    }

    if (!championshipUsesDivisions) {
      return teamsAllowedForMatches;
    }

    return teamsAllowedForMatches.filter((team) => team.division === division);
  }, [
    championshipUsesDivisions,
    division,
    selectedCreateGroupOption,
    teamsAllowedForMatches,
  ]);

  const groupStageMatchBracketBindingByMatchId = useMemo(() => {
    return resolveGroupStageMatchBindingByMatchId(championshipBracketView);
  }, [championshipBracketView]);

  const knockoutMatchBindingByMatchId = useMemo(() => {
    return championshipBracketView.competitions.reduce<
      Record<string, KnockoutMatchBinding>
    >((carry, competition) => {
      competition.knockout_matches.forEach((knockoutMatch) => {
        if (!knockoutMatch.match_id) {
          return;
        }

        carry[knockoutMatch.match_id] = {
          competition,
          round_number: knockoutMatch.round_number,
          slot_number: knockoutMatch.slot_number,
          is_third_place: knockoutMatch.is_third_place,
        };
      });

      return carry;
    }, {});
  }, [championshipBracketView.competitions]);

  const editingMatch = useMemo(() => {
    if (!editingMatchId) {
      return null;
    }

    return matches.find((match) => match.id == editingMatchId) ?? null;
  }, [editingMatchId, matches]);

  const editingHomeTeamName =
    teams.find((team) => team.id == editingMatchDraft?.homeTeamId)?.name ??
    editingMatch?.home_team?.name ??
    "Casa";
  const editingAwayTeamName =
    teams.find((team) => team.id == editingMatchDraft?.awayTeamId)?.name ??
    editingMatch?.away_team?.name ??
    "Visitante";

  const editingMatchBracketBinding = useMemo(() => {
    if (!editingMatchId) {
      return null;
    }

    return groupStageMatchBracketBindingByMatchId[editingMatchId] ?? null;
  }, [editingMatchId, groupStageMatchBracketBindingByMatchId]);

  const editingKnockoutMatchBinding = useMemo(() => {
    if (!editingMatchId) {
      return null;
    }

    return knockoutMatchBindingByMatchId[editingMatchId] ?? null;
  }, [editingMatchId, knockoutMatchBindingByMatchId]);

  const editingKnockoutMatchSourceLabels = useMemo(() => {
    return resolveKnockoutMatchSourceLabels(editingKnockoutMatchBinding);
  }, [editingKnockoutMatchBinding]);

  const editingMatchGroupOptions = useMemo(() => {
    if (!editingMatchDraft) {
      return [];
    }

    const resolvedDivision = championshipUsesDivisions
      ? editingMatchDraft.division
      : null;

    return championshipBracketGroupStageOptions.filter((groupOption) => {
      return (
        groupOption.sport_id == editingMatchDraft.sportId &&
        groupOption.naipe == editingMatchDraft.naipe &&
        groupOption.division == resolvedDivision
      );
    });
  }, [
    championshipBracketGroupStageOptions,
    championshipUsesDivisions,
    editingMatchDraft,
  ]);

  const selectedEditingGroupOption = useMemo(() => {
    if (!editingMatchDraft?.selectedGroupOptionValue) {
      return null;
    }

    return (
      editingMatchGroupOptions.find(
        (groupOption) =>
          groupOption.value == editingMatchDraft.selectedGroupOptionValue,
      ) ?? null
    );
  }, [editingMatchDraft, editingMatchGroupOptions]);

  const editingAllowedStatuses = useMemo(() => {
    if (!editingMatch) {
      return [];
    }

    return resolveAllowedEditingStatuses(editingMatch.status);
  }, [editingMatch]);

  const editingShouldUseSocietyPenaltyShootout = useMemo(() => {
    if (!editingMatch || !editingMatchDraft) {
      return false;
    }

    return shouldUseSocietyPenaltyShootout({
      championship: selectedChampionship,
      bracketContext: matchBracketContextByMatchId[editingMatch.id] ?? null,
      status: editingMatchDraft.status,
      homeScore: editingMatchDraft.homeScore,
      awayScore: editingMatchDraft.awayScore,
    });
  }, [
    editingMatch,
    editingMatchDraft,
    matchBracketContextByMatchId,
    selectedChampionship,
  ]);

  useEffect(() => {
    if (!editingShouldUseSocietyPenaltyShootout) {
      setEditingMatchDraft((currentDraft) => {
        if (!currentDraft) {
          return currentDraft;
        }

        if (
          currentDraft.homePenaltyScore == null &&
          currentDraft.awayPenaltyScore == null
        ) {
          return currentDraft;
        }

        return {
          ...currentDraft,
          homePenaltyScore: null,
          awayPenaltyScore: null,
        };
      });
    }
  }, [editingShouldUseSocietyPenaltyShootout]);

  const canEditScheduledMatchSetup =
    editingMatch?.status == MatchStatus.SCHEDULED &&
    editingMatchDraft?.status == MatchStatus.SCHEDULED;

  const eligibleTeamsForEditingMatch = useMemo(() => {
    if (!editingMatchDraft) {
      return teamsAllowedForMatches;
    }

    if (selectedEditingGroupOption) {
      const selectedGroupTeamIdSet = new Set(
        selectedEditingGroupOption.team_ids,
      );

      return teamsAllowedForMatches.filter((team) =>
        selectedGroupTeamIdSet.has(team.id),
      );
    }

    if (!championshipUsesDivisions) {
      return teamsAllowedForMatches;
    }

    if (editingMatchDraft.division == null) {
      return teamsAllowedForMatches;
    }

    return teamsAllowedForMatches.filter(
      (team) => team.division === editingMatchDraft.division,
    );
  }, [
    championshipUsesDivisions,
    editingMatchDraft,
    selectedEditingGroupOption,
    teamsAllowedForMatches,
  ]);

  // match_id → competition_id para matches do primeiro round do KO (MAX round_number)
  const knockoutFirstRoundBracketMatchByMatchId = useMemo(() => {
    const map: Record<string, { competition_id: string }> = {};
    for (const competition of championshipBracketView.competitions ?? []) {
      const maxRound = Math.max(
        0,
        ...(competition.knockout_matches ?? []).map((km) => km.round_number),
      );
      if (maxRound === 0) continue;
      for (const km of competition.knockout_matches ?? []) {
        if (km.round_number === maxRound && km.match_id) {
          map[km.match_id] = { competition_id: competition.id };
        }
      }
    }
    return map;
  }, [championshipBracketView]);

  // competition_id → Set de team_ids no primeiro round do KO
  const knockoutFirstRoundTeamIdsByCompetitionId = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const competition of championshipBracketView.competitions ?? []) {
      const maxRound = Math.max(
        0,
        ...(competition.knockout_matches ?? []).map((km) => km.round_number),
      );
      if (maxRound === 0) continue;
      const teamSet = new Set<string>();
      for (const km of competition.knockout_matches ?? []) {
        if (km.round_number !== maxRound) continue;
        if (km.home_team_id) teamSet.add(km.home_team_id);
        if (km.away_team_id) teamSet.add(km.away_team_id);
      }
      map[competition.id] = teamSet;
    }
    return map;
  }, [championshipBracketView]);

  const pendingTieBreakTeamNameByContextKeyAndTeamId = useMemo(() => {
    return pendingTieBreakContexts.reduce<
      Record<string, Record<string, string>>
    >((carry, pendingTieBreakContext) => {
      carry[pendingTieBreakContext.context_key] =
        pendingTieBreakContext.teams.reduce<Record<string, string>>(
          (teamCarry, team) => {
            teamCarry[team.team_id] = team.team_name;
            return teamCarry;
          },
          {},
        );
      return carry;
    }, {});
  }, [pendingTieBreakContexts]);

  const isTieBreakResolutionReady = useMemo(() => {
    if (pendingTieBreakContexts.length == 0) {
      return false;
    }

    return pendingTieBreakContexts.every((pendingTieBreakContext) => {
      return resolveIsTieBreakTeamOrderReady(
        pendingTieBreakContext,
        draftTieBreakTeamIdsByContextKey[pendingTieBreakContext.context_key],
      );
    });
  }, [draftTieBreakTeamIdsByContextKey, pendingTieBreakContexts]);

  const shouldShowTieBreakBanner = useMemo(() => {
    return (
      !isScoreSheetReviewMode &&
      !isTieBreaksMode &&
      pendingTieBreakContexts.length > 0
    );
  }, [isScoreSheetReviewMode, isTieBreaksMode, pendingTieBreakContexts.length]);
  const isAnyTieBreakResolutionSaveInFlight =
    savingTieBreakResolutions ||
    Object.values(savingTieBreakResolutionByContextKey).some(
      (isSaving) => isSaving,
    );

  const isSavingReviewState =
    Object.keys(savingReviewStateByMatchId).length > 0;
  const correctedStandingByCompetitionAndTeamKey = useMemo(() => {
    return correctedGroupStandings.reduce<
      Record<string, ChampionshipCorrectedGroupStanding>
    >((carry, correctedGroupStanding) => {
      carry[
        `${correctedGroupStanding.competition_id}:${correctedGroupStanding.team_id}`
      ] = correctedGroupStanding;
      return carry;
    }, {});
  }, [correctedGroupStandings]);

  const pendingSwapSourceMatch = useMemo(() => {
    if (!pendingSwapSourceMatchId) {
      return null;
    }

    return (
      matches.find((match) => match.id == pendingSwapSourceMatchId) ?? null
    );
  }, [matches, pendingSwapSourceMatchId]);

  const activeScoreSheetReviewMatch = useMemo(() => {
    if (!activeScoreSheetReviewMatchId) {
      return null;
    }

    return (
      matches.find((match) => match.id == activeScoreSheetReviewMatchId) ?? null
    );
  }, [activeScoreSheetReviewMatchId, matches]);

  const activeScoreSheetAwardsDraft = activeScoreSheetReviewMatchId
    ? scoreSheetAwardsDraftByMatchId[activeScoreSheetReviewMatchId]
    : undefined;

  const isLoadingActiveScoreSheetAwardsContext =
    activeScoreSheetReviewMatchId != null &&
    loadingScoreSheetAwardsByMatchId[activeScoreSheetReviewMatchId] == true;
  const isSavingActiveScoreSheetAwardsContext =
    activeScoreSheetReviewMatchId != null &&
    savingScoreSheetAwardsByMatchId[activeScoreSheetReviewMatchId] == true;
  const hasIncompleteActiveScoreSheetGoalSelections =
    !!activeScoreSheetAwardsDraft &&
    !activeScoreSheetAwardsDraft.isWalkover &&
    activeScoreSheetAwardsDraft.requiresGoalScorers &&
    (activeScoreSheetAwardsDraft.homeGoalSelections.some(
      (goalSelection) => goalSelection.scorerId.trim().length == 0,
    ) ||
      activeScoreSheetAwardsDraft.awayGoalSelections.some(
        (goalSelection) => goalSelection.scorerId.trim().length == 0,
      ));
  const hasIncompleteActiveScoreSheetDisciplineSelections =
    !!activeScoreSheetAwardsDraft &&
    !activeScoreSheetAwardsDraft.isWalkover &&
    [
      activeScoreSheetAwardsDraft.homeYellowCardSelections,
      activeScoreSheetAwardsDraft.awayYellowCardSelections,
      activeScoreSheetAwardsDraft.homeRedCardSelections,
      activeScoreSheetAwardsDraft.awayRedCardSelections,
      activeScoreSheetAwardsDraft.homeBlueCardSelections,
      activeScoreSheetAwardsDraft.awayBlueCardSelections,
    ].some((selections) =>
      selections.some(
        (selection) => selection.scorerId.trim().length == 0,
      ),
    );
  const hasActiveScoreSheetYellowCardAccumulation =
    !!activeScoreSheetAwardsDraft &&
    [
      activeScoreSheetAwardsDraft.homeYellowCardSelections,
      activeScoreSheetAwardsDraft.awayYellowCardSelections,
    ].some((selections) => {
      const selectionCounts = new Map<string, number>();

      selections.forEach((selection) => {
        if (selection.scorerId.trim().length == 0) {
          return;
        }

        selectionCounts.set(
          selection.scorerId,
          (selectionCounts.get(selection.scorerId) ?? 0) + 1,
        );
      });

      return [...selectionCounts.values()].some((count) => count >= 2);
    });
  const activeScoreSheetGoalSelectionSummary = useMemo(() => {
    if (
      !activeScoreSheetAwardsDraft ||
      activeScoreSheetAwardsDraft.isWalkover ||
      !activeScoreSheetAwardsDraft.requiresGoalScorers
    ) {
      return {
        totalGoals: 0,
        filledGoals: 0,
        pendingGoals: 0,
      };
    }

    const allSelections = [
      ...activeScoreSheetAwardsDraft.homeGoalSelections,
      ...activeScoreSheetAwardsDraft.awayGoalSelections,
    ];
    const totalGoals = allSelections.length;
    const filledGoals = allSelections.filter(
      (goalSelection) => goalSelection.scorerId.trim().length > 0,
    ).length;

    return {
      totalGoals,
      filledGoals,
      pendingGoals: totalGoals - filledGoals,
    };
  }, [activeScoreSheetAwardsDraft]);

  const eligibleSwapTargetMatchOptions = useMemo(() => {
    if (!pendingSwapSourceMatch) {
      return [];
    }

    return eligibleSwapTargetMatchCandidates
      .sort((firstMatch, secondMatch) => {
        const firstScheduledDate = firstMatch.scheduled_date ?? "9999-12-31";
        const secondScheduledDate = secondMatch.scheduled_date ?? "9999-12-31";

        if (firstScheduledDate != secondScheduledDate) {
          return firstScheduledDate.localeCompare(secondScheduledDate);
        }

        const firstSlot =
          resolveMatchSwapDisplaySlot(firstMatch, true) ??
          Number.MAX_SAFE_INTEGER;
        const secondSlot =
          resolveMatchSwapDisplaySlot(secondMatch, true) ??
          Number.MAX_SAFE_INTEGER;

        if (firstSlot != secondSlot) {
          return firstSlot - secondSlot;
        }

        const firstStartTime = firstMatch.start_time ?? "";
        const secondStartTime = secondMatch.start_time ?? "";

        if (firstStartTime != secondStartTime) {
          return firstStartTime.localeCompare(secondStartTime);
        }

        if (firstMatch.created_at != secondMatch.created_at) {
          return firstMatch.created_at.localeCompare(secondMatch.created_at);
        }

        return firstMatch.match_id.localeCompare(secondMatch.match_id);
      })
      .map((match) => ({
        id: match.match_id,
        usesReducedCrossSportRestGap: match.uses_reduced_cross_sport_rest_gap,
        label: resolveMatchSwapOptionLabel({
          match: {
            scheduled_date: match.scheduled_date,
            start_time: match.start_time,
            queue_position: match.queue_position,
            scheduled_slot: match.scheduled_slot,
            home_team: match.home_team_name
              ? {
                  id: "",
                  name: match.home_team_name,
                  city: "",
                  division: null,
                  created_at: "",
                }
              : undefined,
            away_team: match.away_team_name
              ? {
                  id: "",
                  name: match.away_team_name,
                  city: "",
                  division: null,
                  created_at: "",
                }
              : undefined,
          },
          shouldUseScheduledSlot: true,
          displaySlot: visualQueuePositionByMatchId[match.match_id],
        }),
      }));
  }, [
    eligibleSwapTargetMatchCandidates,
    pendingSwapSourceMatch,
    visualQueuePositionByMatchId,
  ]);

  const knockoutDisplayMatchNumberById = useMemo(
    () =>
      resolveKnockoutDisplayMatchNumberById(
        championshipBracketView,
        matches,
      ),
    [championshipBracketView, matches],
  );

  const eligibleKnockoutScheduleSwapOptions = useMemo(() => {
    return [...eligibleKnockoutScheduleSwapCandidates]
      .sort((firstCandidate, secondCandidate) => {
        const firstDate = firstCandidate.scheduled_date ?? "9999-12-31";
        const secondDate = secondCandidate.scheduled_date ?? "9999-12-31";

        if (firstDate != secondDate) {
          return firstDate.localeCompare(secondDate);
        }

        const firstSlot =
          firstCandidate.scheduled_slot ??
          firstCandidate.queue_position ??
          Number.MAX_SAFE_INTEGER;
        const secondSlot =
          secondCandidate.scheduled_slot ??
          secondCandidate.queue_position ??
          Number.MAX_SAFE_INTEGER;

        if (firstSlot != secondSlot) {
          return firstSlot - secondSlot;
        }

        return firstCandidate.bracket_match_id.localeCompare(
          secondCandidate.bracket_match_id,
        );
      })
      .map((candidate) => ({
        id: candidate.bracket_match_id,
        label: resolveKnockoutScheduleSwapOptionLabel(
          candidate,
          knockoutDisplayMatchNumberById[candidate.bracket_match_id] ?? null,
        ),
      }));
  }, [eligibleKnockoutScheduleSwapCandidates, knockoutDisplayMatchNumberById]);

  const operationalVisualQueuePositionByMatchId = useMemo(() => {
    return resolveVisualQueuePositionByMatchId(
      matches.filter((match) => !match.is_pending_manual_relocation),
      matches.filter((match) => !match.is_pending_manual_relocation),
      estimatedStartTimeByMatchId,
    );
  }, [estimatedStartTimeByMatchId, matches]);

  const pendingManualRelocationMatches = useMemo(() => {
    return matches
      .filter((match) => match.is_pending_manual_relocation)
      .sort((firstMatch, secondMatch) =>
        firstMatch.created_at.localeCompare(secondMatch.created_at),
      );
  }, [matches]);

  const pendingManualRelocationMatchGroups = useMemo(() => {
    const groupsBySportAndNaipe = new Map<
      string,
      {
        sportId: string;
        sportName: string;
        naipe: MatchNaipe;
        matches: Match[];
      }
    >();

    pendingManualRelocationMatches.forEach((match) => {
      const key = `${match.sport_id}:${match.naipe}`;
      const group = groupsBySportAndNaipe.get(key);

      if (group) {
        group.matches.push(match);
        return;
      }

      groupsBySportAndNaipe.set(key, {
        sportId: match.sport_id,
        sportName: match.sports?.name ?? "Modalidade",
        naipe: match.naipe,
        matches: [match],
      });
    });

    return [...groupsBySportAndNaipe.values()].sort((firstGroup, secondGroup) => {
      const sportComparison = firstGroup.sportName.localeCompare(
        secondGroup.sportName,
      );

      if (sportComparison != 0) {
        return sportComparison;
      }

      return NAIPE_OPTIONS.indexOf(firstGroup.naipe) - NAIPE_OPTIONS.indexOf(secondGroup.naipe);
    });
  }, [pendingManualRelocationMatches]);

  const filteredAndSortedMatches = useMemo(() => {
    return [...matchesFilteredByBaseCriteria]
      .filter((match) => {
        if (
          matchesLocationFilter != ALL_MATCHES_LOCATION_FILTER &&
          match.location != matchesLocationFilter
        ) {
          return false;
        }

        if (
          matchesCourtFilter != ALL_MATCHES_COURT_FILTER &&
          match.court_name != matchesCourtFilter
        ) {
          return false;
        }

        return true;
      })
      .sort((firstMatch, secondMatch) =>
        compareAdminMatchCardOrder(firstMatch, secondMatch, {
          estimatedStartTimeByMatchId,
          visualQueuePositionByMatchId: operationalVisualQueuePositionByMatchId,
        }),
      );
  }, [
    estimatedStartTimeByMatchId,
    matchesCourtFilter,
    matchesFilteredByBaseCriteria,
    matchesLocationFilter,
    operationalVisualQueuePositionByMatchId,
  ]);

  const knockoutPlaceholders = useMemo(() => {
    return resolveAdminMatchesKnockoutPlaceholders({
      championshipBracketView,
      matchesForMatchNumbering: matches,
      sportId:
        matchesSportFilter == ALL_MATCHES_SPORT_FILTER
          ? null
          : matchesSportFilter,
      scheduledDate:
        matchesDateFilter == ALL_MATCHES_DATE_FILTER
          ? null
          : matchesDateFilter,
      naipe:
        matchesNaipeFilter == ALL_MATCHES_NAIPE_FILTER
          ? null
          : (matchesNaipeFilter as MatchNaipe),
      division:
        !championshipUsesDivisions ||
        matchesDivisionFilter == ALL_MATCHES_DIVISION_FILTER
          ? null
          : (matchesDivisionFilter as TeamDivision),
      location:
        matchesLocationFilter == ALL_MATCHES_LOCATION_FILTER
          ? null
          : matchesLocationFilter,
      courtName:
        matchesCourtFilter == ALL_MATCHES_COURT_FILTER
          ? null
          : matchesCourtFilter,
      shouldIncludeScheduledItems:
        !isScoreSheetReviewMode &&
        !isTieBreaksMode &&
        matchesStatusFilter != MATCHES_STATUS_FILTER_LIVE &&
        matchesStatusFilter != MATCHES_STATUS_FILTER_FINISHED,
      shouldExcludePlaceholdersForTeamOrGroupFilter:
        matchesTeamFilter != ALL_MATCHES_TEAM_FILTER ||
        matchesGroupFilter != ALL_MATCHES_GROUP_FILTER,
    });
  }, [
    championshipBracketView,
    championshipUsesDivisions,
    isScoreSheetReviewMode,
    isTieBreaksMode,
    matchesCourtFilter,
    matchesDateFilter,
    matchesDivisionFilter,
    matchesGroupFilter,
    matchesLocationFilter,
    matchesNaipeFilter,
    matchesSportFilter,
    matchesStatusFilter,
    matchesTeamFilter,
    matches,
  ]);

  const scheduledListItems = useMemo(() => {
    return resolveAdminMatchesScheduleItems({
      matches: filteredAndSortedMatches,
      placeholders: knockoutPlaceholders,
      estimatedStartTimeByMatchId,
    });
  }, [
    estimatedStartTimeByMatchId,
    filteredAndSortedMatches,
    knockoutPlaceholders,
  ]);

  const visibleIndividualSessions = useMemo(() => {
    return individualSessionsFilteredByBaseCriteria.filter((session) => {
      if (
        matchesLocationFilter != ALL_MATCHES_LOCATION_FILTER &&
        session.location_name != matchesLocationFilter
      ) {
        return false;
      }

      if (
        matchesCourtFilter != ALL_MATCHES_COURT_FILTER &&
        session.court_name != matchesCourtFilter
      ) {
        return false;
      }

      return session.status != ChampionshipIndividualSessionStatus.CANCELLED;
    });
  }, [
    individualSessionsFilteredByBaseCriteria,
    matchesCourtFilter,
    matchesLocationFilter,
  ]);

  useEffect(() => {
    if (!showSwapMatchDialog || !pendingSwapSourceMatch) {
      setEligibleSwapTargetMatchCandidates([]);
      setLoadingSwapTargetMatchOptions(false);
      return;
    }

    let shouldIgnore = false;

    setLoadingSwapTargetMatchOptions(true);

    void (async () => {
      const { data, error } = await supabase.rpc(
        "list_match_queue_swap_candidates",
        {
          _source_match_id: pendingSwapSourceMatch.id,
        },
      );

      if (shouldIgnore) {
        return;
      }

      if (error) {
        setEligibleSwapTargetMatchCandidates([]);
        setLoadingSwapTargetMatchOptions(false);
        toast.error(resolveAdminMatchesOperationalErrorMessage(error));
        return;
      }

      const candidateRows = Array.isArray(data)
        ? (data as ListMatchQueueSwapCandidatesResponseItem[])
        : [];

      setEligibleSwapTargetMatchCandidates(candidateRows);
      setLoadingSwapTargetMatchOptions(false);
    })();

    return () => {
      shouldIgnore = true;
    };
  }, [pendingSwapSourceMatch, showSwapMatchDialog]);

  useEffect(() => {
    if (
      !showKnockoutScheduleSwapDialog ||
      !pendingKnockoutScheduleSwapSource
    ) {
      setEligibleKnockoutScheduleSwapCandidates([]);
      setLoadingKnockoutScheduleSwapCandidates(false);
      return;
    }

    let shouldIgnore = false;

    setLoadingKnockoutScheduleSwapCandidates(true);

    void (async () => {
      const { data, error } = await supabaseLoose.rpc(
        "list_knockout_schedule_swap_candidates",
        {
          _source_bracket_match_id: pendingKnockoutScheduleSwapSource.id,
        },
      );

      if (shouldIgnore) {
        return;
      }

      if (error) {
        setEligibleKnockoutScheduleSwapCandidates([]);
        setLoadingKnockoutScheduleSwapCandidates(false);
        toast.error(resolveAdminMatchesOperationalErrorMessage(error));
        return;
      }

      setEligibleKnockoutScheduleSwapCandidates(
        Array.isArray(data)
          ? (data as ListKnockoutScheduleSwapCandidatesResponseItem[])
          : [],
      );
      setLoadingKnockoutScheduleSwapCandidates(false);
    })();

    return () => {
      shouldIgnore = true;
    };
  }, [
    pendingKnockoutScheduleSwapSource,
    showKnockoutScheduleSwapDialog,
  ]);

  useEffect(() => {
    if (!pendingSwapTargetMatchId) {
      return;
    }

    const isTargetMatchOptionAvailable = eligibleSwapTargetMatchOptions.some(
      (option) => option.id == pendingSwapTargetMatchId,
    );

    if (!isTargetMatchOptionAvailable) {
      setPendingSwapTargetMatchId("");
    }
  }, [eligibleSwapTargetMatchOptions, pendingSwapTargetMatchId]);

  useEffect(() => {
    if (!pendingKnockoutScheduleSwapTargetId) {
      return;
    }

    if (
      !eligibleKnockoutScheduleSwapOptions.some(
        (option) => option.id == pendingKnockoutScheduleSwapTargetId,
      )
    ) {
      setPendingKnockoutScheduleSwapTargetId("");
    }
  }, [
    eligibleKnockoutScheduleSwapOptions,
    pendingKnockoutScheduleSwapTargetId,
  ]);

  const filteredMatchIds = useMemo(() => {
    return filteredAndSortedMatches.map((match) => match.id);
  }, [filteredAndSortedMatches]);

  const selectedMatchesForManualRelocation = useMemo(() => {
    const selectedMatchIdSet = new Set([
      ...selectedMatchIds,
      ...selectedPendingManualRelocationMatchIds,
    ]);

    return matches
      .filter((match) => selectedMatchIdSet.has(match.id))
      .sort((firstMatch, secondMatch) => {
        const firstDate = resolveMatchScheduledDateValue(firstMatch) ?? "9999-12-31";
        const secondDate = resolveMatchScheduledDateValue(secondMatch) ?? "9999-12-31";

        if (firstDate != secondDate) {
          return firstDate.localeCompare(secondDate);
        }

        return (
          resolveMatchScheduleMoveSortValue(firstMatch, shouldUseScheduledSlotInMatchList) -
          resolveMatchScheduleMoveSortValue(secondMatch, shouldUseScheduledSlotInMatchList)
        );
      });
  }, [
    matches,
    selectedMatchIds,
    selectedPendingManualRelocationMatchIds,
    shouldUseScheduledSlotInMatchList,
  ]);

  const selectedPendingMatchesForDayScheduleReorganization = useMemo(() => {
    const selectedMatchIdSet = new Set(selectedPendingManualRelocationMatchIds);

    return matches
      .filter((match) => selectedMatchIdSet.has(match.id))
      .sort((firstMatch, secondMatch) => {
        const firstStart = String(
          resolvePendingManualRelocationScheduleValue(firstMatch, "start_time") ??
            "9999-12-31T23:59:59",
        );
        const secondStart = String(
          resolvePendingManualRelocationScheduleValue(secondMatch, "start_time") ??
            "9999-12-31T23:59:59",
        );

        if (firstStart != secondStart) {
          return firstStart.localeCompare(secondStart);
        }

        return (
          Number(
            resolvePendingManualRelocationScheduleValue(
              firstMatch,
              "scheduled_slot",
            ) ??
              resolvePendingManualRelocationScheduleValue(
                firstMatch,
                "queue_position",
              ) ??
              0,
          ) -
          Number(
            resolvePendingManualRelocationScheduleValue(
              secondMatch,
              "scheduled_slot",
            ) ??
              resolvePendingManualRelocationScheduleValue(
                secondMatch,
                "queue_position",
              ) ??
              0,
          )
        );
      });
  }, [matches, selectedPendingManualRelocationMatchIds]);

  const dayScheduleReorganizationTargetDay = useMemo(() => {
    return (
      bracketCourtSportsDays.find(
        (scheduleDay) =>
          scheduleDay.event_date == dayScheduleReorganizationTargetDate,
      ) ?? null
    );
  }, [bracketCourtSportsDays, dayScheduleReorganizationTargetDate]);

  const dayScheduleReorganizationLocations = useMemo(() => {
    return dayScheduleReorganizationTargetDay?.locations ?? [];
  }, [dayScheduleReorganizationTargetDay]);

  const dayScheduleReorganizationCourts = useMemo(() => {
    const targetLocation = dayScheduleReorganizationLocations.find(
      (scheduleLocation) =>
        scheduleLocation.name == dayScheduleReorganizationTargetLocation,
    );
    const selectedSportIds = new Set(
      selectedPendingMatchesForDayScheduleReorganization.map(
        (match) => match.sport_id,
      ),
    );

    return (targetLocation?.courts ?? []).filter((court) =>
      [...selectedSportIds].every((sportId) =>
        court.sports.some((courtSport) => courtSport.sport_id == sportId),
      ),
    );
  }, [
    dayScheduleReorganizationLocations,
    dayScheduleReorganizationTargetLocation,
    selectedPendingMatchesForDayScheduleReorganization,
  ]);

  const dayScheduleReorganizationTargetLocationRecord = useMemo(() => {
    return (
      dayScheduleReorganizationLocations.find(
        (scheduleLocation) =>
          scheduleLocation.name == dayScheduleReorganizationTargetLocation,
      ) ?? null
    );
  }, [
    dayScheduleReorganizationLocations,
    dayScheduleReorganizationTargetLocation,
  ]);

  const dayScheduleReorganizationPreview = dayScheduleReorganizationManualPreview;

  const dayScheduleReorganizationHasRestConflicts = useMemo(
    () =>
      dayScheduleReorganizationPreview?.timeline.some(
        (item) => (item.rest_conflicts ?? []).length > 0,
      ) ?? false,
    [dayScheduleReorganizationPreview],
  );

  const dayScheduleReorganizationPlaceholdersById = useMemo(() => {
    const placeholders = resolveAdminMatchesKnockoutPlaceholders({
      championshipBracketView,
      matchesForMatchNumbering: matches,
      sportId: null,
      scheduledDate: dayScheduleReorganizationTargetDate || null,
      naipe: null,
      division: null,
      location: dayScheduleReorganizationTargetLocation || null,
      courtName: null,
      shouldIncludeScheduledItems: true,
      shouldExcludePlaceholdersForTeamOrGroupFilter: false,
    });

    return new Map(
      placeholders.map((placeholder) => [placeholder.id, placeholder]),
    );
  }, [
    championshipBracketView,
    dayScheduleReorganizationTargetDate,
    dayScheduleReorganizationTargetLocation,
    matches,
  ]);

  const dayScheduleReorganizationTimelineCourtColumns = useMemo(() => {
    if (!dayScheduleReorganizationPreview) {
      return [];
    }

    const timelineByCourtName = new Map<
      string,
      DayScheduleReorganizationTimelineDisplayItem[]
    >();

    dayScheduleReorganizationPreview.timeline.forEach((item) => {
      const courtTimeline = timelineByCourtName.get(item.court_name) ?? [];
      courtTimeline.push(item);
      timelineByCourtName.set(item.court_name, courtTimeline);
    });

    const targetDay = dayScheduleReorganizationSchedules.find(
      (scheduleDay) =>
        scheduleDay.event_date == dayScheduleReorganizationTargetDate,
    );
    const configuredCourts = [
      ...(dayScheduleReorganizationTargetLocationRecord?.courts ?? []),
    ].sort((firstCourt, secondCourt) => firstCourt.position - secondCourt.position);
    const previewBreak = dayScheduleReorganizationPreview.break;

    if (previewBreak.policy == "KEEP_BEFORE_KNOCKOUT") {
      targetDay?.breaks.forEach((breakItem) => {
        const usesPreviewPosition = previewBreak.before.id == breakItem.id;
        const startTime =
          usesPreviewPosition && previewBreak.after.start_time
            ? previewBreak.after.start_time
            : breakItem.break_start_time.slice(0, 5);
        const endTime =
          usesPreviewPosition && previewBreak.after.end_time
            ? previewBreak.after.end_time
            : breakItem.break_end_time.slice(0, 5);
        const courtNamesForBreak =
          breakItem.scope_type == "ALL_COURTS"
            ? configuredCourts.map((court) => court.name)
            : configuredCourts
                .filter((court) => court.id == breakItem.bracket_court_id)
                .map((court) => court.name);

        courtNamesForBreak.forEach((courtName) => {
          const courtTimeline = timelineByCourtName.get(courtName) ?? [];
          courtTimeline.push({
            item_type: "BREAK",
            item_id: `break-${breakItem.id}-${courtName}`,
            match_id: null,
            placeholder_id: null,
            label: "Intervalo",
            status: "SCHEDULED",
            start_time: `${dayScheduleReorganizationPreview.target_date}T${startTime}:00`,
            end_time: `${dayScheduleReorganizationPreview.target_date}T${endTime}:00`,
            location: dayScheduleReorganizationPreview.target_location,
            court_name: courtName,
            is_relocated: false,
            is_displaced:
              usesPreviewPosition &&
              (previewBreak.before.start_time != startTime ||
                previewBreak.before.end_time != endTime),
            is_fixed: true,
            rest_conflicts: [],
          });
          timelineByCourtName.set(courtName, courtTimeline);
        });
      });
    }

    const configuredCourtNameSet = new Set(
      configuredCourts.map((court) => court.name),
    );
    const courtNames = [
      ...configuredCourts.map((court) => court.name),
      ...[...timelineByCourtName.keys()]
        .filter((courtName) => !configuredCourtNameSet.has(courtName))
        .sort((firstCourtName, secondCourtName) =>
          firstCourtName.localeCompare(secondCourtName),
        ),
    ];

    return courtNames.map((courtName) => ({
      courtName,
      items: [...(timelineByCourtName.get(courtName) ?? [])].sort(
        (firstItem, secondItem) => {
          const firstStart = firstItem.start_time ?? "9999-12-31T23:59:59";
          const secondStart = secondItem.start_time ?? "9999-12-31T23:59:59";

          if (firstStart != secondStart) {
            return firstStart.localeCompare(secondStart);
          }

          return String(
            firstItem.item_id ?? firstItem.match_id ?? firstItem.placeholder_id,
          ).localeCompare(
            String(
              secondItem.item_id ??
                secondItem.match_id ??
                secondItem.placeholder_id,
            ),
          );
        },
      ),
    }));
  }, [
    dayScheduleReorganizationPreview,
    dayScheduleReorganizationSchedules,
    dayScheduleReorganizationTargetDate,
    dayScheduleReorganizationTargetLocationRecord,
  ]);

  const dayScheduleReorganizationBreak = useMemo(() => {
    const targetDay = dayScheduleReorganizationSchedules.find(
      (scheduleDay) =>
        scheduleDay.event_date == dayScheduleReorganizationTargetDate,
    );

    return (
      targetDay?.breaks.find((breakItem) => breakItem.scope_type == "ALL_COURTS") ??
      null
    );
  }, [
    dayScheduleReorganizationSchedules,
    dayScheduleReorganizationTargetDate,
  ]);

  const dayScheduleReorganizationTargetCourtBreaks = useMemo(() => {
    const targetDay = dayScheduleReorganizationSchedules.find(
      (scheduleDay) =>
        scheduleDay.event_date == dayScheduleReorganizationTargetDate,
    );
    const targetCourt = targetDay?.locations
      .find(
        (location) => location.name == dayScheduleReorganizationTargetLocation,
      )
      ?.courts.find(
        (court) => court.name == dayScheduleReorganizationTargetCourt,
      );

    if (!targetDay || !targetCourt) {
      return [];
    }

    return targetDay.breaks.filter(
      (breakItem) =>
        breakItem.scope_type == "COURT" &&
        breakItem.bracket_court_id == targetCourt.id,
    );
  }, [
    dayScheduleReorganizationSchedules,
    dayScheduleReorganizationTargetCourt,
    dayScheduleReorganizationTargetDate,
    dayScheduleReorganizationTargetLocation,
  ]);

  const dayScheduleReorganizationManagedBreak =
    dayScheduleReorganizationBreak ??
    dayScheduleReorganizationTargetCourtBreaks[0] ??
    null;

  const dayScheduleReorganizationRemovableResourceLock =
    dayScheduleReorganizationBreakPolicy == "REMOVE"
      ? dayScheduleReorganizationManagedBreak?.resource_lock ?? null
      : null;

  const manualRelocationTargetDay = useMemo(() => {
    return (
      bracketCourtSportsDays.find(
        (scheduleDay) => scheduleDay.event_date == manualRelocationTargetDate,
      ) ?? null
    );
  }, [bracketCourtSportsDays, manualRelocationTargetDate]);

  const manualRelocationLocations = useMemo(() => {
    return manualRelocationTargetDay?.locations ?? [];
  }, [manualRelocationTargetDay]);

  const manualRelocationCourts = useMemo(() => {
    const targetLocation = manualRelocationLocations.find(
      (scheduleLocation) => scheduleLocation.name == manualRelocationTargetLocation,
    );
    const selectedSportIds = new Set(
      selectedMatchesForManualRelocation.map((match) => match.sport_id),
    );

    return (targetLocation?.courts ?? []).filter((court) =>
      [...selectedSportIds].every((sportId) =>
        court.sports.some((courtSport) => courtSport.sport_id == sportId),
      ),
    );
  }, [
    manualRelocationLocations,
    manualRelocationTargetLocation,
    selectedMatchesForManualRelocation,
  ]);

  const manualRelocationSlotTargetDay = useMemo(() => {
    return (
      bracketCourtSportsDays.find(
        (scheduleDay) =>
          scheduleDay.event_date == manualRelocationSlotTargetDate,
      ) ?? null
    );
  }, [bracketCourtSportsDays, manualRelocationSlotTargetDate]);

  const manualRelocationSlotLocations = useMemo(() => {
    return manualRelocationSlotTargetDay?.locations ?? [];
  }, [manualRelocationSlotTargetDay]);

  const manualRelocationSlotCourts = useMemo(() => {
    if (!manualRelocationSlotMatch) {
      return [];
    }

    const targetLocation = manualRelocationSlotLocations.find(
      (scheduleLocation) =>
        scheduleLocation.name == manualRelocationSlotTargetLocation,
    );

    return (targetLocation?.courts ?? []).filter((court) =>
      court.sports.some(
        (courtSport) =>
          courtSport.sport_id == manualRelocationSlotMatch.sport_id,
      ),
    );
  }, [
    manualRelocationSlotLocations,
    manualRelocationSlotMatch,
    manualRelocationSlotTargetLocation,
  ]);

  const matchesTotalPages = Math.max(
    1,
    Math.ceil(scheduledListItems.length / matchesItemsPerPage),
  );

  const paginatedScheduledListItems = useMemo(() => {
    const rangeStart = (matchesCurrentPage - 1) * matchesItemsPerPage;
    const rangeEnd = rangeStart + matchesItemsPerPage;

    return scheduledListItems.slice(rangeStart, rangeEnd);
  }, [matchesCurrentPage, matchesItemsPerPage, scheduledListItems]);

  const selectedFilteredMatchCount = useMemo(() => {
    const filteredMatchIdSet = new Set(filteredMatchIds);

    return selectedMatchIds.filter((selectedMatchId) =>
      filteredMatchIdSet.has(selectedMatchId),
    ).length;
  }, [filteredMatchIds, selectedMatchIds]);

  const selectAllMatchesChecked: CheckedState =
    filteredMatchIds.length == 0
      ? false
      : selectedFilteredMatchCount == filteredMatchIds.length
        ? true
        : selectedFilteredMatchCount > 0
          ? "indeterminate"
          : false;

  useEffect(() => {
    setMatchesCurrentPage(1);
    setSelectedMatchIds([]);
  }, [
    hideReviewedMatches,
    matchesDivisionFilter,
    matchesDateFilter,
    matchesGroupFilter,
    matchesCourtFilter,
    matchesLocationFilter,
    matchesItemsPerPage,
    matchesNaipeFilter,
    matchesSportFilter,
    matchesStatusFilter,
    matchesTeamFilter,
  ]);

  useEffect(() => {
    if (!hasInitializedFilterRefetchRef.current) {
      hasInitializedFilterRefetchRef.current = true;
      return;
    }

    void onRefetch({ showFetching: true });

    const refetchConfirmationTimeout = setTimeout(() => {
      void onRefetch({ showFetching: true });
    }, 400);

    return () => {
      clearTimeout(refetchConfirmationTimeout);
    };
  }, [
    hideReviewedMatches,
    matchesDivisionFilter,
    matchesDateFilter,
    matchesGroupFilter,
    matchesCourtFilter,
    matchesLocationFilter,
    matchesNaipeFilter,
    matchesSportFilter,
    matchesStatusFilter,
    matchesTeamFilter,
    onRefetch,
  ]);

  useEffect(() => {
    if (!hasInitializedPaginationRefetchRef.current) {
      hasInitializedPaginationRefetchRef.current = true;
      return;
    }

    void onRefetch({ showFetching: true });

    const refetchConfirmationTimeout = setTimeout(() => {
      void onRefetch({ showFetching: true });
    }, 400);

    return () => {
      clearTimeout(refetchConfirmationTimeout);
    };
  }, [matchesCurrentPage, matchesItemsPerPage, onRefetch]);

  useEffect(() => {
    if (matchesCurrentPage > matchesTotalPages) {
      setMatchesCurrentPage(matchesTotalPages);
    }
  }, [matchesCurrentPage, matchesTotalPages]);

  useEffect(() => {
    if (!hasHandledPaginationScrollRef.current) {
      hasHandledPaginationScrollRef.current = true;
      return;
    }

    scrollToTopOfPage();
  }, [matchesCurrentPage]);

  useEffect(() => {
    if (
      matchesNaipeFilter != ALL_MATCHES_NAIPE_FILTER &&
      !availableNaipeOptions.includes(matchesNaipeFilter as MatchNaipe)
    ) {
      setMatchesNaipeFilter(ALL_MATCHES_NAIPE_FILTER);
    }
  }, [availableNaipeOptions, matchesNaipeFilter]);

  useEffect(() => {
    const validGroupFilterValues = new Set(
      groupsForMatchesFilter.map((groupOption) => groupOption.value),
    );

    if (
      matchesGroupFilter != ALL_MATCHES_GROUP_FILTER &&
      !validGroupFilterValues.has(matchesGroupFilter)
    ) {
      setMatchesGroupFilter(ALL_MATCHES_GROUP_FILTER);
    }
  }, [groupsForMatchesFilter, matchesGroupFilter]);

  useEffect(() => {
    if (
      matchesLocationFilter != ALL_MATCHES_LOCATION_FILTER &&
      !locationsForMatchesFilter.includes(matchesLocationFilter)
    ) {
      setMatchesLocationFilter(ALL_MATCHES_LOCATION_FILTER);
    }
  }, [locationsForMatchesFilter, matchesLocationFilter]);

  useEffect(() => {
    if (
      matchesCourtFilter != ALL_MATCHES_COURT_FILTER &&
      !courtsForMatchesFilter.includes(matchesCourtFilter)
    ) {
      setMatchesCourtFilter(ALL_MATCHES_COURT_FILTER);
    }
  }, [courtsForMatchesFilter, matchesCourtFilter]);

  useEffect(() => {
    const matchIds = new Set(matches.map((match) => match.id));

    setSelectedMatchIds((currentSelectedMatchIds) => {
      return currentSelectedMatchIds.filter((selectedMatchId) =>
        matchIds.has(selectedMatchId),
      );
    });
  }, [matches]);

  useEffect(() => {
    const pendingMatchIds = new Set(
      matches
        .filter((match) => match.is_pending_manual_relocation)
        .map((match) => match.id),
    );

    setSelectedPendingManualRelocationMatchIds((currentMatchIds) =>
      currentMatchIds.filter((matchId) => pendingMatchIds.has(matchId)),
    );
  }, [matches]);

  useEffect(() => {
    if (!showSwapMatchDialog || pendingSwapSourceMatch) {
      return;
    }

    setShowSwapMatchDialog(false);
    setPendingSwapSourceMatchId(null);
    setPendingSwapTargetMatchId("");
    setEligibleSwapTargetMatchCandidates([]);
    setLoadingSwapTargetMatchOptions(false);
  }, [pendingSwapSourceMatch, showSwapMatchDialog]);

  useEffect(() => {
    if (!isScoreSheetReviewMode || !showSwapMatchDialog) {
      return;
    }

    setShowSwapMatchDialog(false);
    setPendingSwapSourceMatchId(null);
    setPendingSwapTargetMatchId("");
    setEligibleSwapTargetMatchCandidates([]);
    setLoadingSwapTargetMatchOptions(false);
  }, [isScoreSheetReviewMode, showSwapMatchDialog]);

  useEffect(() => {
    if (!isScoreSheetReviewMode || !showKnockoutScheduleSwapDialog) {
      return;
    }

    setShowKnockoutScheduleSwapDialog(false);
    setPendingKnockoutScheduleSwapSource(null);
    setPendingKnockoutScheduleSwapTargetId("");
    setEligibleKnockoutScheduleSwapCandidates([]);
    setLoadingKnockoutScheduleSwapCandidates(false);
  }, [isScoreSheetReviewMode, showKnockoutScheduleSwapDialog]);

  useEffect(() => {
    if (!shouldShowTieBreakBanner) {
      setShowTieBreakDialog(false);
    }
  }, [shouldShowTieBreakBanner]);

  useEffect(() => {
    if (!editingMatchDraft || editingMatchBracketBinding == null) {
      return;
    }

    if (!editingMatchDraft.selectedGroupOptionValue) {
      return;
    }

    const validGroupOptionValueSet = new Set(
      editingMatchGroupOptions.map((groupOption) => groupOption.value),
    );

    if (
      validGroupOptionValueSet.has(editingMatchDraft.selectedGroupOptionValue)
    ) {
      return;
    }

    setEditingMatchDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      if (!currentDraft.selectedGroupOptionValue) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        selectedGroupOptionValue: "",
      };
    });
  }, [editingMatchBracketBinding, editingMatchDraft, editingMatchGroupOptions]);

  useEffect(() => {
    if (!editingMatchDraft || !selectedEditingGroupOption) {
      return;
    }

    const selectedGroupTeamIdSet = new Set(selectedEditingGroupOption.team_ids);

    if (
      selectedGroupTeamIdSet.has(editingMatchDraft.homeTeamId) &&
      selectedGroupTeamIdSet.has(editingMatchDraft.awayTeamId)
    ) {
      return;
    }

    setEditingMatchDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      const nextHomeTeamId = selectedGroupTeamIdSet.has(currentDraft.homeTeamId)
        ? currentDraft.homeTeamId
        : "";
      const nextAwayTeamId = selectedGroupTeamIdSet.has(currentDraft.awayTeamId)
        ? currentDraft.awayTeamId
        : "";

      if (
        nextHomeTeamId == currentDraft.homeTeamId &&
        nextAwayTeamId == currentDraft.awayTeamId
      ) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        homeTeamId: nextHomeTeamId,
        awayTeamId: nextAwayTeamId,
      };
    });
  }, [editingMatchDraft, selectedEditingGroupOption]);

  useEffect(() => {
    if (!selectedGroupOptionValue) {
      return;
    }

    const validGroupOptionValueSet = new Set(
      createMatchGroupOptions.map((groupOption) => groupOption.value),
    );

    if (validGroupOptionValueSet.has(selectedGroupOptionValue)) {
      return;
    }

    setSelectedGroupOptionValue("");
  }, [createMatchGroupOptions, selectedGroupOptionValue]);

  useEffect(() => {
    if (!selectedCreateGroupOption) {
      return;
    }

    const selectedGroupTeamIdSet = new Set(selectedCreateGroupOption.team_ids);

    if (
      selectedGroupTeamIdSet.has(homeTeamId) &&
      selectedGroupTeamIdSet.has(awayTeamId)
    ) {
      return;
    }

    setHomeTeamId((currentHomeTeamId) => {
      return selectedGroupTeamIdSet.has(currentHomeTeamId)
        ? currentHomeTeamId
        : "";
    });
    setAwayTeamId((currentAwayTeamId) => {
      return selectedGroupTeamIdSet.has(currentAwayTeamId)
        ? currentAwayTeamId
        : "";
    });
  }, [awayTeamId, homeTeamId, selectedCreateGroupOption]);

  const resolveNextGroupStageSlotNumber = async (competitionId: string) => {
    const { data: competitionBracketMatches, error: fetchBracketSlotError } =
      await supabaseLoose
        .from("championship_bracket_matches")
        .select("slot_number")
        .eq("competition_id", competitionId)
        .eq("phase", BracketPhase.GROUP_STAGE)
        .order("slot_number", { ascending: false })
        .limit(1);

    const typedCompetitionBracketMatches = (competitionBracketMatches ??
      []) as BracketMatchRowLite[];

    if (fetchBracketSlotError) {
      return {
        slotNumber: null,
        errorMessage: fetchBracketSlotError.message,
      };
    }

    return {
      slotNumber: (typedCompetitionBracketMatches[0]?.slot_number ?? 0) + 1,
      errorMessage: null,
    };
  };

  const createGroupStageBracketBinding = async (params: {
    matchId: string;
    homeTeamId: string;
    awayTeamId: string;
    groupOptionValue: string;
  }) => {
    if (!championshipBracketView.edition?.id) {
      return {
        errorMessage:
          "Não há edição de chaveamento configurada para vincular este jogo a uma chave.",
      };
    }

    const selectedGroupOption = championshipBracketGroupStageOptions.find(
      (groupOption) => {
        return groupOption.value == params.groupOptionValue;
      },
    );

    if (!selectedGroupOption) {
      return {
        errorMessage: "Selecione uma chave válida antes de salvar.",
      };
    }

    const nextSlotNumberResponse = await resolveNextGroupStageSlotNumber(
      selectedGroupOption.competition_id,
    );

    if (
      nextSlotNumberResponse.errorMessage ||
      nextSlotNumberResponse.slotNumber == null
    ) {
      return {
        errorMessage:
          nextSlotNumberResponse.errorMessage ??
          "Não foi possível definir a posição do jogo na chave.",
      };
    }

    const { error: bracketInsertError } = await supabaseLoose
      .from("championship_bracket_matches")
      .insert({
        bracket_edition_id: championshipBracketView.edition.id,
        competition_id: selectedGroupOption.competition_id,
        group_id: selectedGroupOption.group_id,
        phase: BracketPhase.GROUP_STAGE,
        round_number: 1,
        slot_number: nextSlotNumberResponse.slotNumber,
        match_id: params.matchId,
        home_team_id: params.homeTeamId,
        away_team_id: params.awayTeamId,
      });

    return {
      errorMessage: bracketInsertError?.message ?? null,
    };
  };

  const moveMatchesToNextChampionshipDay = async (
    matchesToMove: Match[],
    emptySelectionMessage: string,
  ) => {
    if (!canManageMatches) {
      return;
    }

    if (matchesToMove.length == 0) {
      toast.error(emptySelectionMessage);
      return;
    }

    if (championshipDayDates.length < 2) {
      toast.error(
        "Cadastre pelo menos dois dias de campeonato para mover jogos para o próximo dia.",
      );
      return;
    }

    const orderedMatchesToMove = [...matchesToMove].sort(
      (firstMatch, secondMatch) => {
        const firstScheduledDate =
          resolveMatchScheduledDateValue(firstMatch) ?? "9999-12-31";
        const secondScheduledDate =
          resolveMatchScheduledDateValue(secondMatch) ?? "9999-12-31";

        if (firstScheduledDate != secondScheduledDate) {
          return firstScheduledDate.localeCompare(secondScheduledDate);
        }

        return (
          resolveMatchScheduleMoveSortValue(
            firstMatch,
            shouldUseScheduledSlotInMatchList,
          ) -
          resolveMatchScheduleMoveSortValue(
            secondMatch,
            shouldUseScheduledSlotInMatchList,
          )
        );
      },
    );

    setApplyingBulkAction(true);

    let movedMatchesCount = 0;
    let skippedMatchesCount = 0;

    for (const selectedMatch of orderedMatchesToMove) {
      if (selectedMatch.status != MatchStatus.SCHEDULED) {
        skippedMatchesCount += 1;
        continue;
      }

      const currentScheduledDate =
        resolveMatchScheduledDateValue(selectedMatch);

      if (!currentScheduledDate) {
        skippedMatchesCount += 1;
        continue;
      }

      const nextScheduledDate = championshipDayDates.find(
        (championshipDayDate) => championshipDayDate > currentScheduledDate,
      );

      if (!nextScheduledDate) {
        skippedMatchesCount += 1;
        continue;
      }

      const { error } = await supabase
        .from("matches")
        .update({
          scheduled_date: nextScheduledDate,
          queue_position: null,
          scheduled_slot: null,
        })
        .eq("id", selectedMatch.id);

      if (error) {
        setApplyingBulkAction(false);
        toast.error(error.message);
        return;
      }

      movedMatchesCount += 1;
    }

    setApplyingBulkAction(false);

    if (movedMatchesCount == 0) {
      toast.error(
        "Nenhum jogo selecionado pôde ser movido para o próximo dia.",
      );
      return;
    }

    const redistributedSchedule =
      await redistributeBracketScheduleAfterMatchScheduleChange({
        reloadError:
          "Os jogos foram movidos, mas não foi possível recarregar a agenda para redistribuir a fila",
        redistributeError:
          "Os jogos foram movidos, mas a redistribuição automática da fila falhou",
      });

    if (!redistributedSchedule) {
      return;
    }

    await Promise.all([onRefetch(), onRefetchChampionshipBracket()]);

    if (skippedMatchesCount > 0) {
      toast.success(
        `${movedMatchesCount} jogo(s) movido(s). ${skippedMatchesCount} não tinham próximo dia disponível.`,
      );
      return;
    }

    toast.success(`${movedMatchesCount} jogo(s) movido(s) para o próximo dia.`);
  };

  const redistributeBracketScheduleAfterMatchScheduleChange = async (messages: {
    reloadError: string;
    redistributeError: string;
  }): Promise<boolean> => {
    if (!championshipBracketView.edition?.id) {
      return true;
    }

    const { data: bracketDaySchedules, error: bracketDaySchedulesError } =
      await getBracketDaySchedules(championshipBracketView.edition.id);

    if (bracketDaySchedulesError) {
      toast.error(
        `${messages.reloadError}: ${bracketDaySchedulesError.message}`,
      );
      await Promise.all([onRefetch(), onRefetchChampionshipBracket()]);
      return false;
    }

    if (bracketDaySchedules.length == 0) {
      return true;
    }

    const { error: redistributeError } = await updateBracketDaySchedule(
      championshipBracketView.edition.id,
      resolveBracketDayScheduleUpdates(bracketDaySchedules),
    );

    if (redistributeError) {
      toast.error(
        `${messages.redistributeError}: ${redistributeError.message}`,
      );
      await Promise.all([onRefetch(), onRefetchChampionshipBracket()]);
      return false;
    }

    return true;
  };

  const closeIndividualSessionEditor = () => {
    if (savingIndividualSession) return;
    setEditingIndividualSession(null);
    setIndividualSessionEditDraft(null);
  };

  const openIndividualSessionEditor = async (
    session: ChampionshipIndividualSession,
  ) => {
    const bracketEditionId = championshipBracketView.edition?.id;

    if (!bracketEditionId) {
      toast.error("A edição do chaveamento não está disponível.");
      return;
    }

    const { data, error } = await getBracketDaySchedules(bracketEditionId);

    if (error) {
      toast.error(error.message);
      return;
    }

    const sessionDay =
      data.find((day) => day.event_date == session.scheduled_date) ?? null;
    const sessionLocation =
      sessionDay?.locations.find(
        (location) =>
          location.location_group_id == session.location_key ||
          location.name == session.location_name,
      ) ?? null;
    const sessionCourt =
      sessionLocation?.courts.find(
        (court) =>
          court.court_group_id == session.court_key ||
          court.name == session.court_name,
      ) ?? null;

    setIndividualSessionScheduleDays(data);
    setEditingIndividualSession(session);
    setIndividualSessionEditDraft({
      scheduledDate: session.scheduled_date ?? "",
      startTime: (session.start_time ?? "").slice(0, 5),
      endTime: (session.end_time ?? "").slice(0, 5),
      locationGroupId: sessionLocation?.location_group_id ?? "",
      courtGroupId: sessionCourt?.court_group_id ?? "",
      exclusiveLockEnabled: session.exclusive_lock_enabled,
    });
  };

  const saveIndividualSession = async () => {
    const bracketEditionId = championshipBracketView.edition?.id;

    if (
      !editingIndividualSession ||
      !individualSessionEditDraft ||
      !bracketEditionId
    ) {
      return;
    }

    const {
      scheduledDate,
      startTime,
      endTime,
      locationGroupId,
      courtGroupId,
      exclusiveLockEnabled,
    } = individualSessionEditDraft;

    if (!scheduledDate || !startTime || !endTime || !locationGroupId || !courtGroupId) {
      toast.error("Preencha data, horário, local e quadra da sessão.");
      return;
    }

    if (endTime <= startTime) {
      toast.error("O horário final deve ser maior que o horário inicial.");
      return;
    }

    const location = individualSessionScheduleDays
      .find((day) => day.event_date == scheduledDate)
      ?.locations.find((item) => item.location_group_id == locationGroupId);
    const court = location?.courts.find(
      (item) => item.court_group_id == courtGroupId,
    );

    if (!location || !court) {
      toast.error("Selecione um local e uma quadra válidos para esta data.");
      return;
    }

    const payload = {
      session_id: editingIndividualSession.id,
      scheduled_date: scheduledDate,
      start_time: startTime,
      end_time: endTime,
      location_group_id: locationGroupId,
      court_group_id: courtGroupId,
      exclusive_lock_enabled: exclusiveLockEnabled,
      session_sport_name:
        editingIndividualSession.sports?.name ?? "Modalidade individual",
      session_naipe: editingIndividualSession.naipe,
      current_scheduled_date: editingIndividualSession.scheduled_date,
      current_start_time: editingIndividualSession.start_time,
      current_end_time: editingIndividualSession.end_time,
      current_location_name: editingIndividualSession.location_name,
      current_court_name: editingIndividualSession.court_name,
      current_exclusive_lock_enabled:
        editingIndividualSession.exclusive_lock_enabled,
      target_location_name: location.name,
      target_court_name: court.name,
    };

    setSavingIndividualSession(true);
    const preview = await previewChampionshipBracketReconfiguration(
      bracketEditionId,
      "INDIVIDUAL_SESSION",
      payload,
    );

    if (preview.error || !preview.data) {
      setSavingIndividualSession(false);
      toast.error(
        preview.error?.message ?? "Não foi possível validar a reprogramação.",
      );
      return;
    }

    if (preview.data.blockers.length > 0) {
      setSavingIndividualSession(false);
      toast.error(preview.data.blockers[0]);
      return;
    }

    const result = await applyChampionshipBracketReconfiguration(
      bracketEditionId,
      "INDIVIDUAL_SESSION",
      payload,
      preview.data.revision,
    );
    setSavingIndividualSession(false);

    if (result.error) {
      toast.error(result.error.message);
      return;
    }

    toast.success("Sessão individual reprogramada.");
    closeIndividualSessionEditor();
    await Promise.all([onRefetch(), onRefetchChampionshipBracket()]);
  };

  const handleMoveSelectedMatchesToNextChampionshipDay = async () => {
    const matchesById = matches.reduce<Record<string, Match>>(
      (carry, match) => {
        carry[match.id] = match;
        return carry;
      },
      {},
    );

    const selectedMatches = selectedMatchIds
      .map((selectedMatchId) => matchesById[selectedMatchId] ?? null)
      .filter((match): match is Match => match != null);

    await moveMatchesToNextChampionshipDay(
      selectedMatches,
      "Selecione ao menos um jogo.",
    );
  };

  const handleMoveFilteredMatchesToNextChampionshipDay = async () => {
    await moveMatchesToNextChampionshipDay(
      filteredAndSortedMatches,
      "Nenhum jogo filtrado disponível para mover.",
    );
  };

  const handleAdd = async () => {
    if (!canManageMatches || creatingMatch) {
      return;
    }

    const resolvedLocation = location.trim();

    if (
      !sportId ||
      !homeTeamId ||
      !awayTeamId ||
      !resolvedLocation ||
      !scheduledDate
    ) {
      toast.error("Preencha todos os campos.");
      return;
    }

    if (homeTeamId === awayTeamId) {
      toast.error("Atléticas devem ser diferentes.");
      return;
    }

    setCreatingMatch(true);

    const { data: insertedMatch, error } = await supabase
      .from("matches")
      .insert({
        championship_id: selectedChampionship.id,
        season_year: selectedChampionship.current_season_year,
        naipe,
        sport_id: sportId,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        location: resolvedLocation,
        scheduled_date: resolveDateOnlyString(scheduledDate),
        queue_position: null,
        scheduled_slot: null,
        start_time: null,
        end_time: null,
        division: championshipUsesDivisions ? division : null,
      })
      .select("id")
      .single();

    if (error || !insertedMatch) {
      setCreatingMatch(false);
      toast.error(error?.message ?? "Não foi possível criar o jogo.");
      return;
    }

    if (selectedGroupOptionValue) {
      const bracketBindingResponse = await createGroupStageBracketBinding({
        matchId: insertedMatch.id,
        homeTeamId,
        awayTeamId,
        groupOptionValue: selectedGroupOptionValue,
      });

      if (bracketBindingResponse.errorMessage) {
        setCreatingMatch(false);
        await supabase.from("matches").delete().eq("id", insertedMatch.id);
        toast.error(bracketBindingResponse.errorMessage);
        return;
      }
    }

    setCreatingMatch(false);
    toast.success("Jogo criado!");
    setShowCreateMatchModal(false);
    resetCreateMatchForm();
    await Promise.all([onRefetch(), onRefetchChampionshipBracket()]);
  };

  const handleDelete = async (matchId: string) => {
    if (!canManageMatches) {
      return;
    }

    setDeletingMatches(true);

    const { error } = await supabase.from("matches").delete().eq("id", matchId);

    setDeletingMatches(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Jogo removido.");
    setSelectedMatchIds((currentSelectedMatchIds) =>
      currentSelectedMatchIds.filter(
        (selectedMatchId) => selectedMatchId != matchId,
      ),
    );
    onRefetch();
    onRefetchChampionshipBracket();
  };

  const handleOpenDeleteMatchDialog = (match: Match) => {
    if (!canManageMatches) {
      return;
    }

    setPendingDeleteMatchId(match.id);
    setPendingDeleteMatchLabel(
      `${match.home_team?.name ?? "Casa"} x ${match.away_team?.name ?? "Visitante"}`,
    );
    setShowDeleteMatchDialog(true);
  };

  const handleOpenSwapMatchDialog = (match: Match) => {
    if (!canManageMatches || isScoreSheetReviewMode) {
      return;
    }

    setPendingSwapSourceMatchId(match.id);
    setPendingSwapTargetMatchId("");
    setEligibleSwapTargetMatchCandidates([]);
    setShowSwapMatchDialog(true);
  };

  const handleCloseSwapMatchDialog = () => {
    if (swappingMatches) {
      return;
    }

    setShowSwapMatchDialog(false);
    setPendingSwapSourceMatchId(null);
    setPendingSwapTargetMatchId("");
    setEligibleSwapTargetMatchCandidates([]);
    setLoadingSwapTargetMatchOptions(false);
  };

  const handleConfirmSwapMatches = async () => {
    if (!canManageMatches || isScoreSheetReviewMode) {
      return;
    }

    if (!pendingSwapSourceMatch || !pendingSwapTargetMatchId) {
      toast.error("Selecione um jogo válido para trocar a fila.");
      return;
    }

    if (loadingSwapTargetMatchOptions) {
      toast.error("Aguarde o carregamento das opções de troca.");
      return;
    }

    if (eligibleSwapTargetMatchOptions.length == 0) {
      toast.error("Não há jogos elegíveis para troca de fila.");
      return;
    }

    setSwappingMatches(true);

    const { data, error } = await supabase.rpc("swap_match_queue_slots", {
      _source_match_id: pendingSwapSourceMatch.id,
      _target_match_id: pendingSwapTargetMatchId,
    });

    if (error) {
      setSwappingMatches(false);
      toast.error(resolveAdminMatchesOperationalErrorMessage(error));
      return;
    }

    const swapResponse = data as SwapMatchQueueSlotsResponse | null;

    setSwappingMatches(false);
    setShowSwapMatchDialog(false);
    setPendingSwapSourceMatchId(null);
    setPendingSwapTargetMatchId("");
    setEligibleSwapTargetMatchCandidates([]);
    setLoadingSwapTargetMatchOptions(false);

    await Promise.all([onRefetch(), onRefetchChampionshipBracket()]);

    if (swapResponse) {
      toast.success(
        `Jogos trocados na fila: jogo ${swapResponse.source_previous_slot} ↔ jogo ${swapResponse.target_previous_slot}.`,
      );
      return;
    }

    toast.success("Jogos trocados na fila.");
  };

  const handleOpenKnockoutScheduleSwapDialog = (
    placeholder: ScheduledKnockoutPlaceholder,
  ) => {
    if (!canManageMatches || isScoreSheetReviewMode) {
      return;
    }

    setPendingKnockoutScheduleSwapSource(placeholder);
    setPendingKnockoutScheduleSwapTargetId("");
    setEligibleKnockoutScheduleSwapCandidates([]);
    setShowKnockoutScheduleSwapDialog(true);
  };

  const handleCloseKnockoutScheduleSwapDialog = () => {
    if (swappingMatches) {
      return;
    }

    setShowKnockoutScheduleSwapDialog(false);
    setPendingKnockoutScheduleSwapSource(null);
    setPendingKnockoutScheduleSwapTargetId("");
    setEligibleKnockoutScheduleSwapCandidates([]);
    setLoadingKnockoutScheduleSwapCandidates(false);
  };

  const handleConfirmKnockoutScheduleSwap = async () => {
    if (
      !canManageMatches ||
      isScoreSheetReviewMode ||
      !pendingKnockoutScheduleSwapSource ||
      !pendingKnockoutScheduleSwapTargetId
    ) {
      toast.error("Selecione um jogo eliminatório válido para a troca.");
      return;
    }

    if (loadingKnockoutScheduleSwapCandidates) {
      toast.error("Aguarde o carregamento das opções de troca.");
      return;
    }

    if (eligibleKnockoutScheduleSwapOptions.length == 0) {
      toast.error("Não há jogos eliminatórios elegíveis para troca.");
      return;
    }

    setSwappingMatches(true);

    const { data, error } = await supabaseLoose.rpc(
      "swap_knockout_schedule_slots",
      {
        _source_bracket_match_id: pendingKnockoutScheduleSwapSource.id,
        _target_bracket_match_id: pendingKnockoutScheduleSwapTargetId,
      },
    );

    if (error) {
      setSwappingMatches(false);
      toast.error(resolveAdminMatchesOperationalErrorMessage(error));
      return;
    }

    const swapResponse = data as SwapKnockoutScheduleSlotsResponse | null;

    setSwappingMatches(false);
    setShowKnockoutScheduleSwapDialog(false);
    setPendingKnockoutScheduleSwapSource(null);
    setPendingKnockoutScheduleSwapTargetId("");
    setEligibleKnockoutScheduleSwapCandidates([]);
    setLoadingKnockoutScheduleSwapCandidates(false);

    await Promise.all([onRefetch(), onRefetchChampionshipBracket()]);

    if (swapResponse) {
      toast.success(
        `Jogos eliminatórios trocados: jogo ${swapResponse.source_previous_slot} ↔ jogo ${swapResponse.target_previous_slot}.`,
      );
      return;
    }

    toast.success("Jogos eliminatórios trocados.");
  };

  const handleCloseOperationalKnockoutScheduleAdjustmentDialog = () => {
    if (loadingOperationalKnockoutScheduleAdjustment || applyingOperationalKnockoutScheduleAdjustment) {
      return;
    }

    setShowOperationalKnockoutScheduleAdjustmentDialog(false);
    setOperationalKnockoutScheduleAdjustmentSourceBracketMatchId("");
    setOperationalKnockoutScheduleAdjustmentCandidates(null);
    setOperationalKnockoutScheduleAdjustmentSchedules([]);
    setSelectedOperationalKnockoutScheduleAdjustmentItemIds([]);
    setOperationalKnockoutScheduleAdjustmentPreview(null);
  };

  const handleOpenOperationalKnockoutScheduleAdjustmentDialog = async (
    sourceBracketMatchId: string,
  ) => {
    if (!canManageMatches || isScoreSheetReviewMode) {
      return;
    }

    const bracketEditionId = championshipBracketView.edition?.id;

    if (!bracketEditionId) {
      toast.error("Não foi possível localizar a agenda do campeonato.");
      return;
    }

    setLoadingOperationalKnockoutScheduleAdjustment(true);

    const [{ data, error }, schedulesResponse] = await Promise.all([
      listOperationalKnockoutScheduleAdjustmentCandidates(sourceBracketMatchId),
      getBracketDaySchedules(bracketEditionId),
    ]);

    setLoadingOperationalKnockoutScheduleAdjustment(false);

    if (error || !data) {
      toast.error(resolveAdminMatchesOperationalErrorMessage(error));
      return;
    }

    if (schedulesResponse.error) {
      toast.error(schedulesResponse.error.message);
      return;
    }

    const sourceItem = data.items.find(
      (item) => item.bracket_match_id == sourceBracketMatchId,
    );

    if (!sourceItem) {
      toast.error("Não foi possível localizar o item selecionado na programação.");
      return;
    }

    const scheduleDay = schedulesResponse.data.find(
      (schedule) => schedule.event_date == sourceItem.scheduled_date,
    );
    const currentBreak =
      scheduleDay?.breaks.find((item) => item.scope_type == "ALL_COURTS") ??
      scheduleDay?.breaks.find(
        (item) => item.bracket_court_id == sourceItem.bracket_court_id,
      ) ??
      null;

    setOperationalKnockoutScheduleAdjustmentCandidates(data);
    setOperationalKnockoutScheduleAdjustmentSourceBracketMatchId(sourceBracketMatchId);
    setOperationalKnockoutScheduleAdjustmentSchedules(schedulesResponse.data);
    setSelectedOperationalKnockoutScheduleAdjustmentItemIds([sourceBracketMatchId]);
    setOperationalKnockoutScheduleAdjustmentDuration(
      String(sourceItem.duration_minutes),
    );
    setOperationalKnockoutScheduleAdjustmentBreakAction("KEEP");
    setOperationalKnockoutScheduleAdjustmentBreakId(currentBreak?.id ?? "");
    setOperationalKnockoutScheduleAdjustmentBreakScopeType(
      currentBreak?.scope_type ?? "ALL_COURTS",
    );
    setOperationalKnockoutScheduleAdjustmentBreakStartTime(
      currentBreak?.break_start_time.slice(0, 5) ?? "",
    );
    setOperationalKnockoutScheduleAdjustmentBreakEndTime(
      currentBreak?.break_end_time.slice(0, 5) ?? "",
    );
    setOperationalKnockoutScheduleAdjustmentPreview(null);
    setShowOperationalKnockoutScheduleAdjustmentDialog(true);
  };

  const handleToggleOperationalKnockoutScheduleAdjustmentItem = (
    bracketMatchId: string,
    checked: CheckedState,
  ) => {
    setSelectedOperationalKnockoutScheduleAdjustmentItemIds((current) => {
      if (checked === true) {
        return current.includes(bracketMatchId) ? current : [...current, bracketMatchId];
      }

      return current.filter((id) => id != bracketMatchId);
    });
    setOperationalKnockoutScheduleAdjustmentPreview(null);
  };

  const buildOperationalKnockoutScheduleAdjustmentInput = (
    acceptDayEndExtension = false,
  ): OperationalKnockoutScheduleAdjustmentInput | null => {
    const durationMinutes = Number.parseInt(
      operationalKnockoutScheduleAdjustmentDuration,
      10,
    );

    if (selectedOperationalKnockoutScheduleAdjustmentItemIds.length == 0) {
      toast.error("Selecione ao menos um jogo ou slot para ajustar.");
      return null;
    }

    if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
      toast.error("Informe uma duração válida em minutos.");
      return null;
    }

    return {
      bracket_match_ids: selectedOperationalKnockoutScheduleAdjustmentItemIds,
      duration_minutes: durationMinutes,
      break: {
        action: operationalKnockoutScheduleAdjustmentBreakAction,
        id: operationalKnockoutScheduleAdjustmentBreakId || null,
        scope_type: operationalKnockoutScheduleAdjustmentBreakScopeType,
        start_time: operationalKnockoutScheduleAdjustmentBreakStartTime || null,
        end_time: operationalKnockoutScheduleAdjustmentBreakEndTime || null,
      },
      accept_day_end_extension: acceptDayEndExtension,
    };
  };

  const handlePreviewOperationalKnockoutScheduleAdjustment = async () => {
    const bracketEditionId = championshipBracketView.edition?.id;
    const input = buildOperationalKnockoutScheduleAdjustmentInput();

    if (!bracketEditionId || !input) {
      return;
    }

    setLoadingOperationalKnockoutScheduleAdjustment(true);
    const { data, error } = await previewOperationalKnockoutScheduleAdjustment(
      bracketEditionId,
      input,
    );
    setLoadingOperationalKnockoutScheduleAdjustment(false);

    if (error || !data) {
      toast.error(resolveAdminMatchesOperationalErrorMessage(error));
      return;
    }

    setOperationalKnockoutScheduleAdjustmentPreview(data);
  };

  const handleApplyOperationalKnockoutScheduleAdjustment = async () => {
    const bracketEditionId = championshipBracketView.edition?.id;
    const preview = operationalKnockoutScheduleAdjustmentPreview;
    const input = buildOperationalKnockoutScheduleAdjustmentInput(
      preview?.extends_day_end === true,
    );

    if (!bracketEditionId || !preview || !input || preview.blockers.length > 0) {
      return;
    }

    setApplyingOperationalKnockoutScheduleAdjustment(true);
    const { error } = await applyOperationalKnockoutScheduleAdjustment(
      bracketEditionId,
      input,
      preview.revision,
    );
    setApplyingOperationalKnockoutScheduleAdjustment(false);

    if (error) {
      toast.error(resolveAdminMatchesOperationalErrorMessage(error));
      return;
    }

    handleCloseOperationalKnockoutScheduleAdjustmentDialog();
    await Promise.all([onRefetch(), onRefetchChampionshipBracket()]);
    toast.success("Programação futura do mata-mata ajustada com sucesso.");
  };

  const handleCloseManualRelocationDialog = () => {
    if (loadingManualRelocationPreview || applyingManualRelocation) {
      return;
    }

    setShowManualRelocationDialog(false);
    setManualRelocationPreview(null);
  };

  const handleOpenManualRelocationDialog = () => {
    if (!canManageMatches || selectedMatchesForManualRelocation.length == 0) {
      toast.error("Selecione ao menos um jogo agendado.");
      return;
    }

    if (
      selectedMatchesForManualRelocation.some(
        (match) => match.status != MatchStatus.SCHEDULED,
      )
    ) {
      toast.error("A realocação emergencial aceita somente jogos agendados.");
      return;
    }

    if (!championshipBracketView.edition?.id) {
      toast.error("Não foi possível localizar a agenda do campeonato.");
      return;
    }

    const firstMatch = selectedMatchesForManualRelocation[0];
    const initialDate = resolveMatchScheduledDateValue(firstMatch) ?? "";
    const initialDay = bracketCourtSportsDays.find(
      (scheduleDay) => scheduleDay.event_date == initialDate,
    );
    const initialLocation = initialDay?.locations.find(
      (scheduleLocation) => scheduleLocation.name == firstMatch.location,
    );
    const selectedSportIds = new Set(
      selectedMatchesForManualRelocation.map((match) => match.sport_id),
    );
    const initialCourt = initialLocation?.courts.find(
      (court) =>
        court.name == firstMatch.court_name &&
        [...selectedSportIds].every((sportId) =>
          court.sports.some((courtSport) => courtSport.sport_id == sportId),
        ),
    );

    setManualRelocationTargetDate(initialDate);
    setManualRelocationTargetLocation(initialLocation?.name ?? "");
    setManualRelocationTargetCourt(initialCourt?.name ?? "");
    setManualRelocationTargetStartTime("");
    setManualRelocationPosition("END");
    setManualRelocationReason("WEATHER");
    setManualRelocationNotes("");
    setManualRelocationPreview(null);
    setShowManualRelocationDialog(true);
  };

  const buildManualRelocationInput = (): ManualMatchRelocationInput | null => {
    if (
      !manualRelocationTargetDate ||
      !manualRelocationTargetLocation ||
      !manualRelocationTargetCourt
    ) {
      toast.error("Selecione o dia, local e quadra de destino.");
      return null;
    }

    return {
      match_ids: selectedMatchesForManualRelocation.map((match) => match.id),
      target_date: manualRelocationTargetDate,
      target_location: manualRelocationTargetLocation,
      target_court_name: manualRelocationTargetCourt,
      target_start_time: manualRelocationTargetStartTime || null,
      insertion_position: manualRelocationPosition,
      reason: manualRelocationReason,
      notes: manualRelocationNotes.trim() || null,
    };
  };

  const handlePreviewManualRelocation = async () => {
    const bracketEditionId = championshipBracketView.edition?.id;
    const input = buildManualRelocationInput();

    if (!bracketEditionId || !input) {
      return;
    }

    setLoadingManualRelocationPreview(true);
    const { data, error } = await previewManualMatchRelocation(
      bracketEditionId,
      input,
    );
    setLoadingManualRelocationPreview(false);

    if (error || !data) {
      toast.error(error?.message ?? "Não foi possível calcular a prévia.");
      return;
    }

    setManualRelocationPreview(data);
  };

  const handleApplyManualRelocation = async () => {
    const bracketEditionId = championshipBracketView.edition?.id;
    const input = buildManualRelocationInput();

    if (!bracketEditionId || !input || !manualRelocationPreview) {
      return;
    }

    if (manualRelocationPreview.blockers.length > 0) {
      return;
    }

    setApplyingManualRelocation(true);
    const { error } = await applyManualMatchRelocation(
      bracketEditionId,
      input,
      manualRelocationPreview.revision,
    );
    setApplyingManualRelocation(false);

    if (error) {
      toast.error(resolveAdminMatchesOperationalErrorMessage(error));
      return;
    }

    setSelectedMatchIds([]);
    setSelectedPendingManualRelocationMatchIds([]);
    setManualRelocationPreview(null);
    setShowManualRelocationDialog(false);
    await Promise.all([onRefetch(), onRefetchChampionshipBracket()]);
    toast.success("Jogos realocados com sucesso.");
  };

  const handleCloseDayScheduleReorganizationDialog = () => {
    if (
      loadingDayScheduleReorganizationPreview ||
      applyingDayScheduleReorganization
    ) {
      return;
    }

    setShowDayScheduleReorganizationDialog(false);
    setDayScheduleReorganizationManualPreview(null);
    setDayScheduleReorganizationManualCourtItemOrder({});
    setDraggedDayScheduleReorganizationItem(null);
    setPlacedDayScheduleReorganizationMatchIds([]);
  };

  const handleOpenDayScheduleReorganizationDialog = async () => {
    const bracketEditionId = championshipBracketView.edition?.id;

    if (
      !canManageMatches ||
      selectedPendingMatchesForDayScheduleReorganization.length == 0
    ) {
      toast.error("Selecione ao menos um jogo aguardando realocação.");
      return;
    }

    if (!bracketEditionId) {
      toast.error("Não foi possível localizar a agenda do campeonato.");
      return;
    }

    const { data, error } = await getBracketDaySchedules(bracketEditionId);

    if (error) {
      toast.error(error.message);
      return;
    }

    const firstMatch = selectedPendingMatchesForDayScheduleReorganization[0];
    const previousDate = resolvePendingManualRelocationScheduleValue(
      firstMatch,
      "scheduled_date",
    );
    const previousLocation = resolvePendingManualRelocationScheduleValue(
      firstMatch,
      "location",
    );
    const previousCourt = resolvePendingManualRelocationScheduleValue(
      firstMatch,
      "court_name",
    );

    setDayScheduleReorganizationSchedules(data);
    setDayScheduleReorganizationTargetDate(
      typeof previousDate == "string" ? previousDate : "",
    );
    setDayScheduleReorganizationTargetLocation(
      typeof previousLocation == "string" ? previousLocation : "",
    );
    setDayScheduleReorganizationTargetCourt(
      typeof previousCourt == "string" ? previousCourt : "",
    );
    setDayScheduleReorganizationDayStartTime("");
    setDayScheduleReorganizationBreakPolicy("KEEP_BEFORE_KNOCKOUT");
    setDayScheduleReorganizationReason("WEATHER");
    setDayScheduleReorganizationManualPreview(null);
    setDayScheduleReorganizationManualCourtItemOrder({});
    setDraggedDayScheduleReorganizationItem(null);
    setPlacedDayScheduleReorganizationMatchIds([]);
    setShowDayScheduleReorganizationDialog(true);
  };

  const buildDayScheduleReorganizationInput = (
    placedMatchIds = placedDayScheduleReorganizationMatchIds,
    manualCourtItemOrder = dayScheduleReorganizationManualCourtItemOrder,
  ): DayScheduleReorganizationInput | null => {
    if (
      !dayScheduleReorganizationTargetDate ||
      !dayScheduleReorganizationTargetLocation ||
      !dayScheduleReorganizationTargetCourt
    ) {
      toast.error("Selecione o dia, local e quadra de destino.");
      return null;
    }

    return {
      match_ids: selectedPendingMatchesForDayScheduleReorganization.map(
        (match) => match.id,
      ),
      placed_match_ids: placedMatchIds,
      target_date: dayScheduleReorganizationTargetDate,
      target_location: dayScheduleReorganizationTargetLocation,
      target_court_name: dayScheduleReorganizationTargetCourt,
      day_start_time: dayScheduleReorganizationDayStartTime || null,
      strategy: "MANUAL",
      manual_court_item_order: manualCourtItemOrder,
      break_policy: dayScheduleReorganizationBreakPolicy,
      removable_resource_lock: dayScheduleReorganizationRemovableResourceLock,
      reason: dayScheduleReorganizationReason,
    };
  };

  const handlePreviewDayScheduleReorganization = async () => {
    const bracketEditionId = championshipBracketView.edition?.id;
    const input = buildDayScheduleReorganizationInput([], {});

    if (!bracketEditionId || !input) {
      return;
    }

    setLoadingDayScheduleReorganizationPreview(true);
    const { data, error } = await previewDayScheduleReorganization(
      bracketEditionId,
      input,
    );
    setLoadingDayScheduleReorganizationPreview(false);

    if (error || !data) {
      toast.error(error?.message ?? "Não foi possível montar o cronograma.");
      return;
    }

    setPlacedDayScheduleReorganizationMatchIds([]);
    setDayScheduleReorganizationManualCourtItemOrder({});
    setDayScheduleReorganizationManualPreview(data);
  };

  const handlePreviewDayScheduleReorganizationPlacement = async (
    placedMatchIds = placedDayScheduleReorganizationMatchIds,
    manualCourtItemOrder = dayScheduleReorganizationManualCourtItemOrder,
  ): Promise<DayScheduleReorganizationPreview | null> => {
    const bracketEditionId = championshipBracketView.edition?.id;
    const input = buildDayScheduleReorganizationInput(
      placedMatchIds,
      manualCourtItemOrder,
    );

    if (!bracketEditionId || !input) {
      return null;
    }

    setLoadingDayScheduleReorganizationPreview(true);
    const { data, error } = await previewDayScheduleReorganization(
      bracketEditionId,
      input,
    );
    setLoadingDayScheduleReorganizationPreview(false);

    if (error || !data) {
      toast.error(error?.message ?? "Não foi possível recalcular o cronograma.");
      return null;
    }

    return data;
  };

  const handleDayScheduleReorganizationDialogDragOver = (
    event: DragEvent<HTMLDivElement>,
  ) => {
    if (!draggedDayScheduleReorganizationItem) {
      return;
    }

    const dialogContent = event.currentTarget;
    const dialogBounds = dialogContent.getBoundingClientRect();
    const scrollThreshold = 96;
    const maximumScrollStep = 24;
    const distanceFromTop = event.clientY - dialogBounds.top;
    const distanceFromBottom = dialogBounds.bottom - event.clientY;

    if (distanceFromTop > 0 && distanceFromTop < scrollThreshold) {
      dialogContent.scrollBy({
        top: -Math.ceil(
          ((scrollThreshold - distanceFromTop) / scrollThreshold) * maximumScrollStep,
        ),
      });
    } else if (distanceFromBottom > 0 && distanceFromBottom < scrollThreshold) {
      dialogContent.scrollBy({
        top: Math.ceil(
          ((scrollThreshold - distanceFromBottom) / scrollThreshold) * maximumScrollStep,
        ),
      });
    }
  };

  const handleReorderDayScheduleReorganizationManualItem = async (
    courtName: string,
    targetItemId: string,
    placement: "BEFORE" | "AFTER" = "BEFORE",
  ) => {
    const draggedItem = draggedDayScheduleReorganizationItem;

    setDraggedDayScheduleReorganizationItem(null);

    if (
      loadingDayScheduleReorganizationPreview ||
      !draggedItem ||
      draggedItem.type != "TIMELINE" ||
      draggedItem.courtName != courtName ||
      draggedItem.itemId == targetItemId
    ) {
      return;
    }

    const currentCourtItemOrder =
      dayScheduleReorganizationManualCourtItemOrder[courtName] ??
      (dayScheduleReorganizationManualPreview
        ? resolveDayScheduleReorganizationManualCourtItemOrder(
            dayScheduleReorganizationManualPreview,
          )[courtName]
        : []) ?? [];
    const draggedItemIndex = currentCourtItemOrder.indexOf(draggedItem.itemId);
    const targetItemIndex = currentCourtItemOrder.indexOf(targetItemId);

    if (draggedItemIndex < 0 || targetItemIndex < 0) {
      return;
    }

    const nextCourtItemOrder = [...currentCourtItemOrder];
    nextCourtItemOrder.splice(draggedItemIndex, 1);
    nextCourtItemOrder.splice(
      nextCourtItemOrder.indexOf(targetItemId) + (placement == "AFTER" ? 1 : 0),
      0,
      draggedItem.itemId,
    );

    const nextManualCourtItemOrder = {
      ...dayScheduleReorganizationManualCourtItemOrder,
      [courtName]: nextCourtItemOrder,
    };

    const nextPreview = await handlePreviewDayScheduleReorganizationPlacement(
      placedDayScheduleReorganizationMatchIds,
      nextManualCourtItemOrder,
    );

    if (!nextPreview) {
      return;
    }

    setDayScheduleReorganizationManualCourtItemOrder(nextManualCourtItemOrder);
    setDayScheduleReorganizationManualPreview(nextPreview);
  };

  const handlePlaceDayScheduleReorganizationPendingMatch = async (
    targetItemId: string,
    placement: "BEFORE" | "AFTER" = "AFTER",
  ) => {
    const draggedItem = draggedDayScheduleReorganizationItem;
    const preview = dayScheduleReorganizationManualPreview;

    setDraggedDayScheduleReorganizationItem(null);

    if (
      loadingDayScheduleReorganizationPreview ||
      !preview ||
      !draggedItem ||
      draggedItem.type != "PENDING" ||
      placedDayScheduleReorganizationMatchIds.includes(draggedItem.itemId)
    ) {
      return;
    }

    const currentCourtItemOrder =
      dayScheduleReorganizationManualCourtItemOrder[
        dayScheduleReorganizationTargetCourt
      ] ??
      resolveDayScheduleReorganizationManualCourtItemOrder(preview)[
        dayScheduleReorganizationTargetCourt
      ] ?? [];
    const targetItemIndex = currentCourtItemOrder.indexOf(targetItemId);

    if (targetItemIndex < 0) {
      return;
    }

    const nextCourtItemOrder = [...currentCourtItemOrder];
    nextCourtItemOrder.splice(
      targetItemIndex + (placement == "AFTER" ? 1 : 0),
      0,
      draggedItem.itemId,
    );
    const nextPlacedMatchIds = [
      ...placedDayScheduleReorganizationMatchIds,
      draggedItem.itemId,
    ];
    const nextManualCourtItemOrder = {
      ...dayScheduleReorganizationManualCourtItemOrder,
      [dayScheduleReorganizationTargetCourt]: nextCourtItemOrder,
    };

    const nextPreview = await handlePreviewDayScheduleReorganizationPlacement(
      nextPlacedMatchIds,
      nextManualCourtItemOrder,
    );

    const placedTimelineItem = nextPreview?.timeline.find(
      (item) => item.match_id == draggedItem.itemId && item.is_relocated,
    );

    if (!nextPreview || !placedTimelineItem) {
      toast.error(
        "O jogo não foi incluído no cronograma calculado e permaneceu na bandeja.",
      );
      return;
    }

    setPlacedDayScheduleReorganizationMatchIds(nextPlacedMatchIds);
    setDayScheduleReorganizationManualCourtItemOrder(nextManualCourtItemOrder);
    setDayScheduleReorganizationManualPreview(nextPreview);
  };

  const handleApplyDayScheduleReorganization = async () => {
    const bracketEditionId = championshipBracketView.edition?.id;
    const preview = dayScheduleReorganizationManualPreview;
    const input = buildDayScheduleReorganizationInput();

    if (
      !bracketEditionId ||
      !input ||
      !preview ||
      preview.blockers.length > 0 ||
      placedDayScheduleReorganizationMatchIds.length !=
        selectedPendingMatchesForDayScheduleReorganization.length
    ) {
      return;
    }

    setApplyingDayScheduleReorganization(true);
    const { error } = await applyDayScheduleReorganization(
      bracketEditionId,
      input,
      preview.revision,
    );
    setApplyingDayScheduleReorganization(false);

    if (error) {
      toast.error(resolveAdminMatchesOperationalErrorMessage(error));
      return;
    }

    const relocatedMatchIdSet = new Set(placedDayScheduleReorganizationMatchIds);
    setSelectedPendingManualRelocationMatchIds((currentMatchIds) =>
      currentMatchIds.filter((matchId) => !relocatedMatchIdSet.has(matchId)),
    );
    handleCloseDayScheduleReorganizationDialog();
    await Promise.all([onRefetch(), onRefetchChampionshipBracket()]);
    toast.success("Programação do dia reorganizada com sucesso.");
  };

  const handleCloseManualRelocationSlotDialog = () => {
    if (loadingManualRelocationSlots || applyingManualRelocationSlot) {
      return;
    }

    setShowManualRelocationSlotDialog(false);
    setManualRelocationSlotPreview(null);
    setManualRelocationSlotId("");
    setManualRelocationSlotMatch(null);
  };

  const handleOpenManualRelocationSlotDialog = (match: Match) => {
    if (!canManageMatches || match.status != MatchStatus.SCHEDULED) {
      return;
    }

    if (!championshipBracketView.edition?.id) {
      toast.error("Não foi possível localizar a agenda do campeonato.");
      return;
    }

    const initialDate = resolveMatchScheduledDateValue(match) ?? "";
    const initialDay = bracketCourtSportsDays.find(
      (scheduleDay) => scheduleDay.event_date == initialDate,
    );
    const initialLocation = initialDay?.locations.find(
      (scheduleLocation) => scheduleLocation.name == match.location,
    );
    const initialCourt = initialLocation?.courts.find(
      (court) =>
        court.name == match.court_name &&
        court.sports.some((courtSport) => courtSport.sport_id == match.sport_id),
    );

    setManualRelocationSlotMatch(match);
    setManualRelocationSlotTargetDate(initialDate);
    setManualRelocationSlotTargetLocation(initialLocation?.name ?? "");
    setManualRelocationSlotTargetCourt(initialCourt?.name ?? "");
    setManualRelocationSlotId("");
    setManualRelocationSlotReason("WEATHER");
    setManualRelocationSlotNotes("");
    setManualRelocationSlotPreview(null);
    setShowManualRelocationSlotDialog(true);
  };

  const buildManualRelocationSlotInput = (
    includeSlotId: boolean,
  ): ManualMatchRelocationInput | null => {
    if (
      !manualRelocationSlotMatch ||
      !manualRelocationSlotTargetDate ||
      !manualRelocationSlotTargetLocation ||
      !manualRelocationSlotTargetCourt
    ) {
      toast.error("Selecione o dia, local e quadra de destino.");
      return null;
    }

    if (includeSlotId && !manualRelocationSlotId) {
      toast.error("Selecione um horário disponível.");
      return null;
    }

    return {
      match_ids: [manualRelocationSlotMatch.id],
      target_date: manualRelocationSlotTargetDate,
      target_location: manualRelocationSlotTargetLocation,
      target_court_name: manualRelocationSlotTargetCourt,
      target_start_time: null,
      target_slot_id: includeSlotId ? manualRelocationSlotId : null,
      insertion_position: "SLOT",
      reason: manualRelocationSlotReason,
      notes: manualRelocationSlotNotes.trim() || null,
    };
  };

  const handleLoadManualRelocationSlots = async () => {
    const bracketEditionId = championshipBracketView.edition?.id;
    const input = buildManualRelocationSlotInput(false);

    if (!bracketEditionId || !input) {
      return;
    }

    setLoadingManualRelocationSlots(true);
    const { data, error } = await previewManualMatchRelocationSlot(
      bracketEditionId,
      input,
    );
    setLoadingManualRelocationSlots(false);

    if (error || !data) {
      toast.error(error?.message ?? "Não foi possível buscar horários livres.");
      return;
    }

    setManualRelocationSlotId("");
    setManualRelocationSlotPreview(data);
  };

  const handlePreviewManualRelocationSlot = async () => {
    const bracketEditionId = championshipBracketView.edition?.id;
    const input = buildManualRelocationSlotInput(true);

    if (!bracketEditionId || !input) {
      return;
    }

    setLoadingManualRelocationSlots(true);
    const { data, error } = await previewManualMatchRelocationSlot(
      bracketEditionId,
      input,
    );
    setLoadingManualRelocationSlots(false);

    if (error || !data) {
      toast.error(error?.message ?? "Não foi possível calcular a prévia.");
      return;
    }

    setManualRelocationSlotPreview(data);
  };

  const handleApplyManualRelocationSlot = async () => {
    const bracketEditionId = championshipBracketView.edition?.id;
    const input = buildManualRelocationSlotInput(true);

    if (
      !bracketEditionId ||
      !input ||
      !manualRelocationSlotPreview ||
      manualRelocationSlotPreview.changes.length == 0 ||
      manualRelocationSlotPreview.blockers.length > 0
    ) {
      return;
    }

    setApplyingManualRelocationSlot(true);
    const { error } = await applyManualMatchRelocationSlot(
      bracketEditionId,
      input,
      manualRelocationSlotPreview.revision,
    );
    setApplyingManualRelocationSlot(false);

    if (error) {
      toast.error(resolveAdminMatchesOperationalErrorMessage(error));
      return;
    }

    setShowManualRelocationSlotDialog(false);
    setManualRelocationSlotPreview(null);
    setManualRelocationSlotId("");
    setManualRelocationSlotMatch(null);
    await Promise.all([onRefetch(), onRefetchChampionshipBracket()]);
    toast.success("Jogo encaixado na programação com sucesso.");
  };

  const handleDeleteMatchFromDialog = async () => {
    if (!pendingDeleteMatchId) {
      return;
    }

    setShowDeleteMatchDialog(false);

    await handleDelete(pendingDeleteMatchId);

    setPendingDeleteMatchId(null);
    setPendingDeleteMatchLabel("");
  };

  const handleToggleSelectAllMatches = (checked: CheckedState) => {
    if (checked == true) {
      setSelectedMatchIds(filteredMatchIds);
      return;
    }

    setSelectedMatchIds([]);
  };

  const handleToggleSelectedMatch = (
    matchId: string,
    checked: CheckedState,
  ) => {
    setSelectedMatchIds((currentSelectedMatchIds) => {
      if (checked == true) {
        if (currentSelectedMatchIds.includes(matchId)) {
          return currentSelectedMatchIds;
        }

        return [...currentSelectedMatchIds, matchId];
      }

      return currentSelectedMatchIds.filter(
        (selectedMatchId) => selectedMatchId != matchId,
      );
    });
  };

  const handleToggleSelectedPendingManualRelocationMatch = (
    matchId: string,
    checked: CheckedState,
  ) => {
    setSelectedPendingManualRelocationMatchIds((currentMatchIds) => {
      if (checked == true) {
        return currentMatchIds.includes(matchId)
          ? currentMatchIds
          : [...currentMatchIds, matchId];
      }

      return currentMatchIds.filter((currentMatchId) => currentMatchId != matchId);
    });
  };

  const handleToggleSelectedPendingManualRelocationMatchGroup = (
    matchIds: string[],
    checked: CheckedState,
  ) => {
    setSelectedPendingManualRelocationMatchIds((currentMatchIds) => {
      const matchIdSet = new Set(matchIds);

      if (checked == true) {
        return [...new Set([...currentMatchIds, ...matchIds])];
      }

      return currentMatchIds.filter((matchId) => !matchIdSet.has(matchId));
    });
  };

  const handleOpenHoldMatchesDialog = () => {
    if (!canManageMatches || selectedMatchIds.length == 0) {
      toast.error("Selecione ao menos um jogo agendado.");
      return;
    }

    const selectedMatches = matches.filter((match) => selectedMatchIds.includes(match.id));

    if (selectedMatches.some((match) => match.status != MatchStatus.SCHEDULED)) {
      toast.error("Somente jogos agendados podem ser guardados para realocação.");
      return;
    }

    setHoldMatchesReason("WEATHER");
    setHoldMatchesNotes("");
    setShowHoldMatchesDialog(true);
  };

  const handleHoldMatchesForRelocation = async () => {
    const bracketEditionId = championshipBracketView.edition?.id;

    if (!bracketEditionId || selectedMatchIds.length == 0) {
      return;
    }

    setHoldingMatchesForRelocation(true);
    const { error } = await holdMatchesForManualRelocation(bracketEditionId, {
      match_ids: selectedMatchIds,
      reason: holdMatchesReason,
      notes: holdMatchesNotes.trim() || null,
      previous_labels: Object.fromEntries(
        matches
          .filter((match) => selectedMatchIds.includes(match.id))
          .map((match) => [
            match.id,
            resolveDisplayedMatchQueueLabel(
              match,
              visualQueuePositionByMatchId[match.id],
            ),
          ]),
      ),
    });
    setHoldingMatchesForRelocation(false);

    if (error) {
      toast.error(resolveAdminMatchesOperationalErrorMessage(error));
      return;
    }

    setShowHoldMatchesDialog(false);
    setSelectedMatchIds([]);
    setActiveMatchesSection("PENDING");
    await Promise.all([onRefetch(), onRefetchChampionshipBracket()]);
    toast.success("Jogos guardados aguardando nova realocação.");
  };

  const handleOpenDeleteSelectedMatchesDialog = () => {
    if (!canManageMatches) {
      return;
    }

    if (selectedMatchIds.length == 0) {
      toast.error("Selecione ao menos um jogo.");
      return;
    }

    setShowDeleteSelectedMatchesDialog(true);
  };

  const handleDeleteSelectedMatches = async () => {
    if (!canManageMatches) {
      return;
    }

    if (selectedMatchIds.length == 0) {
      toast.error("Selecione ao menos um jogo.");
      return;
    }

    setShowDeleteSelectedMatchesDialog(false);

    setDeletingMatches(true);

    const { error } = await supabase
      .from("matches")
      .delete()
      .in("id", selectedMatchIds);

    setDeletingMatches(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Jogos removidos.");
    setSelectedMatchIds([]);
    onRefetch();
    onRefetchChampionshipBracket();
  };

  const handleUpdateMatchesReviewState = async ({
    matchIds,
    reviewed,
    successMessage,
    clearSelectionAfterSave = false,
  }: {
    matchIds: string[];
    reviewed: boolean;
    successMessage: string;
    clearSelectionAfterSave?: boolean;
  }) => {
    if (!canManageMatches || matchIds.length == 0) {
      return;
    }

    setSavingReviewStateByMatchId((currentSavingReviewStateByMatchId) => {
      return matchIds.reduce<Record<string, boolean>>(
        (nextSavingReviewStateByMatchId, matchId) => ({
          ...nextSavingReviewStateByMatchId,
          [matchId]: true,
        }),
        { ...currentSavingReviewStateByMatchId },
      );
    });

    const reviewStateUpdateQuery =
      matchIds.length == 1
        ? supabase
            .from("matches")
            .update({ is_score_sheet_reviewed: reviewed })
            .eq("id", matchIds[0])
        : supabase
            .from("matches")
            .update({ is_score_sheet_reviewed: reviewed })
            .in("id", matchIds);

    const { error } = await reviewStateUpdateQuery;

    setSavingReviewStateByMatchId((currentSavingReviewStateByMatchId) => {
      const nextSavingReviewStateByMatchId = {
        ...currentSavingReviewStateByMatchId,
      };

      matchIds.forEach((matchId) => {
        delete nextSavingReviewStateByMatchId[matchId];
      });

      return nextSavingReviewStateByMatchId;
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    if (clearSelectionAfterSave) {
      setSelectedMatchIds([]);
    }

    toast.success(successMessage);
    await onRefetch();
  };

  const loadMatchScoreSheetAwardsContext = useCallback(
    async (matchId: string) => {
      setLoadingScoreSheetAwardsByMatchId((currentLoadingState) => ({
        ...currentLoadingState,
        [matchId]: true,
      }));

      const { data, error } = await supabaseLoose.rpc(
        "get_match_score_sheet_awards_context",
        {
          _match_id: matchId,
        },
      );

      setLoadingScoreSheetAwardsByMatchId((currentLoadingState) => ({
        ...currentLoadingState,
        [matchId]: false,
      }));

      if (error) {
        toast.error(resolveAdminMatchesOperationalErrorMessage(error));
        return null;
      }

      const context = (data ?? null) as MatchScoreSheetAwardsContext | null;

      if (!context || !context.match_id) {
        toast.error("Não foi possível carregar os dados da súmula.");
        return null;
      }

      const match = matches.find((item) => item.id == matchId);
      const supportsCards =
        match?.supports_cards ||
        championshipSports.find(
          (championshipSport) => championshipSport.sport_id == match?.sport_id,
        )?.supports_cards === true;
      const resolvedContext = match
        ? resolveScoreSheetAwardsContextWithMatchDisciplineFallback(
            context,
            match,
            supportsCards,
          )
        : context;

      setScoreSheetAwardsDraftByMatchId((currentDraftByMatchId) => ({
        ...currentDraftByMatchId,
        [matchId]: resolveScoreSheetDraftFromContext(resolvedContext),
      }));

      return resolvedContext;
    },
    [championshipSports, matches],
  );

  const handleOpenScoreSheetReview = async (matchId: string) => {
    setActiveScoreSheetReviewMatchId(matchId);

    const existingDraft = scoreSheetAwardsDraftByMatchId[matchId];
    if (existingDraft) {
      return;
    }

    await loadMatchScoreSheetAwardsContext(matchId);
  };

  const handleCloseScoreSheetReviewDialog = () => {
    if (isSavingActiveScoreSheetAwardsContext) {
      return;
    }

    setActiveScoreSheetReviewMatchId(null);
  };

  const handleUpdateScoreSheetAwardsDraft = (
    matchId: string,
    updater: (draft: MatchScoreSheetAwardsDraft) => MatchScoreSheetAwardsDraft,
  ) => {
    setScoreSheetAwardsDraftByMatchId((currentDraftByMatchId) => {
      const currentDraft = currentDraftByMatchId[matchId];

      if (!currentDraft) {
        return currentDraftByMatchId;
      }

      return {
        ...currentDraftByMatchId,
        [matchId]: updater(currentDraft),
      };
    });
  };

  const handleDeleteAwardPlayer = (
    matchId: string,
    side: "home" | "away",
    playerId: string,
  ) => {
    handleUpdateScoreSheetAwardsDraft(matchId, (draft) => {
      const nextPlayerOptions = (
        side == "home" ? draft.homePlayerOptions : draft.awayPlayerOptions
      ).filter((p) => p.id !== playerId);
      const clearGoalId = (selections: GoalSelection[]) =>
        selections.map((gs) =>
          gs.scorerId == playerId ? { ...gs, scorerId: "" } : gs,
        );
      return {
        ...draft,
        homePlayerOptions:
          side == "home" ? nextPlayerOptions : draft.homePlayerOptions,
        awayPlayerOptions:
          side == "away" ? nextPlayerOptions : draft.awayPlayerOptions,
        homeGoalSelections: clearGoalId(draft.homeGoalSelections),
        awayGoalSelections: clearGoalId(draft.awayGoalSelections),
        homeYellowCardSelections: clearGoalId(draft.homeYellowCardSelections),
        awayYellowCardSelections: clearGoalId(draft.awayYellowCardSelections),
        homeRedCardSelections: clearGoalId(draft.homeRedCardSelections),
        awayRedCardSelections: clearGoalId(draft.awayRedCardSelections),
        homeBlueCardSelections: clearGoalId(draft.homeBlueCardSelections),
        awayBlueCardSelections: clearGoalId(draft.awayBlueCardSelections),
      };
    });
  };

  const handleConfirmEditAwardPlayer = (
    matchId: string,
    side: "home" | "away",
  ) => {
    const key = `${matchId}:${side}`;
    const editingState = editingPlayerByKey[key];

    if (!editingState) return;

    const normalizedName = editingState.name.trim();

    if (!normalizedName) {
      toast.error("O nome do jogador não pode ficar em branco.");
      return;
    }

    const oldId = editingState.playerId;
    const newId = oldId.startsWith(NEW_PLAYER_OPTION_PREFIX)
      ? `${NEW_PLAYER_OPTION_PREFIX}${normalizedName}`
      : oldId;

    handleUpdateScoreSheetAwardsDraft(matchId, (draft) => {
      const playerOptions =
        side == "home" ? draft.homePlayerOptions : draft.awayPlayerOptions;
      const nextPlayerOptions = playerOptions
        .map((p) =>
          p.id == oldId ? { ...p, id: newId, name: normalizedName } : p,
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      const updateGoalId = (selections: GoalSelection[]) =>
        selections.map((gs) =>
          gs.scorerId == oldId ? { ...gs, scorerId: newId } : gs,
        );
      return {
        ...draft,
        homePlayerOptions:
          side == "home" ? nextPlayerOptions : draft.homePlayerOptions,
        awayPlayerOptions:
          side == "away" ? nextPlayerOptions : draft.awayPlayerOptions,
        homeGoalSelections: updateGoalId(draft.homeGoalSelections),
        awayGoalSelections: updateGoalId(draft.awayGoalSelections),
        homeYellowCardSelections: updateGoalId(draft.homeYellowCardSelections),
        awayYellowCardSelections: updateGoalId(draft.awayYellowCardSelections),
        homeRedCardSelections: updateGoalId(draft.homeRedCardSelections),
        awayRedCardSelections: updateGoalId(draft.awayRedCardSelections),
        homeBlueCardSelections: updateGoalId(draft.homeBlueCardSelections),
        awayBlueCardSelections: updateGoalId(draft.awayBlueCardSelections),
      };
    });

    setEditingPlayerByKey((prev) => ({ ...prev, [key]: null }));
  };

  const handleAddInlineAwardPlayer = (
    matchId: string,
    side: "home" | "away",
  ) => {
    const currentDraft = scoreSheetAwardsDraftByMatchId[matchId];

    if (!currentDraft) {
      return;
    }

    const rawPlayerName =
      side == "home"
        ? currentDraft.newHomePlayerName
        : currentDraft.newAwayPlayerName;
    const normalizedPlayerName = rawPlayerName.trim();

    if (!normalizedPlayerName) {
      toast.error("Informe o nome do jogador para cadastrar.");
      return;
    }

    const syntheticPlayerId = `${NEW_PLAYER_OPTION_PREFIX}${normalizedPlayerName}`;
    const playerOptions =
      side == "home"
        ? currentDraft.homePlayerOptions
        : currentDraft.awayPlayerOptions;

    if (
      playerOptions.some((playerOption) => playerOption.id == syntheticPlayerId)
    ) {
      toast.error("Este jogador já está na lista desta equipe.");
      return;
    }

    const buttonKey = `${matchId}:${side}`;

    setAddPlayerButtonStateByKey((prev) => ({
      ...prev,
      [buttonKey]: "loading",
    }));

    setTimeout(() => {
      handleUpdateScoreSheetAwardsDraft(matchId, (draft) => {
        const nextPlayerOption = {
          id: syntheticPlayerId,
          name: normalizedPlayerName,
        };

        const nextPlayerOptions = [
          ...(side == "home"
            ? draft.homePlayerOptions
            : draft.awayPlayerOptions),
          nextPlayerOption,
        ].sort((a, b) => a.name.localeCompare(b.name));

        return {
          ...draft,
          homePlayerOptions:
            side == "home" ? nextPlayerOptions : draft.homePlayerOptions,
          awayPlayerOptions:
            side == "away" ? nextPlayerOptions : draft.awayPlayerOptions,
          newHomePlayerName: side == "home" ? "" : draft.newHomePlayerName,
          newAwayPlayerName: side == "away" ? "" : draft.newAwayPlayerName,
        };
      });

      setAddPlayerButtonStateByKey((prev) => ({
        ...prev,
        [buttonKey]: "success",
      }));

      newPlayerInputRefs.current[buttonKey]?.focus();

      setTimeout(() => {
        setAddPlayerButtonStateByKey((prev) => {
          const next = { ...prev };
          delete next[buttonKey];
          return next;
        });
      }, 1200);
    }, 400);
  };

  const handleSaveScoreSheetAwards = async () => {
    if (
      !activeScoreSheetReviewMatchId ||
      !activeScoreSheetReviewMatch ||
      !activeScoreSheetAwardsDraft
    ) {
      return;
    }

    const { isWalkover } = activeScoreSheetAwardsDraft;

    if (!isWalkover) {
      const hasIncompleteGoals =
        activeScoreSheetAwardsDraft.requiresGoalScorers &&
        [
          activeScoreSheetAwardsDraft.homeGoalSelections,
          activeScoreSheetAwardsDraft.awayGoalSelections,
        ].some((selections) =>
          selections.some((selection) => selection.scorerId.trim().length == 0),
        );
      const hasIncompleteDiscipline = [
        activeScoreSheetAwardsDraft.homeYellowCardSelections,
        activeScoreSheetAwardsDraft.awayYellowCardSelections,
        activeScoreSheetAwardsDraft.homeRedCardSelections,
        activeScoreSheetAwardsDraft.awayRedCardSelections,
        activeScoreSheetAwardsDraft.homeBlueCardSelections,
        activeScoreSheetAwardsDraft.awayBlueCardSelections,
      ].some((selections) =>
        selections.some((selection) => selection.scorerId.trim().length == 0),
      );

      if (hasIncompleteGoals) {
        toast.error("Preencha os autores de todos os gols antes de salvar.");
        return;
      }

      if (hasIncompleteDiscipline) {
        toast.error(
          "Informe o atleta responsável por cada cartão antes de salvar.",
        );
        return;
      }
    }

    setSavingScoreSheetAwardsByMatchId((currentSavingState) => ({
      ...currentSavingState,
      [activeScoreSheetReviewMatchId]: true,
    }));

    const homeGoalScorersPayload =
      activeScoreSheetAwardsDraft.homeGoalSelections.map((gs) =>
        resolveScoreSheetSelectionOptionByValue(
          gs.scorerId,
          activeScoreSheetAwardsDraft.homePlayerOptions,
        ),
      );
    const awayGoalScorersPayload =
      activeScoreSheetAwardsDraft.awayGoalSelections.map((gs) =>
        resolveScoreSheetSelectionOptionByValue(
          gs.scorerId,
          activeScoreSheetAwardsDraft.awayPlayerOptions,
        ),
      );
    const homeYellowCardPlayersPayload =
      activeScoreSheetAwardsDraft.homeYellowCardSelections
        .map((selection) =>
          resolveScoreSheetSelectionOptionByValue(
            selection.scorerId,
            activeScoreSheetAwardsDraft.homePlayerOptions,
          ),
        );
    const awayYellowCardPlayersPayload =
      activeScoreSheetAwardsDraft.awayYellowCardSelections
        .map((selection) =>
          resolveScoreSheetSelectionOptionByValue(
            selection.scorerId,
            activeScoreSheetAwardsDraft.awayPlayerOptions,
          ),
        );
    const homeRedCardPlayersPayload =
      activeScoreSheetAwardsDraft.homeRedCardSelections.map((selection) =>
        resolveScoreSheetSelectionOptionByValue(
          selection.scorerId,
          activeScoreSheetAwardsDraft.homePlayerOptions,
        ),
      );
    const awayRedCardPlayersPayload =
      activeScoreSheetAwardsDraft.awayRedCardSelections.map((selection) =>
        resolveScoreSheetSelectionOptionByValue(
          selection.scorerId,
          activeScoreSheetAwardsDraft.awayPlayerOptions,
        ),
      );
    const homeBlueCardPlayersPayload =
      activeScoreSheetAwardsDraft.homeBlueCardSelections.map((selection) =>
        resolveScoreSheetSelectionOptionByValue(
          selection.scorerId,
          activeScoreSheetAwardsDraft.homePlayerOptions,
        ),
      );
    const awayBlueCardPlayersPayload =
      activeScoreSheetAwardsDraft.awayBlueCardSelections.map((selection) =>
        resolveScoreSheetSelectionOptionByValue(
          selection.scorerId,
          activeScoreSheetAwardsDraft.awayPlayerOptions,
        ),
      );
    const { error } = await supabaseLoose.rpc("save_match_score_sheet_awards", {
      _match_id: activeScoreSheetReviewMatch.id,
      _home_goal_scorers: homeGoalScorersPayload,
      _away_goal_scorers: awayGoalScorersPayload,
      _home_yellow_card_players: homeYellowCardPlayersPayload,
      _away_yellow_card_players: awayYellowCardPlayersPayload,
      _home_red_card_players: homeRedCardPlayersPayload,
      _away_red_card_players: awayRedCardPlayersPayload,
      _home_blue_card_players: homeBlueCardPlayersPayload,
      _away_blue_card_players: awayBlueCardPlayersPayload,
    });

    setSavingScoreSheetAwardsByMatchId((currentSavingState) => ({
      ...currentSavingState,
      [activeScoreSheetReviewMatchId]: false,
    }));

    if (error) {
      toast.error(resolveAdminMatchesOperationalErrorMessage(error));
      return;
    }

    toast.success("Revisão de súmula salva.");
    setActiveScoreSheetReviewMatchId(null);
    await onRefetch();
  };

  const handleToggleMatchScoreSheetReviewed = async (
    matchId: string,
    checked: CheckedState,
  ) => {
    if (!canManageMatches) {
      return;
    }

    const match = matches.find((matchItem) => matchItem.id == matchId);

    if (!match) {
      return;
    }

    if (
      checked === true &&
      requiresIndividualScoreSheetReview(match)
    ) {
      await handleOpenScoreSheetReview(matchId);
      return;
    }

    await handleUpdateMatchesReviewState({
      matchIds: [matchId],
      reviewed: checked === true,
      successMessage:
        checked === true
          ? "Jogo marcado como conferido na súmula."
          : "Jogo desmarcado da conferência de súmula.",
    });
  };

  const handleBulkUpdateFilteredMatchesReviewState = async (
    reviewed: boolean,
  ) => {
    if (!canManageMatches || bulkReviewAction != null) {
      return;
    }

    const filteredMatchIdSet = new Set(filteredMatchIds);
    const selectedFilteredMatchIds = selectedMatchIds.filter(
      (selectedMatchId) => filteredMatchIdSet.has(selectedMatchId),
    );

    if (selectedFilteredMatchIds.length == 0) {
      toast.error("Selecione ao menos um jogo filtrado.");
      return;
    }

    if (reviewed) {
      const hasMatchRequiringIndividualScoreSheetReview = selectedFilteredMatchIds.some(
        (selectedMatchId) => {
          const selectedMatch = matches.find(
            (match) => match.id == selectedMatchId,
          );
          return (
            selectedMatch != null &&
            requiresIndividualScoreSheetReview(selectedMatch)
          );
        },
      );

      if (hasMatchRequiringIndividualScoreSheetReview) {
        toast.error(
          "Para marcar como revisado, use a revisão individual de súmula para registrar os vínculos obrigatórios.",
        );
        return;
      }
    }

    setBulkReviewAction(reviewed ? "MARK" : "UNMARK");

    try {
      await handleUpdateMatchesReviewState({
        matchIds: selectedFilteredMatchIds,
        reviewed,
        successMessage: reviewed
          ? `${selectedFilteredMatchIds.length} jogo(s) marcado(s) como conferido(s).`
          : `${selectedFilteredMatchIds.length} jogo(s) removido(s) da conferência.`,
        clearSelectionAfterSave: true,
      });
    } finally {
      setBulkReviewAction(null);
    }
  };

  const handleStartEditingMatch = (match: Match) => {
    if (!canManageMatches) {
      return;
    }

    const matchBracketBinding =
      groupStageMatchBracketBindingByMatchId[match.id];
    setEditingMatchId(match.id);
    setEditingMatchDraft(
      resolveInitialEditingMatchDraft(
        match,
        matchBracketBinding
          ? `${matchBracketBinding.competition_id}:${matchBracketBinding.group_id}`
          : "",
      ),
    );
    setEditingMatchSetsDraft(resolveRecordedMatchSets(match));
  };

  const handleCancelEditingMatch = () => {
    setSavingEditingMatch(false);
    setEditingMatchId(null);
    setEditingMatchDraft(null);
    setEditingMatchSetsDraft([]);
    setEditingAvailableScheduleSlots([]);
    setLoadingEditingAvailableScheduleSlots(false);
    setShowEditReviewConfirmationDialog(false);
  };

  const handleAddEditingMatchSet = () => {
    setEditingMatchSetsDraft((currentEditingMatchSetsDraft) => [
      ...currentEditingMatchSetsDraft,
      {
        set_number: currentEditingMatchSetsDraft.length + 1,
        home_points: 0,
        away_points: 0,
      },
    ]);
  };

  const handleDeleteEditingMatchSet = (matchSetIndex: number) => {
    setEditingMatchSetsDraft((currentEditingMatchSetsDraft) => {
      return currentEditingMatchSetsDraft.filter(
        (_, currentMatchSetIndex) => currentMatchSetIndex != matchSetIndex,
      );
    });
  };

  const handleUpdateEditingMatchSetPoints = (
    matchSetIndex: number,
    side: "home" | "away",
    value: string,
  ) => {
    const parsedValue = resolveParsedScoreInputValue(value);

    setEditingMatchSetsDraft((currentEditingMatchSetsDraft) => {
      return currentEditingMatchSetsDraft.map(
        (matchSet, currentMatchSetIndex) => {
          if (currentMatchSetIndex != matchSetIndex) {
            return matchSet;
          }

          return {
            ...matchSet,
            home_points: side == "home" ? parsedValue : matchSet.home_points,
            away_points: side == "away" ? parsedValue : matchSet.away_points,
          };
        },
      );
    });
  };

  const handleSaveEditingMatch = async (
    scoreSheetReviewSaveDecision?: ScoreSheetReviewSaveDecision,
  ) => {
    if (!canManageMatches) {
      return;
    }

    if (!editingMatchId || !editingMatchDraft) {
      return;
    }

    const normalizedLocation = editingMatchDraft.location.trim();
    const normalizedCourtName = editingMatchDraft.courtName.trim();

    if (
      !editingMatchDraft.sportId ||
      !editingMatchDraft.homeTeamId ||
      !editingMatchDraft.awayTeamId ||
      !normalizedLocation ||
      !normalizedCourtName ||
      !editingMatchDraft.scheduledDate
    ) {
      toast.error("Preencha todos os campos da edição.");
      return;
    }

    if (editingMatchDraft.homeTeamId === editingMatchDraft.awayTeamId) {
      toast.error("Atléticas devem ser diferentes.");
      return;
    }

    if (editingMatchBracketBinding && !selectedEditingGroupOption) {
      toast.error("Selecione o grupo do jogo antes de salvar.");
      return;
    }

    if (!editingMatch) {
      toast.error("Não foi possível localizar o jogo para editar.");
      return;
    }

    const originalSelectedGroupOptionValue = editingMatchBracketBinding
      ? `${editingMatchBracketBinding.competition_id}:${editingMatchBracketBinding.group_id}`
      : "";
    const originalEditingDraft = resolveInitialEditingMatchDraft(
      editingMatch,
      originalSelectedGroupOptionValue,
    );
    const resolvedScheduledDate = resolveDateOnlyString(
      editingMatchDraft.scheduledDate,
    );
    const originalScheduledDate = originalEditingDraft.scheduledDate
      ? resolveDateOnlyString(originalEditingDraft.scheduledDate)
      : null;
    const resolvedStartTimeValue =
      editingMatchDraft.startTime?.toISOString() ?? null;
    const originalStartTimeValue =
      originalEditingDraft.startTime?.toISOString() ?? null;
    const resolvedDivision = championshipUsesDivisions
      ? editingMatchDraft.division
      : null;
    const originalDivision = championshipUsesDivisions
      ? originalEditingDraft.division
      : null;
    const didChangeLocation =
      normalizedLocation != (originalEditingDraft.location ?? "");
    const didChangeCourtName =
      normalizedCourtName != (originalEditingDraft.courtName ?? "");
    const didChangeScheduledDate =
      resolvedScheduledDate != originalScheduledDate;
    const didChangeStartTime = resolvedStartTimeValue != originalStartTimeValue;
    const didChangeGameSlot =
      editingMatchDraft.gameSlot != (originalEditingDraft.gameSlot ?? "");
    const didChangeRepresentationMode =
      editingMatchDraft.manualRepresentationMode !=
      originalEditingDraft.manualRepresentationMode;
    const didChangeScheduledMatchPlacement =
      didChangeLocation ||
      didChangeCourtName ||
      didChangeScheduledDate ||
      didChangeStartTime ||
      didChangeGameSlot;
    const didChangeLogisticsFields =
      didChangeScheduledMatchPlacement || didChangeRepresentationMode;
    const didChangeSport =
      (editingMatchDraft.sportId ?? "") != (originalEditingDraft.sportId ?? "");
    const didChangeNaipe =
      editingMatchDraft.naipe != originalEditingDraft.naipe;
    const didChangeDivision = resolvedDivision != originalDivision;
    const didChangeHomeTeam =
      (editingMatchDraft.homeTeamId ?? "") !=
      (originalEditingDraft.homeTeamId ?? "");
    const didChangeAwayTeam =
      (editingMatchDraft.awayTeamId ?? "") !=
      (originalEditingDraft.awayTeamId ?? "");
    const didChangeGroupBinding =
      editingMatchDraft.selectedGroupOptionValue !=
      originalSelectedGroupOptionValue;
    const didChangeStructuralFields =
      didChangeSport ||
      didChangeNaipe ||
      didChangeDivision ||
      didChangeHomeTeam ||
      didChangeAwayTeam ||
      didChangeGroupBinding;
    const didChangeStatus = editingMatchDraft.status != editingMatch.status;
    const requiresAvailableScheduleSlot =
      canEditScheduledMatchSetup &&
      (didChangeScheduledMatchPlacement ||
        didChangeStructuralFields ||
        (didChangeRepresentationMode &&
          editingMatch.is_manual_schedule_override != true));

    if (!editingAllowedStatuses.includes(editingMatchDraft.status)) {
      toast.error(
        "A transição de status selecionada não é permitida para este jogo.",
      );
      return;
    }

    if (
      (didChangeLogisticsFields || didChangeStructuralFields) &&
      !canEditScheduledMatchSetup
    ) {
      toast.error(
        "Depois que o jogo sai de agendado, só é possível editar status e resultado.",
      );
      return;
    }

    if (
      editingMatch.status != MatchStatus.SCHEDULED &&
      editingMatchDraft.status == MatchStatus.SCHEDULED
    ) {
      toast.error(
        "Para voltar ao agendamento, use a ação dedicada no Controle ao Vivo.",
      );
      return;
    }

    if (
      !editingMatchDraft.startTime ||
      (requiresAvailableScheduleSlot && !selectedEditingScheduleSlot)
    ) {
      toast.error("Selecione um horário disponível para o jogo.");
      return;
    }

    if (
      editingMatch?.is_score_sheet_reviewed &&
      scoreSheetReviewSaveDecision == null
    ) {
      setShowEditReviewConfirmationDialog(true);
      return;
    }

    const shouldKeepScoreSheetReview =
      editingMatch?.is_score_sheet_reviewed == true &&
      scoreSheetReviewSaveDecision != "REMOVE_REVIEW";

    if (scoreSheetReviewSaveDecision != null) {
      setShowEditReviewConfirmationDialog(false);
    }

    setSavingEditingMatch(true);

    // Para jogos do primeiro round do KO: se o novo time já está na chave, acionar o swap
    const editingBracketMatch =
      knockoutFirstRoundBracketMatchByMatchId[editingMatchId];
    if (editingBracketMatch) {
      const firstRoundTeamIds =
        knockoutFirstRoundTeamIdsByCompetitionId[
          editingBracketMatch.competition_id
        ] ?? new Set<string>();
      const originalMatch = matches.find((m) => m.id === editingMatchId);

      const homeChanged =
        originalMatch &&
        editingMatchDraft.homeTeamId !== originalMatch.home_team_id;
      const awayChanged =
        originalMatch &&
        editingMatchDraft.awayTeamId !== originalMatch.away_team_id;

      if (
        homeChanged &&
        originalMatch.home_team_id &&
        firstRoundTeamIds.has(editingMatchDraft.homeTeamId)
      ) {
        const { error: swapError } = await swapChampionshipKnockoutBracketTeams(
          editingBracketMatch.competition_id,
          originalMatch.home_team_id,
          editingMatchDraft.homeTeamId,
        );
        if (swapError) {
          setSavingEditingMatch(false);
          toast.error("Erro ao trocar equipes na chave.");
          return;
        }
      }

      if (
        awayChanged &&
        originalMatch.away_team_id &&
        firstRoundTeamIds.has(editingMatchDraft.awayTeamId)
      ) {
        const { error: swapError } = await swapChampionshipKnockoutBracketTeams(
          editingBracketMatch.competition_id,
          originalMatch.away_team_id,
          editingMatchDraft.awayTeamId,
        );
        if (swapError) {
          setSavingEditingMatch(false);
          toast.error("Erro ao trocar equipes na chave.");
          return;
        }
      }
    }

    const isEditingSetRuleBySelectedSport =
      championshipSportResultRuleBySportId.get(editingMatchDraft.sportId) ==
      ChampionshipSportResultRule.SETS;
    const isEditingSportWithCardsBySelectedSport =
      championshipSportSupportsCardsBySportId.get(editingMatchDraft.sportId) ==
      true;
    const selectedEditingSport = availableSports.find(
      (sport) => sport.id == editingMatchDraft.sportId,
    );
    const isEditingHandballBySelectedSport = isHandballSportName(
      selectedEditingSport?.name,
    );
    const normalizedEditingMatchSetsDraft = resolveNormalizedMatchSetsDraft(
      editingMatchSetsDraft,
    );

    if (isEditingSetRuleBySelectedSport) {
      const hasInvalidEmptySet = normalizedEditingMatchSetsDraft.some(
        (matchSet) => {
          return matchSet.home_points == 0 && matchSet.away_points == 0;
        },
      );

      if (hasInvalidEmptySet) {
        setSavingEditingMatch(false);
        toast.error(
          "Informe um placar válido para todos os sets ou remova os sets vazios.",
        );
        return;
      }

      const hasInvalidDrawSet = normalizedEditingMatchSetsDraft.some(
        (matchSet) => {
          return matchSet.home_points == matchSet.away_points;
        },
      );

      if (hasInvalidDrawSet) {
        setSavingEditingMatch(false);
        toast.error("Um set não pode terminar empatado.");
        return;
      }
    }

    const recordedEditingMatchSets = resolveNormalizedMatchSetsDraft(
      resolveRecordedMatchSets(editingMatch),
    );
    const didChangeMatchSets = !areMatchSetInputsEqual(
      normalizedEditingMatchSetsDraft,
      recordedEditingMatchSets,
    );
    const shouldSyncMatchSets =
      didChangeMatchSets ||
      (isEditingSetRuleBySelectedSport &&
        recordedEditingMatchSets.length == 0 &&
        normalizedEditingMatchSetsDraft.length > 0);
    const shouldTransitionMatchToLive =
      editingMatchDraft.status == MatchStatus.LIVE &&
      editingMatch.status == MatchStatus.SCHEDULED;
    const shouldReopenFinishedMatchAsLive =
      editingMatchDraft.status == MatchStatus.LIVE &&
      editingMatch.status == MatchStatus.FINISHED;
    const shouldTransitionMatchToFinished =
      editingMatchDraft.status == MatchStatus.FINISHED &&
      editingMatch.status == MatchStatus.LIVE;
    const editingMatchBracketContext =
      matchBracketContextByMatchId[editingMatch.id] ?? null;
    const shouldPreserveTieBreakResolution =
      editingMatchDraft.status == MatchStatus.FINISHED;
    const resolvedSetWins = isEditingSetRuleBySelectedSport
      ? resolveSetWins(normalizedEditingMatchSetsDraft)
      : null;
    const resolvedHomeScore = resolvedSetWins
      ? resolvedSetWins.home_sets
      : resolveSafeScoreValue(editingMatchDraft.homeScore);
    const resolvedAwayScore = resolvedSetWins
      ? resolvedSetWins.away_sets
      : resolveSafeScoreValue(editingMatchDraft.awayScore);
    const shouldPersistSocietyPenaltyShootout = shouldUseSocietyPenaltyShootout(
      {
        championship: selectedChampionship,
        bracketContext: editingMatchBracketContext,
        status: editingMatchDraft.status,
        homeScore: resolvedHomeScore,
        awayScore: resolvedAwayScore,
      },
    );
    const resolvedHomePenaltyScore = shouldPersistSocietyPenaltyShootout
      ? editingMatchDraft.homePenaltyScore
      : null;
    const resolvedAwayPenaltyScore = shouldPersistSocietyPenaltyShootout
      ? editingMatchDraft.awayPenaltyScore
      : null;

    if (
      shouldPersistSocietyPenaltyShootout &&
      (resolvedHomePenaltyScore == null || resolvedAwayPenaltyScore == null)
    ) {
      setSavingEditingMatch(false);
      toast.error("Informe o placar dos pênaltis para as duas atléticas.");
      return;
    }

    if (
      shouldPersistSocietyPenaltyShootout &&
      resolvedHomePenaltyScore != null &&
      resolvedAwayPenaltyScore != null &&
      resolvedHomePenaltyScore == resolvedAwayPenaltyScore
    ) {
      setSavingEditingMatch(false);
      toast.error("O placar dos pênaltis precisa definir um vencedor.");
      return;
    }

    const resolvedSocietyPenaltyWinnerTeamId =
      shouldPersistSocietyPenaltyShootout &&
      resolvedHomePenaltyScore != null &&
      resolvedAwayPenaltyScore != null
        ? resolvedHomePenaltyScore > resolvedAwayPenaltyScore
          ? editingMatchDraft.homeTeamId
          : editingMatchDraft.awayTeamId
        : null;
    const resolvedHomeYellowCards = isEditingSportWithCardsBySelectedSport
      ? resolveSafeScoreValue(editingMatchDraft.homeYellowCards)
      : 0;
    const resolvedHomeRedCards = isEditingSportWithCardsBySelectedSport
      ? resolveSafeScoreValue(editingMatchDraft.homeRedCards)
      : 0;
    const resolvedAwayYellowCards = isEditingSportWithCardsBySelectedSport
      ? resolveSafeScoreValue(editingMatchDraft.awayYellowCards)
      : 0;
    const resolvedAwayRedCards = isEditingSportWithCardsBySelectedSport
      ? resolveSafeScoreValue(editingMatchDraft.awayRedCards)
      : 0;
    const resolvedHomeBlueCards = isEditingHandballBySelectedSport
      ? resolveSafeScoreValue(editingMatchDraft.homeBlueCards)
      : 0;
    const resolvedHomeTwoMinutePenalties = isEditingHandballBySelectedSport
      ? resolveSafeScoreValue(editingMatchDraft.homeTwoMinutePenalties)
      : 0;
    const resolvedAwayBlueCards = isEditingHandballBySelectedSport
      ? resolveSafeScoreValue(editingMatchDraft.awayBlueCards)
      : 0;
    const resolvedAwayTwoMinutePenalties = isEditingHandballBySelectedSport
      ? resolveSafeScoreValue(editingMatchDraft.awayTwoMinutePenalties)
      : 0;
    const didChangeScoreFields =
      resolvedHomeScore != editingMatch.home_score ||
      resolvedAwayScore != editingMatch.away_score;
    const didChangeCardFields =
      resolvedHomeYellowCards != editingMatch.home_yellow_cards ||
      resolvedHomeRedCards != editingMatch.home_red_cards ||
      resolvedAwayYellowCards != editingMatch.away_yellow_cards ||
      resolvedAwayRedCards != editingMatch.away_red_cards ||
      resolvedHomeBlueCards != (editingMatch.home_blue_cards ?? 0) ||
      resolvedHomeTwoMinutePenalties !=
        (editingMatch.home_two_minute_penalties ?? 0) ||
      resolvedAwayBlueCards != (editingMatch.away_blue_cards ?? 0) ||
      resolvedAwayTwoMinutePenalties !=
        (editingMatch.away_two_minute_penalties ?? 0);
    const didChangePenaltyShootoutFields =
      resolvedHomePenaltyScore != (editingMatch.home_penalty_score ?? null) ||
      resolvedAwayPenaltyScore != (editingMatch.away_penalty_score ?? null);
    const resolvedReviewFlag =
      editingMatchDraft.status == MatchStatus.FINISHED
        ? shouldKeepScoreSheetReview
        : false;
    const didChangeReviewFlag =
      resolvedReviewFlag != (editingMatch.is_score_sheet_reviewed ?? false);
    const resolvedTieBreakRule = shouldPersistSocietyPenaltyShootout
      ? ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY
      : shouldPreserveTieBreakResolution &&
          editingMatch.resolved_tie_breaker_rule !=
            ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY
        ? editingMatchDraft.resolvedTieBreakerRule || null
        : null;
    const resolvedTieBreakWinnerTeamId = shouldPersistSocietyPenaltyShootout
      ? resolvedSocietyPenaltyWinnerTeamId
      : shouldPreserveTieBreakResolution &&
          editingMatch.resolved_tie_breaker_rule !=
            ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY
        ? (editingMatch.resolved_tie_break_winner_team_id ?? null)
        : null;
    const didChangeResolvedTieBreakFields =
      resolvedTieBreakRule !=
        (editingMatch.resolved_tie_breaker_rule ?? null) ||
      resolvedTieBreakWinnerTeamId !=
        (editingMatch.resolved_tie_break_winner_team_id ?? null);
    const resolvedCourtName = normalizedCourtName;
    const resolvedSlotNumber =
      selectedEditingScheduleSlot?.slot_number ??
      editingMatch.scheduled_slot ??
      null;
    const shouldUpdateScheduledMatchSetup =
      canEditScheduledMatchSetup &&
      (didChangeScheduledMatchPlacement ||
        didChangeStructuralFields ||
        (didChangeRepresentationMode &&
          editingMatch.is_manual_schedule_override != true));
    const shouldRedistributeScheduledMatch =
      shouldUpdateScheduledMatchSetup &&
      resolveShouldRedistributeBracketScheduleAfterMatchEdit({
        previousMatch: editingMatch,
        nextMatch: {
          ...editingMatch,
          status: MatchStatus.SCHEDULED,
          scheduled_date: resolvedScheduledDate,
          queue_position: editingMatch.queue_position,
          scheduled_slot: resolvedSlotNumber,
          sport_id: editingMatchDraft.sportId,
          naipe: editingMatchDraft.naipe,
          division: resolvedDivision,
          location: normalizedLocation,
          court_name: resolvedCourtName,
          start_time:
            selectedEditingScheduleSlot?.start_time ?? editingMatch.start_time,
          home_team_id: editingMatchDraft.homeTeamId,
          away_team_id: editingMatchDraft.awayTeamId,
        },
      });

    if (shouldUpdateScheduledMatchSetup) {
      const { error: logisticsUpdateError } =
        await updateScheduledMatchLogistics({
          match_id: editingMatchId,
          scheduled_date: resolvedScheduledDate,
          location: normalizedLocation,
          court_name: resolvedCourtName,
          slot_start_time: selectedEditingScheduleSlot!.start_time,
          representation_mode: editingMatchDraft.manualRepresentationMode,
          sport_id: editingMatchDraft.sportId,
          naipe: editingMatchDraft.naipe,
          home_team_id: editingMatchDraft.homeTeamId,
          away_team_id: editingMatchDraft.awayTeamId,
        });

      if (logisticsUpdateError) {
        setSavingEditingMatch(false);
        toast.error(
          resolveAdminMatchesOperationalErrorMessage(logisticsUpdateError),
        );
        return;
      }
    }

    const matchUpdatePayload: Record<string, unknown> = {};

    if (canEditScheduledMatchSetup) {
      if (didChangeSport) {
        matchUpdatePayload.sport_id = editingMatchDraft.sportId;
      }

      if (didChangeNaipe) {
        matchUpdatePayload.naipe = editingMatchDraft.naipe;
      }

      if (didChangeDivision) {
        matchUpdatePayload.division = resolvedDivision;
      }

      if (didChangeHomeTeam) {
        matchUpdatePayload.home_team_id = editingMatchDraft.homeTeamId;
      }

      if (didChangeAwayTeam) {
        matchUpdatePayload.away_team_id = editingMatchDraft.awayTeamId;
      }

      if (
        didChangeRepresentationMode &&
        !shouldUpdateScheduledMatchSetup
      ) {
        matchUpdatePayload.manual_representation_mode =
          editingMatchDraft.manualRepresentationMode;
      }
    }

    if (didChangeStatus) {
      matchUpdatePayload.status = editingMatchDraft.status;

      if (shouldTransitionMatchToLive || shouldReopenFinishedMatchAsLive) {
        matchUpdatePayload.start_time =
          editingMatch.start_time ??
          resolvedStartTimeValue ??
          new Date().toISOString();
        matchUpdatePayload.end_time = null;
        matchUpdatePayload.home_penalty_score = null;
        matchUpdatePayload.away_penalty_score = null;
        matchUpdatePayload.is_walkover = false;
        matchUpdatePayload.is_double_walkover = false;
        matchUpdatePayload.walkover_loser_team_id = null;

        if (shouldReopenFinishedMatchAsLive) {
          matchUpdatePayload.is_score_sheet_reviewed = false;
          matchUpdatePayload.resolved_tie_breaker_rule = null;
          matchUpdatePayload.resolved_tie_break_winner_team_id = null;
        }
      }

      if (shouldTransitionMatchToFinished) {
        matchUpdatePayload.end_time =
          editingMatch.end_time ?? new Date().toISOString();
      }
    }

    if (editingMatchDraft.status == MatchStatus.FINISHED) {
      if (
        didChangeScoreFields ||
        didChangeMatchSets ||
        shouldTransitionMatchToFinished
      ) {
        matchUpdatePayload.home_score = resolvedHomeScore;
        matchUpdatePayload.away_score = resolvedAwayScore;
      }

      if (didChangeCardFields || shouldTransitionMatchToFinished) {
        matchUpdatePayload.home_yellow_cards = resolvedHomeYellowCards;
        matchUpdatePayload.home_red_cards = resolvedHomeRedCards;
        matchUpdatePayload.away_yellow_cards = resolvedAwayYellowCards;
        matchUpdatePayload.away_red_cards = resolvedAwayRedCards;
        matchUpdatePayload.home_blue_cards = resolvedHomeBlueCards;
        matchUpdatePayload.home_two_minute_penalties =
          resolvedHomeTwoMinutePenalties;
        matchUpdatePayload.away_blue_cards = resolvedAwayBlueCards;
        matchUpdatePayload.away_two_minute_penalties =
          resolvedAwayTwoMinutePenalties;
      }

      if (
        didChangePenaltyShootoutFields ||
        shouldTransitionMatchToFinished ||
        shouldReopenFinishedMatchAsLive
      ) {
        matchUpdatePayload.home_penalty_score = resolvedHomePenaltyScore;
        matchUpdatePayload.away_penalty_score = resolvedAwayPenaltyScore;
      }

      if (didChangeReviewFlag || shouldReopenFinishedMatchAsLive) {
        matchUpdatePayload.is_score_sheet_reviewed = resolvedReviewFlag;
      }

      if (didChangeResolvedTieBreakFields || shouldReopenFinishedMatchAsLive) {
        matchUpdatePayload.resolved_tie_breaker_rule = resolvedTieBreakRule;
        matchUpdatePayload.resolved_tie_break_winner_team_id =
          resolvedTieBreakWinnerTeamId;
      }
    }

    if (Object.keys(matchUpdatePayload).length > 0) {
      const { error } = await supabase
        .from("matches")
        .update(matchUpdatePayload)
        .eq("id", editingMatchId);

      if (error) {
        setSavingEditingMatch(false);
        toast.error(error.message);
        return;
      }
    }

    if (shouldSyncMatchSets) {
      const { error: matchSetsError } = await saveMatchSets(
        editingMatchId,
        isEditingSetRuleBySelectedSport ? normalizedEditingMatchSetsDraft : [],
      );

      if (matchSetsError) {
        setSavingEditingMatch(false);
        toast.error(resolveAdminMatchesOperationalErrorMessage(matchSetsError));
        return;
      }
    }

    if (
      canEditScheduledMatchSetup &&
      editingMatchBracketBinding &&
      selectedEditingGroupOption &&
      (didChangeGroupBinding || didChangeHomeTeam || didChangeAwayTeam)
    ) {
      const nextBracketMatchPayload: {
        competition_id: string;
        group_id: string;
        home_team_id: string;
        away_team_id: string;
        slot_number?: number;
      } = {
        competition_id: selectedEditingGroupOption.competition_id,
        group_id: selectedEditingGroupOption.group_id,
        home_team_id: editingMatchDraft.homeTeamId,
        away_team_id: editingMatchDraft.awayTeamId,
      };

      if (
        editingMatchBracketBinding.competition_id !=
        selectedEditingGroupOption.competition_id
      ) {
        const nextSlotNumberResponse = await resolveNextGroupStageSlotNumber(
          selectedEditingGroupOption.competition_id,
        );

        if (
          nextSlotNumberResponse.errorMessage ||
          nextSlotNumberResponse.slotNumber == null
        ) {
          setSavingEditingMatch(false);
          toast.error(
            nextSlotNumberResponse.errorMessage ??
              "Não foi possível atualizar a chave do jogo.",
          );
          return;
        }

        nextBracketMatchPayload.slot_number = nextSlotNumberResponse.slotNumber;
      }

      const { error: bracketMatchError } = await supabaseLoose
        .from("championship_bracket_matches")
        .update(nextBracketMatchPayload)
        .eq("match_id", editingMatchId);

      if (bracketMatchError) {
        setSavingEditingMatch(false);
        toast.error(bracketMatchError.message);
        return;
      }
    } else if (
      canEditScheduledMatchSetup &&
      !editingMatchBracketBinding &&
      selectedEditingGroupOption &&
      didChangeGroupBinding
    ) {
      const bracketBindingResponse = await createGroupStageBracketBinding({
        matchId: editingMatchId,
        homeTeamId: editingMatchDraft.homeTeamId,
        awayTeamId: editingMatchDraft.awayTeamId,
        groupOptionValue: selectedEditingGroupOption.value,
      });

      if (bracketBindingResponse.errorMessage) {
        setSavingEditingMatch(false);
        toast.error(bracketBindingResponse.errorMessage);
        return;
      }
    }

    if (shouldRedistributeScheduledMatch) {
      const redistributedSchedule =
        await redistributeBracketScheduleAfterMatchScheduleChange({
          reloadError:
            "O jogo foi salvo, mas não foi possível recarregar a agenda para redistribuir a fila",
          redistributeError:
            "O jogo foi salvo, mas a redistribuição automática da fila falhou",
        });

      if (!redistributedSchedule) {
        setSavingEditingMatch(false);
        handleCancelEditingMatch();
        return;
      }
    }

    toast.success("Jogo atualizado.");
    setSavingEditingMatch(false);
    handleCancelEditingMatch();
    await Promise.all([onRefetch(), onRefetchChampionshipBracket()]);
  };

  const handleShuffleTieBreakContext = (
    pendingTieBreakContext: ChampionshipBracketTieBreakPendingContext,
  ) => {
    const orderedTeamIds = pendingTieBreakContext.teams.map(
      (team) => team.team_id,
    );
    let shuffledTeamIds = shuffleTeamIds(orderedTeamIds);

    if (
      orderedTeamIds.length > 1 &&
      orderedTeamIds.every(
        (teamId, teamIndex) => teamId == shuffledTeamIds[teamIndex],
      )
    ) {
      shuffledTeamIds = shuffleTeamIds(orderedTeamIds);
    }

    setDraftTieBreakTeamIdsByContextKey(
      (currentDraftTieBreakTeamIdsByContextKey) => ({
        ...currentDraftTieBreakTeamIdsByContextKey,
        [pendingTieBreakContext.context_key]: shuffledTeamIds,
      }),
    );
  };

  const handleUpdateTieBreakContextTeamAtPosition = (
    pendingTieBreakContext: ChampionshipBracketTieBreakPendingContext,
    positionIndex: number,
    teamId: string,
  ) => {
    setDraftTieBreakTeamIdsByContextKey(
      (currentDraftTieBreakTeamIdsByContextKey) => {
        const currentTieBreakTeamOrder = resolveNormalizedTieBreakTeamOrder(
          pendingTieBreakContext,
          currentDraftTieBreakTeamIdsByContextKey[
            pendingTieBreakContext.context_key
          ],
        );

        currentTieBreakTeamOrder[positionIndex] = teamId;

        return {
          ...currentDraftTieBreakTeamIdsByContextKey,
          [pendingTieBreakContext.context_key]: currentTieBreakTeamOrder,
        };
      },
    );
  };

  const handleSaveTieBreakResolutions = async () => {
    if (
      pendingTieBreakContexts.length == 0 ||
      !championshipBracketView.edition?.id
    ) {
      return;
    }

    if (!isTieBreakResolutionReady) {
      toast.error(
        "Defina a ordem completa dos desempates pendentes antes de confirmar.",
      );
      return;
    }

    setSavingTieBreakResolutions(true);

    for (const pendingTieBreakContext of pendingTieBreakContexts) {
      const orderedTeamIds = resolveNormalizedTieBreakTeamOrder(
        pendingTieBreakContext,
        draftTieBreakTeamIdsByContextKey[pendingTieBreakContext.context_key],
      );

      const response = await saveChampionshipBracketTieBreakResolution({
        context_key: pendingTieBreakContext.context_key,
        competition_id: pendingTieBreakContext.competition_id,
        context_type: pendingTieBreakContext.context_type,
        group_id: pendingTieBreakContext.group_id,
        qualification_rank: pendingTieBreakContext.qualification_rank,
        team_ids: orderedTeamIds,
      });

      if (response.error) {
        setSavingTieBreakResolutions(false);
        toast.error(resolveAdminMatchesOperationalErrorMessage(response.error));
        return;
      }
    }

    const knockoutResponse = await generateChampionshipKnockout(
      selectedChampionship.id,
      championshipBracketView.edition.id,
    );

    if (knockoutResponse.error) {
      setSavingTieBreakResolutions(false);
      toast.error(
        resolveAdminMatchesOperationalErrorMessage(knockoutResponse.error),
      );
      await loadPendingTieBreakContexts();
      return;
    }

    await Promise.all([
      onRefetch(),
      onRefetchChampionshipBracket(),
      loadPendingTieBreakContexts(),
    ]);

    setSavingTieBreakResolutions(false);
    setShowTieBreakDialog(false);
    toast.success("Sorteio salvo e mata-mata atualizado.");
  };

  const handleSaveSingleTieBreakResolution = async (
    pendingTieBreakContext: ChampionshipBracketTieBreakPendingContext,
  ) => {
    if (!championshipBracketView.edition?.id) {
      return;
    }

    const orderedTeamIds = resolveNormalizedTieBreakTeamOrder(
      pendingTieBreakContext,
      draftTieBreakTeamIdsByContextKey[pendingTieBreakContext.context_key],
    );

    if (
      !resolveIsTieBreakTeamOrderReady(pendingTieBreakContext, orderedTeamIds)
    ) {
      toast.error(
        "Defina a ordem completa sem repetir atléticas antes de salvar este sorteio.",
      );
      return;
    }

    setSavingTieBreakResolutionByContextKey((currentSavingState) => ({
      ...currentSavingState,
      [pendingTieBreakContext.context_key]: true,
    }));

    const response = await saveChampionshipBracketTieBreakResolution({
      context_key: pendingTieBreakContext.context_key,
      competition_id: pendingTieBreakContext.competition_id,
      context_type: pendingTieBreakContext.context_type,
      group_id: pendingTieBreakContext.group_id,
      qualification_rank: pendingTieBreakContext.qualification_rank,
      team_ids: orderedTeamIds,
    });

    if (response.error) {
      setSavingTieBreakResolutionByContextKey((currentSavingState) => ({
        ...currentSavingState,
        [pendingTieBreakContext.context_key]: false,
      }));
      toast.error(resolveAdminMatchesOperationalErrorMessage(response.error));
      return;
    }

    const knockoutResponse = await generateChampionshipKnockout(
      selectedChampionship.id,
      championshipBracketView.edition.id,
    );

    if (knockoutResponse.error) {
      setSavingTieBreakResolutionByContextKey((currentSavingState) => ({
        ...currentSavingState,
        [pendingTieBreakContext.context_key]: false,
      }));
      toast.error(
        resolveAdminMatchesOperationalErrorMessage(knockoutResponse.error),
      );
      await loadPendingTieBreakContexts();
      return;
    }

    await Promise.all([
      onRefetch(),
      onRefetchChampionshipBracket(),
      loadPendingTieBreakContexts(),
    ]);

    setSavingTieBreakResolutionByContextKey((currentSavingState) => ({
      ...currentSavingState,
      [pendingTieBreakContext.context_key]: false,
    }));
    toast.success("Sorteio salvo e mata-mata atualizado.");
  };

  const formatAwardDrawParticipantLabel = (
    context: AwardDrawPendingContext,
    participant: AwardDrawPendingContext["tied_participants"][number],
  ) => {
    if (context.award_type === ChampionshipAwardType.BEST_GOALKEEPER) {
      return `${participant.participant_name} • média ${participant.metric_value.toLocaleString(
        "pt-BR",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
      )}`;
    }

    return `${participant.participant_name} (${participant.team_name}) • ${participant.metric_value}`;
  };

  const handleShuffleAwardDraw = (context: AwardDrawPendingContext) => {
    const participantIds = context.tied_participants.map(
      (participant) => participant.participant_id,
    );
    const shuffled = shuffleTeamIds(participantIds);

    setDraftAwardDrawOrderByContextKey((current) => ({
      ...current,
      [context.context_key]: shuffled,
    }));
  };

  const handleUpdateAwardDrawPlayerAtPosition = (
    context: AwardDrawPendingContext,
    positionIndex: number,
    participantId: string,
  ) => {
    setDraftAwardDrawOrderByContextKey((current) => {
      const currentOrder =
        current[context.context_key] ?? context.tied_participants.map(() => "");
      const updatedOrder = [...currentOrder];
      updatedOrder[positionIndex] = participantId;
      return { ...current, [context.context_key]: updatedOrder };
    });
  };

  const handleSaveAwardDrawResult = async (
    context: AwardDrawPendingContext,
  ) => {
    const orderedParticipantIds =
      draftAwardDrawOrderByContextKey[context.context_key];

    if (
      !orderedParticipantIds ||
      orderedParticipantIds.length == 0 ||
      !orderedParticipantIds[0]
    ) {
      toast.error("Selecione ou sorteie o vencedor antes de salvar.");
      return;
    }

    const winnerParticipantId = orderedParticipantIds[0];

    if (!winnerParticipantId) {
      return;
    }

    setSavingAwardDrawByContextKey((current) => ({
      ...current,
      [context.context_key]: true,
    }));

    try {
      const { error } = await (
        supabase as unknown as {
          rpc: (
            fn: string,
            args: Record<string, unknown>,
          ) => Promise<{ data: unknown; error: unknown }>;
        }
      ).rpc("save_championship_award_draw_result", {
        _championship_id: selectedChampionship.id,
        _season_year: selectedChampionship.current_season_year,
        _sport_id: context.sport_id,
        _naipe: context.naipe,
        _division: context.division,
        _award_type: context.award_type,
        _winner_player_id:
          context.award_type === ChampionshipAwardType.TOP_SCORER
            ? winnerParticipantId
            : null,
        _winner_team_id:
          context.award_type === ChampionshipAwardType.BEST_GOALKEEPER
            ? winnerParticipantId
            : null,
        _tied_player_ids_signature: context.tied_player_ids_signature,
      });

      if (error) {
        toast.error("Erro ao salvar resultado do sorteio.");
        return;
      }

      toast.success("Resultado do sorteio de premiação salvo.");
      void refetchPendingAwardDraws();
    } finally {
      setSavingAwardDrawByContextKey((current) => ({
        ...current,
        [context.context_key]: false,
      }));
    }
  };

  const handleOpenCreateMatchModal = () => {
    resetCreateMatchForm();
    setShowCreateMatchModal(true);
  };

  if (isTieBreaksMode) {
    return (
      <div className="space-y-4">
        <div className="glass-card enter-section app-card-warning p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span>Sorteios manuais de desempate</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Esta aba mostra apenas empates de chaves já encerradas que ainda
                impactam vaga/classificação para a próxima fase.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void Promise.all([
                  loadPendingTieBreakContexts(),
                  refetchCorrectedGroupStandings(true),
                  refetchPendingAwardDraws(),
                ]);
              }}
              disabled={
                loadingPendingTieBreakContexts ||
                loadingCorrectedGroupStandings ||
                loadingPendingAwardDraws ||
                isAnyTieBreakResolutionSaveInFlight
              }
            >
              {loadingPendingTieBreakContexts ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Atualizar pendências
            </Button>
          </div>
        </div>

        {loadingPendingTieBreakContexts ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        ) : pendingTieBreakContexts.length == 0 ? (
          <div className="glass-card enter-section p-4 text-sm text-muted-foreground">
            Não há sorteios pendentes para esta edição.
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {pendingTieBreakContexts.map((pendingTieBreakContext) => {
                const orderedTeamIds = resolveNormalizedTieBreakTeamOrder(
                  pendingTieBreakContext,
                  draftTieBreakTeamIdsByContextKey[
                    pendingTieBreakContext.context_key
                  ],
                );
                const isTieBreakContextOrderReady =
                  resolveIsTieBreakTeamOrderReady(
                    pendingTieBreakContext,
                    orderedTeamIds,
                  );
                const teamNameByTeamId =
                  pendingTieBreakTeamNameByContextKeyAndTeamId[
                    pendingTieBreakContext.context_key
                  ] ?? {};
                const isSavingTieBreakContext =
                  savingTieBreakResolutionByContextKey[
                    pendingTieBreakContext.context_key
                  ] == true;
                const tieBreakAuditRows = pendingTieBreakContext.teams
                  .map(
                    (team) =>
                      correctedStandingByCompetitionAndTeamKey[
                        `${pendingTieBreakContext.competition_id}:${team.team_id}`
                      ],
                  )
                  .filter(
                    (
                      tieBreakAuditRow,
                    ): tieBreakAuditRow is ChampionshipCorrectedGroupStanding =>
                      tieBreakAuditRow != null,
                  )
                  .sort((firstRow, secondRow) => {
                    if (
                      firstRow.corrected_points != secondRow.corrected_points
                    ) {
                      return (
                        secondRow.corrected_points - firstRow.corrected_points
                      );
                    }

                    if (firstRow.points_average != secondRow.points_average) {
                      return secondRow.points_average - firstRow.points_average;
                    }

                    if (firstRow.goal_diff != secondRow.goal_diff) {
                      return secondRow.goal_diff - firstRow.goal_diff;
                    }

                    if (firstRow.blue_cards != secondRow.blue_cards) {
                      return firstRow.blue_cards - secondRow.blue_cards;
                    }

                    if (
                      firstRow.two_minute_penalties !=
                      secondRow.two_minute_penalties
                    ) {
                      return (
                        firstRow.two_minute_penalties -
                        secondRow.two_minute_penalties
                      );
                    }

                    if (firstRow.goals_for != secondRow.goals_for) {
                      return secondRow.goals_for - firstRow.goals_for;
                    }

                    return firstRow.team_name.localeCompare(
                      secondRow.team_name,
                      "pt-BR",
                      {
                        sensitivity: "base",
                      },
                    );
                  });
                const displayedTieBreakSlots = pendingTieBreakContext.teams.map(
                  (_, teamIndex) => ({
                    position: teamIndex + 1,
                    teamId: orderedTeamIds[teamIndex] ?? "",
                  }),
                );

                return (
                  <div
                    key={pendingTieBreakContext.context_key}
                    className="glass-card space-y-3 p-4"
                  >
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-foreground">
                        {pendingTieBreakContext.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {pendingTieBreakContext.description}
                      </p>
                    </div>

                    {loadingCorrectedGroupStandings ? (
                      <Skeleton className="h-36 w-full rounded-2xl" />
                    ) : tieBreakAuditRows.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Resultado atual do empate
                        </p>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Atlética</TableHead>
                                <TableHead className="text-right">
                                  PTS (corr.)
                                </TableHead>
                                <TableHead className="text-right">PA</TableHead>
                                <TableHead className="text-right">SG</TableHead>
                                <TableHead className="text-right">
                                  CAZ
                                </TableHead>
                                <TableHead className="text-right">2M</TableHead>
                                <TableHead className="text-right">GP</TableHead>
                                <TableHead className="text-right">GC</TableHead>
                                <TableHead className="text-right">V</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {tieBreakAuditRows.map((tieBreakAuditRow) => (
                                <TableRow
                                  key={`${pendingTieBreakContext.context_key}:${tieBreakAuditRow.team_id}`}
                                >
                                  <TableCell>
                                    {tieBreakAuditRow.team_name}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold text-primary">
                                    {formatStandingsPoints(
                                      tieBreakAuditRow.corrected_points,
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {formatPointsAverageForStandings(
                                      tieBreakAuditRow.goals_for,
                                      tieBreakAuditRow.goals_against,
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {tieBreakAuditRow.goal_diff}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {tieBreakAuditRow.blue_cards}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {tieBreakAuditRow.two_minute_penalties}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {tieBreakAuditRow.goals_for}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {tieBreakAuditRow.goals_against}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {tieBreakAuditRow.wins}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Métricas de pontuação corrigida indisponíveis para este
                        contexto no momento.
                      </p>
                    )}

                    {!isTieBreakContextOrderReady ? (
                      <p className="text-xs font-medium text-amber-500">
                        Defina a ordem completa sem repetir atléticas para
                        confirmar este desempate.
                      </p>
                    ) : null}

                    <div className="grid gap-2 md:grid-cols-2">
                      {displayedTieBreakSlots.map((displayedTieBreakSlot) => (
                        <div
                          key={`${pendingTieBreakContext.context_key}:${displayedTieBreakSlot.position}`}
                          className="glass-panel-muted flex items-center gap-2 rounded-xl px-3 py-2"
                        >
                          <span className="w-8 shrink-0 text-sm font-medium text-muted-foreground">
                            {displayedTieBreakSlot.position}º
                          </span>
                          <Select
                            value={
                              displayedTieBreakSlot.teamId ||
                              EMPTY_TIE_BREAK_TEAM_OPTION_VALUE
                            }
                            onValueChange={(value) =>
                              handleUpdateTieBreakContextTeamAtPosition(
                                pendingTieBreakContext,
                                displayedTieBreakSlot.position - 1,
                                value == EMPTY_TIE_BREAK_TEAM_OPTION_VALUE
                                  ? ""
                                  : value,
                              )
                            }
                            disabled={
                              savingTieBreakResolutions ||
                              isSavingTieBreakContext ||
                              !canManageMatches
                            }
                          >
                            <SelectTrigger
                              aria-label={`Atlética na posição ${displayedTieBreakSlot.position} do desempate`}
                              className="app-input-field w-full"
                            >
                              <SelectValue placeholder="Selecione a atlética" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem
                                value={EMPTY_TIE_BREAK_TEAM_OPTION_VALUE}
                              >
                                Selecione a atlética
                              </SelectItem>
                              {pendingTieBreakContext.teams.map(
                                (tieBreakTeamOption) => {
                                  const isSelectedInOtherPosition =
                                    displayedTieBreakSlots.some(
                                      (displayedTieBreakSlotItem) => {
                                        return (
                                          displayedTieBreakSlotItem.position !=
                                            displayedTieBreakSlot.position &&
                                          displayedTieBreakSlotItem.teamId ==
                                            tieBreakTeamOption.team_id
                                        );
                                      },
                                    );

                                  return (
                                    <SelectItem
                                      key={`${pendingTieBreakContext.context_key}:${displayedTieBreakSlot.position}:${tieBreakTeamOption.team_id}`}
                                      value={tieBreakTeamOption.team_id}
                                      disabled={isSelectedInOtherPosition}
                                    >
                                      {teamNameByTeamId[
                                        tieBreakTeamOption.team_id
                                      ] ?? tieBreakTeamOption.team_name}
                                    </SelectItem>
                                  );
                                },
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          handleShuffleTieBreakContext(pendingTieBreakContext)
                        }
                        disabled={
                          savingTieBreakResolutions ||
                          isSavingTieBreakContext ||
                          !canManageMatches
                        }
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {orderedTeamIds.some((teamId) => teamId.length > 0)
                          ? "Refazer sorteio"
                          : "Sortear ordem"}
                      </Button>

                      <Button
                        type="button"
                        onClick={() =>
                          void handleSaveSingleTieBreakResolution(
                            pendingTieBreakContext,
                          )
                        }
                        disabled={
                          !isTieBreakContextOrderReady ||
                          savingTieBreakResolutions ||
                          isSavingTieBreakContext ||
                          !canManageMatches
                        }
                      >
                        {isSavingTieBreakContext ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Salvar sorteio
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleSaveTieBreakResolutions}
                disabled={
                  !isTieBreakResolutionReady ||
                  isAnyTieBreakResolutionSaveInFlight ||
                  !canManageMatches
                }
              >
                {savingTieBreakResolutions ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Confirmar sorteios e gerar mata-mata
              </Button>
            </div>
          </>
        )}

        {loadingPendingAwardDraws || pendingAwardDrawContexts.length > 0 ? (
          <>
            <div className="flex items-center gap-3 pt-2">
              <div className="h-px flex-1 bg-border/50" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Desempate de premiações
              </p>
              <div className="h-px flex-1 bg-border/50" />
            </div>

            {loadingPendingAwardDraws ? (
              <div className="space-y-3">
                <Skeleton className="h-28 w-full rounded-2xl" />
              </div>
            ) : (
              <div className="space-y-3">
                {pendingAwardDrawContexts.map((awardDrawContext) => {
                  const orderedParticipantIds =
                    draftAwardDrawOrderByContextKey[
                      awardDrawContext.context_key
                    ];
                  const hasAnyPosition =
                    orderedParticipantIds &&
                    orderedParticipantIds.some((id) => id !== "");
                  const isSaving =
                    savingAwardDrawByContextKey[awardDrawContext.context_key] ==
                    true;
                  const displayedSlots = awardDrawContext.tied_participants.map(
                    (_, playerIndex) => ({
                      position: playerIndex + 1,
                      participantId:
                        (orderedParticipantIds ?? [])[playerIndex] ?? "",
                    }),
                  );
                  const canSave =
                    (displayedSlots[0]?.participantId ?? "") !== "";

                  return (
                    <div
                      key={awardDrawContext.context_key}
                      className="glass-card space-y-3 p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">
                            {resolveAwardDrawDisplayText(
                              awardDrawContext.title,
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {resolveAwardDrawDisplayText(
                              awardDrawContext.description,
                            )}
                          </p>
                        </div>
                        <Trophy className="h-4 w-4 shrink-0 text-amber-500" />
                      </div>

                      <div className="grid gap-2 md:grid-cols-2">
                        {displayedSlots.map((slot) => (
                          <div
                            key={`${awardDrawContext.context_key}:${slot.position}`}
                            className="glass-panel-muted flex items-center gap-2 rounded-xl px-3 py-2"
                          >
                            <span className="w-8 shrink-0 text-sm font-medium text-muted-foreground">
                              {slot.position}º
                            </span>
                            <Select
                              value={
                                slot.participantId ||
                                EMPTY_AWARD_DRAW_PLAYER_OPTION_VALUE
                              }
                              onValueChange={(value) =>
                                handleUpdateAwardDrawPlayerAtPosition(
                                  awardDrawContext,
                                  slot.position - 1,
                                  value == EMPTY_AWARD_DRAW_PLAYER_OPTION_VALUE
                                    ? ""
                                    : value,
                                )
                              }
                              disabled={isSaving || !canManageMatches}
                            >
                              <SelectTrigger
                                aria-label={`Participante na posição ${slot.position} do desempate`}
                                className="app-input-field w-full"
                              >
                                <SelectValue placeholder="Selecione o participante" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem
                                  value={EMPTY_AWARD_DRAW_PLAYER_OPTION_VALUE}
                                >
                                  Selecione o participante
                                </SelectItem>
                                {awardDrawContext.tied_participants.map(
                                  (participant) => {
                                    const isSelectedInOtherSlot =
                                      displayedSlots.some(
                                        (otherSlot) =>
                                          otherSlot.position !==
                                            slot.position &&
                                          otherSlot.participantId ===
                                            participant.participant_id,
                                      );
                                    return (
                                      <SelectItem
                                        key={`${awardDrawContext.context_key}:${slot.position}:${participant.participant_id}`}
                                        value={participant.participant_id}
                                        disabled={isSelectedInOtherSlot}
                                      >
                                        {formatAwardDrawParticipantLabel(
                                          awardDrawContext,
                                          participant,
                                        )}
                                      </SelectItem>
                                    );
                                  },
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            handleShuffleAwardDraw(awardDrawContext)
                          }
                          disabled={isSaving || !canManageMatches}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          {hasAnyPosition
                            ? "Refazer sorteio"
                            : "Sortear aleatoriamente"}
                        </Button>

                        <Button
                          type="button"
                          onClick={() =>
                            void handleSaveAwardDrawResult(awardDrawContext)
                          }
                          disabled={!canSave || isSaving || !canManageMatches}
                        >
                          {isSaving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Salvar vencedor
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
      </div>
    );
  }

  const operationalKnockoutScheduleAdjustmentSource =
    operationalKnockoutScheduleAdjustmentCandidates?.items.find(
      (item) =>
        item.bracket_match_id ==
        operationalKnockoutScheduleAdjustmentSourceBracketMatchId,
    ) ?? null;
  const operationalKnockoutScheduleAdjustmentDay =
    operationalKnockoutScheduleAdjustmentSource
      ? operationalKnockoutScheduleAdjustmentSchedules.find(
          (schedule) =>
            schedule.event_date ==
            operationalKnockoutScheduleAdjustmentSource.scheduled_date,
        ) ?? null
      : null;
  const operationalKnockoutScheduleAdjustmentBreaks =
    operationalKnockoutScheduleAdjustmentDay?.breaks.filter(
      (item) =>
        item.scope_type == "ALL_COURTS" ||
        item.bracket_court_id == operationalKnockoutScheduleAdjustmentSource?.bracket_court_id,
    ) ?? [];

  return (
    <div className="space-y-6">
      {shouldShowTieBreakBanner ? (
        <div className="glass-card enter-section app-card-warning p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span>Sorteio manual pendente em vagas específicas</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {pendingTieBreakContexts.length} empate(s) chegaram ao último
                critério e aguardam sorteio para definir apenas as vagas
                afetadas do mata-mata.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (onOpenTieBreaksTab) {
                  onOpenTieBreaksTab();
                  return;
                }

                setShowTieBreakDialog(true);
              }}
              disabled={
                loadingPendingTieBreakContexts ||
                isAnyTieBreakResolutionSaveInFlight
              }
            >
              {onOpenTieBreaksTab ? "Abrir aba Sorteios" : "Resolver sorteios"}
            </Button>
          </div>
        </div>
      ) : null}

      {isHistoricalSeasonView ? (
        <div className="glass-card enter-section border border-border/60 p-4">
          <p className="text-sm font-medium">Histórico em visualização</p>
          <p className="text-xs text-muted-foreground">
            Os dados de {selectedSeasonYear} ficam somente para consulta nesta
            aba. Alterações continuam restritas ao ano atual.
          </p>
        </div>
      ) : null}

      {!isScoreSheetReviewMode && !isTieBreaksMode ? (
        <Tabs
          value={activeMatchesSection}
          onValueChange={setActiveMatchesSection}
        >
          <TabsNavigationList className="h-auto w-full justify-start">
            <TabsNavigationTrigger
              value="ACTIVE"
              className="px-3 py-2.5 sm:px-4"
              onClick={() => setActiveMatchesSection("ACTIVE")}
            >
              Programação ativa
            </TabsNavigationTrigger>
            <TabsNavigationTrigger
              value="PENDING"
              className="gap-2 px-3 py-2.5 sm:px-4"
              onClick={() => setActiveMatchesSection("PENDING")}
            >
              Aguardando realocação
              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                {pendingManualRelocationMatches.length}
              </span>
            </TabsNavigationTrigger>
          </TabsNavigationList>
        </Tabs>
      ) : null}

      {!isScoreSheetReviewMode &&
      !isTieBreaksMode &&
      activeMatchesSection == "PENDING" ? (
        <section className="glass-card enter-section space-y-4 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Jogos aguardando realocação
              </p>
              <p className="text-xs text-muted-foreground">
                Estes jogos permanecem criados, mas estão fora da programação até uma nova decisão da CO.
              </p>
            </div>
            {canManageMatches ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void handleOpenDayScheduleReorganizationDialog()}
                  disabled={
                    selectedPendingManualRelocationMatchIds.length == 0 ||
                    loadingDayScheduleReorganizationPreview ||
                    applyingDayScheduleReorganization
                  }
                >
                  Realocar jogos selecionados
                </Button>
              </div>
            ) : null}
          </div>

          {isInitialLoading || isFetchingMatches ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : pendingManualRelocationMatches.length > 0 ? (
            <div className="space-y-4">
              {pendingManualRelocationMatchGroups.map((group) => (
                <section key={`${group.sportId}:${group.naipe}`} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 px-1">
                    {canManageMatches ? (() => {
                      const groupMatchIds = group.matches.map((match) => match.id);
                      const selectedGroupMatchCount = groupMatchIds.filter((matchId) =>
                        selectedPendingManualRelocationMatchIds.includes(matchId),
                      ).length;
                      const isGroupSelected = selectedGroupMatchCount == groupMatchIds.length;
                      const isGroupPartiallySelected =
                        selectedGroupMatchCount > 0 && !isGroupSelected;

                      return (
                        <Checkbox
                          checked={isGroupSelected ? true : isGroupPartiallySelected ? "indeterminate" : false}
                          onCheckedChange={(checked) =>
                            handleToggleSelectedPendingManualRelocationMatchGroup(
                              groupMatchIds,
                              checked,
                            )
                          }
                          aria-label={`Selecionar todos os jogos de ${group.sportName} ${MATCH_NAIPE_LABELS[group.naipe]}`}
                        />
                      );
                    })() : null}
                    <AppBadge tone={AppBadgeTone.NEUTRAL}>{group.sportName}</AppBadge>
                    <AppBadge tone={resolveMatchNaipeBadgeTone(group.naipe)}>
                      {MATCH_NAIPE_LABELS[group.naipe]}
                    </AppBadge>
                    <span className="text-xs text-muted-foreground">
                      {group.matches.length} jogo(s) aguardando realocação
                    </span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {group.matches.map((match) => (
                      <div key={match.id} className="app-card-muted space-y-2 rounded-xl p-3">
                        <div className="flex items-start gap-2">
                          {canManageMatches ? (
                            <Checkbox
                              checked={selectedPendingManualRelocationMatchIds.includes(match.id)}
                              onCheckedChange={(checked) =>
                                handleToggleSelectedPendingManualRelocationMatch(match.id, checked)
                              }
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {match.home_team?.name ?? "Casa"} x {match.away_team?.name ?? "Visitante"}
                            </p>
                            {match.division ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {TEAM_DIVISION_LABELS[match.division]}
                              </p>
                            ) : null}
                          </div>
                          {canManageMatches && match.status == MatchStatus.SCHEDULED ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Ações do jogo ${match.home_team?.name ?? "casa"} x ${match.away_team?.name ?? "visitante"}`}
                                >
                                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem
                                  onSelect={() => {
                                    handleOpenManualRelocationSlotDialog(match);
                                  }}
                                >
                                  <Clock className="mr-2 h-4 w-4" />
                                  Encaixar em horário livre
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <AppBadge tone={AppBadgeTone.NEUTRAL}>
                            {match.pending_manual_relocation_previous_label ?? "Jogo anterior"}
                          </AppBadge>
                          {match.pending_manual_relocation_reason ? (
                            <AppBadge tone={AppBadgeTone.AMBER}>
                              {MANUAL_MATCH_RELOCATION_REASON_LABELS[
                                match.pending_manual_relocation_reason as ManualMatchRelocationReason
                              ] ?? match.pending_manual_relocation_reason}
                            </AppBadge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Guardado em {match.pending_manual_relocation_at
                            ? format(new Date(match.pending_manual_relocation_at), "dd/MM/yyyy 'às' HH:mm")
                            : "data não informada"}
                          {match.pending_manual_relocation_notes
                            ? ` • ${match.pending_manual_relocation_notes}`
                            : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="app-card-muted rounded-xl p-4 text-sm text-muted-foreground">
              Nenhum jogo está aguardando realocação neste momento.
            </div>
          )}
        </section>
      ) : null}

      <div
        className={
          !isScoreSheetReviewMode &&
          !isTieBreaksMode &&
          activeMatchesSection == "PENDING"
            ? "hidden"
            : "enter-section space-y-3"
        }
      >
        <SportFilter
          sports={sportsForMatchesFilter}
          selected={
            matchesSportFilter == ALL_MATCHES_SPORT_FILTER
              ? null
              : matchesSportFilter
          }
          onSelect={(sportFilterValue) =>
            setMatchesSportFilter(sportFilterValue ?? ALL_MATCHES_SPORT_FILTER)
          }
        />

        <div className="glass-card enter-section p-4">
          <div
            data-testid="admin-matches-filters"
            className={
              isScoreSheetReviewMode
                ? "space-y-3"
                : "flex flex-wrap gap-3"
            }
          >
            <div
              className={
                isScoreSheetReviewMode
                  ? "flex-1 space-y-3"
                  : "contents"
              }
            >
              {!isScoreSheetReviewMode && !isTieBreaksMode ? (
                <div className="min-w-56 flex-[1_1_14rem]">
                  <Select
                    value={
                      selectedSeasonYear != null
                        ? String(selectedSeasonYear)
                        : ""
                    }
                    onValueChange={(value) => {
                      const parsedSeasonYear = Number(value);

                      if (
                        !Number.isFinite(parsedSeasonYear) ||
                        !onSeasonYearChange
                      ) {
                        return;
                      }

                      onSeasonYearChange(parsedSeasonYear);
                    }}
                  >
                    <SelectTrigger className="app-input-field w-full">
                      <SelectValue placeholder="Ano" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSeasonYears.map((seasonYear) => (
                        <SelectItem key={seasonYear} value={String(seasonYear)}>
                          {seasonYear}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {!isScoreSheetReviewMode ? (
                <div className="min-w-56 flex-[1_1_14rem]">
                  <Select
                    value={matchesStatusFilter}
                    onValueChange={setMatchesStatusFilter}
                  >
                    <SelectTrigger className="app-input-field w-full">
                      <SelectValue placeholder="Filtrar por status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_MATCHES_STATUS_FILTER}>
                        Geral
                      </SelectItem>
                      <SelectItem value={MATCHES_STATUS_FILTER_LIVE}>
                        Ao vivo
                      </SelectItem>
                      <SelectItem value={MATCHES_STATUS_FILTER_FINISHED}>
                        Encerrados
                      </SelectItem>
                      <SelectItem value={MATCHES_STATUS_FILTER_OPEN}>
                        Em aberto
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div
                className={
                  isScoreSheetReviewMode
                    ? "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
                    : "contents"
                }
              >

              <div
                className={
                  isScoreSheetReviewMode
                    ? "xl:min-w-0"
                    : "min-w-56 flex-[1_1_14rem]"
                }
              >
                <Select
                  value={matchesDateFilter}
                  onValueChange={setMatchesDateFilter}
                >
                  <SelectTrigger className="app-input-field w-full">
                    <SelectValue placeholder="Filtrar por data" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_MATCHES_DATE_FILTER}>
                      Todas as datas
                    </SelectItem>
                    {championshipDayDates.map((championshipDayDate) => (
                      <SelectItem
                        key={championshipDayDate}
                        value={championshipDayDate}
                      >
                        {resolveBrazilianDateLabel(championshipDayDate)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div
                className={
                  isScoreSheetReviewMode
                    ? "xl:min-w-0"
                    : "min-w-56 flex-[1_1_14rem]"
                }
              >
                <Select
                  value={matchesNaipeFilter}
                  onValueChange={setMatchesNaipeFilter}
                >
                  <SelectTrigger className="app-input-field w-full">
                    <SelectValue placeholder="Filtrar por naipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_MATCHES_NAIPE_FILTER}>
                      Todos os naipes
                    </SelectItem>
                    {availableNaipeOptions.map((naipeOption) => (
                      <SelectItem key={naipeOption} value={naipeOption}>
                        {MATCH_NAIPE_LABELS[naipeOption]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {championshipUsesDivisions ? (
                <div
                  className={
                    isScoreSheetReviewMode
                      ? "xl:min-w-0"
                      : "min-w-56 flex-[1_1_14rem]"
                  }
                >
                  <Select
                    value={matchesDivisionFilter}
                    onValueChange={setMatchesDivisionFilter}
                  >
                    <SelectTrigger className="app-input-field w-full">
                      <SelectValue placeholder="Filtrar por divisão" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_MATCHES_DIVISION_FILTER}>
                        Todas as divisões
                      </SelectItem>
                      <SelectItem value={TeamDivision.DIVISAO_PRINCIPAL}>
                        {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_PRINCIPAL]}
                      </SelectItem>
                      <SelectItem value={TeamDivision.DIVISAO_ACESSO}>
                        {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_ACESSO]}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div
                className={
                  isScoreSheetReviewMode
                    ? "xl:min-w-0"
                    : "min-w-56 flex-[1_1_14rem]"
                }
              >
                <Select
                  value={matchesGroupFilter}
                  onValueChange={setMatchesGroupFilter}
                >
                  <SelectTrigger className="app-input-field w-full">
                    <SelectValue placeholder="Filtrar por grupo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_MATCHES_GROUP_FILTER}>
                      Todos os grupos
                    </SelectItem>
                    {groupsForMatchesFilter.map((groupOption) => (
                      <SelectItem
                        key={groupOption.value}
                        value={groupOption.value}
                      >
                        {groupOption.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              </div>

              <div
                className={
                  isScoreSheetReviewMode
                    ? "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_2.5rem]"
                    : "contents"
                }
              >

              <div
                className={
                  isScoreSheetReviewMode
                    ? "xl:min-w-0"
                    : "min-w-56 flex-[1_1_14rem]"
                }
              >
                <Select
                  value={matchesLocationFilter}
                  onValueChange={setMatchesLocationFilter}
                >
                  <SelectTrigger className="app-input-field w-full">
                    <SelectValue placeholder="Filtrar por local" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_MATCHES_LOCATION_FILTER}>
                      Todos os locais
                    </SelectItem>
                    {locationsForMatchesFilter.map((locationOption) => (
                      <SelectItem key={locationOption} value={locationOption}>
                        {locationOption}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div
                className={
                  isScoreSheetReviewMode
                    ? "xl:min-w-0"
                    : "min-w-56 flex-[1_1_14rem]"
                }
              >
                <Select
                  value={matchesCourtFilter}
                  onValueChange={setMatchesCourtFilter}
                >
                  <SelectTrigger className="app-input-field w-full">
                    <SelectValue placeholder="Filtrar por quadra" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_MATCHES_COURT_FILTER}>
                      Todas as quadras
                    </SelectItem>
                    {courtsForMatchesFilter.map((courtOption) => (
                      <SelectItem key={courtOption} value={courtOption}>
                        {courtOption}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div
                className={
                  isScoreSheetReviewMode
                    ? "xl:min-w-0"
                    : "min-w-56 flex-[1_1_14rem]"
                }
              >
                <div className="flex items-center gap-2">
                  <Select
                    value={matchesTeamFilter}
                    onValueChange={setMatchesTeamFilter}
                  >
                    <SelectTrigger className="app-input-field flex-1">
                      <SelectValue placeholder="Filtrar por atlética" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_MATCHES_TEAM_FILTER}>
                        Todas as atléticas
                      </SelectItem>
                      {teamsForMatchesFilter.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isScoreSheetReviewMode ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setHideReviewedMatches(
                      (currentHideReviewedMatches) => !currentHideReviewedMatches,
                    )
                  }
                  className={`h-10 w-10 shrink-0 ${hideReviewedMatches ? "app-button-secondary-active hover:!bg-red-600" : ""}`}
                  aria-label={
                    hideReviewedMatches
                      ? "Mostrar jogos revisados também"
                      : "Ocultar jogos já revisados"
                  }
                >
                  <EyeOff className="h-4 w-4" />
                </Button>
              ) : null}

              </div>
            </div>

          </div>
        </div>

        {!canManageMatches && !hasMatchesEditPermission ? (
          <p className="text-sm text-muted-foreground">
            Perfil em visualização: sem permissão para criar, editar ou remover
            jogos.
          </p>
        ) : null}

        {isInitialLoading || isFetchingMatches ? (
          <div className="space-y-3">
            <section className="glass-card enter-section flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <Skeleton className="h-5 w-48 rounded-lg" />
              <Skeleton className="h-9 w-56 rounded-lg" />
            </section>

            <MatchListSkeleton
              count={Math.max(3, matchesItemsPerPage)}
              variant="list"
            />
          </div>
        ) : scheduledListItems.length > 0 ? (
          <>
            <div className="glass-card enter-section flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                {canManageMatches ? (
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox
                      checked={selectAllMatchesChecked}
                      onCheckedChange={handleToggleSelectAllMatches}
                    />
                    <span>Selecionar todos os jogos filtrados</span>
                  </label>
                ) : null}

                {canManageMatches &&
                selectedFilteredMatchCount > 0 &&
                isScoreSheetReviewMode ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() =>
                        void handleBulkUpdateFilteredMatchesReviewState(true)
                      }
                      disabled={
                        deletingMatches ||
                        applyingBulkAction ||
                        selectedMatchIds.length == 0 ||
                        bulkReviewAction != null ||
                        isSavingReviewState
                      }
                    >
                      {bulkReviewAction == "MARK" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Marcar selecionados como revisados
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() =>
                        void handleBulkUpdateFilteredMatchesReviewState(false)
                      }
                      disabled={
                        deletingMatches ||
                        applyingBulkAction ||
                        selectedMatchIds.length == 0 ||
                        bulkReviewAction != null ||
                        isSavingReviewState
                      }
                    >
                      {bulkReviewAction == "UNMARK" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Desmarcar selecionados
                    </Button>
                  </div>
                ) : null}

                {canManageMatches &&
                selectedFilteredMatchCount > 0 &&
                !isScoreSheetReviewMode ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleOpenManualRelocationDialog}
                      disabled={
                        deletingMatches ||
                        applyingBulkAction ||
                        selectedMatchIds.length == 0
                      }
                    >
                      Realocar jogos
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleOpenHoldMatchesDialog}
                      disabled={
                        deletingMatches ||
                        applyingBulkAction ||
                        selectedMatchIds.length == 0
                      }
                    >
                      Guardar para realocação
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void handleMoveSelectedMatchesToNextChampionshipDay()
                      }
                      disabled={
                        deletingMatches ||
                        applyingBulkAction ||
                        selectedMatchIds.length == 0
                      }
                    >
                      {applyingBulkAction ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Mover selecionados para o próximo dia
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void handleMoveFilteredMatchesToNextChampionshipDay()
                      }
                      disabled={
                        deletingMatches ||
                        applyingBulkAction ||
                        filteredAndSortedMatches.length == 0
                      }
                    >
                      {applyingBulkAction ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Mover todos os jogos filtrados
                    </Button>

                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleOpenDeleteSelectedMatchesDialog}
                      disabled={
                        deletingMatches ||
                        applyingBulkAction ||
                        selectedMatchIds.length == 0
                      }
                    >
                      {deletingMatches ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Excluir selecionados
                    </Button>
                  </div>
                ) : null}

                <p className="text-center text-sm text-muted-foreground lg:text-left">
                  {scheduledListItems.length} item(ns) de programação encontrado(s)
                </p>
              </div>
            </div>

            {paginatedScheduledListItems.map((item) => {
              if (item.type == "KNOCKOUT_PLACEHOLDER") {
                return (
                  <AdminMatchesKnockoutPlaceholderCard
                    key={item.id}
                    placeholder={item.placeholder}
                    canManageMatches={canManageMatches}
                    isScoreSheetReviewMode={isScoreSheetReviewMode}
                    disabled={swappingMatches}
                    onSwap={handleOpenKnockoutScheduleSwapDialog}
                    onAdjustSchedule={
                      handleOpenOperationalKnockoutScheduleAdjustmentDialog
                    }
                  />
                );
              }

              const match = item.match;
              const matchBracketContext =
                matchBracketContextByMatchId[match.id];
              const knockoutBracketMatchId =
                match.status == MatchStatus.SCHEDULED
                  ? resolveKnockoutBracketMatchIdForMatch(
                      championshipBracketView,
                      match.id,
                    )
                  : null;
              const startedAtLabel = resolveMatchStartedAtLabel(
                match.start_time,
                match.status,
              );
              const tieBreakRuleLabel = resolveMatchTieBreakRuleLabel(
                match.resolved_tie_breaker_rule,
              );
              const penaltyShootoutSummary = resolveMatchPenaltyShootoutSummary(
                match,
                matchBracketContext,
              );
              const isSetMatch =
                match.result_rule == ChampionshipSportResultRule.SETS;
              const supportsCards =
                championshipSportSupportsCardsBySportId.get(match.sport_id) ==
                  true || match.supports_cards;
              const isHandballMatch = isHandballSportName(match.sports?.name);
              const isSavingMatchReviewState =
                savingReviewStateByMatchId[match.id] == true;
              const setSummary = isSetMatch
                ? resolveMatchSetSummary(match)
                : [];
              const displayedHomeScore =
                isSetMatch && match.status == MatchStatus.LIVE
                  ? (match.current_set_home_score ?? 0)
                  : match.home_score;
              const displayedAwayScore =
                isSetMatch && match.status == MatchStatus.LIVE
                  ? (match.current_set_away_score ?? 0)
                  : match.away_score;

              return (
                <div
                  key={match.id}
                  className="list-item-card list-item-card-hover px-4 py-3"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    {/* ── COL 1: Modalidade + Badges ── */}
                    <div className="flex flex-col gap-2 sm:w-44 sm:shrink-0">
                      {/* Linha: checkbox + modalidade + revisão + (menu mobile) */}
                      <div className="flex items-center gap-2">
                        {canManageMatches ? (
                          <Checkbox
                            checked={selectedMatchIds.includes(match.id)}
                            onCheckedChange={(checked) =>
                              handleToggleSelectedMatch(match.id, checked)
                            }
                          />
                        ) : null}

                        <span className="shrink-0 text-xs font-medium uppercase text-muted-foreground">
                          {match.sports?.name}
                        </span>

                        {match.is_score_sheet_reviewed ? (
                          <span
                            title="Conferido com súmula"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400"
                          >
                            <Check className="h-3 w-3" />
                          </span>
                        ) : null}

                        {/* Menu — somente mobile */}
                        {canManageMatches ? (
                          <div className="ml-auto sm:hidden">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Ações do jogo ${match.home_team?.name ?? "casa"} x ${match.away_team?.name ?? "visitante"} (mobile)`}
                                  disabled={deletingMatches || swappingMatches}
                                >
                                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem
                                  onSelect={() => {
                                    handleStartEditingMatch(match);
                                  }}
                                >
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Editar
                                </DropdownMenuItem>

                                {!isScoreSheetReviewMode &&
                                match.status !== MatchStatus.FINISHED ? (
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      handleOpenSwapMatchDialog(match);
                                    }}
                                  >
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Trocar jogo
                                  </DropdownMenuItem>
                                ) : null}

                                {!isScoreSheetReviewMode &&
                                match.status === MatchStatus.SCHEDULED ? (
                                  <>
                                    <DropdownMenuItem
                                      onSelect={() => {
                                        handleOpenManualRelocationSlotDialog(match);
                                      }}
                                    >
                                      <Clock className="mr-2 h-4 w-4" />
                                      Encaixar em horário livre
                                    </DropdownMenuItem>
                                    {knockoutBracketMatchId ? (
                                      <DropdownMenuItem
                                        onSelect={() =>
                                          void handleOpenOperationalKnockoutScheduleAdjustmentDialog(
                                            knockoutBracketMatchId,
                                          )
                                        }
                                      >
                                        <Clock className="mr-2 h-4 w-4" />
                                        Ajustar programação futura
                                      </DropdownMenuItem>
                                    ) : null}
                                  </>
                                ) : null}

                                {!isScoreSheetReviewMode ? (
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onSelect={() => {
                                      handleOpenDeleteMatchDialog(match);
                                    }}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Apagar
                                  </DropdownMenuItem>
                                ) : null}

                                {isScoreSheetReviewMode ? (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        void handleToggleMatchScoreSheetReviewed(
                                          match.id,
                                          !match.is_score_sheet_reviewed,
                                        )
                                      }
                                      disabled={isSavingMatchReviewState}
                                    >
                                      {match.is_score_sheet_reviewed ? (
                                        <>
                                          <X className="mr-2 h-4 w-4" />
                                          Remover revisão da súmula
                                        </>
                                      ) : (
                                        <>
                                          <Check className="mr-2 h-4 w-4" />
                                          {match.is_walkover
                                            ? "Conferir com súmula"
                                            : "Revisar súmula e premiações"}
                                        </>
                                      )}
                                    </DropdownMenuItem>
                                  </>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        ) : null}
                      </div>

                      {/* Badges — sempre alinhados à esquerda */}
                      <div className="flex flex-wrap items-center gap-1.5 sm:flex-col sm:items-start sm:gap-1">
                        <AppBadge
                          tone={resolveMatchNaipeBadgeTone(String(match.naipe))}
                          className="min-h-6 min-w-10 justify-center px-3 sm:min-h-0 sm:min-w-0 sm:justify-start sm:px-2.5"
                        >
                          <span className="flex items-center justify-center leading-none sm:hidden">
                            {match.naipe === MatchNaipe.MASCULINO
                              ? "♂"
                              : match.naipe === MatchNaipe.FEMININO
                                ? "♀"
                                : "⚥"}
                          </span>
                          <span className="hidden sm:inline">
                            {resolveMatchNaipeLabel(String(match.naipe))}
                          </span>
                        </AppBadge>

                        <AppBadge
                          tone={resolveMatchStatusBadgeTone(match.status)}
                        >
                          {match.status === MatchStatus.LIVE ? (
                            <Radio className="h-3 w-3 sm:hidden" />
                          ) : match.status === MatchStatus.FINISHED ? (
                            <Check className="h-3 w-3 sm:hidden" />
                          ) : (
                            <Clock className="h-3 w-3 sm:hidden" />
                          )}
                          <span className="hidden sm:inline">
                            {resolveMatchDisplayStatusLabel(match)}
                          </span>
                        </AppBadge>

                        {match.division ? (
                          <AppBadge
                            tone={TEAM_DIVISION_BADGE_TONES[match.division]}
                          >
                            <span className="sm:hidden">
                              {match.division === TeamDivision.DIVISAO_PRINCIPAL
                                ? "Div. Principal"
                                : "Div. Acesso"}
                            </span>
                            <span className="hidden sm:inline">
                              {TEAM_DIVISION_LABELS[match.division]}
                            </span>
                          </AppBadge>
                        ) : null}

                        {matchBracketContext ? (
                          <AppBadge
                            tone={AppBadgeTone.NEUTRAL}
                            className="shrink-0 whitespace-nowrap"
                          >
                            {matchBracketContext.badgeLabel}
                          </AppBadge>
                        ) : null}

                        {match.is_walkover ? (
                          <AppBadge tone={AppBadgeTone.NEUTRAL}>W.O.</AppBadge>
                        ) : null}
                      </div>
                    </div>

                    {/* ── COL 2: Placar + Sets + Detalhes + Cartões ── */}
                    <div className="min-w-0 space-y-2 sm:min-w-[220px] sm:max-w-xs">
                      {/* Placar principal — flex-1 em ambos os lados, × sempre no centro */}
                      <div className="flex items-center gap-1 font-display text-sm font-semibold">
                        <span className="min-w-0 flex-1 truncate text-right">
                          {match.home_team?.name}
                        </span>
                        <span className="shrink-0 text-base font-bold score-text">
                          {displayedHomeScore}
                        </span>
                        <span className="shrink-0 px-0.5 text-sm text-muted-foreground">
                          ×
                        </span>
                        <span className="shrink-0 text-base font-bold score-text">
                          {displayedAwayScore}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {match.away_team?.name}
                        </span>
                      </div>

                      {penaltyShootoutSummary ? (
                        <p className="text-center text-xs font-medium text-muted-foreground">
                          Pênaltis: ({penaltyShootoutSummary.homePenaltyScore} ×{" "}
                          {penaltyShootoutSummary.awayPenaltyScore})
                        </p>
                      ) : null}

                      {/* Sets em árvore — × alinhado com o placar principal */}
                      {setSummary.length > 0 &&
                      match.status != MatchStatus.SCHEDULED ? (
                        <div>
                          <div className="mx-auto h-3 w-px bg-primary/70" />
                          <div className="border-t-2 border-primary/70" />
                          <div className="mt-2 space-y-2">
                            {setSummary.map((matchSetItem) => (
                              <div
                                key={`${match.id}-admin-set-${matchSetItem.setNumber}`}
                                className="rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5"
                              >
                                <div className="flex items-baseline gap-1 font-display text-[13px] font-semibold text-foreground">
                                  <span className="min-w-0 flex-1 truncate text-right">
                                    <span className="font-normal text-[11px] text-muted-foreground">
                                      <span className="hidden sm:inline">
                                        Set{" "}
                                      </span>
                                      {matchSetItem.setNumber}
                                      <span className="sm:hidden">º</span>
                                      {": "}
                                    </span>
                                    {matchSetItem.homeTeamName}{" "}
                                  </span>
                                  <span className="shrink-0 score-text">
                                    {matchSetItem.homePoints}
                                  </span>
                                  <span className="shrink-0 px-0.5 text-xs text-muted-foreground">
                                    ×
                                  </span>
                                  <span className="shrink-0 score-text">
                                    {matchSetItem.awayPoints}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate">
                                    {" "}
                                    {matchSetItem.awayTeamName}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {/* Detalhes — empilhado no mobile, linha única no desktop */}
                      <div className="text-center text-xs text-muted-foreground">
                        <div className="flex flex-col items-center gap-y-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-3 sm:gap-y-0">
                          <span>
                            Local:{" "}
                            {match.court_name
                              ? `${match.location} • ${match.court_name}`
                              : match.location}
                          </span>
                          <span>
                            Fila:{" "}
                            {resolveScheduledQueueSummary(
                              match,
                              visualQueuePositionByMatchId[match.id],
                            )}
                          </span>
                        </div>
                        {matchRepresentationByMatchId[match.id] ? (
                          <p className="break-words">
                            Representação:{" "}
                            {matchRepresentationByMatchId[match.id]}
                          </p>
                        ) : null}
                        {match.status == MatchStatus.SCHEDULED &&
                        estimatedStartTimeByMatchId[match.id] ? (
                          <p>
                            Horário estimado:{" "}
                            {estimatedStartTimeByMatchId[match.id]}
                          </p>
                        ) : null}
                        {startedAtLabel ? <p>{startedAtLabel}</p> : null}
                        {tieBreakRuleLabel ? (
                          <p className="mt-1 inline-flex items-center gap-1 font-medium text-amber-500">
                            <AlertTriangle className="h-3 w-3" />
                            Desempate por {tieBreakRuleLabel}.
                          </p>
                        ) : null}
                      </div>

                      {/* Cartões com ícones */}
                      {supportsCards ? (
                        <div className="space-y-1">
                          <p className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Cartões
                          </p>
                          <div className="mx-auto grid max-w-xs grid-cols-2 gap-x-6 gap-y-1">
                            <div className="space-y-0.5 text-center">
                              <p className="truncate text-xs font-medium text-foreground">
                                {match.home_team?.name ?? "Atlética mandante"}
                              </p>
                              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                  <Square className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                                  {match.home_yellow_cards}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <Square className="h-2.5 w-2.5 fill-rose-600 text-rose-600 dark:fill-rose-500 dark:text-rose-500" />
                                  {match.home_red_cards}
                                </span>
                                {isHandballMatch ? (
                                  <span
                                    aria-label={`Cartões azuis da casa: ${match.home_blue_cards ?? 0}`}
                                    data-testid="admin-match-home-blue-cards"
                                    className="inline-flex items-center gap-1"
                                  >
                                    <Square className="h-2.5 w-2.5 fill-sky-500 text-sky-500 dark:fill-sky-400 dark:text-sky-400" />
                                    {match.home_blue_cards ?? 0}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="space-y-0.5 text-center">
                              <p className="truncate text-xs font-medium text-foreground">
                                {match.away_team?.name ?? "Atlética visitante"}
                              </p>
                              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                  <Square className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                                  {match.away_yellow_cards}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <Square className="h-2.5 w-2.5 fill-rose-600 text-rose-600 dark:fill-rose-500 dark:text-rose-500" />
                                  {match.away_red_cards}
                                </span>
                                {isHandballMatch ? (
                                  <span
                                    aria-label={`Cartões azuis do visitante: ${match.away_blue_cards ?? 0}`}
                                    data-testid="admin-match-away-blue-cards"
                                    className="inline-flex items-center gap-1"
                                  >
                                    <Square className="h-2.5 w-2.5 fill-sky-500 text-sky-500 dark:fill-sky-400 dark:text-sky-400" />
                                    {match.away_blue_cards ?? 0}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {/* ── COL 3: Menu ações (somente desktop) ── */}
                    {canManageMatches ? (
                      <div className="hidden sm:flex sm:shrink-0 sm:items-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Ações do jogo ${match.home_team?.name ?? "casa"} x ${match.away_team?.name ?? "visitante"}`}
                              disabled={deletingMatches || swappingMatches}
                            >
                              <MoreVertical className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onSelect={() => {
                                handleStartEditingMatch(match);
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>

                            {!isScoreSheetReviewMode &&
                            match.status !== MatchStatus.FINISHED ? (
                              <DropdownMenuItem
                                onSelect={() => {
                                  handleOpenSwapMatchDialog(match);
                                }}
                              >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Trocar jogo
                              </DropdownMenuItem>
                            ) : null}

                            {!isScoreSheetReviewMode &&
                            match.status === MatchStatus.SCHEDULED ? (
                              <>
                                <DropdownMenuItem
                                  onSelect={() => {
                                    handleOpenManualRelocationSlotDialog(match);
                                  }}
                                >
                                  <Clock className="mr-2 h-4 w-4" />
                                  Encaixar em horário livre
                                </DropdownMenuItem>
                                {knockoutBracketMatchId ? (
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      void handleOpenOperationalKnockoutScheduleAdjustmentDialog(
                                        knockoutBracketMatchId,
                                      )
                                    }
                                  >
                                    <Clock className="mr-2 h-4 w-4" />
                                    Ajustar programação futura
                                  </DropdownMenuItem>
                                ) : null}
                              </>
                            ) : null}

                            {!isScoreSheetReviewMode ? (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={() => {
                                  handleOpenDeleteMatchDialog(match);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Apagar
                              </DropdownMenuItem>
                            ) : null}

                            {isScoreSheetReviewMode ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() =>
                                    void handleToggleMatchScoreSheetReviewed(
                                      match.id,
                                      !match.is_score_sheet_reviewed,
                                    )
                                  }
                                  disabled={isSavingMatchReviewState}
                                >
                                  {match.is_score_sheet_reviewed ? (
                                    <>
                                      <X className="mr-2 h-4 w-4" />
                                      Remover revisão da súmula
                                    </>
                                  ) : (
                                    <>
                                      <Check className="mr-2 h-4 w-4" />
                                      {match.is_walkover
                                        ? "Conferir com súmula"
                                        : "Revisar súmula e premiações"}
                                    </>
                                  )}
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}

            <AppPaginationControls
              currentPage={matchesCurrentPage}
              totalPages={matchesTotalPages}
              onPageChange={setMatchesCurrentPage}
              itemsPerPage={matchesItemsPerPage}
              onItemsPerPageChange={setMatchesItemsPerPage}
            />
          </>
        ) : visibleIndividualSessions.length == 0 ? (
          <p className="text-sm text-center text-muted-foreground">
            Nenhum jogo encontrado para os filtros selecionados.
          </p>
        ) : null}

        {visibleIndividualSessions.length > 0 &&
        shouldRenderIndividualSessions({
          collectiveMatchesCount: scheduledListItems.length,
          currentPage: matchesCurrentPage,
          totalPages: matchesTotalPages,
        }) ? (
          <section className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Sessões Individuais
              </p>
              <p className="text-xs text-muted-foreground">
                Atletismo e Natação são registrados por prova e não como jogo
                entre duas atléticas.
              </p>
            </div>

            {visibleIndividualSessions.map((session) => (
              <div
                key={session.id}
                className="list-item-card list-item-card-hover px-4 py-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="flex flex-col gap-2 sm:w-44 sm:shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-xs font-medium uppercase text-muted-foreground">
                        {session.sports?.name}
                      </span>

                      {canManageMatches &&
                      session.status == ChampionshipIndividualSessionStatus.SCHEDULED ? (
                        <div className="ml-auto sm:hidden">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Ações da sessão ${session.sports?.name ?? "individual"} ${MATCH_NAIPE_LABELS[session.naipe]} (mobile)`}
                              >
                                <MoreVertical className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onSelect={() =>
                                  void openIndividualSessionEditor(session)
                                }
                              >
                                Editar sessão
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 sm:flex-col sm:items-start sm:gap-1">
                      <AppBadge
                        tone={resolveMatchNaipeBadgeTone(String(session.naipe))}
                        className="min-h-6 min-w-10 justify-center px-3 sm:min-h-0 sm:min-w-0 sm:justify-start sm:px-2.5"
                      >
                        <span className="flex items-center justify-center leading-none sm:hidden">
                          {session.naipe === MatchNaipe.MASCULINO
                            ? "♂"
                            : session.naipe === MatchNaipe.FEMININO
                              ? "♀"
                              : "⚥"}
                        </span>
                        <span className="hidden sm:inline">
                          {MATCH_NAIPE_LABELS[session.naipe]}
                        </span>
                      </AppBadge>

                      <AppBadge
                        tone={resolveIndividualSessionStatusBadgeTone(
                          session.status,
                        )}
                      >
                        {session.status ===
                        ChampionshipIndividualSessionStatus.LIVE ? (
                          <Radio className="h-3 w-3 sm:hidden" />
                        ) : session.status ===
                          ChampionshipIndividualSessionStatus.FINISHED ? (
                          <Check className="h-3 w-3 sm:hidden" />
                        ) : (
                          <Clock className="h-3 w-3 sm:hidden" />
                        )}
                        <span className="hidden sm:inline">
                          {INDIVIDUAL_SESSION_STATUS_LABELS[session.status]}
                        </span>
                      </AppBadge>

                      {session.division ? (
                        <AppBadge
                          tone={TEAM_DIVISION_BADGE_TONES[session.division]}
                        >
                          <span className="hidden sm:inline">
                            {TEAM_DIVISION_LABELS[session.division]}
                          </span>
                          <span className="sm:hidden">
                            {session.division === TeamDivision.DIVISAO_PRINCIPAL
                              ? "Div. Principal"
                              : "Div. Acesso"}
                          </span>
                        </AppBadge>
                      ) : null}
                    </div>
                  </div>

                  <div className="min-w-0 space-y-2 sm:min-w-[220px] sm:max-w-xs">
                    <p className="text-center font-display text-sm font-semibold">
                      Sessão de provas
                    </p>
                    <div className="text-center text-xs text-muted-foreground">
                      <div className="flex flex-col items-center gap-y-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-3 sm:gap-y-0">
                        <span>
                          Data:{" "}
                          {resolveBrazilianDateLabel(session.scheduled_date)}
                        </span>
                        {session.location_name ? (
                          <span>
                            Local: {session.location_name}
                            {session.court_name
                              ? ` • ${session.court_name}`
                              : ""}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {canManageMatches &&
                  session.status == ChampionshipIndividualSessionStatus.SCHEDULED ? (
                    <div className="hidden sm:flex sm:shrink-0 sm:items-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Ações da sessão ${session.sports?.name ?? "individual"} ${MATCH_NAIPE_LABELS[session.naipe]}`}
                          >
                            <MoreVertical className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onSelect={() =>
                              void openIndividualSessionEditor(session)
                            }
                          >
                            Editar sessão
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </section>
        ) : null}
      </div>

      <Dialog
        open={editingIndividualSession != null}
        onOpenChange={(open) => {
          if (!open) {
            closeIndividualSessionEditor();
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar sessão individual</DialogTitle>
            <DialogDescription>
              Altere a logística sem mudar modalidade, naipe ou divisão.
            </DialogDescription>
          </DialogHeader>

          {editingIndividualSession && individualSessionEditDraft ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-border/40 p-3">
                <p className="font-medium">
                  {editingIndividualSession.sports?.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {MATCH_NAIPE_LABELS[editingIndividualSession.naipe]}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Data</Label>
                <Select
                  value={individualSessionEditDraft.scheduledDate}
                  onValueChange={(scheduledDate) =>
                    setIndividualSessionEditDraft((current) =>
                      current
                        ? {
                            ...current,
                            scheduledDate,
                            locationGroupId: "",
                            courtGroupId: "",
                          }
                        : current,
                    )
                  }
                >
                  <SelectTrigger className="app-input-field">
                    <SelectValue placeholder="Selecione a data" />
                  </SelectTrigger>
                  <SelectContent>
                    {individualSessionScheduleDays.map((day) => (
                      <SelectItem key={day.id} value={day.event_date}>
                        {resolveBrazilianDateLabel(day.event_date)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Horário inicial</Label>
                  <Input
                    type="time"
                    value={individualSessionEditDraft.startTime}
                    onChange={(event) =>
                      setIndividualSessionEditDraft((current) =>
                        current
                          ? { ...current, startTime: event.target.value }
                          : current,
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Horário final</Label>
                  <Input
                    type="time"
                    value={individualSessionEditDraft.endTime}
                    onChange={(event) =>
                      setIndividualSessionEditDraft((current) =>
                        current
                          ? { ...current, endTime: event.target.value }
                          : current,
                      )
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Local</Label>
                <Select
                  value={individualSessionEditDraft.locationGroupId}
                  onValueChange={(locationGroupId) =>
                    setIndividualSessionEditDraft((current) =>
                      current
                        ? { ...current, locationGroupId, courtGroupId: "" }
                        : current,
                    )
                  }
                  disabled={!individualSessionEditDraft.scheduledDate}
                >
                  <SelectTrigger className="app-input-field">
                    <SelectValue placeholder="Selecione o local" />
                  </SelectTrigger>
                  <SelectContent>
                    {(individualSessionScheduleDays.find(
                      (day) =>
                        day.event_date == individualSessionEditDraft.scheduledDate,
                    )?.locations ?? []).map((location) => (
                      <SelectItem
                        key={location.location_group_id}
                        value={location.location_group_id}
                      >
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Quadra / recurso</Label>
                <Select
                  value={individualSessionEditDraft.courtGroupId}
                  onValueChange={(courtGroupId) =>
                    setIndividualSessionEditDraft((current) =>
                      current ? { ...current, courtGroupId } : current,
                    )
                  }
                  disabled={!individualSessionEditDraft.locationGroupId}
                >
                  <SelectTrigger className="app-input-field">
                    <SelectValue placeholder="Selecione a quadra ou recurso" />
                  </SelectTrigger>
                  <SelectContent>
                    {(individualSessionScheduleDays
                      .find(
                        (day) =>
                          day.event_date ==
                          individualSessionEditDraft.scheduledDate,
                      )
                      ?.locations.find(
                        (location) =>
                          location.location_group_id ==
                          individualSessionEditDraft.locationGroupId,
                      )?.courts ?? []).map((court) => (
                      <SelectItem
                        key={court.court_group_id}
                        value={court.court_group_id}
                      >
                        {court.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-border/40 p-3">
                <Checkbox
                  checked={individualSessionEditDraft.exclusiveLockEnabled}
                  onCheckedChange={(checked) =>
                    setIndividualSessionEditDraft((current) =>
                      current
                        ? {
                            ...current,
                            exclusiveLockEnabled: checked === true,
                          }
                        : current,
                    )
                  }
                />
                <span>
                  <span className="block text-sm font-medium">
                    Reserva exclusiva do recurso
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Bloqueia jogos e outras sessões neste recurso durante o horário.
                  </span>
                </span>
              </label>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeIndividualSessionEditor}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={savingIndividualSession}
                  onClick={() => void saveIndividualSession()}
                >
                  {savingIndividualSession ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Salvar sessão
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={showOperationalKnockoutScheduleAdjustmentDialog}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            handleCloseOperationalKnockoutScheduleAdjustmentDialog();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Ajustar programação futura</DialogTitle>
            <DialogDescription>
              Defina uma duração excepcional para slots ou jogos eliminatórios futuros da mesma quadra e recalcule a sequência sem alterar o chaveamento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {operationalKnockoutScheduleAdjustmentSource ? (
              <div className="app-card-muted rounded-xl p-3 text-sm">
                {resolveBrazilianDateLabel(
                  operationalKnockoutScheduleAdjustmentSource.scheduled_date,
                )}
                {" • "}
                {operationalKnockoutScheduleAdjustmentSource.location}
                {" • "}
                {operationalKnockoutScheduleAdjustmentSource.court_name}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Jogos e slots que receberão a duração</Label>
              <div className="space-y-2 rounded-xl border border-border p-3">
                {operationalKnockoutScheduleAdjustmentCandidates?.items.map((item) => (
                  <label
                    key={item.bracket_match_id}
                    className="flex items-start gap-3 rounded-lg border border-border/60 p-2.5"
                  >
                    <Checkbox
                      checked={selectedOperationalKnockoutScheduleAdjustmentItemIds.includes(
                        item.bracket_match_id,
                      )}
                      onCheckedChange={(checked) =>
                        handleToggleOperationalKnockoutScheduleAdjustmentItem(
                          item.bracket_match_id,
                          checked,
                        )
                      }
                      disabled={
                        loadingOperationalKnockoutScheduleAdjustment ||
                        applyingOperationalKnockoutScheduleAdjustment
                      }
                    />
                    <span className="min-w-0 text-sm text-muted-foreground">
                      {resolveOperationalKnockoutScheduleAdjustmentItemLabel(item)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="operational-knockout-duration">Duração comum dos selecionados</Label>
                <Input
                  id="operational-knockout-duration"
                  type="number"
                  min="1"
                  className="app-input-field"
                  value={operationalKnockoutScheduleAdjustmentDuration}
                  onChange={(event) => {
                    setOperationalKnockoutScheduleAdjustmentDuration(event.target.value);
                    setOperationalKnockoutScheduleAdjustmentPreview(null);
                  }}
                  placeholder="90"
                />
                <p className="text-xs text-muted-foreground">Em minutos. Não altera o padrão da modalidade.</p>
              </div>

              <div className="space-y-1">
                <Label>Intervalo da programação</Label>
                <Select
                  value={operationalKnockoutScheduleAdjustmentBreakAction}
                  onValueChange={(value) => {
                    if (value == "KEEP" || value == "REMOVE" || value == "UPSERT") {
                      setOperationalKnockoutScheduleAdjustmentBreakAction(value);
                      setOperationalKnockoutScheduleAdjustmentPreview(null);
                    }
                  }}
                >
                  <SelectTrigger className="app-input-field" aria-label="Ação do intervalo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KEEP">Manter intervalo</SelectItem>
                    <SelectItem value="REMOVE">Remover intervalo</SelectItem>
                    <SelectItem value="UPSERT">Criar ou editar intervalo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {operationalKnockoutScheduleAdjustmentBreakAction != "KEEP" ? (
              <div className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Intervalo existente</Label>
                  <Select
                    value={operationalKnockoutScheduleAdjustmentBreakId || "NEW_BREAK"}
                    onValueChange={(value) => {
                      const breakItem = operationalKnockoutScheduleAdjustmentBreaks.find(
                        (item) => item.id == value,
                      );
                      setOperationalKnockoutScheduleAdjustmentBreakId(
                        value == "NEW_BREAK" ? "" : value,
                      );
                      if (breakItem) {
                        setOperationalKnockoutScheduleAdjustmentBreakScopeType(
                          breakItem.scope_type,
                        );
                        setOperationalKnockoutScheduleAdjustmentBreakStartTime(
                          breakItem.break_start_time.slice(0, 5),
                        );
                        setOperationalKnockoutScheduleAdjustmentBreakEndTime(
                          breakItem.break_end_time.slice(0, 5),
                        );
                      }
                      setOperationalKnockoutScheduleAdjustmentPreview(null);
                    }}
                  >
                    <SelectTrigger className="app-input-field" aria-label="Intervalo a alterar">
                      <SelectValue placeholder="Selecione o intervalo" />
                    </SelectTrigger>
                    <SelectContent>
                      {operationalKnockoutScheduleAdjustmentBreakAction == "UPSERT" ? (
                        <SelectItem value="NEW_BREAK">Novo intervalo</SelectItem>
                      ) : null}
                      {operationalKnockoutScheduleAdjustmentBreaks.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.scope_type == "ALL_COURTS" ? "Dia inteiro" : "Quadra"} • {item.break_start_time.slice(0, 5)}–{item.break_end_time.slice(0, 5)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {operationalKnockoutScheduleAdjustmentBreakAction == "UPSERT" ? (
                  <>
                    <div className="space-y-1">
                      <Label>Escopo</Label>
                      <Select
                        value={operationalKnockoutScheduleAdjustmentBreakScopeType}
                        onValueChange={(value) => {
                          if (value == "ALL_COURTS" || value == "COURT") {
                            setOperationalKnockoutScheduleAdjustmentBreakScopeType(value);
                            setOperationalKnockoutScheduleAdjustmentPreview(null);
                          }
                        }}
                      >
                        <SelectTrigger className="app-input-field"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL_COURTS">Dia inteiro</SelectItem>
                          <SelectItem value="COURT">Somente esta quadra</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="operational-break-start">Início</Label>
                      <Input
                        id="operational-break-start"
                        type="time"
                        className="app-input-field"
                        value={operationalKnockoutScheduleAdjustmentBreakStartTime}
                        onChange={(event) => {
                          setOperationalKnockoutScheduleAdjustmentBreakStartTime(event.target.value);
                          setOperationalKnockoutScheduleAdjustmentPreview(null);
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="operational-break-end">Fim</Label>
                      <Input
                        id="operational-break-end"
                        type="time"
                        className="app-input-field"
                        value={operationalKnockoutScheduleAdjustmentBreakEndTime}
                        onChange={(event) => {
                          setOperationalKnockoutScheduleAdjustmentBreakEndTime(event.target.value);
                          setOperationalKnockoutScheduleAdjustmentPreview(null);
                        }}
                      />
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            {operationalKnockoutScheduleAdjustmentPreview ? (
              <div className="space-y-3 rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Prévia da programação</p>
                  {operationalKnockoutScheduleAdjustmentPreview.extends_day_end ? (
                    <AppBadge tone={AppBadgeTone.AMBER}>Amplia o fim do dia para {resolveSaoPauloTimeLabel(operationalKnockoutScheduleAdjustmentPreview.day_end_after)}</AppBadge>
                  ) : null}
                </div>
                {operationalKnockoutScheduleAdjustmentPreview.blockers.length > 0 ? (
                  <div className="space-y-1 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    {operationalKnockoutScheduleAdjustmentPreview.blockers.map((blocker) => <p key={blocker}>{blocker}</p>)}
                  </div>
                ) : null}
                <div className="space-y-2">
                  {operationalKnockoutScheduleAdjustmentPreview.timeline.map((item) => (
                    <div key={item.bracket_match_id} className="app-card-muted rounded-lg p-2.5 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {item.sport_name}
                          {" • "}
                          {MATCH_NAIPE_LABELS[item.naipe]}
                          {item.division ? ` • ${TEAM_DIVISION_LABELS[item.division]}` : ""}
                          {" • "}
                          {item.is_placeholder ? "A definir" : "Jogo definido"}
                          {item.is_selected ? " • duração ajustada" : ""}
                        </span>
                        <span className="font-medium">{resolveSaoPauloTimeLabel(item.original_start_time)}–{resolveSaoPauloTimeLabel(item.original_end_time)} → {resolveSaoPauloTimeLabel(item.start_time)}–{resolveSaoPauloTimeLabel(item.end_time)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCloseOperationalKnockoutScheduleAdjustmentDialog} disabled={loadingOperationalKnockoutScheduleAdjustment || applyingOperationalKnockoutScheduleAdjustment}>
              Cancelar
            </Button>
            <Button type="button" variant="outline" onClick={() => void handlePreviewOperationalKnockoutScheduleAdjustment()} disabled={loadingOperationalKnockoutScheduleAdjustment || applyingOperationalKnockoutScheduleAdjustment}>
              {loadingOperationalKnockoutScheduleAdjustment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Gerar prévia
            </Button>
            <Button type="button" onClick={() => void handleApplyOperationalKnockoutScheduleAdjustment()} disabled={!operationalKnockoutScheduleAdjustmentPreview || operationalKnockoutScheduleAdjustmentPreview.blockers.length > 0 || loadingOperationalKnockoutScheduleAdjustment || applyingOperationalKnockoutScheduleAdjustment}>
              {applyingOperationalKnockoutScheduleAdjustment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showSwapMatchDialog}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            handleCloseSwapMatchDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Trocar jogo na fila</DialogTitle>
            <DialogDescription>
              Selecione um jogo da mesma modalidade, naipe e quadra para trocar
              a posição da fila, inclusive em outros dias, respeitando a agenda
              e o descanso das atléticas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Jogo selecionado
              </p>
              <div className="app-card-muted rounded-xl p-3 text-sm">
                {pendingSwapSourceMatch
                  ? resolveMatchSwapOptionLabel({
                      match: pendingSwapSourceMatch,
                      shouldUseScheduledSlot: true,
                      displaySlot:
                        visualQueuePositionByMatchId[pendingSwapSourceMatch.id],
                    })
                  : "Selecione um jogo para iniciar a troca."}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Trocar com
              </p>
              <Select
                value={
                  pendingSwapTargetMatchId || EMPTY_SWAP_MATCH_OPTION_VALUE
                }
                onValueChange={(value) => {
                  setPendingSwapTargetMatchId(
                    value == EMPTY_SWAP_MATCH_OPTION_VALUE ? "" : value,
                  );
                }}
                disabled={
                  loadingSwapTargetMatchOptions ||
                  eligibleSwapTargetMatchOptions.length == 0 ||
                  swappingMatches
                }
              >
                <SelectTrigger
                  aria-label="Selecionar jogo para troca de fila"
                  className="app-input-field"
                >
                  <SelectValue placeholder="Selecione o jogo para troca" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_SWAP_MATCH_OPTION_VALUE}>
                    Selecione o jogo
                  </SelectItem>
                  {eligibleSwapTargetMatchOptions.map((swapOption) => (
                    <SelectItem key={swapOption.id} value={swapOption.id}>
                      {swapOption.label}
                      {swapOption.usesReducedCrossSportRestGap ? (
                        <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                          Descanso reduzido: outra modalidade
                        </span>
                      ) : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {loadingSwapTargetMatchOptions ? (
                <p className="text-xs text-muted-foreground">
                  Carregando jogos elegíveis para troca...
                </p>
              ) : eligibleSwapTargetMatchOptions.length == 0 ? (
                <p className="text-xs text-muted-foreground">
                  Não há jogo elegível para troca neste escopo.
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseSwapMatchDialog}
              disabled={swappingMatches}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirmSwapMatches()}
              disabled={
                !pendingSwapSourceMatch ||
                !pendingSwapTargetMatchId ||
                loadingSwapTargetMatchOptions ||
                swappingMatches
              }
            >
              {swappingMatches ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirmar troca
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showKnockoutScheduleSwapDialog}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            handleCloseKnockoutScheduleSwapDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Trocar jogo eliminatório</DialogTitle>
            <DialogDescription>
              Troque este slot por outro slot ou confronto já definido do
              mata-mata, na mesma modalidade e quadra. A troca pode envolver
              naipes e divisões diferentes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Slot selecionado
              </p>
              <div className="app-card-muted rounded-xl p-3 text-sm">
                {pendingKnockoutScheduleSwapSource
                  ? resolveKnockoutScheduleSwapSourceLabel(
                      pendingKnockoutScheduleSwapSource,
                    )
                  : "Selecione um slot para iniciar a troca."}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Trocar com
              </p>
              <Select
                value={
                  pendingKnockoutScheduleSwapTargetId ||
                  EMPTY_KNOCKOUT_SWAP_OPTION_VALUE
                }
                onValueChange={(value) => {
                  setPendingKnockoutScheduleSwapTargetId(
                    value == EMPTY_KNOCKOUT_SWAP_OPTION_VALUE ? "" : value,
                  );
                }}
                disabled={
                  loadingKnockoutScheduleSwapCandidates ||
                  eligibleKnockoutScheduleSwapOptions.length == 0 ||
                  swappingMatches
                }
              >
                <SelectTrigger
                  aria-label="Selecionar jogo eliminatório para troca"
                  className="app-input-field"
                >
                  <SelectValue placeholder="Selecione o jogo eliminatório" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_KNOCKOUT_SWAP_OPTION_VALUE}>
                    Selecione o jogo
                  </SelectItem>
                  {eligibleKnockoutScheduleSwapOptions.map((swapOption) => (
                    <SelectItem key={swapOption.id} value={swapOption.id}>
                      {swapOption.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {loadingKnockoutScheduleSwapCandidates ? (
                <p className="text-xs text-muted-foreground">
                  Carregando jogos eliminatórios elegíveis para troca...
                </p>
              ) : eligibleKnockoutScheduleSwapOptions.length == 0 ? (
                <p className="text-xs text-muted-foreground">
                  Não há slot ou jogo eliminatório elegível neste escopo.
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseKnockoutScheduleSwapDialog}
              disabled={swappingMatches}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirmKnockoutScheduleSwap()}
              disabled={
                !pendingKnockoutScheduleSwapSource ||
                !pendingKnockoutScheduleSwapTargetId ||
                loadingKnockoutScheduleSwapCandidates ||
                swappingMatches
              }
            >
              {swappingMatches ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirmar troca
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showHoldMatchesDialog}
        onOpenChange={(isOpen) => {
          if (!holdingMatchesForRelocation) {
            setShowHoldMatchesDialog(isOpen);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Guardar jogos para realocação</DialogTitle>
            <DialogDescription>
              Os jogos permanecem criados, mas deixam a programação ativa até que a CO defina novo dia, local e quadra.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="app-card-muted rounded-xl p-3 text-sm">
              {selectedMatchIds.length} jogo(s) serão retirados da programação atual. A referência ao número anterior será preservada.
            </div>

            <div className="space-y-1.5">
              {matches
                .filter((match) => selectedMatchIds.includes(match.id))
                .map((match) => (
                  <div key={match.id} className="rounded-lg border border-border/60 px-3 py-2 text-sm">
                    <p className="font-medium text-foreground">
                      {match.home_team?.name ?? "Casa"} x {match.away_team?.name ?? "Visitante"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {match.sports?.name ?? "Modalidade"} • {resolveDisplayedMatchQueueLabel(
                        match,
                        visualQueuePositionByMatchId[match.id],
                      )}
                    </p>
                  </div>
                ))}
            </div>

            <div className="space-y-1">
              <Label>Motivo</Label>
              <Select
                value={holdMatchesReason}
                onValueChange={(value) => {
                  if (value in MANUAL_MATCH_RELOCATION_REASON_LABELS) {
                    setHoldMatchesReason(value as ManualMatchRelocationReason);
                  }
                }}
              >
                <SelectTrigger className="app-input-field" aria-label="Motivo da retenção">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MANUAL_MATCH_RELOCATION_REASON_LABELS) as ManualMatchRelocationReason[]).map(
                    (reason) => (
                      <SelectItem key={reason} value={reason}>
                        {MANUAL_MATCH_RELOCATION_REASON_LABELS[reason]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="hold-matches-notes">Observação</Label>
              <Input
                id="hold-matches-notes"
                value={holdMatchesNotes}
                onChange={(event) => setHoldMatchesNotes(event.target.value)}
                placeholder="Contexto adicional da decisão (opcional)"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowHoldMatchesDialog(false)}
              disabled={holdingMatchesForRelocation}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleHoldMatchesForRelocation()}
              disabled={holdingMatchesForRelocation}
            >
              {holdingMatchesForRelocation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar retenção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showManualRelocationSlotDialog}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            handleCloseManualRelocationSlotDialog();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Encaixar em horário livre</DialogTitle>
            <DialogDescription>
              Escolha a quadra de destino e um ponto da programação. Jogos
              agendados e slots planejados posteriores podem ser reposicionados,
              mas partidas ao vivo, encerradas e reservas manuais permanecem
              fixas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {manualRelocationSlotMatch ? (
              <div className="app-card-muted rounded-xl p-3 text-sm">
                <p className="font-medium">
                  {manualRelocationSlotMatch.home_team?.name ?? "Casa"} x {manualRelocationSlotMatch.away_team?.name ?? "Visitante"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {manualRelocationSlotMatch.sports?.name ?? "Modalidade"} • {MATCH_NAIPE_LABELS[manualRelocationSlotMatch.naipe]}
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label className="flex h-4 items-center">Dia de destino</Label>
                <Select
                  value={manualRelocationSlotTargetDate || EMPTY_MANUAL_RELOCATION_OPTION_VALUE}
                  onValueChange={(value) => {
                    setManualRelocationSlotTargetDate(value == EMPTY_MANUAL_RELOCATION_OPTION_VALUE ? "" : value);
                    setManualRelocationSlotTargetLocation("");
                    setManualRelocationSlotTargetCourt("");
                    setManualRelocationSlotId("");
                    setManualRelocationSlotPreview(null);
                  }}
                >
                  <SelectTrigger className="app-input-field" aria-label="Dia de destino do encaixe">
                    <SelectValue placeholder="Selecione o dia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_MANUAL_RELOCATION_OPTION_VALUE}>Selecione o dia</SelectItem>
                    {bracketCourtSportsDays.map((scheduleDay) => (
                      <SelectItem key={scheduleDay.bracket_day_id} value={scheduleDay.event_date}>
                        {format(new Date(`${scheduleDay.event_date}T12:00:00`), "dd/MM/yyyy")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="flex h-4 items-center">Local</Label>
                <Select
                  value={manualRelocationSlotTargetLocation || EMPTY_MANUAL_RELOCATION_OPTION_VALUE}
                  onValueChange={(value) => {
                    setManualRelocationSlotTargetLocation(value == EMPTY_MANUAL_RELOCATION_OPTION_VALUE ? "" : value);
                    setManualRelocationSlotTargetCourt("");
                    setManualRelocationSlotId("");
                    setManualRelocationSlotPreview(null);
                  }}
                  disabled={!manualRelocationSlotTargetDate}
                >
                  <SelectTrigger className="app-input-field" aria-label="Local de destino do encaixe"><SelectValue placeholder="Selecione o local" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_MANUAL_RELOCATION_OPTION_VALUE}>Selecione o local</SelectItem>
                    {manualRelocationSlotLocations.map((scheduleLocation) => (
                      <SelectItem key={scheduleLocation.id} value={scheduleLocation.name}>{scheduleLocation.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="flex h-4 items-center">Quadra</Label>
                <Select
                  value={manualRelocationSlotTargetCourt || EMPTY_MANUAL_RELOCATION_OPTION_VALUE}
                  onValueChange={(value) => {
                    setManualRelocationSlotTargetCourt(value == EMPTY_MANUAL_RELOCATION_OPTION_VALUE ? "" : value);
                    setManualRelocationSlotId("");
                    setManualRelocationSlotPreview(null);
                  }}
                  disabled={!manualRelocationSlotTargetLocation}
                >
                  <SelectTrigger className="app-input-field" aria-label="Quadra de destino do encaixe"><SelectValue placeholder="Selecione a quadra" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_MANUAL_RELOCATION_OPTION_VALUE}>Selecione a quadra</SelectItem>
                    {manualRelocationSlotCourts.map((court) => (
                      <SelectItem key={court.id} value={court.name}>{court.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Motivo</Label>
                <Select value={manualRelocationSlotReason} onValueChange={(value) => {
                  if (value in MANUAL_MATCH_RELOCATION_REASON_LABELS) {
                    setManualRelocationSlotReason(value as ManualMatchRelocationReason);
                    setManualRelocationSlotPreview(null);
                  }
                }}>
                  <SelectTrigger className="app-input-field" aria-label="Motivo do encaixe"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MANUAL_MATCH_RELOCATION_REASON_LABELS) as ManualMatchRelocationReason[]).map((reason) => (
                      <SelectItem key={reason} value={reason}>{MANUAL_MATCH_RELOCATION_REASON_LABELS[reason]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="manual-relocation-slot-notes">Observação</Label>
                <Input id="manual-relocation-slot-notes" value={manualRelocationSlotNotes} onChange={(event) => {
                  setManualRelocationSlotNotes(event.target.value);
                  setManualRelocationSlotPreview(null);
                }} placeholder="Contexto adicional (opcional)" />
              </div>
            </div>

            {manualRelocationSlotPreview?.slots.length ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Horários disponíveis</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {manualRelocationSlotPreview.slots.map((slot) => {
                    const isSelected = manualRelocationSlotId == slot.id;
                    return (
                      <Button key={slot.id} type="button" variant={isSelected ? "default" : "outline"} className="h-auto items-start justify-start whitespace-normal p-3 text-left" onClick={() => {
                        setManualRelocationSlotId(slot.id);
                        setManualRelocationSlotPreview((currentPreview) => currentPreview ? { ...currentPreview, changes: [], blockers: [] } : currentPreview);
                      }}>
                        <span className="space-y-1">
                          <span className="block font-semibold">{format(new Date(slot.start_time), "HH:mm")}–{format(new Date(slot.end_time), "HH:mm")}</span>
                          <span className="block text-xs font-normal opacity-85">
                            {slot.is_free_gap ||
                            slot.displaced_matches_count +
                              (slot.displaced_placeholders_count ?? 0) ==
                              0
                              ? "Lacuna livre"
                              : `Desloca ${slot.displaced_matches_count + (slot.displaced_placeholders_count ?? 0)} item(ns) planejado(s)`}
                            {slot.next_match_label ? ` • antes de ${slot.next_match_label}` : " • fim da programação"}
                          </span>
                          {slot.is_projected_from_live_match ? <span className="block text-xs font-normal opacity-85">Projeção baseada em jogo ao vivo.</span> : null}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : manualRelocationSlotPreview ? (
              <div className="app-card-muted rounded-xl p-3 text-sm text-muted-foreground">Não há horários elegíveis para esta combinação.</div>
            ) : null}

            {manualRelocationSlotPreview && manualRelocationSlotPreview.changes.length > 0 ? (
              <div className="space-y-3 rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">Prévia do encaixe</p>
                    <p className="text-sm text-muted-foreground">Encerramento previsto: {manualRelocationSlotPreview.next_day_end}{manualRelocationSlotPreview.extends_day_end ? ` (antes: ${manualRelocationSlotPreview.previous_day_end})` : ""}</p>
                  </div>
                  {manualRelocationSlotPreview.extends_day_end ? <AppBadge tone={AppBadgeTone.AMBER}>Dia ampliado</AppBadge> : null}
                </div>
                {manualRelocationSlotPreview.blockers.length > 0 ? <div className="space-y-1 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{manualRelocationSlotPreview.blockers.map((blocker) => <p key={blocker}>{blocker}</p>)}</div> : null}
                {manualRelocationSlotPreview.representation_warning ? <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">{manualRelocationSlotPreview.representation_warning}</p> : null}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {manualRelocationSlotPreview.timeline.map((item) => {
                    const status = item.status as MatchStatus;
                    const isPlaceholder = isManualRelocationPlaceholderItem(item);
                    return <div key={item.item_id ?? item.match_id ?? item.placeholder_id} className="app-card-muted space-y-2 rounded-lg p-2.5">
                      <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold tabular-nums">{item.start_time ? format(new Date(item.start_time), "HH:mm") : "Sem horário"}</p><AppBadge tone={isPlaceholder ? AppBadgeTone.AMBER : resolveMatchStatusBadgeTone(status)}>{isPlaceholder ? "A definir" : resolveMatchStatusLabel(status)}</AppBadge></div>
                      <p className="text-xs font-medium text-foreground">{resolveManualRelocationItemLabel(item)}</p>
                      <p className="text-xs text-muted-foreground">{item.end_time ? `Término ${format(new Date(item.end_time), "HH:mm")}` : "Sem término previsto"}</p>
                      {item.is_relocated ? <AppBadge tone={AppBadgeTone.AMBER}>Encaixado</AppBadge> : item.is_displaced ? <AppBadge tone={AppBadgeTone.NEUTRAL}>Reposicionado</AppBadge> : null}
                    </div>;
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCloseManualRelocationSlotDialog} disabled={loadingManualRelocationSlots || applyingManualRelocationSlot}>Cancelar</Button>
            <Button type="button" variant="outline" onClick={() => void handleLoadManualRelocationSlots()} disabled={loadingManualRelocationSlots || applyingManualRelocationSlot}>{loadingManualRelocationSlots ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Buscar horários</Button>
            <Button type="button" variant="outline" onClick={() => void handlePreviewManualRelocationSlot()} disabled={!manualRelocationSlotId || loadingManualRelocationSlots || applyingManualRelocationSlot}>Calcular prévia</Button>
            <Button type="button" onClick={() => void handleApplyManualRelocationSlot()} disabled={!manualRelocationSlotPreview || manualRelocationSlotPreview.changes.length == 0 || manualRelocationSlotPreview.blockers.length > 0 || loadingManualRelocationSlots || applyingManualRelocationSlot}>{applyingManualRelocationSlot ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Confirmar encaixe</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showDayScheduleReorganizationDialog}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            handleCloseDayScheduleReorganizationDialog();
          }
        }}
      >
        <DialogContent
          ref={dayScheduleReorganizationDialogContentRef}
          className="max-h-[90vh] overflow-y-auto sm:max-w-5xl"
          onDragOver={handleDayScheduleReorganizationDialogDragOver}
        >
          <DialogHeader>
            <DialogTitle>Realocar jogos selecionados</DialogTitle>
            <DialogDescription>
              Encaixa os jogos guardados e recalcula as quadras do local no mesmo dia,
              respeitando descanso, reservas, jogos protegidos e slots planejados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!dayScheduleReorganizationPreview ? (
              <div className="space-y-2 rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Jogos que serão encaixados</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    A sequência original desta seleção será preservada ao posicionar os jogos.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedPendingMatchesForDayScheduleReorganization.map((match) => {
                    const previousDate = resolvePendingManualRelocationScheduleValue(
                      match,
                      "scheduled_date",
                    );
                    const previousLocation = resolvePendingManualRelocationScheduleValue(
                      match,
                      "location",
                    );
                    const previousCourt = resolvePendingManualRelocationScheduleValue(
                      match,
                      "court_name",
                    );
                    const previousStart = resolvePendingManualRelocationScheduleValue(
                      match,
                      "start_time",
                    );

                    return (
                      <div key={match.id} className="app-card-muted rounded-lg p-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <AppBadge tone={AppBadgeTone.NEUTRAL}>
                            {match.sports?.name ?? "Modalidade"}
                          </AppBadge>
                          <AppBadge tone={resolveMatchNaipeBadgeTone(match.naipe)}>
                            {MATCH_NAIPE_LABELS[match.naipe]}
                          </AppBadge>
                          {match.division ? (
                            <AppBadge tone={TEAM_DIVISION_BADGE_TONES[match.division]}>
                              {TEAM_DIVISION_LABELS[match.division]}
                            </AppBadge>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm font-semibold">
                          {match.home_team?.name ?? "Casa"} x {match.away_team?.name ?? "Visitante"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Antes: {typeof previousDate == "string" ? resolveBrazilianDateLabel(previousDate) : "sem data"}
                          {typeof previousStart == "string" ? ` • ${resolvePublicScheduleTimeLabel(previousStart) ?? previousStart.slice(0, 5)}` : ""}
                          {typeof previousLocation == "string" ? ` • ${previousLocation}` : ""}
                          {typeof previousCourt == "string" ? ` • ${previousCourt}` : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Dia de destino</Label>
                <Select
                  value={dayScheduleReorganizationTargetDate || EMPTY_MANUAL_RELOCATION_OPTION_VALUE}
                  onValueChange={(value) => {
                    setDayScheduleReorganizationTargetDate(
                      value == EMPTY_MANUAL_RELOCATION_OPTION_VALUE ? "" : value,
                    );
                    setDayScheduleReorganizationTargetLocation("");
                    setDayScheduleReorganizationTargetCourt("");
                    setDayScheduleReorganizationManualPreview(null);
                    setDayScheduleReorganizationManualCourtItemOrder({});
                    setPlacedDayScheduleReorganizationMatchIds([]);
                  }}
                >
                  <SelectTrigger className="app-input-field" aria-label="Dia da reorganização">
                    <SelectValue placeholder="Selecione o dia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_MANUAL_RELOCATION_OPTION_VALUE}>Selecione o dia</SelectItem>
                    {bracketCourtSportsDays.map((scheduleDay) => (
                      <SelectItem key={scheduleDay.bracket_day_id} value={scheduleDay.event_date}>
                        {format(new Date(`${scheduleDay.event_date}T12:00:00`), "dd/MM/yyyy")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Local</Label>
                <Select
                  value={dayScheduleReorganizationTargetLocation || EMPTY_MANUAL_RELOCATION_OPTION_VALUE}
                  onValueChange={(value) => {
                    setDayScheduleReorganizationTargetLocation(
                      value == EMPTY_MANUAL_RELOCATION_OPTION_VALUE ? "" : value,
                    );
                    setDayScheduleReorganizationTargetCourt("");
                    setDayScheduleReorganizationManualPreview(null);
                    setDayScheduleReorganizationManualCourtItemOrder({});
                    setPlacedDayScheduleReorganizationMatchIds([]);
                  }}
                  disabled={!dayScheduleReorganizationTargetDate}
                >
                  <SelectTrigger className="app-input-field" aria-label="Local da reorganização">
                    <SelectValue placeholder="Selecione o local" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_MANUAL_RELOCATION_OPTION_VALUE}>Selecione o local</SelectItem>
                    {dayScheduleReorganizationLocations.map((scheduleLocation) => (
                      <SelectItem key={scheduleLocation.id} value={scheduleLocation.name}>
                        {scheduleLocation.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="flex h-4 items-center">Quadra-base</Label>
                <Select
                  value={dayScheduleReorganizationTargetCourt || EMPTY_MANUAL_RELOCATION_OPTION_VALUE}
                  onValueChange={(value) => {
                    setDayScheduleReorganizationTargetCourt(
                      value == EMPTY_MANUAL_RELOCATION_OPTION_VALUE ? "" : value,
                    );
                    setDayScheduleReorganizationManualPreview(null);
                    setDayScheduleReorganizationManualCourtItemOrder({});
                    setPlacedDayScheduleReorganizationMatchIds([]);
                  }}
                  disabled={!dayScheduleReorganizationTargetLocation}
                >
                  <SelectTrigger className="app-input-field" aria-label="Quadra-base da reorganização">
                    <SelectValue placeholder="Selecione a quadra" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_MANUAL_RELOCATION_OPTION_VALUE}>Selecione a quadra</SelectItem>
                    {dayScheduleReorganizationCourts.map((court) => (
                      <SelectItem key={court.id} value={court.name}>{court.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <div className="flex h-4 items-center gap-1.5">
                  <Label htmlFor="day-schedule-reorganization-day-start">Novo horário de início do dia</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Ajuda sobre novo horário de início do dia"
                      >
                        <CircleHelp className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs leading-relaxed">
                      Opcional. Informe somente para antecipar o início do dia; não define o horário do jogo selecionado.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="day-schedule-reorganization-day-start"
                  type="time"
                  className="app-input-field [appearance:textfield] [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-clear-button]:hidden [&::-webkit-inner-spin-button]:hidden"
                  value={dayScheduleReorganizationDayStartTime}
                  onChange={(event) => {
                    setDayScheduleReorganizationDayStartTime(event.target.value);
                    setDayScheduleReorganizationManualPreview(null);
                    setDayScheduleReorganizationManualCourtItemOrder({});
                    setPlacedDayScheduleReorganizationMatchIds([]);
                  }}
                />
              </div>

              <div className="space-y-1">
                <Label className="flex h-4 items-center">Motivo</Label>
                <Select
                  value={dayScheduleReorganizationReason}
                  onValueChange={(value) => {
                    if (value in MANUAL_MATCH_RELOCATION_REASON_LABELS) {
                      setDayScheduleReorganizationReason(value as ManualMatchRelocationReason);
                      setDayScheduleReorganizationManualPreview(null);
                      setDayScheduleReorganizationManualCourtItemOrder({});
                      setPlacedDayScheduleReorganizationMatchIds([]);
                    }
                  }}
                >
                  <SelectTrigger className="app-input-field" aria-label="Motivo da reorganização">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MANUAL_MATCH_RELOCATION_REASON_LABELS) as ManualMatchRelocationReason[]).map((reason) => (
                      <SelectItem key={reason} value={reason}>{MANUAL_MATCH_RELOCATION_REASON_LABELS[reason]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <div className="flex h-4 items-center gap-1.5">
                  <Label>Intervalo da programação</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Ajuda sobre intervalo da programação"
                      >
                        <CircleHelp className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs leading-relaxed">
                      {dayScheduleReorganizationManagedBreak
                        ? dayScheduleReorganizationBreakPolicy == "REMOVE"
                          ? `Intervalo da quadra-base ${dayScheduleReorganizationTargetCourt}: ${dayScheduleReorganizationManagedBreak.break_start_time.slice(0, 5)}–${dayScheduleReorganizationManagedBreak.break_end_time.slice(0, 5)}. Será removido na confirmação e sua janela ficará disponível; ajustes posteriores podem ocorrer para respeitar descanso, reservas e bloqueios.`
                          : dayScheduleReorganizationBreak
                            ? `Intervalo geral: ${dayScheduleReorganizationManagedBreak.break_start_time.slice(0, 5)}–${dayScheduleReorganizationManagedBreak.break_end_time.slice(0, 5)}. Será reposicionado antes do primeiro jogo eliminatório.`
                            : `Intervalo da quadra-base ${dayScheduleReorganizationTargetCourt}: ${dayScheduleReorganizationManagedBreak.break_start_time.slice(0, 5)}–${dayScheduleReorganizationManagedBreak.break_end_time.slice(0, 5)}. Mantém a duração e acompanha os jogos encaixados antes dele; os itens seguintes permanecem após o intervalo.`
                        : "Não há intervalo configurado para este dia ou para a quadra-base."}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={
                    dayScheduleReorganizationManagedBreak
                      ? dayScheduleReorganizationBreakPolicy
                      : "NO_BREAK"
                  }
                  onValueChange={(value) => {
                    if (value == "KEEP_BEFORE_KNOCKOUT" || value == "REMOVE") {
                      setDayScheduleReorganizationBreakPolicy(value);
                      setDayScheduleReorganizationManualPreview(null);
                      setDayScheduleReorganizationManualCourtItemOrder({});
                      setPlacedDayScheduleReorganizationMatchIds([]);
                    }
                  }}
                  disabled={!dayScheduleReorganizationManagedBreak}
                >
                  <SelectTrigger className="app-input-field" aria-label="Política do intervalo da programação">
                    <SelectValue placeholder="Sem intervalo configurado" />
                  </SelectTrigger>
                  <SelectContent>
                    {dayScheduleReorganizationManagedBreak ? (
                      <>
                        <SelectItem value="KEEP_BEFORE_KNOCKOUT">
                          {dayScheduleReorganizationBreak
                            ? "Manter antes do mata-mata"
                            : "Manter na sequência da quadra"}
                        </SelectItem>
                        <SelectItem value="REMOVE">
                          Remover intervalo
                        </SelectItem>
                      </>
                    ) : (
                      <SelectItem value="NO_BREAK" disabled>
                        Sem intervalo configurado
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {dayScheduleReorganizationPreview ? (
              <div className="space-y-3 rounded-xl border border-border p-3">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div className="space-y-1">
                    <Label>Montagem do cronograma</Label>
                    <p className="text-xs text-muted-foreground">
                      A prévia mantém as demais quadras até que você reordene os itens móveis da própria quadra para resolver conflitos de descanso.
                    </p>
                  </div>
                  {dayScheduleReorganizationPreview ? (
                    <div className="text-sm text-muted-foreground md:text-right">
                      <p>Início: {dayScheduleReorganizationPreview.next_day_start}</p>
                      <p>Fim: {dayScheduleReorganizationPreview.next_day_end}</p>
                    </div>
                  ) : null}
                </div>

                {dayScheduleReorganizationPreview ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {dayScheduleReorganizationBreakPolicy == "REMOVE" && dayScheduleReorganizationManagedBreak ? (
                        <span>Intervalo: removido na confirmação</span>
                      ) : dayScheduleReorganizationPreview.break.before.id ? (
                        <span>
                          Intervalo: {dayScheduleReorganizationPreview.break.after.start_time && dayScheduleReorganizationPreview.break.after.end_time
                            ? `${dayScheduleReorganizationPreview.break.after.start_time}–${dayScheduleReorganizationPreview.break.after.end_time}`
                            : "removido"}
                        </span>
                      ) : (
                        <span>Sem intervalo configurado</span>
                      )}
                      {dayScheduleReorganizationPreview.advances_day_start ? <AppBadge tone={AppBadgeTone.AMBER}>Dia antecipado</AppBadge> : null}
                      {dayScheduleReorganizationPreview.extends_day_end ? <AppBadge tone={AppBadgeTone.AMBER}>Dia ampliado</AppBadge> : null}
                    </div>
                    <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                      <p className="text-sm font-medium">Jogos a encaixar</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {selectedPendingMatchesForDayScheduleReorganization
                          .filter(
                            (match) =>
                              !placedDayScheduleReorganizationMatchIds.includes(match.id),
                          )
                          .map((match) => (
                            <div
                              key={match.id}
                              className="app-card-muted cursor-grab rounded-lg p-2.5 active:cursor-grabbing"
                              draggable={!loadingDayScheduleReorganizationPreview}
                              onDragStart={() =>
                                setDraggedDayScheduleReorganizationItem({
                                  type: "PENDING",
                                  itemId: match.id,
                                })
                              }
                              onDragEnd={() =>
                                setDraggedDayScheduleReorganizationItem(null)
                              }
                            >
                              <div className="flex flex-wrap gap-1">
                                <AppBadge tone={AppBadgeTone.NEUTRAL}>
                                  {match.sports?.name ?? "Modalidade"}
                                </AppBadge>
                                <AppBadge tone={resolveMatchNaipeBadgeTone(match.naipe)}>
                                  {MATCH_NAIPE_LABELS[match.naipe]}
                                </AppBadge>
                              </div>
                              <p className="mt-2 text-sm font-semibold">
                                {match.home_team?.name ?? "Casa"} x {match.away_team?.name ?? "Visitante"}
                              </p>
                            </div>
                          ))}
                      </div>
                      {placedDayScheduleReorganizationMatchIds.length == selectedPendingMatchesForDayScheduleReorganization.length ? (
                        <p className="text-xs text-emerald-700 dark:text-emerald-300">Todos os jogos selecionados foram posicionados.</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Posicione todos os jogos desta bandeja antes de confirmar.</p>
                      )}
                    </div>

                    {dayScheduleReorganizationPreview.blockers.length > 0 ? (
                      <div className="space-y-1 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                        {dayScheduleReorganizationPreview.blockers.map((blocker) => <p key={blocker}>{blocker}</p>)}
                      </div>
                    ) : null}

                    <div className="overflow-x-auto pb-1">
                      <div
                        className="grid min-w-[34rem] gap-3"
                        style={{
                          gridTemplateColumns: `repeat(${Math.max(dayScheduleReorganizationTimelineCourtColumns.length, 1)}, minmax(16rem, 1fr))`,
                        }}
                      >
                        {dayScheduleReorganizationTimelineCourtColumns.map((courtColumn) => (
                          <div key={courtColumn.courtName} className="min-w-0 rounded-xl border border-border/70 bg-muted/20 p-3">
                            <div className="border-b border-border/60 pb-2">
                              <p className="font-semibold">{courtColumn.courtName}</p>
                              <p className="text-xs text-muted-foreground">Sequência cronológica da quadra</p>
                            </div>
                            <div className="mt-3 space-y-2">
                              {courtColumn.items.map((item) => {
                                if (item.item_type == "BREAK") {
                                  return (
                                    <div key={item.item_id} className="rounded-lg border border-amber-300/80 bg-amber-500/10 p-2.5">
                                      <div className="flex items-start justify-between gap-2">
                                        <AppBadge tone={AppBadgeTone.AMBER}>Intervalo</AppBadge>
                                        <p className="shrink-0 text-xs font-semibold tabular-nums">
                                          {format(new Date(item.start_time), "HH:mm")}–{format(new Date(item.end_time), "HH:mm")}
                                        </p>
                                      </div>
                                      <p className="mt-2 text-sm font-semibold leading-tight">Intervalo da quadra</p>
                                      <div className="mt-2 flex flex-wrap items-center gap-1">
                                        <AppBadge tone={item.is_displaced ? AppBadgeTone.NEUTRAL : AppBadgeTone.SILVER}>
                                          {item.is_displaced ? "Reposicionado" : "Mantido"}
                                        </AppBadge>
                                      </div>
                                    </div>
                                  );
                                }

                                const isPlaceholder = isManualRelocationPlaceholderItem(item);
                                const match = item.match_id
                                  ? matches.find((candidateMatch) => candidateMatch.id == item.match_id)
                                  : null;
                                const placeholder = item.placeholder_id
                                  ? dayScheduleReorganizationPlaceholdersById.get(item.placeholder_id)
                                  : null;
                                const sportName = placeholder?.sport_name ?? match?.sports?.name ?? "Modalidade";
                                const naipe = placeholder?.naipe ?? match?.naipe ?? null;
                                const division = placeholder?.division ?? match?.division ?? null;
                                const label = isPlaceholder
                                  ? "A definir x A definir"
                                  : match
                                    ? `${match.home_team?.name ?? "Casa"} x ${match.away_team?.name ?? "Visitante"}`
                                    : resolveManualRelocationItemLabel(item);

                                const itemId =
                                  item.item_type == "BREAK"
                                    ? null
                                    : resolveDayScheduleReorganizationTimelineItemId(item);
                                const restConflicts = item.rest_conflicts ?? [];
                                const canReorderManualItem =
                                  Boolean(itemId) &&
                                  !item.is_fixed;
                                const canPlacePendingMatch =
                                  courtColumn.courtName == dayScheduleReorganizationTargetCourt &&
                                  Boolean(itemId) &&
                                  !item.is_fixed;

                                return (
                                  <div
                                    key={item.item_id ?? item.match_id ?? item.placeholder_id}
                                    className="space-y-2"
                                  >
                                    <div
                                      className={`app-card-muted rounded-lg p-2.5 ${
                                        restConflicts.length > 0
                                          ? `border-2 border-destructive/90 bg-destructive/20 ${
                                              canReorderManualItem
                                                ? "cursor-grab active:cursor-grabbing"
                                                : ""
                                            }`
                                          : canReorderManualItem
                                            ? "cursor-grab active:cursor-grabbing"
                                            : ""
                                      }`}
                                    draggable={canReorderManualItem && !loadingDayScheduleReorganizationPreview}
                                      onDragStart={() => {
                                        if (itemId) {
                                          setDraggedDayScheduleReorganizationItem({
                                            type: "TIMELINE",
                                            courtName: courtColumn.courtName,
                                            itemId,
                                          });
                                        }
                                      }}
                                      onDragEnd={() =>
                                        setDraggedDayScheduleReorganizationItem(null)
                                      }
                                      onDragOver={(event) => {
                                        if (canReorderManualItem || canPlacePendingMatch) {
                                          event.preventDefault();
                                        }
                                      }}
                                      onDrop={(event) => {
                                        event.preventDefault();

                                        if (!itemId) {
                                          return;
                                        }

                                        if (draggedDayScheduleReorganizationItem?.type == "PENDING") {
                                          if (canPlacePendingMatch) {
                                            void handlePlaceDayScheduleReorganizationPendingMatch(
                                              itemId,
                                              "BEFORE",
                                            );
                                          }
                                        } else if (canReorderManualItem) {
                                          void handleReorderDayScheduleReorganizationManualItem(
                                            courtColumn.courtName,
                                            itemId,
                                            "BEFORE",
                                          );
                                        }
                                      }}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                      <div className="flex min-w-0 flex-wrap items-center gap-1">
                                        <AppBadge tone={AppBadgeTone.NEUTRAL}>{sportName}</AppBadge>
                                        {naipe ? <AppBadge tone={resolveMatchNaipeBadgeTone(naipe)}>{MATCH_NAIPE_LABELS[naipe]}</AppBadge> : null}
                                        {division ? <AppBadge tone={TEAM_DIVISION_BADGE_TONES[division]}>{TEAM_DIVISION_LABELS[division]}</AppBadge> : null}
                                      </div>
                                      <p className="shrink-0 text-xs font-semibold tabular-nums">
                                        {item.start_time ? format(new Date(item.start_time), "HH:mm") : "Sem horário"}
                                      </p>
                                    </div>
                                    <p className="mt-2 text-sm font-semibold leading-tight">{label}</p>
                                    <div className="mt-2 flex flex-wrap items-center gap-1">
                                      {isPlaceholder ? <AppBadge tone={AppBadgeTone.AMBER}>A definir</AppBadge> : null}
                                      {placeholder?.display_match_number != null ? <AppBadge tone={AppBadgeTone.SILVER}>Jogo {placeholder.display_match_number}</AppBadge> : null}
                                      {placeholder ? <AppBadge tone={AppBadgeTone.NEUTRAL}>{placeholder.stage_label}</AppBadge> : null}
                                      {item.is_relocated ? <AppBadge tone={AppBadgeTone.AMBER}>Encaixado</AppBadge> : item.is_displaced ? <AppBadge tone={AppBadgeTone.NEUTRAL}>Reposicionado</AppBadge> : null}
                                    </div>
                                    <p className="mt-2 text-xs text-muted-foreground">
                                      {item.end_time ? `Término ${format(new Date(item.end_time), "HH:mm")}` : "Sem término previsto"}
                                    </p>
                                    {restConflicts.length > 0 ? (
                                      <p className="mt-2 text-xs font-medium text-destructive">
                                        {restConflicts.join(" ")}
                                      </p>
                                    ) : null}
                                  </div>
                                  {(canPlacePendingMatch || canReorderManualItem) && itemId ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="w-full"
                                      onDragOver={(event) => event.preventDefault()}
                                      onDrop={(event) => {
                                        event.preventDefault();
                                        if (draggedDayScheduleReorganizationItem?.type == "PENDING") {
                                          if (canPlacePendingMatch) {
                                            void handlePlaceDayScheduleReorganizationPendingMatch(
                                              itemId,
                                              "AFTER",
                                            );
                                          }
                                        } else if (
                                          draggedDayScheduleReorganizationItem?.type == "TIMELINE" &&
                                          canReorderManualItem
                                        ) {
                                          void handleReorderDayScheduleReorganizationManualItem(
                                            courtColumn.courtName,
                                            itemId,
                                            "AFTER",
                                          );
                                        }
                                      }}
                                    >
                                      Soltar após este item
                                    </Button>
                                  ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCloseDayScheduleReorganizationDialog} disabled={loadingDayScheduleReorganizationPreview || applyingDayScheduleReorganization}>Cancelar</Button>
            <Button type="button" variant="outline" onClick={() => void handlePreviewDayScheduleReorganization()} disabled={loadingDayScheduleReorganizationPreview || applyingDayScheduleReorganization}>
              {loadingDayScheduleReorganizationPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Montar cronograma
            </Button>
            <Button type="button" onClick={() => void handleApplyDayScheduleReorganization()} disabled={!dayScheduleReorganizationManualPreview || placedDayScheduleReorganizationMatchIds.length != selectedPendingMatchesForDayScheduleReorganization.length || dayScheduleReorganizationHasRestConflicts || dayScheduleReorganizationManualPreview.blockers.length > 0 || applyingDayScheduleReorganization || loadingDayScheduleReorganizationPreview}>
              {applyingDayScheduleReorganization ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar reorganização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showManualRelocationDialog}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            handleCloseManualRelocationDialog();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Realocar jogos</DialogTitle>
            <DialogDescription>
              Move jogos agendados para o início ou fim da fila de uma quadra
              configurada. A prévia também mostra os slots planejados que serão
              reposicionados e eventual ampliação do dia antes da confirmação.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="app-card-muted rounded-xl p-3 text-sm">
              <p className="font-medium">
                {selectedMatchesForManualRelocation.length} jogo(s) selecionado(s)
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                A ordem cronológica atual da seleção será preservada.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Dia de destino</Label>
                <Select
                  value={manualRelocationTargetDate || EMPTY_MANUAL_RELOCATION_OPTION_VALUE}
                  onValueChange={(value) => {
                    const nextDate =
                      value == EMPTY_MANUAL_RELOCATION_OPTION_VALUE ? "" : value;
                    setManualRelocationTargetDate(nextDate);
                    setManualRelocationTargetLocation("");
                    setManualRelocationTargetCourt("");
                    setManualRelocationTargetStartTime("");
                    setManualRelocationPreview(null);
                  }}
                >
                  <SelectTrigger className="app-input-field" aria-label="Dia de destino">
                    <SelectValue placeholder="Selecione o dia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_MANUAL_RELOCATION_OPTION_VALUE}>
                      Selecione o dia
                    </SelectItem>
                    {bracketCourtSportsDays.map((scheduleDay) => (
                      <SelectItem key={scheduleDay.bracket_day_id} value={scheduleDay.event_date}>
                        {format(new Date(`${scheduleDay.event_date}T12:00:00`), "dd/MM/yyyy")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Local</Label>
                <Select
                  value={manualRelocationTargetLocation || EMPTY_MANUAL_RELOCATION_OPTION_VALUE}
                  onValueChange={(value) => {
                    setManualRelocationTargetLocation(
                      value == EMPTY_MANUAL_RELOCATION_OPTION_VALUE ? "" : value,
                    );
                    setManualRelocationTargetCourt("");
                    setManualRelocationPreview(null);
                  }}
                  disabled={!manualRelocationTargetDate}
                >
                  <SelectTrigger className="app-input-field" aria-label="Local de destino">
                    <SelectValue placeholder="Selecione o local" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_MANUAL_RELOCATION_OPTION_VALUE}>
                      Selecione o local
                    </SelectItem>
                    {manualRelocationLocations.map((scheduleLocation) => (
                      <SelectItem key={scheduleLocation.id} value={scheduleLocation.name}>
                        {scheduleLocation.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Quadra</Label>
                <Select
                  value={manualRelocationTargetCourt || EMPTY_MANUAL_RELOCATION_OPTION_VALUE}
                  onValueChange={(value) => {
                    setManualRelocationTargetCourt(
                      value == EMPTY_MANUAL_RELOCATION_OPTION_VALUE ? "" : value,
                    );
                    setManualRelocationPreview(null);
                  }}
                  disabled={!manualRelocationTargetLocation}
                >
                  <SelectTrigger className="app-input-field" aria-label="Quadra de destino">
                    <SelectValue placeholder="Selecione a quadra" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_MANUAL_RELOCATION_OPTION_VALUE}>
                      Selecione a quadra
                    </SelectItem>
                    {manualRelocationCourts.map((court) => (
                      <SelectItem key={court.id} value={court.name}>
                        {court.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Posição na fila</Label>
                <Select
                  value={manualRelocationPosition}
                  onValueChange={(value) => {
                    if (value == "START" || value == "END") {
                      setManualRelocationPosition(value);
                      setManualRelocationPreview(null);
                    }
                  }}
                >
                  <SelectTrigger className="app-input-field" aria-label="Posição na fila">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="END">Fim da fila</SelectItem>
                    <SelectItem value="START">Início da fila</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Motivo</Label>
                <Select
                  value={manualRelocationReason}
                  onValueChange={(value) => {
                    if (value in MANUAL_MATCH_RELOCATION_REASON_LABELS) {
                      setManualRelocationReason(value as ManualMatchRelocationReason);
                      setManualRelocationPreview(null);
                    }
                  }}
                >
                  <SelectTrigger className="app-input-field" aria-label="Motivo da realocação">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MANUAL_MATCH_RELOCATION_REASON_LABELS) as ManualMatchRelocationReason[]).map(
                      (reason) => (
                        <SelectItem key={reason} value={reason}>
                          {MANUAL_MATCH_RELOCATION_REASON_LABELS[reason]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="manual-relocation-start-time">
                Novo horário de início
              </Label>
              <Input
                id="manual-relocation-start-time"
                type="time"
                value={manualRelocationTargetStartTime}
                onChange={(event) => {
                  setManualRelocationTargetStartTime(event.target.value);
                  setManualRelocationPreview(null);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Opcional. Quando informado, deve antecipar o início configurado
                do dia e reorganiza a fila da quadra de destino.
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="manual-relocation-notes">Observação</Label>
              <Input
                id="manual-relocation-notes"
                value={manualRelocationNotes}
                onChange={(event) => {
                  setManualRelocationNotes(event.target.value);
                  setManualRelocationPreview(null);
                }}
                placeholder="Contexto adicional da decisão (opcional)"
              />
            </div>

            {manualRelocationPreview ? (
              <div className="space-y-3 rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">Prévia da realocação</p>
                    <p className="text-sm text-muted-foreground">
                      Início previsto: {manualRelocationPreview.next_day_start}
                      {manualRelocationPreview.advances_day_start
                        ? ` (antes: ${manualRelocationPreview.previous_day_start})`
                        : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Encerramento previsto: {manualRelocationPreview.next_day_end}
                      {manualRelocationPreview.extends_day_end
                        ? ` (antes: ${manualRelocationPreview.previous_day_end})`
                        : ""}
                    </p>
                  </div>
                  {manualRelocationPreview.extends_day_end ? (
                    <AppBadge tone={AppBadgeTone.AMBER}>Dia ampliado</AppBadge>
                  ) : null}
                  {manualRelocationPreview.advances_day_start ? (
                    <AppBadge tone={AppBadgeTone.AMBER}>Dia antecipado</AppBadge>
                  ) : null}
                </div>

                {manualRelocationPreview.blockers.length > 0 ? (
                  <div className="space-y-1 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    {manualRelocationPreview.blockers.map((blocker) => (
                      <p key={blocker}>{blocker}</p>
                    ))}
                  </div>
                ) : null}

                {manualRelocationPreview.representation_warning ? (
                  <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                    {manualRelocationPreview.representation_warning}
                  </p>
                ) : null}

                <div className="space-y-2">
                  {manualRelocationPreview.changes.map((change) => {
                    const match = change.match_id
                      ? matches.find((item) => item.id == change.match_id)
                      : null;
                    const label = match
                      ? `${match.home_team?.name ?? "Casa"} x ${match.away_team?.name ?? "Visitante"}`
                      : resolveManualRelocationItemLabel(change);

                    return (
                      <div key={change.item_id ?? change.match_id ?? change.placeholder_id} className="app-card-muted rounded-lg p-3 text-sm">
                        <p className="font-medium">
                          {change.is_selected
                            ? "Realocado"
                            : isManualRelocationPlaceholderItem(change)
                              ? "Slot planejado reposicionado"
                              : "Fila deslocada"}
                          : {label}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {change.before.court_name ?? "Sem quadra"} {change.before.start_time ? `• ${format(new Date(change.before.start_time), "HH:mm")}` : ""}
                          {" → "}
                          {change.after.court_name} • {format(new Date(change.after.start_time), "HH:mm")}–{format(new Date(change.after.end_time), "HH:mm")}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Timeline da quadra de destino
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {manualRelocationPreview.timeline.map((item) => {
                    const status = item.status as MatchStatus;
                    const isPlaceholder = isManualRelocationPlaceholderItem(item);

                    return (
                      <div
                          key={item.item_id ?? item.match_id ?? item.placeholder_id}
                          className="app-card-muted space-y-2 rounded-lg p-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold tabular-nums">
                              {item.start_time
                                ? format(new Date(item.start_time), "HH:mm")
                                : "Sem horário"}
                            </p>
                            <AppBadge
                              tone={
                                isPlaceholder
                                  ? AppBadgeTone.AMBER
                                  : resolveMatchStatusBadgeTone(status)
                              }
                            >
                              {isPlaceholder
                                ? "A definir"
                                : resolveMatchStatusLabel(status)}
                            </AppBadge>
                          </div>
                          <p className="text-xs font-medium text-foreground">
                            {resolveManualRelocationItemLabel(item)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.end_time
                              ? `Término ${format(new Date(item.end_time), "HH:mm")}`
                              : "Sem término previsto"}
                          </p>
                          {item.is_relocated ? (
                            <AppBadge tone={AppBadgeTone.AMBER}>Realocado</AppBadge>
                          ) : item.is_displaced ? (
                            <AppBadge tone={AppBadgeTone.NEUTRAL}>Reposicionado</AppBadge>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseManualRelocationDialog}
              disabled={loadingManualRelocationPreview || applyingManualRelocation}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handlePreviewManualRelocation()}
              disabled={loadingManualRelocationPreview || applyingManualRelocation}
            >
              {loadingManualRelocationPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Calcular prévia
            </Button>
            <Button
              type="button"
              onClick={() => void handleApplyManualRelocation()}
              disabled={
                !manualRelocationPreview ||
                manualRelocationPreview.blockers.length > 0 ||
                loadingManualRelocationPreview ||
                applyingManualRelocation
              }
            >
              {applyingManualRelocation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar realocação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={showDeleteMatchDialog}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setShowDeleteMatchDialog(false);
            setPendingDeleteMatchId(null);
            setPendingDeleteMatchLabel("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir jogo</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteMatchLabel
                ? `Deseja realmente excluir o jogo ${pendingDeleteMatchLabel}? Esta ação não poderá ser desfeita.`
                : "Deseja realmente excluir este jogo? Esta ação não poderá ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingMatches}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteMatchFromDialog()}
              disabled={deletingMatches}
            >
              {deletingMatches ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirmar exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showDeleteSelectedMatchesDialog}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setShowDeleteSelectedMatchesDialog(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir jogos selecionados</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá {selectedMatchIds.length} jogo(s)
              selecionado(s).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingMatches}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteSelectedMatches()}
              disabled={deletingMatches}
            >
              {deletingMatches ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirmar exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={activeScoreSheetReviewMatchId != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            handleCloseScoreSheetReviewDialog();
          }
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden sm:max-h-none sm:w-full sm:max-w-[min(96vw,1500px)] sm:overflow-visible">
          <DialogHeader>
            <DialogTitle>Revisão de súmula e premiações</DialogTitle>
            <DialogDescription>
              Informe os autores de gol do Futebol Society e os atletas
              responsáveis por cada cartão lançado.
            </DialogDescription>
          </DialogHeader>

          {isLoadingActiveScoreSheetAwardsContext ||
          !activeScoreSheetReviewMatch ||
          !activeScoreSheetAwardsDraft ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : (
            <div className="space-y-4 overflow-y-auto pr-1">
              <div className="app-card-muted rounded-xl p-3 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="font-medium">
                    {activeScoreSheetReviewMatch.home_team?.name ?? "Casa"}{" "}
                    {activeScoreSheetReviewMatch.home_score} ×{" "}
                    {activeScoreSheetReviewMatch.away_score}{" "}
                    {activeScoreSheetReviewMatch.away_team?.name ?? "Visitante"}
                  </p>
                  <AppBadge
                    tone={resolveMatchNaipeBadgeTone(
                      String(activeScoreSheetReviewMatch.naipe),
                    )}
                  >
                    {
                      MATCH_NAIPE_LABELS[
                        activeScoreSheetReviewMatch.naipe as MatchNaipe
                      ]
                    }
                  </AppBadge>
                  {activeScoreSheetReviewMatch.division ? (
                    <AppBadge
                      tone={
                        TEAM_DIVISION_BADGE_TONES[
                          activeScoreSheetReviewMatch.division as TeamDivision
                        ]
                      }
                    >
                      {
                        TEAM_DIVISION_LABELS[
                          activeScoreSheetReviewMatch.division as TeamDivision
                        ]
                      }
                    </AppBadge>
                  ) : null}
                </div>
                {activeScoreSheetAwardsDraft.isWalkover ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Jogo com W.O.: não exige premiações individuais para
                    revisão.
                  </p>
                ) : null}
                {activeScoreSheetAwardsDraft.requiresGoalScorers &&
                resolveMatchPenaltyShootoutSummary(
                  activeScoreSheetReviewMatch,
                  matchBracketContextByMatchId[activeScoreSheetReviewMatch.id],
                ) ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Os pênaltis desempataram o jogo, mas não entram na
                    artilharia. Informe apenas os autores dos gols do tempo
                    normal.
                  </p>
                ) : null}
              </div>

              {!activeScoreSheetAwardsDraft.isWalkover &&
              activeScoreSheetAwardsDraft.requiresGoalScorers ? (
                <div
                  className={`rounded-xl border px-3 py-2.5 text-sm ${hasIncompleteActiveScoreSheetGoalSelections ? "border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950 dark:text-amber-100" : "border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950 dark:text-emerald-100"}`}
                >
                  <p className="font-medium">
                    {hasIncompleteActiveScoreSheetGoalSelections
                      ? `Faltam ${activeScoreSheetGoalSelectionSummary.pendingGoals} autor${activeScoreSheetGoalSelectionSummary.pendingGoals == 1 ? "" : "es"} de gol para liberar o salvamento.`
                      : "Todos os autores dos gols foram vinculados."}
                  </p>
                  <p className="mt-1 text-xs text-current/80">
                    {activeScoreSheetGoalSelectionSummary.filledGoals} de{" "}
                    {activeScoreSheetGoalSelectionSummary.totalGoals} gols
                    preenchidos nesta revisão.
                  </p>
                </div>
              ) : null}

              {!activeScoreSheetAwardsDraft.isWalkover &&
              hasIncompleteActiveScoreSheetDisciplineSelections ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  Informe o atleta responsável por cada cartão para liberar o
                  salvamento.
                </div>
              ) : null}

              {!activeScoreSheetAwardsDraft.isWalkover &&
              hasActiveScoreSheetYellowCardAccumulation ? (
                <div className="rounded-xl border border-red-300/60 bg-red-50 px-3 py-2.5 text-sm text-red-900 dark:border-red-800/60 dark:bg-red-950 dark:text-red-100">
                  Dois cartões amarelos foram vinculados ao mesmo atleta nesta
                  partida. Isso gera vermelho por acúmulo e suspensão para a
                  próxima partida da equipe.
                </div>
              ) : null}

              {!activeScoreSheetAwardsDraft.isWalkover ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  {[
                    {
                      key: "home" as const,
                      title:
                        activeScoreSheetReviewMatch.home_team?.name ??
                        "Time da casa",
                      playerOptions:
                        activeScoreSheetAwardsDraft.homePlayerOptions,
                      goalSelections:
                        activeScoreSheetAwardsDraft.homeGoalSelections,
                      yellowCardSelections:
                        activeScoreSheetAwardsDraft.homeYellowCardSelections,
                      redCardSelections:
                        activeScoreSheetAwardsDraft.homeRedCardSelections,
                      blueCardSelections:
                        activeScoreSheetAwardsDraft.homeBlueCardSelections,
                      newPlayerName:
                        activeScoreSheetAwardsDraft.newHomePlayerName,
                    },
                    {
                      key: "away" as const,
                      title:
                        activeScoreSheetReviewMatch.away_team?.name ??
                        "Time visitante",
                      playerOptions:
                        activeScoreSheetAwardsDraft.awayPlayerOptions,
                      goalSelections:
                        activeScoreSheetAwardsDraft.awayGoalSelections,
                      yellowCardSelections:
                        activeScoreSheetAwardsDraft.awayYellowCardSelections,
                      redCardSelections:
                        activeScoreSheetAwardsDraft.awayRedCardSelections,
                      blueCardSelections:
                        activeScoreSheetAwardsDraft.awayBlueCardSelections,
                      newPlayerName:
                        activeScoreSheetAwardsDraft.newAwayPlayerName,
                    },
                  ]
                    .filter(
                      (teamSection) =>
                        teamSection.goalSelections.length > 0 ||
                        teamSection.yellowCardSelections.length > 0 ||
                        teamSection.redCardSelections.length > 0 ||
                        teamSection.blueCardSelections.length > 0,
                    )
                    .map((teamSection) => {
                    const totalGoals = teamSection.goalSelections.length;
                    const filledGoals = teamSection.goalSelections.filter(
                      (goalSelection) =>
                        goalSelection.scorerId.trim().length > 0,
                    ).length;
                    const pendingGoals = totalGoals - filledGoals;

                    return (
                      <div
                        key={teamSection.key}
                        className="app-card-muted space-y-3 rounded-xl p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold">
                              {teamSection.title}
                            </p>
                            {activeScoreSheetAwardsDraft.requiresGoalScorers &&
                            totalGoals > 0 ? (
                              <p className="text-xs text-muted-foreground">
                                {filledGoals} de {totalGoals} gols vinculados
                                {pendingGoals > 0
                                  ? ` • faltam ${pendingGoals}`
                                  : ""}
                              </p>
                            ) : activeScoreSheetAwardsDraft.supportsCards ? (
                              <p className="text-xs text-muted-foreground">
                                Ocorrências disciplinares devem ser vinculadas abaixo.
                              </p>
                            ) : null}
                          </div>
                          {activeScoreSheetAwardsDraft.requiresGoalScorers &&
                          totalGoals > 0 ? (
                            <div
                              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${pendingGoals > 0 ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-100" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"}`}
                            >
                              {pendingGoals > 0 ? "Pendente" : "Completo"}
                            </div>
                          ) : null}
                        </div>

                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] xl:items-start">
                          <div className="space-y-2">
                            {activeScoreSheetAwardsDraft.requiresGoalScorers ? (
                              <>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Autores dos gols
                            </p>
                            {teamSection.goalSelections.length > 0 ? (
                              teamSection.playerOptions.length > 0 ? (
                                <div className="space-y-2">
                                  {teamSection.goalSelections.map(
                                    (goalSelection, goalIndex) => (
                                      <div
                                        key={`${teamSection.key}-goal-${goalIndex + 1}`}
                                        className="space-y-1"
                                      >
                                        <Label className="text-xs text-muted-foreground">
                                          {goalIndex + 1}º gol
                                        </Label>
                                        <Select
                                          value={
                                            goalSelection.scorerId ||
                                            EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE
                                          }
                                          onValueChange={(value) => {
                                            handleUpdateScoreSheetAwardsDraft(
                                              activeScoreSheetReviewMatch.id,
                                              (draft) => {
                                                const nextSelections = [
                                                  ...(teamSection.key == "home"
                                                    ? draft.homeGoalSelections
                                                    : draft.awayGoalSelections),
                                                ];
                                                nextSelections[goalIndex] = {
                                                  ...nextSelections[goalIndex],
                                                  scorerId:
                                                    value ==
                                                    EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE
                                                      ? ""
                                                      : value,
                                                };
                                                return {
                                                  ...draft,
                                                  homeGoalSelections:
                                                    teamSection.key == "home"
                                                      ? nextSelections
                                                      : draft.homeGoalSelections,
                                                  awayGoalSelections:
                                                    teamSection.key == "away"
                                                      ? nextSelections
                                                      : draft.awayGoalSelections,
                                                };
                                              },
                                            );
                                          }}
                                        >
                                          <SelectTrigger
                                            className="app-input-field"
                                            aria-label={`${teamSection.title} gol ${goalIndex + 1}`}
                                          >
                                            <SelectValue
                                              placeholder={`Selecione o autor do ${goalIndex + 1}º gol`}
                                            />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem
                                              value={
                                                EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE
                                              }
                                            >
                                              Selecione o jogador
                                            </SelectItem>
                                            {teamSection.playerOptions.map(
                                              (playerOption) => (
                                                <SelectItem
                                                  key={playerOption.id}
                                                  value={playerOption.id}
                                                >
                                                  {playerOption.name}
                                                </SelectItem>
                                              ),
                                            )}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    ),
                                  )}
                                </div>
                              ) : (
                                <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
                                  Nenhum atleta cadastrado ainda. Cadastre um
                                  atleta para vincular os gols desta atlética.
                                </div>
                              )
                            ) : (
                              <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
                                Esta atlética não marcou gols nesta partida.
                              </div>
                            )}
                              </>
                            ) : null}

                            {activeScoreSheetAwardsDraft.supportsCards ? (
                              <div className="mt-4 space-y-2 border-t border-border/50 pt-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Cartões amarelos
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  O vínculo com o atleta é obrigatório.
                                </p>
                                {teamSection.yellowCardSelections.length > 0 ? (
                                  teamSection.playerOptions.length > 0 ? (
                                    <div className="space-y-2">
                                      {teamSection.yellowCardSelections.map(
                                        (yellowCardSelection, yellowCardIndex) => (
                                          <div
                                            key={`${teamSection.key}-yellow-card-${yellowCardIndex + 1}`}
                                            className="space-y-1"
                                          >
                                            <Label className="text-xs text-muted-foreground">
                                              {yellowCardIndex + 1}º amarelo
                                            </Label>
                                            <Select
                                              value={
                                                yellowCardSelection.scorerId ||
                                                EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE
                                              }
                                              onValueChange={(value) => {
                                                handleUpdateScoreSheetAwardsDraft(
                                                  activeScoreSheetReviewMatch.id,
                                                  (draft) => {
                                                    const nextSelections = [
                                                      ...(teamSection.key == "home"
                                                        ? draft.homeYellowCardSelections
                                                        : draft.awayYellowCardSelections),
                                                    ];
                                                    nextSelections[yellowCardIndex] = {
                                                      ...nextSelections[yellowCardIndex],
                                                      scorerId:
                                                        value ==
                                                        EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE
                                                          ? ""
                                                          : value,
                                                    };
                                                    return {
                                                      ...draft,
                                                      homeYellowCardSelections:
                                                        teamSection.key == "home"
                                                          ? nextSelections
                                                          : draft.homeYellowCardSelections,
                                                      awayYellowCardSelections:
                                                        teamSection.key == "away"
                                                          ? nextSelections
                                                          : draft.awayYellowCardSelections,
                                                    };
                                                  },
                                                );
                                              }}
                                            >
                                              <SelectTrigger
                                                className="app-input-field"
                                                aria-label={`${teamSection.title} cartão amarelo ${yellowCardIndex + 1}`}
                                              >
                                                <SelectValue placeholder="Selecione o atleta" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem
                                                  value={
                                                    EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE
                                                  }
                                                >
                                                  Selecione o atleta
                                                </SelectItem>
                                                {teamSection.playerOptions.map(
                                                  (playerOption) => (
                                                    <SelectItem
                                                      key={playerOption.id}
                                                      value={playerOption.id}
                                                    >
                                                      {playerOption.name}
                                                    </SelectItem>
                                                  ),
                                                )}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  ) : (
                                    <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
                                      Cadastre um atleta abaixo para vincular os
                                      cartões amarelos desta atlética.
                                    </div>
                                  )
                                ) : (
                                  <p className="text-sm text-muted-foreground">
                                    Nenhum cartão amarelo lançado para esta
                                    atlética.
                                  </p>
                                )}
                              </div>
                            ) : null}
                            {activeScoreSheetAwardsDraft.supportsCards ? (
                              <div className="mt-4 space-y-2 border-t border-border/50 pt-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Cartões vermelhos
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  O vínculo com o atleta é obrigatório.
                                </p>
                                {teamSection.redCardSelections.length > 0 ? (
                                  teamSection.playerOptions.length > 0 ? (
                                    <div className="space-y-2">
                                      {teamSection.redCardSelections.map(
                                        (redCardSelection, redCardIndex) => (
                                          <div
                                            key={`${teamSection.key}-red-card-${redCardIndex + 1}`}
                                            className="space-y-1"
                                          >
                                            <Label className="text-xs text-muted-foreground">
                                              {redCardIndex + 1}º vermelho
                                            </Label>
                                            <Select
                                              value={
                                                redCardSelection.scorerId ||
                                                EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE
                                              }
                                              onValueChange={(value) => {
                                                handleUpdateScoreSheetAwardsDraft(
                                                  activeScoreSheetReviewMatch.id,
                                                  (draft) => {
                                                    const nextSelections = [
                                                      ...(teamSection.key == "home"
                                                        ? draft.homeRedCardSelections
                                                        : draft.awayRedCardSelections),
                                                    ];
                                                    nextSelections[redCardIndex] = {
                                                      ...nextSelections[redCardIndex],
                                                      scorerId:
                                                        value ==
                                                        EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE
                                                          ? ""
                                                          : value,
                                                    };
                                                    return {
                                                      ...draft,
                                                      homeRedCardSelections:
                                                        teamSection.key == "home"
                                                          ? nextSelections
                                                          : draft.homeRedCardSelections,
                                                      awayRedCardSelections:
                                                        teamSection.key == "away"
                                                          ? nextSelections
                                                          : draft.awayRedCardSelections,
                                                    };
                                                  },
                                                );
                                              }}
                                            >
                                              <SelectTrigger
                                                className="app-input-field"
                                                aria-label={`${teamSection.title} cartão vermelho ${redCardIndex + 1}`}
                                              >
                                                <SelectValue placeholder="Selecione o atleta" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem
                                                  value={
                                                    EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE
                                                  }
                                                >
                                                  Selecione o atleta
                                                </SelectItem>
                                                {teamSection.playerOptions.map(
                                                  (playerOption) => (
                                                    <SelectItem
                                                      key={playerOption.id}
                                                      value={playerOption.id}
                                                    >
                                                      {playerOption.name}
                                                    </SelectItem>
                                                  ),
                                                )}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  ) : (
                                    <div className="rounded-lg border border-dashed border-destructive/30 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
                                      Cadastre um atleta abaixo para vincular os
                                      cartões vermelhos desta atlética.
                                    </div>
                                  )
                                ) : (
                                  <p className="text-sm text-muted-foreground">
                                    Nenhum cartão vermelho lançado para esta
                                    atlética.
                                  </p>
                                )}
                              </div>
                            ) : null}
                            {activeScoreSheetAwardsDraft.supportsCards ? (
                              <ScoreSheetDisciplineSelectionFields
                                ariaLabelPrefix={`${teamSection.title} cartão azul`}
                                emptyMessage="cartões azuis"
                                eventLabel="azul"
                                noEventMessage="Nenhum cartão azul lançado para esta atlética."
                                playerOptions={teamSection.playerOptions}
                                selections={teamSection.blueCardSelections}
                                title="Cartões azuis"
                                onSelectionChange={(selectionIndex, value) => {
                                  handleUpdateScoreSheetAwardsDraft(
                                    activeScoreSheetReviewMatch.id,
                                    (draft) => {
                                      const selections = [
                                        ...(teamSection.key == "home"
                                          ? draft.homeBlueCardSelections
                                          : draft.awayBlueCardSelections),
                                      ];
                                      selections[selectionIndex] = {
                                        ...selections[selectionIndex],
                                        scorerId: value,
                                      };
                                      return {
                                        ...draft,
                                        homeBlueCardSelections:
                                          teamSection.key == "home"
                                            ? selections
                                            : draft.homeBlueCardSelections,
                                        awayBlueCardSelections:
                                          teamSection.key == "away"
                                            ? selections
                                            : draft.awayBlueCardSelections,
                                      };
                                    },
                                  );
                                }}
                              />
                            ) : null}
                          </div>

                          <div className="space-y-3">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Atletas cadastrados
                                </p>
                                <span className="text-xs text-muted-foreground">
                                  {teamSection.playerOptions.length} atleta
                                  {teamSection.playerOptions.length == 1
                                    ? ""
                                    : "s"}
                                </span>
                              </div>
                              {teamSection.playerOptions.length > 0 ? (
                                <div className="space-y-1.5">
                                  {teamSection.playerOptions.map(
                                    (playerOption) => {
                                      const editKey = `${activeScoreSheetReviewMatch.id}:${teamSection.key}`;
                                      const editingState =
                                        editingPlayerByKey[editKey];
                                      const isEditing =
                                        editingState?.playerId ==
                                        playerOption.id;

                                      if (isEditing) {
                                        return (
                                          <div
                                            key={playerOption.id}
                                            className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2"
                                          >
                                            <div className="flex gap-1.5">
                                              <Input
                                                value={editingState.name}
                                                onChange={(e) => {
                                                  const v = e.target.value;
                                                  setEditingPlayerByKey(
                                                    (prev) => ({
                                                      ...prev,
                                                      [editKey]: editingState
                                                        ? {
                                                            ...editingState,
                                                            name: v,
                                                          }
                                                        : null,
                                                    }),
                                                  );
                                                }}
                                                onKeyDown={(e) => {
                                                  if (e.key == "Enter")
                                                    handleConfirmEditAwardPlayer(
                                                      activeScoreSheetReviewMatch.id,
                                                      teamSection.key,
                                                    );
                                                  if (e.key == "Escape")
                                                    setEditingPlayerByKey(
                                                      (prev) => ({
                                                        ...prev,
                                                        [editKey]: null,
                                                      }),
                                                    );
                                                }}
                                                className="h-8 text-sm"
                                                autoFocus
                                              />
                                              <Button
                                                type="button"
                                                size="icon"
                                                className="h-8 w-8 shrink-0"
                                                onClick={() =>
                                                  handleConfirmEditAwardPlayer(
                                                    activeScoreSheetReviewMatch.id,
                                                    teamSection.key,
                                                  )
                                                }
                                              >
                                                <Check className="h-3.5 w-3.5" />
                                              </Button>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 shrink-0"
                                                onClick={() =>
                                                  setEditingPlayerByKey(
                                                    (prev) => ({
                                                      ...prev,
                                                      [editKey]: null,
                                                    }),
                                                  )
                                                }
                                              >
                                                <X className="h-3.5 w-3.5" />
                                              </Button>
                                            </div>
                                          </div>
                                        );
                                      }

                                      return (
                                        <div
                                          key={playerOption.id}
                                          className="flex items-center gap-1.5 rounded-lg bg-muted/30 px-2.5 py-1.5"
                                        >
                                          <span className="min-w-0 flex-1 truncate text-sm">
                                            {playerOption.name}
                                          </span>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                                            onClick={() => {
                                              setEditingPlayerByKey((prev) => ({
                                                ...prev,
                                                [editKey]: {
                                                  playerId: playerOption.id,
                                                  name: playerOption.name,
                                                },
                                              }));
                                            }}
                                          >
                                            <Pencil className="h-3 w-3" />
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                                            onClick={() =>
                                              handleDeleteAwardPlayer(
                                                activeScoreSheetReviewMatch.id,
                                                teamSection.key,
                                                playerOption.id,
                                              )
                                            }
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      );
                                    },
                                  )}
                                </div>
                              ) : (
                                <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
                                  Sem atletas cadastrados para esta atlética.
                                </div>
                              )}
                            </div>

                            <div className="space-y-2">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Cadastrar atleta
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Use este campo quando o atleta responsável ainda
                                não estiver na lista acima.
                              </p>
                              <div className="flex gap-2">
                                <Input
                                  ref={(el) => {
                                    newPlayerInputRefs.current[
                                      `${activeScoreSheetReviewMatch.id}:${teamSection.key}`
                                    ] = el;
                                  }}
                                  value={teamSection.newPlayerName}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    handleUpdateScoreSheetAwardsDraft(
                                      activeScoreSheetReviewMatch.id,
                                      (draft) => ({
                                        ...draft,
                                        newHomePlayerName:
                                          teamSection.key == "home"
                                            ? value
                                            : draft.newHomePlayerName,
                                        newAwayPlayerName:
                                          teamSection.key == "away"
                                            ? value
                                            : draft.newAwayPlayerName,
                                      }),
                                    );
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleAddInlineAwardPlayer(
                                        activeScoreSheetReviewMatch.id,
                                        teamSection.key,
                                      );
                                    }
                                  }}
                                  placeholder="Nome do atleta"
                                />
                                {(() => {
                                  const btnState =
                                    addPlayerButtonStateByKey[
                                      `${activeScoreSheetReviewMatch.id}:${teamSection.key}`
                                    ];
                                  return (
                                    <Button
                                      type="button"
                                      variant={
                                        btnState == "success"
                                          ? "default"
                                          : "outline"
                                      }
                                      disabled={!!btnState}
                                      onClick={() =>
                                        handleAddInlineAwardPlayer(
                                          activeScoreSheetReviewMatch.id,
                                          teamSection.key,
                                        )
                                      }
                                      className={
                                        btnState == "success"
                                          ? "border-green-600 bg-green-600 text-white hover:bg-green-600"
                                          : ""
                                      }
                                    >
                                      {btnState == "loading" && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      )}
                                      {btnState == "success" && (
                                        <Check className="mr-2 h-4 w-4" />
                                      )}
                                      {!btnState && (
                                        <Plus className="mr-2 h-4 w-4" />
                                      )}
                                      {btnState == "loading"
                                        ? "Adicionando..."
                                        : btnState == "success"
                                          ? "Adicionado!"
                                          : "Adicionar"}
                                    </Button>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter className="mt-2 flex-col gap-3 sm:flex-col sm:space-x-0">
            {!activeScoreSheetAwardsDraft?.isWalkover &&
            (hasIncompleteActiveScoreSheetGoalSelections ||
              hasIncompleteActiveScoreSheetDisciplineSelections) ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {hasIncompleteActiveScoreSheetGoalSelections
                  ? `Preencha os ${activeScoreSheetGoalSelectionSummary.pendingGoals} autores de gol restantes para salvar.`
                  : "Informe os atletas responsáveis por cada cartão para salvar."}
              </p>
            ) : (
              <div />
            )}
            <div className="flex w-full justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseScoreSheetReviewDialog}
                disabled={isSavingActiveScoreSheetAwardsContext}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => void handleSaveScoreSheetAwards()}
                disabled={
                  isLoadingActiveScoreSheetAwardsContext ||
                  isSavingActiveScoreSheetAwardsContext ||
                  !activeScoreSheetAwardsDraft ||
                  hasIncompleteActiveScoreSheetGoalSelections ||
                  hasIncompleteActiveScoreSheetDisciplineSelections
                }
              >
                {isSavingActiveScoreSheetAwardsContext ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Salvar revisão
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showEditReviewConfirmationDialog}
        onOpenChange={setShowEditReviewConfirmationDialog}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Jogo já revisado na súmula</DialogTitle>
            <DialogDescription>
              Este jogo já estava marcado como conferido. Ao salvar a edição,
              deseja manter a revisão ou remover a marcação?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowEditReviewConfirmationDialog(false)}
              disabled={savingEditingMatch}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleSaveEditingMatch("KEEP_REVIEW")}
              disabled={savingEditingMatch}
            >
              {savingEditingMatch ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Salvar e manter revisão
            </Button>

            <Button
              type="button"
              onClick={() => void handleSaveEditingMatch("REMOVE_REVIEW")}
              disabled={savingEditingMatch}
            >
              {savingEditingMatch ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Salvar e remover revisão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTieBreakDialog} onOpenChange={setShowTieBreakDialog}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Resolver sorteios de desempate</DialogTitle>
            <DialogDescription>
              Quando a classificação chega ao último critério, apenas as vagas
              impactadas ficam pendentes até você confirmar a ordem manual
              desses empates.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
            {pendingTieBreakContexts.map((pendingTieBreakContext) => {
              const orderedTeamIds = resolveNormalizedTieBreakTeamOrder(
                pendingTieBreakContext,
                draftTieBreakTeamIdsByContextKey[
                  pendingTieBreakContext.context_key
                ],
              );
              const isTieBreakContextOrderReady =
                resolveIsTieBreakTeamOrderReady(
                  pendingTieBreakContext,
                  orderedTeamIds,
                );
              const teamNameByTeamId =
                pendingTieBreakTeamNameByContextKeyAndTeamId[
                  pendingTieBreakContext.context_key
                ] ?? {};
              const isSavingTieBreakContext =
                savingTieBreakResolutionByContextKey[
                  pendingTieBreakContext.context_key
                ] == true;
              const displayedTieBreakSlots = pendingTieBreakContext.teams.map(
                (_, teamIndex) => ({
                  position: teamIndex + 1,
                  teamId: orderedTeamIds[teamIndex] ?? "",
                }),
              );

              return (
                <div
                  key={pendingTieBreakContext.context_key}
                  className="glass-card space-y-3 p-4"
                >
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">
                      {pendingTieBreakContext.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {pendingTieBreakContext.description}
                    </p>
                  </div>

                  {!isTieBreakContextOrderReady ? (
                    <p className="text-xs font-medium text-amber-500">
                      Defina a ordem completa sem repetir atléticas para
                      confirmar este desempate.
                    </p>
                  ) : null}

                  <div className="grid gap-2 md:grid-cols-2">
                    {displayedTieBreakSlots.map((displayedTieBreakSlot) => (
                      <div
                        key={`${pendingTieBreakContext.context_key}:${displayedTieBreakSlot.position}`}
                        className="glass-panel-muted flex items-center gap-2 rounded-xl px-3 py-2"
                      >
                        <span className="w-8 shrink-0 text-sm font-medium text-muted-foreground">
                          {displayedTieBreakSlot.position}º
                        </span>
                        <Select
                          value={
                            displayedTieBreakSlot.teamId ||
                            EMPTY_TIE_BREAK_TEAM_OPTION_VALUE
                          }
                          onValueChange={(value) =>
                            handleUpdateTieBreakContextTeamAtPosition(
                              pendingTieBreakContext,
                              displayedTieBreakSlot.position - 1,
                              value == EMPTY_TIE_BREAK_TEAM_OPTION_VALUE
                                ? ""
                                : value,
                            )
                          }
                          disabled={
                            savingTieBreakResolutions ||
                            isSavingTieBreakContext ||
                            !canManageMatches
                          }
                        >
                          <SelectTrigger
                            aria-label={`Atlética na posição ${displayedTieBreakSlot.position} do desempate`}
                            className="app-input-field w-full"
                          >
                            <SelectValue placeholder="Selecione a atlética" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem
                              value={EMPTY_TIE_BREAK_TEAM_OPTION_VALUE}
                            >
                              Selecione a atlética
                            </SelectItem>
                            {pendingTieBreakContext.teams.map(
                              (tieBreakTeamOption) => {
                                const isSelectedInOtherPosition =
                                  displayedTieBreakSlots.some(
                                    (displayedTieBreakSlotItem) => {
                                      return (
                                        displayedTieBreakSlotItem.position !=
                                          displayedTieBreakSlot.position &&
                                        displayedTieBreakSlotItem.teamId ==
                                          tieBreakTeamOption.team_id
                                      );
                                    },
                                  );

                                return (
                                  <SelectItem
                                    key={`${pendingTieBreakContext.context_key}:${displayedTieBreakSlot.position}:${tieBreakTeamOption.team_id}`}
                                    value={tieBreakTeamOption.team_id}
                                    disabled={isSelectedInOtherPosition}
                                  >
                                    {teamNameByTeamId[
                                      tieBreakTeamOption.team_id
                                    ] ?? tieBreakTeamOption.team_name}
                                  </SelectItem>
                                );
                              },
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        handleShuffleTieBreakContext(pendingTieBreakContext)
                      }
                      disabled={
                        savingTieBreakResolutions ||
                        isSavingTieBreakContext ||
                        !canManageMatches
                      }
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {orderedTeamIds.some((teamId) => teamId.length > 0)
                        ? "Refazer sorteio"
                        : "Sortear ordem"}
                    </Button>

                    <Button
                      type="button"
                      onClick={() =>
                        void handleSaveSingleTieBreakResolution(
                          pendingTieBreakContext,
                        )
                      }
                      disabled={
                        !isTieBreakContextOrderReady ||
                        savingTieBreakResolutions ||
                        isSavingTieBreakContext ||
                        !canManageMatches
                      }
                    >
                      {isSavingTieBreakContext ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Salvar sorteio
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowTieBreakDialog(false)}
              disabled={isAnyTieBreakResolutionSaveInFlight}
            >
              Fechar
            </Button>
            <Button
              type="button"
              onClick={handleSaveTieBreakResolutions}
              disabled={
                !isTieBreakResolutionReady ||
                isAnyTieBreakResolutionSaveInFlight ||
                !canManageMatches
              }
            >
              {savingTieBreakResolutions ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirmar sorteios e gerar mata-mata
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingMatchId != null && editingMatchDraft != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            handleCancelEditingMatch();
          }
        }}
      >
        {editingMatch && editingMatchDraft ? (
          <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden sm:w-full sm:max-w-4xl">
            <DialogHeader className="shrink-0">
              <DialogTitle>
                Editar jogo - {selectedChampionship.name}
              </DialogTitle>
              <DialogDescription>
                Atualize a logística do slot, as atléticas e, se necessário,
                force a representação da CO apenas neste jogo.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Naipe
                  </p>
                  <RadioGroup
                    value={editingMatchDraft.naipe}
                    onValueChange={(value) => {
                      if (!isMatchNaipe(value)) {
                        return;
                      }

                      setEditingMatchDraft((currentDraft) =>
                        currentDraft
                          ? {
                              ...currentDraft,
                              naipe: value,
                              sportId: "",
                              selectedGroupOptionValue: "",
                              homeTeamId: "",
                              awayTeamId: "",
                            }
                          : currentDraft,
                      );
                    }}
                    className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-5"
                    disabled={!canEditScheduledMatchSetup}
                  >
                    {NAIPE_OPTIONS.map((naipeOption) => (
                      <Label
                        key={naipeOption}
                        htmlFor={`edit-match-naipe-${naipeOption}`}
                        className="flex cursor-pointer items-center gap-2 p-0 text-sm font-medium text-foreground"
                      >
                        <RadioGroupItem
                          id={`edit-match-naipe-${naipeOption}`}
                          value={naipeOption}
                        />
                        <span>{MATCH_NAIPE_LABELS[naipeOption]}</span>
                      </Label>
                    ))}
                  </RadioGroup>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Contexto do jogo
                  </p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Modalidade
                      </p>
                      <Select
                        value={editingMatchDraft.sportId}
                        onValueChange={(value) =>
                          setEditingMatchDraft((currentDraft) =>
                            currentDraft
                              ? {
                                  ...currentDraft,
                                  sportId: value,
                                  selectedGroupOptionValue: "",
                                  homeTeamId: "",
                                  awayTeamId: "",
                                }
                              : currentDraft,
                          )
                        }
                      >
                        <SelectTrigger
                          aria-label="Modalidade do jogo"
                          className="app-input-field"
                          disabled={!canEditScheduledMatchSetup}
                        >
                          <SelectValue placeholder="Modalidade" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableSportsForEditing.map((sport) => (
                            <SelectItem key={sport.id} value={sport.id}>
                              {sport.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {championshipUsesDivisions ? (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Divisão</p>
                        <Select
                          value={
                            editingMatchDraft.division ??
                            EMPTY_GROUP_OPTION_VALUE
                          }
                          onValueChange={(value) => {
                            const nextDivision =
                              value == EMPTY_GROUP_OPTION_VALUE
                                ? null
                                : isTeamDivision(value)
                                  ? value
                                  : undefined;

                            if (nextDivision === undefined) {
                              return;
                            }

                            setEditingMatchDraft((currentDraft) =>
                              currentDraft
                                ? {
                                    ...currentDraft,
                                    division: nextDivision,
                                    homeTeamId:
                                      currentDraft.division == nextDivision
                                        ? currentDraft.homeTeamId
                                        : "",
                                    awayTeamId:
                                      currentDraft.division == nextDivision
                                        ? currentDraft.awayTeamId
                                        : "",
                                    selectedGroupOptionValue:
                                      currentDraft.division == nextDivision
                                        ? currentDraft.selectedGroupOptionValue
                                        : "",
                                  }
                                : currentDraft,
                            );
                          }}
                          disabled={!canEditScheduledMatchSetup}
                        >
                          <SelectTrigger
                            aria-label="Divisão do jogo"
                            className="app-input-field"
                            disabled={!canEditScheduledMatchSetup}
                          >
                            <SelectValue placeholder="Divisão" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={EMPTY_GROUP_OPTION_VALUE}>
                              Sem divisão
                            </SelectItem>
                            <SelectItem value={TeamDivision.DIVISAO_PRINCIPAL}>
                              {
                                TEAM_DIVISION_LABELS[
                                  TeamDivision.DIVISAO_PRINCIPAL
                                ]
                              }
                            </SelectItem>
                            <SelectItem value={TeamDivision.DIVISAO_ACESSO}>
                              {
                                TEAM_DIVISION_LABELS[
                                  TeamDivision.DIVISAO_ACESSO
                                ]
                              }
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    {hasConfiguredBracket && !editingKnockoutMatchBinding ? (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Chave vinculada
                        </p>
                        <Select
                          value={
                            editingMatchDraft.selectedGroupOptionValue ||
                            EMPTY_GROUP_OPTION_VALUE
                          }
                          onValueChange={(value) =>
                            setEditingMatchDraft((currentDraft) =>
                              currentDraft
                                ? {
                                    ...currentDraft,
                                    selectedGroupOptionValue:
                                      value == EMPTY_GROUP_OPTION_VALUE
                                        ? ""
                                        : value,
                                  }
                                : currentDraft,
                            )
                          }
                          disabled={
                            loadingChampionshipBracket ||
                            !canEditScheduledMatchSetup
                          }
                        >
                          <SelectTrigger
                            aria-label="Grupo do jogo"
                            className="app-input-field"
                            disabled={
                              loadingChampionshipBracket ||
                              !canEditScheduledMatchSetup
                            }
                          >
                            <SelectValue placeholder="Chave" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={EMPTY_GROUP_OPTION_VALUE}>
                              Sem chave vinculada
                            </SelectItem>
                            {editingMatchGroupOptions.map((groupOption) => (
                              <SelectItem
                                key={groupOption.value}
                                value={groupOption.value}
                              >
                                {resolveChampionshipGroupLabel(
                                  groupOption.group_number,
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Operação do dia
                  </p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Local</p>
                      <Select
                        value={editingMatchDraft.location}
                        onValueChange={(value) =>
                          setEditingMatchDraft((currentDraft) =>
                            currentDraft
                              ? {
                                  ...currentDraft,
                                  location: value,
                                  courtName: "",
                                }
                              : currentDraft,
                          )
                        }
                        disabled={
                          editingLocationOptions.length == 0 ||
                          !canEditScheduledMatchSetup
                        }
                      >
                        <SelectTrigger
                          aria-label="Local do jogo"
                          className="app-input-field"
                          disabled={
                            editingLocationOptions.length == 0 ||
                            !canEditScheduledMatchSetup
                          }
                        >
                          <SelectValue
                            placeholder={
                              loadingLocationTemplates
                                ? "Carregando locais"
                                : "Local"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {editingLocationOptions.map((locationOption) => (
                            <SelectItem
                              key={locationOption}
                              value={locationOption}
                            >
                              {locationOption}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Dia da fila
                      </p>
                      <DateTimePicker
                        value={editingMatchDraft.scheduledDate}
                        onChange={(value) =>
                          setEditingMatchDraft((currentDraft) =>
                            currentDraft
                              ? {
                                  ...currentDraft,
                                  scheduledDate: value,
                                }
                              : currentDraft,
                          )
                        }
                        placeholder="Dia da fila"
                        showTime={false}
                        disabled={!canEditScheduledMatchSetup}
                      />
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Quadra</p>
                      <Select
                        value={
                          editingMatchDraft.courtName ||
                          EMPTY_GROUP_OPTION_VALUE
                        }
                        onValueChange={(value) =>
                          setEditingMatchDraft((currentDraft) =>
                            currentDraft
                              ? {
                                  ...currentDraft,
                                  courtName:
                                    value == EMPTY_GROUP_OPTION_VALUE
                                      ? ""
                                      : value,
                                }
                              : currentDraft,
                          )
                        }
                        disabled={
                          editingCourtOptions.length == 0 ||
                          !canEditScheduledMatchSetup
                        }
                      >
                        <SelectTrigger
                          aria-label="Quadra do jogo"
                          className="app-input-field"
                          disabled={
                            editingCourtOptions.length == 0 ||
                            !canEditScheduledMatchSetup
                          }
                        >
                          <SelectValue
                            placeholder={
                              loadingBracketCourtSportsDays
                                ? "Carregando quadras"
                                : "Quadra"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_GROUP_OPTION_VALUE} disabled>
                            {loadingBracketCourtSportsDays
                              ? "Carregando quadras"
                              : "Selecione a quadra"}
                          </SelectItem>
                          {editingCourtOptions.length == 0 ? (
                            <SelectItem value="NO_COURTS_AVAILABLE" disabled>
                              Nenhuma quadra disponível
                            </SelectItem>
                          ) : (
                            editingCourtOptions.map((courtOption) => (
                              <SelectItem key={courtOption} value={courtOption}>
                                {courtOption}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Horário estimado
                      </p>
                      <Select
                        value={
                          selectedEditingScheduleSlot?.start_time ??
                          EMPTY_GROUP_OPTION_VALUE
                        }
                        onValueChange={(value) => {
                          const selectedSlot =
                            editingScheduleSlotOptions.find(
                              (slot) => slot.start_time == value,
                            );

                          if (!selectedSlot) {
                            return;
                          }

                          setEditingMatchDraft((currentDraft) =>
                            currentDraft
                              ? {
                                  ...currentDraft,
                                  startTime: new Date(selectedSlot.start_time),
                                  gameSlot: String(selectedSlot.slot_number),
                                  isEstimatedStartTimeManuallySelected: true,
                                }
                              : currentDraft,
                          );
                        }}
                        disabled={
                          !canEditScheduledMatchSetup ||
                          loadingEditingAvailableScheduleSlots ||
                          editingScheduleSlotOptions.length == 0
                        }
                      >
                        <SelectTrigger
                          aria-label="Horário estimado do jogo"
                          className="app-input-field"
                          disabled={
                            !canEditScheduledMatchSetup ||
                            loadingEditingAvailableScheduleSlots ||
                            editingScheduleSlotOptions.length == 0
                          }
                        >
                          <SelectValue
                            placeholder={
                              loadingEditingAvailableScheduleSlots
                                ? "Carregando horários"
                                : "Horário estimado"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_GROUP_OPTION_VALUE} disabled>
                            {loadingEditingAvailableScheduleSlots
                              ? "Carregando horários"
                              : "Selecione o horário"}
                          </SelectItem>
                          {editingScheduleSlotOptions.length == 0 ? (
                            <SelectItem
                              value="NO_SCHEDULE_SLOTS_AVAILABLE"
                              disabled
                            >
                              Nenhum horário disponível
                            </SelectItem>
                          ) : (
                            editingScheduleSlotOptions.map(
                              (scheduleSlot) => (
                                <SelectItem
                                  key={scheduleSlot.start_time}
                                  value={scheduleSlot.start_time}
                                >
                                  {scheduleSlot.start_time_label}
                                </SelectItem>
                              ),
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Status</p>
                      <Select
                        value={editingMatchDraft.status}
                        onValueChange={(value) => {
                          if (
                            value == MatchStatus.SCHEDULED ||
                            value == MatchStatus.FINISHED ||
                            value == MatchStatus.LIVE
                          ) {
                            setEditingMatchDraft((currentDraft) =>
                              currentDraft
                                ? {
                                    ...currentDraft,
                                    status: value,
                                    resolvedTieBreakerRule:
                                      value == MatchStatus.FINISHED
                                        ? currentDraft.resolvedTieBreakerRule
                                        : "",
                                  }
                                : currentDraft,
                            );
                          }
                        }}
                      >
                        <SelectTrigger
                          aria-label="Status do jogo"
                          className="app-input-field"
                        >
                          <SelectValue placeholder="Status do jogo" />
                        </SelectTrigger>
                        <SelectContent>
                          {editingAllowedStatuses.map((statusOption) => (
                            <SelectItem key={statusOption} value={statusOption}>
                              {statusOption == MatchStatus.SCHEDULED
                                ? "Agendado"
                                : statusOption == MatchStatus.LIVE
                                  ? "Ao vivo"
                                  : "Encerrado"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Número do jogo
                      </p>
                      <div className="app-input-field-disabled flex h-10 items-center rounded-xl px-3 text-sm">
                        {editingMatchDraft.gameSlot
                          ? resolveMatchQueueLabel(
                              Number(editingMatchDraft.gameSlot),
                            )
                          : selectedEditingScheduleSlot
                            ? resolveMatchQueueLabel(
                                selectedEditingScheduleSlot.slot_number,
                              )
                            : "Selecione um horário"}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <p>Representação</p>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:text-foreground"
                              aria-label="Ajuda sobre representação"
                            >
                              <CircleHelp className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs leading-relaxed">
                            Mantém a representação automática desligada só para
                            este jogo.
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="app-card-muted flex min-h-10 items-center justify-between rounded-xl px-3 py-2">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium text-foreground">
                            Forçar CO
                          </p>
                        </div>
                        <Switch
                          checked={
                            editingMatchDraft.manualRepresentationMode ==
                            MatchManualRepresentationMode.CO
                          }
                          onCheckedChange={(checked) =>
                            setEditingMatchDraft((currentDraft) =>
                              currentDraft
                                ? {
                                    ...currentDraft,
                                    manualRepresentationMode: checked
                                      ? MatchManualRepresentationMode.CO
                                      : MatchManualRepresentationMode.AUTO,
                                  }
                                : currentDraft,
                            )
                          }
                          aria-label="Forçar representação da CO"
                          disabled={!canEditScheduledMatchSetup}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {editingMatchDraft.status === MatchStatus.FINISHED ? (
                  <div className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Placar
                    </p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          {editingHomeTeamName}
                        </p>
                        <MatchEditCounter
                          value={editingMatchDraft.homeScore}
                          label={`placar de ${editingHomeTeamName}`}
                          onChange={(homeScore) =>
                            setEditingMatchDraft((currentDraft) =>
                              currentDraft
                                ? {
                                    ...currentDraft,
                                    homeScore,
                                  }
                                : currentDraft,
                            )
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          {editingAwayTeamName}
                        </p>
                        <MatchEditCounter
                          value={editingMatchDraft.awayScore}
                          label={`placar de ${editingAwayTeamName}`}
                          onChange={(awayScore) =>
                            setEditingMatchDraft((currentDraft) =>
                              currentDraft
                                ? {
                                    ...currentDraft,
                                    awayScore,
                                  }
                                : currentDraft,
                            )
                          }
                        />
                      </div>
                    </div>

                    {editingShouldUseSocietyPenaltyShootout ? (
                      <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/30 p-4">
                        <div className="space-y-1">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Pênaltis
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Os pênaltis definem o vencedor oficial do mata-mata,
                            mas não entram na artilharia.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              {editingHomeTeamName}
                            </p>
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              value={editingMatchDraft.homePenaltyScore ?? ""}
                              onChange={(event) =>
                                setEditingMatchDraft((currentDraft) =>
                                  currentDraft
                                    ? {
                                        ...currentDraft,
                                        homePenaltyScore:
                                          resolveParsedNullableScoreInputValue(
                                            event.target.value,
                                          ),
                                      }
                                    : currentDraft,
                                )
                              }
                              className="app-input-field h-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              aria-label="Pênaltis da casa"
                            />
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              {editingAwayTeamName}
                            </p>
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              value={editingMatchDraft.awayPenaltyScore ?? ""}
                              onChange={(event) =>
                                setEditingMatchDraft((currentDraft) =>
                                  currentDraft
                                    ? {
                                        ...currentDraft,
                                        awayPenaltyScore:
                                          resolveParsedNullableScoreInputValue(
                                            event.target.value,
                                          ),
                                      }
                                    : currentDraft,
                                )
                              }
                              className="app-input-field h-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              aria-label="Pênaltis do visitante"
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {isEditingSportWithCards &&
                editingMatchDraft.status === MatchStatus.FINISHED ? (
                  <div className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Cartões
                    </p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-2 app-card-muted rounded-xl p-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          {editingHomeTeamName}
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-amber-700">
                              Amarelos
                            </p>
                            <MatchEditCounter
                              value={editingMatchDraft.homeYellowCards}
                              label={`cartões amarelos de ${editingHomeTeamName}`}
                              onChange={(homeYellowCards) =>
                                setEditingMatchDraft((currentDraft) =>
                                  currentDraft
                                    ? {
                                        ...currentDraft,
                                        homeYellowCards,
                                      }
                                    : currentDraft,
                                )
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs font-medium app-text-status-danger">
                              Vermelhos
                            </p>
                            <MatchEditCounter
                              value={editingMatchDraft.homeRedCards}
                              label={`cartões vermelhos de ${editingHomeTeamName}`}
                              onChange={(homeRedCards) =>
                                setEditingMatchDraft((currentDraft) =>
                                  currentDraft
                                    ? {
                                        ...currentDraft,
                                        homeRedCards,
                                      }
                                    : currentDraft,
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 app-card-muted rounded-xl p-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          {editingAwayTeamName}
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-amber-700">
                              Amarelos
                            </p>
                            <MatchEditCounter
                              value={editingMatchDraft.awayYellowCards}
                              label={`cartões amarelos de ${editingAwayTeamName}`}
                              onChange={(awayYellowCards) =>
                                setEditingMatchDraft((currentDraft) =>
                                  currentDraft
                                    ? {
                                        ...currentDraft,
                                        awayYellowCards,
                                      }
                                    : currentDraft,
                                )
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs font-medium app-text-status-danger">
                              Vermelhos
                            </p>
                            <MatchEditCounter
                              value={editingMatchDraft.awayRedCards}
                              label={`cartões vermelhos de ${editingAwayTeamName}`}
                              onChange={(awayRedCards) =>
                                setEditingMatchDraft((currentDraft) =>
                                  currentDraft
                                    ? {
                                        ...currentDraft,
                                        awayRedCards,
                                      }
                                    : currentDraft,
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {isEditingHandballSport &&
                editingMatchDraft.status === MatchStatus.FINISHED ? (
                  <div className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Disciplina do Handebol
                    </p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-2 app-card-muted rounded-xl p-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          {editingHomeTeamName}
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-sky-700">
                              Cartões azuis
                            </p>
                            <MatchEditCounter
                              value={editingMatchDraft.homeBlueCards}
                              label={`cartões azuis de ${editingHomeTeamName}`}
                              onChange={(homeBlueCards) =>
                                setEditingMatchDraft((currentDraft) =>
                                  currentDraft
                                    ? {
                                        ...currentDraft,
                                        homeBlueCards,
                                      }
                                    : currentDraft,
                                )
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                              Penalidades de 2 min
                            </p>
                            <MatchEditCounter
                              value={editingMatchDraft.homeTwoMinutePenalties}
                              label={`penalidades de 2 minutos de ${editingHomeTeamName}`}
                              onChange={(homeTwoMinutePenalties) =>
                                setEditingMatchDraft((currentDraft) =>
                                  currentDraft
                                    ? {
                                        ...currentDraft,
                                        homeTwoMinutePenalties,
                                      }
                                    : currentDraft,
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2 app-card-muted rounded-xl p-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          {editingAwayTeamName}
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-sky-700">
                              Cartões azuis
                            </p>
                            <MatchEditCounter
                              value={editingMatchDraft.awayBlueCards}
                              label={`cartões azuis de ${editingAwayTeamName}`}
                              onChange={(awayBlueCards) =>
                                setEditingMatchDraft((currentDraft) =>
                                  currentDraft
                                    ? {
                                        ...currentDraft,
                                        awayBlueCards,
                                      }
                                    : currentDraft,
                                )
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                              Penalidades de 2 min
                            </p>
                            <MatchEditCounter
                              value={editingMatchDraft.awayTwoMinutePenalties}
                              label={`penalidades de 2 minutos de ${editingAwayTeamName}`}
                              onChange={(awayTwoMinutePenalties) =>
                                setEditingMatchDraft((currentDraft) =>
                                  currentDraft
                                    ? {
                                        ...currentDraft,
                                        awayTwoMinutePenalties,
                                      }
                                    : currentDraft,
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {isEditingSetRuleMatch ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Resultado por set
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddEditingMatchSet}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Adicionar set
                      </Button>
                    </div>

                    {editingMatchSetsDraft.length == 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nenhum set registrado. Adicione os sets para definir o
                        resultado por sets.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {editingMatchSetsDraft.map(
                          (matchSetDraft, matchSetIndex) => (
                            <div
                              key={`editing-match-set-${matchSetIndex}`}
                              className="app-card-emphasis grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl p-3"
                            >
                              <span className="text-xs font-semibold text-muted-foreground">
                                Set {matchSetIndex + 1}
                              </span>
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                value={matchSetDraft.home_points}
                                onChange={(event) =>
                                  handleUpdateEditingMatchSetPoints(
                                    matchSetIndex,
                                    "home",
                                    event.target.value,
                                  )
                                }
                                className="app-input-field h-10 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                aria-label={`Pontuação da casa no set ${matchSetIndex + 1}`}
                              />
                              <span className="text-sm font-semibold text-muted-foreground">
                                ×
                              </span>
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                value={matchSetDraft.away_points}
                                onChange={(event) =>
                                  handleUpdateEditingMatchSetPoints(
                                    matchSetIndex,
                                    "away",
                                    event.target.value,
                                  )
                                }
                                className="app-input-field h-10 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                aria-label={`Pontuação visitante no set ${matchSetIndex + 1}`}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  handleDeleteEditingMatchSet(matchSetIndex)
                                }
                                aria-label={`Remover set ${matchSetIndex + 1}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Atléticas
                  </p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      {editingKnockoutMatchSourceLabels ? (
                        <p className="text-xs text-muted-foreground">
                          Casa: Origem da vaga{" "}
                          <span className="font-medium text-foreground">
                            {editingKnockoutMatchSourceLabels.home}
                          </span>
                        </p>
                      ) : null}
                      <Select
                        value={editingMatchDraft.homeTeamId}
                        onValueChange={(value) =>
                          setEditingMatchDraft((currentDraft) =>
                            currentDraft
                              ? {
                                  ...currentDraft,
                                  homeTeamId: value,
                                }
                              : currentDraft,
                          )
                        }
                      >
                        <SelectTrigger
                          aria-label="Atlética da casa"
                          className="app-input-field"
                          disabled={!canEditScheduledMatchSetup}
                        >
                          <SelectValue placeholder="Atlética da casa" />
                        </SelectTrigger>
                        <SelectContent>
                          {eligibleTeamsForEditingMatch.map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              {team.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      {editingKnockoutMatchSourceLabels ? (
                        <p className="text-xs text-muted-foreground">
                          Visitante: Origem da vaga{" "}
                          <span className="font-medium text-foreground">
                            {editingKnockoutMatchSourceLabels.away}
                          </span>
                        </p>
                      ) : null}
                      <Select
                        value={editingMatchDraft.awayTeamId}
                        onValueChange={(value) =>
                          setEditingMatchDraft((currentDraft) =>
                            currentDraft
                              ? {
                                  ...currentDraft,
                                  awayTeamId: value,
                                }
                              : currentDraft,
                          )
                        }
                      >
                        <SelectTrigger
                          aria-label="Atlética visitante"
                          className="app-input-field"
                          disabled={!canEditScheduledMatchSetup}
                        >
                          <SelectValue placeholder="Atlética visitante" />
                        </SelectTrigger>
                        <SelectContent>
                          {eligibleTeamsForEditingMatch.map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              {team.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {hasConfiguredBracket && loadingChampionshipBracket ? (
                  <p className="text-xs text-muted-foreground">
                    Carregando dados das chaves desta edição.
                  </p>
                ) : null}

                {hasConfiguredBracket &&
                !loadingChampionshipBracket &&
                editingMatchGroupOptions.length == 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma chave disponível para a combinação atual de
                    modalidade, naipe e divisão.
                  </p>
                ) : null}

                {editingLocationOptions.length == 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum local cadastrado para seleção. Cadastre um local
                    antes de editar o jogo.
                  </p>
                ) : null}

                {editingCourtOptions.length == 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma quadra compatível encontrada para a modalidade e o
                    local selecionados neste dia.
                  </p>
                ) : null}

                {!loadingEditingAvailableScheduleSlots &&
                editingAvailableScheduleSlots.length == 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum horário livre encontrado para o dia, local e quadra
                    selecionados.
                  </p>
                ) : null}
              </div>
            </div>

            <DialogFooter className="shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelEditingMatch}
                disabled={savingEditingMatch}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => void handleSaveEditingMatch()}
                disabled={savingEditingMatch || deletingMatches}
              >
                {savingEditingMatch ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Salvar alterações
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog
        open={showCreateMatchModal}
        onOpenChange={(isOpen) => {
          setShowCreateMatchModal(isOpen);

          if (!isOpen) {
            resetCreateMatchForm();
          }
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden sm:max-h-none sm:w-full sm:max-w-4xl sm:overflow-visible">
          <DialogHeader className="shrink-0">
            <DialogTitle>Novo jogo - {selectedChampionship.name}</DialogTitle>
            <DialogDescription>
              Defina naipe, modalidade, chave, atléticas, local e o dia da fila
              do confronto.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto pr-1 sm:overflow-visible sm:pr-0">
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Naipe
                </p>
                <RadioGroup
                  value={naipe}
                  onValueChange={(value) => {
                    if (isMatchNaipe(value)) {
                      setNaipe(value);
                    }
                  }}
                  className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-5"
                >
                  {NAIPE_OPTIONS.map((naipeOption) => {
                    return (
                      <Label
                        key={naipeOption}
                        htmlFor={`create-match-naipe-${naipeOption}`}
                        className="flex cursor-pointer items-center gap-2 p-0 text-sm font-medium text-foreground"
                      >
                        <RadioGroupItem
                          id={`create-match-naipe-${naipeOption}`}
                          value={naipeOption}
                        />
                        <span>{MATCH_NAIPE_LABELS[naipeOption]}</span>
                      </Label>
                    );
                  })}
                </RadioGroup>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Contexto do jogo
                </p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Select
                    value={sportId}
                    onValueChange={(value) => {
                      setSportId(value);
                      setSelectedGroupOptionValue("");
                      setHomeTeamId("");
                      setAwayTeamId("");
                    }}
                  >
                    <SelectTrigger className="app-input-field">
                      <SelectValue placeholder="Modalidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSportsForCreate.map((sport) => (
                        <SelectItem key={sport.id} value={sport.id}>
                          {sport.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {championshipUsesDivisions ? (
                    <Select
                      value={division}
                      onValueChange={(value) => {
                        if (isTeamDivision(value)) {
                          setDivision(value);
                          setSelectedGroupOptionValue("");
                          setHomeTeamId("");
                          setAwayTeamId("");
                        }
                      }}
                    >
                      <SelectTrigger className="app-input-field">
                        <SelectValue placeholder="Divisão" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={TeamDivision.DIVISAO_PRINCIPAL}>
                          {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_PRINCIPAL]}
                        </SelectItem>
                        <SelectItem value={TeamDivision.DIVISAO_ACESSO}>
                          {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_ACESSO]}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}

                  {hasConfiguredBracket ? (
                    <Select
                      value={
                        selectedGroupOptionValue || EMPTY_GROUP_OPTION_VALUE
                      }
                      onValueChange={(value) => {
                        setSelectedGroupOptionValue(
                          value == EMPTY_GROUP_OPTION_VALUE ? "" : value,
                        );
                      }}
                      disabled={loadingChampionshipBracket}
                    >
                      <SelectTrigger className="app-input-field">
                        <SelectValue placeholder="Chave" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_GROUP_OPTION_VALUE}>
                          Sem chave vinculada
                        </SelectItem>
                        {createMatchGroupOptions.map((groupOption) => (
                          <SelectItem
                            key={groupOption.value}
                            value={groupOption.value}
                          >
                            {resolveChampionshipGroupLabel(
                              groupOption.group_number,
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="app-input-field-disabled flex items-center rounded-xl px-3 py-2 text-sm">
                      Sem chave vinculada
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Operação do dia
                </p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Select
                    value={location}
                    onValueChange={setLocation}
                    disabled={createLocationOptions.length == 0}
                  >
                    <SelectTrigger className="app-input-field">
                      <SelectValue
                        placeholder={
                          loadingLocationTemplates
                            ? "Carregando locais"
                            : "Local"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {createLocationOptions.map((locationOption) => (
                        <SelectItem key={locationOption} value={locationOption}>
                          {locationOption}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <DateTimePicker
                    value={scheduledDate}
                    onChange={setScheduledDate}
                    placeholder="Dia da fila"
                    showTime={false}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Atléticas
                </p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Select value={homeTeamId} onValueChange={setHomeTeamId}>
                    <SelectTrigger className="app-input-field">
                      <SelectValue placeholder="Atlética da casa" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleTeams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={awayTeamId} onValueChange={setAwayTeamId}>
                    <SelectTrigger className="app-input-field">
                      <SelectValue placeholder="Atlética visitante" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleTeams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {availableSportsForCreate.length == 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhuma modalidade vinculada ao campeonato para este naipe.
                </p>
              ) : null}

              {hasConfiguredBracket &&
              !loadingChampionshipBracket &&
              createMatchGroupOptions.length == 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhuma chave disponível para a combinação atual de
                  modalidade, naipe e divisão.
                </p>
              ) : null}

              {createLocationOptions.length == 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum local cadastrado para seleção. Cadastre um local antes
                  de criar o jogo.
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter className="shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateMatchModal(false)}
              disabled={creatingMatch}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={
                loadingLocationTemplates ||
                createLocationOptions.length == 0 ||
                creatingMatch
              }
            >
              {creatingMatch ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Criar jogo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
