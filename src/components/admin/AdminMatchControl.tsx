import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  Check,
  EyeOff,
  Loader2,
  Minus,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getBracketCourtSports,
  saveMatchSets,
  swapChampionshipKnockoutBracketTeams,
} from "@/domain/championship-brackets/championshipBracket.repository";
import {
  finishChampionshipIndividualSession,
  fetchChampionshipIndividualSessionParticipants,
  reopenChampionshipIndividualSession,
  returnChampionshipIndividualSessionToScheduled,
  startChampionshipIndividualSession,
} from "@/domain/individual-events/championshipIndividualEvents.repository";
import type {
  BracketDayCourtSports,
  MatchSetInput,
} from "@/domain/championship-brackets/championshipBracket.types";
import { useChampionshipIndividualEvents } from "@/hooks/useChampionshipIndividualEvents";
import { useCompetitionTeamDisqualifications } from "@/hooks/useCompetitionTeamDisqualifications";
import type {
  ChampionshipAthlete,
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
  ChampionshipStatus,
  MatchNaipe,
  MatchStatus,
  TeamDivision,
} from "@/lib/enums";
import { SportFilter } from "@/components/SportFilter";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AppBadge } from "@/components/ui/app-badge";
import { AdminIndividualSessionResultsDialog } from "@/components/admin/AdminIndividualSessionResultsDialog";
import { resolveCourtPriorityRank } from "@/components/admin/adminCourtPriority.utils";
import {
  AppPaginationControls,
  DEFAULT_PAGINATION_ITEMS_PER_PAGE,
} from "@/components/ui/app-pagination-controls";
import {
  type MatchBracketContext,
  compareAdminMatchCardOrder,
  MATCH_NAIPE_LABELS,
  TEAM_DIVISION_BADGE_TONES,
  TEAM_DIVISION_LABELS,
  resolveDisplayedMatchQueueLabel,
  resolveBracketGroupFilterOptions,
  resolveMatchNaipeBadgeTone,
  resolveMatchNaipeLabel,
  resolveMatchPenaltyShootoutSummary,
  resolveRecordedMatchSets,
  resolveMatchScheduledDateValue,
  resolveMatchSetSummary,
  resolveVisualQueuePositionByMatchId,
  resolveMatchStartedAtLabel,
  resolveMatchTieBreakRuleLabel,
  isSocietyKnockoutMatch,
} from "@/lib/championship";
import { resolveSportCode } from "@/lib/modalidadeConfig";
import { scrollToTopOfPage } from "@/lib/scroll";
import {
  INDIVIDUAL_SESSION_STATUS_LABELS,
} from "@/lib/individualEvents";

interface Props {
  championshipId: string;
  seasonYear: number;
  matches: Match[];
  isInitialLoading?: boolean;
  championshipStatus: ChampionshipStatus;
  championshipSports: ChampionshipSport[];
  championshipBracketView: ChampionshipBracketView;
  matchBracketContextByMatchId: Record<string, MatchBracketContext>;
  matchRepresentationByMatchId?: Record<string, string>;
  visualQueuePositionByMatchId?: Record<string, number>;
  estimatedStartTimeByMatchId?: Record<string, string>;
  isFetchingMatches?: boolean;
  isFullQueueVisible?: boolean;
  operationalIndividualSessionIds?: string[];
  onFullQueueVisibleChange?: (isVisible: boolean) => void;
  onRefetch: (options?: {
    showLoading?: boolean;
    showFetching?: boolean;
  }) => void | Promise<void>;
  onRefetchChampionshipBracket: () => void;
  canManageScoreboard: boolean;
}

interface MatchControlDraft {
  homeScore: number;
  awayScore: number;
  homeYellowCards: number;
  homeRedCards: number;
  homeBlueCards: number;
  homeTwoMinutePenalties: number;
  awayYellowCards: number;
  awayRedCards: number;
  awayBlueCards: number;
  awayTwoMinutePenalties: number;
}

interface MatchSetEditDraft {
  setNumber: number;
  homePoints: number;
  awayPoints: number;
}

interface MatchPenaltyShootoutDraft {
  homePenaltyScore: string;
  awayPenaltyScore: string;
}

function formatDateOnlyInBrazilianFormat(value: string | null) {
  if (!value) {
    return "Sem data";
  }

  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

type SaveStatus = "saving" | "saved" | "error";
type MatchSide = "home" | "away";
type CardColor = "yellow" | "red" | "blue" | "twoMinute";
type WalkoverMode = "NONE" | "HOME_LOST" | "AWAY_LOST" | "DOUBLE";

const SAVE_STATUS_LABELS: Record<SaveStatus, string> = {
  saving: "Salvando...",
  saved: "Salvo",
  error: "Erro ao salvar",
};

const SAVE_STATUS_CLASS_NAMES: Record<SaveStatus, string> = {
  saving: "text-muted-foreground",
  saved: "text-primary",
  error: "text-destructive",
};

const ALL_CONTROL_NAIPE_FILTER = "ALL_CONTROL_NAIPES";
const ALL_CONTROL_DIVISION_FILTER = "ALL_CONTROL_DIVISIONS";
const ALL_CONTROL_GROUP_FILTER = "ALL_CONTROL_GROUPS";
const ALL_CONTROL_LOCATION_FILTER = "ALL_CONTROL_LOCATIONS";
const ALL_CONTROL_COURT_FILTER = "ALL_CONTROL_COURTS";
const EMPTY_INDIVIDUAL_ENTRIES: readonly [] = [];
const EMPTY_CHAMPIONSHIP_ATHLETES: ChampionshipAthlete[] = [];
const NAIPE_OPTIONS: MatchNaipe[] = [
  MatchNaipe.MASCULINO,
  MatchNaipe.FEMININO,
  MatchNaipe.MISTO,
];

const MATCH_CONTROL_AUTOSAVE_DEBOUNCE_IN_MILLISECONDS = 150;
const MATCH_CONTROL_PERSISTED_DRAFT_STORAGE_KEY =
  "admin_match_control_draft_by_match_id";
const MATCH_CONTROL_PERSISTED_DRAFT_TTL_IN_MILLISECONDS = 10 * 60 * 1000;
const WALKOVER_MODE_NONE = "NONE" as const;
const WALKOVER_MODE_HOME_LOST: WalkoverMode = "HOME_LOST";
const WALKOVER_MODE_AWAY_LOST: WalkoverMode = "AWAY_LOST";
const WALKOVER_MODE_DOUBLE: WalkoverMode = "DOUBLE";
const SCORE_INPUT_CLASS_NAME =
  "score-text h-12 w-16 min-w-16 app-input-field px-1 text-center font-display text-2xl font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function resolveControlQueueCourtKey(
  location?: string | null,
  courtName?: string | null,
) {
  return `${location ?? "SEM_LOCAL"}:${courtName ?? "SEM_QUADRA"}`;
}

function resolveMatchCourtAndDateKey(match: Match): string | null {
  const scheduledDateValue = resolveMatchScheduledDateValue(match);

  if (!scheduledDateValue || !match.court_name) {
    return null;
  }

  return `${scheduledDateValue}:${resolveControlQueueCourtKey(match.location, match.court_name)}`;
}

interface PersistedMatchControlDraftEntry {
  draft: MatchControlDraft;
  updatedAt: number;
}

function areMatchControlDraftsEqual(
  firstDraft: MatchControlDraft,
  secondDraft: MatchControlDraft,
): boolean {
  return (
    firstDraft.homeScore == secondDraft.homeScore &&
    firstDraft.awayScore == secondDraft.awayScore &&
    firstDraft.homeYellowCards == secondDraft.homeYellowCards &&
    firstDraft.homeRedCards == secondDraft.homeRedCards &&
    firstDraft.homeBlueCards == secondDraft.homeBlueCards &&
    firstDraft.homeTwoMinutePenalties == secondDraft.homeTwoMinutePenalties &&
    firstDraft.awayYellowCards == secondDraft.awayYellowCards &&
    firstDraft.awayRedCards == secondDraft.awayRedCards &&
    firstDraft.awayBlueCards == secondDraft.awayBlueCards &&
    firstDraft.awayTwoMinutePenalties == secondDraft.awayTwoMinutePenalties
  );
}

function isMatchControlDraftValue(value: unknown): value is MatchControlDraft {
  if (!value || typeof value != "object" || Array.isArray(value)) {
    return false;
  }

  const draftCandidate = value as Record<string, unknown>;
  const requiredNumericFields = [
    draftCandidate.homeScore,
    draftCandidate.awayScore,
    draftCandidate.homeYellowCards,
    draftCandidate.homeRedCards,
    draftCandidate.homeBlueCards,
    draftCandidate.homeTwoMinutePenalties,
    draftCandidate.awayYellowCards,
    draftCandidate.awayRedCards,
    draftCandidate.awayBlueCards,
    draftCandidate.awayTwoMinutePenalties,
  ];

  return requiredNumericFields.every(
    (fieldValue) =>
      typeof fieldValue == "number" && Number.isFinite(fieldValue),
  );
}

function resolvePersistedWalkoverMode(match: Match): WalkoverMode {
  if (match.is_walkover != true) {
    return WALKOVER_MODE_NONE;
  }

  if (match.is_double_walkover == true) {
    return WALKOVER_MODE_DOUBLE;
  }

  if (match.walkover_loser_team_id == match.home_team_id) {
    return WALKOVER_MODE_HOME_LOST;
  }

  if (match.walkover_loser_team_id == match.away_team_id) {
    return WALKOVER_MODE_AWAY_LOST;
  }

  return WALKOVER_MODE_NONE;
}

function readPersistedMatchControlDraftByMatchId(): Record<
  string,
  PersistedMatchControlDraftEntry
> {
  if (typeof window == "undefined") {
    return {};
  }

  try {
    const persistedPayload = window.sessionStorage.getItem(
      MATCH_CONTROL_PERSISTED_DRAFT_STORAGE_KEY,
    );

    if (!persistedPayload) {
      return {};
    }

    const parsedPayload = JSON.parse(persistedPayload) as Record<
      string,
      unknown
    >;

    if (
      !parsedPayload ||
      typeof parsedPayload != "object" ||
      Array.isArray(parsedPayload)
    ) {
      return {};
    }

    const now = Date.now();
    const sanitizedEntries = Object.entries(parsedPayload).reduce<
      Record<string, PersistedMatchControlDraftEntry>
    >((carry, [matchId, entry]) => {
      if (!entry || typeof entry != "object" || Array.isArray(entry)) {
        return carry;
      }

      const entryCandidate = entry as Record<string, unknown>;
      const updatedAt = entryCandidate.updatedAt;
      const draft = entryCandidate.draft;

      if (
        typeof updatedAt != "number" ||
        !Number.isFinite(updatedAt) ||
        now - updatedAt > MATCH_CONTROL_PERSISTED_DRAFT_TTL_IN_MILLISECONDS
      ) {
        return carry;
      }

      if (!isMatchControlDraftValue(draft)) {
        return carry;
      }

      carry[matchId] = {
        draft,
        updatedAt,
      };

      return carry;
    }, {});

    return sanitizedEntries;
  } catch {
    return {};
  }
}

function writePersistedMatchControlDraftByMatchId(
  persistedEntries: Record<string, PersistedMatchControlDraftEntry>,
): void {
  if (typeof window == "undefined") {
    return;
  }

  try {
    if (Object.keys(persistedEntries).length == 0) {
      window.sessionStorage.removeItem(
        MATCH_CONTROL_PERSISTED_DRAFT_STORAGE_KEY,
      );
      return;
    }

    window.sessionStorage.setItem(
      MATCH_CONTROL_PERSISTED_DRAFT_STORAGE_KEY,
      JSON.stringify(persistedEntries),
    );
  } catch {
    // Ignore storage errors (quota/private mode) and keep runtime state only.
  }
}

function resolveDefaultMatchControlDraft(
  match: Match,
  shouldUseCurrentSetScore: boolean,
): MatchControlDraft {
  return {
    homeScore: shouldUseCurrentSetScore
      ? (match.current_set_home_score ?? 0)
      : match.home_score,
    awayScore: shouldUseCurrentSetScore
      ? (match.current_set_away_score ?? 0)
      : match.away_score,
    homeYellowCards: match.home_yellow_cards,
    homeRedCards: match.home_red_cards,
    homeBlueCards: match.home_blue_cards ?? 0,
    homeTwoMinutePenalties: match.home_two_minute_penalties ?? 0,
    awayYellowCards: match.away_yellow_cards,
    awayRedCards: match.away_red_cards,
    awayBlueCards: match.away_blue_cards ?? 0,
    awayTwoMinutePenalties: match.away_two_minute_penalties ?? 0,
  };
}

function parseNonNegativeNumber(value: string): number {
  const parsedValue = Number(value);

  if (Number.isNaN(parsedValue)) {
    return 0;
  }

  return Math.max(0, parsedValue);
}

function resolvePenaltyShootoutInputValue(value: string): string {
  const trimmedValue = value.trim();

  if (trimmedValue.length == 0) {
    return "";
  }

  return String(Math.max(0, Number.parseInt(trimmedValue, 10) || 0));
}

function resolvePenaltyShootoutScoreValue(value: string): number | null {
  const trimmedValue = value.trim();

  if (trimmedValue.length == 0) {
    return null;
  }

  return Math.max(0, Number.parseInt(trimmedValue, 10) || 0);
}

function resolvePenaltyShootoutWinnerTeamId(
  match: Match,
  homePenaltyScore: number,
  awayPenaltyScore: number,
): string {
  return homePenaltyScore > awayPenaltyScore
    ? match.home_team_id
    : match.away_team_id;
}

function resolveInitialPenaltyShootoutDraft(
  match: Match,
): MatchPenaltyShootoutDraft {
  return {
    homePenaltyScore:
      typeof match.home_penalty_score == "number"
        ? String(match.home_penalty_score)
        : "",
    awayPenaltyScore:
      typeof match.away_penalty_score == "number"
        ? String(match.away_penalty_score)
        : "",
  };
}

function resolveWalkoverWinnerPoints(
  match: Pick<Match, "sport_id">,
  championshipSports: ChampionshipSport[],
): number | null {
  const cs = championshipSports.find((s) => s.sport_id === match.sport_id);
  return cs?.walkover_winner_points ?? null;
}

function resolveMatchUpdatePayload(
  match: Match,
  draft: MatchControlDraft,
  options: {
    supportsCards: boolean;
    isHandball: boolean;
    shouldUseCurrentSetScore: boolean;
  },
) {
  return {
    home_score: options.shouldUseCurrentSetScore
      ? match.home_score
      : Math.max(0, draft.homeScore),
    away_score: options.shouldUseCurrentSetScore
      ? match.away_score
      : Math.max(0, draft.awayScore),
    current_set_home_score: options.shouldUseCurrentSetScore
      ? Math.max(0, draft.homeScore)
      : null,
    current_set_away_score: options.shouldUseCurrentSetScore
      ? Math.max(0, draft.awayScore)
      : null,
    home_yellow_cards: options.supportsCards
      ? Math.max(0, draft.homeYellowCards)
      : 0,
    home_red_cards: options.supportsCards ? Math.max(0, draft.homeRedCards) : 0,
    home_blue_cards: options.isHandball ? Math.max(0, draft.homeBlueCards) : 0,
    home_two_minute_penalties: options.isHandball
      ? Math.max(0, draft.homeTwoMinutePenalties)
      : 0,
    away_yellow_cards: options.supportsCards
      ? Math.max(0, draft.awayYellowCards)
      : 0,
    away_red_cards: options.supportsCards ? Math.max(0, draft.awayRedCards) : 0,
    away_blue_cards: options.isHandball ? Math.max(0, draft.awayBlueCards) : 0,
    away_two_minute_penalties: options.isHandball
      ? Math.max(0, draft.awayTwoMinutePenalties)
      : 0,
  };
}

