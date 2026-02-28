import { useEffect, useRef, useState } from "react";
import { Minus, Play, Plus, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Match } from "@/lib/types";
import { MatchStatus } from "@/lib/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { MATCH_NAIPE_BADGE_CLASS_NAMES, MATCH_NAIPE_LABELS } from "@/lib/championship";

interface Props {
  matches: Match[];
  onRefetch: () => void;
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

export function AdminMatchControl({ matches, onRefetch, canManageScoreboard }: Props) {
  const [matchDraftById, setMatchDraftById] = useState<Record<string, MatchControlDraft>>({});
  const [saveStatusByMatchId, setSaveStatusByMatchId] = useState<Record<string, SaveStatus | undefined>>({});

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

  useEffect(() => {
    return () => {
      Object.values(saveTimeoutByMatchIdRef.current).forEach((timeoutReference) => {
        if (timeoutReference) {
          clearTimeout(timeoutReference);
        }
      });

      Object.values(clearStatusTimeoutByMatchIdRef.current).forEach((timeoutReference) => {
        if (timeoutReference) {
          clearTimeout(timeoutReference);
        }
      });
    };
  }, []);

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
  };

  if (matches.length == 0) {
    return <p className="text-sm text-muted-foreground">Nenhum jogo ao vivo ou agendado.</p>;
  }

  return (
    <div className="enter-section space-y-4">
      {matches.map((match) => {
        const matchDraft = getMatchDraft(match);
        const matchSaveStatus = saveStatusByMatchId[match.id];

        return (
          <div
            key={match.id}
            className={`space-y-4 glass-card enter-item p-5 ${
              match.status == MatchStatus.LIVE ? "border-live/50 live-glow" : "border-border"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <span className="text-xs uppercase text-muted-foreground">
                    {match.sports?.name} • {match.location}
                  </span>
                  <Badge className={`w-fit ${MATCH_NAIPE_BADGE_CLASS_NAMES[match.naipe]}`}>
                    {MATCH_NAIPE_LABELS[match.naipe]}
                  </Badge>
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
                      <p className="text-[11px] font-semibold uppercase text-rose-700">Cartões Vermelhos</p>
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
                      <p className="text-[11px] font-semibold uppercase text-rose-700">Cartões Vermelhos</p>
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
    </div>
  );
}
