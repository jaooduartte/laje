import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMatches } from "@/hooks/useMatches";
import { useSports } from "@/hooks/useSports";
import { useTeams } from "@/hooks/useTeams";
import { useChampionships } from "@/hooks/useChampionships";
import { useChampionshipBracket } from "@/hooks/useChampionshipBracket";
import { useChampionshipSeasonYears } from "@/hooks/useChampionshipSeasonYears";
import { useChampionshipIndividualEvents } from "@/hooks/useChampionshipIndividualEvents";
import { useSelectedChampionship } from "@/hooks/useSelectedChampionship";
import { useChampionshipSelection } from "@/hooks/useChampionshipSelection";
import {
  ChampionshipSportNaipeMode,
  MatchNaipe,
  MatchStatus,
  TeamDivision,
} from "@/lib/enums";
import { resolveIndividualSportIds } from "@/lib/individualEvents";
import {
  EMPTY_CHAMPIONSHIP_BRACKET_VIEW,
  isTeamDivision,
  resolveBracketGroupFilterOptions,
  resolveChampionshipBracketGroupStageOptions,
  resolveChampionshipGroupLabel,
  resolveMatchBracketContextByMatchId,
  resolveMatchDisplaySlotValue,
} from "@/lib/championship";
import { DEFAULT_PAGINATION_ITEMS_PER_PAGE } from "@/components/ui/app-pagination-controls";
import { SchedulePageView } from "@/pages/schedule/SchedulePageView";
import { resolveKnockoutRoundLabel } from "@/lib/championship";
import { resolveKnockoutDisplayMatchNumberById } from "@/domain/championship-brackets/championshipBracketDisplayMatchNumbers";
import {
  type PublicScheduleTimelineItem,
  type ScheduledKnockoutPlaceholder,
  resolvePublicScheduleTimelineItems,
} from "@/domain/public-schedule/publicScheduleTimeline";

const ALL_SCHEDULE_DIVISIONS_FILTER = "ALL_SCHEDULE_DIVISIONS_FILTER";

function resolveScheduleGroupNumber(groupFilterValue: string | null): number | null {
  if (!groupFilterValue) {
    return null;
  }

  const groupFilterMatch = /^grupo\s+([a-z]+)$/i.exec(groupFilterValue.trim());

  if (!groupFilterMatch) {
    return null;
  }

  const alphabeticalSuffix = groupFilterMatch[1].toUpperCase();
  let parsedGroupNumber = 0;

  for (let characterIndex = 0; characterIndex < alphabeticalSuffix.length; characterIndex += 1) {
    const characterValue = alphabeticalSuffix.charCodeAt(characterIndex) - 64;

    if (characterValue < 1 || characterValue > 26) {
      return null;
    }

    parsedGroupNumber = parsedGroupNumber * 26 + characterValue;
  }

  return parsedGroupNumber > 0 ? parsedGroupNumber : null;
}

