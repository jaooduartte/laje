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
  const { championshipBracketView } = useChampionshipBracket({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
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
  const [matchesCurrentPage, setMatchesCurrentPage] = useState(1);
  const [matchesItemsPerPage, setMatchesItemsPerPage] = useState(DEFAULT_PAGINATION_ITEMS_PER_PAGE);

  useEffect(() => {
    setSportFilter(null);
    setTeamFilter(null);
    setGroupFilter(null);
    setDivisionFilter(TeamDivision.DIVISAO_PRINCIPAL);
    setMatchesCurrentPage(1);
    setMatchesItemsPerPage(DEFAULT_PAGINATION_ITEMS_PER_PAGE);
  }, [selectedChampionshipCode]);

  useEffect(() => {
    setMatchesCurrentPage(1);
  }, [divisionFilter, groupFilter, matchesItemsPerPage, selectedChampionshipCode, sportFilter, teamFilter]);

  const matchBracketContextByMatchId = useMemo(() => {
    return resolveMatchBracketContextByMatchId(visibleChampionshipBracketView);
  }, [visibleChampionshipBracketView]);

  const groupOptions = useMemo(() => {
    return resolveBracketGroupFilterOptions(matchBracketContextByMatchId);
  }, [matchBracketContextByMatchId]);

  const {
    matches: visibleScheduledMatches,
    totalCount: totalScheduledMatches,
    matchRepresentationByMatchId,
    estimatedStartTimeByMatchId,
    loading: matchesLoading,
    isFetching: matchesFetching,
  } = useMatches({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
    statuses: [MatchStatus.SCHEDULED],
    sportId: sportFilter,
    teamId: teamFilter,
    division: selectedChampionshipHasDivisions ? divisionFilter : undefined,
    groupFilterValue: groupFilter,
    page: matchesCurrentPage,
    itemsPerPage: matchesItemsPerPage,
    sortMode: "SCHEDULED",
  });

  const { groupedMatches, orderedDates } = useMemo(() => {
    const groupedMatchesResult: Record<string, typeof visibleScheduledMatches> = {};
    const orderedDatesResult: string[] = [];

    visibleScheduledMatches.forEach((match) => {
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

    return {
      groupedMatches: groupedMatchesResult,
      orderedDates: orderedDatesResult,
    };
  }, [visibleScheduledMatches]);

  const matchesTotalPages = Math.max(1, Math.ceil(totalScheduledMatches / matchesItemsPerPage));

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
      orderedDates={orderedDates}
      groupedMatches={groupedMatches}
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
      onMatchesPageChange={setMatchesCurrentPage}
      onMatchesItemsPerPageChange={setMatchesItemsPerPage}
    />
  );
}
