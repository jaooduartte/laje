import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronDown, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { YellowCardDisciplineAthlete } from "@/hooks/useChampionshipYellowCardDiscipline";
import { MATCH_NAIPE_LABELS, TEAM_DIVISION_LABELS } from "@/lib/championship";

const DISCIPLINE_MATCH_PHASE_LABELS: Record<string, string> = {
  GROUP_STAGE: "Fase de grupos",
  QUARTERFINAL: "Quartas de final",
  SEMIFINAL: "Semifinal",
  FINAL: "Final",
  THIRD_PLACE: "Disputa de 3º lugar",
};

function resolveDisciplineMatchPhaseLabel(phase: string): string {
  return DISCIPLINE_MATCH_PHASE_LABELS[phase] ?? phase;
}

function resolveDisciplineMatchDateTime(
  scheduledDate: string | null,
  startTime: string | null,
): string {
  const dateLabel = scheduledDate
    ? format(new Date(`${scheduledDate}T12:00:00`), "dd/MM/yyyy", {
        locale: ptBR,
      })
    : "Data não informada";

  if (!startTime) {
    return dateLabel;
  }

  const parsedStartTime = new Date(startTime);
  const timeLabel = /^\d{2}:\d{2}/.test(startTime)
    ? startTime.slice(0, 5)
    : Number.isNaN(parsedStartTime.getTime())
      ? "Horário não informado"
      : format(parsedStartTime, "HH:mm", { locale: ptBR });

  return `${dateLabel} • ${timeLabel}`;
}

export function YellowCardDisciplineTable({
  athletes,
  loading = false,
  error = null,
  onRetry,
  emptyMessage = "Nenhum cartão individual foi informado neste filtro.",
}: {
  athletes: YellowCardDisciplineAthlete[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyMessage?: string;
}) {
  if (loading) {
    return <Skeleton className="h-48 w-full rounded-xl" />;
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-8 text-center text-sm text-destructive"
      >
        <p>{error}</p>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Tentar novamente
          </Button>
        ) : null}
      </div>
    );
  }

  if (athletes.length == 0) {
    return (
      <p className="rounded-xl border border-dashed border-muted-foreground/30 px-4 py-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {athletes.map((athlete) => (
        <details key={athlete.player_id} className="group list-item-card p-4">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-semibold">{athlete.player_name}</p>
                <p className="text-xs text-muted-foreground">
                  {athlete.team_name} • {athlete.sport_name} • {MATCH_NAIPE_LABELS[athlete.naipe]}
                  {athlete.division ? ` • ${TEAM_DIVISION_LABELS[athlete.division]}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-100">
                  {athlete.yellow_cards_total} amarelo{athlete.yellow_cards_total == 1 ? "" : "s"}
                </span>
                <span className="rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-800 dark:bg-red-950 dark:text-red-100">
                  {athlete.red_cards_direct_total} vermelho{athlete.red_cards_direct_total == 1 ? "" : "s"} direto{athlete.red_cards_direct_total == 1 ? "" : "s"}
                </span>
                <span className={athlete.is_suspended ? "rounded-full bg-slate-200 px-2.5 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200" : "rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"}>
                  {athlete.is_suspended ? "Suspenso" : "Liberado"}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                />
              </div>
            </div>
          </summary>
          <div className="mt-3 grid gap-6 border-t border-border/50 pt-3 text-sm lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="space-y-1 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Histórico por partida</p>
              {athlete.matches.map((match, index) => (
                <div key={`${match.match_id}-${index}`} className="space-y-1 border-t border-border/50 pt-2 first:border-t-0 first:pt-0">
                  <p className="font-medium text-foreground">
                    {match.match_number != null ? `Jogo ${match.match_number} • ` : ""}
                    {resolveDisciplineMatchDateTime(match.scheduled_date, match.start_time)}
                  </p>
                  <p>
                    {athlete.team_name} × {match.opponent_name ?? "Adversário a definir"} • {resolveDisciplineMatchPhaseLabel(match.phase)}
                  </p>
                  <div className="flex items-center gap-3">
                    {match.yellow_cards > 0 ? (
                      <span className="inline-flex items-center gap-1" aria-label={`${match.yellow_cards} cartão amarelo${match.yellow_cards == 1 ? "" : "s"}`}>
                        <Square className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                        {match.yellow_cards}
                      </span>
                    ) : null}
                    {match.red_cards_direct > 0 ? (
                      <span className="inline-flex items-center gap-1" aria-label={`${match.red_cards_direct} cartão vermelho direto${match.red_cards_direct == 1 ? "" : "s"}`}>
                        <Square className="h-2.5 w-2.5 fill-rose-600 text-rose-600 dark:fill-rose-500 dark:text-rose-500" />
                        {match.red_cards_direct}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {athlete.is_suspended ? (
                <p className="text-destructive">
                  {athlete.next_match
                    ? `Suspenso para a próxima partida contra ${athlete.next_match.opponent_name ?? "adversário a definir"}.`
                    : "Suspenso para a próxima partida da equipe."}
                </p>
              ) : null}
              {athlete.is_suspended && athlete.suspension_causes.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Motivo: {athlete.suspension_causes.some((cause) => cause.direct_red) ? "vermelho direto" : ""}
                  {athlete.suspension_causes.some((cause) => cause.direct_red) && athlete.suspension_causes.some((cause) => cause.yellow_accumulation) ? " e " : ""}
                  {athlete.suspension_causes.some((cause) => cause.yellow_accumulation) ? "acúmulo de amarelos" : ""}.
                </p>
              ) : null}
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
