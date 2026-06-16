import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Award, Check, Clock, EyeOff, Loader2, Medal, MoreVertical, Pencil, Plus, Radio, RefreshCw, Square, Trash2, Trophy, X } from "lucide-react";
import { HandPalm } from "@phosphor-icons/react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchChampionshipBracketLocationTemplates,
  fetchChampionshipBracketPendingTieBreaks,
  generateChampionshipKnockout,
  getBracketDaySchedules,
  saveMatchSets,
  saveChampionshipBracketTieBreakResolution,
  swapChampionshipKnockoutBracketTeams,
  updateBracketDaySchedule,
} from "@/domain/championship-brackets/championshipBracket.repository";
import type {
  ChampionshipCorrectedGroupStanding,
  ChampionshipBracketLocationTemplate,
  ChampionshipBracketScheduleDayInput,
  ChampionshipBracketTieBreakPendingContext,
  MatchSetInput,
} from "@/domain/championship-brackets/championshipBracket.types";
import {
  resolveChampionshipBracketFirstRoundSeedIndexes,
  resolveChampionshipBracketKnockoutProjection,
  resolveChampionshipBracketSeedPlaceholderLabels,
} from "@/domain/championship-brackets/championshipBracketKnockoutProjection";
import type {
  Championship,
  ChampionshipBracketCompetition,
  ChampionshipBracketView,
  ChampionshipSport,
  Match,
  Sport,
  Team,
} from "@/lib/types";
import {
  AppBadgeTone,
  BracketPhase,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  type MatchBracketContext,
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
  resolveGroupStageMatchBindingByMatchId,
  resolveMatchQueueLabel,
  resolveMatchNaipeBadgeTone,
  resolveMatchNaipeLabel,
  resolveRecordedMatchSets,
  resolveMatchScheduledDateValue,
  resolveMatchSetSummary,
  resolveMatchStartedAtLabel,
  resolveMatchStatusBadgeTone,
  resolveMatchStatusLabel,
  resolveMatchTieBreakRuleLabel,
  resolveKnockoutRoundLabel,
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
  resolveScheduledMatchCourtConflictMessage,
  resolveShouldRedistributeBracketScheduleAfterMatchEdit,
} from "@/components/admin/adminMatchesSchedule.utils";
import { AdminMatchesViewMode } from "@/components/admin/adminMatches.types";
import { useChampionshipCorrectedGroupStandings } from "@/hooks/useChampionshipCorrectedGroupStandings";
import { type AwardDrawPendingContext, usePendingAwardDraws } from "@/hooks/usePendingAwardDraws";
import { formatPointsAverageForStandings, formatStandingsPoints } from "@/lib/standings";

type BracketMatchRowLite = {
  id: string;
  slot_number: number | null;
};

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
  order: (column: string, options?: SupabaseLooseOrderOptions) => SupabaseLooseSelectBuilder<TData>;
  limit: (count: number) => Promise<SupabaseLooseQueryResult<TData>>;
};

type SupabaseLooseTableClient = {
  select: (columns: string) => SupabaseLooseSelectBuilder<unknown[]>;
  insert: (values: Record<string, unknown>) => Promise<SupabaseLooseQueryResult<unknown>>;
  update: (values: Record<string, unknown>) => {
    eq: (column: string, value: string) => Promise<SupabaseLooseQueryResult<unknown>>;
  };
};

type SupabaseLooseClient = {
  from: (table: string) => SupabaseLooseTableClient;
  rpc: (functionName: string, payload?: Record<string, unknown>) => Promise<SupabaseLooseQueryResult<unknown>>;
};

const supabaseLoose = supabase as unknown as SupabaseLooseClient;

interface ScoreSheetAwardPlayerOption {
  id: string;
  name: string;
  is_goalkeeper: boolean;
}

interface ScoreSheetAwardSelectionOption {
  player_id?: string;
  player_name?: string;
}

interface MatchScoreSheetAwardsContext {
  match_id: string;
  home_team_id: string;
  away_team_id: string;
  required_home_goals: number;
  required_away_goals: number;
  is_walkover: boolean;
  home_players: ScoreSheetAwardPlayerOption[];
  away_players: ScoreSheetAwardPlayerOption[];
  home_goals: Array<{
    player_id: string | null;
    player_name: string | null;
    conceding_goalkeeper_player_id: string | null;
    conceding_goalkeeper_name: string | null;
  }>;
  away_goals: Array<{
    player_id: string | null;
    player_name: string | null;
    conceding_goalkeeper_player_id: string | null;
    conceding_goalkeeper_name: string | null;
  }>;
  home_goalkeepers: Array<{ player_id: string | null; player_name: string | null }>;
  away_goalkeepers: Array<{ player_id: string | null; player_name: string | null }>;
}



interface GoalSelection {
  scorerId: string;
  concedingGoalkeeperName: string;
}

interface MatchScoreSheetAwardsDraft {
  homePlayerOptions: ScoreSheetAwardPlayerOption[];
  awayPlayerOptions: ScoreSheetAwardPlayerOption[];
  homeGoalSelections: GoalSelection[];
  awayGoalSelections: GoalSelection[];
  homeGoalkeeperSelections: string[];
  awayGoalkeeperSelections: string[];
  newHomePlayerName: string;
  newAwayPlayerName: string;
  newHomePlayerIsGoalkeeper: boolean;
  newAwayPlayerIsGoalkeeper: boolean;
  requiredHomeGoals: number;
  requiredAwayGoals: number;
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

function resolveWinnerSourceLabel(roundNumber: number, slotNumber: number, totalRounds: number): string {
  const shortRoundLabel = resolveKnockoutRoundLabel(roundNumber, totalRounds).replace(" de final", "");
  const article = shortRoundLabel == "Semifinal" || shortRoundLabel == "Final" ? "da" : "das";

  return `Vencedor ${article} ${shortRoundLabel} ${slotNumber}`;
}

function resolveKnockoutMatchSourceLabels(knockoutMatchBinding: KnockoutMatchBinding | null): KnockoutMatchSourceLabels | null {
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
      knockoutMatchBinding.competition.should_complete_knockout_with_best_second_placed_teams,
  });

  if (knockoutProjection.projected_bracket_size < 2 || knockoutMatchBinding.slot_number < 1 || knockoutMatchBinding.round_number < 1) {
    return null;
  }

  const totalRounds = resolveKnockoutTotalRounds(knockoutProjection.projected_bracket_size);

  if (knockoutMatchBinding.round_number == 1) {
    const seedLabels = resolveChampionshipBracketSeedPlaceholderLabels({
      groups_count: knockoutMatchBinding.competition.groups_count,
      qualifiers_per_group: knockoutMatchBinding.competition.qualifiers_per_group,
      should_complete_knockout_with_best_second_placed_teams:
        knockoutMatchBinding.competition.should_complete_knockout_with_best_second_placed_teams,
    });
    const firstRoundSeedIndexes = resolveChampionshipBracketFirstRoundSeedIndexes(
      knockoutProjection.projected_bracket_size,
      knockoutMatchBinding.slot_number,
    );

    return {
      home: seedLabels[firstRoundSeedIndexes.home_seed_index] ?? "A definir",
      away: seedLabels[firstRoundSeedIndexes.away_seed_index] ?? "A definir",
    };
  }

  return {
    home: resolveWinnerSourceLabel(knockoutMatchBinding.round_number - 1, (knockoutMatchBinding.slot_number * 2) - 1, totalRounds),
    away: resolveWinnerSourceLabel(knockoutMatchBinding.round_number - 1, knockoutMatchBinding.slot_number * 2, totalRounds),
  };
}

function resolveMatchDisplaySlotValue(
  match: Match & { scheduled_slot?: number | null },
  shouldUseScheduledSlot: boolean,
) {
  if (shouldUseScheduledSlot) {
    return match.scheduled_slot ?? match.queue_position ?? Number.MAX_SAFE_INTEGER;
  }

  return match.queue_position ?? match.scheduled_slot ?? Number.MAX_SAFE_INTEGER;
}

