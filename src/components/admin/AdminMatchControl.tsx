import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Play, Plus, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MATCH_SET_DEFAULT_VALUES } from "@/domain/championship-brackets/championshipBracket.constants";
import { fetchMatchSets, saveMatchSets } from "@/domain/championship-brackets/championshipBracket.repository";
import type { MatchSetInput } from "@/domain/championship-brackets/championshipBracket.types";
import type { ChampionshipSport, Match } from "@/lib/types";
import { AppBadgeTone, BracketPhase, ChampionshipSportResultRule, MatchStatus } from "@/lib/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AppBadge } from "@/components/ui/app-badge";
import {
  AppPaginationControls,
  DEFAULT_PAGINATION_ITEMS_PER_PAGE,
} from "@/components/ui/app-pagination-controls";
import {
  type MatchBracketContext,
  resolveMatchNaipeBadgeTone,
  resolveMatchNaipeLabel,
} from "@/lib/championship";

interface Props {
  matches: Match[];
  championshipSports: ChampionshipSport[];
  matchBracketContextByMatchId: Record<string, MatchBracketContext>;
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

function resolveDefaultMatchControlDraft(match: Match): MatchControlDraft {
  return {
    homeScore: match.home_score,
    awayScore: match.away_score,
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

function resolveMatchUpdatePayload(match: Match, draft: MatchControlDraft) {
  return {
    home_score: Math.max(0, draft.homeScore),
    away_score: Math.max(0, draft.awayScore),
    home_yellow_cards: match.supports_cards ? Math.max(0, draft.homeYellowCards) : 0,
    home_red_cards: match.supports_cards ? Math.max(0, draft.homeRedCards) : 0,
    away_yellow_cards: match.supports_cards ? Math.max(0, draft.awayYellowCards) : 0,
    away_red_cards: match.supports_cards ? Math.max(0, draft.awayRedCards) : 0,
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

export function AdminMatchControl({
  matches,
  championshipSports,
  matchBracketContextByMatchId,
  onRefetch,
  onRefetchChampionshipBracket,
  canManageScoreboard,
}: Props) {
  const [matchDraftById, setMatchDraftById] = useState<Record<string, MatchControlDraft>>({});
  const [matchSetsByMatchId, setMatchSetsByMatchId] = useState<Record<string, MatchSetInput[]>>({});
  const [saveStatusByMatchId, setSaveStatusByMatchId] = useState<Record<string, SaveStatus | undefined>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGINATION_ITEMS_PER_PAGE);

  const saveTimeoutByMatchIdRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const clearStatusTimeoutByMatchIdRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});

  useEffect(() => {
    setMatchDraftById((previousMatchDraftById) => {
      const nextMatchDraftById: Record<string, MatchControlDraft> = {};

      matches.forEach((match) => {
        const previousMatchDraft = previousMatchDraftById[match.id];

        if (previousMatchDraft) {
          nextMatchDraftById[match.id] = previousMatchDraft;
          return;
        }

        nextMatchDraftById[match.id] = resolveDefaultMatchControlDraft(match);
      });

      return nextMatchDraftById;
    });
  }, [matches]);

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

  useEffect(() => {
    const fetchSets = async () => {
      const matchesWithSetRule = matches.filter((match) => isSetRuleMatch(match));

      if (matchesWithSetRule.length == 0) {
        setMatchSetsByMatchId({});
        return;
      }

      const resolvedSetsByMatchId: Record<string, MatchSetInput[]> = {};
      const setResponses = await Promise.all(
        matchesWithSetRule.map(async (match) => {
          const { data } = await fetchMatchSets(match.id);

          return {
            match_id: match.id,
            sets: data.length > 0 ? data : MATCH_SET_DEFAULT_VALUES,
          };
        }),
      );

      setResponses.forEach((setResponse) => {
        resolvedSetsByMatchId[setResponse.match_id] = setResponse.sets;
      });

      setMatchSetsByMatchId(resolvedSetsByMatchId);
    };

    fetchSets();
  }, [championshipSports, isSetRuleMatch, matches]);

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
  }, [itemsPerPage, matches.length]);

  const getMatchDraft = (match: Match) => {
    return matchDraftById[match.id] ?? resolveDefaultMatchControlDraft(match);
  };

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

