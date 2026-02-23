import type { TeamStandingAggregate } from "@/lib/standings";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Props {
  standings: TeamStandingAggregate[];
  showCardColumns?: boolean;
}

function resolveTopPlacementRowClass(position: number): string {
  if (position == 1) {
    return "bg-amber-100/45 hover:bg-amber-100/60";
  }

  if (position == 2) {
    return "bg-slate-100/70 hover:bg-slate-100";
  }

  if (position == 3) {
    return "bg-orange-100/40 hover:bg-orange-100/60";
  }

  return "hover:bg-secondary/30";
}

export function TeamStandingsTable({ standings, showCardColumns = false }: Props) {
  if (standings.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Nenhuma classificação disponível.</p>;
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/50">
            <TableHead className="w-8 text-center">#</TableHead>
            <TableHead>Atlética</TableHead>
            <TableHead className="text-center w-10">J</TableHead>
            <TableHead className="text-center w-10">V</TableHead>
            <TableHead className="text-center w-10">E</TableHead>
            <TableHead className="text-center w-10">D</TableHead>
            {showCardColumns ? <TableHead className="text-center w-10">CA</TableHead> : null}
            {showCardColumns ? <TableHead className="text-center w-10">CV</TableHead> : null}
            <TableHead className="text-center w-10">GP</TableHead>
            <TableHead className="text-center w-10">GC</TableHead>
            <TableHead className="text-center w-10">SG</TableHead>
            <TableHead className="text-center w-12 font-bold">PTS</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {standings.map((standing, standingIndex) => {
            const standingPosition = standingIndex + 1;

            return (
              <TableRow
                key={`${standing.team_id}:${standing.division ?? "WITHOUT_DIVISION"}`}
                className={resolveTopPlacementRowClass(standingPosition)}
              >
                <TableCell className="text-center font-display font-bold text-muted-foreground">{standingIndex + 1}</TableCell>
                <TableCell className="font-display font-semibold">{standing.team_name}</TableCell>
                <TableCell className="text-center score-text">{standing.played}</TableCell>
                <TableCell className="text-center score-text">{standing.wins}</TableCell>
                <TableCell className="text-center score-text">{standing.draws}</TableCell>
                <TableCell className="text-center score-text">{standing.losses}</TableCell>
                {showCardColumns ? <TableCell className="text-center score-text">{standing.yellow_cards}</TableCell> : null}
                {showCardColumns ? <TableCell className="text-center score-text">{standing.red_cards}</TableCell> : null}
                <TableCell className="text-center score-text">{standing.goals_for}</TableCell>
                <TableCell className="text-center score-text">{standing.goals_against}</TableCell>
                <TableCell className="text-center score-text">{standing.goal_diff}</TableCell>
                <TableCell className="text-center font-display font-bold text-primary">{standing.points}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
