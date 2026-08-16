import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MatchNaipe, TeamDivision } from "@/lib/enums";
import {
  type ScheduledKnockoutPlaceholder,
  resolvePublicScheduleTimeLabel,
} from "@/domain/public-schedule/publicScheduleTimeline";

export function ChampionshipKnockoutPlaceholderCard({
  placeholder,
}: {
  placeholder: ScheduledKnockoutPlaceholder;
}) {
  return (
    <div className="list-item-card list-item-card-hover flex h-full w-full flex-col p-4 dark:bg-[hsl(0_0%_12%)] dark:hover:bg-[hsl(0_0%_14%)]">
      <div className="mb-3 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {placeholder.sport_name}
          </span>
          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-400">
            A definir
          </span>
        </div>
        <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <span className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] font-medium">
            {placeholder.naipe == MatchNaipe.MASCULINO
              ? "Masculino"
              : placeholder.naipe == MatchNaipe.FEMININO
                ? "Feminino"
                : "Misto"}
          </span>
          {placeholder.division ? (
            <span className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] font-medium">
              {placeholder.division == TeamDivision.DIVISAO_PRINCIPAL
                ? "Divisão Principal"
                : "Divisão de Acesso"}
            </span>
          ) : null}
          <span className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] font-medium">
            {placeholder.stage_label}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <div className="flex items-center justify-between">
          <div className="flex-1 text-right">
            <p className="font-display text-sm font-semibold text-muted-foreground">
              A definir
            </p>
          </div>
          <div className="mx-4 text-center">
            <p className="text-xl font-display font-bold text-muted-foreground">
              ×
            </p>
          </div>
          <div className="flex-1">
            <p className="font-display text-sm font-semibold text-muted-foreground">
              A definir
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-1 pt-3 text-xs text-muted-foreground">
        <p>Representação: {placeholder.stage_label}</p>
        {placeholder.start_time ? (
          <p>
            Horário planejado:{" "}
            {resolvePublicScheduleTimeLabel(placeholder.start_time) ??
              "A definir"}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {placeholder.location ?? "Local a definir"}
            {placeholder.court_name ? ` • ${placeholder.court_name}` : ""}
          </span>
          <span>
            {format(
              new Date(`${placeholder.scheduled_date}T12:00:00`),
              "dd/MM",
              { locale: ptBR },
            )}
            {placeholder.scheduled_slot != null
              ? ` • Jogo ${placeholder.scheduled_slot}`
              : placeholder.queue_position != null
                ? ` • Fila ${placeholder.queue_position}`
                : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
