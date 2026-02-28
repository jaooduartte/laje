import { useEffect, useMemo, useState } from "react";
import { useMatches } from "@/hooks/useMatches";
import { useStandings } from "@/hooks/useStandings";
import { useSports } from "@/hooks/useSports";
import { useTeams } from "@/hooks/useTeams";
import { useChampionships } from "@/hooks/useChampionships";
import { useSelectedChampionship } from "@/hooks/useSelectedChampionship";
import { useChampionshipSelection } from "@/hooks/useChampionshipSelection";
import { ChampionshipCode, ChampionshipSportTieBreakerRule, ChampionshipStatus } from "@/lib/enums";
import { aggregateStandingsByTeam } from "@/lib/standings";
import { ChampionshipsPageView } from "@/pages/championships/ChampionshipsPageView";

const CHAMPIONSHIP_CARD_IMAGE_BY_CODE: Record<ChampionshipCode, string> = {
  [ChampionshipCode.CLV]: "/championships/clv.svg",
  [ChampionshipCode.SOCIETY]: "/championships/society.svg",
  [ChampionshipCode.INTERLAJE]: "/championships/interlaje.svg",
};

const ALL_TEAM_FILTER = "ALL_TEAMS";
const ALL_YEAR_FILTER = "ALL_YEARS";
const ALL_STANDINGS_SPORT_FILTER = "ALL_STANDINGS_SPORTS";
const ALL_STANDINGS_NAIPE_FILTER = "ALL_STANDINGS_NAIPES";

