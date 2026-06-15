import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Check, EyeOff, Loader2, Minus, Pencil, Play, Plus, RotateCcw, Square, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getBracketCourtSports,
  saveMatchSets,
  swapChampionshipKnockoutBracketTeams,
} from "@/domain/championship-brackets/championshipBracket.repository";
import type {
  BracketDayCourtSports,
  ChampionshipBracketScheduleDayInput,
  MatchSetInput,
} from "@/domain/championship-brackets/championshipBracket.types";
import type { ChampionshipBracketView, ChampionshipSport, Match, Sport } from "@/lib/types";
import { AppBadgeTone, BracketPhase, ChampionshipSportResultRule, ChampionshipStatus, MatchNaipe, MatchStatus } from "@/lib/enums";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AppBadge } from "@/components/ui/app-badge";
import { resolveCourtPriorityRank } from "@/components/admin/adminCourtPriority.utils";
import {
  AppPaginationControls,
  DEFAULT_PAGINATION_ITEMS_PER_PAGE,
} from "@/components/ui/app-pagination-controls";
import {
  type MatchBracketContext,
  MATCH_NAIPE_LABELS,
  resolveMatchQueueLabel,
  resolveMatchNaipeBadgeTone,
  resolveMatchNaipeLabel,
  resolveRecordedMatchSets,
  resolveMatchScheduledDateValue,
  resolveMatchSetSummary,
  resolveMatchStartedAtLabel,
  resolveMatchTieBreakRuleLabel,
} from "@/lib/championship";
import { scrollToTopOfPage } from "@/lib/scroll";

interface Props {
  matches: Match[];
  championshipStatus: ChampionshipStatus;
  championshipSports: ChampionshipSport[];
  championshipBracketView: ChampionshipBracketView;
  matchBracketContextByMatchId: Record<string, MatchBracketContext>;
  matchRepresentationByMatchId?: Record<string, string>;
  visualQueuePositionByMatchId?: Record<string, number>;
  estimatedStartTimeByMatchId?: Record<string, string>;
  isFetchingMatches?: boolean;
  onRefetch: (options?: { showLoading?: boolean; showFetching?: boolean }) => void | Promise<void>;
  onRefetchChampionshipBracket: () => void;
  canManageScoreboard: boolean;
}

interface MatchControlDraft {
  homeScore: number;
  awayScore: number;
  homeYellowCards: number;
  homeRedCards: number;
  awayYellowCards: number;
  awayRedCards: number;
}

interface MatchSetEditDraft {
  setNumber: number;
  homePoints: number;
  awayPoints: number;
}


type SaveStatus = "saving" | "saved" | "error";
type MatchSide = "home" | "away";
type CardColor = "yellow" | "red";

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
const NAIPE_OPTIONS: MatchNaipe[] = [MatchNaipe.MASCULINO, MatchNaipe.FEMININO, MatchNaipe.MISTO];

const MATCH_CONTROL_STATUS_SORT_ORDER: Record<MatchStatus, number> = {
  [MatchStatus.LIVE]: 0,
  [MatchStatus.SCHEDULED]: 1,
  [MatchStatus.FINISHED]: 2,
};
const MATCH_CONTROL_AUTOSAVE_DEBOUNCE_IN_MILLISECONDS = 150;
const MATCH_CONTROL_PERSISTED_DRAFT_STORAGE_KEY = "admin_match_control_draft_by_match_id";
const MATCH_CONTROL_PERSISTED_DRAFT_TTL_IN_MILLISECONDS = 10 * 60 * 1000;
const WALKOVER_NONE_OPTION_VALUE = "__WALKOVER_NONE_OPTION__";
const SCORE_INPUT_CLASS_NAME =
  "score-text h-12 w-16 min-w-16 app-input-field px-1 text-center font-display text-2xl font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";


interface PersistedMatchControlDraftEntry {
  draft: MatchControlDraft;
  updatedAt: number;
}

function areMatchControlDraftsEqual(firstDraft: MatchControlDraft, secondDraft: MatchControlDraft): boolean {
  return (
    firstDraft.homeScore == secondDraft.homeScore &&
    firstDraft.awayScore == secondDraft.awayScore &&
    firstDraft.homeYellowCards == secondDraft.homeYellowCards &&
    firstDraft.homeRedCards == secondDraft.homeRedCards &&
    firstDraft.awayYellowCards == secondDraft.awayYellowCards &&
    firstDraft.awayRedCards == secondDraft.awayRedCards
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
    draftCandidate.awayYellowCards,
    draftCandidate.awayRedCards,
  ];

  return requiredNumericFields.every((fieldValue) => typeof fieldValue == "number" && Number.isFinite(fieldValue));
}

