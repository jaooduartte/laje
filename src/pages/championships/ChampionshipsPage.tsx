import { useEffect, useMemo, useState } from "react";
import { resolveMatchDisplaySlotValue } from "@/lib/championship";
import { useMatches } from "@/hooks/useMatches";
import { useStandings } from "@/hooks/useStandings";
import { useSports } from "@/hooks/useSports";
import { useTeams } from "@/hooks/useTeams";
import { useChampionships } from "@/hooks/useChampionships";
import { useChampionshipBracketHistory } from "@/hooks/useChampionshipBracketHistory";
import { useSelectedChampionship } from "@/hooks/useSelectedChampionship";
import { useChampionshipSelection } from "@/hooks/useChampionshipSelection";
import type { MatchBracketContext } from "@/lib/championship";
import {
  ChampionshipCode,
  ChampionshipSportTieBreakerRule,
  ChampionshipStatus,
  MatchStatus,
} from "@/lib/enums";
import {
  resolveBracketGroupFilterOptions,
  resolveInterleavedScheduledMatchesByCompetition,
  resolveMatchBracketContextByMatchId,
  resolveMatchScheduledDateValue,
} from "@/lib/championship";
import { resolveChampionshipChampionHistory } from "@/lib/championshipHistory";
import { aggregateStandingsByTeam } from "@/lib/standings";
import { ChampionshipsPageView } from "@/pages/championships/ChampionshipsPageView";

const CHAMPIONSHIP_CARD_IMAGE_BY_CODE: Record<ChampionshipCode, string> = {
  [ChampionshipCode.CLV]: "/championships/clv.svg",
  [ChampionshipCode.SOCIETY]: "/championships/society.svg",
  [ChampionshipCode.INTERLAJE]: "/championships/interlaje.svg",
};

const ALL_TEAM_FILTER = "ALL_TEAMS";
const ALL_YEAR_FILTER = "ALL_YEARS";
const ALL_GROUP_FILTER = "ALL_GROUPS";
const ALL_STANDINGS_SPORT_FILTER = "ALL_STANDINGS_SPORTS";
const ALL_STANDINGS_NAIPE_FILTER = "ALL_STANDINGS_NAIPES";
const DEFAULT_NEXT_MATCHES_LIMIT = 6;