export function ChampionshipsPage() {
  const { championships, loading: championshipsLoading } = useChampionships();
  const { selectedChampionshipCode, setSelectedChampionshipCode } = useSelectedChampionship();

  const { selectedChampionship, selectedChampionshipId, selectedChampionshipHasDivisions } = useChampionshipSelection({
    championships,
    selectedChampionshipCode,
    setSelectedChampionshipCode,
  });

  const selectedChampionshipIsFinished = selectedChampionship?.status == ChampionshipStatus.FINISHED;

  const { liveMatches, upcomingMatches, finishedMatches, loading: matchesLoading } = useMatches({
    championshipId: selectedChampionshipId,
  });
  const standingsDivisionFilter = selectedChampionshipHasDivisions ? undefined : null;
  const { standings, loading: standingsLoading } = useStandings({
    championshipId: selectedChampionshipId,
    division: standingsDivisionFilter,
  });
  const { sports, championshipSports } = useSports({ championshipId: selectedChampionshipId });
  const { teams } = useTeams();

  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>(ALL_TEAM_FILTER);
  const [yearFilter, setYearFilter] = useState<string>(ALL_YEAR_FILTER);
  const [standingsSportFilter, setStandingsSportFilter] = useState<string>(ALL_STANDINGS_SPORT_FILTER);
  const [standingsNaipeFilter, setStandingsNaipeFilter] = useState<string>(ALL_STANDINGS_NAIPE_FILTER);

  useEffect(() => {
    setSportFilter(null);
    setTeamFilter(ALL_TEAM_FILTER);
    setYearFilter(ALL_YEAR_FILTER);
    setStandingsSportFilter(ALL_STANDINGS_SPORT_FILTER);
    setStandingsNaipeFilter(ALL_STANDINGS_NAIPE_FILTER);
  }, [selectedChampionshipCode]);

  const filteredLiveMatches = sportFilter
    ? liveMatches.filter((match) => match.sport_id == sportFilter)
    : liveMatches;
  const filteredUpcomingMatches = sportFilter
    ? upcomingMatches.filter((match) => match.sport_id == sportFilter)
    : upcomingMatches;
  const sortedFinishedMatches = useMemo(() => {
    const sportFilteredMatches = sportFilter
      ? finishedMatches.filter((match) => match.sport_id == sportFilter)
      : finishedMatches;

    return [...sportFilteredMatches].sort((firstMatch, secondMatch) => {
      return new Date(secondMatch.start_time).getTime() - new Date(firstMatch.start_time).getTime();
    });
  }, [finishedMatches, sportFilter]);

  const historyTeams = useMemo(() => {
    const historyTeamIds = new Set<string>();

    sortedFinishedMatches.forEach((match) => {
      historyTeamIds.add(match.home_team_id);
      historyTeamIds.add(match.away_team_id);
    });

    return teams
      .filter((team) => historyTeamIds.has(team.id))
      .sort((firstTeam, secondTeam) => firstTeam.name.localeCompare(secondTeam.name));
  }, [sortedFinishedMatches, teams]);

  const historyYears = useMemo(() => {
    const uniqueYears = new Set<string>();

    sortedFinishedMatches.forEach((match) => {
      uniqueYears.add(String(new Date(match.start_time).getFullYear()));
    });

    return [...uniqueYears].sort((firstYear, secondYear) => Number(secondYear) - Number(firstYear));
  }, [sortedFinishedMatches]);

  const filteredHistoryMatches = sortedFinishedMatches.filter((match) => {
    if (teamFilter != ALL_TEAM_FILTER && match.home_team_id != teamFilter && match.away_team_id != teamFilter) {
      return false;
    }

    if (yearFilter != ALL_YEAR_FILTER) {
      const matchYear = String(new Date(match.start_time).getFullYear());

      if (matchYear != yearFilter) {
        return false;
      }
    }

    return true;
  });

  const nextMatch = filteredUpcomingMatches.length > 0 ? filteredUpcomingMatches[0] : null;

  const standingsWithFilters = useMemo(() => {
    return standings.filter((standing) => {
      if (standingsSportFilter != ALL_STANDINGS_SPORT_FILTER && standing.sport_id != standingsSportFilter) {
        return false;
      }

      if (standingsNaipeFilter != ALL_STANDINGS_NAIPE_FILTER && standing.naipe != standingsNaipeFilter) {
        return false;
      }

      return true;
    });
  }, [standings, standingsNaipeFilter, standingsSportFilter]);

  const standingsTieBreakerRule = useMemo(() => {
    if (standingsSportFilter == ALL_STANDINGS_SPORT_FILTER) {
      return ChampionshipSportTieBreakerRule.STANDARD;
    }

    const selectedChampionshipSport = championshipSports.find(
      (championshipSport) => championshipSport.sport_id == standingsSportFilter,
    );

    return selectedChampionshipSport?.tie_breaker_rule ?? ChampionshipSportTieBreakerRule.STANDARD;
  }, [championshipSports, standingsSportFilter]);

  const standingsShowCardColumns = useMemo(() => {
    if (standingsSportFilter == ALL_STANDINGS_SPORT_FILTER) {
      return false;
    }

    const selectedChampionshipSport = championshipSports.find(
      (championshipSport) => championshipSport.sport_id == standingsSportFilter,
    );

    return selectedChampionshipSport?.supports_cards == true;
  }, [championshipSports, standingsSportFilter]);

  const standingsHeadToHeadMatches = useMemo(() => {
    return finishedMatches.filter((match) => {
      if (standingsSportFilter != ALL_STANDINGS_SPORT_FILTER && match.sport_id != standingsSportFilter) {
        return false;
      }

      if (standingsNaipeFilter != ALL_STANDINGS_NAIPE_FILTER && match.naipe != standingsNaipeFilter) {
        return false;
      }

      return true;
    });
  }, [finishedMatches, standingsNaipeFilter, standingsSportFilter]);

  const filteredStandings = useMemo(() => {
    return aggregateStandingsByTeam(standingsWithFilters, {
      tieBreakerRule: standingsTieBreakerRule,
      headToHeadMatches: standingsHeadToHeadMatches,
    });
  }, [standingsHeadToHeadMatches, standingsTieBreakerRule, standingsWithFilters]);

  return (
    <ChampionshipsPageView
      isLoading={championshipsLoading || matchesLoading || standingsLoading}
      championships={championships}
      selectedChampionship={selectedChampionship}
      selectedChampionshipCode={selectedChampionshipCode}
      selectedChampionshipIsFinished={selectedChampionshipIsFinished}
      championshipCardImageByCode={CHAMPIONSHIP_CARD_IMAGE_BY_CODE}
      sports={sports}
      sportFilter={sportFilter}
      filteredLiveMatches={filteredLiveMatches}
      nextMatch={nextMatch}
      standingsSportFilter={standingsSportFilter}
      standingsNaipeFilter={standingsNaipeFilter}
      allStandingsSportFilter={ALL_STANDINGS_SPORT_FILTER}
      allStandingsNaipeFilter={ALL_STANDINGS_NAIPE_FILTER}
      filteredStandings={filteredStandings}
      standingsShowCardColumns={standingsShowCardColumns}
      teamFilter={teamFilter}
      yearFilter={yearFilter}
      allTeamFilter={ALL_TEAM_FILTER}
      allYearFilter={ALL_YEAR_FILTER}
      historyTeams={historyTeams}
      historyYears={historyYears}
      filteredHistoryMatches={filteredHistoryMatches}
      onSelectChampionshipCode={setSelectedChampionshipCode}
      onSportFilterChange={setSportFilter}
      onStandingsSportFilterChange={setStandingsSportFilter}
      onStandingsNaipeFilterChange={setStandingsNaipeFilter}
      onTeamFilterChange={setTeamFilter}
      onYearFilterChange={setYearFilter}
    />
  );
}
