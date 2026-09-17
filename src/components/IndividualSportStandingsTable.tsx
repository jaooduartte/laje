import { useEffect, useMemo, useState } from "react";
import {
  fetchChampionshipIndividualEventEntries,
  fetchChampionshipIndividualEvents,
} from "@/domain/individual-events/championshipIndividualEvents.repository";
import { ChampionshipIndividualEventKind, type MatchNaipe } from "@/lib/enums";
import {
  formatStandingsPoints,
  moveDisqualifiedStandingsToBottom,
  resolveTeamStandingAggregateKey,
} from "@/lib/standings";
import type {
  ChampionshipIndividualEvent,
  ChampionshipIndividualEventEntry,
  ChampionshipIndividualTeamStanding,
} from "@/lib/types";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsNavigationList,
  TabsNavigationTrigger,
  useTabsNavigationVisibility,
} from "@/components/ui/tabs";

type IndividualStandingRow = Pick<
  ChampionshipIndividualTeamStanding,
  "team_id" | "division"
> & {
  championship_id?: string;
  season_year?: number;
  sport_id?: string;
  naipe?: MatchNaipe;
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
  sixth_places?: number;
  seventh_places?: number;
  eighth_places?: number;
  ninth_places?: number;
  tenth_places?: number;
  eleventh_places?: number;
  twelfth_places?: number;
  thirteenth_places?: number;
  fourteenth_places?: number;
  fifteenth_places?: number;
  sixteenth_places?: number;
  seventeenth_places?: number;
  eighteenth_places?: number;
  nineteenth_places?: number;
  twentieth_places?: number;
};

interface IndividualEventGroup {
  key: string;
  name: string;
  kind: ChampionshipIndividualEventKind;
  displayOrder: number;
  events: ChampionshipIndividualEvent[];
}

interface Props {
  standings: IndividualStandingRow[];
  isLoading?: boolean;
  disqualifiedTeamKeys?: ReadonlySet<string>;
}

const OVERALL_TAB = "overall";
const PLACEMENTS = Array.from({ length: 20 }, (_, index) => index + 1);

function resolvePointsValue(standing: IndividualStandingRow) {
  if (typeof standing.total_points == "number") {
    return standing.total_points;
  }

  return standing.points ?? 0;
}

function resolvePlacementValue(standing: IndividualStandingRow, placement: number) {
  switch (placement) {
    case 1:
      return standing.first_places ?? 0;
    case 2:
      return standing.second_places ?? 0;
    case 3:
      return standing.third_places ?? 0;
    case 4:
      return standing.fourth_places ?? 0;
    case 5:
      return standing.fifth_places ?? 0;
    case 6:
      return standing.sixth_places ?? 0;
    case 7:
      return standing.seventh_places ?? 0;
    case 8:
      return standing.eighth_places ?? 0;
    case 9:
      return standing.ninth_places ?? 0;
    case 10:
      return standing.tenth_places ?? 0;
    case 11:
      return standing.eleventh_places ?? 0;
    case 12:
      return standing.twelfth_places ?? 0;
    case 13:
      return standing.thirteenth_places ?? 0;
    case 14:
      return standing.fourteenth_places ?? 0;
    case 15:
      return standing.fifteenth_places ?? 0;
    case 16:
      return standing.sixteenth_places ?? 0;
    case 17:
      return standing.seventeenth_places ?? 0;
    case 18:
      return standing.eighteenth_places ?? 0;
    case 19:
      return standing.nineteenth_places ?? 0;
    case 20:
      return standing.twentieth_places ?? 0;
    default:
      return 0;
  }
}

function resolvePlacementField(placement: number): keyof IndividualStandingRow | null {
  const fields: Array<keyof IndividualStandingRow> = [
    "first_places",
    "second_places",
    "third_places",
    "fourth_places",
    "fifth_places",
    "sixth_places",
    "seventh_places",
    "eighth_places",
    "ninth_places",
    "tenth_places",
    "eleventh_places",
    "twelfth_places",
    "thirteenth_places",
    "fourteenth_places",
    "fifteenth_places",
    "sixteenth_places",
    "seventeenth_places",
    "eighteenth_places",
    "nineteenth_places",
    "twentieth_places",
  ];

  return fields[placement - 1] ?? null;
}

function sortIndividualStandings(standings: IndividualStandingRow[]) {
  return [...standings].sort((firstStanding, secondStanding) => {
    const pointsDifference =
      resolvePointsValue(secondStanding) - resolvePointsValue(firstStanding);
    if (pointsDifference != 0) {
      return pointsDifference;
    }

    for (const placement of PLACEMENTS) {
      const placementDifference =
        resolvePlacementValue(secondStanding, placement) -
        resolvePlacementValue(firstStanding, placement);
      if (placementDifference != 0) {
        return placementDifference;
      }
    }

    const firstName = firstStanding.teams?.name ?? firstStanding.team_name ?? "";
    const secondName = secondStanding.teams?.name ?? secondStanding.team_name ?? "";
    return firstName.localeCompare(secondName, "pt-BR", { sensitivity: "base" });
  });
}

