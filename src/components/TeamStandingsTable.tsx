import {
  formatPointsAverageForStandings,
  formatStandingsPoints,
  type TeamStandingAggregate,
} from "@/lib/standings";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shuffle } from "lucide-react";
import { type ModalidadeConfig, type StandingsColumnKey, STANDINGS_COLUMN_LABELS, STANDINGS_COLUMN_TOOLTIPS } from "@/lib/modalidadeConfig";

interface Props {
  standings: TeamStandingAggregate[];
  modalidadeConfig?: ModalidadeConfig;
  isLoading?: boolean;
  variant?: "full" | "public";
  drawWinners?: Set<string>;
  groupLabelByTeamId?: Map<string, string>;
}

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

function renderCell(col: StandingsColumnKey, standing: TeamStandingAggregate): React.ReactNode {
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
}: Props) {
  if (isLoading) {
    return (
      <div className="glass-panel enter-section overflow-hidden p-1">
        <div className="space-y-4">
          <div className="bg-secondary/40 h-10 w-full animate-pulse rounded-t-lg" />
          <div className="space-y-2 px-3 pb-3">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={`standings-skeleton-${index}`} className="flex gap-3">
                <div className="h-8 w-8 animate-pulse rounded bg-secondary/20" />
                <div className="h-8 flex-1 animate-pulse rounded bg-secondary/20" />
                <div className="h-8 w-10 animate-pulse rounded bg-secondary/20" />
                <div className="h-8 w-10 animate-pulse rounded bg-secondary/20" />
                <div className="h-8 w-12 animate-pulse rounded bg-secondary/20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (standings.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma classificação disponível.</p>;
  }

  const isPublic = variant === "public";
  const activeColumns = modalidadeConfig?.display_columns ?? DEFAULT_COLUMNS;

  return (
    <div className="glass-panel enter-section overflow-hidden">
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
          {standings.map((standing, standingIndex) => {
            const standingPosition = standingIndex + 1;
            const isDrawWinner = !isPublic && drawWinners?.has(standing.team_id);

            const groupLabel = groupLabelByTeamId?.get(standing.team_id);

            return (
              <TableRow
                key={`${standing.team_id}:${standing.division ?? "WITHOUT_DIVISION"}`}
                className={resolveTopPlacementRowClass(standingPosition)}
              >
                <TableCell className="text-center font-display font-bold text-muted-foreground">
                  {standingIndex + 1}
                </TableCell>
                <TableCell className="font-display font-semibold">
                  <div className="flex items-center gap-2">
                    {standing.team_name}
                    {groupLabel && (
                      <span className="inline-flex items-center rounded-full border border-muted-foreground/20 bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {groupLabel}
                      </span>
                    )}
                    {isDrawWinner && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        <Shuffle className="h-3 w-3" />
                        Desempate por sorteio
                      </span>
                    )}
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
