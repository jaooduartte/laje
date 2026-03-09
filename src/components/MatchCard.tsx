import type { Match } from "@/lib/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Square } from "lucide-react";
import { AppBadgeTone, BracketPhase, MatchStatus } from "@/lib/enums";
import { AppBadge } from "@/components/ui/app-badge";
import {
  type MatchBracketContext,
  TEAM_DIVISION_LABELS,
  resolveMatchNaipeBadgeTone,
  resolveMatchNaipeLabel,
  resolveMatchStatusBadgeTone,
  resolveMatchStatusLabel,
} from "@/lib/championship";

interface Props {
  match: Match;
  showChampionshipBadge?: boolean;
  bracketContext?: MatchBracketContext;
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

function resolveBracketBadgeTone(bracketContext: MatchBracketContext): AppBadgeTone {
  return bracketContext.phase == BracketPhase.KNOCKOUT ? AppBadgeTone.AMBER : AppBadgeTone.NEUTRAL;
}

export function MatchCard({ match, showChampionshipBadge = true, bracketContext }: Props) {
  const matchCardClassName =
    match.status == MatchStatus.LIVE
      ? "list-item-card list-item-card-live w-full p-4 live-glow"
      : "list-item-card list-item-card-hover w-full p-4";

  return (
    <div className={matchCardClassName}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {match.sports?.name}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {showChampionshipBadge && match.championships?.name ? (
              <AppBadge tone={AppBadgeTone.PRIMARY}>
                {match.championships.name}
              </AppBadge>
            ) : null}
            <AppBadge tone={resolveMatchNaipeBadgeTone(String(match.naipe))}>
              {resolveMatchNaipeLabel(String(match.naipe))}
            </AppBadge>
            {match.division ? (
              <AppBadge tone={AppBadgeTone.NEUTRAL}>{TEAM_DIVISION_LABELS[match.division]}</AppBadge>
            ) : null}
            {bracketContext ? (
              <AppBadge tone={resolveBracketBadgeTone(bracketContext)}>
                {bracketContext.badgeLabel}
              </AppBadge>
            ) : null}
          </div>
        </div>
        <AppBadge tone={resolveMatchStatusBadgeTone(match.status)} className="shrink-0">
          {resolveMatchStatusLabel(match.status)}
        </AppBadge>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex-1 text-right">
          <p className="inline-flex items-center gap-1 font-display text-sm font-semibold">
            {match.home_team?.name}
            {match.status != MatchStatus.SCHEDULED ? <RedCardIndicator quantity={match.home_red_cards} /> : null}
          </p>
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
          <p className="inline-flex items-center gap-1 font-display text-sm font-semibold">
            {match.away_team?.name}
            {match.status != MatchStatus.SCHEDULED ? <RedCardIndicator quantity={match.away_red_cards} /> : null}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{match.location}</span>
        <span>{format(new Date(match.start_time), "dd/MM • HH:mm", { locale: ptBR })}</span>
      </div>
    </div>
  );
}
