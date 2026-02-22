import type { Match } from '@/lib/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  match: Match;
}

const statusStyles: Record<string, string> = {
  SCHEDULED: 'bg-secondary text-scheduled',
  LIVE: 'bg-live/10 text-live',
  FINISHED: 'bg-secondary text-finished',
};

const statusLabels: Record<string, string> = {
  SCHEDULED: 'Agendado',
  LIVE: 'Ao Vivo',
  FINISHED: 'Encerrado',
};

export function MatchCard({ match }: Props) {
  return (
    <div className="rounded-lg bg-card border border-border p-4 hover:border-primary/30 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {match.sports?.name}
        </span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusStyles[match.status]}`}>
          {statusLabels[match.status]}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex-1 text-right">
          <p className="font-display font-semibold text-sm">{match.home_team?.name}</p>
        </div>
        <div className="mx-4 text-center">
          {match.status === 'SCHEDULED' ? (
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
