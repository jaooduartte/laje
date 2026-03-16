import type { Match } from "@/lib/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Square } from "lucide-react";
import { AppBadgeTone, BracketPhase, ChampionshipSportResultRule, MatchStatus } from "@/lib/enums";
import { AppBadge } from "@/components/ui/app-badge";
import {
  type MatchBracketContext,
  TEAM_DIVISION_LABELS,
  resolveMatchQueueLabel,
  resolveMatchNaipeBadgeTone,
  resolveMatchNaipeLabel,
  resolveMatchScheduledDateValue,
  resolveMatchSetSummary,
  resolveMatchStartedAtLabel,
  resolveMatchStatusBadgeTone,
  resolveMatchStatusLabel,
  resolveMatchTieBreakRuleLabel,
} from "@/lib/championship";

interface Props {
  match: Match;
  showChampionshipBadge?: boolean;
  bracketContext?: MatchBracketContext;
  showStartedAtDate?: boolean;
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

export function MatchCard({
  match,
  showChampionshipBadge = true,
  bracketContext,
  showStartedAtDate = false,
}: Props) {
  const matchCardClassName =
    match.status == MatchStatus.LIVE
      ? "list-item-card list-item-card-live flex h-full w-full flex-col p-4 live-glow"
      : "list-item-card list-item-card-hover flex h-full w-full flex-col p-4";
  const scheduledDateValue = resolveMatchScheduledDateValue(match);
  const scheduledQueueLabel = resolveMatchQueueLabel(match.queue_position);
  const scheduledDayLabel = scheduledDateValue
    ? `${format(new Date(`${scheduledDateValue}T12:00:00`), "dd/MM", { locale: ptBR })} • ${scheduledQueueLabel}`
    : scheduledQueueLabel;
  const isSetMatch = match.result_rule == ChampionshipSportResultRule.SETS;
  const matchSetSummary = isSetMatch ? resolveMatchSetSummary(match) : [];
  const tieBreakRuleLabel =
    match.status == MatchStatus.FINISHED ? resolveMatchTieBreakRuleLabel(match.resolved_tie_breaker_rule) : null;
  const startedAtLabel = match.start_time
    ? showStartedAtDate
      ? `Jogo iniciado em ${format(new Date(match.start_time), "dd/MM • HH:mm", { locale: ptBR })}`
      : resolveMatchStartedAtLabel(match.start_time)
    : null;
  const footerScheduleLabel =
    match.status == MatchStatus.SCHEDULED
      ? scheduledDayLabel
      : startedAtLabel ?? scheduledDayLabel;
  const liveSetHomeScore = match.current_set_home_score ?? 0;
  const liveSetAwayScore = match.current_set_away_score ?? 0;
  const displayedHomeScore =
    match.status == MatchStatus.SCHEDULED
      ? null
      : isSetMatch && match.status == MatchStatus.LIVE
        ? liveSetHomeScore
        : match.home_score;
  const displayedAwayScore =
    match.status == MatchStatus.SCHEDULED
      ? null
      : isSetMatch && match.status == MatchStatus.LIVE
        ? liveSetAwayScore
        : match.away_score;

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
            <p className="text-xl font-display font-bold text-muted-foreground">×</p>
          ) : (
            <p className="text-xl font-display font-bold score-text">
              {displayedHomeScore} <span className="text-muted-foreground text-sm">×</span> {displayedAwayScore}
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

      {isSetMatch && match.status == MatchStatus.LIVE ? (
        <div className="mt-3">
          <p className="text-center text-xs text-muted-foreground">Sets: {match.home_score} × {match.away_score}</p>
        </div>
      ) : null}

      {matchSetSummary.length > 0 && match.status != MatchStatus.SCHEDULED ? (
        <div className="mt-3 space-y-1 rounded-lg border border-border/40 bg-background/40 p-2">
          {matchSetSummary.map((matchSetItem) => (
            <p key={`${match.id}-set-summary-${matchSetItem.setNumber}`} className="text-[11px] text-muted-foreground">
              {matchSetItem.text}
            </p>
          ))}
        </div>
      ) : null}

      {tieBreakRuleLabel ? (
        <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-500">
          <AlertTriangle className="h-3 w-3" />
          Desempate por {tieBreakRuleLabel}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between pt-3 text-xs text-muted-foreground">
        <span>{match.location}</span>
        <span>{footerScheduleLabel}</span>
      </div>
    </div>
  );
}
