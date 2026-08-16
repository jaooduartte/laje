import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ChampionshipIndividualTeamStanding, Standing } from "@/lib/types";

type IndividualStandingRow = ChampionshipIndividualTeamStanding | Standing;

interface Props {
  standings: IndividualStandingRow[];
  isLoading?: boolean;
}

function resolvePlacementValue(standing: IndividualStandingRow, placement: number) {
  switch (placement) {
    case 1: return standing.first_places ?? 0;
    case 2: return standing.second_places ?? 0;
    case 3: return standing.third_places ?? 0;
    case 4: return standing.fourth_places ?? 0;
    case 5: return standing.fifth_places ?? 0;
    default: return 0;
  }
}

function resolvePointsValue(standing: IndividualStandingRow) {
  if ("total_points" in standing) {
    return standing.total_points;
  }

  return standing.points;
}

function resolveEventsCount(standing: IndividualStandingRow) {
  if ("scored_events_count" in standing && typeof standing.scored_events_count == "number") {
    return standing.scored_events_count;
  }

  return 0;
}

function resolveRelayPoints(standing: IndividualStandingRow) {
  return typeof standing.relay_points_total == "number" ? standing.relay_points_total : 0;
}

export function IndividualSportStandingsTable({ standings, isLoading = false }: Props) {
  if (isLoading) {
    return <div className="glass-panel h-56 animate-pulse rounded-3xl bg-secondary/30" />;
  }

  if (standings.length == 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma classificação disponível.</p>;
  }

  return (
    <div className="glass-panel overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/40">
            <TableHead className="w-8 text-center font-display font-bold">#</TableHead>
            <TableHead className="font-display font-bold">Atlética</TableHead>
            <TableHead className="w-16 text-center font-display font-bold">PTS</TableHead>
            <TableHead className="w-16 text-center font-display font-bold">1os</TableHead>
            <TableHead className="w-16 text-center font-display font-bold">2os</TableHead>
            <TableHead className="w-16 text-center font-display font-bold">3os</TableHead>
            <TableHead className="w-16 text-center font-display font-bold">4os</TableHead>
            <TableHead className="w-16 text-center font-display font-bold">5os</TableHead>
            <TableHead className="w-20 text-center font-display font-bold">Provas</TableHead>
            <TableHead className="w-24 text-center font-display font-bold">Revez. 2x</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {standings.map((standing, index) => (
            <TableRow key={`${standing.team_id}:${standing.division ?? "WITHOUT_DIVISION"}`}>
              <TableCell className="text-center font-display font-bold text-muted-foreground">{index + 1}</TableCell>
              <TableCell className="font-display font-semibold">
                {"teams" in standing ? standing.teams?.name ?? "-" : "-"}
              </TableCell>
              <TableCell className="text-center font-display font-bold text-primary">{resolvePointsValue(standing)}</TableCell>
              <TableCell className="text-center">{resolvePlacementValue(standing, 1)}</TableCell>
              <TableCell className="text-center">{resolvePlacementValue(standing, 2)}</TableCell>
              <TableCell className="text-center">{resolvePlacementValue(standing, 3)}</TableCell>
              <TableCell className="text-center">{resolvePlacementValue(standing, 4)}</TableCell>
              <TableCell className="text-center">{resolvePlacementValue(standing, 5)}</TableCell>
              <TableCell className="text-center">{resolveEventsCount(standing)}</TableCell>
              <TableCell className="text-center">{resolveRelayPoints(standing)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
