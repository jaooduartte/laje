import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  MATCH_NAIPE_LABELS,
  TEAM_DIVISION_LABELS,
  resolveChampionshipGroupLabel,
} from "@/lib/championship";
import type { ChampionshipBracketWizardCompetitionOption } from "@/domain/championship-brackets/championshipBracketWizardView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  drawnTeamId: string | null;
  drawingTeamIds: string[];
  teamNameById: Record<string, string>;
  competitionOption: ChampionshipBracketWizardCompetitionOption | null;
  groupNumber: number | null;
  onResultReady?: () => void;
}

export function AdminBracketDrawModal({
  open,
  onOpenChange,
  onConfirm,
  drawnTeamId,
  drawingTeamIds,
  teamNameById,
  competitionOption,
  groupNumber,
  onResultReady,
}: Props) {
  const [displayedTeamId, setDisplayedTeamId] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [showConfirmButton, setShowConfirmButton] = useState(false);
  const onResultReadyRef = useRef(onResultReady);
  const animatedDrawnTeamIdRef = useRef<string | null>(null);
  const confirmButtonTimeoutReference = useRef<number | null>(null);
  onResultReadyRef.current = onResultReady;

  useEffect(() => {
    if (confirmButtonTimeoutReference.current != null) {
      window.clearTimeout(confirmButtonTimeoutReference.current);
      confirmButtonTimeoutReference.current = null;
    }

    if (!open || !drawnTeamId || drawingTeamIds.length === 0) {
      animatedDrawnTeamIdRef.current = null;
      setDisplayedTeamId(null);
      setIsAnimating(false);
      setShowResult(false);
      setShowConfirmButton(false);
      return;
    }

    if (animatedDrawnTeamIdRef.current === drawnTeamId) {
      setDisplayedTeamId(drawnTeamId);
      setIsAnimating(false);
      setShowResult(true);
      setShowConfirmButton(true);
      return;
    }

    animatedDrawnTeamIdRef.current = drawnTeamId;
    setIsAnimating(true);
    setShowResult(false);
    setShowConfirmButton(false);
    setDisplayedTeamId(drawingTeamIds[Math.floor(Math.random() * drawingTeamIds.length)]);

    let elapsed = 0;
    const duration = 2400;
    const interval = setInterval(() => {
      elapsed += 80;
      const randomId = drawingTeamIds[Math.floor(Math.random() * drawingTeamIds.length)];
      setDisplayedTeamId(randomId);

      if (elapsed >= duration) {
        clearInterval(interval);
        setDisplayedTeamId(drawnTeamId);
        setIsAnimating(false);
        setShowResult(true);
        onResultReadyRef.current?.();

        confirmButtonTimeoutReference.current = window.setTimeout(() => {
          setShowConfirmButton(true);
        }, 1000);
      }
    }, 80);

    return () => {
      clearInterval(interval);
      if (confirmButtonTimeoutReference.current != null) {
        window.clearTimeout(confirmButtonTimeoutReference.current);
        confirmButtonTimeoutReference.current = null;
      }
    };
  }, [open, drawnTeamId, drawingTeamIds]);

  const displayedTeamName = teamNameById[displayedTeamId ?? ""] ?? "...";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}
        className="max-w-[640px] p-0 sm:max-w-[720px]"
      >
        <div className="relative flex min-h-[420px] flex-col items-center justify-center overflow-hidden rounded-[2.5rem] bg-white dark:bg-[#0c0c0e] p-10 text-center shadow-2xl border border-gray-200 dark:border-white/5">
          {/* Background Decorative Elements */}
          <div className="absolute inset-0 z-0">
            <div className="absolute -left-1/4 -top-1/4 h-1/2 w-1/2 rounded-full bg-primary/10 blur-[120px] animate-pulse" />
            <div className="absolute -right-1/4 -bottom-1/4 h-1/2 w-1/2 rounded-full bg-red-500/5 dark:bg-red-900/10 blur-[120px] animate-pulse" />
          </div>

          <DialogHeader className="sr-only">
            <DialogTitle>Sorteio</DialogTitle>
            <DialogDescription>Sorteando atlética para a competição</DialogDescription>
          </DialogHeader>

          <div className="relative z-10 flex w-full flex-col items-center gap-8">
            <div className="space-y-2">
              <p className={cn(
                "text-xs font-black uppercase tracking-[0.3em] text-gray-500 dark:text-white transition-colors duration-500",
              )}>
                {showResult ? "Atlética Sorteada" : "Sorteando Atlética"}
              </p>
              <div className={cn(
                "h-1 w-12 rounded-full mx-auto transition-colors duration-500",
                showResult ? "bg-primary/40" : "bg-gray-300 dark:bg-white/40"
              )} />
            </div>

            <div className="min-h-[160px] flex items-center justify-center w-full">
              <h2
                className={cn(
                  "text-5xl font-black leading-tight tracking-tighter sm:text-7xl lg:text-8xl transition-all duration-150",
                  isAnimating
                    ? "scale-95 blur-[4px] opacity-40 text-gray-400 dark:text-white"
                    : "scale-100 blur-0 opacity-100 bg-gradient-to-br from-gray-900 via-gray-700 to-gray-500 dark:from-white dark:via-white dark:to-slate-400 bg-clip-text text-transparent animate-in zoom-in-95 duration-500"
                )}
              >
                {displayedTeamName}
              </h2>
            </div>

            {showResult && groupNumber != null && competitionOption && (
              <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 slide-in-from-bottom-8 duration-700 delay-300">
                <div className="flex items-center gap-3">
                  <div className="h-px w-8 bg-gray-200 dark:bg-slate-800" />
                  <span className="text-sm font-medium text-gray-400 dark:text-slate-400">Distribuída para</span>
                  <div className="h-px w-8 bg-gray-200 dark:bg-slate-800" />
                </div>

                <div className="flex flex-wrap justify-center gap-2.5">
                  <Badge className="bg-primary hover:bg-primary border-none px-4 py-1.5 text-base font-bold text-white shadow-lg shadow-primary/20">
                    {resolveChampionshipGroupLabel(groupNumber)}
                  </Badge>
                  {competitionOption.division ? (
                    <Badge variant="outline" className="border-gray-200 bg-gray-100 dark:border-slate-700 dark:bg-slate-900/50 px-3 py-1 text-sm text-gray-700 dark:text-slate-200">
                      {TEAM_DIVISION_LABELS[competitionOption.division]}
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="border-gray-200 bg-gray-100 dark:border-slate-700 dark:bg-slate-900/50 px-3 py-1 text-sm text-gray-700 dark:text-slate-200">
                    {MATCH_NAIPE_LABELS[competitionOption.naipe]}
                  </Badge>
                  <Badge variant="outline" className="border-gray-200 bg-gray-100 dark:border-slate-700 dark:bg-slate-900/50 px-3 py-1 text-sm text-gray-700 dark:text-slate-200">
                    {competitionOption.sport_name}
                  </Badge>
                </div>
              </div>
            )}
            
            {showConfirmButton && (
              <div className="animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-700 mt-2">
                <Button 
                  onClick={onConfirm}
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-white font-bold px-12 rounded-xl h-12 shadow-xl shadow-primary/20"
                >
                  Confirmar Sorteio
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