export function ChampionshipsPage() {
  const { championships, loading: championshipsLoading } = useChampionships();
  const { selectedChampionshipCode, setSelectedChampionshipCode } = useSelectedChampionship();

  const { selectedChampionship, selectedChampionshipId, selectedChampionshipHasDivisions } = useChampionshipSelection({
    championships,
    selectedChampionshipCode,
    setSelectedChampionshipCode,
  });

  const selectedChampionshipIsFinished = selectedChampionship?.status == ChampionshipStatus.FINISHED;
  const selectedChampionshipSeasonYear = selectedChampionship?.current_season_year ?? null;

  const { matches, loading: matchesLoading } = useMatches({
    championshipId: selectedChampionshipId,
  });

  const standingsDivisionFilter = selectedChampionshipHasDivisions ? undefined : null;
  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>(ALL_TEAM_FILTER);
  const [yearFilter, setYearFilter] = useState<string>(ALL_YEAR_FILTER);
  const [groupFilter, setGroupFilter] = useState<string>(ALL_GROUP_FILTER);
  const [standingsSportFilter, setStandingsSportFilter] = useState<string>(ALL_STANDINGS_SPORT_FILTER);
  const [standingsNaipeFilter, setStandingsNaipeFilter] = useState<string>(ALL_STANDINGS_NAIPE_FILTER);
  const [standingsYearFilter, setStandingsYearFilter] = useState<string>(
    selectedChampionshipSeasonYear != null ? String(selectedChampionshipSeasonYear) : ALL_YEAR_FILTER,
  );

  const { standings, loading: standingsLoading } = useStandings({
    championshipId: selectedChampionshipId,
    seasonYear: standingsYearFilter == ALL_YEAR_FILTER ? null : Number(standingsYearFilter),
    division: standingsDivisionFilter,
  });
  const { sports, championshipSports } = useSports({ championshipId: selectedChampionshipId });
  const { teams } = useTeams();

  useEffect(() => {
    setSportFilter(null);
    setTeamFilter(ALL_TEAM_FILTER);
    setYearFilter(ALL_YEAR_FILTER);
    setGroupFilter(ALL_GROUP_FILTER);
    setStandingsSportFilter(ALL_STANDINGS_SPORT_FILTER);
    setStandingsNaipeFilter(ALL_STANDINGS_NAIPE_FILTER);
    setStandingsYearFilter(selectedChampionshipSeasonYear != null ? String(selectedChampionshipSeasonYear) : ALL_YEAR_FILTER);
  }, [selectedChampionshipCode, selectedChampionshipSeasonYear]);

  const currentSeasonMatches = useMemo(() => {
    if (selectedChampionshipSeasonYear == null) {
      return [];
    }

    return matches.filter((match) => match.season_year == selectedChampionshipSeasonYear);
  }, [matches, selectedChampionshipSeasonYear]);

  const upcomingMatches = useMemo(() => {
    return [...currentSeasonMatches]
      .filter((match) => match.status == MatchStatus.SCHEDULED)
      .sort((firstMatch, secondMatch) => {
        const firstScheduledDate = resolveMatchScheduledDateValue(firstMatch) ?? "9999-12-31";
        const secondScheduledDate = resolveMatchScheduledDateValue(secondMatch) ?? "9999-12-31";

        if (firstScheduledDate != secondScheduledDate) {
          return firstScheduledDate.localeCompare(secondScheduledDate);
        }

        return resolveMatchDisplaySlotValue(firstMatch) - resolveMatchDisplaySlotValue(secondMatch);
      });
  }, [currentSeasonMatches]);

  const finishedMatches = useMemo(() => {
    return matches.filter((match) => match.status == MatchStatus.FINISHED);
  }, [matches]);

  const filteredUpcomingMatches = useMemo(() => {
    return sportFilter ? upcomingMatches.filter((match) => match.sport_id == sportFilter) : upcomingMatches;
  }, [sportFilter, upcomingMatches]);

  const sortedFinishedMatches = useMemo(() => {
    const sportFilteredMatches = sportFilter
      ? finishedMatches.filter((match) => match.sport_id == sportFilter)
      : finishedMatches;

    return [...sportFilteredMatches].sort((firstMatch, secondMatch) => {
      const firstTimestamp = new Date(firstMatch.end_time ?? firstMatch.start_time ?? firstMatch.created_at).getTime();
      const secondTimestamp = new Date(secondMatch.end_time ?? secondMatch.start_time ?? secondMatch.created_at).getTime();

      return secondTimestamp - firstTimestamp;
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
      uniqueYears.add(String(match.season_year));
    });

    if (selectedChampionshipSeasonYear != null) {
      uniqueYears.add(String(selectedChampionshipSeasonYear));
    }

    return [...uniqueYears].sort((firstYear, secondYear) => Number(secondYear) - Number(firstYear));
  }, [selectedChampionshipSeasonYear, sortedFinishedMatches]);

  const championshipBracketSeasonYears = useMemo(() => {
    return historyYears.map(Number).filter((seasonYear) => Number.isFinite(seasonYear));
  }, [historyYears]);

  const { championshipBracketSeasonViews, loading: championshipBracketHistoryLoading } = useChampionshipBracketHistory({
    championshipId: selectedChampionshipId,
    seasonYears: championshipBracketSeasonYears,
  });
  const matchBracketContextByMatchId = useMemo(() => {
    return championshipBracketSeasonViews.reduce<Record<string, MatchBracketContext>>(
      (currentMatchBracketContextByMatchId, championshipBracketSeasonView) => {
        const seasonMatchBracketContextByMatchId = resolveMatchBracketContextByMatchId(
          championshipBracketSeasonView.championship_bracket_view,
          championshipBracketSeasonView.season_year,
        );

        return {
          ...currentMatchBracketContextByMatchId,
          ...seasonMatchBracketContextByMatchId,
        };
      },
      {},
    );
  }, [championshipBracketSeasonViews]);

  const historyGroupOptions = useMemo(() => {
    return resolveBracketGroupFilterOptions(matchBracketContextByMatchId);
  }, [matchBracketContextByMatchId]);

  const filteredHistoryMatches = useMemo(() => {
    return sortedFinishedMatches.filter((match) => {
      if (teamFilter != ALL_TEAM_FILTER && match.home_team_id != teamFilter && match.away_team_id != teamFilter) {
        return false;
      }

      if (yearFilter != ALL_YEAR_FILTER && String(match.season_year) != yearFilter) {
        return false;
      }

      if (groupFilter != ALL_GROUP_FILTER) {
        const matchBracketContext = matchBracketContextByMatchId[match.id];

        if (!matchBracketContext || matchBracketContext.groupFilterValue != groupFilter) {
          return false;
        }
      }

      return true;
    });
  }, [groupFilter, matchBracketContextByMatchId, sortedFinishedMatches, teamFilter, yearFilter]);

  const nextMatches = useMemo(() => {
    const interleavedMatches = resolveInterleavedScheduledMatchesByCompetition(filteredUpcomingMatches);
    const firstUpcomingMatch = interleavedMatches[0];
    const firstUpcomingMatchDate = firstUpcomingMatch
      ? resolveMatchScheduledDateValue(firstUpcomingMatch)
      : null;

    if (!firstUpcomingMatch || !firstUpcomingMatchDate) {
      return interleavedMatches.slice(0, DEFAULT_NEXT_MATCHES_LIMIT);
    }

    const firstUpcomingMatchSlot = resolveMatchDisplaySlotValue(firstUpcomingMatch);
    const firstRoundMatchesCount = interleavedMatches.filter((upcomingMatch) => {
      const currentMatchDate = resolveMatchScheduledDateValue(upcomingMatch);
      const currentMatchSlot = resolveMatchDisplaySlotValue(upcomingMatch);

      return currentMatchDate == firstUpcomingMatchDate && currentMatchSlot == firstUpcomingMatchSlot;
    }).length;
    const nextMatchesLimit = firstRoundMatchesCount > 0 ? firstRoundMatchesCount : DEFAULT_NEXT_MATCHES_LIMIT;

    return interleavedMatches.slice(0, nextMatchesLimit);
  }, [filteredUpcomingMatches]);

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
      if (standingsYearFilter != ALL_YEAR_FILTER && String(match.season_year) != standingsYearFilter) {
        return false;
      }

      if (standingsSportFilter != ALL_STANDINGS_SPORT_FILTER && match.sport_id != standingsSportFilter) {
        return false;
      }

      if (standingsNaipeFilter != ALL_STANDINGS_NAIPE_FILTER && match.naipe != standingsNaipeFilter) {
        return false;
      }

      return true;
    });
  }, [finishedMatches, standingsNaipeFilter, standingsSportFilter, standingsYearFilter]);

  const filteredStandings = useMemo(() => {
    return aggregateStandingsByTeam(standingsWithFilters, {
      tieBreakerRule: standingsTieBreakerRule,
      headToHeadMatches: standingsHeadToHeadMatches,
    });
  }, [standingsHeadToHeadMatches, standingsTieBreakerRule, standingsWithFilters]);

  const championshipChampionHistory = useMemo(() => {
    const currentChampionshipChampionHistory = resolveChampionshipChampionHistory(championshipBracketSeasonViews);

    if (!sportFilter) {
      return currentChampionshipChampionHistory;
    }

    return currentChampionshipChampionHistory
      .map((championshipChampionYearGroup) => ({
        ...championshipChampionYearGroup,
        champions: championshipChampionYearGroup.champions.filter(
          (championshipChampion) => championshipChampion.sport_id == sportFilter,
        ),
      }))
      .filter((championshipChampionYearGroup) => championshipChampionYearGroup.champions.length > 0);
  }, [championshipBracketSeasonViews, sportFilter]);

  return (
    <ChampionshipsPageView
      isLoading={championshipsLoading || matchesLoading || standingsLoading || championshipBracketHistoryLoading}
      championships={championships}
      selectedChampionship={selectedChampionship}
      selectedChampionshipCode={selectedChampionshipCode}
      selectedChampionshipIsFinished={selectedChampionshipIsFinished}
        championshipCardImageByCode={CHAMPIONSHIP_CARD_IMAGE_BY_CODE}
        sports={sports}
        sportFilter={sportFilter}
        nextMatches={nextMatches}
      standingsSportFilter={standingsSportFilter}
      standingsNaipeFilter={standingsNaipeFilter}
      standingsYearFilter={standingsYearFilter}
      allStandingsSportFilter={ALL_STANDINGS_SPORT_FILTER}
      allStandingsNaipeFilter={ALL_STANDINGS_NAIPE_FILTER}
      filteredStandings={filteredStandings}
      standingsShowCardColumns={standingsShowCardColumns}
      teamFilter={teamFilter}
      yearFilter={yearFilter}
      groupFilter={groupFilter}
      allTeamFilter={ALL_TEAM_FILTER}
      allYearFilter={ALL_YEAR_FILTER}
      availableStandingsYears={historyYears}
      historyGroupOptions={historyGroupOptions}
      historyTeams={historyTeams}
      historyYears={historyYears}
      filteredHistoryMatches={filteredHistoryMatches}
      championshipChampionHistory={championshipChampionHistory}
      onSelectChampionshipCode={setSelectedChampionshipCode}
      onSportFilterChange={setSportFilter}
      onStandingsSportFilterChange={setStandingsSportFilter}
      onStandingsNaipeFilterChange={setStandingsNaipeFilter}
      onStandingsYearFilterChange={setStandingsYearFilter}
      onTeamFilterChange={setTeamFilter}
      onYearFilterChange={setYearFilter}
      onGroupFilterChange={setGroupFilter}
      matchBracketContextByMatchId={matchBracketContextByMatchId}
    />
  );
}