function readPersistedMatchControlDraftByMatchId(): Record<string, PersistedMatchControlDraftEntry> {
  if (typeof window == "undefined") {
    return {};
  }

  try {
    const persistedPayload = window.sessionStorage.getItem(MATCH_CONTROL_PERSISTED_DRAFT_STORAGE_KEY);

    if (!persistedPayload) {
      return {};
    }

    const parsedPayload = JSON.parse(persistedPayload) as Record<string, unknown>;

    if (!parsedPayload || typeof parsedPayload != "object" || Array.isArray(parsedPayload)) {
      return {};
    }

    const now = Date.now();
    const sanitizedEntries = Object.entries(parsedPayload).reduce<Record<string, PersistedMatchControlDraftEntry>>(
      (carry, [matchId, entry]) => {
        if (!entry || typeof entry != "object" || Array.isArray(entry)) {
          return carry;
        }

        const entryCandidate = entry as Record<string, unknown>;
        const updatedAt = entryCandidate.updatedAt;
        const draft = entryCandidate.draft;

        if (typeof updatedAt != "number" || !Number.isFinite(updatedAt) || now - updatedAt > MATCH_CONTROL_PERSISTED_DRAFT_TTL_IN_MILLISECONDS) {
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
      },
      {},
    );

    return sanitizedEntries;
  } catch {
    return {};
  }
}

function writePersistedMatchControlDraftByMatchId(persistedEntries: Record<string, PersistedMatchControlDraftEntry>): void {
  if (typeof window == "undefined") {
    return;
  }

  try {
    if (Object.keys(persistedEntries).length == 0) {
      window.sessionStorage.removeItem(MATCH_CONTROL_PERSISTED_DRAFT_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(MATCH_CONTROL_PERSISTED_DRAFT_STORAGE_KEY, JSON.stringify(persistedEntries));
  } catch {
    // Ignore storage errors (quota/private mode) and keep runtime state only.
  }
}

function resolveDefaultMatchControlDraft(match: Match, shouldUseCurrentSetScore: boolean): MatchControlDraft {
  return {
    homeScore: shouldUseCurrentSetScore ? match.current_set_home_score ?? 0 : match.home_score,
    awayScore: shouldUseCurrentSetScore ? match.current_set_away_score ?? 0 : match.away_score,
    homeYellowCards: match.home_yellow_cards,
    homeRedCards: match.home_red_cards,
    awayYellowCards: match.away_yellow_cards,
    awayRedCards: match.away_red_cards,
  };
}

function parseNonNegativeNumber(value: string): number {
  const parsedValue = Number(value);

  if (Number.isNaN(parsedValue)) {
    return 0;
  }

  return Math.max(0, parsedValue);
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
    shouldUseCurrentSetScore: boolean;
  },
) {
  return {
    home_score: options.shouldUseCurrentSetScore ? match.home_score : Math.max(0, draft.homeScore),
    away_score: options.shouldUseCurrentSetScore ? match.away_score : Math.max(0, draft.awayScore),
    current_set_home_score: options.shouldUseCurrentSetScore ? Math.max(0, draft.homeScore) : null,
    current_set_away_score: options.shouldUseCurrentSetScore ? Math.max(0, draft.awayScore) : null,
    home_yellow_cards: options.supportsCards ? Math.max(0, draft.homeYellowCards) : 0,
    home_red_cards: options.supportsCards ? Math.max(0, draft.homeRedCards) : 0,
    away_yellow_cards: options.supportsCards ? Math.max(0, draft.awayYellowCards) : 0,
    away_red_cards: options.supportsCards ? Math.max(0, draft.awayRedCards) : 0,
  };
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
    (error.message.includes("current_set_home_score") || error.message.includes("current_set_away_score"))
  ) {
    return "A migration 20260316013000_add_match_live_set_progress_and_tie_break_metadata.sql ainda não foi aplicada no banco. Rode npx supabase db push e recarregue o schema.";
  }

  return fallbackMessage;
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

export function AdminMatchControl({
  matches,
  championshipStatus,
  championshipSports,
  championshipBracketView,
  matchBracketContextByMatchId,
  matchRepresentationByMatchId = {},
  visualQueuePositionByMatchId = {},
  estimatedStartTimeByMatchId = {},
  isFetchingMatches = false,
  onRefetch,
  onRefetchChampionshipBracket,
  canManageScoreboard,
}: Props) {
  const [matchDraftById, setMatchDraftById] = useState<Record<string, MatchControlDraft>>({});
  const [isDraftDirtyByMatchId, setIsDraftDirtyByMatchId] = useState<Record<string, boolean>>({});
  const [matchSetsByMatchId, setMatchSetsByMatchId] = useState<Record<string, MatchSetInput[]>>({});
  const [editingSetDraftByMatchId, setEditingSetDraftByMatchId] = useState<Record<string, MatchSetEditDraft | undefined>>({});
  const [saveStatusByMatchId, setSaveStatusByMatchId] = useState<Record<string, SaveStatus | undefined>>({});
  const [walkoverLoserTeamIdByMatchId, setWalkoverLoserTeamIdByMatchId] = useState<Record<string, string | undefined>>({});
  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [naipeFilter, setNaipeFilter] = useState<string>(ALL_CONTROL_NAIPE_FILTER);
  const [showOnlyLiveMatches, setShowOnlyLiveMatches] = useState(false);
  const [showFinishConfirmDialog, setShowFinishConfirmDialog] = useState(false);
  const [pendingFinishMatch, setPendingFinishMatch] = useState<Match | null>(null);
  const [showReturnToScheduledConfirmDialog, setShowReturnToScheduledConfirmDialog] = useState(false);
  const [pendingReturnToScheduledMatch, setPendingReturnToScheduledMatch] = useState<Match | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGINATION_ITEMS_PER_PAGE);

  const isDraftDirtyByMatchIdRef = useRef<Record<string, boolean>>({});
  const persistedDraftByMatchIdRef = useRef<Record<string, PersistedMatchControlDraftEntry>>(
    readPersistedMatchControlDraftByMatchId(),
  );
  const matchByIdRef = useRef<Record<string, Match>>({});
  const matchDraftByIdRef = useRef<Record<string, MatchControlDraft>>({});
  const canManageScoreboardRef = useRef(canManageScoreboard);
  const isSetRuleMatchRef = useRef<(match: Match) => boolean>(() => false);
  const doesMatchSupportCardsRef = useRef<(match: Match) => boolean>(() => false);
  const saveTimeoutByMatchIdRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const clearStatusTimeoutByMatchIdRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const hasHandledPaginationScrollRef = useRef(false);
  const hasInitializedSportFilterRef = useRef(false);
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

  const persistMatchDraftInStorage = useCallback((matchId: string, draft: MatchControlDraft) => {
    persistedDraftByMatchIdRef.current = {
      ...persistedDraftByMatchIdRef.current,
      [matchId]: {
        draft,
        updatedAt: Date.now(),
      },
    };
    writePersistedMatchControlDraftByMatchId(persistedDraftByMatchIdRef.current);
  }, []);

  const championshipSportResultRuleBySportId = useMemo(() => {
    const map = new Map<string, ChampionshipSportResultRule>();

    championshipSports.forEach((championshipSport) => {
      map.set(championshipSport.sport_id, championshipSport.result_rule);
    });

    return map;
  }, [championshipSports]);

  const isSetRuleMatch = useCallback((match: Match) => {
    return championshipSportResultRuleBySportId.get(match.sport_id) == ChampionshipSportResultRule.SETS;
  }, [championshipSportResultRuleBySportId]);

  const championshipSportSupportsCardsBySportId = useMemo(() => {
    const map = new Map<string, boolean>();

    championshipSports.forEach((championshipSport) => {
      map.set(championshipSport.sport_id, championshipSport.supports_cards);
    });

    return map;
  }, [championshipSports]);

  const doesMatchSupportCards = useCallback((match: Match) => {
    return championshipSportSupportsCardsBySportId.get(match.sport_id) == true || match.supports_cards;
  }, [championshipSportSupportsCardsBySportId]);

  useEffect(() => {
    isSetRuleMatchRef.current = isSetRuleMatch;
  }, [isSetRuleMatch]);

  useEffect(() => {
    doesMatchSupportCardsRef.current = doesMatchSupportCards;
  }, [doesMatchSupportCards]);

  useEffect(() => {
    matchByIdRef.current = matches.reduce<Record<string, Match>>((carry, match) => {
      carry[match.id] = match;
      return carry;
    }, {});
  }, [matches]);

  useEffect(() => {
    setMatchDraftById((previousMatchDraftById) => {
      const nextMatchDraftById: Record<string, MatchControlDraft> = {};
      const currentDirtyByMatchId = isDraftDirtyByMatchIdRef.current;
      const now = Date.now();
      const nextPersistedDraftByMatchId = { ...persistedDraftByMatchIdRef.current };
      let hasPersistedDraftByMatchIdChanges = false;
      const currentMatchIds = new Set(matches.map((match) => match.id));

      matches.forEach((match) => {
        const shouldPreserveDirtyDraft = currentDirtyByMatchId[match.id] == true;
        const previousMatchDraft = previousMatchDraftById[match.id] ?? null;
        const resolvedDefaultDraft = resolveDefaultMatchControlDraft(match, isSetRuleMatch(match));
        const persistedDraftEntry = nextPersistedDraftByMatchId[match.id];
        const persistedDraft =
          persistedDraftEntry && now - persistedDraftEntry.updatedAt <= MATCH_CONTROL_PERSISTED_DRAFT_TTL_IN_MILLISECONDS
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

        if (previousMatchDraft && areMatchControlDraftsEqual(previousMatchDraft, resolvedDefaultDraft)) {
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

        if (persistedDraft && areMatchControlDraftsEqual(persistedDraft, resolvedDefaultDraft)) {
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
    setWalkoverLoserTeamIdByMatchId((previousWalkoverLoserTeamIdByMatchId) => {
      const nextWalkoverLoserTeamIdByMatchId = matches.reduce<Record<string, string | undefined>>((carry, match) => {
        if (match.status != MatchStatus.SCHEDULED && match.status != MatchStatus.LIVE) {
          return carry;
        }

        const selectedLoserTeamId = previousWalkoverLoserTeamIdByMatchId[match.id];
        const persistedLoserTeamId =
          match.is_walkover && (match.walkover_loser_team_id == match.home_team_id || match.walkover_loser_team_id == match.away_team_id)
            ? match.walkover_loser_team_id
            : null;
        const resolvedLoserTeamId = selectedLoserTeamId ?? persistedLoserTeamId ?? undefined;

        if (!resolvedLoserTeamId) {
          return carry;
        }

        if (resolvedLoserTeamId != match.home_team_id && resolvedLoserTeamId != match.away_team_id) {
          return carry;
        }

        carry[match.id] = resolvedLoserTeamId;
        return carry;
      }, {});

      const previousEntries = Object.entries(previousWalkoverLoserTeamIdByMatchId);
      const nextEntries = Object.entries(nextWalkoverLoserTeamIdByMatchId);

      if (previousEntries.length == nextEntries.length) {
        const hasChanges = previousEntries.some(([matchId, loserTeamId]) => loserTeamId != nextWalkoverLoserTeamIdByMatchId[matchId]);

        if (!hasChanges) {
          return previousWalkoverLoserTeamIdByMatchId;
        }
      }

      return nextWalkoverLoserTeamIdByMatchId;
    });
  }, [matches]);

  const controlSports = useMemo(() => {
    const sportById = new Map<string, Sport>();

    matches.forEach((match) => {
      if (match.sports && !sportById.has(match.sports.id)) {
        sportById.set(match.sports.id, match.sports);
      }
    });

    return [...sportById.values()].sort((leftSport, rightSport) => leftSport.name.localeCompare(rightSport.name));
  }, [matches]);

  useEffect(() => {
    if (!sportFilter) {
      return;
    }

    const selectedSportStillAvailable = controlSports.some((sport) => sport.id == sportFilter);

    if (!selectedSportStillAvailable) {
      setSportFilter(null);
    }
  }, [controlSports, sportFilter]);

  const championshipBracketScheduleDays = useMemo(() => {
    return resolveChampionshipBracketScheduleDays(championshipBracketView);
  }, [championshipBracketView]);

  const availableCourtsCountBySportAndDateKey = useMemo(() => {
    return championshipBracketScheduleDays.reduce<Record<string, number>>((carry, scheduleDay) => {
      scheduleDay.locations.forEach((location) => {
        location.courts.forEach((court) => {
          court.sport_ids.forEach((sportId) => {
            const sportAndDateKey = `${scheduleDay.date}:${sportId}`;
            carry[sportAndDateKey] = (carry[sportAndDateKey] ?? 0) + 1;
          });
        });
      });

      return carry;
    }, {});
  }, [championshipBracketScheduleDays]);

  const liveMatchesCountBySportAndDateKey = useMemo(() => {
    return matches.reduce<Record<string, number>>((carry, match) => {
      if (match.status != MatchStatus.LIVE) {
        return carry;
      }

      const scheduledDateValue = resolveMatchScheduledDateValue(match);

      if (!scheduledDateValue) {
        return carry;
      }

      const sportAndDateKey = `${scheduledDateValue}:${match.sport_id}`;
      carry[sportAndDateKey] = (carry[sportAndDateKey] ?? 0) + 1;
      return carry;
    }, {});
  }, [matches]);

  // Preferências de quadra lidas da tabela (fonte da verdade pós-geração),
  // não do payload_snapshot, que não reflete edições feitas na aba Agenda.
  const [bracketCourtSportsDays, setBracketCourtSportsDays] = useState<BracketDayCourtSports[]>([]);
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
      if (match.status != MatchStatus.SCHEDULED) {
        return carry;
      }

      const scheduledDateValue = resolveMatchScheduledDateValue(match);
      const courtSportsDay = scheduledDateValue ? courtSportsDayByDate[scheduledDateValue] : null;

      if (!courtSportsDay) {
        return carry;
      }

      const compatibleCourts = courtSportsDay.locations.flatMap((location) =>
        location.courts
          .map((court) => ({
            court,
            location,
            courtSport: court.sports.find((sportEntry) => sportEntry.sport_id == match.sport_id),
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
      carry[match.id] = `${suggestedCourt.court.name} • ${suggestedCourt.location.name}`;
      return carry;
    }, {});
  }, [bracketCourtSportsDays, matches]);

  // match_id → { id, competition_id, round_number } para lookup nos renders do KO
  const bracketMatchByMatchId = useMemo(() => {
    const map: Record<string, { id: string; competition_id: string; round_number: number }> = {};
    for (const competition of championshipBracketView.competitions ?? []) {
      for (const km of competition.knockout_matches ?? []) {
        if (km.match_id) {
          map[km.match_id] = { id: km.id, competition_id: competition.id, round_number: km.round_number };
        }
      }
    }
    return map;
  }, [championshipBracketView]);

  // competition_id → max round_number (= primeiro round jogado, ex: quartas numa chave de 8)
  const maxRoundByCompetitionId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const competition of championshipBracketView.competitions ?? []) {
      const max = Math.max(0, ...(competition.knockout_matches ?? []).map((km) => km.round_number));
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
        if (km.home_team_id && km.home_team_name) teams.push({ id: km.home_team_id, name: km.home_team_name });
        if (km.away_team_id && km.away_team_name) teams.push({ id: km.away_team_id, name: km.away_team_name });
      }
      map[competition.id] = teams;
    }
    return map;
  }, [championshipBracketView, maxRoundByCompetitionId]);

  useEffect(() => {
    const resolvedSetsByMatchId = matches.reduce<Record<string, MatchSetInput[]>>((carry, match) => {
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
      Object.entries(isDraftDirtyByMatchIdRef.current).forEach(([matchId, isDirty]) => {
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
          .update(resolveMatchUpdatePayload(match, matchDraft, {
            supportsCards: doesMatchSupportCardsRef.current(match),
            shouldUseCurrentSetScore: isSetRuleMatchRef.current(match),
          }))
          .eq("id", match.id);
      });

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
  }, [itemsPerPage, matches.length, naipeFilter, showOnlyLiveMatches, sportFilter]);

  useEffect(() => {
    if (!hasInitializedSportFilterRef.current) {
      hasInitializedSportFilterRef.current = true;
      return;
    }

    void onRefetch({ showFetching: true });

    const refetchConfirmationTimeout = setTimeout(() => {
      void onRefetch({ showFetching: true });
    }, 400);

    return () => {
      clearTimeout(refetchConfirmationTimeout);
    };
  }, [onRefetch, sportFilter]);

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
  }, [currentPage, itemsPerPage, onRefetch]);

  const getMatchDraft = useCallback((match: Match) => {
    return matchDraftById[match.id] ?? resolveDefaultMatchControlDraft(match, isSetRuleMatch(match));
  }, [isSetRuleMatch, matchDraftById]);

  const resolveClosedMatchSets = useCallback((match: Match) => {
    return matchSetsByMatchId[match.id] ?? resolveRecordedMatchSets(match);
  }, [matchSetsByMatchId]);

  const resolveDisplayedSetWins = useCallback((match: Match) => {
    const closedMatchSets = resolveClosedMatchSets(match);

    if (closedMatchSets.length > 0) {
      return resolveSetWins(closedMatchSets);
    }

    return {
      home_sets: match.home_score,
      away_sets: match.away_score,
    };
  }, [resolveClosedMatchSets]);

  const resolveSelectedWalkoverLoserTeamId = useCallback((match: Match) => {
    const selectedWalkoverLoserTeamId = walkoverLoserTeamIdByMatchId[match.id];

    if (!selectedWalkoverLoserTeamId) {
      return null;
    }

    if (selectedWalkoverLoserTeamId == match.home_team_id || selectedWalkoverLoserTeamId == match.away_team_id) {
      return selectedWalkoverLoserTeamId;
    }

    return null;
  }, [walkoverLoserTeamIdByMatchId]);

  const clearWalkoverSelection = useCallback((matchId: string) => {
    setWalkoverLoserTeamIdByMatchId((currentWalkoverLoserTeamIdByMatchId) => {
      if (!currentWalkoverLoserTeamIdByMatchId[matchId]) {
        return currentWalkoverLoserTeamIdByMatchId;
      }

      const nextWalkoverLoserTeamIdByMatchId = { ...currentWalkoverLoserTeamIdByMatchId };
      delete nextWalkoverLoserTeamIdByMatchId[matchId];
      return nextWalkoverLoserTeamIdByMatchId;
    });
  }, []);

  const handleUpdateWalkoverLoserTeamId = useCallback((match: Match, value: string) => {
    const resolvedWalkoverLoserTeamId = value.trim();

    if (
      resolvedWalkoverLoserTeamId &&
      resolvedWalkoverLoserTeamId != match.home_team_id &&
      resolvedWalkoverLoserTeamId != match.away_team_id
    ) {
      return;
    }

    setWalkoverLoserTeamIdByMatchId((currentWalkoverLoserTeamIdByMatchId) => {
      if (!resolvedWalkoverLoserTeamId) {
        if (!currentWalkoverLoserTeamIdByMatchId[match.id]) {
          return currentWalkoverLoserTeamIdByMatchId;
        }

        const nextWalkoverLoserTeamIdByMatchId = { ...currentWalkoverLoserTeamIdByMatchId };
        delete nextWalkoverLoserTeamIdByMatchId[match.id];
        return nextWalkoverLoserTeamIdByMatchId;
      }

      if (currentWalkoverLoserTeamIdByMatchId[match.id] == resolvedWalkoverLoserTeamId) {
        return currentWalkoverLoserTeamIdByMatchId;
      }

      return {
        ...currentWalkoverLoserTeamIdByMatchId,
        [match.id]: resolvedWalkoverLoserTeamId,
      };
    });
  }, []);

  const hasRecordedProgressForWalkover = useCallback((match: Match) => {
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

    return currentMatchDraft.homeScore > 0 || currentMatchDraft.awayScore > 0 || match.home_score > 0 || match.away_score > 0;
  }, [getMatchDraft, isSetRuleMatch, resolveClosedMatchSets]);

  const setMatchSaveStatus = (matchId: string, saveStatus: SaveStatus | undefined) => {
    setSaveStatusByMatchId((previousStatusByMatchId) => ({
      ...previousStatusByMatchId,
      [matchId]: saveStatus,
    }));
  };

  const scheduleClearSavedStatus = (matchId: string) => {
    const clearStatusTimeoutReference = clearStatusTimeoutByMatchIdRef.current[matchId];

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

  const persistMatchDraft = async (match: Match, matchDraft: MatchControlDraft) => {
    if (!canManageScoreboard) {
      return false;
    }

    setMatchSaveStatus(match.id, "saving");

    const { error } = await supabase
      .from("matches")
      .update(resolveMatchUpdatePayload(match, matchDraft, {
        supportsCards: doesMatchSupportCards(match),
        shouldUseCurrentSetScore: isSetRuleMatch(match),
      }))
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
        previousMatchDraftById[match.id] ?? resolveDefaultMatchControlDraft(match, isSetRuleMatch(match));
      const nextMatchDraft = {
        ...currentMatchDraft,
        homeScore:
          side == "home" ? Math.max(0, currentMatchDraft.homeScore + delta) : currentMatchDraft.homeScore,
        awayScore:
          side == "away" ? Math.max(0, currentMatchDraft.awayScore + delta) : currentMatchDraft.awayScore,
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

  const updateManualInputScore = (match: Match, side: MatchSide, value: string) => {
    if (match.status != MatchStatus.LIVE) {
      return;
    }

    const parsedValue = parseNonNegativeNumber(value);

    setMatchDraftById((previousMatchDraftById) => {
      const currentMatchDraft =
        previousMatchDraftById[match.id] ?? resolveDefaultMatchControlDraft(match, isSetRuleMatch(match));
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

  const updateCards = (match: Match, side: MatchSide, color: CardColor, delta: number) => {
    if (match.status != MatchStatus.LIVE || !doesMatchSupportCards(match)) {
      return;
    }

    setMatchDraftById((previousMatchDraftById) => {
      const currentMatchDraft =
        previousMatchDraftById[match.id] ?? resolveDefaultMatchControlDraft(match, isSetRuleMatch(match));
      const nextMatchDraft = { ...currentMatchDraft };

      if (side == "home" && color == "yellow") {
        nextMatchDraft.homeYellowCards = Math.max(0, currentMatchDraft.homeYellowCards + delta);
      } else if (side == "home" && color == "red") {
        nextMatchDraft.homeRedCards = Math.max(0, currentMatchDraft.homeRedCards + delta);
      } else if (side == "away" && color == "yellow") {
        nextMatchDraft.awayYellowCards = Math.max(0, currentMatchDraft.awayYellowCards + delta);
      } else {
        nextMatchDraft.awayRedCards = Math.max(0, currentMatchDraft.awayRedCards + delta);
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

  const updateManualInputCards = (match: Match, side: MatchSide, color: CardColor, value: string) => {
    if (match.status != MatchStatus.LIVE || !doesMatchSupportCards(match)) {
      return;
    }

    const parsedValue = parseNonNegativeNumber(value);

    setMatchDraftById((previousMatchDraftById) => {
      const currentMatchDraft =
        previousMatchDraftById[match.id] ?? resolveDefaultMatchControlDraft(match, isSetRuleMatch(match));
      const nextMatchDraft = { ...currentMatchDraft };

      if (side == "home" && color == "yellow") {
        nextMatchDraft.homeYellowCards = parsedValue;
      } else if (side == "home" && color == "red") {
        nextMatchDraft.homeRedCards = parsedValue;
      } else if (side == "away" && color == "yellow") {
        nextMatchDraft.awayYellowCards = parsedValue;
      } else {
        nextMatchDraft.awayRedCards = parsedValue;
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

  const handleStartEditingRecordedSet = (matchId: string, matchSet: MatchSetInput) => {
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
    if (!canManageScoreboard || match.status != MatchStatus.LIVE || !isSetRuleMatch(match)) {
      return;
    }

    const closedMatchSets = resolveClosedMatchSets(match);
    const nextMatchSets = closedMatchSets.filter((matchSet) => matchSet.set_number != setNumber);
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
          homePoints: side == "home" ? parsedValue : currentEditingSetDraft.homePoints,
          awayPoints: side == "away" ? parsedValue : currentEditingSetDraft.awayPoints,
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
    if (!canManageScoreboard || match.status != MatchStatus.LIVE || !isSetRuleMatch(match)) {
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
    if (!canManageScoreboard || match.status != MatchStatus.LIVE || !isSetRuleMatch(match)) {
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
        start_time: null,
        home_score: 0,
        away_score: 0,
        current_set_home_score: null,
        current_set_away_score: null,
        is_walkover: false,
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
      toast.error("Só é possível iniciar jogos quando o campeonato estiver Em andamento.");
      return;
    }

    const match = matches.find((currentMatch) => currentMatch.id == matchId);

    if (!match) {
      return;
    }

    const scheduledDateValue = resolveMatchScheduledDateValue(match);
    const sportAndDateKey = scheduledDateValue ? `${scheduledDateValue}:${match.sport_id}` : null;

    if (sportAndDateKey) {
      const availableCourtsCount = availableCourtsCountBySportAndDateKey[sportAndDateKey] ?? 0;
      const liveMatchesCount = liveMatchesCountBySportAndDateKey[sportAndDateKey] ?? 0;

      if (availableCourtsCount > 0 && liveMatchesCount >= availableCourtsCount) {
        toast.error("Todas as quadras compatíveis desta modalidade já estão ocupadas neste dia.");
        return;
      }
    }

    const { error } = await supabase
      .from("matches")
      .update({
        status: MatchStatus.LIVE,
        start_time: new Date().toISOString(),
        is_walkover: false,
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

  const handleFinishWithWalkover = async (match: Match, walkoverLoserTeamId: string) => {
    if (!canManageScoreboard) {
      return;
    }

    if (championshipStatus != ChampionshipStatus.IN_PROGRESS) {
      toast.error("Só é possível aplicar W.O. quando o campeonato estiver Em andamento.");
      return;
    }

    if (walkoverLoserTeamId != match.home_team_id && walkoverLoserTeamId != match.away_team_id) {
      toast.error("Selecione uma atlética válida para marcar o W.O.");
      return;
    }

    if (match.status == MatchStatus.LIVE && hasRecordedProgressForWalkover(match)) {
      toast.error("Não é possível aplicar W.O. em jogo ao vivo com placar ou sets já lançados.");
      return;
    }

    const winnerPoints = resolveWalkoverWinnerPoints(match, championshipSports);

    if (winnerPoints == null) {
      toast.error("Modalidade sem configuração de W.O. para pontuação máxima.");
      return;
    }

    const isSetMatch = isSetRuleMatch(match);
    const winnerSide: MatchSide = walkoverLoserTeamId == match.home_team_id ? "away" : "home";
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
        away_yellow_cards: 0,
        away_red_cards: 0,
        start_time: match.start_time ?? now,
        end_time: match.start_time != null ? now : null,
        status: MatchStatus.FINISHED,
        is_walkover: true,
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

  const flushPendingAutosave = async (match: Match, matchDraft: MatchControlDraft) => {
    const saveTimeoutReference = saveTimeoutByMatchIdRef.current[match.id];

    if (saveTimeoutReference) {
      clearTimeout(saveTimeoutReference);
      saveTimeoutByMatchIdRef.current[match.id] = undefined;
    }

    return persistMatchDraft(match, matchDraft);
  };

  const handleFinish = async (match: Match) => {
    if (!canManageScoreboard) {
      return;
    }

    const selectedWalkoverLoserTeamId = resolveSelectedWalkoverLoserTeamId(match);

    if (selectedWalkoverLoserTeamId) {
      await handleFinishWithWalkover(match, selectedWalkoverLoserTeamId);
      return;
    }

    const currentMatchDraft = getMatchDraft(match);
    const isSetMatch = isSetRuleMatch(match);
    const supportsCards = doesMatchSupportCards(match);
    const displayedSetWins = resolveDisplayedSetWins(match);

    if (isSetMatch && (currentMatchDraft.homeScore > 0 || currentMatchDraft.awayScore > 0)) {
      toast.error("Feche o set atual antes de finalizar a partida.");
      return;
    }

    if (isSetMatch && displayedSetWins.home_sets == displayedSetWins.away_sets) {
      toast.error("Partidas por sets precisam ter um vencedor definido antes de encerrar.");
      return;
    }

    const matchBracketContext = matchBracketContextByMatchId[match.id];
    const resolvedHomeScore = isSetMatch ? displayedSetWins.home_sets : currentMatchDraft.homeScore;
    const resolvedAwayScore = isSetMatch ? displayedSetWins.away_sets : currentMatchDraft.awayScore;

    if (
      matchBracketContext?.phase == BracketPhase.KNOCKOUT &&
      resolvedHomeScore == resolvedAwayScore
    ) {
      toast.error("Jogos do mata-mata não podem terminar empatados.");
      return;
    }

    const matchSaved = await flushPendingAutosave(match, currentMatchDraft);

    if (!matchSaved) {
      toast.error("Não foi possível salvar os dados antes de finalizar o jogo.");
      return;
    }

    const { error } = await supabase
      .from("matches")
      .update({
        ...resolveMatchUpdatePayload(match, currentMatchDraft, {
          supportsCards,
          shouldUseCurrentSetScore: isSetMatch,
        }),
        home_score: resolvedHomeScore,
        away_score: resolvedAwayScore,
        current_set_home_score: isSetMatch ? null : null,
        current_set_away_score: isSetMatch ? null : null,
        home_yellow_cards: supportsCards ? Math.max(0, currentMatchDraft.homeYellowCards) : 0,
        home_red_cards: supportsCards ? Math.max(0, currentMatchDraft.homeRedCards) : 0,
        away_yellow_cards: supportsCards ? Math.max(0, currentMatchDraft.awayYellowCards) : 0,
        away_red_cards: supportsCards ? Math.max(0, currentMatchDraft.awayRedCards) : 0,
        end_time: new Date().toISOString(),
        status: MatchStatus.FINISHED,
        is_walkover: false,
        walkover_loser_team_id: null,
      })
      .eq("id", match.id);

    if (error) {
      toast.error(resolveAdminMatchControlErrorMessage(error, error.message), {
        id: "admin-match-control-migration-required",
      });
      return;
    }

    toast.success("Jogo finalizado! Classificação atualizada.");
    onRefetch();
    onRefetchChampionshipBracket();
  };

  const handleSwapKnockoutTeam = useCallback(
    async (match: Match, side: "home" | "away", newTeamId: string) => {
      const bracketMatch = bracketMatchByMatchId[match.id];
      if (!bracketMatch) return;
      const currentTeamId = side === "home" ? match.home_team_id : match.away_team_id;
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

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      if (sportFilter && match.sport_id != sportFilter) {
        return false;
      }

      if (naipeFilter !== ALL_CONTROL_NAIPE_FILTER && match.naipe != naipeFilter) {
        return false;
      }

      if (showOnlyLiveMatches && match.status != MatchStatus.LIVE) {
        return false;
      }

      return true;
    });
  }, [matches, naipeFilter, showOnlyLiveMatches, sportFilter]);

  const sortedMatches = useMemo(() => {
    return [...filteredMatches].sort((firstMatch, secondMatch) => {
      const statusOrderDifference =
        MATCH_CONTROL_STATUS_SORT_ORDER[firstMatch.status] - MATCH_CONTROL_STATUS_SORT_ORDER[secondMatch.status];

      if (statusOrderDifference != 0) {
        return statusOrderDifference;
      }

      if (firstMatch.status == MatchStatus.SCHEDULED && secondMatch.status == MatchStatus.SCHEDULED) {
        const firstScheduledDate = resolveMatchScheduledDateValue(firstMatch) ?? "9999-12-31";
        const secondScheduledDate = resolveMatchScheduledDateValue(secondMatch) ?? "9999-12-31";

        if (firstScheduledDate != secondScheduledDate) {
          return firstScheduledDate.localeCompare(secondScheduledDate);
        }

        const firstSlot = firstMatch.scheduled_slot ?? firstMatch.queue_position ?? Number.MAX_SAFE_INTEGER;
        const secondSlot = secondMatch.scheduled_slot ?? secondMatch.queue_position ?? Number.MAX_SAFE_INTEGER;
        if (firstSlot != secondSlot) return firstSlot - secondSlot;
        return (firstMatch.queue_position ?? Number.MAX_SAFE_INTEGER) - (secondMatch.queue_position ?? Number.MAX_SAFE_INTEGER);
      }

      const firstTimestamp = new Date(firstMatch.start_time ?? firstMatch.created_at).getTime();
      const secondTimestamp = new Date(secondMatch.start_time ?? secondMatch.created_at).getTime();

      return secondTimestamp - firstTimestamp;
    });
  }, [filteredMatches]);

  const totalPages = Math.max(1, Math.ceil(sortedMatches.length / itemsPerPage));

  const paginatedMatches = useMemo(() => {
    const rangeStart = (currentPage - 1) * itemsPerPage;
    const rangeEnd = rangeStart + itemsPerPage;

    return sortedMatches.slice(rangeStart, rangeEnd);
  }, [currentPage, itemsPerPage, sortedMatches]);

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

  return (
    <div className="enter-section space-y-4">
      <div className="glass-card enter-section space-y-4 p-4">
        <p className="text-sm text-muted-foreground">{sortedMatches.length} jogo(s) encontrado(s)</p>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {controlSports.length > 0 && (
            <div className="min-w-0 flex-1">
              <SportFilter sports={controlSports} selected={sportFilter} onSelect={setSportFilter} />
            </div>
          )}

          <div className="flex items-stretch gap-3">
            <Select value={naipeFilter} onValueChange={setNaipeFilter}>
              <SelectTrigger className="app-input-field h-10 flex-1 sm:w-40 sm:flex-none">
                <SelectValue placeholder="Naipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CONTROL_NAIPE_FILTER}>Todos os naipes</SelectItem>
                {NAIPE_OPTIONS.map((naipeOption) => (
                  <SelectItem key={naipeOption} value={naipeOption}>
                    {MATCH_NAIPE_LABELS[naipeOption]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowOnlyLiveMatches((currentShowOnlyLiveMatches) => !currentShowOnlyLiveMatches)}
              className={`h-10 w-10 shrink-0 self-stretch ${showOnlyLiveMatches ? "app-button-secondary-active" : ""}`}
              aria-label={showOnlyLiveMatches ? "Mostrar jogos agendados também" : "Ocultar jogos que não estão ao vivo"}
            >
              <EyeOff className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {isFetchingMatches ? (
        <div className="space-y-3">
          {Array.from({ length: Math.max(3, itemsPerPage) }).map((_, index) => (
            <Skeleton key={`admin-control-skeleton-${index}`} className="h-56 w-full rounded-2xl" />
          ))}
        </div>
      ) : sortedMatches.length == 0 ? (
        <p className="text-sm text-muted-foreground">
          {showOnlyLiveMatches ? "Nenhum jogo ao vivo para os filtros selecionados." : "Nenhum jogo ao vivo ou agendado."}
        </p>
      ) : (
        <>
          {paginatedMatches.map((match) => {
            const matchDraft = getMatchDraft(match);
            const matchSaveStatus = saveStatusByMatchId[match.id];
            const matchBracketContext = matchBracketContextByMatchId[match.id];
            const scheduledDateValue = resolveMatchScheduledDateValue(match);
            const sportAndDateKey = scheduledDateValue ? `${scheduledDateValue}:${match.sport_id}` : null;
            const availableCourtsCount = sportAndDateKey ? availableCourtsCountBySportAndDateKey[sportAndDateKey] ?? 0 : 0;
            const liveMatchesCount = sportAndDateKey ? liveMatchesCountBySportAndDateKey[sportAndDateKey] ?? 0 : 0;
            const isMatchStartBlocked =
              match.status == MatchStatus.SCHEDULED && availableCourtsCount > 0 && liveMatchesCount >= availableCourtsCount;
            const queueLabel = resolveMatchQueueLabel(
              visualQueuePositionByMatchId[match.id] ?? match.scheduled_slot ?? match.queue_position,
            );
            const queueSummary = scheduledDateValue
              ? `${format(new Date(`${scheduledDateValue}T12:00:00`), "dd/MM", { locale: ptBR })} • ${queueLabel}`
              : queueLabel;
            const isSetMatch = isSetRuleMatch(match);
            const supportsCards = doesMatchSupportCards(match);
            const closedMatchSets = resolveClosedMatchSets(match);
            const displayedSetWins = resolveDisplayedSetWins(match);
            const setSummary = resolveMatchSetSummary({
              ...match,
              match_sets: closedMatchSets,
            });
            const editingSetDraft = editingSetDraftByMatchId[match.id];
            const startedAtLabel = resolveMatchStartedAtLabel(match.start_time, match.status);
            const tieBreakRuleLabel = resolveMatchTieBreakRuleLabel(match.resolved_tie_breaker_rule);
            const matchRepresentation = matchRepresentationByMatchId[match.id];
            const estimatedStartTime = estimatedStartTimeByMatchId[match.id];
            const displayedHomeScore = isSetMatch && match.status != MatchStatus.LIVE ? displayedSetWins.home_sets : matchDraft.homeScore;
            const displayedAwayScore = isSetMatch && match.status != MatchStatus.LIVE ? displayedSetWins.away_sets : matchDraft.awayScore;
            const hasCurrentSetScore =
              Number(matchDraft.homeScore) > 0 || Number(matchDraft.awayScore) > 0;
            const isChampionshipStartBlocked = championshipStatus != ChampionshipStatus.IN_PROGRESS;
            const selectedWalkoverLoserTeamId = resolveSelectedWalkoverLoserTeamId(match);
            const hasWalkoverSelection = selectedWalkoverLoserTeamId != null;
            const shouldShowWalkoverSelector = match.status == MatchStatus.SCHEDULED || match.status == MatchStatus.LIVE;

            const bracketMatch = bracketMatchByMatchId[match.id];
            const isKnockoutFirstRound =
              matchBracketContext?.phase == BracketPhase.KNOCKOUT &&
              bracketMatch != null &&
              bracketMatch.round_number == maxRoundByCompetitionId[bracketMatch.competition_id];
            const firstRoundTeams = bracketMatch
              ? (firstRoundTeamsByCompetitionId[bracketMatch.competition_id] ?? [])
              : [];
            const shouldShowKnockoutTeamSwap =
              isKnockoutFirstRound &&
              match.status == MatchStatus.SCHEDULED &&
              !!match.home_team_id &&
              !!match.away_team_id &&
              firstRoundTeams.length > 1;

            return (
              <div
                key={match.id}
                className={`space-y-4 glass-card p-5 ${match.status == MatchStatus.LIVE ? "list-item-card-live live-glow" : ""}`}
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
                          value={selectedWalkoverLoserTeamId ?? WALKOVER_NONE_OPTION_VALUE}
                          onValueChange={(value) =>
                            handleUpdateWalkoverLoserTeamId(
                              match,
                              value == WALKOVER_NONE_OPTION_VALUE ? "" : value,
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
                            <SelectItem value={WALKOVER_NONE_OPTION_VALUE}>Não</SelectItem>
                            <SelectItem value={match.home_team_id}>{match.home_team?.name ?? "Mandante"}</SelectItem>
                            <SelectItem value={match.away_team_id}>{match.away_team?.name ?? "Visitante"}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    {match.status == MatchStatus.SCHEDULED && !hasWalkoverSelection ? (
                      <Button
                        size="sm"
                        onClick={() => handleSetLive(match.id)}
                        className="bg-live text-primary-foreground hover:bg-live-glow"
                        disabled={!canManageScoreboard || isMatchStartBlocked || isChampionshipStartBlocked}
                      >
                        <Play className="h-3 w-3 sm:mr-1" />
                        <span className="hidden sm:inline">Iniciar</span>
                      </Button>
                    ) : null}

                    {match.status == MatchStatus.SCHEDULED && hasWalkoverSelection ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => { setPendingFinishMatch(match); setShowFinishConfirmDialog(true); }}
                        disabled={!canManageScoreboard || isChampionshipStartBlocked}
                      >
                        <Square className="h-3 w-3 sm:mr-1" />
                        <span className="hidden sm:inline">Encerrar W.O.</span>
                      </Button>
                    ) : null}

                    {match.status == MatchStatus.LIVE ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setPendingReturnToScheduledMatch(match); setShowReturnToScheduledConfirmDialog(true); }}
                        disabled={!canManageScoreboard}
                      >
                        <RotateCcw className="h-3 w-3 sm:mr-1" />
                        <span className="hidden sm:inline">Voltar ao agendamento</span>
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
                        onClick={() => { setPendingFinishMatch(match); setShowFinishConfirmDialog(true); }}
                        disabled={!canManageScoreboard || (isSetMatch && !hasWalkoverSelection && closedMatchSets.length == 0)}
                      >
                        <Square className="h-3 w-3 sm:mr-1" />
                        <span className="hidden sm:inline">{hasWalkoverSelection ? "Encerrar W.O." : "Finalizar"}</span>
                      </Button>
                    ) : null}
                  </div>

                  {/* Linhas 1-6 (mobile) / Esquerda (sm+): informações */}
                  <div className="order-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 text-xs uppercase text-muted-foreground">
                        {match.sports?.name} • {match.location}
                      </span>
                      <div className="flex flex-wrap items-center gap-1">
                        <AppBadge tone={resolveMatchNaipeBadgeTone(String(match.naipe))} className="w-fit">
                          {resolveMatchNaipeLabel(String(match.naipe))}
                        </AppBadge>
                        {matchBracketContext ? (
                          <AppBadge tone={AppBadgeTone.NEUTRAL} className="w-fit">
                            {matchBracketContext.badgeLabel}
                          </AppBadge>
                        ) : null}
                      </div>
                      {canManageScoreboard && match.status === MatchStatus.LIVE && matchSaveStatus ? (
                        <span className="ml-auto flex items-center" title={SAVE_STATUS_LABELS[matchSaveStatus]}>
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
                          <span className="text-xs font-bold text-live live-pulse">● AO VIVO</span>
                          <p className="text-xs text-muted-foreground">{queueLabel}</p>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">{queueSummary}</span>
                      )}

                      {startedAtLabel ? (
                        <p className="text-xs text-muted-foreground">{startedAtLabel}</p>
                      ) : null}

                      {match.status == MatchStatus.SCHEDULED && estimatedStartTime ? (
                        <p className="text-xs text-muted-foreground">Horário estimado: {estimatedStartTime}</p>
                      ) : null}

                      {match.status == MatchStatus.SCHEDULED && suggestedCourtByMatchId[match.id] ? (
                        <p className="text-xs text-muted-foreground">
                          Sugestão de quadra: {suggestedCourtByMatchId[match.id]}
                        </p>
                      ) : null}

                      {matchRepresentation ? (
                        <p className="break-words text-xs text-muted-foreground">Representação: {matchRepresentation}</p>
                      ) : null}

                      {isSetMatch ? (
                        <p className="text-xs font-medium text-muted-foreground">
                          Sets ganhos: {displayedSetWins.home_sets} × {displayedSetWins.away_sets}
                        </p>
                      ) : null}

                      {match.status != MatchStatus.LIVE && isMatchStartBlocked ? (
                        <p className="text-xs font-medium text-amber-500">
                          Capacidade ao vivo esgotada: {liveMatchesCount}/{availableCourtsCount} quadra(s) em uso.
                        </p>
                      ) : null}

                      {match.status == MatchStatus.SCHEDULED && isChampionshipStartBlocked ? (
                        <p className="text-xs font-medium text-amber-500">
                          O campeonato precisa estar Em andamento para iniciar jogos ao vivo.
                        </p>
                      ) : null}

                      {match.status == MatchStatus.FINISHED && tieBreakRuleLabel ? (
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
                    <p className="truncate font-display font-bold">{match.home_team?.name}</p>
                    <p className="truncate font-display font-bold">{match.away_team?.name}</p>
                  </div>

                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-10"
                        onClick={() => updateScore(match, "home", -1)}
                        disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>

                      <Input
                        type="number"
                        value={displayedHomeScore}
                        onChange={(event) => updateManualInputScore(match, "home", event.target.value)}
                        className={SCORE_INPUT_CLASS_NAME}
                        disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                      />

                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-10"
                        onClick={() => updateScore(match, "home", 1)}
                        disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>

                    <span className="font-display text-xl text-muted-foreground">×</span>

                    <div className="flex items-center justify-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-10"
                        onClick={() => updateScore(match, "away", -1)}
                        disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>

                      <Input
                        type="number"
                        value={displayedAwayScore}
                        onChange={(event) => updateManualInputScore(match, "away", event.target.value)}
                        className={SCORE_INPUT_CLASS_NAME}
                        disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                      />

                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-10"
                        onClick={() => updateScore(match, "away", 1)}
                        disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="hidden grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-6 sm:grid">
                  <div className="min-w-0 text-right">
                    <p className="truncate font-display font-bold">{match.home_team?.name}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-10"
                        onClick={() => updateScore(match, "home", -1)}
                        disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>

                      <Input
                        type="number"
                        value={displayedHomeScore}
                        onChange={(event) => updateManualInputScore(match, "home", event.target.value)}
                        className={SCORE_INPUT_CLASS_NAME}
                        disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                      />

                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-10"
                        onClick={() => updateScore(match, "home", 1)}
                        disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>

                    <span className="font-display text-xl text-muted-foreground">×</span>

                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-10"
                        onClick={() => updateScore(match, "away", -1)}
                        disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>

                      <Input
                        type="number"
                        value={displayedAwayScore}
                        onChange={(event) => updateManualInputScore(match, "away", event.target.value)}
                        className={SCORE_INPUT_CLASS_NAME}
                        disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                      />

                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-10"
                        onClick={() => updateScore(match, "away", 1)}
                        disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="truncate font-display font-bold">{match.away_team?.name}</p>
                  </div>
                </div>

                {isSetMatch && setSummary.length > 0 ? (
                  <div className="space-y-2 app-card-emphasis p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Detalhamento por sets</p>
                      <span className="text-xs font-medium text-muted-foreground">
                        Sets: {displayedSetWins.home_sets} × {displayedSetWins.away_sets}
                      </span>
                    </div>

                    <div className="space-y-1">
                      {setSummary.map((matchSetSummary) => {
                        const editableMatchSet =
                          closedMatchSets.find((matchSet) => matchSet.set_number == matchSetSummary.setNumber) ?? null;
                        const isEditingSet = editingSetDraft?.setNumber == matchSetSummary.setNumber;

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
                                <span className="truncate text-xs font-medium">{match.home_team?.name}</span>
                                <Input
                                  type="number"
                                  value={editingSetDraft.homePoints}
                                  onChange={(event) => handleUpdateEditingRecordedSetScore(match.id, "home", event.target.value)}
                                  className="h-8 w-16 shrink-0 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  disabled={!canManageScoreboard}
                                />
                                <span className="shrink-0 text-center text-xs text-muted-foreground">×</span>
                                <Input
                                  type="number"
                                  value={editingSetDraft.awayPoints}
                                  onChange={(event) => handleUpdateEditingRecordedSetScore(match.id, "away", event.target.value)}
                                  className="h-8 w-16 shrink-0 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  disabled={!canManageScoreboard}
                                />
                                <span className="truncate text-xs font-medium">{match.away_team?.name}</span>
                              </div>
                              <div className="flex items-center gap-1 self-end sm:self-auto">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-10"
                                  onClick={() => void handleSaveEditedRecordedSet(match)}
                                  disabled={!canManageScoreboard}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-10"
                                  onClick={() => handleCancelEditingRecordedSet(match.id)}
                                  disabled={!canManageScoreboard}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-10 text-destructive hover:text-destructive"
                                  onClick={() => void handleDeleteRecordedSet(match, editingSetDraft.setNumber)}
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
                            <p className="min-w-0 text-xs text-muted-foreground">{matchSetSummary.text}</p>
                            {match.status == MatchStatus.LIVE && editableMatchSet ? (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 shrink-0"
                                onClick={() => handleStartEditingRecordedSet(match.id, editableMatchSet)}
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

                {supportsCards ? (
                  <div className="grid gap-3 glass-panel-muted p-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="truncate text-xs font-semibold uppercase text-muted-foreground">{match.home_team?.name}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase text-amber-700">Cartões Amarelos</p>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-10"
                              onClick={() => updateCards(match, "home", "yellow", -1)}
                              disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input
                              type="number"
                              value={matchDraft.homeYellowCards}
                              onChange={(event) => updateManualInputCards(match, "home", "yellow", event.target.value)}
                              className="h-9 w-20 app-input-field text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                            />
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-10"
                              onClick={() => updateCards(match, "home", "yellow", 1)}
                              disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase app-text-status-danger">Cartões Vermelhos</p>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-10"
                              onClick={() => updateCards(match, "home", "red", -1)}
                              disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input
                              type="number"
                              value={matchDraft.homeRedCards}
                              onChange={(event) => updateManualInputCards(match, "home", "red", event.target.value)}
                              className="h-9 w-20 app-input-field text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                            />
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-10"
                              onClick={() => updateCards(match, "home", "red", 1)}
                              disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="truncate text-xs font-semibold uppercase text-muted-foreground">{match.away_team?.name}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase text-amber-700">Cartões Amarelos</p>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-10"
                              onClick={() => updateCards(match, "away", "yellow", -1)}
                              disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input
                              type="number"
                              value={matchDraft.awayYellowCards}
                              onChange={(event) => updateManualInputCards(match, "away", "yellow", event.target.value)}
                              className="h-9 w-20 app-input-field text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                            />
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-10"
                              onClick={() => updateCards(match, "away", "yellow", 1)}
                              disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase app-text-status-danger">Cartões Vermelhos</p>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-10"
                              onClick={() => updateCards(match, "away", "red", -1)}
                              disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input
                              type="number"
                              value={matchDraft.awayRedCards}
                              onChange={(event) => updateManualInputCards(match, "away", "red", event.target.value)}
                              className="h-9 w-20 app-input-field text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                            />
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-10"
                              onClick={() => updateCards(match, "away", "red", 1)}
                              disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
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
            );
          })}

          <AppPaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            itemsPerPage={itemsPerPage}
            onItemsPerPageChange={setItemsPerPage}
          />
        </>
      )}

      <AlertDialog open={showFinishConfirmDialog} onOpenChange={setShowFinishConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar jogo</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja encerrar o jogo e salvar o placar atual? Esta ação registra o resultado definitivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingFinishMatch(null)}>Cancelar</AlertDialogCancel>
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

      <AlertDialog open={showReturnToScheduledConfirmDialog} onOpenChange={setShowReturnToScheduledConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Voltar ao agendamento</AlertDialogTitle>
            <AlertDialogDescription>
              Ao voltar ao agendamento, todos os dados inseridos (placar, sets e cartões) serão perdidos. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingReturnToScheduledMatch(null)}>Cancelar</AlertDialogCancel>
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
    </div>
  );
}
