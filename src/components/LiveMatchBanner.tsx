import type { Match } from '@/lib/types';
import { Radio } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { MATCH_NAIPE_BADGE_CLASS_NAMES, MATCH_NAIPE_LABELS, TEAM_DIVISION_LABELS } from '@/lib/championship';

interface Props {
  matches: Match[];
}

export function LiveMatchBanner({ matches }: Props) {
  if (matches.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Radio className="h-5 w-5 text-live live-pulse" />
        <h2 className="text-xl font-display font-bold text-live">AO VIVO AGORA</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {matches.map((match) => (
          <div key={match.id} className="rounded-lg bg-card border border-live/30 p-6 live-glow">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {match.sports?.name} • {match.location}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge className={MATCH_NAIPE_BADGE_CLASS_NAMES[match.naipe]}>
                    {MATCH_NAIPE_LABELS[match.naipe]}
                  </Badge>
                  {match.division ? <Badge variant="secondary">{TEAM_DIVISION_LABELS[match.division]}</Badge> : null}
                </div>
              </div>
              {match.championships?.name ? (
                <Badge variant="secondary" className="border-transparent bg-primary/10 text-primary">
                  {match.championships.name}
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex-1 text-right">
                <p className="text-lg font-display font-bold">{match.home_team?.name}</p>
                <p className="text-xs text-muted-foreground">{match.home_team?.city}</p>
              </div>
              <div className="mx-6 flex items-center gap-3">
                <span className="text-4xl font-display font-bold text-live score-text">{match.home_score}</span>
                <span className="text-xl text-muted-foreground">×</span>
                <span className="text-4xl font-display font-bold text-live score-text">{match.away_score}</span>
              </div>
              <div className="flex-1">
                <p className="text-lg font-display font-bold">{match.away_team?.name}</p>
                <p className="text-xs text-muted-foreground">{match.away_team?.city}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
