import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useMatches } from "@/hooks/useMatches";
import { useSports } from "@/hooks/useSports";
import { useTeams } from "@/hooks/useTeams";
import { useChampionships } from "@/hooks/useChampionships";
import { useSelectedChampionship } from "@/hooks/useSelectedChampionship";
import { useChampionshipSelection } from "@/hooks/useChampionshipSelection";
import { MatchStatus, TeamDivision } from "@/lib/enums";
import { isTeamDivision } from "@/lib/championship";
import { SchedulePageView } from "@/pages/schedule/SchedulePageView";

const MATCH_STATUS_SORT_ORDER: Record<MatchStatus, number> = {
  [MatchStatus.LIVE]: 0,
  [MatchStatus.SCHEDULED]: 1,
  [MatchStatus.FINISHED]: 2,
};

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

  const { matches, loading: matchesLoading } = useMatches({ championshipId: selectedChampionshipId });
  const { sports } = useSports({ championshipId: selectedChampionshipId });
  const { teams } = useTeams();

  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [divisionFilter, setDivisionFilter] = useState<TeamDivision>(TeamDivision.DIVISAO_PRINCIPAL);

  useEffect(() => {
    setSportFilter(null);
    setTeamFilter(null);
    setDivisionFilter(TeamDivision.DIVISAO_PRINCIPAL);
  }, [selectedChampionshipCode]);

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      if (sportFilter && match.sport_id != sportFilter) {
        return false;
      }

      if (teamFilter && match.home_team_id != teamFilter && match.away_team_id != teamFilter) {
        return false;
      }

      if (selectedChampionshipHasDivisions && match.division != divisionFilter) {
        return false;
      }

      return true;
    });
  }, [divisionFilter, matches, selectedChampionshipHasDivisions, sportFilter, teamFilter]);

  const sortedMatches = useMemo(() => {
    return [...filteredMatches].sort((firstMatch, secondMatch) => {
      const statusOrderDifference = MATCH_STATUS_SORT_ORDER[firstMatch.status] - MATCH_STATUS_SORT_ORDER[secondMatch.status];

      if (statusOrderDifference != 0) {
        return statusOrderDifference;
      }

      if (firstMatch.status == MatchStatus.FINISHED && secondMatch.status == MatchStatus.FINISHED) {
        return new Date(secondMatch.start_time).getTime() - new Date(firstMatch.start_time).getTime();
      }

      return new Date(firstMatch.start_time).getTime() - new Date(secondMatch.start_time).getTime();
    });
  }, [filteredMatches]);

  const { groupedMatches, orderedDates } = useMemo(() => {
    const groupedMatchesResult: Record<string, typeof sortedMatches> = {};
    const orderedDatesResult: string[] = [];

    sortedMatches.forEach((match) => {
      const dateKey = format(new Date(match.start_time), "yyyy-MM-dd");

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
  }, [sortedMatches]);

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
      divisionFilter={divisionFilter}
      orderedDates={orderedDates}
      groupedMatches={groupedMatches}
      onChampionshipCodeChange={handleChampionshipCodeChange}
      onSportFilterChange={setSportFilter}
      onTeamFilterChange={setTeamFilter}
      onDivisionChange={handleDivisionChange}
    />
  );
}
