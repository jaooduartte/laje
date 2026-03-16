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
  resolveInterleavedScheduledMatchesByCompetition,
  resolveMatchBracketContextByMatchId,
  resolveMatchScheduledDateValue,
} from "@/lib/championship";
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

  const selectedChampionshipSeasonYear = selectedChampionship?.current_season_year ?? null;
  const { matches, loading: matchesLoading } = useMatches({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
  });
  const { championshipBracketView } = useChampionshipBracket({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
  });
  const { sports } = useSports({ championshipId: selectedChampionshipId });
  const { teams } = useTeams();
  const visibleChampionshipBracketView = useMemo(() => {
    if (matches.length == 0) {
      return EMPTY_CHAMPIONSHIP_BRACKET_VIEW;
    }

    return championshipBracketView;
  }, [championshipBracketView, matches.length]);

  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [divisionFilter, setDivisionFilter] = useState<TeamDivision>(TeamDivision.DIVISAO_PRINCIPAL);

  useEffect(() => {
    setSportFilter(null);
    setTeamFilter(null);
    setGroupFilter(null);
    setDivisionFilter(TeamDivision.DIVISAO_PRINCIPAL);
  }, [selectedChampionshipCode]);

  const matchBracketContextByMatchId = useMemo(() => {
    return resolveMatchBracketContextByMatchId(visibleChampionshipBracketView);
  }, [visibleChampionshipBracketView]);

  const groupOptions = useMemo(() => {
    return resolveBracketGroupFilterOptions(matchBracketContextByMatchId);
  }, [matchBracketContextByMatchId]);

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

      if (groupFilter) {
        const matchBracketContext = matchBracketContextByMatchId[match.id];

        if (!matchBracketContext || matchBracketContext.groupFilterValue != groupFilter) {
          return false;
        }
      }

      return true;
    });
  }, [
    divisionFilter,
    groupFilter,
    matchBracketContextByMatchId,
    matches,
    selectedChampionshipHasDivisions,
    sportFilter,
    teamFilter,
  ]);

  const sortedMatches = useMemo(() => {
    return [...filteredMatches].sort((firstMatch, secondMatch) => {
      const statusOrderDifference = MATCH_STATUS_SORT_ORDER[firstMatch.status] - MATCH_STATUS_SORT_ORDER[secondMatch.status];

      if (statusOrderDifference != 0) {
        return statusOrderDifference;
      }

      if (firstMatch.status == MatchStatus.FINISHED && secondMatch.status == MatchStatus.FINISHED) {
        const firstTimestamp = new Date(firstMatch.end_time ?? firstMatch.start_time ?? firstMatch.created_at).getTime();
        const secondTimestamp = new Date(secondMatch.end_time ?? secondMatch.start_time ?? secondMatch.created_at).getTime();

        return secondTimestamp - firstTimestamp;
      }

      const firstScheduledDate = resolveMatchScheduledDateValue(firstMatch) ?? "9999-12-31";
      const secondScheduledDate = resolveMatchScheduledDateValue(secondMatch) ?? "9999-12-31";

      if (firstScheduledDate != secondScheduledDate) {
        return firstScheduledDate.localeCompare(secondScheduledDate);
      }

      return (firstMatch.queue_position ?? Number.MAX_SAFE_INTEGER) - (secondMatch.queue_position ?? Number.MAX_SAFE_INTEGER);
    });
  }, [filteredMatches]);

  const visibleScheduledMatches = useMemo(() => {
    const scheduledMatches = sortedMatches.filter((match) => match.status == MatchStatus.SCHEDULED);

    return resolveInterleavedScheduledMatchesByCompetition(scheduledMatches);
  }, [sortedMatches]);

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
      matchBracketContextByMatchId={matchBracketContextByMatchId}
      onChampionshipCodeChange={handleChampionshipCodeChange}
      onSportFilterChange={setSportFilter}
      onTeamFilterChange={setTeamFilter}
      onGroupFilterChange={setGroupFilter}
      onDivisionChange={handleDivisionChange}
    />
  );
}
