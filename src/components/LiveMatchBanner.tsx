import type { Match } from '@/lib/types';
import { Radio, Square } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { MATCH_NAIPE_BADGE_CLASS_NAMES, MATCH_NAIPE_LABELS, TEAM_DIVISION_LABELS } from '@/lib/championship';

interface Props {
  matches: Match[];
}

function RedCardIndicator({ quantity }: { quantity: number }) {
  if (quantity <= 0) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700">
      <Square className="h-2.5 w-2.5 fill-rose-600 text-rose-600" />
      {quantity}
    </span>
  );
}

export function LiveMatchBanner({ matches }: Props) {
  if (matches.length === 0) return null;

  return (
    <div className="enter-section space-y-4">
      <div className="flex items-center gap-2">
        <Radio className="h-5 w-5 text-live live-pulse" />
        <h2 className="text-xl font-display font-bold text-live">AO VIVO AGORA</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {matches.map((match) => (
          <div
            key={match.id}
            className={`w-full ${matches.length == 1 ? "md:col-span-2 md:mx-auto md:max-w-3xl" : ""}`}
          >
            <div className="glass-card glass-card-hover border-live/30 p-6 live-glow">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {match.sports?.name} • {match.location}
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge className={MATCH_NAIPE_BADGE_CLASS_NAMES[match.naipe]}>
                    {MATCH_NAIPE_LABELS[match.naipe]}
                  </Badge>
                  {match.division ? <Badge variant="secondary">{TEAM_DIVISION_LABELS[match.division]}</Badge> : null}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex-1 text-right">
                  <p className="inline-flex items-center gap-1 text-lg font-display font-bold">
                    {match.home_team?.name}
                    <RedCardIndicator quantity={match.home_red_cards} />
                  </p>
                  <p className="text-xs text-muted-foreground">{match.home_team?.city}</p>
                </div>
                <div className="mx-6 flex items-center gap-3">
                  <span className="text-4xl font-display font-bold text-live score-text">{match.home_score}</span>
                  <span className="text-xl text-muted-foreground">×</span>
                  <span className="text-4xl font-display font-bold text-live score-text">{match.away_score}</span>
                </div>
                <div className="flex-1">
                  <p className="inline-flex items-center gap-1 text-lg font-display font-bold">
                    {match.away_team?.name}
                    <RedCardIndicator quantity={match.away_red_cards} />
                  </p>
                  <p className="text-xs text-muted-foreground">{match.away_team?.city}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
