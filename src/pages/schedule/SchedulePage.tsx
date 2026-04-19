import { useEffect, useMemo, useState } from "react";
import { useMatches } from "@/hooks/useMatches";
import { useSports } from "@/hooks/useSports";
import { useTeams } from "@/hooks/useTeams";
import { useChampionships } from "@/hooks/useChampionships";
import { useChampionshipBracket } from "@/hooks/useChampionshipBracket";
import { useSelectedChampionship } from "@/hooks/useSelectedChampionship";
import { useChampionshipSelection } from "@/hooks/useChampionshipSelection";
import { MatchStatus, TeamDivision } from "@/lib/enums";
import {
  EMPTY_CHAMPIONSHIP_BRACKET_VIEW,
  isTeamDivision,
  resolveBracketGroupFilterOptions,
  resolveChampionshipBracketGroupStageOptions,
  resolveChampionshipGroupLabel,
  resolveMatchBracketContextByMatchId,
  resolveMatchScheduledDateValue,
} from "@/lib/championship";
import { DEFAULT_PAGINATION_ITEMS_PER_PAGE } from "@/components/ui/app-pagination-controls";
import { SchedulePageView } from "@/pages/schedule/SchedulePageView";

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
  const [yearFilter, setYearFilter] = useState<string>(
    selectedChampionshipSeasonYear != null ? String(selectedChampionshipSeasonYear) : "ALL_YEARS"
  );
  const correctedYearFilter = yearFilter === "ALL_YEARS" ? null : Number(yearFilter);

  const { championshipBracketView } = useChampionshipBracket({
    championshipId: selectedChampionshipId,
    seasonYear: correctedYearFilter,
  });
  const { sports } = useSports({ championshipId: selectedChampionshipId });
  const { teams } = useTeams();
  const visibleChampionshipBracketView = useMemo(() => {
    return championshipBracketView.competitions.length == 0 ? EMPTY_CHAMPIONSHIP_BRACKET_VIEW : championshipBracketView;
  }, [championshipBracketView]);

  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [divisionFilter, setDivisionFilter] = useState<TeamDivision>(TeamDivision.DIVISAO_PRINCIPAL);
  const [statusFilter, setStatusFilter] = useState<MatchStatus>(MatchStatus.SCHEDULED);
  const [matchesCurrentPage, setMatchesCurrentPage] = useState(1);
  const [matchesItemsPerPage, setMatchesItemsPerPage] = useState(DEFAULT_PAGINATION_ITEMS_PER_PAGE);

  useEffect(() => {
    setSportFilter(null);
    setTeamFilter(null);
    setGroupFilter(null);
    setDivisionFilter(TeamDivision.DIVISAO_PRINCIPAL);
    setStatusFilter(MatchStatus.SCHEDULED);
    setYearFilter(selectedChampionshipSeasonYear != null ? String(selectedChampionshipSeasonYear) : "ALL_YEARS");
    setMatchesCurrentPage(1);
    setMatchesItemsPerPage(DEFAULT_PAGINATION_ITEMS_PER_PAGE);
  }, [selectedChampionshipCode, selectedChampionshipSeasonYear]);

  useEffect(() => {
    setMatchesCurrentPage(1);
  }, [divisionFilter, groupFilter, matchesItemsPerPage, selectedChampionshipCode, sportFilter, teamFilter, statusFilter, yearFilter]);

  const matchBracketContextByMatchId = useMemo(() => {
    return resolveMatchBracketContextByMatchId(visibleChampionshipBracketView);
  }, [visibleChampionshipBracketView]);

  const groupOptions = useMemo(() => {
    const allOptions = resolveChampionshipBracketGroupStageOptions(visibleChampionshipBracketView);

    const filteredOptions = allOptions.filter((option) => {
      const sportMatch = !sportFilter || option.sport_id == sportFilter;
      const divisionMatch =
        !selectedChampionshipHasDivisions || option.division == divisionFilter;

      return sportMatch && divisionMatch;
    });

    const uniqueGroups = new Map<string, string>();
    filteredOptions.forEach((option) => {
      const groupLabel = resolveChampionshipGroupLabel(option.group_number);
      uniqueGroups.set(groupLabel, groupLabel);
    });

    return [...uniqueGroups.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((firstGroupOption, secondGroupOption) => firstGroupOption.label.localeCompare(secondGroupOption.label));
  }, [divisionFilter, selectedChampionshipHasDivisions, sportFilter, visibleChampionshipBracketView]);

  const {
    matches: visibleMatches,
    totalCount: totalMatches,
    matchRepresentationByMatchId,
    estimatedStartTimeByMatchId,
    loading: matchesLoading,
    isFetching: matchesFetching,
  } = useMatches({
    championshipId: selectedChampionshipId,
    seasonYear: correctedYearFilter,
    statuses: [statusFilter],
    sportId: sportFilter,
    teamId: teamFilter,
    division: selectedChampionshipHasDivisions ? divisionFilter : undefined,
    groupFilterValue: groupFilter,
    page: matchesCurrentPage,
    itemsPerPage: matchesItemsPerPage,
    sortMode: statusFilter === MatchStatus.SCHEDULED ? "SCHEDULED" : "FINISHED",
  });

  const { groupedMatches, orderedDates } = useMemo(() => {
    const groupedMatchesResult: Record<string, typeof visibleMatches> = {};
    const orderedDatesResult: string[] = [];

    visibleMatches.forEach((match) => {
      const dateKey = resolveMatchScheduledDateValue(match);

      if (!dateKey) {
        return;
      }

      if (!groupedMatchesResult[dateKey]) {
        groupedMatchesResult[dateKey] = [];
        orderedDatesResult.push(dateKey);
      }

      groupedMatchesResult[dateKey].push(match);
    });

    // Sort matches within each date by queue_position DESC if viewing finished matches
    if (statusFilter === MatchStatus.FINISHED) {
      Object.keys(groupedMatchesResult).forEach((dateKey) => {
        groupedMatchesResult[dateKey].sort((a, b) => {
          const firstQueue = a.queue_position ?? 0;
          const secondQueue = b.queue_position ?? 0;
          return secondQueue - firstQueue;
        });
      });
      // Sort dates DESC
      orderedDatesResult.sort((a, b) => b.localeCompare(a));
    }

    return {
      groupedMatches: groupedMatchesResult,
      orderedDates: orderedDatesResult,
    };
  }, [visibleMatches, statusFilter]);

  const matchesTotalPages = Math.max(1, Math.ceil(totalMatches / matchesItemsPerPage));

  useEffect(() => {
    if (matchesCurrentPage > matchesTotalPages) {
      setMatchesCurrentPage(matchesTotalPages);
    }
  }, [matchesCurrentPage, matchesTotalPages]);

  const handleDivisionChange = (value: string) => {
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
      teamFilter={teamFilter}
      groupFilter={groupFilter}
      groupOptions={groupOptions}
      divisionFilter={divisionFilter}
      statusFilter={statusFilter}
      yearFilter={yearFilter}
      orderedDates={orderedDates}
      groupedMatches={groupedMatches}
      matches={visibleMatches}
      isMatchesFetching={matchesFetching}
      matchesCurrentPage={matchesCurrentPage}
      matchesItemsPerPage={matchesItemsPerPage}
      matchesTotalPages={matchesTotalPages}
      matchBracketContextByMatchId={matchBracketContextByMatchId}
      matchRepresentationByMatchId={matchRepresentationByMatchId}
      estimatedStartTimeByMatchId={estimatedStartTimeByMatchId}
      onChampionshipCodeChange={handleChampionshipCodeChange}
      onSportFilterChange={setSportFilter}
      onTeamFilterChange={setTeamFilter}
      onGroupFilterChange={setGroupFilter}
      onDivisionChange={handleDivisionChange}
      onStatusFilterChange={setStatusFilter}
      onYearFilterChange={setYearFilter}
      onMatchesPageChange={setMatchesCurrentPage}
      onMatchesItemsPerPageChange={setMatchesItemsPerPage}
    />
  );
}