function aggregateIndividualStandings(standings: IndividualStandingRow[]) {
  const standingsByTeam = new Map<string, IndividualStandingRow>();

  standings.forEach((standing) => {
    const key = resolveTeamStandingAggregateKey(standing);
    const current = standingsByTeam.get(key);

    if (!current) {
      standingsByTeam.set(key, {
        ...standing,
        naipe: undefined,
        total_points: resolvePointsValue(standing),
        points: undefined,
      });
      return;
    }

    current.total_points =
      resolvePointsValue(current) + resolvePointsValue(standing);
    current.scored_events_count =
      (current.scored_events_count ?? 0) + (standing.scored_events_count ?? 0);

    PLACEMENTS.forEach((placement) => {
      const field = resolvePlacementField(placement);
      if (!field) {
        return;
      }

      const currentValue = Number(current[field] ?? 0);
      const incomingValue = Number(standing[field] ?? 0);
      (current as Record<string, unknown>)[field] = currentValue + incomingValue;
    });
  });

  return [...standingsByTeam.values()];
}

function groupIndividualEvents(events: ChampionshipIndividualEvent[]) {
  const groupsByKey = new Map<string, IndividualEventGroup>();

  events.forEach((event) => {
    const key = event.event_code || event.name;
    const existingGroup = groupsByKey.get(key);

    if (existingGroup) {
      existingGroup.events.push(event);
      existingGroup.displayOrder = Math.min(
        existingGroup.displayOrder,
        event.display_order,
      );
      return;
    }

    groupsByKey.set(key, {
      key,
      name: event.name,
      kind: event.kind,
      displayOrder: event.display_order,
      events: [event],
    });
  });

  return [...groupsByKey.values()]
    .map((group) => ({
      ...group,
      events: [...group.events].sort((firstEvent, secondEvent) => {
        const naipeOrder: Record<string, number> = {
          MASCULINO: 0,
          FEMININO: 1,
          MISTO: 2,
        };
        return (
          (naipeOrder[firstEvent.naipe] ?? 99) -
          (naipeOrder[secondEvent.naipe] ?? 99)
        );
      }),
    }))
    .sort((firstGroup, secondGroup) => {
      if (firstGroup.displayOrder != secondGroup.displayOrder) {
        return firstGroup.displayOrder - secondGroup.displayOrder;
      }

      return firstGroup.name.localeCompare(secondGroup.name, "pt-BR", {
        sensitivity: "base",
      });
    });
}

function formatTime(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = milliseconds % 1000;

  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
  }

  return `${seconds}.${String(millis).padStart(3, "0")} s`;
}

function formatEntryResult(entry: ChampionshipIndividualEventEntry) {
  if (typeof entry.result_time_milliseconds == "number") {
    return formatTime(entry.result_time_milliseconds);
  }

  if (typeof entry.result_mark_centimeters == "number") {
    return `${(entry.result_mark_centimeters / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} m`;
  }

  if (entry.final_position == null && entry.status) {
    return String(entry.status).replaceAll("_", " ");
  }

  return "-";
}