function isHandballMatch(match: Match): boolean {
  return resolveSportCode(match.sports?.name ?? "") == "HANDEBOL";
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

function resolveAdminMatchControlErrorMessage(
  error: { code?: string; message: string },
  fallbackMessage: string,
): string {
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

  return fallbackMessage;
}

export function AdminMatchControl({
  championshipId,
  seasonYear,
  matches,
  isInitialLoading = false,
  championshipStatus,
  championshipSports,
  championshipBracketView,
  matchBracketContextByMatchId,
  matchRepresentationByMatchId = {},
  visualQueuePositionByMatchId = {},
  estimatedStartTimeByMatchId = {},
  isFetchingMatches = false,
  isFullQueueVisible: isFullQueueVisibleProp = false,
  operationalIndividualSessionIds = [],
  onFullQueueVisibleChange,
  onRefetch,
  onRefetchChampionshipBracket,
  canManageScoreboard,
}: Props) {
  const [matchDraftById, setMatchDraftById] = useState<
    Record<string, MatchControlDraft>
  >({});
  const [isDraftDirtyByMatchId, setIsDraftDirtyByMatchId] = useState<
    Record<string, boolean>
  >({});
  const [matchSetsByMatchId, setMatchSetsByMatchId] = useState<
    Record<string, MatchSetInput[]>
  >({});
  const [editingSetDraftByMatchId, setEditingSetDraftByMatchId] = useState<
    Record<string, MatchSetEditDraft | undefined>
  >({});
  const [saveStatusByMatchId, setSaveStatusByMatchId] = useState<
    Record<string, SaveStatus | undefined>
  >({});
  const [walkoverModeByMatchId, setWalkoverModeByMatchId] = useState<
    Record<string, WalkoverMode | undefined>
  >({});
  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [naipeFilter, setNaipeFilter] = useState<string>(
    ALL_CONTROL_NAIPE_FILTER,
  );
  const [divisionFilter, setDivisionFilter] = useState<string>(
    ALL_CONTROL_DIVISION_FILTER,
  );
  const [groupFilter, setGroupFilter] = useState<string>(
    ALL_CONTROL_GROUP_FILTER,
  );
  const [locationFilter, setLocationFilter] = useState<string>(
    ALL_CONTROL_LOCATION_FILTER,
  );
  const [courtFilter, setCourtFilter] = useState<string>(
    ALL_CONTROL_COURT_FILTER,
  );
  const [showOnlyLiveMatches, setShowOnlyLiveMatches] = useState(false);
  const [showFinishConfirmDialog, setShowFinishConfirmDialog] = useState(false);
  const [pendingFinishMatch, setPendingFinishMatch] = useState<Match | null>(
    null,
  );
  const [showPenaltyShootoutDialog, setShowPenaltyShootoutDialog] =
    useState(false);
  const [pendingPenaltyShootoutMatch, setPendingPenaltyShootoutMatch] =
    useState<Match | null>(null);
  const [penaltyShootoutDraft, setPenaltyShootoutDraft] =
    useState<MatchPenaltyShootoutDraft>({
      homePenaltyScore: "",
      awayPenaltyScore: "",
    });
  const [
    showReturnToScheduledConfirmDialog,
    setShowReturnToScheduledConfirmDialog,
  ] = useState(false);
  const [pendingReturnToScheduledMatch, setPendingReturnToScheduledMatch] =
    useState<Match | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(
    DEFAULT_PAGINATION_ITEMS_PER_PAGE,
  );
  const [localIsFullQueueVisible, setLocalIsFullQueueVisible] = useState(false);
  const [sessionActionLoadingById, setSessionActionLoadingById] = useState<
    Record<string, boolean>
  >({});
  const [sessionParticipantsBySessionId, setSessionParticipantsBySessionId] =
    useState<Record<string, Team[]>>({});
  const [sessionParticipantsLoading, setSessionParticipantsLoading] =
    useState(false);
  const isFullQueueVisible = onFullQueueVisibleChange
    ? isFullQueueVisibleProp
    : localIsFullQueueVisible;

  const [resultsDialogSessionId, setResultsDialogSessionId] = useState<
    string | null
  >(null);
  const [
    showReturnIndividualSessionDialog,
    setShowReturnIndividualSessionDialog,
  ] = useState(false);
  const [
    pendingReturnIndividualSessionId,
    setPendingReturnIndividualSessionId,
  ] = useState<string | null>(null);

  const isDraftDirtyByMatchIdRef = useRef<Record<string, boolean>>({});
  const persistedDraftByMatchIdRef = useRef<
    Record<string, PersistedMatchControlDraftEntry>
  >(readPersistedMatchControlDraftByMatchId());
  const matchByIdRef = useRef<Record<string, Match>>({});
  const onRefetchRef = useRef(onRefetch);
  const matchDraftByIdRef = useRef<Record<string, MatchControlDraft>>({});
  const canManageScoreboardRef = useRef(canManageScoreboard);
  const isSetRuleMatchRef = useRef<(match: Match) => boolean>(() => false);
  const doesMatchSupportCardsRef = useRef<(match: Match) => boolean>(
    () => false,
  );
  const saveTimeoutByMatchIdRef = useRef<
    Record<string, ReturnType<typeof setTimeout> | undefined>
  >({});
  const clearStatusTimeoutByMatchIdRef = useRef<
    Record<string, ReturnType<typeof setTimeout> | undefined>
  >({});
  const hasHandledPaginationScrollRef = useRef(false);
  const hasInitializedPaginationRefetchRef = useRef(false);

  useEffect(() => {
    isDraftDirtyByMatchIdRef.current = isDraftDirtyByMatchId;
  }, [isDraftDirtyByMatchId]);

  useEffect(() => {
    matchDraftByIdRef.current = matchDraftById;
  }, [matchDraftById]);

  useEffect(() => {
    canManageScoreboardRef.current = canManageScoreboard;
  }, [canManageScoreboard]);

  useEffect(() => {
    onRefetchRef.current = onRefetch;
  }, [onRefetch]);

  const persistMatchDraftInStorage = useCallback(
    (matchId: string, draft: MatchControlDraft) => {
      persistedDraftByMatchIdRef.current = {
        ...persistedDraftByMatchIdRef.current,
        [matchId]: {
          draft,
          updatedAt: Date.now(),
        },
      };
      writePersistedMatchControlDraftByMatchId(
        persistedDraftByMatchIdRef.current,
      );
    },
    [],
  );

  const championshipSportResultRuleBySportId = useMemo(() => {
    const map = new Map<string, ChampionshipSportResultRule>();

    championshipSports.forEach((championshipSport) => {
      map.set(championshipSport.sport_id, championshipSport.result_rule);
    });

    return map;
  }, [championshipSports]);

  const isSetRuleMatch = useCallback(
    (match: Match) => {
      return (
        championshipSportResultRuleBySportId.get(match.sport_id) ==
        ChampionshipSportResultRule.SETS
      );
    },
    [championshipSportResultRuleBySportId],
  );

  const championshipSportSupportsCardsBySportId = useMemo(() => {
    const map = new Map<string, boolean>();

    championshipSports.forEach((championshipSport) => {
      map.set(championshipSport.sport_id, championshipSport.supports_cards);
    });

    return map;
  }, [championshipSports]);

  const doesMatchSupportCards = useCallback(
    (match: Match) => {
      return (
        championshipSportSupportsCardsBySportId.get(match.sport_id) == true ||
        match.supports_cards
      );
    },
    [championshipSportSupportsCardsBySportId],
  );

  useEffect(() => {
    isSetRuleMatchRef.current = isSetRuleMatch;
  }, [isSetRuleMatch]);

  useEffect(() => {
    doesMatchSupportCardsRef.current = doesMatchSupportCards;
  }, [doesMatchSupportCards]);

  useEffect(() => {
    matchByIdRef.current = matches.reduce<Record<string, Match>>(
      (carry, match) => {
        carry[match.id] = match;
        return carry;
      },
      {},
    );
  }, [matches]);

  useEffect(() => {
    setMatchDraftById((previousMatchDraftById) => {
      const nextMatchDraftById: Record<string, MatchControlDraft> = {};
      const currentDirtyByMatchId = isDraftDirtyByMatchIdRef.current;
      const now = Date.now();
      const nextPersistedDraftByMatchId = {
        ...persistedDraftByMatchIdRef.current,
      };
      let hasPersistedDraftByMatchIdChanges = false;
      const liveMatches = matches.filter(
        (match) => match.status == MatchStatus.LIVE,
      );
      const currentMatchIds = new Set(liveMatches.map((match) => match.id));

      liveMatches.forEach((match) => {
        const shouldPreserveDirtyDraft =
          currentDirtyByMatchId[match.id] == true;
        const previousMatchDraft = previousMatchDraftById[match.id] ?? null;
        const resolvedDefaultDraft = resolveDefaultMatchControlDraft(
          match,
          isSetRuleMatch(match),
        );
        const persistedDraftEntry = nextPersistedDraftByMatchId[match.id];
        const persistedDraft =
          persistedDraftEntry &&
          now - persistedDraftEntry.updatedAt <=
            MATCH_CONTROL_PERSISTED_DRAFT_TTL_IN_MILLISECONDS
            ? persistedDraftEntry.draft
            : null;

        if (persistedDraftEntry && !persistedDraft) {
          delete nextPersistedDraftByMatchId[match.id];
          hasPersistedDraftByMatchIdChanges = true;
        }

        if (match.status != MatchStatus.LIVE && persistedDraftEntry) {
          delete nextPersistedDraftByMatchId[match.id];
          hasPersistedDraftByMatchIdChanges = true;
        }

        if (shouldPreserveDirtyDraft && previousMatchDraft) {
          nextMatchDraftById[match.id] = previousMatchDraft;
          return;
        }

        if (
          previousMatchDraft &&
          areMatchControlDraftsEqual(previousMatchDraft, resolvedDefaultDraft)
        ) {
          nextMatchDraftById[match.id] = previousMatchDraft;
          return;
        }

        if (
          match.status == MatchStatus.LIVE &&
          persistedDraft &&
          !areMatchControlDraftsEqual(persistedDraft, resolvedDefaultDraft)
        ) {
          nextMatchDraftById[match.id] = persistedDraft;
          return;
        }

        if (
          persistedDraft &&
          areMatchControlDraftsEqual(persistedDraft, resolvedDefaultDraft)
        ) {
          delete nextPersistedDraftByMatchId[match.id];
          hasPersistedDraftByMatchIdChanges = true;
        }

        nextMatchDraftById[match.id] = resolvedDefaultDraft;
      });

      Object.keys(nextPersistedDraftByMatchId).forEach((matchId) => {
        if (!currentMatchIds.has(matchId)) {
          delete nextPersistedDraftByMatchId[matchId];
          hasPersistedDraftByMatchIdChanges = true;
        }
      });

      if (hasPersistedDraftByMatchIdChanges) {
        persistedDraftByMatchIdRef.current = nextPersistedDraftByMatchId;
        writePersistedMatchControlDraftByMatchId(nextPersistedDraftByMatchId);
      }

      return nextMatchDraftById;
    });
  }, [isSetRuleMatch, matches]);

  useEffect(() => {
    setIsDraftDirtyByMatchId((previousDirtyByMatchId) => {
      const nextDirtyByMatchId: Record<string, boolean> = {};

      matches.forEach((match) => {
        if (previousDirtyByMatchId[match.id] == true) {
          nextDirtyByMatchId[match.id] = true;
        }
      });

      return nextDirtyByMatchId;
    });
  }, [matches]);

  useEffect(() => {
    setWalkoverModeByMatchId((previousWalkoverModeByMatchId) => {
      const nextWalkoverModeByMatchId = matches.reduce<
        Record<string, WalkoverMode | undefined>
      >((carry, match) => {
        if (
          match.status != MatchStatus.SCHEDULED &&
          match.status != MatchStatus.LIVE
        ) {
          return carry;
        }

        const selectedWalkoverMode = previousWalkoverModeByMatchId[match.id];
        const persistedWalkoverMode = resolvePersistedWalkoverMode(match);
        const resolvedWalkoverMode =
          selectedWalkoverMode ?? persistedWalkoverMode;
        const isKnockoutMatch =
          matchBracketContextByMatchId[match.id]?.phase ==
          BracketPhase.KNOCKOUT;

        if (
          !resolvedWalkoverMode ||
          resolvedWalkoverMode == WALKOVER_MODE_NONE ||
          (resolvedWalkoverMode == WALKOVER_MODE_DOUBLE && isKnockoutMatch)
        ) {
          return carry;
        }

        carry[match.id] = resolvedWalkoverMode;
        return carry;
      }, {});

      const previousEntries = Object.entries(previousWalkoverModeByMatchId);
      const nextEntries = Object.entries(nextWalkoverModeByMatchId);

      if (previousEntries.length == nextEntries.length) {
        const hasChanges = previousEntries.some(
          ([matchId, walkoverMode]) =>
            walkoverMode != nextWalkoverModeByMatchId[matchId],
        );

        if (!hasChanges) {
          return previousWalkoverModeByMatchId;
        }
      }

      return nextWalkoverModeByMatchId;
    });
  }, [matchBracketContextByMatchId, matches]);

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

  const controlSports = useMemo(() => {
    const sportById = new Map<string, Sport>();

    matches.forEach((match) => {
      if (match.sports && !sportById.has(match.sports.id)) {
        sportById.set(match.sports.id, match.sports);
      }
    });

    championshipSports.forEach((championshipSport) => {
      if (
        individualSportIds.includes(championshipSport.sport_id) &&
        championshipSport.sports &&
        !sportById.has(championshipSport.sports.id)
      ) {
        sportById.set(championshipSport.sports.id, championshipSport.sports);
      }
    });

    return [...sportById.values()].sort((leftSport, rightSport) =>
      leftSport.name.localeCompare(rightSport.name),
    );
  }, [championshipSports, individualSportIds, matches]);

  const {
    sessions: individualSessions,
    events: individualEvents,
    athletes: individualAthletes = EMPTY_CHAMPIONSHIP_ATHLETES,
    entries: individualEntries = EMPTY_INDIVIDUAL_ENTRIES,
    loading: individualEventsLoading,
    refetch: refetchIndividualEvents,
  } = useChampionshipIndividualEvents({
    championshipId,
    seasonYear,
    sportIds: individualSportIds,
    sessionIds: isFullQueueVisible ? undefined : operationalIndividualSessionIds,
    includeAthletes: resultsDialogSessionId != null,
    includeEntries: resultsDialogSessionId != null,
    includeEvents: resultsDialogSessionId != null,
    includeStandings: false,
  });
  const { disqualifications: competitionTeamDisqualifications } =
    useCompetitionTeamDisqualifications({
      championshipId,
      seasonYear,
    });

  const individualDisqualifiedTeamIdsBySessionId = useMemo(() => {
    return Object.fromEntries(
      individualSessions.map((session) => [
        session.id,
        new Set(
          competitionTeamDisqualifications
            .filter(
              (disqualification) =>
                disqualification.sport_id == session.sport_id &&
                disqualification.naipe == session.naipe &&
                disqualification.division == session.division,
            )
            .map((disqualification) => disqualification.team_id),
        ),
      ]),
    ) as Record<string, Set<string>>;
  }, [competitionTeamDisqualifications, individualSessions]);

  const individualDisqualifiedTeamIdsByEventId = useMemo(() => {
    return Object.fromEntries(
      individualEvents.map((event) => [
        event.id,
        event.session_id
          ? (individualDisqualifiedTeamIdsBySessionId[event.session_id] ??
            new Set<string>())
          : new Set<string>(),
      ]),
    ) as Record<string, Set<string>>;
  }, [
    individualDisqualifiedTeamIdsBySessionId,
    individualEvents,
  ]);

  useEffect(() => {
    if (!sportFilter) {
      return;
    }

    const selectedSportStillAvailable = controlSports.some(
      (sport) => sport.id == sportFilter,
    );

    if (!selectedSportStillAvailable) {
      setSportFilter(null);
    }
  }, [controlSports, sportFilter]);

  useEffect(() => {
    if (!resultsDialogSessionId || individualEventsLoading) {
      setSessionParticipantsLoading(false);
      return;
    }

    let isMounted = true;

    setSessionParticipantsLoading(true);

    void fetchChampionshipIndividualSessionParticipants(resultsDialogSessionId)
      .then((response) => {
        if (!isMounted) {
          return;
        }

        setSessionParticipantsBySessionId((current) => ({
          ...current,
          [resultsDialogSessionId]: response.data,
        }));
      })
      .finally(() => {
        if (!isMounted) {
          return;
        }

        setSessionParticipantsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [individualEventsLoading, resultsDialogSessionId]);

  const isInitialControlLoading = isInitialLoading || individualEventsLoading;

  const runSessionAction = useCallback(
    async (
      sessionId: string,
      action: "start" | "finish" | "reopen" | "return",
    ) => {
      if (
        !canManageScoreboard ||
        championshipStatus !== ChampionshipStatus.IN_PROGRESS
      ) {
        if (championshipStatus !== ChampionshipStatus.IN_PROGRESS) {
          toast.error(
            "As sessões individuais só podem ser operadas com o campeonato em andamento.",
          );
        }
        return;
      }

      setSessionActionLoadingById((current) => ({
        ...current,
        [sessionId]: true,
      }));

      const response =
        action == "start"
          ? await startChampionshipIndividualSession(sessionId)
          : action == "finish"
            ? await finishChampionshipIndividualSession(sessionId)
            : action == "reopen"
              ? await reopenChampionshipIndividualSession(sessionId)
              : await returnChampionshipIndividualSessionToScheduled(sessionId);

      setSessionActionLoadingById((current) => ({
        ...current,
        [sessionId]: false,
      }));

      if (response.error) {
        toast.error(response.error.message);
        return;
      }

      await Promise.all([
        refetchIndividualEvents(),
        onRefetch({ showFetching: true }),
      ]);
      onRefetchChampionshipBracket();
    },
    [
      canManageScoreboard,
      championshipStatus,
      onRefetch,
      onRefetchChampionshipBracket,
      refetchIndividualEvents,
    ],
  );

  const liveMatchesCountByCourtAndDateKey = useMemo(() => {
    return matches.reduce<Record<string, number>>((carry, match) => {
      if (match.status != MatchStatus.LIVE) {
        return carry;
      }

      const courtAndDateKey = resolveMatchCourtAndDateKey(match);

      if (!courtAndDateKey) {
        return carry;
      }

      carry[courtAndDateKey] = (carry[courtAndDateKey] ?? 0) + 1;
      return carry;
    }, {});
  }, [matches]);

  // Preferências de quadra lidas da tabela (fonte da verdade pós-geração),
  // não do payload_snapshot, que não reflete edições feitas na aba Agenda.
  const [bracketCourtSportsDays, setBracketCourtSportsDays] = useState<
    BracketDayCourtSports[]
  >([]);
  const bracketEditionId = championshipBracketView.edition?.id ?? null;

  useEffect(() => {
    if (!bracketEditionId) {
      setBracketCourtSportsDays([]);
      return;
    }

    let isActive = true;

    getBracketCourtSports(bracketEditionId).then(({ data, error }) => {
      if (isActive && !error) {
        setBracketCourtSportsDays(data);
      }
    });

    return () => {
      isActive = false;
    };
  }, [bracketEditionId]);

  const suggestedCourtByMatchId = useMemo(() => {
    const courtSportsDayByDate = bracketCourtSportsDays.reduce<
      Record<string, BracketDayCourtSports>
    >((carry, day) => {
      carry[day.event_date] = day;
      return carry;
    }, {});

    return matches.reduce<Record<string, string>>((carry, match) => {
      if (match.status != MatchStatus.SCHEDULED || match.court_name) {
        return carry;
      }

      const scheduledDateValue = resolveMatchScheduledDateValue(match);
      const courtSportsDay = scheduledDateValue
        ? courtSportsDayByDate[scheduledDateValue]
        : null;

      if (!courtSportsDay) {
        return carry;
      }

      const compatibleCourts = courtSportsDay.locations.flatMap((location) =>
        location.courts
          .map((court) => ({
            court,
            location,
            courtSport: court.sports.find(
              (sportEntry) => sportEntry.sport_id == match.sport_id,
            ),
          }))
          .filter((candidate) => candidate.courtSport != null),
      );

      const hasAnyPreference = compatibleCourts.some(
        (candidate) =>
          candidate.courtSport?.preferred_naipe != null ||
          candidate.courtSport?.preferred_division != null,
      );

      if (compatibleCourts.length < 2 || !hasAnyPreference) {
        return carry;
      }

      const rankedCourts = [...compatibleCourts].sort((left, right) => {
        const rankDifference =
          resolveCourtPriorityRank({
            matchNaipe: match.naipe,
            matchDivision: match.division,
            preferredNaipe: left.courtSport?.preferred_naipe ?? null,
            preferredDivision: left.courtSport?.preferred_division ?? null,
          }) -
          resolveCourtPriorityRank({
            matchNaipe: match.naipe,
            matchDivision: match.division,
            preferredNaipe: right.courtSport?.preferred_naipe ?? null,
            preferredDivision: right.courtSport?.preferred_division ?? null,
          });

        if (rankDifference != 0) {
          return rankDifference;
        }

        return left.court.position - right.court.position;
      });

      const suggestedCourt = rankedCourts[0];
      carry[match.id] =
        `${suggestedCourt.court.name} • ${suggestedCourt.location.name}`;
      return carry;
    }, {});
  }, [bracketCourtSportsDays, matches]);

  // match_id → { id, competition_id, round_number } para lookup nos renders do KO
  const bracketMatchByMatchId = useMemo(() => {
    const map: Record<
      string,
      { id: string; competition_id: string; round_number: number }
    > = {};
    for (const competition of championshipBracketView.competitions ?? []) {
      for (const km of competition.knockout_matches ?? []) {
        if (km.match_id) {
          map[km.match_id] = {
            id: km.id,
            competition_id: competition.id,
            round_number: km.round_number,
          };
        }
      }
    }
    return map;
  }, [championshipBracketView]);

  // competition_id → max round_number (= primeiro round jogado, ex: quartas numa chave de 8)
  const maxRoundByCompetitionId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const competition of championshipBracketView.competitions ?? []) {
      const max = Math.max(
        0,
        ...(competition.knockout_matches ?? []).map((km) => km.round_number),
      );
      if (max > 0) map[competition.id] = max;
    }
    return map;
  }, [championshipBracketView]);

  // competition_id → lista de { id, name } das equipes no primeiro round (para o seletor de troca)
  const firstRoundTeamsByCompetitionId = useMemo(() => {
    const map: Record<string, { id: string; name: string }[]> = {};
    for (const competition of championshipBracketView.competitions ?? []) {
      const maxRound = maxRoundByCompetitionId[competition.id];
      if (!maxRound) continue;
      const teams: { id: string; name: string }[] = [];
      for (const km of competition.knockout_matches ?? []) {
        if (km.round_number !== maxRound) continue;
        if (km.home_team_id && km.home_team_name)
          teams.push({ id: km.home_team_id, name: km.home_team_name });
        if (km.away_team_id && km.away_team_name)
          teams.push({ id: km.away_team_id, name: km.away_team_name });
      }
      map[competition.id] = teams;
    }
    return map;
  }, [championshipBracketView, maxRoundByCompetitionId]);

  useEffect(() => {
    const resolvedSetsByMatchId = matches.reduce<
      Record<string, MatchSetInput[]>
    >((carry, match) => {
      if (!isSetRuleMatch(match)) {
        return carry;
      }

      carry[match.id] = resolveRecordedMatchSets(match);
      return carry;
    }, {});

    setMatchSetsByMatchId(resolvedSetsByMatchId);
  }, [isSetRuleMatch, matches]);

  useEffect(() => {
    const saveTimeoutByMatchId = saveTimeoutByMatchIdRef.current;
    const clearStatusTimeoutByMatchId = clearStatusTimeoutByMatchIdRef.current;

    return () => {
      Object.entries(isDraftDirtyByMatchIdRef.current).forEach(
        ([matchId, isDirty]) => {
          if (!isDirty || !canManageScoreboardRef.current) {
            return;
          }

          const timeoutReference = saveTimeoutByMatchId[matchId];

          if (timeoutReference) {
            clearTimeout(timeoutReference);
          }
          saveTimeoutByMatchId[matchId] = undefined;

          const match = matchByIdRef.current[matchId];
          const matchDraft = matchDraftByIdRef.current[matchId];

          if (!match || !matchDraft) {
            return;
          }

          persistMatchDraftInStorage(match.id, matchDraft);

          void supabase
            .from("matches")
            .update(
              resolveMatchUpdatePayload(match, matchDraft, {
                supportsCards: doesMatchSupportCardsRef.current(match),
                isHandball: isHandballMatch(match),
                shouldUseCurrentSetScore: isSetRuleMatchRef.current(match),
              }),
            )
            .eq("id", match.id);
        },
      );

      Object.values(saveTimeoutByMatchId).forEach((timeoutReference) => {
        if (timeoutReference) {
          clearTimeout(timeoutReference);
        }
      });

      Object.values(clearStatusTimeoutByMatchId).forEach((timeoutReference) => {
        if (timeoutReference) {
          clearTimeout(timeoutReference);
        }
      });
    };
  }, [persistMatchDraftInStorage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    courtFilter,
    divisionFilter,
    groupFilter,
    itemsPerPage,
    locationFilter,
    matches.length,
    naipeFilter,
    showOnlyLiveMatches,
    sportFilter,
  ]);

  useEffect(() => {
    if (!hasInitializedPaginationRefetchRef.current) {
      hasInitializedPaginationRefetchRef.current = true;
      return;
    }

    void onRefetchRef.current({ showFetching: true });

    const refetchConfirmationTimeout = setTimeout(() => {
      void onRefetchRef.current({ showFetching: true });
    }, 400);

    return () => {
      clearTimeout(refetchConfirmationTimeout);
    };
  }, [currentPage, itemsPerPage]);

  const getMatchDraft = useCallback(
    (match: Match) => {
      return (
        matchDraftById[match.id] ??
        resolveDefaultMatchControlDraft(match, isSetRuleMatch(match))
      );
    },
    [isSetRuleMatch, matchDraftById],
  );

  const resolveClosedMatchSets = useCallback(
    (match: Match) => {
      return matchSetsByMatchId[match.id] ?? resolveRecordedMatchSets(match);
    },
    [matchSetsByMatchId],
  );

  const resolveDisplayedSetWins = useCallback(
    (match: Match) => {
      const closedMatchSets = resolveClosedMatchSets(match);

      if (closedMatchSets.length > 0) {
        return resolveSetWins(closedMatchSets);
      }

      return {
        home_sets: match.home_score,
        away_sets: match.away_score,
      };
    },
    [resolveClosedMatchSets],
  );

  const resolveSelectedWalkoverMode = useCallback(
    (match: Match) => {
      return walkoverModeByMatchId[match.id] ?? WALKOVER_MODE_NONE;
    },
    [walkoverModeByMatchId],
  );

  const clearWalkoverSelection = useCallback((matchId: string) => {
    setWalkoverModeByMatchId((currentWalkoverModeByMatchId) => {
      if (!currentWalkoverModeByMatchId[matchId]) {
        return currentWalkoverModeByMatchId;
      }

      const nextWalkoverModeByMatchId = { ...currentWalkoverModeByMatchId };
      delete nextWalkoverModeByMatchId[matchId];
      return nextWalkoverModeByMatchId;
    });
  }, []);

  const openPenaltyShootoutDialog = useCallback((match: Match) => {
    setPendingPenaltyShootoutMatch(match);
    setPenaltyShootoutDraft(resolveInitialPenaltyShootoutDraft(match));
    setShowPenaltyShootoutDialog(true);
  }, []);

  const closePenaltyShootoutDialog = useCallback(() => {
    setShowPenaltyShootoutDialog(false);
    setPendingPenaltyShootoutMatch(null);
    setPenaltyShootoutDraft({
      homePenaltyScore: "",
      awayPenaltyScore: "",
    });
  }, []);

  const handleUpdateWalkoverMode = useCallback(
    (match: Match, walkoverMode: WalkoverMode) => {
      const isKnockoutMatch =
        matchBracketContextByMatchId[match.id]?.phase == BracketPhase.KNOCKOUT;

      if (
        walkoverMode != WALKOVER_MODE_NONE &&
        walkoverMode != WALKOVER_MODE_HOME_LOST &&
        walkoverMode != WALKOVER_MODE_AWAY_LOST &&
        walkoverMode != WALKOVER_MODE_DOUBLE
      ) {
        return;
      }

      if (walkoverMode == WALKOVER_MODE_DOUBLE && isKnockoutMatch) {
        return;
      }

      setWalkoverModeByMatchId((currentWalkoverModeByMatchId) => {
        if (walkoverMode == WALKOVER_MODE_NONE) {
          if (!currentWalkoverModeByMatchId[match.id]) {
            return currentWalkoverModeByMatchId;
          }

          const nextWalkoverModeByMatchId = { ...currentWalkoverModeByMatchId };
          delete nextWalkoverModeByMatchId[match.id];
          return nextWalkoverModeByMatchId;
        }

        if (currentWalkoverModeByMatchId[match.id] == walkoverMode) {
          return currentWalkoverModeByMatchId;
        }

        return {
          ...currentWalkoverModeByMatchId,
          [match.id]: walkoverMode,
        };
      });
    },
    [matchBracketContextByMatchId],
  );

  const hasRecordedProgressForWalkover = useCallback(
    (match: Match) => {
      const currentMatchDraft = getMatchDraft(match);

      if (isSetRuleMatch(match)) {
        const closedMatchSets = resolveClosedMatchSets(match);

        return (
          closedMatchSets.length > 0 ||
          currentMatchDraft.homeScore > 0 ||
          currentMatchDraft.awayScore > 0 ||
          (match.current_set_home_score ?? 0) > 0 ||
          (match.current_set_away_score ?? 0) > 0 ||
          match.home_score > 0 ||
          match.away_score > 0
        );
      }

      return (
        currentMatchDraft.homeScore > 0 ||
        currentMatchDraft.awayScore > 0 ||
        match.home_score > 0 ||
        match.away_score > 0
      );
    },
    [getMatchDraft, isSetRuleMatch, resolveClosedMatchSets],
  );

  const setMatchSaveStatus = (
    matchId: string,
    saveStatus: SaveStatus | undefined,
  ) => {
    setSaveStatusByMatchId((previousStatusByMatchId) => ({
      ...previousStatusByMatchId,
      [matchId]: saveStatus,
    }));
  };

  const scheduleClearSavedStatus = (matchId: string) => {
    const clearStatusTimeoutReference =
      clearStatusTimeoutByMatchIdRef.current[matchId];

    if (clearStatusTimeoutReference) {
      clearTimeout(clearStatusTimeoutReference);
    }

    clearStatusTimeoutByMatchIdRef.current[matchId] = setTimeout(() => {
      setMatchSaveStatus(matchId, undefined);
    }, 1200);
  };

  const setDraftDirty = (matchId: string, isDirty: boolean) => {
    setIsDraftDirtyByMatchId((currentDirtyByMatchId) => {
      if (isDirty) {
        if (currentDirtyByMatchId[matchId] == true) {
          return currentDirtyByMatchId;
        }

        return {
          ...currentDirtyByMatchId,
          [matchId]: true,
        };
      }

      if (currentDirtyByMatchId[matchId] != true) {
        return currentDirtyByMatchId;
      }

      const nextDirtyByMatchId = { ...currentDirtyByMatchId };
      delete nextDirtyByMatchId[matchId];
      return nextDirtyByMatchId;
    });
  };

  const persistMatchDraft = async (
    match: Match,
    matchDraft: MatchControlDraft,
  ) => {
    if (!canManageScoreboard) {
      return false;
    }

    setMatchSaveStatus(match.id, "saving");

    const { error } = await supabase
      .from("matches")
      .update(
        resolveMatchUpdatePayload(match, matchDraft, {
          supportsCards: doesMatchSupportCards(match),
          isHandball: isHandballMatch(match),
          shouldUseCurrentSetScore: isSetRuleMatch(match),
        }),
      )
      .eq("id", match.id);

    if (error) {
      setMatchSaveStatus(match.id, "error");
      toast.error(resolveAdminMatchControlErrorMessage(error, error.message), {
        id: "admin-match-control-migration-required",
      });
      return false;
    }

    setDraftDirty(match.id, false);
    setMatchSaveStatus(match.id, "saved");
    scheduleClearSavedStatus(match.id);
    return true;
  };

  const scheduleAutosave = (match: Match, matchDraft: MatchControlDraft) => {
    if (!canManageScoreboard) {
      return;
    }

    const saveTimeoutReference = saveTimeoutByMatchIdRef.current[match.id];

    if (saveTimeoutReference) {
      clearTimeout(saveTimeoutReference);
    }

    saveTimeoutByMatchIdRef.current[match.id] = setTimeout(() => {
      saveTimeoutByMatchIdRef.current[match.id] = undefined;
      void persistMatchDraft(match, matchDraft);
    }, MATCH_CONTROL_AUTOSAVE_DEBOUNCE_IN_MILLISECONDS);
  };

  const updateScore = (match: Match, side: MatchSide, delta: number) => {
    if (match.status != MatchStatus.LIVE) {
      return;
    }

    setMatchDraftById((previousMatchDraftById) => {
      const currentMatchDraft =
        previousMatchDraftById[match.id] ??
        resolveDefaultMatchControlDraft(match, isSetRuleMatch(match));
      const nextMatchDraft = {
        ...currentMatchDraft,
        homeScore:
          side == "home"
            ? Math.max(0, currentMatchDraft.homeScore + delta)
            : currentMatchDraft.homeScore,
        awayScore:
          side == "away"
            ? Math.max(0, currentMatchDraft.awayScore + delta)
            : currentMatchDraft.awayScore,
      };

      setDraftDirty(match.id, true);
      persistMatchDraftInStorage(match.id, nextMatchDraft);
      scheduleAutosave(match, nextMatchDraft);

      return {
        ...previousMatchDraftById,
        [match.id]: nextMatchDraft,
      };
    });
  };

  const updateManualInputScore = (
    match: Match,
    side: MatchSide,
    value: string,
  ) => {
    if (match.status != MatchStatus.LIVE) {
      return;
    }

    const parsedValue = parseNonNegativeNumber(value);

    setMatchDraftById((previousMatchDraftById) => {
      const currentMatchDraft =
        previousMatchDraftById[match.id] ??
        resolveDefaultMatchControlDraft(match, isSetRuleMatch(match));
      const nextMatchDraft = {
        ...currentMatchDraft,
        homeScore: side == "home" ? parsedValue : currentMatchDraft.homeScore,
        awayScore: side == "away" ? parsedValue : currentMatchDraft.awayScore,
      };

      setDraftDirty(match.id, true);
      persistMatchDraftInStorage(match.id, nextMatchDraft);
      scheduleAutosave(match, nextMatchDraft);

      return {
        ...previousMatchDraftById,
        [match.id]: nextMatchDraft,
      };
    });
  };

  const updateCards = (
    match: Match,
    side: MatchSide,
    color: CardColor,
    delta: number,
  ) => {
    if (match.status != MatchStatus.LIVE || !doesMatchSupportCards(match)) {
      return;
    }

    setMatchDraftById((previousMatchDraftById) => {
      const currentMatchDraft =
        previousMatchDraftById[match.id] ??
        resolveDefaultMatchControlDraft(match, isSetRuleMatch(match));
      const nextMatchDraft = { ...currentMatchDraft };

      if (side == "home" && color == "yellow") {
        nextMatchDraft.homeYellowCards = Math.max(
          0,
          currentMatchDraft.homeYellowCards + delta,
        );
      } else if (side == "home" && color == "red") {
        nextMatchDraft.homeRedCards = Math.max(
          0,
          currentMatchDraft.homeRedCards + delta,
        );
      } else if (side == "home" && color == "blue") {
        nextMatchDraft.homeBlueCards = Math.max(
          0,
          currentMatchDraft.homeBlueCards + delta,
        );
      } else if (side == "home" && color == "twoMinute") {
        nextMatchDraft.homeTwoMinutePenalties = Math.max(
          0,
          currentMatchDraft.homeTwoMinutePenalties + delta,
        );
      } else if (side == "away" && color == "yellow") {
        nextMatchDraft.awayYellowCards = Math.max(
          0,
          currentMatchDraft.awayYellowCards + delta,
        );
      } else if (side == "away" && color == "red") {
        nextMatchDraft.awayRedCards = Math.max(
          0,
          currentMatchDraft.awayRedCards + delta,
        );
      } else if (side == "away" && color == "blue") {
        nextMatchDraft.awayBlueCards = Math.max(
          0,
          currentMatchDraft.awayBlueCards + delta,
        );
      } else {
        nextMatchDraft.awayTwoMinutePenalties = Math.max(
          0,
          currentMatchDraft.awayTwoMinutePenalties + delta,
        );
      }

      setDraftDirty(match.id, true);
      persistMatchDraftInStorage(match.id, nextMatchDraft);
      scheduleAutosave(match, nextMatchDraft);

      return {
        ...previousMatchDraftById,
        [match.id]: nextMatchDraft,
      };
    });
  };

  const updateManualInputCards = (
    match: Match,
    side: MatchSide,
    color: CardColor,
    value: string,
  ) => {
    if (match.status != MatchStatus.LIVE || !doesMatchSupportCards(match)) {
      return;
    }

    const parsedValue = parseNonNegativeNumber(value);

    setMatchDraftById((previousMatchDraftById) => {
      const currentMatchDraft =
        previousMatchDraftById[match.id] ??
        resolveDefaultMatchControlDraft(match, isSetRuleMatch(match));
      const nextMatchDraft = { ...currentMatchDraft };

      if (side == "home" && color == "yellow") {
        nextMatchDraft.homeYellowCards = parsedValue;
      } else if (side == "home" && color == "red") {
        nextMatchDraft.homeRedCards = parsedValue;
      } else if (side == "home" && color == "blue") {
        nextMatchDraft.homeBlueCards = parsedValue;
      } else if (side == "home" && color == "twoMinute") {
        nextMatchDraft.homeTwoMinutePenalties = parsedValue;
      } else if (side == "away" && color == "yellow") {
        nextMatchDraft.awayYellowCards = parsedValue;
      } else if (side == "away" && color == "red") {
        nextMatchDraft.awayRedCards = parsedValue;
      } else if (side == "away" && color == "blue") {
        nextMatchDraft.awayBlueCards = parsedValue;
      } else {
        nextMatchDraft.awayTwoMinutePenalties = parsedValue;
      }

      setDraftDirty(match.id, true);
      persistMatchDraftInStorage(match.id, nextMatchDraft);
      scheduleAutosave(match, nextMatchDraft);

      return {
        ...previousMatchDraftById,
        [match.id]: nextMatchDraft,
      };
    });
  };

  const handleStartEditingRecordedSet = (
    matchId: string,
    matchSet: MatchSetInput,
  ) => {
    setEditingSetDraftByMatchId((currentEditingSetDraftByMatchId) => ({
      ...currentEditingSetDraftByMatchId,
      [matchId]: {
        setNumber: matchSet.set_number,
        homePoints: matchSet.home_points,
        awayPoints: matchSet.away_points,
      },
    }));
  };

  const handleCancelEditingRecordedSet = (matchId: string) => {
    setEditingSetDraftByMatchId((currentEditingSetDraftByMatchId) => ({
      ...currentEditingSetDraftByMatchId,
      [matchId]: undefined,
    }));
  };

  const handleDeleteRecordedSet = async (match: Match, setNumber: number) => {
    if (
      !canManageScoreboard ||
      match.status != MatchStatus.LIVE ||
      !isSetRuleMatch(match)
    ) {
      return;
    }

    const closedMatchSets = resolveClosedMatchSets(match);
    const nextMatchSets = closedMatchSets.filter(
      (matchSet) => matchSet.set_number != setNumber,
    );
    const resolvedSetWins = await persistMatchSets(match, nextMatchSets);

    if (!resolvedSetWins) {
      return;
    }

    const { error } = await supabase
      .from("matches")
      .update({
        home_score: resolvedSetWins.home_sets,
        away_score: resolvedSetWins.away_sets,
      })
      .eq("id", match.id);

    if (error) {
      toast.error(resolveAdminMatchControlErrorMessage(error, error.message), {
        id: "admin-match-control-migration-required",
      });
      return;
    }

    setMatchSetsByMatchId((currentMatchSetsByMatchId) => ({
      ...currentMatchSetsByMatchId,
      [match.id]: nextMatchSets,
    }));
    handleCancelEditingRecordedSet(match.id);
    toast.success(`Set ${setNumber} removido.`);
    onRefetch();
  };

  const handleUpdateEditingRecordedSetScore = (
    matchId: string,
    side: MatchSide,
    value: string,
  ) => {
    const parsedValue = parseNonNegativeNumber(value);

    setEditingSetDraftByMatchId((currentEditingSetDraftByMatchId) => {
      const currentEditingSetDraft = currentEditingSetDraftByMatchId[matchId];

      if (!currentEditingSetDraft) {
        return currentEditingSetDraftByMatchId;
      }

      return {
        ...currentEditingSetDraftByMatchId,
        [matchId]: {
          ...currentEditingSetDraft,
          homePoints:
            side == "home" ? parsedValue : currentEditingSetDraft.homePoints,
          awayPoints:
            side == "away" ? parsedValue : currentEditingSetDraft.awayPoints,
        },
      };
    });
  };

  const persistMatchSets = async (match: Match, matchSets: MatchSetInput[]) => {
    const { error } = await saveMatchSets(match.id, matchSets);

    if (error) {
      toast.error(resolveAdminMatchControlErrorMessage(error, error.message), {
        id: "admin-match-control-migration-required",
      });
      return null;
    }

    return resolveSetWins(matchSets);
  };

  const handleSaveEditedRecordedSet = async (match: Match) => {
    if (
      !canManageScoreboard ||
      match.status != MatchStatus.LIVE ||
      !isSetRuleMatch(match)
    ) {
      return;
    }

    const editingSetDraft = editingSetDraftByMatchId[match.id];

    if (!editingSetDraft) {
      return;
    }

    if (editingSetDraft.homePoints == editingSetDraft.awayPoints) {
      toast.error("Um set não pode terminar empatado.");
      return;
    }

    if (editingSetDraft.homePoints == 0 && editingSetDraft.awayPoints == 0) {
      toast.error("Informe um placar válido para o set.");
      return;
    }

    const closedMatchSets = resolveClosedMatchSets(match);
    const nextMatchSets = closedMatchSets.map((matchSet) => {
      if (matchSet.set_number != editingSetDraft.setNumber) {
        return matchSet;
      }

      return {
        ...matchSet,
        home_points: editingSetDraft.homePoints,
        away_points: editingSetDraft.awayPoints,
      };
    });
    const resolvedSetWins = await persistMatchSets(match, nextMatchSets);

    if (!resolvedSetWins) {
      return;
    }

    const { error } = await supabase
      .from("matches")
      .update({
        home_score: resolvedSetWins.home_sets,
        away_score: resolvedSetWins.away_sets,
      })
      .eq("id", match.id);

    if (error) {
      toast.error(resolveAdminMatchControlErrorMessage(error, error.message), {
        id: "admin-match-control-migration-required",
      });
      return;
    }

    setMatchSetsByMatchId((currentMatchSetsByMatchId) => ({
      ...currentMatchSetsByMatchId,
      [match.id]: nextMatchSets,
    }));
    handleCancelEditingRecordedSet(match.id);
    toast.success(`Set ${editingSetDraft.setNumber} atualizado.`);
    onRefetch();
  };

  const handleFinishSet = async (match: Match) => {
    if (
      !canManageScoreboard ||
      match.status != MatchStatus.LIVE ||
      !isSetRuleMatch(match)
    ) {
      return;
    }

    const currentMatchDraft = getMatchDraft(match);
    const homePoints = Math.max(0, currentMatchDraft.homeScore);
    const awayPoints = Math.max(0, currentMatchDraft.awayScore);

    if (homePoints == 0 && awayPoints == 0) {
      toast.error("Informe o placar do set antes de encerrar.");
      return;
    }

    if (homePoints == awayPoints) {
      toast.error("Um set não pode terminar empatado.");
      return;
    }

    const closedMatchSets = resolveClosedMatchSets(match);
    const nextMatchSets = [
      ...closedMatchSets,
      {
        set_number: closedMatchSets.length + 1,
        home_points: homePoints,
        away_points: awayPoints,
      },
    ];
    const resolvedSetWins = await persistMatchSets(match, nextMatchSets);

    if (!resolvedSetWins) {
      return;
    }

    const { error } = await supabase
      .from("matches")
      .update({
        home_score: resolvedSetWins.home_sets,
        away_score: resolvedSetWins.away_sets,
        current_set_home_score: 0,
        current_set_away_score: 0,
      })
      .eq("id", match.id);

    if (error) {
      toast.error(resolveAdminMatchControlErrorMessage(error, error.message), {
        id: "admin-match-control-migration-required",
      });
      return;
    }

    setMatchSetsByMatchId((currentMatchSetsByMatchId) => ({
      ...currentMatchSetsByMatchId,
      [match.id]: nextMatchSets,
    }));
    setMatchDraftById((currentMatchDraftById) => ({
      ...currentMatchDraftById,
      [match.id]: {
        ...currentMatchDraft,
        homeScore: 0,
        awayScore: 0,
      },
    }));
    setDraftDirty(match.id, false);

    toast.success(`Set ${nextMatchSets.length} encerrado.`);
    onRefetch();
  };

  const handleReturnToScheduled = async (match: Match) => {
    if (!canManageScoreboard) return;

    const { error } = await supabase
      .from("matches")
      .update({
        status: MatchStatus.SCHEDULED,
        start_time: match.start_time,
        end_time: null,
        home_score: 0,
        away_score: 0,
        current_set_home_score: null,
        current_set_away_score: null,
        home_yellow_cards: 0,
        home_red_cards: 0,
        home_blue_cards: 0,
        home_two_minute_penalties: 0,
        away_yellow_cards: 0,
        away_red_cards: 0,
        away_blue_cards: 0,
        away_two_minute_penalties: 0,
        home_penalty_score: null,
        away_penalty_score: null,
        resolved_tie_breaker_rule: null,
        resolved_tie_break_winner_team_id: null,
        is_walkover: false,
        is_double_walkover: false,
        walkover_loser_team_id: null,
      })
      .eq("id", match.id);

    if (error) {
      toast.error("Erro ao voltar ao agendamento.");
      return;
    }

    if (match.result_rule === ChampionshipSportResultRule.SETS) {
      await supabase.from("match_sets").delete().eq("match_id", match.id);
    }

    setShowReturnToScheduledConfirmDialog(false);
    setPendingReturnToScheduledMatch(null);
    toast.success("Jogo voltou ao agendamento.");
    onRefetch();
    onRefetchChampionshipBracket();
  };

  const handleSetLive = async (matchId: string) => {
    if (!canManageScoreboard) {
      return;
    }

    if (championshipStatus != ChampionshipStatus.IN_PROGRESS) {
      toast.error(
        "Só é possível iniciar jogos quando o campeonato estiver Em andamento.",
      );
      return;
    }

    const match = matches.find((currentMatch) => currentMatch.id == matchId);

    if (!match) {
      return;
    }

    const courtAndDateKey = resolveMatchCourtAndDateKey(match);
    const liveMatchesCount = courtAndDateKey
      ? (liveMatchesCountByCourtAndDateKey[courtAndDateKey] ?? 0)
      : 0;

    if (liveMatchesCount > 0) {
      toast.error("Esta quadra já possui um jogo ao vivo.");
      return;
    }

    const { error } = await supabase
      .from("matches")
      .update({
        status: MatchStatus.LIVE,
        start_time: match.start_time ?? new Date().toISOString(),
        end_time: null,
        home_penalty_score: null,
        away_penalty_score: null,
        resolved_tie_breaker_rule: null,
        resolved_tie_break_winner_team_id: null,
        is_walkover: false,
        is_double_walkover: false,
        walkover_loser_team_id: null,
      })
      .eq("id", matchId);

    if (error) {
      toast.error(resolveAdminMatchControlErrorMessage(error, error.message), {
        id: "admin-match-control-migration-required",
      });
      return;
    }

    toast.success("Jogo iniciado!");
    onRefetch();
    onRefetchChampionshipBracket();
  };

  const handleFinishWithWalkover = async (
    match: Match,
    walkoverMode: Exclude<WalkoverMode, "NONE">,
  ) => {
    if (!canManageScoreboard) {
      return;
    }

    if (championshipStatus != ChampionshipStatus.IN_PROGRESS) {
      toast.error(
        "Só é possível aplicar W.O. quando o campeonato estiver Em andamento.",
      );
      return;
    }

    const matchBracketContext = matchBracketContextByMatchId[match.id];
    const isKnockoutMatch = matchBracketContext?.phase == BracketPhase.KNOCKOUT;

    if (walkoverMode == WALKOVER_MODE_DOUBLE && isKnockoutMatch) {
      toast.error("Não é possível aplicar W.O. duplo em jogos do mata-mata.");
      return;
    }

    if (
      match.status == MatchStatus.LIVE &&
      hasRecordedProgressForWalkover(match)
    ) {
      toast.error(
        "Não é possível aplicar W.O. em jogo ao vivo com placar ou sets já lançados.",
      );
      return;
    }

    if (walkoverMode == WALKOVER_MODE_DOUBLE) {
      const now = new Date().toISOString();

      const { error } = await supabase
        .from("matches")
        .update({
          home_score: 0,
          away_score: 0,
          current_set_home_score: null,
          current_set_away_score: null,
          home_yellow_cards: 0,
          home_red_cards: 0,
          home_blue_cards: 0,
          home_two_minute_penalties: 0,
          away_yellow_cards: 0,
          away_red_cards: 0,
          away_blue_cards: 0,
          away_two_minute_penalties: 0,
          home_penalty_score: null,
          away_penalty_score: null,
          resolved_tie_breaker_rule: null,
          resolved_tie_break_winner_team_id: null,
          start_time: match.start_time ?? now,
          end_time: match.start_time != null ? now : null,
          status: MatchStatus.FINISHED,
          is_walkover: true,
          is_double_walkover: true,
          walkover_loser_team_id: null,
        })
        .eq("id", match.id);

      if (error) {
        toast.error(
          resolveAdminMatchControlErrorMessage(error, error.message),
          {
            id: "admin-match-control-migration-required",
          },
        );
        return;
      }

      setMatchSetsByMatchId((currentMatchSetsByMatchId) => ({
        ...currentMatchSetsByMatchId,
        [match.id]: [],
      }));
      clearWalkoverSelection(match.id);
      setDraftDirty(match.id, false);

      toast.success("Jogo encerrado por W.O.! Classificação atualizada.");
      onRefetch();
      onRefetchChampionshipBracket();
      return;
    }

    const walkoverLoserTeamId =
      walkoverMode == WALKOVER_MODE_HOME_LOST
        ? match.home_team_id
        : walkoverMode == WALKOVER_MODE_AWAY_LOST
          ? match.away_team_id
          : null;

    if (
      walkoverLoserTeamId != match.home_team_id &&
      walkoverLoserTeamId != match.away_team_id
    ) {
      toast.error("Selecione uma atlética válida para marcar o W.O.");
      return;
    }

    const winnerPoints = resolveWalkoverWinnerPoints(match, championshipSports);

    if (winnerPoints == null) {
      toast.error("Modalidade sem configuração de W.O. para pontuação máxima.");
      return;
    }

    const isSetMatch = isSetRuleMatch(match);
    const winnerSide: MatchSide =
      walkoverLoserTeamId == match.home_team_id ? "away" : "home";
    const now = new Date().toISOString();
    let resolvedHomeScore = winnerSide == "home" ? winnerPoints : 0;
    let resolvedAwayScore = winnerSide == "away" ? winnerPoints : 0;
    let nextMatchSets: MatchSetInput[] | null = null;

    if (isSetMatch) {
      nextMatchSets = [
        {
          set_number: 1,
          home_points: winnerSide == "home" ? winnerPoints : 0,
          away_points: winnerSide == "away" ? winnerPoints : 0,
        },
      ];
      const resolvedSetWins = await persistMatchSets(match, nextMatchSets);

      if (!resolvedSetWins) {
        return;
      }

      resolvedHomeScore = resolvedSetWins.home_sets;
      resolvedAwayScore = resolvedSetWins.away_sets;
    }

    const { error } = await supabase
      .from("matches")
      .update({
        home_score: resolvedHomeScore,
        away_score: resolvedAwayScore,
        current_set_home_score: null,
        current_set_away_score: null,
        home_yellow_cards: 0,
        home_red_cards: 0,
        home_blue_cards: 0,
        home_two_minute_penalties: 0,
        away_yellow_cards: 0,
        away_red_cards: 0,
        away_blue_cards: 0,
        away_two_minute_penalties: 0,
        home_penalty_score: null,
        away_penalty_score: null,
        resolved_tie_breaker_rule: null,
        resolved_tie_break_winner_team_id: null,
        start_time: match.start_time ?? now,
        end_time: match.start_time != null ? now : null,
        status: MatchStatus.FINISHED,
        is_walkover: true,
        is_double_walkover: false,
        walkover_loser_team_id: walkoverLoserTeamId,
      })
      .eq("id", match.id);

    if (error) {
      toast.error(resolveAdminMatchControlErrorMessage(error, error.message), {
        id: "admin-match-control-migration-required",
      });
      return;
    }

    if (nextMatchSets) {
      setMatchSetsByMatchId((currentMatchSetsByMatchId) => ({
        ...currentMatchSetsByMatchId,
        [match.id]: nextMatchSets,
      }));
    }

    clearWalkoverSelection(match.id);
    setDraftDirty(match.id, false);

    toast.success("Jogo encerrado por W.O.! Classificação atualizada.");
    onRefetch();
    onRefetchChampionshipBracket();
  };

  const flushPendingAutosave = async (
    match: Match,
    matchDraft: MatchControlDraft,
  ) => {
    const saveTimeoutReference = saveTimeoutByMatchIdRef.current[match.id];

    if (saveTimeoutReference) {
      clearTimeout(saveTimeoutReference);
      saveTimeoutByMatchIdRef.current[match.id] = undefined;
    }

    return persistMatchDraft(match, matchDraft);
  };

  const handleFinish = async (
    match: Match,
    penaltyShootoutScores?: {
      homePenaltyScore: number;
      awayPenaltyScore: number;
    },
  ) => {
    if (!canManageScoreboard) {
      return;
    }

    const selectedWalkoverMode = resolveSelectedWalkoverMode(match);

    if (selectedWalkoverMode !== WALKOVER_MODE_NONE) {
      await handleFinishWithWalkover(match, selectedWalkoverMode);
      return;
    }

    const currentMatchDraft = getMatchDraft(match);
    const isSetMatch = isSetRuleMatch(match);
    const supportsCards = doesMatchSupportCards(match);
    const handballMatch = isHandballMatch(match);
    const displayedSetWins = resolveDisplayedSetWins(match);

    if (
      isSetMatch &&
      (currentMatchDraft.homeScore > 0 || currentMatchDraft.awayScore > 0)
    ) {
      toast.error("Feche o set atual antes de finalizar a partida.");
      return;
    }

    if (
      isSetMatch &&
      displayedSetWins.home_sets == displayedSetWins.away_sets
    ) {
      toast.error(
        "Partidas por sets precisam ter um vencedor definido antes de encerrar.",
      );
      return;
    }

    const matchBracketContext = matchBracketContextByMatchId[match.id];
    const resolvedHomeScore = isSetMatch
      ? displayedSetWins.home_sets
      : currentMatchDraft.homeScore;
    const resolvedAwayScore = isSetMatch
      ? displayedSetWins.away_sets
      : currentMatchDraft.awayScore;
    const shouldUseSocietyPenaltyShootout =
      isSocietyKnockoutMatch(match, matchBracketContext) &&
      resolvedHomeScore == resolvedAwayScore;

    if (
      matchBracketContext?.phase == BracketPhase.KNOCKOUT &&
      resolvedHomeScore == resolvedAwayScore &&
      !shouldUseSocietyPenaltyShootout
    ) {
      toast.error("Jogos do mata-mata não podem terminar empatados.");
      return;
    }

    if (shouldUseSocietyPenaltyShootout && !penaltyShootoutScores) {
      openPenaltyShootoutDialog(match);
      return;
    }

    const matchSaved = await flushPendingAutosave(match, currentMatchDraft);

    if (!matchSaved) {
      toast.error(
        "Não foi possível salvar os dados antes de finalizar o jogo.",
      );
      return;
    }

    const resolvedPenaltyShootoutWinnerTeamId =
      shouldUseSocietyPenaltyShootout && penaltyShootoutScores
        ? resolvePenaltyShootoutWinnerTeamId(
            match,
            penaltyShootoutScores.homePenaltyScore,
            penaltyShootoutScores.awayPenaltyScore,
          )
        : null;

    const { error } = await supabase
      .from("matches")
      .update({
        ...resolveMatchUpdatePayload(match, currentMatchDraft, {
          supportsCards,
          isHandball: handballMatch,
          shouldUseCurrentSetScore: isSetMatch,
        }),
        home_score: resolvedHomeScore,
        away_score: resolvedAwayScore,
        current_set_home_score: isSetMatch ? null : null,
        current_set_away_score: isSetMatch ? null : null,
        home_yellow_cards: supportsCards
          ? Math.max(0, currentMatchDraft.homeYellowCards)
          : 0,
        home_red_cards: supportsCards
          ? Math.max(0, currentMatchDraft.homeRedCards)
          : 0,
        home_blue_cards: handballMatch
          ? Math.max(0, currentMatchDraft.homeBlueCards)
          : 0,
        home_two_minute_penalties: handballMatch
          ? Math.max(0, currentMatchDraft.homeTwoMinutePenalties)
          : 0,
        away_yellow_cards: supportsCards
          ? Math.max(0, currentMatchDraft.awayYellowCards)
          : 0,
        away_red_cards: supportsCards
          ? Math.max(0, currentMatchDraft.awayRedCards)
          : 0,
        away_blue_cards: handballMatch
          ? Math.max(0, currentMatchDraft.awayBlueCards)
          : 0,
        away_two_minute_penalties: handballMatch
          ? Math.max(0, currentMatchDraft.awayTwoMinutePenalties)
          : 0,
        home_penalty_score: penaltyShootoutScores?.homePenaltyScore ?? null,
        away_penalty_score: penaltyShootoutScores?.awayPenaltyScore ?? null,
        resolved_tie_breaker_rule: resolvedPenaltyShootoutWinnerTeamId
          ? ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY
          : null,
        resolved_tie_break_winner_team_id: resolvedPenaltyShootoutWinnerTeamId,
        end_time: new Date().toISOString(),
        status: MatchStatus.FINISHED,
        is_walkover: false,
        is_double_walkover: false,
        walkover_loser_team_id: null,
      })
      .eq("id", match.id);

    if (error) {
      toast.error(resolveAdminMatchControlErrorMessage(error, error.message), {
        id: "admin-match-control-migration-required",
      });
      return;
    }

    if (showPenaltyShootoutDialog) {
      closePenaltyShootoutDialog();
    }

    toast.success("Jogo finalizado! Classificação atualizada.");
    onRefetch();
    onRefetchChampionshipBracket();
  };

  const handleConfirmPenaltyShootout = async () => {
    if (!pendingPenaltyShootoutMatch) {
      return;
    }

    const homePenaltyScore = resolvePenaltyShootoutScoreValue(
      penaltyShootoutDraft.homePenaltyScore,
    );
    const awayPenaltyScore = resolvePenaltyShootoutScoreValue(
      penaltyShootoutDraft.awayPenaltyScore,
    );

    if (homePenaltyScore == null || awayPenaltyScore == null) {
      toast.error("Informe o placar dos pênaltis para as duas atléticas.");
      return;
    }

    if (homePenaltyScore == awayPenaltyScore) {
      toast.error("O placar dos pênaltis precisa definir um vencedor.");
      return;
    }

    await handleFinish(pendingPenaltyShootoutMatch, {
      homePenaltyScore,
      awayPenaltyScore,
    });
  };

  const handleSwapKnockoutTeam = useCallback(
    async (match: Match, side: "home" | "away", newTeamId: string) => {
      const bracketMatch = bracketMatchByMatchId[match.id];
      if (!bracketMatch) return;
      const currentTeamId =
        side === "home" ? match.home_team_id : match.away_team_id;
      if (!currentTeamId || currentTeamId === newTeamId) return;

      const { error } = await swapChampionshipKnockoutBracketTeams(
        bracketMatch.competition_id,
        currentTeamId,
        newTeamId,
      );
      if (error) {
        toast.error("Erro ao trocar equipe.");
        return;
      }
      toast.success("Equipe trocada com sucesso.");
      await onRefetch({ showFetching: true });
      onRefetchChampionshipBracket();
    },
    [bracketMatchByMatchId, onRefetch, onRefetchChampionshipBracket],
  );

  const divisionOptions = useMemo(() => {
    const uniqueDivisions = new Set<TeamDivision>();

    matches.forEach((match) => {
      if (sportFilter && match.sport_id != sportFilter) {
        return;
      }

      if (
        naipeFilter !== ALL_CONTROL_NAIPE_FILTER &&
        match.naipe != naipeFilter
      ) {
        return;
      }

      if (match.division) {
        uniqueDivisions.add(match.division);
      }
    });

    individualSessions.forEach((session) => {
      if (sportFilter && session.sport_id != sportFilter) {
        return;
      }

      if (
        naipeFilter !== ALL_CONTROL_NAIPE_FILTER &&
        session.naipe != naipeFilter
      ) {
        return;
      }

      if (session.division) {
        uniqueDivisions.add(session.division);
      }
    });

    return [...uniqueDivisions].sort((firstDivision, secondDivision) =>
      TEAM_DIVISION_LABELS[firstDivision].localeCompare(
        TEAM_DIVISION_LABELS[secondDivision],
      ),
    );
  }, [individualSessions, matches, naipeFilter, sportFilter]);

  const availableNaipeOptions = useMemo(() => {
    const availableNaipes = new Set<MatchNaipe>();

    matches.forEach((match) => {
      if (!sportFilter || match.sport_id == sportFilter) {
        availableNaipes.add(match.naipe);
      }
    });

    individualSessions.forEach((session) => {
      if (!sportFilter || session.sport_id == sportFilter) {
        availableNaipes.add(session.naipe);
      }
    });

    return NAIPE_OPTIONS.filter((naipeOption) =>
      availableNaipes.has(naipeOption),
    );
  }, [individualSessions, matches, sportFilter]);

  const matchesFilteredByTopLevelCriteria = useMemo(() => {
    return matches.filter((match) => {
      if (sportFilter && match.sport_id != sportFilter) {
        return false;
      }

      if (
        naipeFilter !== ALL_CONTROL_NAIPE_FILTER &&
        match.naipe != naipeFilter
      ) {
        return false;
      }

      if (showOnlyLiveMatches && match.status != MatchStatus.LIVE) {
        return false;
      }

      if (
        divisionFilter !== ALL_CONTROL_DIVISION_FILTER &&
        match.division != divisionFilter
      ) {
        return false;
      }

      return true;
    });
  }, [divisionFilter, matches, naipeFilter, showOnlyLiveMatches, sportFilter]);

  const groupOptions = useMemo(() => {
    const eligibleMatchIds = new Set(
      matchesFilteredByTopLevelCriteria.map((match) => match.id),
    );
    const eligibleMatchBracketContextByMatchId = Object.fromEntries(
      Object.entries(matchBracketContextByMatchId).filter(([matchId]) =>
        eligibleMatchIds.has(matchId),
      ),
    );

    return resolveBracketGroupFilterOptions(
      eligibleMatchBracketContextByMatchId,
    );
  }, [matchBracketContextByMatchId, matchesFilteredByTopLevelCriteria]);

  const matchesFilteredByPrimaryCriteria = useMemo(() => {
    return matchesFilteredByTopLevelCriteria.filter((match) => {
      if (groupFilter == ALL_CONTROL_GROUP_FILTER) {
        return true;
      }

      const matchBracketContext = matchBracketContextByMatchId[match.id];
      return matchBracketContext?.groupFilterValue == groupFilter;
    });
  }, [
    groupFilter,
    matchBracketContextByMatchId,
    matchesFilteredByTopLevelCriteria,
  ]);

  const individualSessionsFilteredByPrimaryCriteria = useMemo(() => {
    return individualSessions.filter((session) => {
      if (sportFilter && session.sport_id != sportFilter) {
        return false;
      }

      if (
        naipeFilter != ALL_CONTROL_NAIPE_FILTER &&
        session.naipe != naipeFilter
      ) {
        return false;
      }

      if (
        divisionFilter != ALL_CONTROL_DIVISION_FILTER &&
        session.division != divisionFilter
      ) {
        return false;
      }

      return true;
    });
  }, [divisionFilter, individualSessions, naipeFilter, sportFilter]);

  const locationOptions = useMemo(() => {
    return [
      ...new Set(
        [
          ...matchesFilteredByPrimaryCriteria.map((match) => match.location),
          ...individualSessionsFilteredByPrimaryCriteria.map(
            (session) => session.location_name,
          ),
        ].filter((location): location is string => Boolean(location)),
      ),
    ].sort((firstLocation, secondLocation) =>
      firstLocation.localeCompare(secondLocation),
    );
  }, [
    individualSessionsFilteredByPrimaryCriteria,
    matchesFilteredByPrimaryCriteria,
  ]);

  const courtOptions = useMemo(() => {
    const uniqueCourtNames = new Set<string>();

    matchesFilteredByPrimaryCriteria.forEach((match) => {
      if (!match.court_name) {
        return;
      }

      if (
        locationFilter != ALL_CONTROL_LOCATION_FILTER &&
        match.location != locationFilter
      ) {
        return;
      }

      uniqueCourtNames.add(match.court_name);
    });

    individualSessionsFilteredByPrimaryCriteria.forEach((session) => {
      if (!session.court_name) {
        return;
      }

      if (
        locationFilter != ALL_CONTROL_LOCATION_FILTER &&
        session.location_name != locationFilter
      ) {
        return;
      }

      uniqueCourtNames.add(session.court_name);
    });

    return [...uniqueCourtNames].sort((firstCourtName, secondCourtName) =>
      firstCourtName.localeCompare(secondCourtName),
    );
  }, [
    individualSessionsFilteredByPrimaryCriteria,
    locationFilter,
    matchesFilteredByPrimaryCriteria,
  ]);

  useEffect(() => {
    if (
      naipeFilter != ALL_CONTROL_NAIPE_FILTER &&
      !availableNaipeOptions.includes(naipeFilter as MatchNaipe)
    ) {
      setNaipeFilter(ALL_CONTROL_NAIPE_FILTER);
    }
  }, [availableNaipeOptions, naipeFilter]);

  useEffect(() => {
    if (
      divisionFilter != ALL_CONTROL_DIVISION_FILTER &&
      !divisionOptions.includes(divisionFilter as TeamDivision)
    ) {
      setDivisionFilter(ALL_CONTROL_DIVISION_FILTER);
    }
  }, [divisionFilter, divisionOptions]);

  useEffect(() => {
    if (
      groupFilter != ALL_CONTROL_GROUP_FILTER &&
      !groupOptions.some((groupOption) => groupOption.value == groupFilter)
    ) {
      setGroupFilter(ALL_CONTROL_GROUP_FILTER);
    }
  }, [groupFilter, groupOptions]);

  useEffect(() => {
    if (
      locationFilter != ALL_CONTROL_LOCATION_FILTER &&
      !locationOptions.includes(locationFilter)
    ) {
      setLocationFilter(ALL_CONTROL_LOCATION_FILTER);
    }
  }, [locationFilter, locationOptions]);

  useEffect(() => {
    if (
      courtFilter != ALL_CONTROL_COURT_FILTER &&
      !courtOptions.includes(courtFilter)
    ) {
      setCourtFilter(ALL_CONTROL_COURT_FILTER);
    }
  }, [courtFilter, courtOptions]);

  const filteredMatches = useMemo(() => {
    return matchesFilteredByPrimaryCriteria.filter((match) => {
      if (
        locationFilter != ALL_CONTROL_LOCATION_FILTER &&
        match.location != locationFilter
      ) {
        return false;
      }

      if (
        courtFilter != ALL_CONTROL_COURT_FILTER &&
        match.court_name != courtFilter
      ) {
        return false;
      }

      return true;
    });
  }, [courtFilter, locationFilter, matchesFilteredByPrimaryCriteria]);

  const operationalVisualQueuePositionByMatchId = useMemo(() => {
    return resolveVisualQueuePositionByMatchId(
      matches,
      matches,
      estimatedStartTimeByMatchId,
    );
  }, [estimatedStartTimeByMatchId, matches]);

  const sortedMatches = useMemo(() => {
    return [...filteredMatches].sort((firstMatch, secondMatch) =>
      compareAdminMatchCardOrder(firstMatch, secondMatch, {
        estimatedStartTimeByMatchId,
        visualQueuePositionByMatchId: operationalVisualQueuePositionByMatchId,
      }),
    );
  }, [
    estimatedStartTimeByMatchId,
    filteredMatches,
    operationalVisualQueuePositionByMatchId,
  ]);

  const visibleIndividualSessions = useMemo(() => {
    return individualSessionsFilteredByPrimaryCriteria.filter((session) => {
      if (
        locationFilter != ALL_CONTROL_LOCATION_FILTER &&
        (session.location_name ?? "") != locationFilter
      ) {
        return false;
      }

      if (
        courtFilter != ALL_CONTROL_COURT_FILTER &&
        (session.court_name ?? "") != courtFilter
      ) {
        return false;
      }

      return (
        session.status == "DRAFT" ||
        session.status == "SCHEDULED" ||
        session.status == "LIVE" ||
        session.status == "FINISHED"
      );
    });
  }, [
    courtFilter,
    individualSessionsFilteredByPrimaryCriteria,
    locationFilter,
  ]);

  const localOperationalMatches = useMemo(() => {
    const scheduledMatchesCountByCourtKey = new Map<string, number>();

    return sortedMatches.filter((match) => {
      if (match.status == MatchStatus.LIVE) {
        return true;
      }

      if (match.status != MatchStatus.SCHEDULED) {
        return false;
      }

      const courtKey = resolveControlQueueCourtKey(
        match.location,
        match.court_name,
      );
      const scheduledMatchesCount =
        scheduledMatchesCountByCourtKey.get(courtKey) ?? 0;

      if (scheduledMatchesCount >= 2) {
        return false;
      }

      scheduledMatchesCountByCourtKey.set(courtKey, scheduledMatchesCount + 1);
      return true;
    });
  }, [sortedMatches]);

  const localOperationalIndividualSessions = useMemo(() => {
    const scheduledSessionsCountByCourtKey = new Map<string, number>();

    return visibleIndividualSessions.filter((session) => {
      if (session.status == "LIVE") {
        return true;
      }

      if (session.status != "SCHEDULED" && session.status != "DRAFT") {
        return false;
      }

      const courtKey = resolveControlQueueCourtKey(
        session.location_name,
        session.court_name,
      );
      const scheduledSessionsCount =
        scheduledSessionsCountByCourtKey.get(courtKey) ?? 0;

      if (scheduledSessionsCount >= 1) {
        return false;
      }

      scheduledSessionsCountByCourtKey.set(courtKey, scheduledSessionsCount + 1);
      return true;
    });
  }, [visibleIndividualSessions]);

  const controlItemsCount =
    sortedMatches.length + visibleIndividualSessions.length;
  const totalPages = Math.max(1, Math.ceil(controlItemsCount / itemsPerPage));

  const paginatedMatches = useMemo(() => {
    const rangeStart = (currentPage - 1) * itemsPerPage;
    const rangeEnd = rangeStart + itemsPerPage;

    return sortedMatches.slice(rangeStart, rangeEnd);
  }, [currentPage, itemsPerPage, sortedMatches]);

  const paginatedIndividualSessions = useMemo(() => {
    const rangeStart = (currentPage - 1) * itemsPerPage;
    const rangeEnd = rangeStart + itemsPerPage;
    const individualSessionsRangeStart = Math.max(
      0,
      rangeStart - sortedMatches.length,
    );
    const individualSessionsRangeEnd = Math.max(
      0,
      rangeEnd - sortedMatches.length,
    );

    return visibleIndividualSessions.slice(
      individualSessionsRangeStart,
      individualSessionsRangeEnd,
    );
  }, [
    currentPage,
    itemsPerPage,
    sortedMatches.length,
    visibleIndividualSessions,
  ]);

  const displayedMatches = isFullQueueVisible
    ? paginatedMatches
    : onFullQueueVisibleChange
      ? sortedMatches
      : localOperationalMatches;
  const displayedIndividualSessions = isFullQueueVisible
    ? paginatedIndividualSessions
    : onFullQueueVisibleChange
      ? visibleIndividualSessions
      : localOperationalIndividualSessions;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!hasHandledPaginationScrollRef.current) {
      hasHandledPaginationScrollRef.current = true;
      return;
    }

    scrollToTopOfPage();
  }, [currentPage]);

  if (isInitialControlLoading) {
    return (
      <div
        data-testid="admin-match-control-loading"
        className="enter-section space-y-4"
      >
        <div className="glass-card space-y-4 p-4">
          <Skeleton className="h-4 w-48" />

          <div className="flex gap-3">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 flex-1" />
          </div>
        </div>

        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton
            key={`admin-control-initial-skeleton-${index}`}
            className="h-56 w-full rounded-2xl"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="enter-section flex flex-col gap-4">
      {displayedIndividualSessions.length > 0 ? (
        <div className="contents">
          {displayedIndividualSessions.map((session) => {
            const isSessionActionLoading =
              sessionActionLoadingById[session.id] == true;
            const isOperational =
              canManageScoreboard &&
              championshipStatus == ChampionshipStatus.IN_PROGRESS;
            const isScheduled = session.status == "SCHEDULED";
            const isLive = session.status == "LIVE";
            return (
              <div
                key={session.id}
                className="order-3 space-y-4 glass-card p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="order-2 space-y-1 text-center sm:order-1 sm:text-left">
                    <div className="flex flex-col items-center gap-y-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
                      <span className="shrink-0 text-xs uppercase text-muted-foreground">
                        {session.sports?.name}
                        {session.location_name
                          ? ` • ${session.location_name}`
                          : ""}
                        {session.court_name ? ` • ${session.court_name}` : ""}
                      </span>
                      <div className="flex flex-wrap justify-center gap-1 sm:justify-start">
                        <AppBadge
                          tone={resolveMatchNaipeBadgeTone(
                            String(session.naipe),
                          )}
                        >
                          {resolveMatchNaipeLabel(String(session.naipe))}
                        </AppBadge>
                        {session.division ? (
                          <AppBadge
                            tone={TEAM_DIVISION_BADGE_TONES[session.division]}
                          >
                            {TEAM_DIVISION_LABELS[session.division]}
                          </AppBadge>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDateOnlyInBrazilianFormat(session.scheduled_date)}
                      {session.period
                        ? ` • ${session.period == "MATUTINO" ? "Matutino" : "Vespertino"}`
                        : ""}
                    </p>
                    {championshipStatus != ChampionshipStatus.IN_PROGRESS ? (
                      <p className="text-xs font-medium text-amber-500">
                        O campeonato precisa estar Em andamento para iniciar
                        jogos ao vivo.
                      </p>
                    ) : null}
                  </div>
                  <div className="order-3 flex w-full flex-wrap justify-end gap-2 sm:order-2 sm:w-auto">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 p-0 sm:w-auto sm:px-3"
                      aria-label="Registrar resultados"
                      title="Registrar resultados"
                      disabled={!isOperational || !isLive}
                      onClick={() => setResultsDialogSessionId(session.id)}
                    >
                      <Pencil className="h-4 w-4 sm:mr-1" />
                      <span className="hidden sm:inline">
                        Registrar resultados
                      </span>
                    </Button>
                    {isScheduled ? (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="h-9 w-9 bg-live p-0 text-primary-foreground hover:bg-live-glow sm:w-auto sm:px-3"
                        aria-label="Iniciar sessão"
                        title="Iniciar sessão"
                        disabled={isSessionActionLoading || !isOperational}
                        onClick={() =>
                          void runSessionAction(session.id, "start")
                        }
                      >
                        <Play className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Iniciar sessão</span>
                      </Button>
                    ) : null}
                    {isLive ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 w-9 p-0 sm:w-auto sm:px-3"
                          aria-label="Voltar para agendada"
                          title="Voltar para agendada"
                          disabled={isSessionActionLoading || !isOperational}
                          onClick={() => {
                            setPendingReturnIndividualSessionId(session.id);
                            setShowReturnIndividualSessionDialog(true);
                          }}
                        >
                          <RotateCcw className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">
                            Voltar para agendada
                          </span>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 w-9 p-0 sm:w-auto sm:px-3"
                          aria-label="Encerrar sessão"
                          title="Encerrar sessão"
                          disabled={isSessionActionLoading || !isOperational}
                          onClick={() =>
                            void runSessionAction(session.id, "finish")
                          }
                        >
                          <Square className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">
                            Encerrar sessão
                          </span>
                        </Button>
                      </>
                    ) : null}
                    {session.status == "FINISHED" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 w-9 p-0 sm:w-auto sm:px-3"
                        aria-label="Reabrir sessão"
                        title="Reabrir sessão"
                        disabled={isSessionActionLoading || !isOperational}
                        onClick={() =>
                          void runSessionAction(session.id, "reopen")
                        }
                      >
                        <RotateCcw className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Reabrir sessão</span>
                      </Button>
                    ) : null}
                    {session.status != "SCHEDULED" ? (
                      <AppBadge
                        tone={
                          session.status == "DRAFT"
                            ? AppBadgeTone.AMBER
                            : session.status == "LIVE"
                              ? AppBadgeTone.PRIMARY
                              : AppBadgeTone.RED
                        }
                      >
                        {session.status == "DRAFT"
                          ? "Pendente de agendamento"
                          : INDIVIDUAL_SESSION_STATUS_LABELS[session.status]}
                      </AppBadge>
                    ) : null}
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      ) : null}

      <div className="order-1 glass-card enter-section space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          {isFullQueueVisible
            ? controlItemsCount
            : displayedMatches.length + displayedIndividualSessions.length}{" "}
          {(isFullQueueVisible
            ? controlItemsCount
            : displayedMatches.length + displayedIndividualSessions.length) == 1
            ? "item de controle encontrado"
            : "itens de controle encontrados"}
          {!isFullQueueVisible && controlItemsCount > 0
            ? ` de ${controlItemsCount} na fila completa`
            : ""}
        </p>

        <div className="min-w-0">
          {controlSports.length > 0 && (
            <div className="min-w-0">
              <SportFilter
                sports={controlSports}
                selected={sportFilter}
                onSelect={setSportFilter}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-12 gap-3 sm:flex sm:flex-wrap sm:items-stretch">
          {divisionOptions.length > 0 ? (
            <div className="col-span-6 min-w-0 sm:min-w-40 sm:flex-1">
              <Select value={divisionFilter} onValueChange={setDivisionFilter}>
                <SelectTrigger
                  aria-label="Filtrar por divisão no controle ao vivo"
                  className="app-input-field w-full"
                >
                  <SelectValue placeholder="Divisão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CONTROL_DIVISION_FILTER}>
                    Todas as divisões
                  </SelectItem>
                  {divisionOptions.map((divisionOption) => (
                    <SelectItem key={divisionOption} value={divisionOption}>
                      {TEAM_DIVISION_LABELS[divisionOption]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="col-span-6 min-w-0 sm:min-w-40 sm:flex-1">
            <Select value={naipeFilter} onValueChange={setNaipeFilter}>
              <SelectTrigger
                aria-label="Filtrar por naipe no controle ao vivo"
                className="app-input-field w-full"
              >
                <SelectValue placeholder="Naipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CONTROL_NAIPE_FILTER}>
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

          {groupOptions.length > 0 ? (
            <div className="col-span-6 min-w-0 sm:min-w-40 sm:flex-1">
              <Select value={groupFilter} onValueChange={setGroupFilter}>
                <SelectTrigger
                  aria-label="Filtrar por grupo no controle ao vivo"
                  className="app-input-field w-full"
                >
                  <SelectValue placeholder="Grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CONTROL_GROUP_FILTER}>
                    Todos os grupos
                  </SelectItem>
                  {groupOptions.map((groupOption) => (
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
          ) : null}

          <div className="col-span-12 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] gap-3 sm:contents">
          {locationOptions.length > 0 ? (
            <div className="min-w-0 sm:min-w-40 sm:flex-1">
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger
                  aria-label="Filtrar por local no controle ao vivo"
                  className="app-input-field w-full"
                >
                  <SelectValue placeholder="Local" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CONTROL_LOCATION_FILTER}>
                    Todos os locais
                  </SelectItem>
                  {locationOptions.map((locationOption) => (
                    <SelectItem key={locationOption} value={locationOption}>
                      {locationOption}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {courtOptions.length > 0 ? (
            <div className="min-w-0 sm:min-w-40 sm:flex-1">
              <Select value={courtFilter} onValueChange={setCourtFilter}>
                <SelectTrigger
                  aria-label="Filtrar por quadra no controle ao vivo"
                  className="app-input-field w-full"
                >
                  <SelectValue placeholder="Quadra" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CONTROL_COURT_FILTER}>
                    Todas as quadras
                  </SelectItem>
                  {courtOptions.map((courtOption) => (
                    <SelectItem key={courtOption} value={courtOption}>
                      {courtOption}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() =>
              setShowOnlyLiveMatches(
                (currentShowOnlyLiveMatches) => !currentShowOnlyLiveMatches,
              )
            }
            className={`h-10 w-10 ${showOnlyLiveMatches ? "app-button-secondary-active" : ""}`}
            aria-label={
              showOnlyLiveMatches
                ? "Mostrar jogos agendados também"
                : "Ocultar jogos que não estão ao vivo"
            }
          >
            <EyeOff className="h-4 w-4" />
          </Button>
          </div>
        </div>
      </div>

      <div className="order-2 flex justify-center sm:justify-start">
        <button
          type="button"
          onClick={() => {
            if (onFullQueueVisibleChange) {
              onFullQueueVisibleChange(!isFullQueueVisible);
            } else {
              setLocalIsFullQueueVisible((currentValue) => !currentValue);
            }
            setCurrentPage(1);
          }}
          className="text-[11px] font-medium text-primary hover:underline"
        >
          {isFullQueueVisible
            ? "Voltar à visão operacional"
            : "Ver fila completa"}
        </button>
      </div>

      <div className="contents">
        {isFetchingMatches ? (
          <div className="space-y-3">
            {Array.from({ length: Math.max(3, itemsPerPage) }).map(
              (_, index) => (
                <Skeleton
                  key={`admin-control-skeleton-${index}`}
                  className="h-56 w-full rounded-2xl"
                />
              ),
            )}
          </div>
        ) : sortedMatches.length == 0 &&
          visibleIndividualSessions.length == 0 ? (
          <p className="text-sm text-muted-foreground">
            {showOnlyLiveMatches
              ? "Nenhum jogo ao vivo para os filtros selecionados."
              : "Nenhum jogo ao vivo ou agendado."}
          </p>
        ) : (
          <>
            {displayedMatches.map((match) => {
              if (match.status == MatchStatus.SCHEDULED) {
                const scheduledDateValue = resolveMatchScheduledDateValue(match);
                const courtAndDateKey = resolveMatchCourtAndDateKey(match);
                const liveMatchesCount = courtAndDateKey
                  ? (liveMatchesCountByCourtAndDateKey[courtAndDateKey] ?? 0)
                  : 0;
                const isMatchStartBlocked = liveMatchesCount > 0;
                const queueLabel = resolveDisplayedMatchQueueLabel(
                  match,
                  visualQueuePositionByMatchId[match.id],
                );
                const queueSummary = scheduledDateValue
                  ? `${format(new Date(`${scheduledDateValue}T12:00:00`), "dd/MM", { locale: ptBR })} • ${queueLabel}`
                  : queueLabel;
                const selectedWalkoverMode = resolveSelectedWalkoverMode(match);
                const hasWalkoverSelection =
                  selectedWalkoverMode != WALKOVER_MODE_NONE;
                const isKnockoutMatch =
                  matchBracketContextByMatchId[match.id]?.phase ==
                  BracketPhase.KNOCKOUT;
                const isChampionshipStartBlocked =
                  championshipStatus != ChampionshipStatus.IN_PROGRESS;
                const matchLocationLabel = match.court_name
                  ? `${match.location} • ${match.court_name}`
                  : match.location;

                return (
                  <div
                    key={match.id}
                    className="order-2 glass-card p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1 text-center sm:text-left">
                        <div className="flex flex-col items-center gap-y-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
                          <span className="text-xs uppercase text-muted-foreground">
                            {match.sports?.name} • {matchLocationLabel}
                          </span>
                          <div className="flex flex-wrap justify-center gap-1 sm:justify-start">
                            <AppBadge
                              tone={resolveMatchNaipeBadgeTone(
                                String(match.naipe),
                              )}
                            >
                              {resolveMatchNaipeLabel(String(match.naipe))}
                            </AppBadge>
                            {matchBracketContextByMatchId[match.id] ? (
                              <AppBadge tone={AppBadgeTone.NEUTRAL}>
                                {matchBracketContextByMatchId[match.id]?.badgeLabel}
                              </AppBadge>
                            ) : null}
                          </div>
                        </div>
                        <p className="text-sm font-semibold text-foreground">
                          <span>{match.home_team?.name ?? "Mandante"}</span>{" "}
                          <span className="text-muted-foreground">×</span>{" "}
                          <span>{match.away_team?.name ?? "Visitante"}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {queueSummary}
                          {estimatedStartTimeByMatchId[match.id]
                            ? ` • Estimado: ${estimatedStartTimeByMatchId[match.id]}`
                            : ""}
                        </p>
                        {isMatchStartBlocked ? (
                          <p className="text-xs font-medium text-amber-500">
                            Quadra ocupada: {liveMatchesCount} jogo(s) ao vivo.
                          </p>
                        ) : null}
                        {isChampionshipStartBlocked ? (
                          <p className="text-xs font-medium text-amber-500">
                            O campeonato precisa estar Em andamento para iniciar
                            jogos ao vivo.
                          </p>
                        ) : null}
                      </div>

                      <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
                        <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                          W.O.?
                        </span>
                        <div className="min-w-0 flex-1 sm:w-36 sm:flex-none">
                          <Select
                            value={selectedWalkoverMode}
                            onValueChange={(value) =>
                              handleUpdateWalkoverMode(
                                match,
                                value as WalkoverMode,
                              )
                            }
                            disabled={!canManageScoreboard}
                          >
                            <SelectTrigger
                              aria-label="W.O.?"
                              className="h-9 w-full app-input-field px-2 text-xs"
                            >
                              <SelectValue placeholder="W.O.?" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={WALKOVER_MODE_NONE}>Não</SelectItem>
                              <SelectItem value={WALKOVER_MODE_HOME_LOST}>
                                {match.home_team?.name ?? "Mandante"}
                              </SelectItem>
                              <SelectItem value={WALKOVER_MODE_AWAY_LOST}>
                                {match.away_team?.name ?? "Visitante"}
                              </SelectItem>
                              <SelectItem
                                value={WALKOVER_MODE_DOUBLE}
                                disabled={isKnockoutMatch}
                              >
                                Ambas as atléticas tomaram W.O.
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <Button
                          size="sm"
                          variant={hasWalkoverSelection ? "destructive" : "default"}
                          onClick={() => {
                            if (hasWalkoverSelection) {
                              setPendingFinishMatch(match);
                              setShowFinishConfirmDialog(true);
                              return;
                            }

                            handleSetLive(match.id);
                          }}
                          disabled={
                            !canManageScoreboard ||
                            isChampionshipStartBlocked ||
                            (!hasWalkoverSelection && isMatchStartBlocked)
                          }
                          className={
                            hasWalkoverSelection
                              ? "h-9 w-9 shrink-0 p-0 sm:w-auto sm:px-3"
                              : "h-9 w-9 shrink-0 bg-live p-0 text-primary-foreground hover:bg-live-glow sm:w-auto sm:px-3"
                          }
                          aria-label={
                            hasWalkoverSelection
                              ? "Encerrar W.O."
                              : "Iniciar"
                          }
                          title={
                            hasWalkoverSelection
                              ? "Encerrar W.O."
                              : "Iniciar"
                          }
                        >
                          {hasWalkoverSelection ? (
                            <Square className="h-3 w-3 sm:mr-1" />
                          ) : (
                            <Play className="h-3 w-3 sm:mr-1" />
                          )}
                          <span className="hidden sm:inline">
                            {hasWalkoverSelection ? "Encerrar W.O." : "Iniciar"}
                          </span>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              }

              const matchDraft = getMatchDraft(match);
              const matchSaveStatus = saveStatusByMatchId[match.id];
              const matchBracketContext =
                matchBracketContextByMatchId[match.id];
              const scheduledDateValue = resolveMatchScheduledDateValue(match);
              const queueLabel = resolveDisplayedMatchQueueLabel(
                match,
                visualQueuePositionByMatchId[match.id],
              );
              const queueSummary = scheduledDateValue
                ? `${format(new Date(`${scheduledDateValue}T12:00:00`), "dd/MM", { locale: ptBR })} • ${queueLabel}`
                : queueLabel;
              const isSetMatch = isSetRuleMatch(match);
              const supportsCards = doesMatchSupportCards(match);
              const handballMatch = isHandballMatch(match);
              const handballMobileTeamColumns = [
                {
                  side: "home" as MatchSide,
                  teamName: match.home_team?.name ?? "Mandante",
                  counters: [
                    {
                      color: "yellow" as CardColor,
                      label: "Amarelos",
                      value: matchDraft.homeYellowCards,
                      className: "text-amber-700 dark:text-amber-500",
                    },
                    {
                      color: "red" as CardColor,
                      label: "Vermelhos",
                      value: matchDraft.homeRedCards,
                      className: "app-text-status-danger",
                    },
                    {
                      color: "blue" as CardColor,
                      label: "Azuis",
                      value: matchDraft.homeBlueCards,
                      className: "text-sky-700",
                    },
                    {
                      color: "twoMinute" as CardColor,
                      label: "Penal. 2 min",
                      value: matchDraft.homeTwoMinutePenalties,
                      className: "text-slate-700 dark:text-slate-300",
                    },
                  ],
                },
                {
                  side: "away" as MatchSide,
                  teamName: match.away_team?.name ?? "Visitante",
                  counters: [
                    {
                      color: "yellow" as CardColor,
                      label: "Amarelos",
                      value: matchDraft.awayYellowCards,
                      className: "text-amber-700 dark:text-amber-500",
                    },
                    {
                      color: "red" as CardColor,
                      label: "Vermelhos",
                      value: matchDraft.awayRedCards,
                      className: "app-text-status-danger",
                    },
                    {
                      color: "blue" as CardColor,
                      label: "Azuis",
                      value: matchDraft.awayBlueCards,
                      className: "text-sky-700",
                    },
                    {
                      color: "twoMinute" as CardColor,
                      label: "Penal. 2 min",
                      value: matchDraft.awayTwoMinutePenalties,
                      className: "text-slate-700 dark:text-slate-300",
                    },
                  ],
                },
              ];
              const closedMatchSets = resolveClosedMatchSets(match);
              const displayedSetWins = resolveDisplayedSetWins(match);
              const setSummary = resolveMatchSetSummary({
                ...match,
                match_sets: closedMatchSets,
              });
              const editingSetDraft = editingSetDraftByMatchId[match.id];
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
              const matchRepresentation =
                matchRepresentationByMatchId[match.id];
              const matchLocationLabel = match.court_name
                ? `${match.location} • ${match.court_name}`
                : match.location;
              const displayedHomeScore =
                isSetMatch && match.status != MatchStatus.LIVE
                  ? displayedSetWins.home_sets
                  : matchDraft.homeScore;
              const displayedAwayScore =
                isSetMatch && match.status != MatchStatus.LIVE
                  ? displayedSetWins.away_sets
                  : matchDraft.awayScore;
              const hasCurrentSetScore =
                Number(matchDraft.homeScore) > 0 ||
                Number(matchDraft.awayScore) > 0;
              const selectedWalkoverMode = resolveSelectedWalkoverMode(match);
              const hasWalkoverSelection =
                selectedWalkoverMode != WALKOVER_MODE_NONE;
              const shouldShowWalkoverSelector =
                match.status == MatchStatus.LIVE;
              const isKnockoutMatch =
                matchBracketContext?.phase == BracketPhase.KNOCKOUT;

              return (
                <div
                  key={match.id}
                  className={`order-2 space-y-4 glass-card p-5 ${match.status == MatchStatus.LIVE ? "list-item-card-live live-glow" : ""}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    {/* Linha 0 (mobile) / Direita (sm+): ações */}
                    <div className="order-2 flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                      {shouldShowWalkoverSelector ? (
                        <div className="flex flex-1 items-center gap-1.5 sm:flex-none">
                          <span
                            id={`match-walkover-label-${match.id}`}
                            className="text-xs font-semibold text-muted-foreground"
                          >
                            W.O.?
                          </span>
                          <Select
                            value={selectedWalkoverMode}
                            onValueChange={(value) =>
                              handleUpdateWalkoverMode(
                                match,
                                value as WalkoverMode,
                              )
                            }
                            disabled={!canManageScoreboard}
                          >
                            <SelectTrigger
                              aria-labelledby={`match-walkover-label-${match.id}`}
                              aria-label="W.O.?"
                              className="h-9 w-full app-input-field px-2 text-xs sm:min-w-36 sm:w-auto"
                            >
                              <SelectValue placeholder="Não" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={WALKOVER_MODE_NONE}>
                                Não
                              </SelectItem>
                              <SelectItem value={WALKOVER_MODE_HOME_LOST}>
                                {match.home_team?.name ?? "Mandante"}
                              </SelectItem>
                              <SelectItem value={WALKOVER_MODE_AWAY_LOST}>
                                {match.away_team?.name ?? "Visitante"}
                              </SelectItem>
                              <SelectItem
                                value={WALKOVER_MODE_DOUBLE}
                                disabled={isKnockoutMatch}
                              >
                                Ambas as atléticas tomaram W.O.
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}

                      {match.status == MatchStatus.LIVE ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPendingReturnToScheduledMatch(match);
                            setShowReturnToScheduledConfirmDialog(true);
                          }}
                          disabled={!canManageScoreboard}
                        >
                          <RotateCcw className="h-3 w-3 sm:mr-1" />
                          <span className="hidden sm:inline">
                            Voltar ao agendamento
                          </span>
                        </Button>
                      ) : null}

                      {match.status == MatchStatus.LIVE && isSetMatch ? (
                        <Button
                          size="sm"
                          onClick={() => handleFinishSet(match)}
                          disabled={!canManageScoreboard || !hasCurrentSetScore}
                          className="!bg-amber-500 !text-white hover:!bg-amber-400"
                        >
                          <Square className="h-3 w-3 sm:mr-1" />
                          <span className="hidden sm:inline">Fim do set</span>
                        </Button>
                      ) : null}

                      {match.status == MatchStatus.LIVE ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setPendingFinishMatch(match);
                            setShowFinishConfirmDialog(true);
                          }}
                          disabled={
                            !canManageScoreboard ||
                            (isSetMatch &&
                              !hasWalkoverSelection &&
                              closedMatchSets.length == 0)
                          }
                        >
                          <Square className="h-3 w-3 sm:mr-1" />
                          <span className="hidden sm:inline">
                            {hasWalkoverSelection
                              ? "Encerrar W.O."
                              : "Finalizar"}
                          </span>
                        </Button>
                      ) : null}
                    </div>

                    {/* Linhas 1-6 (mobile) / Esquerda (sm+): informações */}
                    <div className="order-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="shrink-0 text-xs uppercase text-muted-foreground">
                          {match.sports?.name} • {matchLocationLabel}
                        </span>
                        <div className="flex flex-wrap items-center gap-1">
                          <AppBadge
                            tone={resolveMatchNaipeBadgeTone(
                              String(match.naipe),
                            )}
                            className="w-fit"
                          >
                            {resolveMatchNaipeLabel(String(match.naipe))}
                          </AppBadge>
                          {matchBracketContext ? (
                            <AppBadge
                              tone={AppBadgeTone.NEUTRAL}
                              className="w-fit"
                            >
                              {matchBracketContext.badgeLabel}
                            </AppBadge>
                          ) : null}
                        </div>
                        {canManageScoreboard &&
                        match.status === MatchStatus.LIVE &&
                        matchSaveStatus ? (
                          <span
                            className="ml-auto flex items-center"
                            title={SAVE_STATUS_LABELS[matchSaveStatus]}
                          >
                            {matchSaveStatus === "saving" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            ) : matchSaveStatus === "saved" ? (
                              <Check className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                            )}
                          </span>
                        ) : null}
                      </div>

                      <div className="space-y-0.5">
                        {match.status == MatchStatus.LIVE ? (
                          <>
                            <span className="text-xs font-bold text-live live-pulse">
                              ● AO VIVO
                            </span>
                            <p className="text-xs text-muted-foreground">
                              {queueLabel}
                            </p>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {queueSummary}
                          </span>
                        )}

                        {startedAtLabel ? (
                          <p className="text-xs text-muted-foreground">
                            {startedAtLabel}
                          </p>
                        ) : null}

                        {matchRepresentation ? (
                          <p className="break-words text-xs text-muted-foreground">
                            Representação: {matchRepresentation}
                          </p>
                        ) : null}

                        {isSetMatch ? (
                          <p className="text-xs font-medium text-muted-foreground">
                            Sets ganhos: {displayedSetWins.home_sets} ×{" "}
                            {displayedSetWins.away_sets}
                          </p>
                        ) : null}

                        {penaltyShootoutSummary ? (
                          <p className="text-xs font-medium text-muted-foreground">
                            Pênaltis: ({penaltyShootoutSummary.homePenaltyScore}{" "}
                            × {penaltyShootoutSummary.awayPenaltyScore})
                          </p>
                        ) : null}

                        {match.status == MatchStatus.FINISHED &&
                        tieBreakRuleLabel ? (
                          <p className="inline-flex items-center gap-1 text-xs font-medium text-amber-500">
                            <AlertTriangle className="h-3 w-3" />
                            Desempate por {tieBreakRuleLabel}.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 sm:hidden">
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <p className="truncate font-display font-bold">
                        {match.home_team?.name}
                      </p>
                      <p className="truncate font-display font-bold">
                        {match.away_team?.name}
                      </p>
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-10"
                          onClick={() => updateScore(match, "home", -1)}
                          disabled={
                            match.status != MatchStatus.LIVE ||
                            !canManageScoreboard
                          }
                        >
                          <Minus className="h-3 w-3" />
                        </Button>

                        <Input
                          type="number"
                          value={displayedHomeScore}
                          onChange={(event) =>
                            updateManualInputScore(
                              match,
                              "home",
                              event.target.value,
                            )
                          }
                          className={SCORE_INPUT_CLASS_NAME}
                          disabled={
                            match.status != MatchStatus.LIVE ||
                            !canManageScoreboard
                          }
                        />

                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-10"
                          onClick={() => updateScore(match, "home", 1)}
                          disabled={
                            match.status != MatchStatus.LIVE ||
                            !canManageScoreboard
                          }
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>

                      <span className="font-display text-xl text-muted-foreground">
                        ×
                      </span>

                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-10"
                          onClick={() => updateScore(match, "away", -1)}
                          disabled={
                            match.status != MatchStatus.LIVE ||
                            !canManageScoreboard
                          }
                        >
                          <Minus className="h-3 w-3" />
                        </Button>

                        <Input
                          type="number"
                          value={displayedAwayScore}
                          onChange={(event) =>
                            updateManualInputScore(
                              match,
                              "away",
                              event.target.value,
                            )
                          }
                          className={SCORE_INPUT_CLASS_NAME}
                          disabled={
                            match.status != MatchStatus.LIVE ||
                            !canManageScoreboard
                          }
                        />

                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-10"
                          onClick={() => updateScore(match, "away", 1)}
                          disabled={
                            match.status != MatchStatus.LIVE ||
                            !canManageScoreboard
                          }
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="hidden grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-6 sm:grid">
                    <div className="min-w-0 text-right">
                      <p className="truncate font-display font-bold">
                        {match.home_team?.name}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-10"
                          onClick={() => updateScore(match, "home", -1)}
                          disabled={
                            match.status != MatchStatus.LIVE ||
                            !canManageScoreboard
                          }
                        >
                          <Minus className="h-3 w-3" />
                        </Button>

                        <Input
                          type="number"
                          value={displayedHomeScore}
                          onChange={(event) =>
                            updateManualInputScore(
                              match,
                              "home",
                              event.target.value,
                            )
                          }
                          className={SCORE_INPUT_CLASS_NAME}
                          disabled={
                            match.status != MatchStatus.LIVE ||
                            !canManageScoreboard
                          }
                        />

                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-10"
                          onClick={() => updateScore(match, "home", 1)}
                          disabled={
                            match.status != MatchStatus.LIVE ||
                            !canManageScoreboard
                          }
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>

                      <span className="font-display text-xl text-muted-foreground">
                        ×
                      </span>

                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-10"
                          onClick={() => updateScore(match, "away", -1)}
                          disabled={
                            match.status != MatchStatus.LIVE ||
                            !canManageScoreboard
                          }
                        >
                          <Minus className="h-3 w-3" />
                        </Button>

                        <Input
                          type="number"
                          value={displayedAwayScore}
                          onChange={(event) =>
                            updateManualInputScore(
                              match,
                              "away",
                              event.target.value,
                            )
                          }
                          className={SCORE_INPUT_CLASS_NAME}
                          disabled={
                            match.status != MatchStatus.LIVE ||
                            !canManageScoreboard
                          }
                        />

                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-10"
                          onClick={() => updateScore(match, "away", 1)}
                          disabled={
                            match.status != MatchStatus.LIVE ||
                            !canManageScoreboard
                          }
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate font-display font-bold">
                        {match.away_team?.name}
                      </p>
                    </div>
                  </div>

                  {isSetMatch && setSummary.length > 0 ? (
                    <div className="space-y-2 app-card-emphasis p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Detalhamento por sets
                        </p>
                        <span className="text-xs font-medium text-muted-foreground">
                          Sets: {displayedSetWins.home_sets} ×{" "}
                          {displayedSetWins.away_sets}
                        </span>
                      </div>

                      <div className="space-y-1">
                        {setSummary.map((matchSetSummary) => {
                          const editableMatchSet =
                            closedMatchSets.find(
                              (matchSet) =>
                                matchSet.set_number ==
                                matchSetSummary.setNumber,
                            ) ?? null;
                          const isEditingSet =
                            editingSetDraft?.setNumber ==
                            matchSetSummary.setNumber;

                          if (isEditingSet && editingSetDraft) {
                            return (
                              <div
                                key={`${match.id}-set-summary-${matchSetSummary.setNumber}`}
                                className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-background/60 p-2 sm:flex-row sm:items-center"
                              >
                                <span className="min-w-14 text-xs font-medium text-muted-foreground">
                                  Set {matchSetSummary.setNumber}
                                </span>
                                <div className="flex flex-1 items-center justify-center gap-2">
                                  <span className="truncate text-xs font-medium">
                                    {match.home_team?.name}
                                  </span>
                                  <Input
                                    type="number"
                                    value={editingSetDraft.homePoints}
                                    onChange={(event) =>
                                      handleUpdateEditingRecordedSetScore(
                                        match.id,
                                        "home",
                                        event.target.value,
                                      )
                                    }
                                    className="h-8 w-16 shrink-0 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    disabled={!canManageScoreboard}
                                  />
                                  <span className="shrink-0 text-center text-xs text-muted-foreground">
                                    ×
                                  </span>
                                  <Input
                                    type="number"
                                    value={editingSetDraft.awayPoints}
                                    onChange={(event) =>
                                      handleUpdateEditingRecordedSetScore(
                                        match.id,
                                        "away",
                                        event.target.value,
                                      )
                                    }
                                    className="h-8 w-16 shrink-0 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    disabled={!canManageScoreboard}
                                  />
                                  <span className="truncate text-xs font-medium">
                                    {match.away_team?.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 self-end sm:self-auto">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-10"
                                    onClick={() =>
                                      void handleSaveEditedRecordedSet(match)
                                    }
                                    disabled={!canManageScoreboard}
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-10"
                                    onClick={() =>
                                      handleCancelEditingRecordedSet(match.id)
                                    }
                                    disabled={!canManageScoreboard}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-10 text-destructive hover:text-destructive"
                                    onClick={() =>
                                      void handleDeleteRecordedSet(
                                        match,
                                        editingSetDraft.setNumber,
                                      )
                                    }
                                    disabled={!canManageScoreboard}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={`${match.id}-set-summary-${matchSetSummary.setNumber}`}
                              className="flex items-center justify-between gap-2 app-card-muted px-2 py-1.5"
                            >
                              <p className="min-w-0 text-xs text-muted-foreground">
                                {matchSetSummary.text}
                              </p>
                              {match.status == MatchStatus.LIVE &&
                              editableMatchSet ? (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 shrink-0"
                                  onClick={() =>
                                    handleStartEditingRecordedSet(
                                      match.id,
                                      editableMatchSet,
                                    )
                                  }
                                  disabled={!canManageScoreboard}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {supportsCards && handballMatch ? (
                    <div className="glass-panel-muted p-3 sm:hidden">
                      <div className="grid grid-cols-2 divide-x divide-border/60">
                        {handballMobileTeamColumns.map((teamColumn) => (
                          <div
                            key={`${match.id}-${teamColumn.side}-handball-mobile`}
                            className="min-w-0 px-2 first:pl-0 last:pr-0"
                          >
                            <p className="mb-3 truncate text-center text-xs font-bold uppercase text-foreground">
                              {teamColumn.teamName}
                            </p>

                            <div className="space-y-3">
                              {teamColumn.counters.map((counter) => (
                                <div
                                  key={`${match.id}-${teamColumn.side}-${counter.color}`}
                                  className="space-y-1"
                                >
                                  <p
                                    className={`truncate text-[10px] font-semibold uppercase ${counter.className}`}
                                  >
                                    {counter.label}
                                  </p>

                                  <div className="grid grid-cols-[2.75rem_3rem_2.75rem] items-center justify-center gap-1.5">
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      className="h-10 w-11"
                                      onClick={() =>
                                        updateCards(
                                          match,
                                          teamColumn.side,
                                          counter.color,
                                          -1,
                                        )
                                      }
                                      disabled={
                                        match.status != MatchStatus.LIVE ||
                                        !canManageScoreboard
                                      }
                                    >
                                      <Minus className="h-3 w-3" />
                                    </Button>

                                    <Input
                                      type="number"
                                      value={counter.value}
                                      onChange={(event) =>
                                        updateManualInputCards(
                                          match,
                                          teamColumn.side,
                                          counter.color,
                                          event.target.value,
                                        )
                                      }
                                      className="h-10 w-12 app-input-field px-1 text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                      disabled={
                                        match.status != MatchStatus.LIVE ||
                                        !canManageScoreboard
                                      }
                                    />

                                    <Button
                                      size="icon"
                                      variant="outline"
                                      className="h-10 w-11"
                                      onClick={() =>
                                        updateCards(
                                          match,
                                          teamColumn.side,
                                          counter.color,
                                          1,
                                        )
                                      }
                                      disabled={
                                        match.status != MatchStatus.LIVE ||
                                        !canManageScoreboard
                                      }
                                    >
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {supportsCards ? (
                    <div
                      className={`relative glass-panel-muted p-3 after:pointer-events-none after:absolute after:inset-y-3 after:left-1/2 after:hidden after:border-l after:border-border sm:after:block ${
                        handballMatch ? "hidden sm:block" : ""
                      }`}
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <p className="truncate text-xs font-semibold uppercase text-muted-foreground">
                            {match.home_team?.name}
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <p className="text-[11px] font-semibold uppercase text-amber-700 dark:text-amber-500">
                                Cartões Amarelos
                              </p>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-10"
                                  onClick={() =>
                                    updateCards(match, "home", "yellow", -1)
                                  }
                                  disabled={
                                    match.status != MatchStatus.LIVE ||
                                    !canManageScoreboard
                                  }
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <Input
                                  type="number"
                                  value={matchDraft.homeYellowCards}
                                  onChange={(event) =>
                                    updateManualInputCards(
                                      match,
                                      "home",
                                      "yellow",
                                      event.target.value,
                                    )
                                  }
                                  className="h-9 w-20 app-input-field text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  disabled={
                                    match.status != MatchStatus.LIVE ||
                                    !canManageScoreboard
                                  }
                                />
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-10"
                                  onClick={() =>
                                    updateCards(match, "home", "yellow", 1)
                                  }
                                  disabled={
                                    match.status != MatchStatus.LIVE ||
                                    !canManageScoreboard
                                  }
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <p className="text-[11px] font-semibold uppercase app-text-status-danger">
                                Cartões Vermelhos
                              </p>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-10"
                                  onClick={() =>
                                    updateCards(match, "home", "red", -1)
                                  }
                                  disabled={
                                    match.status != MatchStatus.LIVE ||
                                    !canManageScoreboard
                                  }
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <Input
                                  type="number"
                                  value={matchDraft.homeRedCards}
                                  onChange={(event) =>
                                    updateManualInputCards(
                                      match,
                                      "home",
                                      "red",
                                      event.target.value,
                                    )
                                  }
                                  className="h-9 w-20 app-input-field text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  disabled={
                                    match.status != MatchStatus.LIVE ||
                                    !canManageScoreboard
                                  }
                                />
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-10"
                                  onClick={() =>
                                    updateCards(match, "home", "red", 1)
                                  }
                                  disabled={
                                    match.status != MatchStatus.LIVE ||
                                    !canManageScoreboard
                                  }
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="truncate text-xs font-semibold uppercase text-muted-foreground">
                            {match.away_team?.name}
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <p className="text-[11px] font-semibold uppercase text-amber-700 dark:text-amber-500">
                                Cartões Amarelos
                              </p>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-10"
                                  onClick={() =>
                                    updateCards(match, "away", "yellow", -1)
                                  }
                                  disabled={
                                    match.status != MatchStatus.LIVE ||
                                    !canManageScoreboard
                                  }
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <Input
                                  type="number"
                                  value={matchDraft.awayYellowCards}
                                  onChange={(event) =>
                                    updateManualInputCards(
                                      match,
                                      "away",
                                      "yellow",
                                      event.target.value,
                                    )
                                  }
                                  className="h-9 w-20 app-input-field text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  disabled={
                                    match.status != MatchStatus.LIVE ||
                                    !canManageScoreboard
                                  }
                                />
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-10"
                                  onClick={() =>
                                    updateCards(match, "away", "yellow", 1)
                                  }
                                  disabled={
                                    match.status != MatchStatus.LIVE ||
                                    !canManageScoreboard
                                  }
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <p className="text-[11px] font-semibold uppercase app-text-status-danger">
                                Cartões Vermelhos
                              </p>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-10"
                                  onClick={() =>
                                    updateCards(match, "away", "red", -1)
                                  }
                                  disabled={
                                    match.status != MatchStatus.LIVE ||
                                    !canManageScoreboard
                                  }
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <Input
                                  type="number"
                                  value={matchDraft.awayRedCards}
                                  onChange={(event) =>
                                    updateManualInputCards(
                                      match,
                                      "away",
                                      "red",
                                      event.target.value,
                                    )
                                  }
                                  className="h-9 w-20 app-input-field text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  disabled={
                                    match.status != MatchStatus.LIVE ||
                                    !canManageScoreboard
                                  }
                                />
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-10"
                                  onClick={() =>
                                    updateCards(match, "away", "red", 1)
                                  }
                                  disabled={
                                    match.status != MatchStatus.LIVE ||
                                    !canManageScoreboard
                                  }
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {handballMatch ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <p className="text-[11px] font-semibold uppercase text-sky-700">
                                  Cartões Azuis
                                </p>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-10"
                                    onClick={() =>
                                      updateCards(match, "home", "blue", -1)
                                    }
                                    disabled={
                                      match.status != MatchStatus.LIVE ||
                                      !canManageScoreboard
                                    }
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <Input
                                    type="number"
                                    value={matchDraft.homeBlueCards}
                                    onChange={(event) =>
                                      updateManualInputCards(
                                        match,
                                        "home",
                                        "blue",
                                        event.target.value,
                                      )
                                    }
                                    className="h-9 w-20 app-input-field text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    disabled={
                                      match.status != MatchStatus.LIVE ||
                                      !canManageScoreboard
                                    }
                                  />
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-10"
                                    onClick={() =>
                                      updateCards(match, "home", "blue", 1)
                                    }
                                    disabled={
                                      match.status != MatchStatus.LIVE ||
                                      !canManageScoreboard
                                    }
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[11px] font-semibold uppercase text-slate-700 dark:text-slate-300">
                                  Penalidades de 2 Min
                                </p>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-10"
                                    onClick={() =>
                                      updateCards(
                                        match,
                                        "home",
                                        "twoMinute",
                                        -1,
                                      )
                                    }
                                    disabled={
                                      match.status != MatchStatus.LIVE ||
                                      !canManageScoreboard
                                    }
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <Input
                                    type="number"
                                    value={matchDraft.homeTwoMinutePenalties}
                                    onChange={(event) =>
                                      updateManualInputCards(
                                        match,
                                        "home",
                                        "twoMinute",
                                        event.target.value,
                                      )
                                    }
                                    className="h-9 w-20 app-input-field text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    disabled={
                                      match.status != MatchStatus.LIVE ||
                                      !canManageScoreboard
                                    }
                                  />
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-10"
                                    onClick={() =>
                                      updateCards(match, "home", "twoMinute", 1)
                                    }
                                    disabled={
                                      match.status != MatchStatus.LIVE ||
                                      !canManageScoreboard
                                    }
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <p className="text-[11px] font-semibold uppercase text-sky-700">
                                  Cartões Azuis
                                </p>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-10"
                                    onClick={() =>
                                      updateCards(match, "away", "blue", -1)
                                    }
                                    disabled={
                                      match.status != MatchStatus.LIVE ||
                                      !canManageScoreboard
                                    }
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <Input
                                    type="number"
                                    value={matchDraft.awayBlueCards}
                                    onChange={(event) =>
                                      updateManualInputCards(
                                        match,
                                        "away",
                                        "blue",
                                        event.target.value,
                                      )
                                    }
                                    className="h-9 w-20 app-input-field text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    disabled={
                                      match.status != MatchStatus.LIVE ||
                                      !canManageScoreboard
                                    }
                                  />
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-10"
                                    onClick={() =>
                                      updateCards(match, "away", "blue", 1)
                                    }
                                    disabled={
                                      match.status != MatchStatus.LIVE ||
                                      !canManageScoreboard
                                    }
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[11px] font-semibold uppercase text-slate-700 dark:text-slate-300">
                                  Penalidades de 2 Min
                                </p>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-10"
                                    onClick={() =>
                                      updateCards(
                                        match,
                                        "away",
                                        "twoMinute",
                                        -1,
                                      )
                                    }
                                    disabled={
                                      match.status != MatchStatus.LIVE ||
                                      !canManageScoreboard
                                    }
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <Input
                                    type="number"
                                    value={matchDraft.awayTwoMinutePenalties}
                                    onChange={(event) =>
                                      updateManualInputCards(
                                        match,
                                        "away",
                                        "twoMinute",
                                        event.target.value,
                                      )
                                    }
                                    className="h-9 w-20 app-input-field text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    disabled={
                                      match.status != MatchStatus.LIVE ||
                                      !canManageScoreboard
                                    }
                                  />
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-10"
                                    onClick={() =>
                                      updateCards(match, "away", "twoMinute", 1)
                                    }
                                    disabled={
                                      match.status != MatchStatus.LIVE ||
                                      !canManageScoreboard
                                    }
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {isFullQueueVisible ? (
              <div className="order-4">
                <AppPaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  itemsPerPage={itemsPerPage}
                  onItemsPerPageChange={setItemsPerPage}
                />
              </div>
            ) : null}
          </>
        )}
      </div>

      <AlertDialog
        open={showFinishConfirmDialog}
        onOpenChange={setShowFinishConfirmDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar jogo</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja encerrar o jogo e salvar o placar atual? Esta ação registra
              o resultado definitivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingFinishMatch(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingFinishMatch) {
                  void handleFinish(pendingFinishMatch);
                }
                setPendingFinishMatch(null);
              }}
            >
              Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showPenaltyShootoutDialog}
        onOpenChange={(open) => {
          if (!open) {
            closePenaltyShootoutDialog();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrar pênaltis</AlertDialogTitle>
            <AlertDialogDescription>
              O jogo terminou empatado no tempo normal. Informe o placar dos
              pênaltis para definir o vencedor oficial.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {pendingPenaltyShootoutMatch?.home_team?.name ?? "Casa"}
              </p>
              <Input
                type="number"
                min={0}
                step={1}
                value={penaltyShootoutDraft.homePenaltyScore}
                onChange={(event) =>
                  setPenaltyShootoutDraft((currentDraft) => ({
                    ...currentDraft,
                    homePenaltyScore: resolvePenaltyShootoutInputValue(
                      event.target.value,
                    ),
                  }))
                }
                className="app-input-field h-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                aria-label="Gols nos pênaltis da casa"
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {pendingPenaltyShootoutMatch?.away_team?.name ?? "Visitante"}
              </p>
              <Input
                type="number"
                min={0}
                step={1}
                value={penaltyShootoutDraft.awayPenaltyScore}
                onChange={(event) =>
                  setPenaltyShootoutDraft((currentDraft) => ({
                    ...currentDraft,
                    awayPenaltyScore: resolvePenaltyShootoutInputValue(
                      event.target.value,
                    ),
                  }))
                }
                className="app-input-field h-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                aria-label="Gols nos pênaltis do visitante"
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={closePenaltyShootoutDialog}>
              Cancelar
            </AlertDialogCancel>
            <Button
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                void handleConfirmPenaltyShootout();
              }}
            >
              Salvar pênaltis e encerrar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showReturnToScheduledConfirmDialog}
        onOpenChange={setShowReturnToScheduledConfirmDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Voltar ao agendamento</AlertDialogTitle>
            <AlertDialogDescription>
              Ao voltar ao agendamento, todos os dados inseridos (placar, sets e
              cartões) serão perdidos. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setPendingReturnToScheduledMatch(null)}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingReturnToScheduledMatch) {
                  void handleReturnToScheduled(pendingReturnToScheduledMatch);
                }
              }}
            >
              Voltar ao agendamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showReturnIndividualSessionDialog}
        onOpenChange={setShowReturnIndividualSessionDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Voltar sessão para agendada</AlertDialogTitle>
            <AlertDialogDescription>
              A sessão deixará de estar ao vivo. Os resultados ainda não
              encerrados serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setPendingReturnIndividualSessionId(null)}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingReturnIndividualSessionId) {
                  void runSessionAction(
                    pendingReturnIndividualSessionId,
                    "return",
                  );
                  setPendingReturnIndividualSessionId(null);
                }
              }}
            >
              Voltar para agendada
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AdminIndividualSessionResultsDialog
        open={resultsDialogSessionId != null}
        onOpenChange={(open) => {
          if (!open) {
            setResultsDialogSessionId(null);
          }
        }}
        session={
          individualSessions.find(
            (session) => session.id == resultsDialogSessionId,
          ) ?? null
        }
        events={individualEvents.filter(
          (event) => event.session_id == resultsDialogSessionId,
        )}
        entries={individualEntries.filter(
          (entry) =>
            !(
              individualDisqualifiedTeamIdsByEventId[entry.event_id]?.has(
                entry.team_id,
              ) ?? false
            ),
        )}
        athletes={individualAthletes}
        teams={
          resultsDialogSessionId
            ? (sessionParticipantsBySessionId[resultsDialogSessionId] ?? []).filter(
                (team) =>
                  !(
                    individualDisqualifiedTeamIdsBySessionId[
                      resultsDialogSessionId
                    ]?.has(team.id) ?? false
                  ),
              )
            : []
        }
        canManage={
          canManageScoreboard &&
          championshipStatus == ChampionshipStatus.IN_PROGRESS &&
          individualSessions.some(
            (session) =>
              session.id == resultsDialogSessionId && session.status == "LIVE",
          )
        }
        onSaved={refetchIndividualEvents}
      />
    </div>
  );
}
