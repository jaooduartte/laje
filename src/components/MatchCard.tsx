import type { Match } from "@/lib/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Square } from "lucide-react";
import { AppBadgeTone, BracketPhase, ChampionshipSportResultRule, MatchStatus } from "@/lib/enums";
import { AppBadge } from "@/components/ui/app-badge";
import {
  type MatchBracketContext,
  TEAM_DIVISION_BADGE_TONES,
  TEAM_DIVISION_LABELS,
  resolveSaoPauloDateTimeLabel,
  resolveMatchDisplaySlotValue,
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
  matchRepresentation?: string;
  visualQueuePosition?: number;
  estimatedStartTime?: string;
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
  matchRepresentation,
  visualQueuePosition,
  estimatedStartTime,
}: Props) {
  const matchCardClassName =
    match.status == MatchStatus.LIVE
      ? "list-item-card list-item-card-live flex h-full w-full flex-col p-4 live-glow dark:bg-[hsl(0_0%_12%)]"
      : "list-item-card list-item-card-hover flex h-full w-full flex-col p-4 dark:bg-[hsl(0_0%_12%)] dark:hover:bg-[hsl(0_0%_14%)]";
  const scheduledDateValue = resolveMatchScheduledDateValue(match);
  const scheduledQueueLabel = resolveMatchQueueLabel(visualQueuePosition ?? resolveMatchDisplaySlotValue(match));
  const scheduledDayLabel = scheduledDateValue
    ? `${format(new Date(`${scheduledDateValue}T12:00:00`), "dd/MM", { locale: ptBR })} • ${scheduledQueueLabel}`
    : scheduledQueueLabel;
  const isSetMatch = match.result_rule == ChampionshipSportResultRule.SETS;
  const matchSetSummary = isSetMatch ? resolveMatchSetSummary(match) : [];
  const tieBreakRuleLabel =
    match.status == MatchStatus.FINISHED ? resolveMatchTieBreakRuleLabel(match.resolved_tie_breaker_rule) : null;
  const startedAtDateTimeLabel = match.start_time ? resolveSaoPauloDateTimeLabel(match.start_time) : null;
  const startedAtLabel =
    match.status == MatchStatus.SCHEDULED || !match.start_time
      ? null
      : showStartedAtDate
        ? startedAtDateTimeLabel
          ? `Jogo iniciado em ${startedAtDateTimeLabel.slice(8, 10)}/${startedAtDateTimeLabel.slice(5, 7)} • ${startedAtDateTimeLabel.slice(11, 16)}`
          : resolveMatchStartedAtLabel(match.start_time, match.status)
        : resolveMatchStartedAtLabel(match.start_time, match.status);
  const footerScheduleLabel =
    match.status == MatchStatus.SCHEDULED
      ? scheduledDayLabel
      : startedAtLabel ?? scheduledDayLabel;
  const shouldShowFinishedQueueSummary = match.status == MatchStatus.FINISHED;
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
      <div className="mb-3 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {match.sports?.name}
          </span>
          <AppBadge tone={resolveMatchStatusBadgeTone(match.status)} className="shrink-0">
            {resolveMatchStatusLabel(match.status)}
          </AppBadge>
        </div>
        <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {showChampionshipBadge && match.championships?.name ? (
            <AppBadge tone={AppBadgeTone.PRIMARY}>
              {match.championships.name}
            </AppBadge>
          ) : null}
          <AppBadge tone={resolveMatchNaipeBadgeTone(String(match.naipe))}>
            {resolveMatchNaipeLabel(String(match.naipe))}
          </AppBadge>
          {match.division ? (
            <AppBadge tone={TEAM_DIVISION_BADGE_TONES[match.division]}>
              <span className="sm:hidden">
                {match.division == "DIVISAO_PRINCIPAL" ? "Div. Principal" : "Div. Acesso"}
              </span>
              <span className="hidden sm:inline">{TEAM_DIVISION_LABELS[match.division]}</span>
            </AppBadge>
          ) : null}
          {bracketContext ? (
            <AppBadge tone={resolveBracketBadgeTone(bracketContext)}>
              {bracketContext.badgeLabel}
            </AppBadge>
          ) : null}
          {match.is_walkover ? (
            <AppBadge tone={AppBadgeTone.NEUTRAL}>W.O.</AppBadge>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center">
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
          <div className="mt-4 flex justify-center">
            <div className="w-full max-w-lg">
              <div className="mx-auto h-3 w-px bg-primary/70" />
              <div className="border-t-2 border-primary/70" />

              <div className="mt-2 space-y-2">
                {matchSetSummary.map((matchSetItem) => (
                  <div
                    key={`${match.id}-set-summary-${matchSetItem.setNumber}`}
                    className="rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5"
                  >
                    <p className="text-center font-display text-[13px] font-semibold text-foreground">
                      Set {matchSetItem.setNumber}: {matchSetItem.homeTeamName}{" "}
                      <span className="score-text text-base font-bold">{matchSetItem.homePoints}</span>
                      <span className="mx-1 text-muted-foreground">×</span>
                      <span className="score-text text-base font-bold">{matchSetItem.awayPoints}</span>{" "}
                      {matchSetItem.awayTeamName}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {tieBreakRuleLabel ? (
          <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-500">
            <AlertTriangle className="h-3 w-3" />
            Desempate por {tieBreakRuleLabel}
          </div>
        ) : null}
      </div>

      <div className="space-y-1 pt-3 text-xs text-muted-foreground">
        {matchRepresentation ? <p className="break-words">Representação: {matchRepresentation}</p> : null}
        {shouldShowFinishedQueueSummary ? <p className="break-words">Fila: {scheduledDayLabel}</p> : null}
        {match.status == MatchStatus.SCHEDULED && estimatedStartTime ? (
          <p className="break-words">Horário estimado: {estimatedStartTime}</p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{match.court_name ? `${match.location} • ${match.court_name}` : match.location}</span>
          <span>{footerScheduleLabel}</span>
        </div>
      </div>
    </div>
  );
}