function resolveNaipeLabel(naipe: MatchNaipe) {
  if (naipe == "MASCULINO") {
    return "Masculino";
  }

  if (naipe == "FEMININO") {
    return "Feminino";
  }

  return "Misto";
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

export function IndividualSportStandingsTable({
  standings,
  isLoading = false,
  disqualifiedTeamKeys,
}: Props) {
  useTabsNavigationVisibility(true);

  const [events, setEvents] = useState<ChampionshipIndividualEvent[]>([]);
  const [entriesByEventId, setEntriesByEventId] = useState<
    Record<string, ChampionshipIndividualEventEntry[]>
  >({});
  const [eventsLoading, setEventsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(OVERALL_TAB);

  const standingsScope = useMemo(() => {
    const firstStanding = standings[0];
    if (
      !firstStanding?.championship_id ||
      !firstStanding.sport_id ||
      typeof firstStanding.season_year != "number"
    ) {
      return null;
    }

    const naipes = new Set(
      standings
        .map((standing) => standing.naipe)
        .filter((naipe): naipe is MatchNaipe => naipe != null),
    );
    const divisions = new Set(
      standings.map((standing) => standing.division ?? "WITHOUT_DIVISION"),
    );

    return {
      championshipId: firstStanding.championship_id,
      seasonYear: firstStanding.season_year,
      sportId: firstStanding.sport_id,
      naipe: naipes.size == 1 ? [...naipes][0] : null,
      division:
        divisions.size == 1
          ? firstStanding.division ?? null
          : undefined,
    };
  }, [standings]);

  useEffect(() => {
    if (!standingsScope) {
      setEvents([]);
      setEntriesByEventId({});
      setActiveTab(OVERALL_TAB);
      return;
    }

    let isMounted = true;
    setEventsLoading(true);

    void fetchChampionshipIndividualEvents({
      championshipId: standingsScope.championshipId,
      seasonYear: standingsScope.seasonYear,
      sportId: standingsScope.sportId,
    }).then(async (eventsResponse) => {
      if (!isMounted) {
        return;
      }

      if (eventsResponse.error) {
        setEvents([]);
        setEntriesByEventId({});
        setEventsLoading(false);
        return;
      }

      const scopedEvents = eventsResponse.data.filter((event) => {
        if (standingsScope.naipe && event.naipe != standingsScope.naipe) {
          return false;
        }

        if (
          standingsScope.division !== undefined &&
          event.division != standingsScope.division
        ) {
          return false;
        }

        return true;
      });

      const entriesResponse = await fetchChampionshipIndividualEventEntries({
        eventIds: scopedEvents.map((event) => event.id),
      });

      if (!isMounted) {
        return;
      }

      setEvents(scopedEvents);
      if (entriesResponse.error) {
        setEntriesByEventId({});
      } else {
        setEntriesByEventId(
          scopedEvents.reduce<Record<string, ChampionshipIndividualEventEntry[]>>(
            (carry, event) => {
              carry[event.id] = entriesResponse.data.filter(
                (entry) => entry.event_id == event.id,
              );
              return carry;
            },
            {},
          ),
        );
      }
      setActiveTab(OVERALL_TAB);
      setEventsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [standingsScope]);

  const eventGroups = useMemo(() => groupIndividualEvents(events), [events]);

  const orderedStandings = useMemo(
    () =>
      moveDisqualifiedStandingsToBottom(
        sortIndividualStandings(aggregateIndividualStandings(standings)),
        disqualifiedTeamKeys,
      ),
    [disqualifiedTeamKeys, standings],
  );

  const eventPointsByTeamId = useMemo(() => {
    const points = new Map<string, Map<string, number>>();

    eventGroups.forEach((group) => {
      group.events.forEach((event) => {
        (entriesByEventId[event.id] ?? []).forEach((entry) => {
          const teamPoints = points.get(entry.team_id) ?? new Map<string, number>();
          teamPoints.set(
            group.key,
            (teamPoints.get(group.key) ?? 0) + Number(entry.points_awarded ?? 0),
          );
          points.set(entry.team_id, teamPoints);
        });
      });
    });

    return points;
  }, [entriesByEventId, eventGroups]);

  const combinedLoading = isLoading || eventsLoading;

  if (combinedLoading && standings.length == 0) {
    return <TableSkeleton rows={10} columns={8} />;
  }

  if (standings.length == 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhuma classificação disponível.
      </p>
    );
  }

  const renderOverallTable = () => (
    <div className="glass-panel overflow-x-auto">
      <Table className="min-w-max">
        <TableHeader>
          <TableRow className="bg-secondary/40">
            <TableHead className="w-8 text-center font-display font-bold">
              #
            </TableHead>
            <TableHead className="font-display font-bold">Atlética</TableHead>
            {eventGroups.map((group) => (
              <TableHead
                key={group.key}
                className="min-w-28 text-center font-display font-bold"
                title={group.name}
              >
                {group.name}
              </TableHead>
            ))}
            <TableHead className="w-16 text-center font-display font-bold">
              PTS
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orderedStandings.map((standing, index) => {
            const isDisqualified =
              disqualifiedTeamKeys?.has(
                resolveTeamStandingAggregateKey(standing),
              ) ?? false;
            const teamPoints = eventPointsByTeamId.get(standing.team_id);

            return (
              <TableRow
                key={`${standing.team_id}:${standing.division ?? "WITHOUT_DIVISION"}`}
                className={resolveTopPlacementRowClass(index + 1)}
              >
                <TableCell className="text-center font-display font-bold text-muted-foreground">
                  {index + 1}
                </TableCell>
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
                {eventGroups.map((group) => (
                  <TableCell
                    key={group.key}
                    className="text-center tabular-nums"
                  >
                    {formatStandingsPoints(teamPoints?.get(group.key) ?? 0)}
                  </TableCell>
                ))}
                <TableCell className="text-center font-display font-bold text-primary tabular-nums">
                  {formatStandingsPoints(resolvePointsValue(standing))}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );

  const renderSingleEventTable = (
    event: ChampionshipIndividualEvent,
    showNaipeHeading: boolean,
  ) => {
    const orderedEntries = [...(entriesByEventId[event.id] ?? [])].sort(
      (firstEntry, secondEntry) => {
        const firstPosition = firstEntry.final_position ?? Number.MAX_SAFE_INTEGER;
        const secondPosition =
          secondEntry.final_position ?? Number.MAX_SAFE_INTEGER;
        if (firstPosition != secondPosition) {
          return firstPosition - secondPosition;
        }

        const pointsDifference =
          Number(secondEntry.points_awarded ?? 0) -
          Number(firstEntry.points_awarded ?? 0);
        if (pointsDifference != 0) {
          return pointsDifference;
        }

        return (firstEntry.teams?.name ?? "").localeCompare(
          secondEntry.teams?.name ?? "",
          "pt-BR",
          { sensitivity: "base" },
        );
      },
    );

    return (
      <section className="space-y-2" key={event.id}>
        {showNaipeHeading ? (
          <h3 className="text-base font-display font-bold">
            {resolveNaipeLabel(event.naipe)}
          </h3>
        ) : null}

        {orderedEntries.length == 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum resultado registrado para esta prova.
          </p>
        ) : (
          <div className="glass-panel overflow-x-auto">
            <Table className="min-w-max">
              <TableHeader>
                <TableRow className="bg-secondary/40">
                  <TableHead className="w-8 text-center font-display font-bold">
                    #
                  </TableHead>
                  <TableHead className="font-display font-bold">
                    Atlética
                  </TableHead>
                  <TableHead className="font-display font-bold">
                    {event.kind == ChampionshipIndividualEventKind.RELAY
                      ? "Equipe"
                      : "Atleta"}
                  </TableHead>
                  <TableHead className="w-32 text-center font-display font-bold">
                    Resultado
                  </TableHead>
                  <TableHead className="w-16 text-center font-display font-bold">
                    PTS
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderedEntries.map((entry, index) => {
                  const matchingStanding = standings.find(
                    (standing) =>
                      standing.team_id == entry.team_id &&
                      (!standing.naipe || standing.naipe == event.naipe),
                  );
                  const isDisqualified = matchingStanding
                    ? (disqualifiedTeamKeys?.has(
                        resolveTeamStandingAggregateKey(matchingStanding),
                      ) ?? false)
                    : false;

                  return (
                    <TableRow
                      key={entry.id}
                      className={resolveTopPlacementRowClass(index + 1)}
                    >
                      <TableCell className="text-center font-display font-bold text-muted-foreground">
                        {entry.final_position ?? "-"}
                      </TableCell>
                      <TableCell className="font-display font-semibold">
                        <div className="flex items-center gap-2">
                          {entry.teams?.name ?? "-"}
                          {isDisqualified ? (
                            <span className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-300">
                              Desclassificada
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {event.kind == ChampionshipIndividualEventKind.RELAY
                          ? "Equipe"
                          : entry.athlete_name ?? "-"}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {formatEntryResult(entry)}
                      </TableCell>
                      <TableCell className="text-center font-display font-bold text-primary tabular-nums">
                        {formatStandingsPoints(Number(entry.points_awarded ?? 0))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    );
  };

  const renderEventGroup = (group: IndividualEventGroup) => (
    <div className="space-y-5">
      {group.events.map((event) =>
        renderSingleEventTable(event, group.events.length > 1),
      )}
    </div>
  );

  if (eventGroups.length == 0) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Nenhuma prova configurada foi encontrada para o recorte selecionado.
        </p>
        {renderOverallTable()}
      </div>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsNavigationList className="mb-4 max-w-full justify-start">
        {eventGroups.map((group) => (
          <TabsNavigationTrigger key={group.key} value={group.key}>
            {group.name}
          </TabsNavigationTrigger>
        ))}
        <TabsNavigationTrigger value={OVERALL_TAB}>
          Geral da modalidade
        </TabsNavigationTrigger>
      </TabsNavigationList>

      {eventGroups.map((group) => (
        <TabsContent key={group.key} value={group.key}>
          {combinedLoading ? (
            <TableSkeleton rows={10} columns={5} />
          ) : (
            renderEventGroup(group)
          )}
        </TabsContent>
      ))}
      <TabsContent value={OVERALL_TAB}>
        {combinedLoading ? (
          <TableSkeleton rows={10} columns={eventGroups.length + 3} />
        ) : (
          renderOverallTable()
        )}
      </TabsContent>
    </Tabs>
  );
}