function resolveMatchLocationAndCourtSortDifference(
  firstMatch: Pick<Match, "location" | "court_name">,
  secondMatch: Pick<Match, "location" | "court_name">,
) {
  const locationDifference = firstMatch.location.localeCompare(secondMatch.location, "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });

  if (locationDifference != 0) {
    return locationDifference;
  }

  return (firstMatch.court_name ?? "").localeCompare(secondMatch.court_name ?? "", "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

function resolveEstimatedStartTimeSortValue(estimatedStartTimeValue: string | undefined) {
  if (!estimatedStartTimeValue) {
    return Number.MAX_SAFE_INTEGER;
  }

  const estimatedTimeMatch = /^(\d{2}):(\d{2})$/.exec(estimatedStartTimeValue.trim());

  if (!estimatedTimeMatch) {
    return Number.MAX_SAFE_INTEGER;
  }

  const parsedHours = Number(estimatedTimeMatch[1]);
  const parsedMinutes = Number(estimatedTimeMatch[2]);

  if (!Number.isFinite(parsedHours) || !Number.isFinite(parsedMinutes)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return (parsedHours * 60) + parsedMinutes;
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
  isFetchingMatches?: boolean;
  canManageMatches?: boolean;
  availableSeasonYears?: number[];
  selectedSeasonYear?: number | null;
  onSeasonYearChange?: (seasonYear: number) => void;
  viewMode?: AdminMatchesViewMode;
  onOpenTieBreaksTab?: () => void;
  onRefetch: (options?: { showLoading?: boolean; showFetching?: boolean }) => void | Promise<void>;
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
  homeYellowCards: number;
  homeRedCards: number;
  awayYellowCards: number;
  awayRedCards: number;
  location: string;
  scheduledDate: Date | null;
  startTime: Date | null;
  gameSlot: string;
  division: TeamDivision;
  naipe: MatchNaipe;
  status: MatchStatus;
  selectedGroupOptionValue: string;
  resolvedTieBreakerRule: ChampionshipSportTieBreakerRule | "";
}

type ScoreSheetReviewSaveDecision = "KEEP_REVIEW" | "REMOVE_REVIEW";
type BulkReviewAction = "MARK" | "UNMARK";

const NAIPE_OPTIONS: MatchNaipe[] = [MatchNaipe.MASCULINO, MatchNaipe.FEMININO, MatchNaipe.MISTO];
const ALL_MATCHES_SPORT_FILTER = "ALL_MATCHES_SPORTS";
const ALL_MATCHES_STATUS_FILTER = "ALL_MATCHES_STATUS";
const ALL_MATCHES_TEAM_FILTER = "ALL_MATCHES_TEAMS";
const ALL_MATCHES_NAIPE_FILTER = "ALL_MATCHES_NAIPES";
const ALL_MATCHES_DIVISION_FILTER = "ALL_MATCHES_DIVISIONS";
const ALL_MATCHES_GROUP_FILTER = "ALL_MATCHES_GROUPS";
const ALL_MATCHES_LOCATION_FILTER = "ALL_MATCHES_LOCATIONS";
const ALL_MATCHES_COURT_FILTER = "ALL_MATCHES_COURTS";
const MATCHES_STATUS_FILTER_LIVE = "MATCHES_STATUS_FILTER_LIVE";
const MATCHES_STATUS_FILTER_FINISHED = "MATCHES_STATUS_FILTER_FINISHED";
const MATCHES_STATUS_FILTER_OPEN = "MATCHES_STATUS_FILTER_OPEN";
const EMPTY_GROUP_OPTION_VALUE = "EMPTY_GROUP_OPTION_VALUE";
const EMPTY_TIE_BREAKER_RULE_OPTION_VALUE = "EMPTY_TIE_BREAKER_RULE_OPTION_VALUE";
const EMPTY_TIE_BREAK_TEAM_OPTION_VALUE = "EMPTY_TIE_BREAK_TEAM_OPTION_VALUE";
const EMPTY_SWAP_MATCH_OPTION_VALUE = "EMPTY_SWAP_MATCH_OPTION_VALUE";
const EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE = "EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE";
const EMPTY_AWARD_DRAW_PLAYER_OPTION_VALUE = "EMPTY_AWARD_DRAW_PLAYER_OPTION_VALUE";

const MATCH_STATUS_SORT_ORDER: Record<MatchStatus, number> = {
  [MatchStatus.LIVE]: 0,
  [MatchStatus.SCHEDULED]: 1,
  [MatchStatus.FINISHED]: 2,
};

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
};

function resolveDateOnlyString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function resolveSafeScoreValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function resolveParsedScoreInputValue(value: string): number {
  const trimmedValue = value.trim();

  if (trimmedValue.length == 0) {
    return 0;
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

function resolveNormalizedMatchSetsDraft(matchSetsDraft: MatchSetInput[]): MatchSetInput[] {
  return matchSetsDraft.map((matchSet, matchSetIndex) => ({
    set_number: matchSetIndex + 1,
    home_points: resolveSafeScoreValue(matchSet.home_points),
    away_points: resolveSafeScoreValue(matchSet.away_points),
  }));
}

function resolveScheduledDateDraftValue(match: Match): Date | null {
  const scheduledDateValue = resolveMatchScheduledDateValue(match);

  if (!scheduledDateValue) {
    return null;
  }

  return new Date(`${scheduledDateValue}T12:00:00`);
}

function resolveScheduledQueueSummary(
  match: Match & { scheduled_slot?: number | null },
  visualQueuePosition: number | undefined,
): string {
  const scheduledDateValue = resolveMatchScheduledDateValue(match);
  const queueLabel = resolveMatchQueueLabel(
    visualQueuePosition ?? match.queue_position ?? match.scheduled_slot ?? null,
  );

  if (!scheduledDateValue) {
    return queueLabel;
  }

  return `${format(new Date(`${scheduledDateValue}T12:00:00`), "dd/MM", { locale: ptBR })} • ${queueLabel}`;
}

function resolveAdminMatchesOperationalErrorMessage(error: { code?: string; message: string }): string {
  if (
    error.code == "PGRST204" &&
    (error.message.includes("current_set_home_score") || error.message.includes("current_set_away_score"))
  ) {
    return "A migration 20260316013000_add_match_live_set_progress_and_tie_break_metadata.sql ainda não foi aplicada no banco. Rode npx supabase db push e recarregue o schema.";
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
  const scheduleDays = (championshipBracketView.edition?.payload_snapshot as { schedule_days?: unknown } | null)?.schedule_days;

  if (!Array.isArray(scheduleDays)) {
    return [];
  }

  return scheduleDays.filter((scheduleDay): scheduleDay is ChampionshipBracketScheduleDayInput => {
    return typeof scheduleDay == "object" && scheduleDay != null && typeof scheduleDay.date == "string" && Array.isArray(scheduleDay.locations);
  });
}

function resolveSportsByNaipe(championshipSports: ChampionshipSport[], naipe: MatchNaipe): Sport[] {
  const sportsById = new Map<string, Sport>();

  championshipSports
    .filter((championshipSport) => doesChampionshipSportSupportNaipe(championshipSport.naipe_mode, naipe))
    .forEach((championshipSport) => {
      const sport = championshipSport.sports;

      if (sport && !sportsById.has(sport.id)) {
        sportsById.set(sport.id, sport);
      }
    });

  return [...sportsById.values()].sort((firstSport, secondSport) => firstSport.name.localeCompare(secondSport.name));
}

function shuffleTeamIds(teamIds: string[]): string[] {
  const shuffledTeamIds = [...teamIds];

  for (let currentIndex = shuffledTeamIds.length - 1; currentIndex > 0; currentIndex -= 1) {
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

function resolveScoreSheetDraftFromContext(context: MatchScoreSheetAwardsContext): MatchScoreSheetAwardsDraft {
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
      if (!options.some((option) => option.id == selection.player_id) && selection.player_name) {
        options.push({ id: selection.player_id, name: selection.player_name, is_goalkeeper: false });
      }
      return selection.player_id;
    }

    if (selection.player_name) {
      return `${NEW_PLAYER_OPTION_PREFIX}${selection.player_name}`;
    }

    return "";
  };

  const homeGoalSelections: GoalSelection[] = context.home_goals.map((goal) => ({
    scorerId: resolvePlayerSelection(goal, homePlayerOptions),
    concedingGoalkeeperName: goal.conceding_goalkeeper_name ?? "",
  }));

  const awayGoalSelections: GoalSelection[] = context.away_goals.map((goal) => ({
    scorerId: resolvePlayerSelection(goal, awayPlayerOptions),
    concedingGoalkeeperName: goal.conceding_goalkeeper_name ?? "",
  }));

  while (homeGoalSelections.length < context.required_home_goals) {
    homeGoalSelections.push({ scorerId: "", concedingGoalkeeperName: "" });
  }

  while (awayGoalSelections.length < context.required_away_goals) {
    awayGoalSelections.push({ scorerId: "", concedingGoalkeeperName: "" });
  }

  const resolveGoalkeeperSelections = (
    goalkeepers: Array<{ player_id: string | null; player_name: string | null }>,
    options: ScoreSheetAwardPlayerOption[],
  ): string[] => {
    const selections = goalkeepers.map((gk) => resolvePlayerSelection(gk, options));
    return selections.length > 0 ? selections : [""];
  };

  return {
    homePlayerOptions: homePlayerOptions.sort((a, b) => Number(b.is_goalkeeper) - Number(a.is_goalkeeper) || a.name.localeCompare(b.name)),
    awayPlayerOptions: awayPlayerOptions.sort((a, b) => Number(b.is_goalkeeper) - Number(a.is_goalkeeper) || a.name.localeCompare(b.name)),
    homeGoalSelections: homeGoalSelections.slice(0, context.required_home_goals),
    awayGoalSelections: awayGoalSelections.slice(0, context.required_away_goals),
    homeGoalkeeperSelections: resolveGoalkeeperSelections(context.home_goalkeepers, homePlayerOptions),
    awayGoalkeeperSelections: resolveGoalkeeperSelections(context.away_goalkeepers, awayPlayerOptions),
    newHomePlayerName: "",
    newAwayPlayerName: "",
    newHomePlayerIsGoalkeeper: false,
    newAwayPlayerIsGoalkeeper: false,
    requiredHomeGoals: context.required_home_goals,
    requiredAwayGoals: context.required_away_goals,
    isWalkover: context.is_walkover,
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
  isFetchingMatches = false,
  canManageMatches: canManageMatchesProp = true,
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
  const isScoreSheetReviewMode = viewMode == AdminMatchesViewMode.SCORE_SHEET_REVIEW;
  const isTieBreaksMode = viewMode == AdminMatchesViewMode.TIE_BREAKS;
  const isHistoricalSeasonView =
    !isScoreSheetReviewMode &&
    !isTieBreaksMode &&
    selectedSeasonYear != null &&
    selectedChampionship.current_season_year != null &&
    selectedSeasonYear != selectedChampionship.current_season_year;
  const canManageMatches = canManageMatchesProp && !isHistoricalSeasonView;
  const defaultMatchesStatusFilter = isScoreSheetReviewMode ? MATCHES_STATUS_FILTER_FINISHED : ALL_MATCHES_STATUS_FILTER;
  const [naipe, setNaipe] = useState<MatchNaipe>(MatchNaipe.MASCULINO);
  const [sportId, setSportId] = useState("");
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [location, setLocation] = useState("");
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [division, setDivision] = useState<TeamDivision>(TeamDivision.DIVISAO_PRINCIPAL);
  const [selectedGroupOptionValue, setSelectedGroupOptionValue] = useState("");
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editingMatchDraft, setEditingMatchDraft] = useState<MatchEditDraft | null>(null);
  const [matchesSportFilter, setMatchesSportFilter] = useState<string>(ALL_MATCHES_SPORT_FILTER);
  const [matchesStatusFilter, setMatchesStatusFilter] = useState<string>(defaultMatchesStatusFilter);
  const [matchesTeamFilter, setMatchesTeamFilter] = useState<string>(ALL_MATCHES_TEAM_FILTER);
  const [matchesNaipeFilter, setMatchesNaipeFilter] = useState<string>(ALL_MATCHES_NAIPE_FILTER);
  const [matchesDivisionFilter, setMatchesDivisionFilter] = useState<string>(ALL_MATCHES_DIVISION_FILTER);
  const [matchesGroupFilter, setMatchesGroupFilter] = useState<string>(ALL_MATCHES_GROUP_FILTER);
  const [matchesLocationFilter, setMatchesLocationFilter] = useState<string>(ALL_MATCHES_LOCATION_FILTER);
  const [matchesCourtFilter, setMatchesCourtFilter] = useState<string>(ALL_MATCHES_COURT_FILTER);
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [matchesCurrentPage, setMatchesCurrentPage] = useState(1);
  const [matchesItemsPerPage, setMatchesItemsPerPage] = useState(DEFAULT_PAGINATION_ITEMS_PER_PAGE);
  const [deletingMatches, setDeletingMatches] = useState(false);
  const [applyingBulkAction, setApplyingBulkAction] = useState(false);
  const [savingEditingMatch, setSavingEditingMatch] = useState(false);
  const [showCreateMatchModal, setShowCreateMatchModal] = useState(false);
  const [showDeleteMatchDialog, setShowDeleteMatchDialog] = useState(false);
  const [pendingDeleteMatchId, setPendingDeleteMatchId] = useState<string | null>(null);
  const [pendingDeleteMatchLabel, setPendingDeleteMatchLabel] = useState("");
  const [showSwapMatchDialog, setShowSwapMatchDialog] = useState(false);
  const [pendingSwapSourceMatchId, setPendingSwapSourceMatchId] = useState<string | null>(null);
  const [pendingSwapTargetMatchId, setPendingSwapTargetMatchId] = useState("");
  const [eligibleSwapTargetMatchIds, setEligibleSwapTargetMatchIds] = useState<string[]>([]);
  const [loadingSwapTargetMatchOptions, setLoadingSwapTargetMatchOptions] = useState(false);
  const [swappingMatches, setSwappingMatches] = useState(false);
  const [showDeleteSelectedMatchesDialog, setShowDeleteSelectedMatchesDialog] = useState(false);
  const [creatingMatch, setCreatingMatch] = useState(false);
  const [locationTemplates, setLocationTemplates] = useState<ChampionshipBracketLocationTemplate[]>([]);
  const [loadingLocationTemplates, setLoadingLocationTemplates] = useState(false);
  const [pendingTieBreakContexts, setPendingTieBreakContexts] = useState<ChampionshipBracketTieBreakPendingContext[]>([]);
  const [loadingPendingTieBreakContexts, setLoadingPendingTieBreakContexts] = useState(false);
  const [showTieBreakDialog, setShowTieBreakDialog] = useState(false);
  const [savingTieBreakResolutions, setSavingTieBreakResolutions] = useState(false);
  const [savingTieBreakResolutionByContextKey, setSavingTieBreakResolutionByContextKey] = useState<Record<string, boolean>>({});
  const [draftTieBreakTeamIdsByContextKey, setDraftTieBreakTeamIdsByContextKey] = useState<Record<string, string[]>>({});
  const [editingMatchSetsDraft, setEditingMatchSetsDraft] = useState<MatchSetInput[]>([]);
  const [hideReviewedMatches, setHideReviewedMatches] = useState(isScoreSheetReviewMode);
  const [savingReviewStateByMatchId, setSavingReviewStateByMatchId] = useState<Record<string, boolean>>({});
  const [bulkReviewAction, setBulkReviewAction] = useState<BulkReviewAction | null>(null);
  const [showEditReviewConfirmationDialog, setShowEditReviewConfirmationDialog] = useState(false);
  const [activeScoreSheetReviewMatchId, setActiveScoreSheetReviewMatchId] = useState<string | null>(null);
  const [scoreSheetAwardsDraftByMatchId, setScoreSheetAwardsDraftByMatchId] = useState<
    Record<string, MatchScoreSheetAwardsDraft | undefined>
  >({});
  const [loadingScoreSheetAwardsByMatchId, setLoadingScoreSheetAwardsByMatchId] = useState<Record<string, boolean>>({});
  const [savingScoreSheetAwardsByMatchId, setSavingScoreSheetAwardsByMatchId] = useState<Record<string, boolean>>({});
  const [addPlayerButtonStateByKey, setAddPlayerButtonStateByKey] = useState<Record<string, "loading" | "success">>({});
  const newPlayerInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [editingPlayerByKey, setEditingPlayerByKey] = useState<Record<string, { playerId: string; name: string; isGoalkeeper: boolean } | null>>({});
  const [draftAwardDrawOrderByContextKey, setDraftAwardDrawOrderByContextKey] = useState<Record<string, string[]>>({});
  const [savingAwardDrawByContextKey, setSavingAwardDrawByContextKey] = useState<Record<string, boolean>>({});
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
  const hasExternalAwardDrawData = externalPendingAwardDrawContexts !== undefined;
  const {
    pendingContexts: hookAwardDrawContexts,
    loading: hookLoadingPendingAwardDraws,
    refetch: hookRefetchPendingAwardDraws,
  } = usePendingAwardDraws({
    // Desabilita o hook interno quando dados externos são fornecidos (evita duplo fetch e conflito de canal)
    championshipId: hasExternalAwardDrawData ? null : (isTieBreaksMode ? selectedChampionship.id : null),
    seasonYear: hasExternalAwardDrawData ? null : (isTieBreaksMode ? (selectedChampionship.current_season_year ?? null) : null),
  });
  const pendingAwardDrawContexts = externalPendingAwardDrawContexts ?? hookAwardDrawContexts;
  const loadingPendingAwardDraws = externalLoadingPendingAwardDraws ?? hookLoadingPendingAwardDraws;
  const refetchPendingAwardDraws = externalRefetchPendingAwardDraws ?? hookRefetchPendingAwardDraws;

  const championshipUsesDivisions = selectedChampionship.uses_divisions;
  const hasConfiguredBracket =
    championshipBracketView.edition != null && championshipBracketView.competitions.length > 0;
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
    const championshipSportResultRuleMap = new Map<string, ChampionshipSportResultRule>();

    championshipSports.forEach((championshipSport) => {
      championshipSportResultRuleMap.set(championshipSport.sport_id, championshipSport.result_rule);
    });

    return championshipSportResultRuleMap;
  }, [championshipSports]);

  const supportsIndividualAwardsBySportId = useMemo(() => {
    const map = new Map<string, boolean>();

    championshipSports.forEach((championshipSport) => {
      map.set(championshipSport.sport_id, championshipSport.supports_individual_awards);
    });

    return map;
  }, [championshipSports]);

  const championshipSportSupportsCardsBySportId = useMemo(() => {
    const championshipSportSupportsCardsMap = new Map<string, boolean>();

    championshipSports.forEach((championshipSport) => {
      championshipSportSupportsCardsMap.set(championshipSport.sport_id, championshipSport.supports_cards);
    });

    return championshipSportSupportsCardsMap;
  }, [championshipSports]);

  const isEditingSetRuleMatch = useMemo(() => {
    if (!editingMatchDraft) {
      return false;
    }

    return championshipSportResultRuleBySportId.get(editingMatchDraft.sportId) == ChampionshipSportResultRule.SETS;
  }, [championshipSportResultRuleBySportId, editingMatchDraft]);

  const isEditingSportWithCards = useMemo(() => {
    if (!editingMatchDraft) {
      return false;
    }

    return championshipSportSupportsCardsBySportId.get(editingMatchDraft.sportId) == true;
  }, [championshipSportSupportsCardsBySportId, editingMatchDraft]);

  const championshipSportShowsTimeBySportId = useMemo(() => {
    const map = new Map<string, boolean>();
    championshipSports.forEach((s) => {
      map.set(s.sport_id, s.show_estimated_start_time_on_cards);
    });
    return map;
  }, [championshipSports]);

  const isEditingSportWithTime = useMemo(() => {
    if (!editingMatchDraft) {
      return false;
    }
    return championshipSportShowsTimeBySportId.get(editingMatchDraft.sportId) == true;
  }, [championshipSportShowsTimeBySportId, editingMatchDraft]);

  const championshipBracketScheduleDays = useMemo(() => {
    return resolveChampionshipBracketScheduleDays(championshipBracketView);
  }, [championshipBracketView]);

  const shouldUseScheduledSlotInMatchList = matchesSportFilter === ALL_MATCHES_SPORT_FILTER;

  const availableQueuePositionsForEditingMatch = useMemo(() => {
    const usedPositions = new Set<number>();

    // Inclui a posição atual do jogo em edição para garantir que ela sempre apareça na lista
    if (editingMatchDraft?.gameSlot) {
      const currentSlot = Number.parseInt(editingMatchDraft.gameSlot, 10);
      if (Number.isFinite(currentSlot) && currentSlot > 0) {
        usedPositions.add(currentSlot);
      }
    }

    if (editingMatchDraft?.scheduledDate) {
      const scheduledDateString = resolveDateOnlyString(editingMatchDraft.scheduledDate);
      const matchesOnSameDate = matches.filter((m) => {
        if (resolveMatchScheduledDateValue(m) !== scheduledDateString) return false;
        // Quando filtrado por esporte, restringe ao mesmo esporte para não inflar posições com slots de outras modalidades
        if (!shouldUseScheduledSlotInMatchList && editingMatchDraft.sportId) {
          return m.sport_id === editingMatchDraft.sportId;
        }
        return true;
      });

      for (const m of matchesOnSameDate) {
        const slot = shouldUseScheduledSlotInMatchList
          ? (m.scheduled_slot ?? m.queue_position)
          : (m.queue_position ?? m.scheduled_slot);
        if (slot != null) usedPositions.add(slot);
      }
    }

    if (usedPositions.size === 0) {
      return [];
    }

    const maxPosition = Math.max(...usedPositions);
    const positions = [];
    for (let i = 1; i <= maxPosition; i++) {
      positions.push(i);
    }

    return positions;
  }, [editingMatchDraft?.scheduledDate, editingMatchDraft?.gameSlot, editingMatchDraft?.sportId, shouldUseScheduledSlotInMatchList, matches]);

  const championshipDayDates = useMemo(() => {
    const payloadScheduleDayDates = championshipBracketScheduleDays
      .map((scheduleDay) => scheduleDay.date)
      .filter((scheduleDayDate, scheduleDayIndex, scheduleDayDates) => {
        return scheduleDayDate.trim() && scheduleDayDates.indexOf(scheduleDayDate) == scheduleDayIndex;
      })
      .sort((leftDate, rightDate) => leftDate.localeCompare(rightDate));

    if (payloadScheduleDayDates.length > 0) {
      return payloadScheduleDayDates;
    }

    const matchScheduleDates = matches
      .map((match) => resolveMatchScheduledDateValue(match))
      .filter((scheduledDateValue): scheduledDateValue is string => scheduledDateValue != null)
      .filter((scheduledDateValue, scheduledDateIndex, scheduledDateValues) => {
        return scheduledDateValues.indexOf(scheduledDateValue) == scheduledDateIndex;
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
      return leftLocationName.localeCompare(rightLocationName, "pt-BR", { sensitivity: "base" });
    });
  }, [championshipBracketScheduleDays, locationTemplates, selectedChampionship.default_location]);

  const createLocationOptions = useMemo(() => {
    if (!location.trim() || availableLocationOptions.includes(location.trim())) {
      return availableLocationOptions;
    }

    return [...availableLocationOptions, location.trim()].sort((leftLocationName, rightLocationName) => {
      return leftLocationName.localeCompare(rightLocationName, "pt-BR", { sensitivity: "base" });
    });
  }, [availableLocationOptions, location]);

  const editingLocationOptions = useMemo(() => {
    const editingLocation = editingMatchDraft?.location.trim();

    if (!editingLocation || availableLocationOptions.includes(editingLocation)) {
      return availableLocationOptions;
    }

    return [...availableLocationOptions, editingLocation].sort((leftLocationName, rightLocationName) => {
      return leftLocationName.localeCompare(rightLocationName, "pt-BR", { sensitivity: "base" });
    });
  }, [availableLocationOptions, editingMatchDraft?.location]);

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
      return response.data.reduce<Record<string, string[]>>((carry, pendingTieBreakContext) => {
        carry[pendingTieBreakContext.context_key] = [];
        return carry;
      }, {});
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
    setHideReviewedMatches(false);
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
  }, [defaultMatchesStatusFilter, selectedChampionship.id]);

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
    if (!isScoreSheetReviewMode || !canManageMatches || !championshipBracketView.edition?.id) {
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
        console.info("Reconciliação automática do mata-mata não aplicou alterações:", knockoutResponse.error.message);
        return;
      }

      await Promise.all([onRefetchChampionshipBracket(), loadPendingTieBreakContexts()]);
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
    setSportId("");
    setHomeTeamId("");
    setAwayTeamId("");
    setSelectedGroupOptionValue("");
  }, [naipe]);

  const sportsForMatchesFilter = useMemo(() => {
    const sportsById = new Map<string, Sport>();

    matches.forEach((match) => {
      if (match.sports && !sportsById.has(match.sports.id)) {
        sportsById.set(match.sports.id, match.sports);
      }
    });

    return [...sportsById.values()].sort((firstSport, secondSport) => firstSport.name.localeCompare(secondSport.name));
  }, [matches]);

  const teamsForMatchesFilter = useMemo(() => {
    const teamIds = new Set<string>();

    matches.forEach((match) => {
      teamIds.add(match.home_team_id);
      teamIds.add(match.away_team_id);
    });

    return teams
      .filter((team) => teamIds.has(team.id))
      .sort((firstTeam, secondTeam) => firstTeam.name.localeCompare(secondTeam.name));
  }, [matches, teams]);

  const groupsForMatchesFilter = useMemo(() => {
    const allOptions = resolveChampionshipBracketGroupStageOptions(championshipBracketView);

    const filteredOptions = allOptions.filter((option) => {
      const sportMatch =
        matchesSportFilter == ALL_MATCHES_SPORT_FILTER || option.sport_id == matchesSportFilter;
      const naipeMatch =
        matchesNaipeFilter == ALL_MATCHES_NAIPE_FILTER || option.naipe == matchesNaipeFilter;
      const divisionMatch =
        matchesDivisionFilter == ALL_MATCHES_DIVISION_FILTER || option.division == matchesDivisionFilter;

      return sportMatch && naipeMatch && divisionMatch;
    });

    const uniqueGroups = new Map<string, string>();
    filteredOptions.forEach((option) => {
      const groupLabel = resolveChampionshipGroupLabel(option.group_number);
      uniqueGroups.set(groupLabel, groupLabel);
    });

    return [...uniqueGroups.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((firstGroupOption, secondGroupOption) => firstGroupOption.label.localeCompare(secondGroupOption.label));
  }, [championshipBracketView, matchesDivisionFilter, matchesNaipeFilter, matchesSportFilter]);

  const matchesFilteredByBaseCriteria = useMemo(() => {
    return matches.filter((match) => {
      if (matchesSportFilter !== ALL_MATCHES_SPORT_FILTER && match.sport_id != matchesSportFilter) {
        return false;
      }

      if (isScoreSheetReviewMode && match.status != MatchStatus.FINISHED) {
        return false;
      }

      if (matchesStatusFilter == MATCHES_STATUS_FILTER_LIVE && match.status != MatchStatus.LIVE) {
        return false;
      }

      if (matchesStatusFilter == MATCHES_STATUS_FILTER_FINISHED && match.status != MatchStatus.FINISHED) {
        return false;
      }

      if (matchesStatusFilter == MATCHES_STATUS_FILTER_OPEN && match.status != MatchStatus.SCHEDULED) {
        return false;
      }

      if (matchesTeamFilter !== ALL_MATCHES_TEAM_FILTER) {
        const isHomeTeamMatch = match.home_team_id == matchesTeamFilter;
        const isAwayTeamMatch = match.away_team_id == matchesTeamFilter;

        if (!isHomeTeamMatch && !isAwayTeamMatch) {
          return false;
        }
      }

      if (matchesNaipeFilter !== ALL_MATCHES_NAIPE_FILTER && match.naipe != matchesNaipeFilter) {
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

        if (!matchBracketContext || matchBracketContext.groupFilterValue != matchesGroupFilter) {
          return false;
        }
      }

      if (isScoreSheetReviewMode && hideReviewedMatches && match.is_score_sheet_reviewed) {
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
    matchesDivisionFilter,
    matchesGroupFilter,
    matchesNaipeFilter,
    matchesSportFilter,
    matchesStatusFilter,
    matchesTeamFilter,
  ]);

  const locationsForMatchesFilter = useMemo(() => {
    return [...new Set(matchesFilteredByBaseCriteria.map((match) => match.location).filter(Boolean))].sort(
      (firstLocation, secondLocation) => firstLocation.localeCompare(secondLocation)
    );
  }, [matchesFilteredByBaseCriteria]);

  const courtsForMatchesFilter = useMemo(() => {
    const uniqueCourtNames = new Set<string>();

    matchesFilteredByBaseCriteria.forEach((match) => {
      if (!match.court_name) {
        return;
      }

      if (matchesLocationFilter != ALL_MATCHES_LOCATION_FILTER && match.location != matchesLocationFilter) {
        return;
      }

      uniqueCourtNames.add(match.court_name);
    });

    return [...uniqueCourtNames].sort((firstCourtName, secondCourtName) => firstCourtName.localeCompare(secondCourtName));
  }, [matchesFilteredByBaseCriteria, matchesLocationFilter]);

  const championshipBracketGroupStageOptions = useMemo(() => {
    return resolveChampionshipBracketGroupStageOptions(championshipBracketView);
  }, [championshipBracketView]);

  const createMatchGroupOptions = useMemo(() => {
    const resolvedDivision = championshipUsesDivisions ? division : null;

    return championshipBracketGroupStageOptions.filter((groupOption) => {
      return groupOption.sport_id == sportId && groupOption.naipe == naipe && groupOption.division == resolvedDivision;
    });
  }, [championshipBracketGroupStageOptions, championshipUsesDivisions, division, naipe, sportId]);

  const selectedCreateGroupOption = useMemo(() => {
    if (!selectedGroupOptionValue) {
      return null;
    }

    return createMatchGroupOptions.find((groupOption) => groupOption.value == selectedGroupOptionValue) ?? null;
  }, [createMatchGroupOptions, selectedGroupOptionValue]);

  const eligibleTeams = useMemo(() => {
    if (selectedCreateGroupOption) {
      const selectedCreateGroupTeamIdSet = new Set(selectedCreateGroupOption.team_ids);

      return teamsAllowedForMatches.filter((team) => selectedCreateGroupTeamIdSet.has(team.id));
    }

    if (!championshipUsesDivisions) {
      return teamsAllowedForMatches;
    }

    return teamsAllowedForMatches.filter((team) => team.division === division);
  }, [championshipUsesDivisions, division, selectedCreateGroupOption, teamsAllowedForMatches]);

  const groupStageMatchBracketBindingByMatchId = useMemo(() => {
    return resolveGroupStageMatchBindingByMatchId(championshipBracketView);
  }, [championshipBracketView]);

  const knockoutMatchBindingByMatchId = useMemo(() => {
    return championshipBracketView.competitions.reduce<Record<string, KnockoutMatchBinding>>((carry, competition) => {
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

    const resolvedDivision = championshipUsesDivisions ? editingMatchDraft.division : null;

    return championshipBracketGroupStageOptions.filter((groupOption) => {
      return (
        groupOption.sport_id == editingMatchDraft.sportId &&
        groupOption.naipe == editingMatchDraft.naipe &&
        groupOption.division == resolvedDivision
      );
    });
  }, [championshipBracketGroupStageOptions, championshipUsesDivisions, editingMatchDraft]);

  const selectedEditingGroupOption = useMemo(() => {
    if (!editingMatchDraft?.selectedGroupOptionValue) {
      return null;
    }

    return (
      editingMatchGroupOptions.find((groupOption) => groupOption.value == editingMatchDraft.selectedGroupOptionValue) ?? null
    );
  }, [editingMatchDraft, editingMatchGroupOptions]);

  const eligibleTeamsForEditingMatch = useMemo(() => {
    if (!editingMatchDraft) {
      return teamsAllowedForMatches;
    }

    if (selectedEditingGroupOption) {
      const selectedGroupTeamIdSet = new Set(selectedEditingGroupOption.team_ids);

      return teamsAllowedForMatches.filter((team) => selectedGroupTeamIdSet.has(team.id));
    }

    if (!championshipUsesDivisions) {
      return teamsAllowedForMatches;
    }

    return teamsAllowedForMatches.filter((team) => team.division === editingMatchDraft.division);
  }, [championshipUsesDivisions, editingMatchDraft, selectedEditingGroupOption, teamsAllowedForMatches]);

  // match_id → competition_id para matches do primeiro round do KO (MAX round_number)
  const knockoutFirstRoundBracketMatchByMatchId = useMemo(() => {
    const map: Record<string, { competition_id: string }> = {};
    for (const competition of championshipBracketView.competitions ?? []) {
      const maxRound = Math.max(0, ...(competition.knockout_matches ?? []).map((km) => km.round_number));
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
      const maxRound = Math.max(0, ...(competition.knockout_matches ?? []).map((km) => km.round_number));
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
    return pendingTieBreakContexts.reduce<Record<string, Record<string, string>>>((carry, pendingTieBreakContext) => {
      carry[pendingTieBreakContext.context_key] = pendingTieBreakContext.teams.reduce<Record<string, string>>((teamCarry, team) => {
        teamCarry[team.team_id] = team.team_name;
        return teamCarry;
      }, {});
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
    return !isScoreSheetReviewMode && !isTieBreaksMode && pendingTieBreakContexts.length > 0;
  }, [
    isScoreSheetReviewMode,
    isTieBreaksMode,
    pendingTieBreakContexts.length,
  ]);
  const isAnyTieBreakResolutionSaveInFlight =
    savingTieBreakResolutions || Object.values(savingTieBreakResolutionByContextKey).some((isSaving) => isSaving);

  const isSavingReviewState = Object.keys(savingReviewStateByMatchId).length > 0;
  const correctedStandingByCompetitionAndTeamKey = useMemo(() => {
    return correctedGroupStandings.reduce<Record<string, ChampionshipCorrectedGroupStanding>>((carry, correctedGroupStanding) => {
      carry[`${correctedGroupStanding.competition_id}:${correctedGroupStanding.team_id}`] = correctedGroupStanding;
      return carry;
    }, {});
  }, [correctedGroupStandings]);

  const pendingSwapSourceMatch = useMemo(() => {
    if (!pendingSwapSourceMatchId) {
      return null;
    }

    return matches.find((match) => match.id == pendingSwapSourceMatchId) ?? null;
  }, [matches, pendingSwapSourceMatchId]);

  const activeScoreSheetReviewMatch = useMemo(() => {
    if (!activeScoreSheetReviewMatchId) {
      return null;
    }

    return matches.find((match) => match.id == activeScoreSheetReviewMatchId) ?? null;
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

  const eligibleSwapTargetMatchOptions = useMemo(() => {
    if (!pendingSwapSourceMatch) {
      return [];
    }

    const eligibleSwapTargetMatchIdSet = new Set(eligibleSwapTargetMatchIds);

    return matches
      .filter((match) => eligibleSwapTargetMatchIdSet.has(match.id))
      .sort((firstMatch, secondMatch) => {
        const firstScheduledDate = resolveMatchScheduledDateValue(firstMatch) ?? "9999-12-31";
        const secondScheduledDate = resolveMatchScheduledDateValue(secondMatch) ?? "9999-12-31";

        if (firstScheduledDate != secondScheduledDate) {
          return firstScheduledDate.localeCompare(secondScheduledDate);
        }

        const firstSlot = resolveMatchSwapDisplaySlot(firstMatch, true) ?? Number.MAX_SAFE_INTEGER;
        const secondSlot = resolveMatchSwapDisplaySlot(secondMatch, true) ?? Number.MAX_SAFE_INTEGER;

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

        return firstMatch.id.localeCompare(secondMatch.id);
      })
      .map((match) => ({
        id: match.id,
        label: resolveMatchSwapOptionLabel({
          match,
          shouldUseScheduledSlot: true,
          displaySlot: visualQueuePositionByMatchId[match.id],
        }),
      }));
  }, [eligibleSwapTargetMatchIds, matches, pendingSwapSourceMatch, visualQueuePositionByMatchId]);

  const filteredAndSortedMatches = useMemo(() => {
    return [...matchesFilteredByBaseCriteria]
      .filter((match) => {
        if (matchesLocationFilter != ALL_MATCHES_LOCATION_FILTER && match.location != matchesLocationFilter) {
          return false;
        }

        if (matchesCourtFilter != ALL_MATCHES_COURT_FILTER && match.court_name != matchesCourtFilter) {
          return false;
        }

        return true;
      })
      .sort((firstMatch, secondMatch) => {
        const statusOrderDifference = MATCH_STATUS_SORT_ORDER[firstMatch.status] - MATCH_STATUS_SORT_ORDER[secondMatch.status];

        if (statusOrderDifference != 0) {
          return statusOrderDifference;
        }

        if (firstMatch.status == MatchStatus.SCHEDULED && secondMatch.status == MatchStatus.SCHEDULED) {
          const firstScheduledDate = resolveMatchScheduledDateValue(firstMatch) ?? "9999-12-31";
          const secondScheduledDate = resolveMatchScheduledDateValue(secondMatch) ?? "9999-12-31";

          if (firstScheduledDate != secondScheduledDate) {
            return firstScheduledDate.localeCompare(secondScheduledDate);
          }

          const estimatedStartTimeDifference =
            resolveEstimatedStartTimeSortValue(estimatedStartTimeByMatchId[firstMatch.id]) -
            resolveEstimatedStartTimeSortValue(estimatedStartTimeByMatchId[secondMatch.id]);

          if (estimatedStartTimeDifference != 0) {
            return estimatedStartTimeDifference;
          }

          const slotDifference =
            resolveMatchDisplaySlotValue(firstMatch, shouldUseScheduledSlotInMatchList) -
            resolveMatchDisplaySlotValue(secondMatch, shouldUseScheduledSlotInMatchList);

          if (slotDifference != 0) {
            return slotDifference;
          }

          const locationAndCourtDifference = resolveMatchLocationAndCourtSortDifference(firstMatch, secondMatch);

          if (locationAndCourtDifference != 0) {
            return locationAndCourtDifference;
          }

          return firstMatch.created_at.localeCompare(secondMatch.created_at);
        }

        if (firstMatch.status == MatchStatus.FINISHED && secondMatch.status == MatchStatus.FINISHED) {
          const firstScheduledDate = resolveMatchScheduledDateValue(firstMatch) ?? "9999-12-31";
          const secondScheduledDate = resolveMatchScheduledDateValue(secondMatch) ?? "9999-12-31";

          if (firstScheduledDate != secondScheduledDate) {
            return firstScheduledDate.localeCompare(secondScheduledDate);
          }

          const slotDifference =
            resolveMatchDisplaySlotValue(firstMatch, shouldUseScheduledSlotInMatchList) -
            resolveMatchDisplaySlotValue(secondMatch, shouldUseScheduledSlotInMatchList);

          if (slotDifference != 0) {
            return slotDifference;
          }

          const locationAndCourtDifference = resolveMatchLocationAndCourtSortDifference(firstMatch, secondMatch);

          if (locationAndCourtDifference != 0) {
            return locationAndCourtDifference;
          }

          if (firstMatch.created_at != secondMatch.created_at) {
            return firstMatch.created_at.localeCompare(secondMatch.created_at);
          }

          return firstMatch.id.localeCompare(secondMatch.id);
        }

        const firstTimestamp = new Date(firstMatch.start_time ?? firstMatch.created_at).getTime();
        const secondTimestamp = new Date(secondMatch.start_time ?? secondMatch.created_at).getTime();

        return secondTimestamp - firstTimestamp;
      });
  }, [
    estimatedStartTimeByMatchId,
    matchesCourtFilter,
    matchesFilteredByBaseCriteria,
    matchesLocationFilter,
    shouldUseScheduledSlotInMatchList,
  ]);

  useEffect(() => {
    if (!showSwapMatchDialog || !pendingSwapSourceMatch) {
      setEligibleSwapTargetMatchIds([]);
      setLoadingSwapTargetMatchOptions(false);
      return;
    }

    let shouldIgnore = false;

    setLoadingSwapTargetMatchOptions(true);

    void (async () => {
      const { data, error } = await supabase.rpc("list_match_queue_swap_candidates", {
        _source_match_id: pendingSwapSourceMatch.id,
      });

      if (shouldIgnore) {
        return;
      }

      if (error) {
        setEligibleSwapTargetMatchIds([]);
        setLoadingSwapTargetMatchOptions(false);
        toast.error(resolveAdminMatchesOperationalErrorMessage(error));
        return;
      }

      const candidateRows = Array.isArray(data)
        ? (data as ListMatchQueueSwapCandidatesResponseItem[])
        : [];

      setEligibleSwapTargetMatchIds(candidateRows.map((candidateRow) => candidateRow.match_id));
      setLoadingSwapTargetMatchOptions(false);
    })();

    return () => {
      shouldIgnore = true;
    };
  }, [pendingSwapSourceMatch, showSwapMatchDialog]);

  useEffect(() => {
    if (!pendingSwapTargetMatchId) {
      return;
    }

    const isTargetMatchOptionAvailable = eligibleSwapTargetMatchOptions.some((option) => option.id == pendingSwapTargetMatchId);

    if (!isTargetMatchOptionAvailable) {
      setPendingSwapTargetMatchId("");
    }
  }, [eligibleSwapTargetMatchOptions, pendingSwapTargetMatchId]);

  const filteredMatchIds = useMemo(() => {
    return filteredAndSortedMatches.map((match) => match.id);
  }, [filteredAndSortedMatches]);

  const matchesTotalPages = Math.max(1, Math.ceil(filteredAndSortedMatches.length / matchesItemsPerPage));

  const paginatedMatches = useMemo(() => {
    const rangeStart = (matchesCurrentPage - 1) * matchesItemsPerPage;
    const rangeEnd = rangeStart + matchesItemsPerPage;

    return filteredAndSortedMatches.slice(rangeStart, rangeEnd);
  }, [filteredAndSortedMatches, matchesCurrentPage, matchesItemsPerPage]);

  const selectedFilteredMatchCount = useMemo(() => {
    const filteredMatchIdSet = new Set(filteredMatchIds);

    return selectedMatchIds.filter((selectedMatchId) => filteredMatchIdSet.has(selectedMatchId)).length;
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
    const validGroupFilterValues = new Set(groupsForMatchesFilter.map((groupOption) => groupOption.value));

    if (matchesGroupFilter != ALL_MATCHES_GROUP_FILTER && !validGroupFilterValues.has(matchesGroupFilter)) {
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
    if (matchesCourtFilter != ALL_MATCHES_COURT_FILTER && !courtsForMatchesFilter.includes(matchesCourtFilter)) {
      setMatchesCourtFilter(ALL_MATCHES_COURT_FILTER);
    }
  }, [courtsForMatchesFilter, matchesCourtFilter]);

  useEffect(() => {
    const matchIds = new Set(matches.map((match) => match.id));

    setSelectedMatchIds((currentSelectedMatchIds) => {
      return currentSelectedMatchIds.filter((selectedMatchId) => matchIds.has(selectedMatchId));
    });
  }, [matches]);

  useEffect(() => {
    if (!showSwapMatchDialog || pendingSwapSourceMatch) {
      return;
    }

    setShowSwapMatchDialog(false);
    setPendingSwapSourceMatchId(null);
    setPendingSwapTargetMatchId("");
    setEligibleSwapTargetMatchIds([]);
    setLoadingSwapTargetMatchOptions(false);
  }, [pendingSwapSourceMatch, showSwapMatchDialog]);

  useEffect(() => {
    if (!isScoreSheetReviewMode || !showSwapMatchDialog) {
      return;
    }

    setShowSwapMatchDialog(false);
    setPendingSwapSourceMatchId(null);
    setPendingSwapTargetMatchId("");
    setEligibleSwapTargetMatchIds([]);
    setLoadingSwapTargetMatchOptions(false);
  }, [isScoreSheetReviewMode, showSwapMatchDialog]);

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

    const validGroupOptionValueSet = new Set(editingMatchGroupOptions.map((groupOption) => groupOption.value));

    if (validGroupOptionValueSet.has(editingMatchDraft.selectedGroupOptionValue)) {
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

      const nextHomeTeamId = selectedGroupTeamIdSet.has(currentDraft.homeTeamId) ? currentDraft.homeTeamId : "";
      const nextAwayTeamId = selectedGroupTeamIdSet.has(currentDraft.awayTeamId) ? currentDraft.awayTeamId : "";

      if (nextHomeTeamId == currentDraft.homeTeamId && nextAwayTeamId == currentDraft.awayTeamId) {
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

    const validGroupOptionValueSet = new Set(createMatchGroupOptions.map((groupOption) => groupOption.value));

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

    if (selectedGroupTeamIdSet.has(homeTeamId) && selectedGroupTeamIdSet.has(awayTeamId)) {
      return;
    }

    setHomeTeamId((currentHomeTeamId) => {
      return selectedGroupTeamIdSet.has(currentHomeTeamId) ? currentHomeTeamId : "";
    });
    setAwayTeamId((currentAwayTeamId) => {
      return selectedGroupTeamIdSet.has(currentAwayTeamId) ? currentAwayTeamId : "";
    });
  }, [awayTeamId, homeTeamId, selectedCreateGroupOption]);

  const resolveNextGroupStageSlotNumber = async (competitionId: string) => {
    const { data: competitionBracketMatches, error: fetchBracketSlotError } = await supabaseLoose
      .from("championship_bracket_matches")
      .select("slot_number")
      .eq("competition_id", competitionId)
      .eq("phase", BracketPhase.GROUP_STAGE)
      .order("slot_number", { ascending: false })
      .limit(1);

    const typedCompetitionBracketMatches = (competitionBracketMatches ?? []) as BracketMatchRowLite[];

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
        errorMessage: "Não há edição de chaveamento configurada para vincular este jogo a uma chave.",
      };
    }

    const selectedGroupOption = championshipBracketGroupStageOptions.find((groupOption) => {
      return groupOption.value == params.groupOptionValue;
    });

    if (!selectedGroupOption) {
      return {
        errorMessage: "Selecione uma chave válida antes de salvar.",
      };
    }

    const nextSlotNumberResponse = await resolveNextGroupStageSlotNumber(selectedGroupOption.competition_id);

    if (nextSlotNumberResponse.errorMessage || nextSlotNumberResponse.slotNumber == null) {
      return {
        errorMessage: nextSlotNumberResponse.errorMessage ?? "Não foi possível definir a posição do jogo na chave.",
      };
    }

    const { error: bracketInsertError } = await supabaseLoose.from("championship_bracket_matches").insert({
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

  const moveMatchesToNextChampionshipDay = async (matchesToMove: Match[], emptySelectionMessage: string) => {
    if (!canManageMatches) {
      return;
    }

    if (matchesToMove.length == 0) {
      toast.error(emptySelectionMessage);
      return;
    }

    if (championshipDayDates.length < 2) {
      toast.error("Cadastre pelo menos dois dias de campeonato para mover jogos para o próximo dia.");
      return;
    }

    const orderedMatchesToMove = [...matchesToMove]
      .sort((firstMatch, secondMatch) => {
        const firstScheduledDate = resolveMatchScheduledDateValue(firstMatch) ?? "9999-12-31";
        const secondScheduledDate = resolveMatchScheduledDateValue(secondMatch) ?? "9999-12-31";

        if (firstScheduledDate != secondScheduledDate) {
          return firstScheduledDate.localeCompare(secondScheduledDate);
        }

        return (
          resolveMatchScheduleMoveSortValue(firstMatch, shouldUseScheduledSlotInMatchList) -
          resolveMatchScheduleMoveSortValue(secondMatch, shouldUseScheduledSlotInMatchList)
        );
      });

    setApplyingBulkAction(true);

    let movedMatchesCount = 0;
    let skippedMatchesCount = 0;

    for (const selectedMatch of orderedMatchesToMove) {
      if (selectedMatch.status != MatchStatus.SCHEDULED) {
        skippedMatchesCount += 1;
        continue;
      }

      const currentScheduledDate = resolveMatchScheduledDateValue(selectedMatch);

      if (!currentScheduledDate) {
        skippedMatchesCount += 1;
        continue;
      }

      const nextScheduledDate = championshipDayDates.find((championshipDayDate) => championshipDayDate > currentScheduledDate);

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
      toast.error("Nenhum jogo selecionado pôde ser movido para o próximo dia.");
      return;
    }

    const redistributedSchedule = await redistributeBracketScheduleAfterMatchScheduleChange({
      reloadError: "Os jogos foram movidos, mas não foi possível recarregar a agenda para redistribuir a fila",
      redistributeError: "Os jogos foram movidos, mas a redistribuição automática da fila falhou",
    });

    if (!redistributedSchedule) {
      return;
    }

    await Promise.all([onRefetch(), onRefetchChampionshipBracket()]);

    if (skippedMatchesCount > 0) {
      toast.success(`${movedMatchesCount} jogo(s) movido(s). ${skippedMatchesCount} não tinham próximo dia disponível.`);
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
      toast.error(`${messages.reloadError}: ${bracketDaySchedulesError.message}`);
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
      toast.error(`${messages.redistributeError}: ${redistributeError.message}`);
      await Promise.all([onRefetch(), onRefetchChampionshipBracket()]);
      return false;
    }

    return true;
  };

  const handleMoveSelectedMatchesToNextChampionshipDay = async () => {
    const matchesById = matches.reduce<Record<string, Match>>((carry, match) => {
      carry[match.id] = match;
      return carry;
    }, {});

    const selectedMatches = selectedMatchIds
      .map((selectedMatchId) => matchesById[selectedMatchId] ?? null)
      .filter((match): match is Match => match != null);

    await moveMatchesToNextChampionshipDay(selectedMatches, "Selecione ao menos um jogo.");
  };

  const handleMoveFilteredMatchesToNextChampionshipDay = async () => {
    await moveMatchesToNextChampionshipDay(filteredAndSortedMatches, "Nenhum jogo filtrado disponível para mover.");
  };

  const handleAdd = async () => {
    if (!canManageMatches || creatingMatch) {
      return;
    }

    const resolvedLocation = location.trim();

    if (!sportId || !homeTeamId || !awayTeamId || !resolvedLocation || !scheduledDate) {
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
    setSelectedMatchIds((currentSelectedMatchIds) => currentSelectedMatchIds.filter((selectedMatchId) => selectedMatchId != matchId));
    onRefetch();
    onRefetchChampionshipBracket();
  };

  const handleOpenDeleteMatchDialog = (match: Match) => {
    if (!canManageMatches) {
      return;
    }

    setPendingDeleteMatchId(match.id);
    setPendingDeleteMatchLabel(`${match.home_team?.name ?? "Casa"} x ${match.away_team?.name ?? "Visitante"}`);
    setShowDeleteMatchDialog(true);
  };

  const handleOpenSwapMatchDialog = (match: Match) => {
    if (!canManageMatches || isScoreSheetReviewMode) {
      return;
    }

    setPendingSwapSourceMatchId(match.id);
    setPendingSwapTargetMatchId("");
    setEligibleSwapTargetMatchIds([]);
    setShowSwapMatchDialog(true);
  };

  const handleCloseSwapMatchDialog = () => {
    if (swappingMatches) {
      return;
    }

    setShowSwapMatchDialog(false);
    setPendingSwapSourceMatchId(null);
    setPendingSwapTargetMatchId("");
    setEligibleSwapTargetMatchIds([]);
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
    setEligibleSwapTargetMatchIds([]);
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

  const handleToggleSelectedMatch = (matchId: string, checked: CheckedState) => {
    setSelectedMatchIds((currentSelectedMatchIds) => {
      if (checked == true) {
        if (currentSelectedMatchIds.includes(matchId)) {
          return currentSelectedMatchIds;
        }

        return [...currentSelectedMatchIds, matchId];
      }

      return currentSelectedMatchIds.filter((selectedMatchId) => selectedMatchId != matchId);
    });
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

    const { error } = await supabase.from("matches").delete().in("id", selectedMatchIds);

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
      const nextSavingReviewStateByMatchId = { ...currentSavingReviewStateByMatchId };

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

  const loadMatchScoreSheetAwardsContext = useCallback(async (matchId: string) => {
    setLoadingScoreSheetAwardsByMatchId((currentLoadingState) => ({
      ...currentLoadingState,
      [matchId]: true,
    }));

    const { data, error } = await supabaseLoose.rpc("get_match_score_sheet_awards_context", {
      _match_id: matchId,
    });

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

    setScoreSheetAwardsDraftByMatchId((currentDraftByMatchId) => ({
      ...currentDraftByMatchId,
      [matchId]: resolveScoreSheetDraftFromContext(context),
    }));

    return context;
  }, []);

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

  const handleDeleteAwardPlayer = (matchId: string, side: "home" | "away", playerId: string) => {
    handleUpdateScoreSheetAwardsDraft(matchId, (draft) => {
      const nextPlayerOptions = (side == "home" ? draft.homePlayerOptions : draft.awayPlayerOptions)
        .filter((p) => p.id !== playerId);
      const clearGoalId = (selections: GoalSelection[]) =>
        selections.map((gs) => gs.scorerId == playerId ? { ...gs, scorerId: "" } : gs);
      const clearGkId = (selections: string[]) =>
        selections.map((s) => s == playerId ? "" : s);
      return {
        ...draft,
        homePlayerOptions: side == "home" ? nextPlayerOptions : draft.homePlayerOptions,
        awayPlayerOptions: side == "away" ? nextPlayerOptions : draft.awayPlayerOptions,
        homeGoalSelections: clearGoalId(draft.homeGoalSelections),
        awayGoalSelections: clearGoalId(draft.awayGoalSelections),
        homeGoalkeeperSelections: clearGkId(draft.homeGoalkeeperSelections),
        awayGoalkeeperSelections: clearGkId(draft.awayGoalkeeperSelections),
      };
    });
  };

  const handleConfirmEditAwardPlayer = (matchId: string, side: "home" | "away") => {
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
      const playerOptions = side == "home" ? draft.homePlayerOptions : draft.awayPlayerOptions;
      const nextPlayerOptions = playerOptions
        .map((p) => p.id == oldId ? { ...p, id: newId, name: normalizedName, is_goalkeeper: editingState.isGoalkeeper } : p)
        .sort((a, b) => Number(b.is_goalkeeper) - Number(a.is_goalkeeper) || a.name.localeCompare(b.name));
      const updateGoalId = (selections: GoalSelection[]) =>
        selections.map((gs) => gs.scorerId == oldId ? { ...gs, scorerId: newId } : gs);
      const updateGkId = (selections: string[]) =>
        selections.map((s) => s == oldId ? newId : s);
      return {
        ...draft,
        homePlayerOptions: side == "home" ? nextPlayerOptions : draft.homePlayerOptions,
        awayPlayerOptions: side == "away" ? nextPlayerOptions : draft.awayPlayerOptions,
        homeGoalSelections: updateGoalId(draft.homeGoalSelections),
        awayGoalSelections: updateGoalId(draft.awayGoalSelections),
        homeGoalkeeperSelections: updateGkId(draft.homeGoalkeeperSelections),
        awayGoalkeeperSelections: updateGkId(draft.awayGoalkeeperSelections),
      };
    });

    setEditingPlayerByKey((prev) => ({ ...prev, [key]: null }));
  };

  const handleAddInlineAwardPlayer = (matchId: string, side: "home" | "away") => {
    const currentDraft = scoreSheetAwardsDraftByMatchId[matchId];

    if (!currentDraft) {
      return;
    }

    const rawPlayerName = side == "home" ? currentDraft.newHomePlayerName : currentDraft.newAwayPlayerName;
    const normalizedPlayerName = rawPlayerName.trim();

    if (!normalizedPlayerName) {
      toast.error("Informe o nome do jogador para cadastrar.");
      return;
    }

    const syntheticPlayerId = `${NEW_PLAYER_OPTION_PREFIX}${normalizedPlayerName}`;
    const playerOptions = side == "home" ? currentDraft.homePlayerOptions : currentDraft.awayPlayerOptions;

    if (playerOptions.some((playerOption) => playerOption.id == syntheticPlayerId)) {
      toast.error("Este jogador já está na lista desta equipe.");
      return;
    }

    const buttonKey = `${matchId}:${side}`;

    setAddPlayerButtonStateByKey((prev) => ({ ...prev, [buttonKey]: "loading" }));

    setTimeout(() => {
      handleUpdateScoreSheetAwardsDraft(matchId, (draft) => {
        const isGoalkeeper = side == "home" ? draft.newHomePlayerIsGoalkeeper : draft.newAwayPlayerIsGoalkeeper;
        const nextPlayerOption = {
          id: syntheticPlayerId,
          name: normalizedPlayerName,
          is_goalkeeper: isGoalkeeper,
        };

        const nextPlayerOptions = [...(side == "home" ? draft.homePlayerOptions : draft.awayPlayerOptions), nextPlayerOption]
          .sort((a, b) => Number(b.is_goalkeeper) - Number(a.is_goalkeeper) || a.name.localeCompare(b.name));

        return {
          ...draft,
          homePlayerOptions: side == "home" ? nextPlayerOptions : draft.homePlayerOptions,
          awayPlayerOptions: side == "away" ? nextPlayerOptions : draft.awayPlayerOptions,
          newHomePlayerName: side == "home" ? "" : draft.newHomePlayerName,
          newAwayPlayerName: side == "away" ? "" : draft.newAwayPlayerName,
          newHomePlayerIsGoalkeeper: side == "home" ? false : draft.newHomePlayerIsGoalkeeper,
          newAwayPlayerIsGoalkeeper: side == "away" ? false : draft.newAwayPlayerIsGoalkeeper,
        };
      });

      setAddPlayerButtonStateByKey((prev) => ({ ...prev, [buttonKey]: "success" }));

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
    if (!activeScoreSheetReviewMatchId || !activeScoreSheetReviewMatch || !activeScoreSheetAwardsDraft) {
      return;
    }

    const { isWalkover } = activeScoreSheetAwardsDraft;

    if (!isWalkover) {
      const hasIncompleteHomeGoals = activeScoreSheetAwardsDraft.homeGoalSelections.some((gs) => gs.scorerId.trim().length == 0);
      const hasIncompleteAwayGoals = activeScoreSheetAwardsDraft.awayGoalSelections.some((gs) => gs.scorerId.trim().length == 0);

      if (hasIncompleteHomeGoals || hasIncompleteAwayGoals) {
        toast.error("Preencha os autores de todos os gols antes de salvar.");
        return;
      }

      const hasHomeGoalkeeper = activeScoreSheetAwardsDraft.homeGoalkeeperSelections.some((s) => s.trim().length > 0);
      const hasAwayGoalkeeper = activeScoreSheetAwardsDraft.awayGoalkeeperSelections.some((s) => s.trim().length > 0);

      if (!hasHomeGoalkeeper || !hasAwayGoalkeeper) {
        toast.error("Informe pelo menos um goleiro para cada equipe.");
        return;
      }
    }

    setSavingScoreSheetAwardsByMatchId((currentSavingState) => ({
      ...currentSavingState,
      [activeScoreSheetReviewMatchId]: true,
    }));

    const homeGoalScorersPayload = activeScoreSheetAwardsDraft.homeGoalSelections.map((gs) => ({
      ...resolveScoreSheetSelectionOptionByValue(gs.scorerId, activeScoreSheetAwardsDraft.homePlayerOptions),
      ...(gs.concedingGoalkeeperName.trim() ? { conceding_goalkeeper_name: gs.concedingGoalkeeperName.trim() } : {}),
    }));
    const awayGoalScorersPayload = activeScoreSheetAwardsDraft.awayGoalSelections.map((gs) => ({
      ...resolveScoreSheetSelectionOptionByValue(gs.scorerId, activeScoreSheetAwardsDraft.awayPlayerOptions),
      ...(gs.concedingGoalkeeperName.trim() ? { conceding_goalkeeper_name: gs.concedingGoalkeeperName.trim() } : {}),
    }));
    const homeGoalkeepersPayload = activeScoreSheetAwardsDraft.homeGoalkeeperSelections
      .filter((s) => s.trim().length > 0)
      .map((s) => resolveScoreSheetSelectionOptionByValue(s, activeScoreSheetAwardsDraft.homePlayerOptions));
    const awayGoalkeepersPayload = activeScoreSheetAwardsDraft.awayGoalkeeperSelections
      .filter((s) => s.trim().length > 0)
      .map((s) => resolveScoreSheetSelectionOptionByValue(s, activeScoreSheetAwardsDraft.awayPlayerOptions));

    const { error } = await supabaseLoose.rpc("save_match_score_sheet_awards", {
      _match_id: activeScoreSheetReviewMatch.id,
      _home_goal_scorers: homeGoalScorersPayload,
      _away_goal_scorers: awayGoalScorersPayload,
      _home_goalkeepers: homeGoalkeepersPayload,
      _away_goalkeepers: awayGoalkeepersPayload,
    });

    setSavingScoreSheetAwardsByMatchId((currentSavingState) => ({
      ...currentSavingState,
      [activeScoreSheetReviewMatchId]: false,
    }));

    if (error) {
      toast.error(resolveAdminMatchesOperationalErrorMessage(error));
      return;
    }

    toast.success("Revisão de súmula salva com premiações.");
    setActiveScoreSheetReviewMatchId(null);
    await onRefetch();
  };

  const handleToggleMatchScoreSheetReviewed = async (matchId: string, checked: CheckedState) => {
    if (!canManageMatches) {
      return;
    }

    const match = matches.find((matchItem) => matchItem.id == matchId);

    if (!match) {
      return;
    }

    if (checked === true && !match.is_walkover && supportsIndividualAwardsBySportId.get(match.sport_id) === true) {
      await handleOpenScoreSheetReview(matchId);
      return;
    }

    await handleUpdateMatchesReviewState({
      matchIds: [matchId],
      reviewed: checked === true,
      successMessage: checked === true ? "Jogo marcado como conferido na súmula." : "Jogo desmarcado da conferência de súmula.",
    });
  };

  const handleBulkUpdateFilteredMatchesReviewState = async (reviewed: boolean) => {
    if (!canManageMatches || bulkReviewAction != null) {
      return;
    }

    const filteredMatchIdSet = new Set(filteredMatchIds);
    const selectedFilteredMatchIds = selectedMatchIds.filter((selectedMatchId) => filteredMatchIdSet.has(selectedMatchId));

    if (selectedFilteredMatchIds.length == 0) {
      toast.error("Selecione ao menos um jogo filtrado.");
      return;
    }

    if (reviewed) {
      const hasNonWalkoverMatch = selectedFilteredMatchIds.some((selectedMatchId) => {
        const selectedMatch = matches.find((match) => match.id == selectedMatchId);
        return selectedMatch != null && !selectedMatch.is_walkover;
      });

      if (hasNonWalkoverMatch) {
        toast.error("Para marcar como revisado, use a revisão individual de súmula para registrar gols e goleiros.");
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

    const matchBracketBinding = groupStageMatchBracketBindingByMatchId[match.id];
    const displaySlot = resolveMatchDisplaySlotValue(match, shouldUseScheduledSlotInMatchList);
    const currentGameSlot = displaySlot === Number.MAX_SAFE_INTEGER ? null : displaySlot;

    setEditingMatchId(match.id);
    setEditingMatchDraft({
      sportId: match.sport_id,
      homeTeamId: match.home_team_id,
      awayTeamId: match.away_team_id,
      homeScore: match.home_score,
      awayScore: match.away_score,
      homeYellowCards: match.home_yellow_cards ?? 0,
      homeRedCards: match.home_red_cards ?? 0,
      awayYellowCards: match.away_yellow_cards ?? 0,
      awayRedCards: match.away_red_cards ?? 0,
      location: match.location,
      scheduledDate: resolveScheduledDateDraftValue(match),
      startTime: match.start_time ? new Date(match.start_time) : null,
      gameSlot: currentGameSlot == null ? "" : String(currentGameSlot),
      division: match.division ?? TeamDivision.DIVISAO_PRINCIPAL,
      naipe: match.naipe,
      status: match.status,
      selectedGroupOptionValue: matchBracketBinding ? `${matchBracketBinding.competition_id}:${matchBracketBinding.group_id}` : "",
      resolvedTieBreakerRule: match.resolved_tie_breaker_rule ?? "",
    });
    setEditingMatchSetsDraft(resolveRecordedMatchSets(match));
  };

  const handleCancelEditingMatch = () => {
    setSavingEditingMatch(false);
    setEditingMatchId(null);
    setEditingMatchDraft(null);
    setEditingMatchSetsDraft([]);
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
      return currentEditingMatchSetsDraft.filter((_, currentMatchSetIndex) => currentMatchSetIndex != matchSetIndex);
    });
  };

  const handleUpdateEditingMatchSetPoints = (
    matchSetIndex: number,
    side: "home" | "away",
    value: string,
  ) => {
    const parsedValue = resolveParsedScoreInputValue(value);

    setEditingMatchSetsDraft((currentEditingMatchSetsDraft) => {
      return currentEditingMatchSetsDraft.map((matchSet, currentMatchSetIndex) => {
        if (currentMatchSetIndex != matchSetIndex) {
          return matchSet;
        }

        return {
          ...matchSet,
          home_points: side == "home" ? parsedValue : matchSet.home_points,
          away_points: side == "away" ? parsedValue : matchSet.away_points,
        };
      });
    });
  };

  const handleSaveEditingMatch = async (scoreSheetReviewSaveDecision?: ScoreSheetReviewSaveDecision) => {
    if (!canManageMatches) {
      return;
    }

    if (!editingMatchId || !editingMatchDraft) {
      return;
    }

    const normalizedLocation = editingMatchDraft.location.trim();

    if (
      !editingMatchDraft.sportId ||
      !editingMatchDraft.homeTeamId ||
      !editingMatchDraft.awayTeamId ||
      !normalizedLocation ||
      !editingMatchDraft.scheduledDate
    ) {
      toast.error("Preencha todos os campos da edição.");
      return;
    }

    if (editingMatchDraft.homeTeamId === editingMatchDraft.awayTeamId) {
      toast.error("Atléticas devem ser diferentes.");
      return;
    }

    const normalizedGameSlot = editingMatchDraft.gameSlot;
    const isLastInQueue = normalizedGameSlot === "LAST_IN_QUEUE";
    const shouldClearGameSlot = normalizedGameSlot.length == 0;
    
    let parsedGameSlot: number | null = null;
    
    if (isLastInQueue) {
      const scheduledDateString = resolveDateOnlyString(editingMatchDraft.scheduledDate);
      const matchesOnSameDate = matches.filter(m => resolveMatchScheduledDateValue(m) === scheduledDateString && m.id !== editingMatchId);
      const maxQueuePosition = matchesOnSameDate.reduce((max, m) => Math.max(max, m.queue_position ?? 0), 0);
      parsedGameSlot = maxQueuePosition + 1;
    } else if (!shouldClearGameSlot) {
      parsedGameSlot = Number.parseInt(normalizedGameSlot, 10);
    }

    if (!isLastInQueue && !shouldClearGameSlot && (!Number.isFinite(parsedGameSlot) || parsedGameSlot == null || parsedGameSlot <= 0)) {
      toast.error("Informe um número de jogo válido ou deixe o campo vazio.");
      return;
    }

    if (editingMatchBracketBinding && !selectedEditingGroupOption) {
      toast.error("Selecione o grupo do jogo antes de salvar.");
      return;
    }

    const editingMatch = matches.find((match) => match.id == editingMatchId) ?? null;

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
    const editingBracketMatch = knockoutFirstRoundBracketMatchByMatchId[editingMatchId];
    if (editingBracketMatch) {
      const firstRoundTeamIds = knockoutFirstRoundTeamIdsByCompetitionId[editingBracketMatch.competition_id] ?? new Set<string>();
      const originalMatch = matches.find((m) => m.id === editingMatchId);

      const homeChanged = originalMatch && editingMatchDraft.homeTeamId !== originalMatch.home_team_id;
      const awayChanged = originalMatch && editingMatchDraft.awayTeamId !== originalMatch.away_team_id;

      if (homeChanged && originalMatch.home_team_id && firstRoundTeamIds.has(editingMatchDraft.homeTeamId)) {
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

      if (awayChanged && originalMatch.away_team_id && firstRoundTeamIds.has(editingMatchDraft.awayTeamId)) {
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
      championshipSportResultRuleBySportId.get(editingMatchDraft.sportId) == ChampionshipSportResultRule.SETS;
    const isEditingSportWithCardsBySelectedSport =
      championshipSportSupportsCardsBySportId.get(editingMatchDraft.sportId) == true;
    const normalizedEditingMatchSetsDraft = resolveNormalizedMatchSetsDraft(editingMatchSetsDraft);

    if (isEditingSetRuleBySelectedSport) {
      const hasInvalidEmptySet = normalizedEditingMatchSetsDraft.some((matchSet) => {
        return matchSet.home_points == 0 && matchSet.away_points == 0;
      });

      if (hasInvalidEmptySet) {
        setSavingEditingMatch(false);
        toast.error("Informe um placar válido para todos os sets ou remova os sets vazios.");
        return;
      }

      const hasInvalidDrawSet = normalizedEditingMatchSetsDraft.some((matchSet) => {
        return matchSet.home_points == matchSet.away_points;
      });

      if (hasInvalidDrawSet) {
        setSavingEditingMatch(false);
        toast.error("Um set não pode terminar empatado.");
        return;
      }
    }

    const shouldSyncMatchSets = isEditingSetRuleBySelectedSport || resolveRecordedMatchSets(editingMatch ?? { match_sets: [] }).length > 0;
    const shouldResetFinishedMatchToScheduled =
      editingMatchDraft.status == MatchStatus.SCHEDULED && editingMatch?.status == MatchStatus.FINISHED;
    const shouldReopenFinishedMatchAsLive =
      editingMatchDraft.status == MatchStatus.LIVE && editingMatch?.status == MatchStatus.FINISHED;
    const shouldPreserveTieBreakResolution = editingMatchDraft.status == MatchStatus.FINISHED;
    const resolvedSetWins = isEditingSetRuleBySelectedSport ? resolveSetWins(normalizedEditingMatchSetsDraft) : null;
    const resolvedHomeScore = resolvedSetWins ? resolvedSetWins.home_sets : resolveSafeScoreValue(editingMatchDraft.homeScore);
    const resolvedAwayScore = resolvedSetWins ? resolvedSetWins.away_sets : resolveSafeScoreValue(editingMatchDraft.awayScore);
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
    const resolvedStartTime = shouldResetFinishedMatchToScheduled
      ? null
      : (shouldReopenFinishedMatchAsLive ? (editingMatch?.start_time ?? new Date().toISOString()) : (editingMatchDraft.startTime?.toISOString() ?? null));
    const resolvedEndTime = shouldResetFinishedMatchToScheduled || shouldReopenFinishedMatchAsLive ? null : editingMatch?.end_time ?? null;
    const resolvedScheduledDate = resolveDateOnlyString(editingMatchDraft.scheduledDate);
    const resolvedDivision = championshipUsesDivisions ? editingMatchDraft.division : null;
    const shouldRedistributeScheduleAfterEditingMatch =
      resolveShouldRedistributeBracketScheduleAfterMatchEdit({
        previousMatch: editingMatch,
        nextMatch: {
          status: editingMatchDraft.status,
          scheduled_date: resolvedScheduledDate,
          queue_position: parsedGameSlot,
          scheduled_slot: parsedGameSlot,
          sport_id: editingMatchDraft.sportId,
          naipe: editingMatchDraft.naipe,
          division: resolvedDivision,
          location: normalizedLocation,
          court_name: editingMatch?.court_name ?? null,
          start_time: resolvedStartTime,
          created_at: editingMatch?.created_at ?? new Date().toISOString(),
          home_team_id: editingMatchDraft.homeTeamId,
          away_team_id: editingMatchDraft.awayTeamId,
        },
      });
    const resolvedCourtName = shouldResetFinishedMatchToScheduled || shouldRedistributeScheduleAfterEditingMatch
      ? null
      : editingMatch?.court_name ?? null;
    const resolvedCurrentSetHomeScore = shouldResetFinishedMatchToScheduled ? null : editingMatch?.current_set_home_score ?? null;
    const resolvedCurrentSetAwayScore = shouldResetFinishedMatchToScheduled ? null : editingMatch?.current_set_away_score ?? null;
    const scheduledMatchCourtConflictMessage = resolveScheduledMatchCourtConflictMessage({
      matches,
      nextMatch: {
        id: editingMatchId,
        status: editingMatchDraft.status,
        scheduled_date: resolvedScheduledDate,
        naipe: editingMatchDraft.naipe,
        location: normalizedLocation,
        court_name: resolvedCourtName,
        start_time: resolvedStartTime,
        queue_position: parsedGameSlot,
        scheduled_slot: parsedGameSlot,
        created_at: editingMatch?.created_at ?? new Date().toISOString(),
        home_team_id: editingMatchDraft.homeTeamId,
        away_team_id: editingMatchDraft.awayTeamId,
      },
    });

    if (!shouldRedistributeScheduleAfterEditingMatch && scheduledMatchCourtConflictMessage) {
      setSavingEditingMatch(false);
      toast.error(scheduledMatchCourtConflictMessage);
      return;
    }

    const { error } = await supabase
      .from("matches")
      .update({
        naipe: editingMatchDraft.naipe,
        sport_id: editingMatchDraft.sportId,
        home_team_id: editingMatchDraft.homeTeamId,
        away_team_id: editingMatchDraft.awayTeamId,
        location: normalizedLocation,
        scheduled_date: resolvedScheduledDate,
        queue_position: parsedGameSlot,
        scheduled_slot: parsedGameSlot,
        court_name: resolvedCourtName,
        start_time: resolvedStartTime,
        end_time: resolvedEndTime,
        current_set_home_score: resolvedCurrentSetHomeScore,
        current_set_away_score: resolvedCurrentSetAwayScore,
        home_score: resolvedHomeScore,
        away_score: resolvedAwayScore,
        home_yellow_cards: resolvedHomeYellowCards,
        home_red_cards: resolvedHomeRedCards,
        away_yellow_cards: resolvedAwayYellowCards,
        away_red_cards: resolvedAwayRedCards,
        is_score_sheet_reviewed: shouldKeepScoreSheetReview,
        resolved_tie_breaker_rule: shouldPreserveTieBreakResolution ? editingMatchDraft.resolvedTieBreakerRule || null : null,
        resolved_tie_break_winner_team_id: shouldPreserveTieBreakResolution ? editingMatch?.resolved_tie_break_winner_team_id ?? null : null,
        status: editingMatchDraft.status,
        division: resolvedDivision,
      })
      .eq("id", editingMatchId);

    if (error) {
      setSavingEditingMatch(false);
      toast.error(error.message);
      return;
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

    if (editingMatchBracketBinding && selectedEditingGroupOption) {
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

      if (editingMatchBracketBinding.competition_id != selectedEditingGroupOption.competition_id) {
        const nextSlotNumberResponse = await resolveNextGroupStageSlotNumber(selectedEditingGroupOption.competition_id);

        if (nextSlotNumberResponse.errorMessage || nextSlotNumberResponse.slotNumber == null) {
          setSavingEditingMatch(false);
          toast.error(nextSlotNumberResponse.errorMessage ?? "Não foi possível atualizar a chave do jogo.");
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
    } else if (!editingMatchBracketBinding && selectedEditingGroupOption) {
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

    if (shouldRedistributeScheduleAfterEditingMatch) {
      const redistributedSchedule = await redistributeBracketScheduleAfterMatchScheduleChange({
        reloadError: "O jogo foi atualizado, mas não foi possível recarregar a agenda para redistribuir a fila",
        redistributeError: "O jogo foi atualizado, mas a redistribuição automática da fila falhou",
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

  const handleShuffleTieBreakContext = (pendingTieBreakContext: ChampionshipBracketTieBreakPendingContext) => {
    const orderedTeamIds = pendingTieBreakContext.teams.map((team) => team.team_id);
    let shuffledTeamIds = shuffleTeamIds(orderedTeamIds);

    if (
      orderedTeamIds.length > 1 &&
      orderedTeamIds.every((teamId, teamIndex) => teamId == shuffledTeamIds[teamIndex])
    ) {
      shuffledTeamIds = shuffleTeamIds(orderedTeamIds);
    }

    setDraftTieBreakTeamIdsByContextKey((currentDraftTieBreakTeamIdsByContextKey) => ({
      ...currentDraftTieBreakTeamIdsByContextKey,
      [pendingTieBreakContext.context_key]: shuffledTeamIds,
    }));
  };

  const handleUpdateTieBreakContextTeamAtPosition = (
    pendingTieBreakContext: ChampionshipBracketTieBreakPendingContext,
    positionIndex: number,
    teamId: string,
  ) => {
    setDraftTieBreakTeamIdsByContextKey((currentDraftTieBreakTeamIdsByContextKey) => {
      const currentTieBreakTeamOrder = resolveNormalizedTieBreakTeamOrder(
        pendingTieBreakContext,
        currentDraftTieBreakTeamIdsByContextKey[pendingTieBreakContext.context_key],
      );

      currentTieBreakTeamOrder[positionIndex] = teamId;

      return {
        ...currentDraftTieBreakTeamIdsByContextKey,
        [pendingTieBreakContext.context_key]: currentTieBreakTeamOrder,
      };
    });
  };

  const handleSaveTieBreakResolutions = async () => {
    if (pendingTieBreakContexts.length == 0 || !championshipBracketView.edition?.id) {
      return;
    }

    if (!isTieBreakResolutionReady) {
      toast.error("Defina a ordem completa dos desempates pendentes antes de confirmar.");
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
      toast.error(resolveAdminMatchesOperationalErrorMessage(knockoutResponse.error));
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

    if (!resolveIsTieBreakTeamOrderReady(pendingTieBreakContext, orderedTeamIds)) {
      toast.error("Defina a ordem completa sem repetir atléticas antes de salvar este sorteio.");
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
      toast.error(resolveAdminMatchesOperationalErrorMessage(knockoutResponse.error));
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

  const handleShuffleAwardDraw = (context: AwardDrawPendingContext) => {
    const playerIds = context.tied_players.map((p) => p.player_id);
    const shuffled = shuffleTeamIds(playerIds);

    setDraftAwardDrawOrderByContextKey((current) => ({
      ...current,
      [context.context_key]: shuffled,
    }));
  };

  const handleUpdateAwardDrawPlayerAtPosition = (
    context: AwardDrawPendingContext,
    positionIndex: number,
    playerId: string,
  ) => {
    setDraftAwardDrawOrderByContextKey((current) => {
      const currentOrder = current[context.context_key] ?? context.tied_players.map(() => "");
      const updatedOrder = [...currentOrder];
      updatedOrder[positionIndex] = playerId;
      return { ...current, [context.context_key]: updatedOrder };
    });
  };

  const handleSaveAwardDrawResult = async (context: AwardDrawPendingContext) => {
    const orderedPlayerIds = draftAwardDrawOrderByContextKey[context.context_key];

    if (!orderedPlayerIds || orderedPlayerIds.length == 0 || !orderedPlayerIds[0]) {
      toast.error("Selecione ou sorteie o vencedor antes de salvar.");
      return;
    }

    const winnerPlayerId = orderedPlayerIds[0];

    if (!winnerPlayerId) {
      return;
    }

    setSavingAwardDrawByContextKey((current) => ({ ...current, [context.context_key]: true }));

    try {
      const { error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }).rpc("save_championship_award_draw_result", {
        _championship_id: selectedChampionship.id,
        _season_year: selectedChampionship.current_season_year,
        _sport_id: context.sport_id,
        _naipe: context.naipe,
        _division: context.division,
        _award_type: context.award_type,
        _winner_player_id: winnerPlayerId,
        _tied_player_ids_signature: context.tied_player_ids_signature,
      });

      if (error) {
        toast.error("Erro ao salvar resultado do sorteio.");
        return;
      }

      toast.success("Resultado do sorteio de premiação salvo.");
      void refetchPendingAwardDraws();
    } finally {
      setSavingAwardDrawByContextKey((current) => ({ ...current, [context.context_key]: false }));
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
                Esta aba mostra apenas empates de chaves já encerradas que ainda impactam vaga/classificação para a próxima fase.
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
              disabled={loadingPendingTieBreakContexts || loadingCorrectedGroupStandings || loadingPendingAwardDraws || isAnyTieBreakResolutionSaveInFlight}
            >
              {loadingPendingTieBreakContexts ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
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
                  draftTieBreakTeamIdsByContextKey[pendingTieBreakContext.context_key],
                );
                const isTieBreakContextOrderReady = resolveIsTieBreakTeamOrderReady(pendingTieBreakContext, orderedTeamIds);
                const teamNameByTeamId = pendingTieBreakTeamNameByContextKeyAndTeamId[pendingTieBreakContext.context_key] ?? {};
                const isSavingTieBreakContext = savingTieBreakResolutionByContextKey[pendingTieBreakContext.context_key] == true;
                const tieBreakAuditRows = pendingTieBreakContext.teams
                  .map((team) => correctedStandingByCompetitionAndTeamKey[`${pendingTieBreakContext.competition_id}:${team.team_id}`])
                  .filter((tieBreakAuditRow): tieBreakAuditRow is ChampionshipCorrectedGroupStanding => tieBreakAuditRow != null)
                  .sort((firstRow, secondRow) => {
                    if (firstRow.corrected_points != secondRow.corrected_points) {
                      return secondRow.corrected_points - firstRow.corrected_points;
                    }

                    if (firstRow.points_average != secondRow.points_average) {
                      return secondRow.points_average - firstRow.points_average;
                    }

                    if (firstRow.goal_diff != secondRow.goal_diff) {
                      return secondRow.goal_diff - firstRow.goal_diff;
                    }

                    if (firstRow.yellow_cards != secondRow.yellow_cards) {
                      return firstRow.yellow_cards - secondRow.yellow_cards;
                    }

                    if (firstRow.red_cards != secondRow.red_cards) {
                      return firstRow.red_cards - secondRow.red_cards;
                    }

                    if (firstRow.goals_for != secondRow.goals_for) {
                      return secondRow.goals_for - firstRow.goals_for;
                    }

                    return firstRow.team_name.localeCompare(secondRow.team_name, "pt-BR", {
                      sensitivity: "base",
                    });
                  });
                const displayedTieBreakSlots = pendingTieBreakContext.teams.map((_, teamIndex) => ({
                  position: teamIndex + 1,
                  teamId: orderedTeamIds[teamIndex] ?? "",
                }));

                return (
                  <div key={pendingTieBreakContext.context_key} className="glass-card space-y-3 p-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-foreground">{pendingTieBreakContext.title}</h3>
                      <p className="text-sm text-muted-foreground">{pendingTieBreakContext.description}</p>
                    </div>

                    {loadingCorrectedGroupStandings ? (
                      <Skeleton className="h-36 w-full rounded-2xl" />
                    ) : tieBreakAuditRows.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resultado atual do empate</p>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Atlética</TableHead>
                                <TableHead className="text-right">PTS (corr.)</TableHead>
                                <TableHead className="text-right">PA</TableHead>
                                <TableHead className="text-right">SG</TableHead>
                                <TableHead className="text-right">CA</TableHead>
                                <TableHead className="text-right">CV</TableHead>
                                <TableHead className="text-right">GP</TableHead>
                                <TableHead className="text-right">GC</TableHead>
                                <TableHead className="text-right">V</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {tieBreakAuditRows.map((tieBreakAuditRow) => (
                                <TableRow key={`${pendingTieBreakContext.context_key}:${tieBreakAuditRow.team_id}`}>
                                  <TableCell>{tieBreakAuditRow.team_name}</TableCell>
                                  <TableCell className="text-right font-semibold text-primary">
                                    {formatStandingsPoints(tieBreakAuditRow.corrected_points)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {formatPointsAverageForStandings(
                                      tieBreakAuditRow.goals_for,
                                      tieBreakAuditRow.goals_against,
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">{tieBreakAuditRow.goal_diff}</TableCell>
                                  <TableCell className="text-right tabular-nums">{tieBreakAuditRow.yellow_cards}</TableCell>
                                  <TableCell className="text-right tabular-nums">{tieBreakAuditRow.red_cards}</TableCell>
                                  <TableCell className="text-right tabular-nums">{tieBreakAuditRow.goals_for}</TableCell>
                                  <TableCell className="text-right tabular-nums">{tieBreakAuditRow.goals_against}</TableCell>
                                  <TableCell className="text-right tabular-nums">{tieBreakAuditRow.wins}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Métricas de pontuação corrigida indisponíveis para este contexto no momento.
                      </p>
                    )}

                    {!isTieBreakContextOrderReady ? (
                      <p className="text-xs font-medium text-amber-500">
                        Defina a ordem completa sem repetir atléticas para confirmar este desempate.
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
                            value={displayedTieBreakSlot.teamId || EMPTY_TIE_BREAK_TEAM_OPTION_VALUE}
                            onValueChange={(value) =>
                              handleUpdateTieBreakContextTeamAtPosition(
                                pendingTieBreakContext,
                                displayedTieBreakSlot.position - 1,
                                value == EMPTY_TIE_BREAK_TEAM_OPTION_VALUE ? "" : value,
                              )
                            }
                            disabled={savingTieBreakResolutions || isSavingTieBreakContext || !canManageMatches}
                          >
                            <SelectTrigger
                              aria-label={`Atlética na posição ${displayedTieBreakSlot.position} do desempate`}
                              className="app-input-field w-full"
                            >
                              <SelectValue placeholder="Selecione a atlética" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={EMPTY_TIE_BREAK_TEAM_OPTION_VALUE}>Selecione a atlética</SelectItem>
                              {pendingTieBreakContext.teams.map((tieBreakTeamOption) => {
                                const isSelectedInOtherPosition = displayedTieBreakSlots.some((displayedTieBreakSlotItem) => {
                                  return (
                                    displayedTieBreakSlotItem.position != displayedTieBreakSlot.position &&
                                    displayedTieBreakSlotItem.teamId == tieBreakTeamOption.team_id
                                  );
                                });

                                return (
                                  <SelectItem
                                    key={`${pendingTieBreakContext.context_key}:${displayedTieBreakSlot.position}:${tieBreakTeamOption.team_id}`}
                                    value={tieBreakTeamOption.team_id}
                                    disabled={isSelectedInOtherPosition}
                                  >
                                    {teamNameByTeamId[tieBreakTeamOption.team_id] ?? tieBreakTeamOption.team_name}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleShuffleTieBreakContext(pendingTieBreakContext)}
                        disabled={savingTieBreakResolutions || isSavingTieBreakContext || !canManageMatches}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {orderedTeamIds.some((teamId) => teamId.length > 0) ? "Refazer sorteio" : "Sortear ordem"}
                      </Button>

                      <Button
                        type="button"
                        onClick={() => void handleSaveSingleTieBreakResolution(pendingTieBreakContext)}
                        disabled={!isTieBreakContextOrderReady || savingTieBreakResolutions || isSavingTieBreakContext || !canManageMatches}
                      >
                        {isSavingTieBreakContext ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
                disabled={!isTieBreakResolutionReady || isAnyTieBreakResolutionSaveInFlight || !canManageMatches}
              >
                {savingTieBreakResolutions ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirmar sorteios e gerar mata-mata
              </Button>
            </div>
          </>
        )}

        {(loadingPendingAwardDraws || pendingAwardDrawContexts.length > 0) ? (
          <>
            <div className="flex items-center gap-3 pt-2">
              <div className="h-px flex-1 bg-border/50" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Desempate de premiações</p>
              <div className="h-px flex-1 bg-border/50" />
            </div>

            {loadingPendingAwardDraws ? (
              <div className="space-y-3">
                <Skeleton className="h-28 w-full rounded-2xl" />
              </div>
            ) : (
              <div className="space-y-3">
                {pendingAwardDrawContexts.map((awardDrawContext) => {
                  const orderedPlayerIds = draftAwardDrawOrderByContextKey[awardDrawContext.context_key];
                  const hasAnyPosition = orderedPlayerIds && orderedPlayerIds.some((id) => id !== "");
                  const isSaving = savingAwardDrawByContextKey[awardDrawContext.context_key] == true;
                  const displayedSlots = awardDrawContext.tied_players.map((_, playerIndex) => ({
                    position: playerIndex + 1,
                    playerId: (orderedPlayerIds ?? [])[playerIndex] ?? "",
                  }));
                  const canSave = (displayedSlots[0]?.playerId ?? "") !== "";

                  return (
                    <div key={awardDrawContext.context_key} className="glass-card space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{awardDrawContext.title}</p>
                          <p className="text-xs text-muted-foreground">{awardDrawContext.description}</p>
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
                              value={slot.playerId || EMPTY_AWARD_DRAW_PLAYER_OPTION_VALUE}
                              onValueChange={(value) =>
                                handleUpdateAwardDrawPlayerAtPosition(
                                  awardDrawContext,
                                  slot.position - 1,
                                  value == EMPTY_AWARD_DRAW_PLAYER_OPTION_VALUE ? "" : value,
                                )
                              }
                              disabled={isSaving || !canManageMatches}
                            >
                              <SelectTrigger
                                aria-label={`Jogador na posição ${slot.position} do desempate`}
                                className="app-input-field w-full"
                              >
                                <SelectValue placeholder="Selecione o jogador" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={EMPTY_AWARD_DRAW_PLAYER_OPTION_VALUE}>
                                  Selecione o jogador
                                </SelectItem>
                                {awardDrawContext.tied_players.map((player) => {
                                  const isSelectedInOtherSlot = displayedSlots.some(
                                    (otherSlot) =>
                                      otherSlot.position !== slot.position &&
                                      otherSlot.playerId === player.player_id,
                                  );
                                  return (
                                    <SelectItem
                                      key={`${awardDrawContext.context_key}:${slot.position}:${player.player_id}`}
                                      value={player.player_id}
                                      disabled={isSelectedInOtherSlot}
                                    >
                                      {player.player_name} ({player.team_name}) • {player.metric_value}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleShuffleAwardDraw(awardDrawContext)}
                          disabled={isSaving || !canManageMatches}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          {hasAnyPosition ? "Refazer sorteio" : "Sortear aleatoriamente"}
                        </Button>

                        <Button
                          type="button"
                          onClick={() => void handleSaveAwardDrawResult(awardDrawContext)}
                          disabled={!canSave || isSaving || !canManageMatches}
                        >
                          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
                {pendingTieBreakContexts.length} empate(s) chegaram ao último critério e aguardam sorteio para definir apenas as vagas afetadas do mata-mata.
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
              disabled={loadingPendingTieBreakContexts || isAnyTieBreakResolutionSaveInFlight}
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
            Os dados de {selectedSeasonYear} ficam somente para consulta nesta aba. Alterações continuam restritas ao
            ano atual.
          </p>
        </div>
      ) : null}

      <div className="enter-section space-y-3">
        <SportFilter
          sports={sportsForMatchesFilter}
          selected={matchesSportFilter == ALL_MATCHES_SPORT_FILTER ? null : matchesSportFilter}
          onSelect={(sportFilterValue) => setMatchesSportFilter(sportFilterValue ?? ALL_MATCHES_SPORT_FILTER)}
        />

        <div className="glass-card enter-section p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-stretch xl:justify-between">
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {!isScoreSheetReviewMode && !isTieBreaksMode ? (
                  <div className="xl:min-w-0">
                    <Select
                      value={selectedSeasonYear != null ? String(selectedSeasonYear) : ""}
                      onValueChange={(value) => {
                        const parsedSeasonYear = Number(value);

                        if (!Number.isFinite(parsedSeasonYear) || !onSeasonYearChange) {
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
		              <div className="xl:min-w-0">
		                <Select value={matchesStatusFilter} onValueChange={setMatchesStatusFilter}>
		                  <SelectTrigger className="app-input-field w-full">
		                    <SelectValue placeholder="Filtrar por status" />
		                  </SelectTrigger>
		                  <SelectContent>
		                    <SelectItem value={ALL_MATCHES_STATUS_FILTER}>Geral</SelectItem>
		                    <SelectItem value={MATCHES_STATUS_FILTER_LIVE}>Ao vivo</SelectItem>
		                    <SelectItem value={MATCHES_STATUS_FILTER_FINISHED}>Encerrados</SelectItem>
		                    <SelectItem value={MATCHES_STATUS_FILTER_OPEN}>Em aberto</SelectItem>
		                  </SelectContent>
		                </Select>
		              </div>
		            ) : null}

            <div className="xl:min-w-0">
              <Select value={matchesNaipeFilter} onValueChange={setMatchesNaipeFilter}>
                <SelectTrigger className="app-input-field w-full">
                  <SelectValue placeholder="Filtrar por naipe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MATCHES_NAIPE_FILTER}>Todos os naipes</SelectItem>
                  {NAIPE_OPTIONS.map((naipeOption) => (
                    <SelectItem key={naipeOption} value={naipeOption}>
                      {MATCH_NAIPE_LABELS[naipeOption]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="xl:min-w-0">
              {championshipUsesDivisions ? (
                <Select value={matchesDivisionFilter} onValueChange={setMatchesDivisionFilter}>
                  <SelectTrigger className="app-input-field w-full">
                    <SelectValue placeholder="Filtrar por divisão" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_MATCHES_DIVISION_FILTER}>Todas as divisões</SelectItem>
                    <SelectItem value={TeamDivision.DIVISAO_PRINCIPAL}>
                      {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_PRINCIPAL]}
                    </SelectItem>
                    <SelectItem value={TeamDivision.DIVISAO_ACESSO}>
                      {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_ACESSO]}
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="app-input-field-disabled flex h-10 w-full items-center rounded-xl px-3 py-2 text-sm">
                  Divisão unificada
                </div>
              )}
            </div>

            <div className="xl:min-w-0">
              <Select value={matchesGroupFilter} onValueChange={setMatchesGroupFilter}>
                <SelectTrigger className="app-input-field w-full">
                  <SelectValue placeholder="Filtrar por grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MATCHES_GROUP_FILTER}>Todos os grupos</SelectItem>
                  {groupsForMatchesFilter.map((groupOption) => (
                    <SelectItem key={groupOption.value} value={groupOption.value}>
                      {groupOption.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="xl:min-w-0">
              <Select value={matchesLocationFilter} onValueChange={setMatchesLocationFilter}>
                <SelectTrigger className="app-input-field w-full">
                  <SelectValue placeholder="Filtrar por local" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MATCHES_LOCATION_FILTER}>Todos os locais</SelectItem>
                  {locationsForMatchesFilter.map((locationOption) => (
                    <SelectItem key={locationOption} value={locationOption}>
                      {locationOption}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="xl:min-w-0">
              <Select value={matchesCourtFilter} onValueChange={setMatchesCourtFilter}>
                <SelectTrigger className="app-input-field w-full">
                  <SelectValue placeholder="Filtrar por quadra" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MATCHES_COURT_FILTER}>Todas as quadras</SelectItem>
                  {courtsForMatchesFilter.map((courtOption) => (
                    <SelectItem key={courtOption} value={courtOption}>
                      {courtOption}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="xl:min-w-0">
              <div className="flex items-center gap-2">
                <Select value={matchesTeamFilter} onValueChange={setMatchesTeamFilter}>
                  <SelectTrigger className="app-input-field flex-1">
                    <SelectValue placeholder="Filtrar por atlética" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_MATCHES_TEAM_FILTER}>Todas as atléticas</SelectItem>
                    {teamsForMatchesFilter.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isScoreSheetReviewMode ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setHideReviewedMatches((currentHideReviewedMatches) => !currentHideReviewedMatches)}
                    className={`h-10 w-10 shrink-0 ${hideReviewedMatches ? "app-button-secondary-active hover:!bg-red-600" : ""}`}
                    aria-label={hideReviewedMatches ? "Mostrar jogos revisados também" : "Ocultar jogos já revisados"}
                  >
                    <EyeOff className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>
            </div>

            {!isScoreSheetReviewMode && canManageMatches ? (
              <div className="flex items-center justify-end xl:min-w-[156px]">
                <Button type="button" onClick={handleOpenCreateMatchModal} className="w-full xl:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  Criar jogo
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {!canManageMatches ? (
          <p className="text-sm text-muted-foreground">Perfil em visualização: sem permissão para criar, editar ou remover jogos.</p>
        ) : null}

        {isFetchingMatches ? (
          <div className="space-y-3">
            <section className="glass-card enter-section flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <Skeleton className="h-5 w-48 rounded-lg" />
              <Skeleton className="h-9 w-56 rounded-lg" />
            </section>
            {Array.from({ length: Math.max(3, matchesItemsPerPage) }).map((_, index) => (
              <Skeleton key={`admin-matches-skeleton-${index}`} className="h-52 w-full rounded-2xl" />
            ))}
          </div>
        ) : filteredAndSortedMatches.length > 0 ? (
          <>
	            <div className="glass-card enter-section flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
	              <div className="flex flex-wrap items-center gap-3">
	                {canManageMatches ? (
	                  <label className="flex items-center gap-2 text-sm text-foreground">
	                    <Checkbox checked={selectAllMatchesChecked} onCheckedChange={handleToggleSelectAllMatches} />
	                    <span>Selecionar todos os jogos filtrados</span>
	                  </label>
	                ) : null}

		                {canManageMatches && selectedFilteredMatchCount > 0 && isScoreSheetReviewMode ? (
		                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
		                    <Button
		                      type="button"
		                      variant="outline"
		                      className="w-full sm:w-auto"
		                      onClick={() => void handleBulkUpdateFilteredMatchesReviewState(true)}
		                      disabled={
                            deletingMatches ||
                            applyingBulkAction ||
                            selectedMatchIds.length == 0 ||
                            bulkReviewAction != null ||
                            isSavingReviewState
                          }
		                    >
                          {bulkReviewAction == "MARK" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
		                      Marcar selecionados como revisados
		                    </Button>
		                    <Button
		                      type="button"
		                      variant="outline"
		                      className="w-full sm:w-auto"
		                      onClick={() => void handleBulkUpdateFilteredMatchesReviewState(false)}
		                      disabled={
                            deletingMatches ||
                            applyingBulkAction ||
                            selectedMatchIds.length == 0 ||
                            bulkReviewAction != null ||
                            isSavingReviewState
                          }
		                    >
                          {bulkReviewAction == "UNMARK" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
		                      Desmarcar selecionados
		                    </Button>
		                  </div>
		                ) : null}

	                {canManageMatches && selectedFilteredMatchCount > 0 && !isScoreSheetReviewMode ? (
	                  <div className="flex flex-wrap items-center gap-2">
	                    <Button
	                      type="button"
                      variant="outline"
                      onClick={() => void handleMoveSelectedMatchesToNextChampionshipDay()}
                      disabled={deletingMatches || applyingBulkAction || selectedMatchIds.length == 0}
                    >
                      {applyingBulkAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Mover selecionados para o próximo dia
                    </Button>

	                    <Button
	                      type="button"
	                      variant="outline"
	                      onClick={() => void handleMoveFilteredMatchesToNextChampionshipDay()}
	                      disabled={deletingMatches || applyingBulkAction || filteredAndSortedMatches.length == 0}
	                    >
                        {applyingBulkAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
	                      Mover todos os jogos filtrados
	                    </Button>

	                    <Button
	                      type="button"
	                      variant="destructive"
	                      onClick={handleOpenDeleteSelectedMatchesDialog}
	                      disabled={deletingMatches || applyingBulkAction || selectedMatchIds.length == 0}
	                    >
                        {deletingMatches ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
	                      Excluir selecionados
	                    </Button>
	                  </div>
	                ) : null}

                <p className="text-center text-sm text-muted-foreground lg:text-left">
                  {filteredAndSortedMatches.length} jogo(s) encontrado(s)
                </p>
              </div>

            </div>

	            {paginatedMatches.map((match) => {
	              const matchBracketContext = matchBracketContextByMatchId[match.id];
	              const startedAtLabel = resolveMatchStartedAtLabel(match.start_time, match.status);
	              const tieBreakRuleLabel = resolveMatchTieBreakRuleLabel(match.resolved_tie_breaker_rule);
	              const isSetMatch = match.result_rule == ChampionshipSportResultRule.SETS;
	              const supportsCards = championshipSportSupportsCardsBySportId.get(match.sport_id) == true || match.supports_cards;
	              const isSavingMatchReviewState = savingReviewStateByMatchId[match.id] == true;
	              const setSummary = isSetMatch ? resolveMatchSetSummary(match) : [];
	              const displayedHomeScore =
	                isSetMatch && match.status == MatchStatus.LIVE ? match.current_set_home_score ?? 0 : match.home_score;
	              const displayedAwayScore =
	                isSetMatch && match.status == MatchStatus.LIVE ? match.current_set_away_score ?? 0 : match.away_score;

	              return (
	                <div key={match.id} className="list-item-card list-item-card-hover px-4 py-3">
	                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">

	                    {/* ── COL 1: Modalidade + Badges ── */}
	                    <div className="flex flex-col gap-2 sm:w-44 sm:shrink-0">
	                      {/* Linha: checkbox + modalidade + revisão + (menu mobile) */}
	                      <div className="flex items-center gap-2">
	                        {canManageMatches ? (
	                          <Checkbox
	                            checked={selectedMatchIds.includes(match.id)}
	                            onCheckedChange={(checked) => handleToggleSelectedMatch(match.id, checked)}
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
	
	                          {!isScoreSheetReviewMode && match.status !== MatchStatus.FINISHED ? (
	                            <DropdownMenuItem
	                              onSelect={() => {
	                                handleOpenSwapMatchDialog(match);
	                              }}
	                            >
	                              <RefreshCw className="mr-2 h-4 w-4" />
	                              Trocar jogo
	                            </DropdownMenuItem>
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
	                                onSelect={() => void handleToggleMatchScoreSheetReviewed(match.id, !match.is_score_sheet_reviewed)}
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
	                                    {match.is_walkover ? "Conferir com súmula" : "Revisar súmula e premiações"}
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
	                        <AppBadge tone={resolveMatchNaipeBadgeTone(String(match.naipe))}>
	                          <span className="sm:hidden">
	                            {match.naipe === MatchNaipe.MASCULINO ? "♂" : match.naipe === MatchNaipe.FEMININO ? "♀" : "⚥"}
	                          </span>
	                          <span className="hidden sm:inline">{resolveMatchNaipeLabel(String(match.naipe))}</span>
	                        </AppBadge>

	                        <AppBadge tone={resolveMatchStatusBadgeTone(match.status)}>
	                          {match.status === MatchStatus.LIVE ? (
	                            <Radio className="h-3 w-3 sm:hidden" />
	                          ) : match.status === MatchStatus.FINISHED ? (
	                            <Check className="h-3 w-3 sm:hidden" />
	                          ) : (
	                            <Clock className="h-3 w-3 sm:hidden" />
	                          )}
	                          <span className="hidden sm:inline">{resolveMatchStatusLabel(match.status)}</span>
	                        </AppBadge>

	                        {match.division ? (
	                          <AppBadge tone={TEAM_DIVISION_BADGE_TONES[match.division]}>
	                            <span className="sm:hidden">
	                              {match.division === TeamDivision.DIVISAO_PRINCIPAL ? "D.P." : "D.A."}
	                            </span>
	                            <span className="hidden sm:inline">{TEAM_DIVISION_LABELS[match.division]}</span>
	                          </AppBadge>
	                        ) : null}

	                        {matchBracketContext ? (
	                          <AppBadge tone={AppBadgeTone.NEUTRAL} className="shrink-0 whitespace-nowrap">
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
	                        <span className="min-w-0 flex-1 truncate text-right">{match.home_team?.name}</span>
	                        <span className="shrink-0 text-base font-bold score-text">{displayedHomeScore}</span>
	                        <span className="shrink-0 px-0.5 text-sm text-muted-foreground">×</span>
	                        <span className="shrink-0 text-base font-bold score-text">{displayedAwayScore}</span>
	                        <span className="min-w-0 flex-1 truncate">{match.away_team?.name}</span>
	                      </div>

	                      {/* Sets em árvore — × alinhado com o placar principal */}
	                      {setSummary.length > 0 && match.status != MatchStatus.SCHEDULED ? (
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
	                                      <span className="hidden sm:inline">Set </span>{matchSetItem.setNumber}<span className="sm:hidden">º</span>{": "}
	                                    </span>
	                                    {matchSetItem.homeTeamName}{" "}
	                                  </span>
	                                  <span className="shrink-0 score-text">{matchSetItem.homePoints}</span>
	                                  <span className="shrink-0 px-0.5 text-xs text-muted-foreground">×</span>
	                                  <span className="shrink-0 score-text">{matchSetItem.awayPoints}</span>
	                                  <span className="min-w-0 flex-1 truncate">
	                                    {" "}{matchSetItem.awayTeamName}
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
	                          <span>Local: {match.court_name ? `${match.location} • ${match.court_name}` : match.location}</span>
	                          <span>Fila: {resolveScheduledQueueSummary(match, visualQueuePositionByMatchId[match.id])}</span>
	                          {matchRepresentationByMatchId[match.id] ? (
	                            <span className="break-words">Representação: {matchRepresentationByMatchId[match.id]}</span>
	                          ) : null}
	                          {match.status == MatchStatus.SCHEDULED && estimatedStartTimeByMatchId[match.id] ? (
	                            <span>Horário estimado: {estimatedStartTimeByMatchId[match.id]}</span>
	                          ) : null}
	                          {startedAtLabel ? <span>{startedAtLabel}</span> : null}
	                        </div>
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
	                              <p className="truncate text-xs font-medium text-foreground">Casa</p>
	                              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
	                                <span className="inline-flex items-center gap-1">
	                                  <Square className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
	                                  {match.home_yellow_cards}
	                                </span>
	                                <span className="inline-flex items-center gap-1">
	                                  <Square className="h-2.5 w-2.5 fill-rose-600 text-rose-600 dark:fill-rose-500 dark:text-rose-500" />
	                                  {match.home_red_cards}
	                                </span>
	                              </div>
	                            </div>
	                            <div className="space-y-0.5 text-center">
	                              <p className="truncate text-xs font-medium text-foreground">Visitante</p>
	                              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
	                                <span className="inline-flex items-center gap-1">
	                                  <Square className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
	                                  {match.away_yellow_cards}
	                                </span>
	                                <span className="inline-flex items-center gap-1">
	                                  <Square className="h-2.5 w-2.5 fill-rose-600 text-rose-600 dark:fill-rose-500 dark:text-rose-500" />
	                                  {match.away_red_cards}
	                                </span>
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
	
	                          {!isScoreSheetReviewMode && match.status !== MatchStatus.FINISHED ? (
	                            <DropdownMenuItem
	                              onSelect={() => {
	                                handleOpenSwapMatchDialog(match);
	                              }}
	                            >
	                              <RefreshCw className="mr-2 h-4 w-4" />
	                              Trocar jogo
	                            </DropdownMenuItem>
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
	                                onSelect={() => void handleToggleMatchScoreSheetReviewed(match.id, !match.is_score_sheet_reviewed)}
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
	                                    {match.is_walkover ? "Conferir com súmula" : "Revisar súmula e premiações"}
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
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum jogo encontrado para os filtros selecionados.</p>
        )}
      </div>

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
              Selecione um jogo da mesma quadra para trocar a posição da fila, inclusive em outros dias, sem criar conflito de representação.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Jogo selecionado</p>
              <div className="app-card-muted rounded-xl p-3 text-sm">
                {pendingSwapSourceMatch
                  ? resolveMatchSwapOptionLabel({
                    match: pendingSwapSourceMatch,
                    shouldUseScheduledSlot: true,
                    displaySlot: visualQueuePositionByMatchId[pendingSwapSourceMatch.id],
                  })
                  : "Selecione um jogo para iniciar a troca."}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Trocar com</p>
              <Select
                value={pendingSwapTargetMatchId || EMPTY_SWAP_MATCH_OPTION_VALUE}
                onValueChange={(value) => {
                  setPendingSwapTargetMatchId(value == EMPTY_SWAP_MATCH_OPTION_VALUE ? "" : value);
                }}
                disabled={loadingSwapTargetMatchOptions || eligibleSwapTargetMatchOptions.length == 0 || swappingMatches}
              >
                <SelectTrigger aria-label="Selecionar jogo para troca de fila" className="app-input-field">
                  <SelectValue placeholder="Selecione o jogo para troca" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_SWAP_MATCH_OPTION_VALUE}>Selecione o jogo</SelectItem>
                  {eligibleSwapTargetMatchOptions.map((swapOption) => (
                    <SelectItem key={swapOption.id} value={swapOption.id}>
                      {swapOption.label}
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
            <Button type="button" variant="outline" onClick={handleCloseSwapMatchDialog} disabled={swappingMatches}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirmSwapMatches()}
              disabled={!pendingSwapSourceMatch || !pendingSwapTargetMatchId || loadingSwapTargetMatchOptions || swappingMatches}
            >
              {swappingMatches ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar troca
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
            <AlertDialogCancel disabled={deletingMatches}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDeleteMatchFromDialog()} disabled={deletingMatches}>
              {deletingMatches ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
              Esta ação removerá {selectedMatchIds.length} jogo(s) selecionado(s).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingMatches}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteSelectedMatches()}
              disabled={deletingMatches}
            >
              {deletingMatches ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
        <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden sm:max-h-none sm:w-full sm:max-w-4xl sm:overflow-visible">
          <DialogHeader>
            <DialogTitle>Revisão de súmula e premiações</DialogTitle>
            <DialogDescription>
              Informe autores dos gols e goleiros para contabilizar artilharia e melhor goleiro por naipe/divisão.
            </DialogDescription>
          </DialogHeader>

          {isLoadingActiveScoreSheetAwardsContext || !activeScoreSheetReviewMatch || !activeScoreSheetAwardsDraft ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : (
            <div className="space-y-4 overflow-y-auto pr-1">
              <div className="app-card-muted rounded-xl p-3 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="font-medium">
                    {activeScoreSheetReviewMatch.home_team?.name ?? "Casa"} {activeScoreSheetReviewMatch.home_score} × {activeScoreSheetReviewMatch.away_score} {activeScoreSheetReviewMatch.away_team?.name ?? "Visitante"}
                  </p>
                  <AppBadge tone={resolveMatchNaipeBadgeTone(String(activeScoreSheetReviewMatch.naipe))}>
                    {MATCH_NAIPE_LABELS[activeScoreSheetReviewMatch.naipe as MatchNaipe]}
                  </AppBadge>
                  {activeScoreSheetReviewMatch.division ? (
                    <AppBadge tone={TEAM_DIVISION_BADGE_TONES[activeScoreSheetReviewMatch.division as TeamDivision]}>
                      {TEAM_DIVISION_LABELS[activeScoreSheetReviewMatch.division as TeamDivision]}
                    </AppBadge>
                  ) : null}
                </div>
                {activeScoreSheetAwardsDraft.isWalkover ? (
                  <p className="mt-1 text-xs text-muted-foreground">Jogo com W.O.: não exige premiações individuais para revisão.</p>
                ) : null}
              </div>

              {!activeScoreSheetAwardsDraft.isWalkover ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  {([
                    {
                      key: "home" as const,
                      title: activeScoreSheetReviewMatch.home_team?.name ?? "Time da casa",
                      playerOptions: activeScoreSheetAwardsDraft.homePlayerOptions,
                      goalSelections: activeScoreSheetAwardsDraft.homeGoalSelections,
                      goalkeeperSelections: activeScoreSheetAwardsDraft.homeGoalkeeperSelections,
                      opposingGoalkeeperSelections: activeScoreSheetAwardsDraft.awayGoalkeeperSelections,
                      opposingPlayerOptions: activeScoreSheetAwardsDraft.awayPlayerOptions,
                      newPlayerName: activeScoreSheetAwardsDraft.newHomePlayerName,
                      newPlayerIsGoalkeeper: activeScoreSheetAwardsDraft.newHomePlayerIsGoalkeeper,
                    },
                    {
                      key: "away" as const,
                      title: activeScoreSheetReviewMatch.away_team?.name ?? "Time visitante",
                      playerOptions: activeScoreSheetAwardsDraft.awayPlayerOptions,
                      goalSelections: activeScoreSheetAwardsDraft.awayGoalSelections,
                      goalkeeperSelections: activeScoreSheetAwardsDraft.awayGoalkeeperSelections,
                      opposingGoalkeeperSelections: activeScoreSheetAwardsDraft.homeGoalkeeperSelections,
                      opposingPlayerOptions: activeScoreSheetAwardsDraft.homePlayerOptions,
                      newPlayerName: activeScoreSheetAwardsDraft.newAwayPlayerName,
                      newPlayerIsGoalkeeper: activeScoreSheetAwardsDraft.newAwayPlayerIsGoalkeeper,
                    },
                  ]).map((teamSection) => {
                    // Goleiros do time adversário já selecionados (para usar no dropdown "goleiro que sofreu")
                    const opposingGoalkeeperNames = teamSection.opposingGoalkeeperSelections
                      .filter((s) => s.trim().length > 0)
                      .map((s) => {
                        if (s.startsWith(NEW_PLAYER_OPTION_PREFIX)) {
                          return s.slice(NEW_PLAYER_OPTION_PREFIX.length);
                        }
                        return teamSection.opposingPlayerOptions.find((p) => p.id == s)?.name ?? "";
                      })
                      .filter((name) => name.length > 0);

                    return (
                    <div key={teamSection.key} className="app-card-muted space-y-3 rounded-xl p-3">
                      <p className="text-sm font-semibold">{teamSection.title}</p>

                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cadastrar jogador</p>
                        <RadioGroup
                          value={teamSection.newPlayerIsGoalkeeper ? "goalkeeper" : "player"}
                          onValueChange={(value) => {
                            handleUpdateScoreSheetAwardsDraft(activeScoreSheetReviewMatch.id, (draft) => ({
                              ...draft,
                              newHomePlayerIsGoalkeeper: teamSection.key == "home" ? value == "goalkeeper" : draft.newHomePlayerIsGoalkeeper,
                              newAwayPlayerIsGoalkeeper: teamSection.key == "away" ? value == "goalkeeper" : draft.newAwayPlayerIsGoalkeeper,
                            }));
                          }}
                          className="flex gap-4"
                        >
                          <div className="flex items-center gap-1.5">
                            <RadioGroupItem value="player" id={`${activeScoreSheetReviewMatch.id}-${teamSection.key}-type-player`} />
                            <Label htmlFor={`${activeScoreSheetReviewMatch.id}-${teamSection.key}-type-player`} className="cursor-pointer text-sm font-normal">Jogador</Label>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <RadioGroupItem value="goalkeeper" id={`${activeScoreSheetReviewMatch.id}-${teamSection.key}-type-goalkeeper`} />
                            <Label htmlFor={`${activeScoreSheetReviewMatch.id}-${teamSection.key}-type-goalkeeper`} className="cursor-pointer text-sm font-normal">Goleiro</Label>
                          </div>
                        </RadioGroup>
                        <div className="flex gap-2">
                          <Input
                            ref={(el) => { newPlayerInputRefs.current[`${activeScoreSheetReviewMatch.id}:${teamSection.key}`] = el; }}
                            value={teamSection.newPlayerName}
                            onChange={(event) => {
                              const value = event.target.value;
                              handleUpdateScoreSheetAwardsDraft(activeScoreSheetReviewMatch.id, (draft) => ({
                                ...draft,
                                newHomePlayerName: teamSection.key == "home" ? value : draft.newHomePlayerName,
                                newAwayPlayerName: teamSection.key == "away" ? value : draft.newAwayPlayerName,
                              }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddInlineAwardPlayer(activeScoreSheetReviewMatch.id, teamSection.key);
                              }
                            }}
                            placeholder={teamSection.newPlayerIsGoalkeeper ? "Nome do goleiro" : "Nome do jogador"}
                          />
                          {(() => {
                            const btnState = addPlayerButtonStateByKey[`${activeScoreSheetReviewMatch.id}:${teamSection.key}`];
                            return (
                              <Button
                                type="button"
                                variant={btnState == "success" ? "default" : "outline"}
                                disabled={!!btnState}
                                onClick={() => handleAddInlineAwardPlayer(activeScoreSheetReviewMatch.id, teamSection.key)}
                                className={btnState == "success" ? "bg-green-600 hover:bg-green-600 border-green-600 text-white" : ""}
                              >
                                {btnState == "loading" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {btnState == "success" && <Check className="mr-2 h-4 w-4" />}
                                {!btnState && <Plus className="mr-2 h-4 w-4" />}
                                {btnState == "loading" ? "Adicionando..." : btnState == "success" ? "Adicionado!" : "Adicionar"}
                              </Button>
                            );
                          })()}
                        </div>
                      </div>

                      {teamSection.playerOptions.length > 0 ? (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Jogadores cadastrados</p>
                          {teamSection.playerOptions.map((playerOption) => {
                            const editKey = `${activeScoreSheetReviewMatch.id}:${teamSection.key}`;
                            const editingState = editingPlayerByKey[editKey];
                            const isEditing = editingState?.playerId == playerOption.id;

                            if (isEditing) {
                              return (
                                <div key={playerOption.id} className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2">
                                  <RadioGroup
                                    value={editingState.isGoalkeeper ? "goalkeeper" : "player"}
                                    onValueChange={(value) => {
                                      setEditingPlayerByKey((prev) => ({
                                        ...prev,
                                        [editKey]: editingState ? { ...editingState, isGoalkeeper: value == "goalkeeper" } : null,
                                      }));
                                    }}
                                    className="flex gap-4"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <RadioGroupItem value="player" id={`edit-${playerOption.id}-player`} />
                                      <Label htmlFor={`edit-${playerOption.id}-player`} className="cursor-pointer text-xs font-normal">Jogador</Label>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <RadioGroupItem value="goalkeeper" id={`edit-${playerOption.id}-gk`} />
                                      <Label htmlFor={`edit-${playerOption.id}-gk`} className="cursor-pointer text-xs font-normal">Goleiro</Label>
                                    </div>
                                  </RadioGroup>
                                  <div className="flex gap-1.5">
                                    <Input
                                      value={editingState.name}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setEditingPlayerByKey((prev) => ({
                                          ...prev,
                                          [editKey]: editingState ? { ...editingState, name: v } : null,
                                        }));
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key == "Enter") handleConfirmEditAwardPlayer(activeScoreSheetReviewMatch.id, teamSection.key);
                                        if (e.key == "Escape") setEditingPlayerByKey((prev) => ({ ...prev, [editKey]: null }));
                                      }}
                                      className="h-8 text-sm"
                                      autoFocus
                                    />
                                    <Button
                                      type="button"
                                      size="icon"
                                      className="h-8 w-8 shrink-0"
                                      onClick={() => handleConfirmEditAwardPlayer(activeScoreSheetReviewMatch.id, teamSection.key)}
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 shrink-0"
                                      onClick={() => setEditingPlayerByKey((prev) => ({ ...prev, [editKey]: null }))}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div key={playerOption.id} className="flex items-center gap-1.5 rounded-lg bg-muted/30 px-2.5 py-1.5">
                                <span className="min-w-0 flex-1 truncate text-sm">{playerOption.name}</span>
                                {playerOption.is_goalkeeper ? (
                                  <HandPalm size={13} weight="fill" className="shrink-0 text-primary" />
                                ) : null}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    setEditingPlayerByKey((prev) => ({
                                      ...prev,
                                      [editKey]: { playerId: playerOption.id, name: playerOption.name, isGoalkeeper: playerOption.is_goalkeeper },
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
                                  onClick={() => handleDeleteAwardPlayer(activeScoreSheetReviewMatch.id, teamSection.key, playerOption.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Goleiros</p>
                        {teamSection.goalkeeperSelections.map((gkSelection, gkIndex) => (
                          <div key={`${teamSection.key}-gk-${gkIndex}`} className="flex gap-2">
                            <Select
                              value={gkSelection || EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE}
                              onValueChange={(value) => {
                                const resolvedValue = value == EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE ? "" : value;
                                handleUpdateScoreSheetAwardsDraft(activeScoreSheetReviewMatch.id, (draft) => {
                                  const nextSelections = [...(teamSection.key == "home" ? draft.homeGoalkeeperSelections : draft.awayGoalkeeperSelections)];
                                  nextSelections[gkIndex] = resolvedValue;
                                  return {
                                    ...draft,
                                    homeGoalkeeperSelections: teamSection.key == "home" ? nextSelections : draft.homeGoalkeeperSelections,
                                    awayGoalkeeperSelections: teamSection.key == "away" ? nextSelections : draft.awayGoalkeeperSelections,
                                  };
                                });
                              }}
                            >
                              <SelectTrigger className="app-input-field flex-1" aria-label={`Goleiro ${gkIndex + 1} - ${teamSection.title}`}>
                                <SelectValue placeholder="Selecione o goleiro" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE}>Selecione o goleiro</SelectItem>
                                {teamSection.playerOptions.filter((p) => p.is_goalkeeper).map((playerOption) => (
                                  <SelectItem key={`${teamSection.key}-gk-opt-${playerOption.id}`} value={playerOption.id}>
                                    {playerOption.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {teamSection.goalkeeperSelections.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  handleUpdateScoreSheetAwardsDraft(activeScoreSheetReviewMatch.id, (draft) => {
                                    const nextSelections = (teamSection.key == "home" ? draft.homeGoalkeeperSelections : draft.awayGoalkeeperSelections)
                                      .filter((_, i) => i !== gkIndex);
                                    return {
                                      ...draft,
                                      homeGoalkeeperSelections: teamSection.key == "home" ? nextSelections : draft.homeGoalkeeperSelections,
                                      awayGoalkeeperSelections: teamSection.key == "away" ? nextSelections : draft.awayGoalkeeperSelections,
                                    };
                                  });
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleUpdateScoreSheetAwardsDraft(activeScoreSheetReviewMatch.id, (draft) => ({
                              ...draft,
                              homeGoalkeeperSelections: teamSection.key == "home" ? [...draft.homeGoalkeeperSelections, ""] : draft.homeGoalkeeperSelections,
                              awayGoalkeeperSelections: teamSection.key == "away" ? [...draft.awayGoalkeeperSelections, ""] : draft.awayGoalkeeperSelections,
                            }));
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" /> Adicionar goleiro
                        </Button>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Autores dos gols</p>
                        {teamSection.goalSelections.map((goalSelection, goalIndex) => (
                          <div key={`${teamSection.key}-goal-${goalIndex + 1}`} className="space-y-1">
                            <Select
                              value={goalSelection.scorerId || EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE}
                              onValueChange={(value) => {
                                handleUpdateScoreSheetAwardsDraft(activeScoreSheetReviewMatch.id, (draft) => {
                                  const nextSelections = [...(teamSection.key == "home" ? draft.homeGoalSelections : draft.awayGoalSelections)];
                                  nextSelections[goalIndex] = {
                                    ...nextSelections[goalIndex],
                                    scorerId: value == EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE ? "" : value,
                                  };
                                  return {
                                    ...draft,
                                    homeGoalSelections: teamSection.key == "home" ? nextSelections : draft.homeGoalSelections,
                                    awayGoalSelections: teamSection.key == "away" ? nextSelections : draft.awayGoalSelections,
                                  };
                                });
                              }}
                            >
                              <SelectTrigger className="app-input-field" aria-label={`${teamSection.title} gol ${goalIndex + 1}`}>
                                <SelectValue placeholder={`Gol ${goalIndex + 1}`} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE}>Selecione o jogador</SelectItem>
                                {teamSection.playerOptions.map((playerOption) => (
                                  <SelectItem key={playerOption.id} value={playerOption.id}>
                                    <span className="flex items-center gap-2">
                                      {playerOption.name}
                                      {playerOption.is_goalkeeper && (
                                        <HandPalm size={14} weight="fill" className="text-primary" aria-label="Goleiro" />
                                      )}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {opposingGoalkeeperNames.length > 0 ? (
                              <Select
                                value={goalSelection.concedingGoalkeeperName || EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE}
                                onValueChange={(value) => {
                                  handleUpdateScoreSheetAwardsDraft(activeScoreSheetReviewMatch.id, (draft) => {
                                    const nextSelections = [...(teamSection.key == "home" ? draft.homeGoalSelections : draft.awayGoalSelections)];
                                    nextSelections[goalIndex] = {
                                      ...nextSelections[goalIndex],
                                      concedingGoalkeeperName: value == EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE ? "" : value,
                                    };
                                    return {
                                      ...draft,
                                      homeGoalSelections: teamSection.key == "home" ? nextSelections : draft.homeGoalSelections,
                                      awayGoalSelections: teamSection.key == "away" ? nextSelections : draft.awayGoalSelections,
                                    };
                                  });
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs text-muted-foreground" aria-label={`Goleiro que sofreu o gol ${goalIndex + 1}`}>
                                  <SelectValue placeholder="Goleiro adversário que sofreu" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={EMPTY_SCORE_SHEET_PLAYER_OPTION_VALUE}>Goleiro que sofreu (opcional)</SelectItem>
                                  {opposingGoalkeeperNames.map((name) => (
                                    <SelectItem key={name} value={name}>
                                      {name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={handleCloseScoreSheetReviewDialog} disabled={isSavingActiveScoreSheetAwardsContext}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleSaveScoreSheetAwards()}
              disabled={isLoadingActiveScoreSheetAwardsContext || isSavingActiveScoreSheetAwardsContext || !activeScoreSheetAwardsDraft}
            >
              {isSavingActiveScoreSheetAwardsContext ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar revisão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditReviewConfirmationDialog} onOpenChange={setShowEditReviewConfirmationDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Jogo já revisado na súmula</DialogTitle>
            <DialogDescription>
              Este jogo já estava marcado como conferido. Ao salvar a edição, deseja manter a revisão ou remover a marcação?
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
              {savingEditingMatch ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar e manter revisão
            </Button>

            <Button
              type="button"
              onClick={() => void handleSaveEditingMatch("REMOVE_REVIEW")}
              disabled={savingEditingMatch}
            >
              {savingEditingMatch ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
              Quando a classificação chega ao último critério, apenas as vagas impactadas ficam pendentes até você confirmar a ordem manual desses empates.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
            {pendingTieBreakContexts.map((pendingTieBreakContext) => {
              const orderedTeamIds = resolveNormalizedTieBreakTeamOrder(
                pendingTieBreakContext,
                draftTieBreakTeamIdsByContextKey[pendingTieBreakContext.context_key],
              );
              const isTieBreakContextOrderReady = resolveIsTieBreakTeamOrderReady(pendingTieBreakContext, orderedTeamIds);
              const teamNameByTeamId = pendingTieBreakTeamNameByContextKeyAndTeamId[pendingTieBreakContext.context_key] ?? {};
              const isSavingTieBreakContext = savingTieBreakResolutionByContextKey[pendingTieBreakContext.context_key] == true;
              const displayedTieBreakSlots = pendingTieBreakContext.teams.map((_, teamIndex) => ({
                position: teamIndex + 1,
                teamId: orderedTeamIds[teamIndex] ?? "",
              }));

              return (
                <div key={pendingTieBreakContext.context_key} className="glass-card space-y-3 p-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">{pendingTieBreakContext.title}</h3>
                    <p className="text-sm text-muted-foreground">{pendingTieBreakContext.description}</p>
                  </div>

                  {!isTieBreakContextOrderReady ? (
                    <p className="text-xs font-medium text-amber-500">
                      Defina a ordem completa sem repetir atléticas para confirmar este desempate.
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
                          value={displayedTieBreakSlot.teamId || EMPTY_TIE_BREAK_TEAM_OPTION_VALUE}
                          onValueChange={(value) =>
                            handleUpdateTieBreakContextTeamAtPosition(
                              pendingTieBreakContext,
                              displayedTieBreakSlot.position - 1,
                              value == EMPTY_TIE_BREAK_TEAM_OPTION_VALUE ? "" : value,
                            )
                          }
                          disabled={savingTieBreakResolutions || isSavingTieBreakContext || !canManageMatches}
                        >
                          <SelectTrigger
                            aria-label={`Atlética na posição ${displayedTieBreakSlot.position} do desempate`}
                            className="app-input-field w-full"
                          >
                            <SelectValue placeholder="Selecione a atlética" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={EMPTY_TIE_BREAK_TEAM_OPTION_VALUE}>Selecione a atlética</SelectItem>
                            {pendingTieBreakContext.teams.map((tieBreakTeamOption) => {
                              const isSelectedInOtherPosition = displayedTieBreakSlots.some((displayedTieBreakSlotItem) => {
                                return (
                                  displayedTieBreakSlotItem.position != displayedTieBreakSlot.position &&
                                  displayedTieBreakSlotItem.teamId == tieBreakTeamOption.team_id
                                );
                              });

                              return (
                                <SelectItem
                                  key={`${pendingTieBreakContext.context_key}:${displayedTieBreakSlot.position}:${tieBreakTeamOption.team_id}`}
                                  value={tieBreakTeamOption.team_id}
                                  disabled={isSelectedInOtherPosition}
                                >
                                  {teamNameByTeamId[tieBreakTeamOption.team_id] ?? tieBreakTeamOption.team_name}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleShuffleTieBreakContext(pendingTieBreakContext)}
                      disabled={savingTieBreakResolutions || isSavingTieBreakContext || !canManageMatches}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {orderedTeamIds.some((teamId) => teamId.length > 0) ? "Refazer sorteio" : "Sortear ordem"}
                    </Button>

                    <Button
                      type="button"
                      onClick={() => void handleSaveSingleTieBreakResolution(pendingTieBreakContext)}
                      disabled={!isTieBreakContextOrderReady || savingTieBreakResolutions || isSavingTieBreakContext || !canManageMatches}
                    >
                      {isSavingTieBreakContext ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
              disabled={!isTieBreakResolutionReady || isAnyTieBreakResolutionSaveInFlight || !canManageMatches}
            >
              {savingTieBreakResolutions ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
          <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden sm:max-h-none sm:w-full sm:max-w-4xl sm:overflow-visible">
            <DialogHeader className="shrink-0">
              <DialogTitle>Editar jogo - {selectedChampionship.name}</DialogTitle>
              <DialogDescription>Atualize naipe, modalidade, grupo, placar, status, atléticas, local e o dia da fila do confronto.</DialogDescription>
            </DialogHeader>

            <div className="min-h-0 overflow-y-auto pr-1 sm:overflow-visible sm:pr-0">
              <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Naipe</p>
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
                >
                  {NAIPE_OPTIONS.map((naipeOption) => (
                    <Label
                      key={naipeOption}
                      htmlFor={`edit-match-naipe-${naipeOption}`}
                      className="flex cursor-pointer items-center gap-2 p-0 text-sm font-medium text-foreground"
                    >
                      <RadioGroupItem id={`edit-match-naipe-${naipeOption}`} value={naipeOption} />
                      <span>{MATCH_NAIPE_LABELS[naipeOption]}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contexto do jogo</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Modalidade</p>
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
                      <SelectTrigger aria-label="Modalidade do jogo" className="app-input-field">
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

                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Divisão</p>
                    {championshipUsesDivisions ? (
                      <Select
                        value={editingMatchDraft.division}
                        onValueChange={(value) => {
                          if (!isTeamDivision(value)) {
                            return;
                          }

                          setEditingMatchDraft((currentDraft) =>
                            currentDraft
                              ? {
                                  ...currentDraft,
                                  division: value,
                                  homeTeamId: "",
                                  awayTeamId: "",
                                  selectedGroupOptionValue: "",
                                }
                              : currentDraft,
                          );
                        }}
                      >
                        <SelectTrigger aria-label="Divisão do jogo" className="app-input-field">
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
                    ) : (
                      <div className="app-input-field-disabled flex items-center rounded-xl px-3 py-2 text-sm">
                        Divisão unificada
                      </div>
                    )}
                  </div>

                  {hasConfiguredBracket && !editingKnockoutMatchBinding ? (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Chave vinculada</p>
                      <Select
                        value={editingMatchDraft.selectedGroupOptionValue || EMPTY_GROUP_OPTION_VALUE}
                        onValueChange={(value) =>
                          setEditingMatchDraft((currentDraft) =>
                            currentDraft
                              ? {
                                  ...currentDraft,
                                  selectedGroupOptionValue: value == EMPTY_GROUP_OPTION_VALUE ? "" : value,
                                }
                              : currentDraft,
                          )
                        }
                        disabled={loadingChampionshipBracket}
                      >
                        <SelectTrigger aria-label="Grupo do jogo" className="app-input-field">
                          <SelectValue placeholder="Chave" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_GROUP_OPTION_VALUE}>Sem chave vinculada</SelectItem>
                          {editingMatchGroupOptions.map((groupOption) => (
                            <SelectItem key={groupOption.value} value={groupOption.value}>
                              {resolveChampionshipGroupLabel(groupOption.group_number)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Operação do dia</p>
                <div className={`grid grid-cols-1 gap-3 ${isEditingSportWithTime ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
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
                              }
                            : currentDraft,
                        )
                      }
                      disabled={editingLocationOptions.length == 0}
                    >
                      <SelectTrigger aria-label="Local do jogo" className="app-input-field">
                        <SelectValue placeholder={loadingLocationTemplates ? "Carregando locais" : "Local"} />
                      </SelectTrigger>
                      <SelectContent>
                        {editingLocationOptions.map((locationOption) => (
                          <SelectItem key={locationOption} value={locationOption}>
                            {locationOption}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Dia da fila</p>
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
                    />
                  </div>

                  {isEditingSportWithTime ? (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Horário de início</p>
                      <DateTimePicker
                        value={editingMatchDraft.startTime}
                        onChange={(value) =>
                          setEditingMatchDraft((currentDraft) =>
                            currentDraft
                              ? {
                                  ...currentDraft,
                                  startTime: value,
                                }
                              : currentDraft,
                          )
                        }
                        placeholder="Horário de início"
                        showTime={true}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Select
                      value={editingMatchDraft.status}
                      onValueChange={(value) => {
                        if (value == MatchStatus.SCHEDULED || value == MatchStatus.FINISHED || value == MatchStatus.LIVE) {
                          setEditingMatchDraft((currentDraft) =>
                            currentDraft
                              ? {
                                  ...currentDraft,
                                  status: value,
                                  resolvedTieBreakerRule: value == MatchStatus.FINISHED ? currentDraft.resolvedTieBreakerRule : "",
                                }
                              : currentDraft,
                          );
                        }
                      }}
                    >
                      <SelectTrigger aria-label="Status do jogo" className="app-input-field">
                        <SelectValue placeholder="Status do jogo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={MatchStatus.SCHEDULED}>Agendado</SelectItem>
                        <SelectItem value={MatchStatus.LIVE}>Ao vivo</SelectItem>
                        <SelectItem value={MatchStatus.FINISHED}>Encerrado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Número do jogo</p>
                    <Select
                      value={editingMatchDraft.gameSlot || "EMPTY"}
                      onValueChange={(value) =>
                        setEditingMatchDraft((currentDraft) =>
                          currentDraft
                            ? {
                                ...currentDraft,
                                gameSlot: value === "EMPTY" ? "" : value,
                              }
                            : currentDraft,
                        )
                      }
                    >
                      <SelectTrigger aria-label="Número do jogo" className="app-input-field h-10">
                        <SelectValue placeholder="Nenhum" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EMPTY">Nenhum</SelectItem>
                        {availableQueuePositionsForEditingMatch.map((pos) => (
                          <SelectItem key={pos} value={String(pos)}>
                            Jogo {pos}
                          </SelectItem>
                        ))}
                        <SelectItem value="LAST_IN_QUEUE">Último da fila</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                </div>
              </div>

              {editingMatchDraft.status === MatchStatus.FINISHED ? (
              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Placar</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Casa</p>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={editingMatchDraft.homeScore}
                      onChange={(event) =>
                        setEditingMatchDraft((currentDraft) =>
                          currentDraft
                            ? {
                                ...currentDraft,
                                homeScore: resolveParsedScoreInputValue(event.target.value),
                              }
                            : currentDraft,
                        )
                      }
                      className="app-input-field h-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      aria-label="Placar do mandante"
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Visitante</p>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={editingMatchDraft.awayScore}
                      onChange={(event) =>
                        setEditingMatchDraft((currentDraft) =>
                          currentDraft
                            ? {
                                ...currentDraft,
                                awayScore: resolveParsedScoreInputValue(event.target.value),
                              }
                            : currentDraft,
                        )
                      }
                      className="app-input-field h-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      aria-label="Placar do visitante"
                    />
                  </div>
                </div>
              </div>
              ) : null}

              {isEditingSportWithCards && editingMatchDraft.status === MatchStatus.FINISHED ? (
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cartões</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-2 app-card-muted rounded-xl p-3">
                      <p className="text-xs font-medium text-muted-foreground">Casa</p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-amber-700">Amarelos</p>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={editingMatchDraft.homeYellowCards}
                            onChange={(event) =>
                              setEditingMatchDraft((currentDraft) =>
                                currentDraft
                                  ? {
                                      ...currentDraft,
                                      homeYellowCards: resolveParsedScoreInputValue(event.target.value),
                                    }
                                  : currentDraft,
                              )
                            }
                            className="app-input-field h-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            aria-label="Cartões amarelos da casa"
                          />
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-medium app-text-status-danger">Vermelhos</p>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={editingMatchDraft.homeRedCards}
                            onChange={(event) =>
                              setEditingMatchDraft((currentDraft) =>
                                currentDraft
                                  ? {
                                      ...currentDraft,
                                      homeRedCards: resolveParsedScoreInputValue(event.target.value),
                                    }
                                  : currentDraft,
                              )
                            }
                            className="app-input-field h-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            aria-label="Cartões vermelhos da casa"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 app-card-muted rounded-xl p-3">
                      <p className="text-xs font-medium text-muted-foreground">Visitante</p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-amber-700">Amarelos</p>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={editingMatchDraft.awayYellowCards}
                            onChange={(event) =>
                              setEditingMatchDraft((currentDraft) =>
                                currentDraft
                                  ? {
                                      ...currentDraft,
                                      awayYellowCards: resolveParsedScoreInputValue(event.target.value),
                                    }
                                  : currentDraft,
                              )
                            }
                            className="app-input-field h-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            aria-label="Cartões amarelos do visitante"
                          />
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-medium app-text-status-danger">Vermelhos</p>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={editingMatchDraft.awayRedCards}
                            onChange={(event) =>
                              setEditingMatchDraft((currentDraft) =>
                                currentDraft
                                  ? {
                                      ...currentDraft,
                                      awayRedCards: resolveParsedScoreInputValue(event.target.value),
                                    }
                                  : currentDraft,
                              )
                            }
                            className="app-input-field h-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            aria-label="Cartões vermelhos do visitante"
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
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resultado por set</p>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddEditingMatchSet}>
                      <Plus className="mr-1 h-3 w-3" />
                      Adicionar set
                    </Button>
                  </div>

                  {editingMatchSetsDraft.length == 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhum set registrado. Adicione os sets para definir o resultado por sets.</p>
                  ) : (
                    <div className="space-y-2">
                      {editingMatchSetsDraft.map((matchSetDraft, matchSetIndex) => (
                        <div
                          key={`editing-match-set-${matchSetIndex}`}
                          className="app-card-emphasis grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl p-3"
                        >
                          <span className="text-xs font-semibold text-muted-foreground">Set {matchSetIndex + 1}</span>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={matchSetDraft.home_points}
                            onChange={(event) => handleUpdateEditingMatchSetPoints(matchSetIndex, "home", event.target.value)}
                            className="app-input-field h-10 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            aria-label={`Pontuação da casa no set ${matchSetIndex + 1}`}
                          />
                          <span className="text-sm font-semibold text-muted-foreground">×</span>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={matchSetDraft.away_points}
                            onChange={(event) => handleUpdateEditingMatchSetPoints(matchSetIndex, "away", event.target.value)}
                            className="app-input-field h-10 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            aria-label={`Pontuação visitante no set ${matchSetIndex + 1}`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteEditingMatchSet(matchSetIndex)}
                            aria-label={`Remover set ${matchSetIndex + 1}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Atléticas</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    {editingKnockoutMatchSourceLabels ? (
                      <p className="text-xs text-muted-foreground">
                        Casa: Origem da vaga <span className="font-medium text-foreground">{editingKnockoutMatchSourceLabels.home}</span>
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
                      <SelectTrigger aria-label="Atlética da casa" className="app-input-field">
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
                        Visitante: Origem da vaga <span className="font-medium text-foreground">{editingKnockoutMatchSourceLabels.away}</span>
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
                      <SelectTrigger aria-label="Atlética visitante" className="app-input-field">
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
                <p className="text-xs text-muted-foreground">Carregando dados das chaves desta edição.</p>
              ) : null}

              {hasConfiguredBracket && !loadingChampionshipBracket && editingMatchGroupOptions.length == 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhuma chave disponível para a combinação atual de modalidade, naipe e divisão.
                </p>
              ) : null}

              {editingLocationOptions.length == 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum local cadastrado para seleção. Cadastre um local antes de editar o jogo.</p>
              ) : null}
              </div>
            </div>

            <DialogFooter className="shrink-0">
              <Button type="button" variant="outline" onClick={handleCancelEditingMatch} disabled={savingEditingMatch}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void handleSaveEditingMatch()} disabled={savingEditingMatch || deletingMatches}>
                {savingEditingMatch ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
            <DialogDescription>Defina naipe, modalidade, chave, atléticas, local e o dia da fila do confronto.</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto pr-1 sm:overflow-visible sm:pr-0">
            <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Naipe</p>
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
                      <RadioGroupItem id={`create-match-naipe-${naipeOption}`} value={naipeOption} />
                      <span>{MATCH_NAIPE_LABELS[naipeOption]}</span>
                    </Label>
                  );
                })}
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contexto do jogo</p>
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
                ) : (
                  <div className="app-input-field-disabled flex items-center rounded-xl px-3 py-2 text-sm">
                    Divisão unificada
                  </div>
                )}

                {hasConfiguredBracket ? (
                  <Select
                    value={selectedGroupOptionValue || EMPTY_GROUP_OPTION_VALUE}
                    onValueChange={(value) => {
                      setSelectedGroupOptionValue(value == EMPTY_GROUP_OPTION_VALUE ? "" : value);
                    }}
                    disabled={loadingChampionshipBracket}
                  >
                    <SelectTrigger className="app-input-field">
                      <SelectValue placeholder="Chave" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_GROUP_OPTION_VALUE}>Sem chave vinculada</SelectItem>
                      {createMatchGroupOptions.map((groupOption) => (
                        <SelectItem key={groupOption.value} value={groupOption.value}>
                          {resolveChampionshipGroupLabel(groupOption.group_number)}
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
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Operação do dia</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Select value={location} onValueChange={setLocation} disabled={createLocationOptions.length == 0}>
                  <SelectTrigger className="app-input-field">
                    <SelectValue placeholder={loadingLocationTemplates ? "Carregando locais" : "Local"} />
                  </SelectTrigger>
                  <SelectContent>
                    {createLocationOptions.map((locationOption) => (
                      <SelectItem key={locationOption} value={locationOption}>
                        {locationOption}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <DateTimePicker value={scheduledDate} onChange={setScheduledDate} placeholder="Dia da fila" showTime={false} />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Atléticas</p>
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
              <p className="text-xs text-muted-foreground">Nenhuma modalidade vinculada ao campeonato para este naipe.</p>
            ) : null}

            {hasConfiguredBracket && !loadingChampionshipBracket && createMatchGroupOptions.length == 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma chave disponível para a combinação atual de modalidade, naipe e divisão.
              </p>
            ) : null}

            {createLocationOptions.length == 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum local cadastrado para seleção. Cadastre um local antes de criar o jogo.</p>
            ) : null}
            </div>
          </div>

          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" onClick={() => setShowCreateMatchModal(false)} disabled={creatingMatch}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={loadingLocationTemplates || createLocationOptions.length == 0 || creatingMatch}
            >
              {creatingMatch ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Criar jogo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
