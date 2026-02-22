import type { Match } from "@/lib/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MatchStatus } from "@/lib/enums";
import { Badge } from "@/components/ui/badge";
import { MATCH_NAIPE_BADGE_CLASS_NAMES, MATCH_NAIPE_LABELS, TEAM_DIVISION_LABELS } from "@/lib/championship";

interface Props {
  match: Match;
  showChampionshipBadge?: boolean;
}

const statusStyles: Record<MatchStatus, string> = {
  [MatchStatus.SCHEDULED]: "bg-secondary text-scheduled",
  [MatchStatus.LIVE]: "bg-live/10 text-live",
  [MatchStatus.FINISHED]: "bg-primary/10 text-primary",
};

const statusLabels: Record<MatchStatus, string> = {
  [MatchStatus.SCHEDULED]: "Agendado",
  [MatchStatus.LIVE]: "Ao Vivo",
  [MatchStatus.FINISHED]: "Encerrado",
};

export function MatchCard({ match, showChampionshipBadge = true }: Props) {
  return (
    <div className="rounded-lg bg-card border border-border p-4 hover:border-primary/30 transition-colors">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {match.sports?.name}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {showChampionshipBadge && match.championships?.name ? (
              <Badge variant="secondary" className="border-transparent bg-primary/10 text-primary">
                {match.championships.name}
              </Badge>
            ) : null}
            <Badge className={MATCH_NAIPE_BADGE_CLASS_NAMES[match.naipe]}>
              {MATCH_NAIPE_LABELS[match.naipe]}
            </Badge>
            {match.division ? (
              <Badge variant="secondary">{TEAM_DIVISION_LABELS[match.division]}</Badge>
            ) : null}
          </div>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusStyles[match.status]}`}>
          {statusLabels[match.status]}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex-1 text-right">
          <p className="font-display font-semibold text-sm">{match.home_team?.name}</p>
        </div>
        <div className="mx-4 text-center">
          {match.status === MatchStatus.SCHEDULED ? (
            <p className="text-sm font-display font-bold text-muted-foreground">
              {format(new Date(match.start_time), "HH:mm", { locale: ptBR })}
            </p>
          ) : (
            <p className="text-xl font-display font-bold score-text">
              {match.home_score} <span className="text-muted-foreground text-sm">×</span> {match.away_score}
            </p>
          )}
        </div>
        <div className="flex-1">
          <p className="font-display font-semibold text-sm">{match.away_team?.name}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{match.location}</span>
        <span>{format(new Date(match.start_time), "dd/MM • HH:mm", { locale: ptBR })}</span>
      </div>
    </div>
  );
}
