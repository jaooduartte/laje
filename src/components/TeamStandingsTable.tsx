import {
  formatPointsAverageForStandings,
  formatStandingsPoints,
  moveDisqualifiedStandingsToBottom,
  resolveTeamStandingAggregateKey,
  type TeamStandingAggregate,
} from "@/lib/standings";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CircleAlert, Shuffle } from "lucide-react";
import { type ModalidadeConfig, type StandingsColumnKey, STANDINGS_COLUMN_LABELS, STANDINGS_COLUMN_TOOLTIPS } from "@/lib/modalidadeConfig";

export interface TeamStandingsBadge {
  key: string;
  label: string;
  mobileLabel?: string;
  className: string;
}

type TeamStandingsTableStanding = Omit<TeamStandingAggregate, "team_city">;

interface Props {
  standings: TeamStandingsTableStanding[];
  modalidadeConfig?: ModalidadeConfig;
  isLoading?: boolean;
  variant?: "full" | "public";
  drawWinners?: Set<string>;
  groupLabelByTeamId?: Map<string, string>;
  disqualifiedTeamKeys?: ReadonlySet<string>;
  pendingTieBreakTeamIds?: ReadonlySet<string>;
  teamBadgesByTeamId?: ReadonlyMap<string, TeamStandingsBadge[]>;
  showMobileBadgeLegend?: boolean;
}

const MOBILE_BADGE_LEGEND_LABEL_BY_KEY: Record<string, string> = {
  "projected-placement": "Colocação projetada",
  "opening-bonus": "Bônus de abertura",
  "walkover-penalty": "Desconto por W.O.",
  "pending-tie-break": "Desempate pendente",
};

const PENDING_TIE_BREAK_BADGE_CLASS_NAME =
  "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";

function resolveTopPlacementRowClass(position: number): string {
  if (position == 1) {
    return "bg-amber-100/40 hover:bg-amber-100/60 dark:bg-amber-800/30 dark:hover:bg-amber-900/80";
  }

  if (position == 2) {
    return "bg-slate-100/70 hover:bg-slate-100 dark:bg-slate-700/30 dark:hover:bg-gray-700/60";
  }

  if (position == 3) {
    return "bg-orange-100/40 hover:bg-orange-100/60 dark:bg-orange-800/20 dark:hover:bg-orange-900/50";
  }

  return "hover:bg-secondary/20";
}

function renderCell(col: StandingsColumnKey, standing: TeamStandingsTableStanding): React.ReactNode {
  switch (col) {
    case "J": return standing.played;
    case "V": return standing.wins;
    case "E": return standing.draws;
    case "D": return standing.losses;
    case "GP": return standing.goals_for;
    case "GC": return standing.goals_against;
    case "SG": return standing.goal_diff;
    case "PA": return formatPointsAverageForStandings(standing.goals_for, standing.goals_against);
    case "CA": return standing.yellow_cards;
    case "CV": return standing.red_cards;
    case "CAZ": return standing.blue_cards;
    case "2M": return standing.two_minute_penalties;
  }
}

// Colunas exibidas quando não há configuração de modalidade (legado/cross-sport)
const DEFAULT_COLUMNS: StandingsColumnKey[] = ["J", "V", "E", "D", "GP", "GC", "SG", "PA"];