  const persistMatchDraft = async (match: Match, matchDraft: MatchControlDraft) => {
    if (!canManageScoreboard) {
      return false;
    }

    setMatchSaveStatus(match.id, "saving");

    const { error } = await supabase
      .from("matches")
      .update(resolveMatchUpdatePayload(match, matchDraft))
      .eq("id", match.id);

    if (error) {
      setMatchSaveStatus(match.id, "error");
      return false;
    }

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
    }, 500);
  };

  const updateScore = (match: Match, side: MatchSide, delta: number) => {
    if (match.status != MatchStatus.LIVE) {
      return;
    }

    setMatchDraftById((previousMatchDraftById) => {
      const currentMatchDraft = previousMatchDraftById[match.id] ?? resolveDefaultMatchControlDraft(match);
      const nextMatchDraft = {
        ...currentMatchDraft,
        homeScore:
          side == "home" ? Math.max(0, currentMatchDraft.homeScore + delta) : currentMatchDraft.homeScore,
        awayScore:
          side == "away" ? Math.max(0, currentMatchDraft.awayScore + delta) : currentMatchDraft.awayScore,
      };

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
      const currentMatchDraft = previousMatchDraftById[match.id] ?? resolveDefaultMatchControlDraft(match);
      const nextMatchDraft = {
        ...currentMatchDraft,
        homeScore: side == "home" ? parsedValue : currentMatchDraft.homeScore,
        awayScore: side == "away" ? parsedValue : currentMatchDraft.awayScore,
      };

      scheduleAutosave(match, nextMatchDraft);

      return {
        ...previousMatchDraftById,
        [match.id]: nextMatchDraft,
      };
    });
  };

  const updateCards = (match: Match, side: MatchSide, color: CardColor, delta: number) => {
    if (match.status != MatchStatus.LIVE || !match.supports_cards) {
      return;
    }

    setMatchDraftById((previousMatchDraftById) => {
      const currentMatchDraft = previousMatchDraftById[match.id] ?? resolveDefaultMatchControlDraft(match);
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

      scheduleAutosave(match, nextMatchDraft);

      return {
        ...previousMatchDraftById,
        [match.id]: nextMatchDraft,
      };
    });
  };

  const updateManualInputCards = (match: Match, side: MatchSide, color: CardColor, value: string) => {
    if (match.status != MatchStatus.LIVE || !match.supports_cards) {
      return;
    }

    const parsedValue = parseNonNegativeNumber(value);

    setMatchDraftById((previousMatchDraftById) => {
      const currentMatchDraft = previousMatchDraftById[match.id] ?? resolveDefaultMatchControlDraft(match);
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

      scheduleAutosave(match, nextMatchDraft);

      return {
        ...previousMatchDraftById,
        [match.id]: nextMatchDraft,
      };
    });
  };

  const updateMatchSetValue = (matchId: string, setNumber: number, side: MatchSide, value: string) => {
    const parsedValue = parseNonNegativeNumber(value);

    setMatchSetsByMatchId((currentMatchSetsByMatchId) => {
      const currentMatchSets = currentMatchSetsByMatchId[matchId] ?? MATCH_SET_DEFAULT_VALUES;
      const nextMatchSets = currentMatchSets.map((matchSet) => {
        if (matchSet.set_number != setNumber) {
          return matchSet;
        }

        return {
          ...matchSet,
          home_points: side == "home" ? parsedValue : matchSet.home_points,
          away_points: side == "away" ? parsedValue : matchSet.away_points,
        };
      });

      return {
        ...currentMatchSetsByMatchId,
        [matchId]: nextMatchSets,
      };
    });
  };

  const persistMatchSets = async (match: Match) => {
    const matchSets = matchSetsByMatchId[match.id] ?? MATCH_SET_DEFAULT_VALUES;
    const { error } = await saveMatchSets(match.id, matchSets);

    if (error) {
      toast.error(error.message);
      return null;
    }

    return resolveSetWins(matchSets);
  };

  const handleSetLive = async (matchId: string) => {
    if (!canManageScoreboard) {
      return;
    }

    const { error } = await supabase.from("matches").update({ status: MatchStatus.LIVE }).eq("id", matchId);

    if (error) {
      toast.error(error.message);
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

    if (isSetRuleMatch(match)) {
      const matchSetsWins = await persistMatchSets(match);

      if (!matchSetsWins) {
        return;
      }

      currentMatchDraft.homeScore = matchSetsWins.home_sets;
      currentMatchDraft.awayScore = matchSetsWins.away_sets;
      setMatchDraftById((currentMatchDraftById) => ({
        ...currentMatchDraftById,
        [match.id]: {
          ...currentMatchDraft,
        },
      }));
    }

    const matchBracketContext = matchBracketContextByMatchId[match.id];

    if (
      matchBracketContext?.phase == BracketPhase.KNOCKOUT &&
      currentMatchDraft.homeScore == currentMatchDraft.awayScore
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
        ...resolveMatchUpdatePayload(match, currentMatchDraft),
        status: MatchStatus.FINISHED,
      })
      .eq("id", match.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Jogo finalizado! Classificação atualizada.");
    onRefetch();
    onRefetchChampionshipBracket();
  };

  const totalPages = Math.max(1, Math.ceil(matches.length / itemsPerPage));

  const paginatedMatches = useMemo(() => {
    const rangeStart = (currentPage - 1) * itemsPerPage;
    const rangeEnd = rangeStart + itemsPerPage;

    return matches.slice(rangeStart, rangeEnd);
  }, [currentPage, itemsPerPage, matches]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  if (matches.length == 0) {
    return <p className="text-sm text-muted-foreground">Nenhum jogo ao vivo ou agendado.</p>;
  }

  return (
    <div className="enter-section space-y-4">
      <div className="glass-card enter-section flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-muted-foreground">{matches.length} jogo(s) encontrado(s)</p>
      </div>

      {paginatedMatches.map((match) => {
        const matchDraft = getMatchDraft(match);
        const matchSaveStatus = saveStatusByMatchId[match.id];
        const matchBracketContext = matchBracketContextByMatchId[match.id];

        return (
          <div
            key={match.id}
            className={`space-y-4 list-item-card p-5 ${
              match.status == MatchStatus.LIVE ? "border-live/50 live-glow" : "border-border"
            }`}
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
                {match.status == MatchStatus.LIVE ? (
                  <span className="text-xs font-bold text-live live-pulse">● AO VIVO</span>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
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
                    disabled={!canManageScoreboard}
                  >
                    <Play className="mr-1 h-3 w-3" /> Iniciar
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
                    className="h-8 w-8"
                    onClick={() => updateScore(match, "home", -1)}
                    disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>

                  <Input
                    type="number"
                    value={matchDraft.homeScore}
                    onChange={(event) => updateManualInputScore(match, "home", event.target.value)}
                    className="score-text h-12 w-14 glass-input text-center font-display text-2xl font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                  />

                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
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
                    className="h-8 w-8"
                    onClick={() => updateScore(match, "away", -1)}
                    disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>

                  <Input
                    type="number"
                    value={matchDraft.awayScore}
                    onChange={(event) => updateManualInputScore(match, "away", event.target.value)}
                    className="score-text h-12 w-14 glass-input text-center font-display text-2xl font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                  />

                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
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
                    className="h-8 w-8"
                    onClick={() => updateScore(match, "home", -1)}
                    disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>

                  <Input
                    type="number"
                    value={matchDraft.homeScore}
                    onChange={(event) => updateManualInputScore(match, "home", event.target.value)}
                    className="score-text h-12 w-14 glass-input text-center font-display text-2xl font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                  />

                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
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
                    className="h-8 w-8"
                    onClick={() => updateScore(match, "away", -1)}
                    disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>

                  <Input
                    type="number"
                    value={matchDraft.awayScore}
                    onChange={(event) => updateManualInputScore(match, "away", event.target.value)}
                    className="score-text h-12 w-14 glass-input text-center font-display text-2xl font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                  />

                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
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

            {isSetRuleMatch(match) ? (
              <div className="space-y-2 rounded-lg border border-border/40 bg-background/50 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Detalhamento por Sets</p>
                <div className="space-y-2">
                  {(matchSetsByMatchId[match.id] ?? MATCH_SET_DEFAULT_VALUES).map((matchSet) => (
                    <div key={`${match.id}-set-${matchSet.set_number}`} className="grid grid-cols-[80px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
                      <p className="text-xs font-semibold">Set {matchSet.set_number}</p>
                      <Input
                        type="number"
                        value={matchSet.home_points}
                        onChange={(event) => updateMatchSetValue(match.id, matchSet.set_number, "home", event.target.value)}
                        className="h-8 glass-input text-center text-xs font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                      />
                      <Input
                        type="number"
                        value={matchSet.away_points}
                        onChange={(event) => updateMatchSetValue(match.id, matchSet.set_number, "away", event.target.value)}
                        className="h-8 glass-input text-center text-xs font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                      />
                    </div>
                  ))}
                </div>
                {match.status == MatchStatus.LIVE ? (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const matchSetsWins = await persistMatchSets(match);

                        if (!matchSetsWins) {
                          return;
                        }

                        toast.success("Sets salvos.");
                      }}
                      disabled={!canManageScoreboard}
                    >
                      Salvar sets
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {match.supports_cards ? (
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
                          className="h-8 w-8"
                          onClick={() => updateCards(match, "home", "yellow", -1)}
                          disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          value={matchDraft.homeYellowCards}
                          onChange={(event) => updateManualInputCards(match, "home", "yellow", event.target.value)}
                          className="h-9 glass-input text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() => updateCards(match, "home", "yellow", 1)}
                          disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase text-rose-700 dark:text-rose-400">Cartões Vermelhos</p>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() => updateCards(match, "home", "red", -1)}
                          disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          value={matchDraft.homeRedCards}
                          onChange={(event) => updateManualInputCards(match, "home", "red", event.target.value)}
                          className="h-9 glass-input text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
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
                          className="h-8 w-8"
                          onClick={() => updateCards(match, "away", "yellow", -1)}
                          disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          value={matchDraft.awayYellowCards}
                          onChange={(event) => updateManualInputCards(match, "away", "yellow", event.target.value)}
                          className="h-9 glass-input text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() => updateCards(match, "away", "yellow", 1)}
                          disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase text-rose-700 dark:text-rose-400">Cartões Vermelhos</p>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() => updateCards(match, "away", "red", -1)}
                          disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          value={matchDraft.awayRedCards}
                          onChange={(event) => updateManualInputCards(match, "away", "red", event.target.value)}
                          className="h-9 glass-input text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          disabled={match.status != MatchStatus.LIVE || !canManageScoreboard}
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
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
    </div>
  );
}
