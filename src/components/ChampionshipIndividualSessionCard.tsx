import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ChampionshipIndividualSession } from "@/lib/types";
import { MatchNaipe, TeamDivision } from "@/lib/enums";
import { TEAM_DIVISION_LABELS } from "@/lib/championship";

export function ChampionshipIndividualSessionCard({
  session,
  eventCount,
}: {
  session: ChampionshipIndividualSession;
  eventCount: number;
}) {
  const naipeLabel =
    session.naipe == MatchNaipe.MASCULINO
      ? "Masculino"
      : session.naipe == MatchNaipe.FEMININO
        ? "Feminino"
        : "Misto";
  const periodLabel =
    session.period == "MATUTINO"
      ? "Matutino"
      : session.period == "VESPERTINO"
        ? "Vespertino"
        : null;

  return (
    <div className="list-item-card list-item-card-hover flex h-full w-full flex-col p-4 dark:bg-[hsl(0_0%_12%)] dark:hover:bg-[hsl(0_0%_14%)]">
      <div className="mb-3 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {session.sports?.name ?? "Modalidade individual"}
          </span>
          <span className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] font-medium">
            Sessão
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] font-medium">
            {naipeLabel}
          </span>
          {session.division ? (
            <span className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] font-medium">
              {TEAM_DIVISION_LABELS[session.division as TeamDivision]}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <p className="text-center font-display text-lg font-semibold">
          Sessão de {session.sports?.name ?? "modalidade individual"}
        </p>
      </div>

      <div className="space-y-1 pt-3 text-xs text-muted-foreground">
        {eventCount > 0 ? (
          <p>{eventCount} provas oficiais vinculadas</p>
        ) : null}
        {periodLabel ? <p>Período: {periodLabel}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {session.location_name ?? "Local a definir"}
            {session.court_name ? ` • ${session.court_name}` : ""}
          </span>
          <span>
            {session.scheduled_date
              ? format(new Date(`${session.scheduled_date}T12:00:00`), "dd/MM", {
                  locale: ptBR,
                })
              : "Sem data"}
          </span>
        </div>
      </div>
    </div>
  );
}