export function TeamStandingsTable({
  standings,
  modalidadeConfig,
  isLoading = false,
  variant = "full",
  drawWinners,
  groupLabelByTeamId,
  disqualifiedTeamKeys,
  pendingTieBreakTeamIds,
  teamBadgesByTeamId,
  showMobileBadgeLegend = false,
}: Props) {
  if (isLoading) {
  const columnsCount =
    variant === "public"
      ? 3
      : (modalidadeConfig?.display_columns ?? DEFAULT_COLUMNS).length + 3;

  return (
    <TableSkeleton
      rows={10}
      columns={columnsCount}
      className="enter-section"
    />
  );
}

  if (standings.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma classificação disponível.</p>;
  }

  const isPublic = variant === "public";
  const activeColumns = modalidadeConfig?.display_columns ?? DEFAULT_COLUMNS;
  const orderedStandings = moveDisqualifiedStandingsToBottom(standings, disqualifiedTeamKeys);
  const mobileBadgeLegendByKey = new Map<string, TeamStandingsBadge>();

  if (showMobileBadgeLegend) {
    orderedStandings.forEach((standing) => {
      teamBadgesByTeamId?.get(standing.team_id)?.forEach((badge) => {
        mobileBadgeLegendByKey.set(badge.key, badge);
      });

      if (pendingTieBreakTeamIds?.has(standing.team_id)) {
        mobileBadgeLegendByKey.set("pending-tie-break", {
          key: "pending-tie-break",
          label: "Desempate geral pendente",
          className: PENDING_TIE_BREAK_BADGE_CLASS_NAME,
        });
      }
    });
  }

  const mobileBadgeLegend = Array.from(mobileBadgeLegendByKey.values());

  return (
    <div className="glass-panel enter-section overflow-hidden">
      {showMobileBadgeLegend && mobileBadgeLegend.length > 0 ? (
        <div className="space-y-2 border-b border-border/60 px-3 py-2 sm:hidden">
          <p className="text-[10px] text-center font-medium uppercase tracking-wide text-muted-foreground">
            Legenda dos badges
          </p>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5">
            {mobileBadgeLegend.map((badge) => (
              <span
                key={badge.key}
                className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full border ${badge.className}`}
                />
                {MOBILE_BADGE_LEGEND_LABEL_BY_KEY[badge.key] ?? badge.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/40">
            <TableHead className="w-8 text-center font-display font-bold">#</TableHead>
            <TableHead className="font-display font-bold">Atlética</TableHead>
            {!isPublic &&
              activeColumns.map((col) => (
                <TableHead
                  key={col}
                  className="w-10 text-center font-display font-bold"
                  title={STANDINGS_COLUMN_TOOLTIPS[col]}
                >
                  {STANDINGS_COLUMN_LABELS[col]}
                </TableHead>
              ))}
            <TableHead className="w-12 text-center font-display font-bold">PTS</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orderedStandings.map((standing, standingIndex) => {
            const standingPosition = standingIndex + 1;
            const isDrawWinner = !isPublic && drawWinners?.has(standing.team_id);
            const isDisqualified = disqualifiedTeamKeys?.has(resolveTeamStandingAggregateKey(standing)) ?? false;
            const hasPendingTieBreak = pendingTieBreakTeamIds?.has(standing.team_id) ?? false;
            const groupLabel = groupLabelByTeamId?.get(standing.team_id);
            const teamBadges = teamBadgesByTeamId?.get(standing.team_id) ?? [];

            return (
              <TableRow
                key={`${standing.team_id}:${standing.division ?? "WITHOUT_DIVISION"}`}
                className={resolveTopPlacementRowClass(standingPosition)}
              >
                <TableCell className="text-center font-display font-bold text-muted-foreground">
                  {standingIndex + 1}
                </TableCell>
                <TableCell className="font-display font-semibold">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 whitespace-nowrap">
                      {standing.team_name}
                    </span>
                    <div data-testid={`team-standing-badges-${standing.team_id}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:gap-2">
                      {groupLabel && (
                        <span className="inline-flex shrink-0 whitespace-nowrap items-center rounded-full border border-muted-foreground/20 bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {groupLabel}
                        </span>
                      )}
                      {isDrawWinner && (
                        <span className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          <Shuffle className="h-3 w-3" />
                          Desempate por sorteio
                        </span>
                      )}
                      {hasPendingTieBreak && (
                        <span className={`inline-flex h-6 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium ${PENDING_TIE_BREAK_BADGE_CLASS_NAME}`}>
                          <span className={showMobileBadgeLegend ? "sm:hidden" : "hidden"}>
                            <CircleAlert aria-label="Desempate pendente" className="h-3 w-3" />
                          </span>
                          <span className={`whitespace-nowrap ${showMobileBadgeLegend ? "hidden sm:inline" : "inline"}`}>
                            Desempate geral pendente
                          </span>
                        </span>
                      )}
                      {isDisqualified && (
                        <span className="inline-flex shrink-0 whitespace-nowrap items-center rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-300">
                          Desclassificada
                        </span>
                      )}
                      {teamBadges.map((badge) => (
                        <span
                          key={badge.key}
                          className={`inline-flex shrink-0 whitespace-nowrap items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
                        >
                          <span className={showMobileBadgeLegend ? "sm:hidden" : "hidden"}>
                            {badge.mobileLabel ?? badge.label}
                          </span>
                          <span className={`whitespace-nowrap ${showMobileBadgeLegend ? "hidden sm:inline" : "inline"}`}>
                            {badge.label}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                </TableCell>
                {!isPublic &&
                  activeColumns.map((col) => (
                    <TableCell key={col} className="text-center score-text tabular-nums">
                      {renderCell(col, standing)}
                    </TableCell>
                  ))}
                <TableCell className="text-center font-display font-bold text-primary">
                  {formatStandingsPoints(standing.points)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
