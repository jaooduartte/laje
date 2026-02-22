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
}

type SaveStatus = "saving" | "saved" | "error";

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

export function AdminMatchControl({ matches, onRefetch }: Props) {
  const [scores, setScores] = useState<Record<string, { home: number; away: number }>>({});
  const [saveStatusByMatchId, setSaveStatusByMatchId] = useState<Record<string, SaveStatus | undefined>>({});

  const saveTimeoutByMatchIdRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const clearStatusTimeoutByMatchIdRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});

  useEffect(() => {
    setScores((previousScores) => {
      const nextScores: Record<string, { home: number; away: number }> = {};

      matches.forEach((match) => {
        const previousScore = previousScores[match.id];

        if (previousScore) {
          nextScores[match.id] = previousScore;
          return;
        }

        nextScores[match.id] = { home: match.home_score, away: match.away_score };
      });

      return nextScores;
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

  const getScore = (match: Match) => {
    return scores[match.id] ?? { home: match.home_score, away: match.away_score };
  };

  const setMatchSaveStatus = (matchId: string, saveStatus: SaveStatus | undefined) => {
    setSaveStatusByMatchId((previousStatusMap) => ({
      ...previousStatusMap,
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

  const persistScore = async (matchId: string, homeScore: number, awayScore: number) => {
    setMatchSaveStatus(matchId, "saving");

    const { error } = await supabase
      .from("matches")
      .update({
        home_score: homeScore,
        away_score: awayScore,
      })
      .eq("id", matchId);

    if (error) {
      setMatchSaveStatus(matchId, "error");
      return false;
    }

    setMatchSaveStatus(matchId, "saved");
    scheduleClearSavedStatus(matchId);
    return true;
  };

  const scheduleAutosave = (matchId: string, homeScore: number, awayScore: number) => {
    const saveTimeoutReference = saveTimeoutByMatchIdRef.current[matchId];

    if (saveTimeoutReference) {
      clearTimeout(saveTimeoutReference);
    }

    saveTimeoutByMatchIdRef.current[matchId] = setTimeout(() => {
      persistScore(matchId, homeScore, awayScore);
    }, 500);
  };

  const updateScore = (match: Match, side: "home" | "away", delta: number) => {
    if (match.status !== MatchStatus.LIVE) {
      return;
    }

    setScores((previousScores) => {
      const currentScore = previousScores[match.id] ?? {
        home: match.home_score,
        away: match.away_score,
      };

      const nextScore = {
        ...currentScore,
        [side]: Math.max(0, currentScore[side] + delta),
      };

      scheduleAutosave(match.id, nextScore.home, nextScore.away);

      return {
        ...previousScores,
        [match.id]: nextScore,
      };
    });
  };

  const updateManualInputScore = (match: Match, side: "home" | "away", value: string) => {
    if (match.status !== MatchStatus.LIVE) {
      return;
    }

    const parsedValue = Number(value);
    const safeValue = Number.isNaN(parsedValue) ? 0 : Math.max(0, parsedValue);

    setScores((previousScores) => {
      const currentScore = previousScores[match.id] ?? {
        home: match.home_score,
        away: match.away_score,
      };

      const nextScore = {
        ...currentScore,
        [side]: safeValue,
      };

      scheduleAutosave(match.id, nextScore.home, nextScore.away);

      return {
        ...previousScores,
        [match.id]: nextScore,
      };
    });
  };

  const handleSetLive = async (matchId: string) => {
    const { error } = await supabase.from("matches").update({ status: MatchStatus.LIVE }).eq("id", matchId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Jogo iniciado!");
    onRefetch();
  };

  const flushPendingAutosave = async (matchId: string, homeScore: number, awayScore: number) => {
    const saveTimeoutReference = saveTimeoutByMatchIdRef.current[matchId];

    if (saveTimeoutReference) {
      clearTimeout(saveTimeoutReference);
      saveTimeoutByMatchIdRef.current[matchId] = undefined;
    }

    return persistScore(matchId, homeScore, awayScore);
  };

  const handleFinish = async (match: Match) => {
    const currentScore = getScore(match);
    const scoreSaved = await flushPendingAutosave(match.id, currentScore.home, currentScore.away);

    if (!scoreSaved) {
      toast.error("Não foi possível salvar o placar antes de finalizar o jogo.");
      return;
    }

    const { error } = await supabase
      .from("matches")
      .update({
        home_score: currentScore.home,
        away_score: currentScore.away,
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

  if (matches.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum jogo ao vivo ou agendado.</p>;
  }

  return (
    <div className="space-y-4">
      {matches.map((match) => {
        const score = getScore(match);
        const matchSaveStatus = saveStatusByMatchId[match.id];

        return (
          <div
            key={match.id}
            className={`space-y-4 rounded-lg border bg-card p-5 ${
              match.status === MatchStatus.LIVE ? "border-live/50 live-glow" : "border-border"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs uppercase text-muted-foreground">
                  {match.sports?.name} • {match.location}
                </span>
                <Badge className={`ml-2 ${MATCH_NAIPE_BADGE_CLASS_NAMES[match.naipe]}`}>
                  {MATCH_NAIPE_LABELS[match.naipe]}
                </Badge>
                {match.status === MatchStatus.LIVE ? (
                  <span className="ml-2 text-xs font-bold text-live live-pulse">● AO VIVO</span>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {match.status === MatchStatus.LIVE && matchSaveStatus ? (
                  <span className={`text-xs font-semibold ${SAVE_STATUS_CLASS_NAMES[matchSaveStatus]}`}>
                    {SAVE_STATUS_LABELS[matchSaveStatus]}
                  </span>
                ) : null}

                {match.status === MatchStatus.SCHEDULED ? (
                  <Button
                    size="sm"
                    onClick={() => handleSetLive(match.id)}
                    className="bg-live text-primary-foreground hover:bg-live-glow"
                  >
                    <Play className="h-3 w-3 mr-1" /> Iniciar
                  </Button>
                ) : null}

                {match.status === MatchStatus.LIVE ? (
                  <Button size="sm" variant="destructive" onClick={() => handleFinish(match)}>
                    <Square className="h-3 w-3 mr-1" /> Finalizar
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-6">
              <div className="min-w-0 text-right">
                <p className="font-display font-bold">{match.home_team?.name}</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => updateScore(match, "home", -1)}
                    disabled={match.status !== MatchStatus.LIVE}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>

                  <Input
                    type="number"
                    value={score.home}
                    onChange={(event) => updateManualInputScore(match, "home", event.target.value)}
                    className="score-text h-12 w-14 border-border bg-secondary text-center font-display text-2xl font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    disabled={match.status !== MatchStatus.LIVE}
                  />

                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => updateScore(match, "home", 1)}
                    disabled={match.status !== MatchStatus.LIVE}
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
                    disabled={match.status !== MatchStatus.LIVE}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>

                  <Input
                    type="number"
                    value={score.away}
                    onChange={(event) => updateManualInputScore(match, "away", event.target.value)}
                    className="score-text h-12 w-14 border-border bg-secondary text-center font-display text-2xl font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    disabled={match.status !== MatchStatus.LIVE}
                  />

                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => updateScore(match, "away", 1)}
                    disabled={match.status !== MatchStatus.LIVE}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="min-w-0">
                <p className="font-display font-bold">{match.away_team?.name}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
