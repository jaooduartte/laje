import type { Match } from "@/lib/types";
import { Radio, Square } from "lucide-react";
import { AppBadge } from "@/components/ui/app-badge";
import {
  TEAM_DIVISION_LABELS,
  resolveMatchNaipeBadgeTone,
  resolveMatchNaipeLabel,
  resolveMatchSetSummary,
  resolveMatchStartedAtLabel,
} from "@/lib/championship";
import { AppBadgeTone, ChampionshipSportResultRule, MatchStatus } from "@/lib/enums";

interface Props {
  matches: Match[];
  matchRepresentationByMatchId?: Record<string, string>;
  estimatedStartTimeByMatchId?: Record<string, string>;
}

function RedCardIndicator({ quantity }: { quantity: number }) {
  if (quantity <= 0) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 dark:text-rose-400">
      <Square className="h-2.5 w-2.5 fill-rose-600 text-rose-600 dark:fill-rose-500 dark:text-rose-500" />
      {quantity}
    </span>
  );
}

export function LiveMatchBanner({
  matches,
  matchRepresentationByMatchId = {},
  estimatedStartTimeByMatchId = {},
}: Props) {
  if (matches.length === 0) return null;

  return (
    <div className="enter-section space-y-4">
      <div className="flex items-center justify-center gap-2">
        <Radio className="h-5 w-5 text-live live-pulse" />
        <h2 className="text-xl font-display font-bold text-live">AO VIVO AGORA</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:items-stretch">
        {matches.map((match) => {
          const startedAtLabel = resolveMatchStartedAtLabel(match.start_time);
          const matchRepresentation = matchRepresentationByMatchId[match.id];
          const estimatedStartTime = estimatedStartTimeByMatchId[match.id];
          const isSetMatch = match.result_rule == ChampionshipSportResultRule.SETS;
          const setSummary = isSetMatch ? resolveMatchSetSummary(match) : [];
          const displayedHomeScore = isSetMatch ? match.current_set_home_score ?? 0 : match.home_score;
          const displayedAwayScore = isSetMatch ? match.current_set_away_score ?? 0 : match.away_score;

          return (
            <div
              key={match.id}
              className={`w-full ${matches.length == 1 ? "md:col-span-2 md:mx-auto md:max-w-3xl" : "max-w-2xl"} ${matches.length > 1 ? "md:h-full" : ""}`}
            >
              <div className="glass-card h-full border-live/30 p-6 live-glow">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {match.sports?.name} • {match.location}
                    </div>
                    {startedAtLabel ? (
                      <p className="text-xs text-muted-foreground">{startedAtLabel}</p>
                    ) : null}
                    {matchRepresentation ? (
                      <p className="break-words text-xs text-muted-foreground">Representação: {matchRepresentation}</p>
                    ) : null}
                    {match.status == MatchStatus.SCHEDULED && estimatedStartTime ? (
                      <p className="break-words text-xs text-muted-foreground">Horário estimado: {estimatedStartTime}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <AppBadge tone={resolveMatchNaipeBadgeTone(String(match.naipe))}>
                      {resolveMatchNaipeLabel(String(match.naipe))}
                    </AppBadge>
                    {match.division ? <AppBadge tone={AppBadgeTone.NEUTRAL}>{TEAM_DIVISION_LABELS[match.division]}</AppBadge> : null}
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
                    <span className="text-4xl font-display font-bold text-live score-text">{displayedHomeScore}</span>
                    <span className="text-xl text-muted-foreground">×</span>
                    <span className="text-4xl font-display font-bold text-live score-text">{displayedAwayScore}</span>
                  </div>
                  <div className="flex-1">
                    <p className="inline-flex items-center gap-1 text-lg font-display font-bold">
                      {match.away_team?.name}
                      <RedCardIndicator quantity={match.away_red_cards} />
                    </p>
                    <p className="text-xs text-muted-foreground">{match.away_team?.city}</p>
                  </div>
                </div>

                {isSetMatch ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-center text-xs text-muted-foreground">Sets: {match.home_score} × {match.away_score}</p>
                    {setSummary.length > 0 ? (
                      <div className="space-y-1 rounded-lg border border-border/40 bg-background/40 p-2">
                        {setSummary.map((matchSetItem) => (
                          <p key={`${match.id}-live-set-${matchSetItem.setNumber}`} className="text-[11px] text-muted-foreground">
                            {matchSetItem.text}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
