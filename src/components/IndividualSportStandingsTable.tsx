import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import {
  moveDisqualifiedStandingsToBottom,
  resolveTeamStandingAggregateKey,
} from "@/lib/standings";
import type { ChampionshipIndividualTeamStanding } from "@/lib/types";

type IndividualStandingRow = Pick<
  ChampionshipIndividualTeamStanding,
  "team_id" | "division"
> & {
  team_name?: string | null;
  teams?: ChampionshipIndividualTeamStanding["teams"];
  total_points?: number;
  points?: number;
  scored_events_count?: number;
  first_places?: number;
  second_places?: number;
  third_places?: number;
  fourth_places?: number;
  fifth_places?: number;
  relay_points_total?: number;
};

interface Props {
  standings: IndividualStandingRow[];
  isLoading?: boolean;
  disqualifiedTeamKeys?: ReadonlySet<string>;
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
  if (typeof standing.total_points == "number") {
    return standing.total_points;
  }

  return standing.points ?? 0;
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

export function IndividualSportStandingsTable({
  standings,
  isLoading = false,
  disqualifiedTeamKeys,
}: Props) {
  if (isLoading) {
    return (
      <TableSkeleton
        rows={10}
        columns={10}
      />
    );
  }

  if (standings.length == 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma classificação disponível.</p>;
  }

  const orderedStandings = moveDisqualifiedStandingsToBottom(
    standings,
    disqualifiedTeamKeys,
  );

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
          {orderedStandings.map((standing, index) => {
            const isDisqualified =
              disqualifiedTeamKeys?.has(resolveTeamStandingAggregateKey(standing)) ??
              false;

            return (
            <TableRow key={`${standing.team_id}:${standing.division ?? "WITHOUT_DIVISION"}`}>
              <TableCell className="text-center font-display font-bold text-muted-foreground">{index + 1}</TableCell>
              <TableCell className="font-display font-semibold">
                <div className="flex items-center gap-2">
                  {standing.teams?.name ?? standing.team_name ?? "-"}
                  {isDisqualified ? (
                    <span className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-300">
                      Desclassificada
                    </span>
                  ) : null}
                </div>
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
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