export function SchedulePage() {
  const { championships, loading: championshipsLoading } = useChampionships();
  const { selectedChampionshipCode, setSelectedChampionshipCode } = useSelectedChampionship();

  const {
    selectedChampionship,
    selectedChampionshipId,
    selectedChampionshipHasDivisions,
    handleChampionshipCodeChange,
  } = useChampionshipSelection({
    championships,
    selectedChampionshipCode,
    setSelectedChampionshipCode,
  });

  const selectedChampionshipSeasonYear = selectedChampionship?.current_season_year ?? null;
  const { seasonYears: availableSeasonYears } = useChampionshipSeasonYears({
    championshipId: selectedChampionshipId,
    currentSeasonYear: selectedChampionshipSeasonYear,
  });
  const [yearFilter, setYearFilter] = useState<string>(
    selectedChampionshipSeasonYear != null ? String(selectedChampionshipSeasonYear) : "ALL_YEARS"
  );
  const correctedYearFilter = yearFilter === "ALL_YEARS" ? null : Number(yearFilter);

  const { championshipBracketView } = useChampionshipBracket({
    championshipId: selectedChampionshipId,
    seasonYear: correctedYearFilter,
  });
  const { sports, championshipSports } = useSports({
    championshipId: selectedChampionshipId,
  });
  const individualSportIds = useMemo(() => resolveIndividualSportIds(sports), [sports]);
  const { teams } = useTeams({ includeInactive: true });
  const visibleChampionshipBracketView = useMemo(() => {
    return championshipBracketView.competitions.length == 0 ? EMPTY_CHAMPIONSHIP_BRACKET_VIEW : championshipBracketView;
  }, [championshipBracketView]);

  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [naipeFilter, setNaipeFilter] = useState<MatchNaipe | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [courtFilter, setCourtFilter] = useState<string | null>(null);
  const [divisionFilter, setDivisionFilter] = useState<string>(ALL_SCHEDULE_DIVISIONS_FILTER);
  const [statusFilter, setStatusFilter] = useState<MatchStatus>(MatchStatus.SCHEDULED);
  const [matchesCurrentPage, setMatchesCurrentPage] = useState(1);
  const [matchesItemsPerPage, setMatchesItemsPerPage] = useState(DEFAULT_PAGINATION_ITEMS_PER_PAGE);
  const [filterOptionRows, setFilterOptionRows] = useState<Array<{ location: string | null; court_name: string | null }>>([]);

  const availableNaipeOptions = useMemo(() => {
    const scopedChampionshipSports = sportFilter
      ? championshipSports.filter(
          (championshipSport) => championshipSport.sport_id == sportFilter,
        )
      : championshipSports;

    return [
      ...(scopedChampionshipSports.some(
        (championshipSport) =>
          championshipSport.naipe_mode ==
          ChampionshipSportNaipeMode.MASCULINO_FEMININO,
      )
        ? [MatchNaipe.MASCULINO, MatchNaipe.FEMININO]
        : []),
      ...(scopedChampionshipSports.some(
        (championshipSport) =>
          championshipSport.naipe_mode == ChampionshipSportNaipeMode.MISTO,
      )
        ? [MatchNaipe.MISTO]
        : []),
    ];
  }, [championshipSports, sportFilter]);

  useEffect(() => {
    setSportFilter(null);
    setNaipeFilter(null);
    setTeamFilter(null);
    setGroupFilter(null);
    setLocationFilter(null);
    setCourtFilter(null);
    setDivisionFilter(ALL_SCHEDULE_DIVISIONS_FILTER);
    setStatusFilter(MatchStatus.SCHEDULED);
    setYearFilter(selectedChampionshipSeasonYear != null ? String(selectedChampionshipSeasonYear) : "ALL_YEARS");
    setMatchesCurrentPage(1);
    setMatchesItemsPerPage(DEFAULT_PAGINATION_ITEMS_PER_PAGE);
  }, [selectedChampionshipCode, selectedChampionshipSeasonYear]);

  useEffect(() => {
    if (naipeFilter && !availableNaipeOptions.includes(naipeFilter)) {
      setNaipeFilter(null);
    }
  }, [availableNaipeOptions, naipeFilter]);

  useEffect(() => {
    setMatchesCurrentPage(1);
  }, [
    courtFilter,
    divisionFilter,
    groupFilter,
    locationFilter,
    matchesItemsPerPage,
    naipeFilter,
    selectedChampionshipCode,
    sportFilter,
    teamFilter,
    statusFilter,
    yearFilter,
  ]);

  useEffect(() => {
    const fetchFilterOptionRows = async () => {
      if (!selectedChampionshipId) {
        setFilterOptionRows([]);
        return;
      }

      const groupNumber = resolveScheduleGroupNumber(groupFilter);

      if (groupFilter && groupNumber == null) {
        setFilterOptionRows([]);
        return;
      }

      let query = supabase
        .from("matches")
        .select("location, court_name")
        .eq("championship_id", selectedChampionshipId)
        .eq("is_pending_manual_relocation", false)
        .eq("status", statusFilter);

      if (correctedYearFilter != null) {
        query = query.eq("season_year", correctedYearFilter);
      }

      if (sportFilter) {
        query = query.eq("sport_id", sportFilter);
      }

      if (naipeFilter) {
        query = query.eq("naipe", naipeFilter);
      }

      if (teamFilter) {
        query = query.or(`home_team_id.eq.${teamFilter},away_team_id.eq.${teamFilter}`);
      }

      if (selectedChampionshipHasDivisions && divisionFilter != ALL_SCHEDULE_DIVISIONS_FILTER) {
        query = query.eq("division", divisionFilter);
      }

      if (groupNumber != null) {
        query = query.eq("group_number", groupNumber);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Erro ao carregar filtros de local e quadra da agenda:", error.message);
        setFilterOptionRows([]);
        return;
      }

      setFilterOptionRows((data ?? []) as Array<{ location: string | null; court_name: string | null }>);
    };

    void fetchFilterOptionRows();
  }, [
    correctedYearFilter,
    divisionFilter,
    groupFilter,
    naipeFilter,
    selectedChampionshipHasDivisions,
    selectedChampionshipId,
    sportFilter,
    statusFilter,
    teamFilter,
  ]);

  const matchBracketContextByMatchId = useMemo(() => {
    return resolveMatchBracketContextByMatchId(visibleChampionshipBracketView);
  }, [visibleChampionshipBracketView]);

  const groupOptions = useMemo(() => {
    const allOptions = resolveChampionshipBracketGroupStageOptions(visibleChampionshipBracketView);

    const filteredOptions = allOptions.filter((option) => {
      const sportMatch = !sportFilter || option.sport_id == sportFilter;
      const naipeMatch = !naipeFilter || option.naipe == naipeFilter;
      const divisionMatch =
        !selectedChampionshipHasDivisions ||
        divisionFilter == ALL_SCHEDULE_DIVISIONS_FILTER ||
        option.division == divisionFilter;

      return sportMatch && naipeMatch && divisionMatch;
    });

    const uniqueGroups = new Map<string, string>();
    filteredOptions.forEach((option) => {
      const groupLabel = resolveChampionshipGroupLabel(option.group_number);
      uniqueGroups.set(groupLabel, groupLabel);
    });

    return [...uniqueGroups.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((firstGroupOption, secondGroupOption) => firstGroupOption.label.localeCompare(secondGroupOption.label));
  }, [divisionFilter, naipeFilter, selectedChampionshipHasDivisions, sportFilter, visibleChampionshipBracketView]);

  const {
    matches: visibleMatches,
    totalCount: totalMatches,
    matchRepresentationByMatchId,
    visualQueuePositionByMatchId,
    estimatedStartTimeByMatchId,
    loading: matchesLoading,
    isFetching: matchesFetching,
  } = useMatches({
    championshipId: selectedChampionshipId,
    seasonYear: correctedYearFilter,
    statuses: [statusFilter],
    sportId: sportFilter,
    naipe: naipeFilter,
    teamId: teamFilter,
    division:
      selectedChampionshipHasDivisions && divisionFilter != ALL_SCHEDULE_DIVISIONS_FILTER
        ? (divisionFilter as TeamDivision)
        : undefined,
    groupFilterValue: groupFilter,
    location: locationFilter,
    courtName: courtFilter,
    page: statusFilter == MatchStatus.SCHEDULED ? undefined : matchesCurrentPage,
    itemsPerPage:
      statusFilter == MatchStatus.SCHEDULED
        ? undefined
        : matchesItemsPerPage,
    sortMode: statusFilter === MatchStatus.SCHEDULED ? "SCHEDULED" : "FINISHED",
  });
  const {
    matches: storedScheduledMatchesForMatchNumbering,
  } = useMatches({
    championshipId: selectedChampionshipId,
    seasonYear: correctedYearFilter,
    statuses: [MatchStatus.SCHEDULED],
    includePendingManualRelocation: true,
    sortMode: "SCHEDULED",
    includeRealtime: false,
    enabled: statusFilter == MatchStatus.SCHEDULED,
  });
  const {
    events: championshipIndividualEvents,
    sessions: championshipIndividualSessions,
    loading: individualSessionsLoading,
  } = useChampionshipIndividualEvents({
    championshipId: selectedChampionshipId,
    seasonYear: correctedYearFilter,
    sportIds: individualSportIds,
    sportId: sportFilter,
    naipe: naipeFilter,
    division:
      selectedChampionshipHasDivisions && divisionFilter != ALL_SCHEDULE_DIVISIONS_FILTER
        ? (divisionFilter as TeamDivision)
        : undefined,
  });

  const locationOptions = useMemo(() => {
    const optionValues = new Set<string>();

    filterOptionRows.forEach((match) => {
      if (match.location) {
        optionValues.add(match.location);
      }
    });

    visibleChampionshipBracketView.competitions.forEach((competition) => {
      competition.knockout_matches.forEach((knockoutMatch) => {
        if (!knockoutMatch.match_id && knockoutMatch.location) {
          optionValues.add(knockoutMatch.location);
        }
      });
    });

    return [...optionValues].sort((firstLocation, secondLocation) => firstLocation.localeCompare(secondLocation));
  }, [filterOptionRows, visibleChampionshipBracketView]);

  const visibleIndividualEvents = useMemo(() => {
    return championshipIndividualEvents.filter((event) => {
      if (locationFilter && event.location != locationFilter) {
        return false;
      }

      if (statusFilter == MatchStatus.SCHEDULED) {
        return event.status != "FINISHED" && event.status != "CANCELLED";
      }

      return event.status == "FINISHED";
    });
  }, [championshipIndividualEvents, locationFilter, statusFilter]);

  const visibleIndividualSessions = useMemo(() => {
    return championshipIndividualSessions.filter((session) => {
      if (locationFilter && session.location_name != locationFilter) {
        return false;
      }

      if (statusFilter == MatchStatus.SCHEDULED) {
        return session.status != "FINISHED" && session.status != "CANCELLED";
      }

      return session.status == "FINISHED";
    });
  }, [championshipIndividualSessions, locationFilter, statusFilter]);

  const individualEventCountBySessionId = useMemo(() => {
    return visibleIndividualEvents.reduce<Record<string, number>>(
      (carry, event) => {
        if (event.session_id) {
          carry[event.session_id] = (carry[event.session_id] ?? 0) + 1;
        }

        return carry;
      },
      {},
    );
  }, [visibleIndividualEvents]);

  const courtOptions = useMemo(() => {
    const uniqueCourtNames = new Set<string>();

    filterOptionRows.forEach((match) => {
      if (!match.court_name) {
        return;
      }

      if (locationFilter && match.location != locationFilter) {
        return;
      }

      uniqueCourtNames.add(match.court_name);
    });

    visibleChampionshipBracketView.competitions.forEach((competition) => {
      competition.knockout_matches.forEach((knockoutMatch) => {
        if (!knockoutMatch.match_id || !knockoutMatch.court_name) {
          return;
        }

        if (locationFilter && knockoutMatch.location != locationFilter) {
          return;
        }

        uniqueCourtNames.add(knockoutMatch.court_name);
      });
    });

    return [...uniqueCourtNames].sort((firstCourtName, secondCourtName) => firstCourtName.localeCompare(secondCourtName));
  }, [filterOptionRows, locationFilter, visibleChampionshipBracketView]);

  useEffect(() => {
    if (locationFilter && !locationOptions.includes(locationFilter)) {
      setLocationFilter(null);
    }
  }, [locationFilter, locationOptions]);

  useEffect(() => {
    if (courtFilter && !courtOptions.includes(courtFilter)) {
      setCourtFilter(null);
    }
  }, [courtFilter, courtOptions]);

  const knockoutPlaceholders = useMemo(() => {
    if (statusFilter != MatchStatus.SCHEDULED) {
      return [] as ScheduledKnockoutPlaceholder[];
    }

    const knockoutDisplayMatchNumberById =
      resolveKnockoutDisplayMatchNumberById(
        visibleChampionshipBracketView,
        storedScheduledMatchesForMatchNumbering,
      );

    return visibleChampionshipBracketView.competitions.flatMap((competition) => {
      const totalRounds = competition.knockout_matches.reduce((currentMaxRound, knockoutMatch) => {
        if (knockoutMatch.is_third_place) {
          return currentMaxRound;
        }

        return Math.max(currentMaxRound, knockoutMatch.round_number);
      }, 0);

      return competition.knockout_matches
        .filter((knockoutMatch) => {
          if (knockoutMatch.match_id || !knockoutMatch.scheduled_date) {
            return false;
          }

          if (sportFilter && competition.sport_id != sportFilter) {
            return false;
          }

          if (naipeFilter && competition.naipe != naipeFilter) {
            return false;
          }

          if (
            selectedChampionshipHasDivisions &&
            divisionFilter != ALL_SCHEDULE_DIVISIONS_FILTER &&
            competition.division != divisionFilter
          ) {
            return false;
          }

          if (locationFilter && knockoutMatch.location != locationFilter) {
            return false;
          }

          if (courtFilter && knockoutMatch.court_name != courtFilter) {
            return false;
          }

          // Placeholder do mata-mata não é associado a grupo/atlética antes da definição dos classificados.
          if (teamFilter || groupFilter) {
            return false;
          }

          return true;
        })
        .map((knockoutMatch) => ({
          id: knockoutMatch.id,
          competition_id: competition.id,
          sport_id: competition.sport_id,
          sport_name: competition.sport_name,
          naipe: competition.naipe,
          division: competition.division,
          round_number: knockoutMatch.round_number,
          slot_number: knockoutMatch.slot_number,
          is_third_place: knockoutMatch.is_third_place,
          display_match_number:
            knockoutDisplayMatchNumberById[knockoutMatch.id] ?? null,
          scheduled_date: knockoutMatch.scheduled_date!,
          queue_position: knockoutMatch.queue_position,
          scheduled_slot: knockoutMatch.scheduled_slot ?? null,
          start_time: knockoutMatch.start_time,
          end_time: knockoutMatch.end_time,
          location: knockoutMatch.location,
          court_name: knockoutMatch.court_name,
          stage_label: resolveKnockoutRoundLabel(
            knockoutMatch.round_number,
            Math.max(totalRounds, knockoutMatch.round_number),
            knockoutMatch.is_third_place,
          ),
        }));
    });
  }, [
    courtFilter,
    divisionFilter,
    groupFilter,
    locationFilter,
    naipeFilter,
    selectedChampionshipHasDivisions,
    sportFilter,
    statusFilter,
    teamFilter,
    storedScheduledMatchesForMatchNumbering,
    visibleChampionshipBracketView,
  ]);

  const scheduledTimelineItems = useMemo(() => {
    if (statusFilter != MatchStatus.SCHEDULED) {
      return [] as PublicScheduleTimelineItem[];
    }

    return resolvePublicScheduleTimelineItems({
      matches: visibleMatches,
      placeholders: knockoutPlaceholders,
      individualSessions: visibleIndividualSessions,
      individualEventCountBySessionId,
      estimatedStartTimeByMatchId,
    });
  }, [
    estimatedStartTimeByMatchId,
    individualEventCountBySessionId,
    knockoutPlaceholders,
    statusFilter,
    visibleIndividualSessions,
    visibleMatches,
  ]);

  const paginatedScheduledTimelineItems = useMemo(() => {
    const rangeStart = (matchesCurrentPage - 1) * matchesItemsPerPage;
    return scheduledTimelineItems.slice(
      rangeStart,
      rangeStart + matchesItemsPerPage,
    );
  }, [matchesCurrentPage, matchesItemsPerPage, scheduledTimelineItems]);

  const {
    groupedMatches,
    groupedKnockoutPlaceholdersByDate,
    groupedIndividualSessionsByDate,
    groupedScheduleTimelineItemsByDate,
    orderedDates,
  } = useMemo(() => {
    const groupedMatchesResult: Record<string, typeof visibleMatches> = {};
    const groupedPlaceholdersResult: Record<
      string,
      ScheduledKnockoutPlaceholder[]
    > = {};
    const groupedIndividualSessionsResult: Record<
      string,
      typeof visibleIndividualSessions
    > = {};
    const groupedScheduleTimelineItemsResult: Record<
      string,
      PublicScheduleTimelineItem[]
    > = {};
    const groupedTimelineItems =
      statusFilter == MatchStatus.SCHEDULED
        ? paginatedScheduledTimelineItems
        : [];

    groupedTimelineItems.forEach((item) => {
      groupedScheduleTimelineItemsResult[item.scheduledDate] = [
        ...(groupedScheduleTimelineItemsResult[item.scheduledDate] ?? []),
        item,
      ];

      if (item.type == "MATCH") {
        groupedMatchesResult[item.scheduledDate] = [
          ...(groupedMatchesResult[item.scheduledDate] ?? []),
          item.match,
        ];
        return;
      }

      if (item.type == "KNOCKOUT_PLACEHOLDER") {
        groupedPlaceholdersResult[item.scheduledDate] = [
          ...(groupedPlaceholdersResult[item.scheduledDate] ?? []),
          item.placeholder,
        ];
        return;
      }

      groupedIndividualSessionsResult[item.scheduledDate] = [
        ...(groupedIndividualSessionsResult[item.scheduledDate] ?? []),
        item.session,
      ];
    });

    if (statusFilter == MatchStatus.FINISHED) {
      visibleMatches.forEach((match) => {
        const dateKey = match.scheduled_date;

        if (!dateKey) {
          return;
        }

        groupedMatchesResult[dateKey] = [
          ...(groupedMatchesResult[dateKey] ?? []),
          match,
        ];
      });
    }

    return {
      groupedMatches: groupedMatchesResult,
      groupedKnockoutPlaceholdersByDate: groupedPlaceholdersResult,
      groupedIndividualSessionsByDate: groupedIndividualSessionsResult,
      groupedScheduleTimelineItemsByDate: groupedScheduleTimelineItemsResult,
      orderedDates:
        statusFilter == MatchStatus.SCHEDULED
          ? [...new Set(groupedTimelineItems.map((item) => item.scheduledDate))]
          : Object.keys(groupedMatchesResult).sort((firstDate, secondDate) =>
              secondDate.localeCompare(firstDate),
            ),
    };
  }, [
    paginatedScheduledTimelineItems,
    statusFilter,
    visibleMatches,
  ]);

  const displayMatches =
    statusFilter == MatchStatus.SCHEDULED
      ? paginatedScheduledTimelineItems.flatMap((item) =>
          item.type == "MATCH" ? [item.match] : [],
        )
      : visibleMatches;
  const displayIndividualSessions =
    statusFilter == MatchStatus.SCHEDULED
      ? paginatedScheduledTimelineItems.flatMap((item) =>
          item.type == "INDIVIDUAL_SESSION" ? [item.session] : [],
        )
      : visibleIndividualSessions;
  const matchesTotalPages = Math.max(
    1,
    Math.ceil(
      (statusFilter == MatchStatus.SCHEDULED
        ? scheduledTimelineItems.length
        : totalMatches) / matchesItemsPerPage,
    ),
  );

  useEffect(() => {
    if (matchesCurrentPage > matchesTotalPages) {
      setMatchesCurrentPage(matchesTotalPages);
    }
  }, [matchesCurrentPage, matchesTotalPages]);

  const handleDivisionChange = (value: string) => {
    if (value == ALL_SCHEDULE_DIVISIONS_FILTER) {
      setDivisionFilter(ALL_SCHEDULE_DIVISIONS_FILTER);
      return;
    }

    if (isTeamDivision(value)) {
      setDivisionFilter(value);
    }
  };

  return (
    <SchedulePageView
      isLoading={matchesLoading || championshipsLoading}
      selectedChampionship={selectedChampionship}
      championships={championships}
      selectedChampionshipCode={selectedChampionshipCode}
      selectedChampionshipHasDivisions={selectedChampionshipHasDivisions}
      teams={teams}
      sports={sports}
      sportFilter={sportFilter}
      availableNaipeOptions={availableNaipeOptions}
      naipeFilter={naipeFilter}
      teamFilter={teamFilter}
      groupFilter={groupFilter}
      locationFilter={locationFilter}
      courtFilter={courtFilter}
      locationOptions={locationOptions}
      courtOptions={courtOptions}
      groupOptions={groupOptions}
      divisionFilter={divisionFilter}
      statusFilter={statusFilter}
      yearFilter={yearFilter}
      availableSeasonYears={availableSeasonYears}
      orderedDates={orderedDates}
      groupedMatches={groupedMatches}
      groupedKnockoutPlaceholdersByDate={groupedKnockoutPlaceholdersByDate}
      groupedIndividualSessionsByDate={groupedIndividualSessionsByDate}
      groupedScheduleTimelineItemsByDate={groupedScheduleTimelineItemsByDate}
      individualEvents={visibleIndividualEvents}
      individualSessions={displayIndividualSessions}
      matches={displayMatches}
      isMatchesFetching={matchesFetching || individualSessionsLoading}
      matchesCurrentPage={matchesCurrentPage}
      matchesItemsPerPage={matchesItemsPerPage}
      matchesTotalPages={matchesTotalPages}
      matchBracketContextByMatchId={matchBracketContextByMatchId}
      matchRepresentationByMatchId={matchRepresentationByMatchId}
      visualQueuePositionByMatchId={visualQueuePositionByMatchId}
      estimatedStartTimeByMatchId={estimatedStartTimeByMatchId}
      onChampionshipCodeChange={handleChampionshipCodeChange}
      onSportFilterChange={setSportFilter}
      onNaipeFilterChange={setNaipeFilter}
      onTeamFilterChange={setTeamFilter}
      onGroupFilterChange={setGroupFilter}
      onLocationFilterChange={setLocationFilter}
      onCourtFilterChange={setCourtFilter}
      onDivisionChange={handleDivisionChange}
      onStatusFilterChange={setStatusFilter}
      onYearFilterChange={setYearFilter}
      onMatchesPageChange={setMatchesCurrentPage}
      onMatchesItemsPerPageChange={setMatchesItemsPerPage}
    />
  );
}
