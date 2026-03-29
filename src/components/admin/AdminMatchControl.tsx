import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Check, EyeOff, Minus, Pencil, Play, Plus, Square, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { saveMatchSets } from "@/domain/championship-brackets/championshipBracket.repository";
import type { ChampionshipBracketScheduleDayInput, MatchSetInput } from "@/domain/championship-brackets/championshipBracket.types";
import type { ChampionshipBracketView, ChampionshipSport, Match, Sport } from "@/lib/types";
import { AppBadgeTone, BracketPhase, ChampionshipSportResultRule, ChampionshipStatus, MatchStatus } from "@/lib/enums";
import { SportFilter } from "@/components/SportFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AppBadge } from "@/components/ui/app-badge";
import {
  AppPaginationControls,
  DEFAULT_PAGINATION_ITEMS_PER_PAGE,
} from "@/components/ui/app-pagination-controls";
import {
  type MatchBracketContext,
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
  estimatedStartTimeByMatchId?: Record<string, string>;
  isFetchingMatches?: boolean;
  onRefetch: () => void;
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

const MATCH_CONTROL_STATUS_SORT_ORDER: Record<MatchStatus, number> = {
  [MatchStatus.LIVE]: 0,
  [MatchStatus.SCHEDULED]: 1,
  [MatchStatus.FINISHED]: 2,
};
const MATCH_CONTROL_AUTOSAVE_DEBOUNCE_IN_MILLISECONDS = 150;

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
  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [showOnlyLiveMatches, setShowOnlyLiveMatches] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGINATION_ITEMS_PER_PAGE);

  const saveTimeoutByMatchIdRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const clearStatusTimeoutByMatchIdRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const hasHandledPaginationScrollRef = useRef(false);

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
    setMatchDraftById((previousMatchDraftById) => {
      const nextMatchDraftById: Record<string, MatchControlDraft> = {};

      matches.forEach((match) => {
        const shouldPreserveDirtyDraft = isDraftDirtyByMatchId[match.id] == true;
        const previousMatchDraft = previousMatchDraftById[match.id] ?? null;

        if (shouldPreserveDirtyDraft && previousMatchDraft) {
          nextMatchDraftById[match.id] = previousMatchDraft;
          return;
        }

        nextMatchDraftById[match.id] = resolveDefaultMatchControlDraft(match, isSetRuleMatch(match));
      });

      return nextMatchDraftById;
    });
  }, [isDraftDirtyByMatchId, isSetRuleMatch, matches]);

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

  const controlSports = useMemo(() => {
    const sportById = new Map<string, Sport>();

    matches.forEach((match) => {
      if (match.sports && !sportById.has(match.sports.id)) {
        sportById.set(match.sports.id, match.sports);
      }
    });

    return [...sportById.values()].sort((leftSport, rightSport) => leftSport.name.localeCompare(rightSport.name));
  }, [matches]);

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
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage, matches.length, showOnlyLiveMatches, sportFilter]);

  const getMatchDraft = (match: Match) => {
    return matchDraftById[match.id] ?? resolveDefaultMatchControlDraft(match, isSetRuleMatch(match));
  };

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
      persistMatchDraft(match, matchDraft);
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

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      if (sportFilter && match.sport_id != sportFilter) {
        return false;
      }

      if (showOnlyLiveMatches && match.status != MatchStatus.LIVE) {
        return false;
      }

      return true;
    });
  }, [matches, showOnlyLiveMatches, sportFilter]);

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
          <div className="flex min-w-0 flex-1 items-stretch gap-3">
            {controlSports.length > 0 ? (
              <div className="min-w-0 flex-1">
                <SportFilter sports={controlSports} selected={sportFilter} onSelect={setSportFilter} />
              </div>
            ) : (
              <div className="flex-1" />
            )}

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
            const queueSummary = scheduledDateValue
              ? `${format(new Date(`${scheduledDateValue}T12:00:00`), "dd/MM", { locale: ptBR })} • ${resolveMatchQueueLabel(match.queue_position)}`
              : resolveMatchQueueLabel(match.queue_position);
            const isSetMatch = isSetRuleMatch(match);
            const supportsCards = doesMatchSupportCards(match);
            const closedMatchSets = resolveClosedMatchSets(match);
            const displayedSetWins = resolveDisplayedSetWins(match);
            const setSummary = resolveMatchSetSummary({
              ...match,
              match_sets: closedMatchSets,
            });
            const editingSetDraft = editingSetDraftByMatchId[match.id];
            const startedAtLabel = resolveMatchStartedAtLabel(match.start_time);
            const tieBreakRuleLabel = resolveMatchTieBreakRuleLabel(match.resolved_tie_breaker_rule);
            const matchRepresentation = matchRepresentationByMatchId[match.id];
            const estimatedStartTime = estimatedStartTimeByMatchId[match.id];
            const displayedHomeScore = isSetMatch && match.status != MatchStatus.LIVE ? displayedSetWins.home_sets : matchDraft.homeScore;
            const displayedAwayScore = isSetMatch && match.status != MatchStatus.LIVE ? displayedSetWins.away_sets : matchDraft.awayScore;
            const isChampionshipStartBlocked = championshipStatus != ChampionshipStatus.IN_PROGRESS;

            return (
              <div
                key={match.id}
                className={`space-y-4 glass-card p-5 ${match.status == MatchStatus.LIVE ? "list-item-card-live live-glow" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
                      <span className="text-xs uppercase text-muted-foreground">
                        {match.sports?.name} • {match.location}
                      </span>
                      <AppBadge tone={resolveMatchNaipeBadgeTone(String(match.naipe))} className="w-fit">
                        {resolveMatchNaipeLabel(String(match.naipe))}
                      </AppBadge>
                      {matchBracketContext ? (
                        <AppBadge tone={AppBadgeTone.NEUTRAL} className="w-fit">
                          {matchBracketContext.badgeLabel}
                        </AppBadge>
                      ) : null}
                    </div>

                    <div className="space-y-0.5">
                      {match.status == MatchStatus.LIVE ? (
                        <span className="text-xs font-bold text-live live-pulse">● AO VIVO</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{queueSummary}</span>
                      )}

                      {startedAtLabel ? (
                        <p className="text-xs text-muted-foreground">{startedAtLabel}</p>
                      ) : null}

                      {matchRepresentation ? (
                        <p className="break-words text-xs text-muted-foreground">Representação: {matchRepresentation}</p>
                      ) : null}

                      {match.status == MatchStatus.SCHEDULED && estimatedStartTime ? (
                        <p className="text-xs text-muted-foreground">Horário estimado: {estimatedStartTime}</p>
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

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {canManageScoreboard && match.status == MatchStatus.LIVE && matchSaveStatus ? (
                      <span className={`text-xs font-semibold ${SAVE_STATUS_CLASS_NAMES[matchSaveStatus]}`}>
                        {SAVE_STATUS_LABELS[matchSaveStatus]}
                      </span>
                    ) : null}

                    {match.status == MatchStatus.SCHEDULED ? (
                      <Button
                        size="sm"
                        onClick={() => handleSetLive(match.id)}
                        className="bg-live text-primary-foreground hover:bg-live-glow"
                        disabled={!canManageScoreboard || isMatchStartBlocked || isChampionshipStartBlocked}
                      >
                        <Play className="mr-1 h-3 w-3" /> Iniciar
                      </Button>
                    ) : null}

                    {match.status == MatchStatus.LIVE && isSetMatch ? (
                      <Button size="sm" variant="outline" onClick={() => handleFinishSet(match)} disabled={!canManageScoreboard}>
                        Fim do set
                      </Button>
                    ) : null}

                    {match.status == MatchStatus.LIVE ? (
                      <Button size="sm" variant="destructive" onClick={() => handleFinish(match)} disabled={!canManageScoreboard}>
                        <Square className="mr-1 h-3 w-3" /> Finalizar
                      </Button>
                    ) : null}
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
                        className="score-text h-12 w-12 app-input-field text-center font-display text-2xl font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
                        className="score-text h-12 w-12 app-input-field text-center font-display text-2xl font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
                        className="score-text h-12 w-12 app-input-field text-center font-display text-2xl font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
                        className="score-text h-12 w-12 app-input-field text-center font-display text-2xl font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
                              <span className="min-w-16 text-xs font-medium text-muted-foreground">
                                Set {matchSetSummary.setNumber}
                              </span>
                              <div className="grid flex-1 grid-cols-[minmax(0,1fr)_88px_auto_88px_minmax(0,1fr)] items-center gap-2">
                                <span className="truncate text-xs font-medium">{match.home_team?.name}</span>
                                <Input
                                  type="number"
                                  value={editingSetDraft.homePoints}
                                  onChange={(event) => handleUpdateEditingRecordedSetScore(match.id, "home", event.target.value)}
                                  className="h-8 w-20 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  disabled={!canManageScoreboard}
                                />
                                <span className="text-center text-xs text-muted-foreground">×</span>
                                <Input
                                  type="number"
                                  value={editingSetDraft.awayPoints}
                                  onChange={(event) => handleUpdateEditingRecordedSetScore(match.id, "away", event.target.value)}
                                  className="h-8 w-20 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  disabled={!canManageScoreboard}
                                />
                                <span className="truncate text-xs font-medium text-right">{match.away_team?.name}</span>
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
    </div>
  );
}
