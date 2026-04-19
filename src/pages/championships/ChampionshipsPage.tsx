import { useEffect, useMemo, useState } from "react";
import { resolveMatchDisplaySlotValue } from "@/lib/championship";
import { useMatches } from "@/hooks/useMatches";
import { useStandings } from "@/hooks/useStandings";
import { useSports } from "@/hooks/useSports";
import { useTeams } from "@/hooks/useTeams";
import { useChampionships } from "@/hooks/useChampionships";
import { useChampionshipBracketHistory } from "@/hooks/useChampionshipBracketHistory";
import { useChampionshipBracketResolvedTieBreakOrders } from "@/hooks/useChampionshipBracketResolvedTieBreakOrders";
import { useChampionshipCorrectedGroupStandings } from "@/hooks/useChampionshipCorrectedGroupStandings";
import { useSelectedChampionship } from "@/hooks/useSelectedChampionship";
import { useChampionshipSelection } from "@/hooks/useChampionshipSelection";
import type { ChampionshipBracketResolvedTieBreakOrderContext } from "@/domain/championship-brackets/championshipBracket.types";
import type { MatchBracketContext } from "@/lib/championship";
import {
  ChampionshipCode,
  ChampionshipSportTieBreakerRule,
  ChampionshipStatus,
  MatchNaipe,
  MatchStatus,
} from "@/lib/enums";
import { resolveModalidadeConfigBySportId, type ModalidadeConfig } from "@/lib/modalidadeConfig";
import type { Team, Match } from "@/lib/types";
import {
  resolveBracketGroupFilterOptions,
  resolveChampionshipBracketGroupStageOptions,
  resolveChampionshipGroupLabel,
  resolveInterleavedScheduledMatchesByCompetition,
  resolveMatchBracketContextByMatchId,
  resolveMatchScheduledDateValue,
} from "@/lib/championship";
import { resolveChampionshipChampionHistory } from "@/lib/championshipHistory";
import {
  applyCorrectedGroupPointsToStanding,
  aggregateStandingsByTeam,
  filterAggregatesByBracketGroupPlacement,
  resolveCorrectedStandingKey,
  resolveManualTieBreakWinnerTeamIdByPairKey,
} from "@/lib/standings";
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
const ALL_STANDINGS_GROUP_FILTER = "ALL_STANDINGS_GROUPS";
const ALL_STANDINGS_PLACEMENT_FILTER = "all";
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

  const standingsDivisionFilter = selectedChampionshipHasDivisions ? undefined : null;
  const [teamFilter, setTeamFilter] = useState<string>(ALL_TEAM_FILTER);
  const [yearFilter, setYearFilter] = useState<string>(ALL_YEAR_FILTER);
  const [groupFilter, setGroupFilter] = useState<string>(ALL_GROUP_FILTER);
  const [standingsSportFilter, setStandingsSportFilter] = useState<string>(ALL_STANDINGS_SPORT_FILTER);
  const [standingsNaipeFilter, setStandingsNaipeFilter] = useState<string>(ALL_STANDINGS_NAIPE_FILTER);
  const [standingsPlacementFilter, setStandingsPlacementFilter] = useState<string>(ALL_STANDINGS_PLACEMENT_FILTER);
  const [standingsYearFilter, setStandingsYearFilter] = useState<string>(
    selectedChampionshipSeasonYear != null ? String(selectedChampionshipSeasonYear) : ALL_YEAR_FILTER,
  );

  const { standings, loading: standingsLoading } = useStandings({
    championshipId: selectedChampionshipId,
    seasonYear: standingsYearFilter == ALL_YEAR_FILTER ? null : Number(standingsYearFilter),
    division: standingsDivisionFilter,
  });
  const standingsCorrectedSeasonYear = standingsYearFilter == ALL_YEAR_FILTER ? null : Number(standingsYearFilter);
  const shouldUseCorrectedPointsOnStandings =
    standingsCorrectedSeasonYear != null && Number.isFinite(standingsCorrectedSeasonYear);
  const { correctedGroupStandings, loading: correctedGroupStandingsLoading } = useChampionshipCorrectedGroupStandings({
    championshipId: selectedChampionshipId,
    seasonYear: shouldUseCorrectedPointsOnStandings ? standingsCorrectedSeasonYear : null,
    enabled: shouldUseCorrectedPointsOnStandings,
  });
  const { sports, championshipSports } = useSports({ championshipId: selectedChampionshipId });
  const { teams } = useTeams();

  useEffect(() => {
    setTeamFilter(ALL_TEAM_FILTER);
    setYearFilter(ALL_YEAR_FILTER);
    setGroupFilter(ALL_GROUP_FILTER);
    setStandingsSportFilter(ALL_STANDINGS_SPORT_FILTER);
    setStandingsNaipeFilter(ALL_STANDINGS_NAIPE_FILTER);
    setStandingsPlacementFilter(ALL_STANDINGS_PLACEMENT_FILTER);
    setStandingsYearFilter(selectedChampionshipSeasonYear != null ? String(selectedChampionshipSeasonYear) : ALL_YEAR_FILTER);
  }, [selectedChampionshipCode, selectedChampionshipSeasonYear]);

  useEffect(() => {
    const isStandingsContextSelected =
      standingsSportFilter != ALL_STANDINGS_SPORT_FILTER &&
      standingsNaipeFilter != ALL_STANDINGS_NAIPE_FILTER;

    if (!isStandingsContextSelected && standingsPlacementFilter != ALL_STANDINGS_PLACEMENT_FILTER) {
      setStandingsPlacementFilter(ALL_STANDINGS_PLACEMENT_FILTER);
    }
  }, [standingsNaipeFilter, standingsPlacementFilter, standingsSportFilter]);

  const nextMatches: Match[] = [];
  const historyTeams: Team[] = [];
  const historyYears = useMemo(() => {
    const years = new Set<string>();
    if (selectedChampionshipSeasonYear != null) {
      years.add(String(selectedChampionshipSeasonYear));
    }
    // We could still add years from championshipBracketHistory if needed
    return [...years].sort((a, b) => b.localeCompare(a));
  }, [selectedChampionshipSeasonYear]);

  const championshipBracketSeasonYears = useMemo(() => {
    return historyYears.map(Number).filter((seasonYear) => Number.isFinite(seasonYear));
  }, [historyYears]);

  const { championshipBracketSeasonViews, loading: championshipBracketHistoryLoading } = useChampionshipBracketHistory({
    championshipId: selectedChampionshipId,
    seasonYears: championshipBracketSeasonYears,
  });
  const historyGroupOptions = useMemo(() => {
    const allOptions = championshipBracketSeasonViews.flatMap((seasonView) => {
      return resolveChampionshipBracketGroupStageOptions(seasonView.championship_bracket_view);
    });

    const uniqueGroups = new Map<string, string>();
    allOptions.forEach((option) => {
      const groupLabel = resolveChampionshipGroupLabel(option.group_number);
      uniqueGroups.set(groupLabel, groupLabel);
    });

    return [...uniqueGroups.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((firstGroupOption, secondGroupOption) => firstGroupOption.label.localeCompare(secondGroupOption.label));
  }, [championshipBracketSeasonViews]);

  const matchBracketContextByMatchId = {};
  const matchRepresentationByMatchId = {};
  const estimatedStartTimeByMatchId = {};

  const correctedStandingByKey = useMemo(() => {
    return correctedGroupStandings.reduce<Record<string, { points_base: number; corrected_points: number }>>(
      (carry, correctedGroupStanding) => {
        carry[resolveCorrectedStandingKey(correctedGroupStanding)] = {
          points_base: correctedGroupStanding.points_base,
          corrected_points: correctedGroupStanding.corrected_points,
        };
        return carry;
      },
      {},
    );
  }, [correctedGroupStandings]);

  const standingsWithCorrectedPoints = useMemo(() => {
    if (!shouldUseCorrectedPointsOnStandings) {
      return standings;
    }

    return standings.map((standing) => applyCorrectedGroupPointsToStanding(standing, correctedStandingByKey));
  }, [correctedStandingByKey, shouldUseCorrectedPointsOnStandings, standings]);

  const standingsWithFilters = useMemo(() => {
    return standingsWithCorrectedPoints.filter((standing) => {
      if (standingsSportFilter != ALL_STANDINGS_SPORT_FILTER && standing.sport_id != standingsSportFilter) {
        return false;
      }

      if (standingsNaipeFilter != ALL_STANDINGS_NAIPE_FILTER && standing.naipe != standingsNaipeFilter) {
        return false;
      }

      return true;
    });
  }, [
    standingsWithCorrectedPoints,
    standingsNaipeFilter,
    standingsSportFilter,
  ]);

  const overallPodiumStandings = useMemo(() => {
    return aggregateStandingsByTeam(standingsWithCorrectedPoints).slice(0, 3);
  }, [standingsWithCorrectedPoints]);



  const standingsTieBreakerRule = useMemo(() => {
    if (standingsSportFilter == ALL_STANDINGS_SPORT_FILTER) {
      return ChampionshipSportTieBreakerRule.STANDARD;
    }

    const selectedChampionshipSport = championshipSports.find(
      (championshipSport) => championshipSport.sport_id == standingsSportFilter,
    );

    return selectedChampionshipSport?.tie_breaker_rule ?? ChampionshipSportTieBreakerRule.STANDARD;
  }, [championshipSports, standingsSportFilter]);

  const standingsResolvedTieBreakSeasonYear =
    standingsYearFilter == ALL_YEAR_FILTER ? null : Number(standingsYearFilter);
  const shouldUseManualTieBreakOnStandings =
    standingsResolvedTieBreakSeasonYear != null &&
    standingsSportFilter != ALL_STANDINGS_SPORT_FILTER &&
    standingsNaipeFilter != ALL_STANDINGS_NAIPE_FILTER;
  const {
    resolvedTieBreakOrders,
    loading: resolvedTieBreakOrdersLoading,
  } = useChampionshipBracketResolvedTieBreakOrders({
    championshipId: selectedChampionshipId,
    seasonYear: standingsResolvedTieBreakSeasonYear,
    enabled: shouldUseManualTieBreakOnStandings,
  });

  const filteredResolvedTieBreakOrders = useMemo<ChampionshipBracketResolvedTieBreakOrderContext[]>(() => {
    if (!shouldUseManualTieBreakOnStandings) {
      return [];
    }

    const selectedStandingsNaipeFilter = standingsNaipeFilter as MatchNaipe;

    return resolvedTieBreakOrders.filter((resolvedTieBreakOrder) => {
      return (
        resolvedTieBreakOrder.sport_id == standingsSportFilter &&
        resolvedTieBreakOrder.naipe == selectedStandingsNaipeFilter &&
        resolvedTieBreakOrder.team_ids.length >= 2
      );
    });
  }, [
    resolvedTieBreakOrders,
    shouldUseManualTieBreakOnStandings,
    standingsNaipeFilter,
    standingsSportFilter,
  ]);

  const standingsManualTieBreakWinnerTeamIdByPairKey = useMemo(() => {
    if (filteredResolvedTieBreakOrders.length == 0) {
      return undefined;
    }

    const manualTieBreakWinnerTeamIdByPairKey = resolveManualTieBreakWinnerTeamIdByPairKey(filteredResolvedTieBreakOrders);

    if (Object.keys(manualTieBreakWinnerTeamIdByPairKey).length == 0) {
      return undefined;
    }

    return manualTieBreakWinnerTeamIdByPairKey;
  }, [filteredResolvedTieBreakOrders]);

  const filteredStandings = useMemo(() => {
    return aggregateStandingsByTeam(standingsWithFilters, {
      manualTieBreakWinnerTeamIdByPairKey: standingsManualTieBreakWinnerTeamIdByPairKey,
    });
  }, [standingsWithFilters, standingsManualTieBreakWinnerTeamIdByPairKey]);

  const standingsModalidadeConfig = useMemo((): ModalidadeConfig | undefined => {
    if (standingsSportFilter == ALL_STANDINGS_SPORT_FILTER) return undefined;

    const activeNaipe =
      standingsNaipeFilter == ALL_STANDINGS_NAIPE_FILTER ? null : (standingsNaipeFilter as MatchNaipe);

    return resolveModalidadeConfigBySportId(standingsSportFilter, activeNaipe, sports);
  }, [sports, standingsNaipeFilter, standingsSportFilter]);

  const standingsHeadToHeadSportFilter = standingsSportFilter == ALL_STANDINGS_SPORT_FILTER ? null : standingsSportFilter;
  const standingsHeadToHeadNaipeFilter =
    standingsNaipeFilter == ALL_STANDINGS_NAIPE_FILTER ? null : (standingsNaipeFilter as MatchNaipe);
  const standingsHeadToHeadSeasonYearFilter = standingsYearFilter == ALL_YEAR_FILTER ? null : Number(standingsYearFilter);

  const { matches: standingsHeadToHeadMatches, loading: standingsHeadToHeadMatchesLoading } = useMatches({
    championshipId: selectedChampionshipId,
    seasonYear: standingsHeadToHeadSeasonYearFilter,
    statuses: [MatchStatus.FINISHED],
    sportId: standingsHeadToHeadSportFilter,
    naipe: standingsHeadToHeadNaipeFilter,
    sortMode: "FINISHED",
  });

  const standingsBracketGroupOptions = useMemo(() => {
    if (standingsYearFilter == ALL_YEAR_FILTER) {
      return [];
    }

    const seasonYear = Number(standingsYearFilter);

    if (!Number.isFinite(seasonYear)) {
      return [];
    }

    const seasonView = championshipBracketSeasonViews.find((seasonBracketView) => seasonBracketView.season_year == seasonYear);

    if (!seasonView) {
      return [];
    }

    const allOptions = resolveChampionshipBracketGroupStageOptions(seasonView.championship_bracket_view);

    return allOptions.filter((option) => {
      const sportMatch =
        standingsSportFilter == ALL_STANDINGS_SPORT_FILTER || option.sport_id == standingsSportFilter;
      const naipeMatch =
        standingsNaipeFilter == ALL_STANDINGS_NAIPE_FILTER || option.naipe == standingsNaipeFilter;

      return sportMatch && naipeMatch;
    });
  }, [championshipBracketSeasonViews, standingsYearFilter, standingsSportFilter, standingsNaipeFilter]);

  const placementFilteredStandings = useMemo(() => {
    const isStandingsPlacementFilterDisabled =
      standingsSportFilter == ALL_STANDINGS_SPORT_FILTER || standingsNaipeFilter == ALL_STANDINGS_NAIPE_FILTER;
    const resolvedPlacementFilter = isStandingsPlacementFilterDisabled ? ALL_STANDINGS_PLACEMENT_FILTER : standingsPlacementFilter;

    return filterAggregatesByBracketGroupPlacement(filteredStandings, {
      groupOptions: standingsBracketGroupOptions,
      placement:
        resolvedPlacementFilter == "first_per_group"
          ? "first_per_group"
          : resolvedPlacementFilter == "second_per_group"
            ? "second_per_group"
            : "all",
      groupSelectValue: ALL_STANDINGS_GROUP_FILTER,
      allGroupSelectValue: ALL_STANDINGS_GROUP_FILTER,
      sportSelectValue: standingsSportFilter,
      allSportSelectValue: ALL_STANDINGS_SPORT_FILTER,
      naipeSelectValue: standingsNaipeFilter,
      allNaipeSelectValue: ALL_STANDINGS_NAIPE_FILTER,
      sortOptions: {
        tieBreakerRule: standingsTieBreakerRule,
        headToHeadMatches: standingsHeadToHeadMatches,
        manualTieBreakWinnerTeamIdByPairKey: standingsManualTieBreakWinnerTeamIdByPairKey,
      },
      resolveTieBreakerRuleForSport: (sportId) => {
        const championshipSport = championshipSports.find((c) => c.sport_id == sportId);

        return championshipSport?.tie_breaker_rule ?? ChampionshipSportTieBreakerRule.STANDARD;
      },
      finalTieBreakerRule: standingsTieBreakerRule,
    });
  }, [
    championshipSports,
    filteredStandings,
    standingsBracketGroupOptions,
    standingsHeadToHeadMatches,
    standingsManualTieBreakWinnerTeamIdByPairKey,
    standingsNaipeFilter,
    standingsPlacementFilter,
    standingsSportFilter,
    standingsTieBreakerRule,
  ]);

  const championshipChampionHistory = useMemo(() => {
    return resolveChampionshipChampionHistory(championshipBracketSeasonViews);
  }, [championshipBracketSeasonViews]);

  const isLoading = 
    championshipsLoading ||
    championshipBracketHistoryLoading;

  const isNextMatchesFetching = false;
  const isHistoryMatchesFetching = false;
  const filteredHistoryMatches: Match[] = [];

  return (
    <ChampionshipsPageView
      isLoading={isLoading}
      isStandingsLoading={
        standingsLoading ||
        correctedGroupStandingsLoading ||
        standingsHeadToHeadMatchesLoading ||
        resolvedTieBreakOrdersLoading
      }
      championships={championships}
      selectedChampionship={selectedChampionship}
      selectedChampionshipCode={selectedChampionshipCode}
      selectedChampionshipIsFinished={selectedChampionshipIsFinished}
      championshipCardImageByCode={CHAMPIONSHIP_CARD_IMAGE_BY_CODE}
      sports={sports}
      nextMatches={nextMatches}
      isNextMatchesFetching={isNextMatchesFetching}
      matchBracketContextByMatchId={matchBracketContextByMatchId}
      matchRepresentationByMatchId={matchRepresentationByMatchId}
      estimatedStartTimeByMatchId={estimatedStartTimeByMatchId}
      standingsSportFilter={standingsSportFilter}
      standingsNaipeFilter={standingsNaipeFilter}
      standingsYearFilter={standingsYearFilter}
      allStandingsSportFilter={ALL_STANDINGS_SPORT_FILTER}
      allStandingsNaipeFilter={ALL_STANDINGS_NAIPE_FILTER}
      standingsBracketGroupOptions={standingsBracketGroupOptions}
      standingsPlacementFilter={standingsPlacementFilter}
      allStandingsPlacementFilter={ALL_STANDINGS_PLACEMENT_FILTER}
      filteredStandings={placementFilteredStandings}
      standingsModalidadeConfig={standingsModalidadeConfig}
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
      isHistoryMatchesFetching={isHistoryMatchesFetching}
      championshipChampionHistory={championshipChampionHistory}
      overallPodiumStandings={overallPodiumStandings}
      onSelectChampionshipCode={setSelectedChampionshipCode}
      onStandingsSportFilterChange={setStandingsSportFilter}
      onStandingsNaipeFilterChange={setStandingsNaipeFilter}
      onStandingsYearFilterChange={setStandingsYearFilter}
      onStandingsPlacementFilterChange={setStandingsPlacementFilter}
      onTeamFilterChange={setTeamFilter}
      onYearFilterChange={setYearFilter}
      onGroupFilterChange={setGroupFilter}
    />
  );
}
