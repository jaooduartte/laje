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
import { useChampionshipAwardsRankings } from "@/hooks/useChampionshipAwardsRankings";
import { useCompetitionTeamDisqualifications } from "@/hooks/useCompetitionTeamDisqualifications";
import { useChampionshipSeasonYears } from "@/hooks/useChampionshipSeasonYears";
import { useChampionshipIndividualEvents } from "@/hooks/useChampionshipIndividualEvents";
import { useInterlajeOverallStandings } from "@/hooks/useInterlajeOverallStandings";
import type { ChampionshipBracketResolvedTieBreakOrderContext } from "@/domain/championship-brackets/championshipBracket.types";
import type { MatchBracketContext } from "@/lib/championship";
import {
  ChampionshipCode,
  ChampionshipSportNaipeMode,
  ChampionshipSportTieBreakerRule,
  ChampionshipStatus,
  MatchNaipe,
  MatchStatus,
  TeamDivision,
} from "@/lib/enums";
import { resolveModalidadeConfigBySportId, type ModalidadeConfig } from "@/lib/modalidadeConfig";
import { isIndividualSportId, resolveIndividualSportIds } from "@/lib/individualEvents";
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
import { resolveChampionshipCompetitionPodiums } from "@/lib/championshipPodium";
import {
  applyOfficialThirdPlacementToStandings,
  applyCorrectedGroupPointsToStanding,
  aggregateStandingsByTeam,
  moveDisqualifiedStandingsToBottom,
  resolveCorrectedStandingKey,
  resolveManualTieBreakWinnerTeamIdByPairKey,
  resolveTeamStandingAggregateKey,
} from "@/lib/standings";
import type { TeamStandingAggregate } from "@/lib/standings";
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
const ALL_STANDINGS_DIVISION_FILTER = "ALL_STANDINGS_DIVISIONS";
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
  const { seasonYears: championshipSeasonYears } = useChampionshipSeasonYears({
    championshipId: selectedChampionshipId,
    currentSeasonYear: selectedChampionshipSeasonYear,
  });

  const standingsDbDivisionFilter = undefined;
  const [teamFilter, setTeamFilter] = useState<string>(ALL_TEAM_FILTER);
  const [yearFilter, setYearFilter] = useState<string>(ALL_YEAR_FILTER);
  const [groupFilter, setGroupFilter] = useState<string>(ALL_GROUP_FILTER);
  const [standingsSportFilter, setStandingsSportFilter] = useState<string>(ALL_STANDINGS_SPORT_FILTER);
  const [standingsNaipeFilter, setStandingsNaipeFilter] = useState<string>(ALL_STANDINGS_NAIPE_FILTER);
  const [standingsDivisionFilter, setStandingsDivisionFilter] = useState<string>(ALL_STANDINGS_DIVISION_FILTER);
  const [standingsYearFilter, setStandingsYearFilter] = useState<string>(
    selectedChampionshipSeasonYear != null ? String(selectedChampionshipSeasonYear) : ALL_YEAR_FILTER,
  );

  const { standings, loading: standingsLoading } = useStandings({
    championshipId: selectedChampionshipId,
    seasonYear: standingsYearFilter == ALL_YEAR_FILTER ? null : Number(standingsYearFilter),
    division: standingsDbDivisionFilter,
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
  const { standings: interlajeOverallStandings, loading: interlajeOverallStandingsLoading } = useInterlajeOverallStandings({
    championshipId: selectedChampionship?.code == ChampionshipCode.INTERLAJE ? selectedChampionshipId : null,
    seasonYear: selectedChampionship?.code == ChampionshipCode.INTERLAJE ? selectedChampionshipSeasonYear : null,
  });
  const individualSportIds = useMemo(() => resolveIndividualSportIds(sports), [sports]);
  const shouldLoadAwardsRankings = selectedChampionship?.code == ChampionshipCode.SOCIETY;
  const { rankings: awardsRankings } = useChampionshipAwardsRankings({
    championshipId: shouldLoadAwardsRankings ? selectedChampionshipId : null,
    seasonYear: shouldLoadAwardsRankings ? selectedChampionshipSeasonYear : null,
  });
  const standingsDisqualificationSeasonYear =
    standingsYearFilter == ALL_YEAR_FILTER ? null : Number(standingsYearFilter);
  const { disqualifications: competitionDisqualifications } = useCompetitionTeamDisqualifications({
    championshipId: selectedChampionshipId,
    seasonYear: standingsDisqualificationSeasonYear,
  });
  const { teams } = useTeams({ includeInactive: true });

  useEffect(() => {
    setTeamFilter(ALL_TEAM_FILTER);
    setYearFilter(ALL_YEAR_FILTER);
    setGroupFilter(ALL_GROUP_FILTER);
    setStandingsSportFilter(ALL_STANDINGS_SPORT_FILTER);
    setStandingsNaipeFilter(ALL_STANDINGS_NAIPE_FILTER);
    setStandingsDivisionFilter(ALL_STANDINGS_DIVISION_FILTER);
    setStandingsYearFilter(selectedChampionshipSeasonYear != null ? String(selectedChampionshipSeasonYear) : ALL_YEAR_FILTER);
  }, [selectedChampionshipCode, selectedChampionshipSeasonYear]);

  const nextMatches: Match[] = [];
  const historyTeams: Team[] = [];
  const historyYears = useMemo(() => {
    return championshipSeasonYears.map(String);
  }, [championshipSeasonYears]);

  const championshipBracketSeasonYears = useMemo(() => {
    return championshipSeasonYears;
  }, [championshipSeasonYears]);

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

      if (standingsDivisionFilter != ALL_STANDINGS_DIVISION_FILTER && standing.division != standingsDivisionFilter) {
        return false;
      }

      return true;
    });
  }, [
    standingsWithCorrectedPoints,
    standingsNaipeFilter,
    standingsSportFilter,
    standingsDivisionFilter,
  ]);

  const overallPodiumStandings = useMemo(() => {
    if (selectedChampionship?.code == ChampionshipCode.INTERLAJE) {
      return interlajeOverallStandings.slice(0, 3).map<TeamStandingAggregate>((standing) => ({
        team_id: standing.team_id,
        team_name: standing.team_name,
        team_city: "",
        division: null,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        goal_diff: 0,
        points: standing.overall_points,
        yellow_cards: 0,
        red_cards: 0,
      }));
    }

    return aggregateStandingsByTeam(standingsWithCorrectedPoints).slice(0, 3);
  }, [interlajeOverallStandings, selectedChampionship?.code, standingsWithCorrectedPoints]);



  const standingsTieBreakerRule = useMemo(() => {
    if (standingsSportFilter == ALL_STANDINGS_SPORT_FILTER) {
      return ChampionshipSportTieBreakerRule.STANDARD;
    }

    const selectedChampionshipSport = championshipSports.find(
      (championshipSport) => championshipSport.sport_id == standingsSportFilter,
    );

    return selectedChampionshipSport?.tie_breaker_rule ?? ChampionshipSportTieBreakerRule.STANDARD;
  }, [championshipSports, standingsSportFilter]);

  const selectedStandingsChampionshipSport = useMemo(() => {
    if (standingsSportFilter == ALL_STANDINGS_SPORT_FILTER) {
      return null;
    }

    return (
      championshipSports.find((championshipSport) => championshipSport.sport_id == standingsSportFilter) ?? null
    );
  }, [championshipSports, standingsSportFilter]);

  const isStandingsNaipeFilterLockedToMixed = useMemo(() => {
    return selectedStandingsChampionshipSport?.naipe_mode == ChampionshipSportNaipeMode.MISTO;
  }, [selectedStandingsChampionshipSport]);

  useEffect(() => {
    if (isStandingsNaipeFilterLockedToMixed) {
      if (standingsNaipeFilter != MatchNaipe.MISTO) {
        setStandingsNaipeFilter(MatchNaipe.MISTO);
      }
      return;
    }

    if (
      standingsNaipeFilter == MatchNaipe.MISTO &&
      selectedStandingsChampionshipSport != null &&
      selectedStandingsChampionshipSport.naipe_mode == ChampionshipSportNaipeMode.MASCULINO_FEMININO
    ) {
      setStandingsNaipeFilter(ALL_STANDINGS_NAIPE_FILTER);
    }
  }, [
    isStandingsNaipeFilterLockedToMixed,
    selectedStandingsChampionshipSport,
    standingsNaipeFilter,
  ]);

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

  const filteredStandings = useMemo(() => {
    const aggregates = aggregateStandingsByTeam(standingsWithFilters, {
      tieBreakerRule: standingsTieBreakerRule,
      headToHeadMatches: standingsHeadToHeadMatches,
      manualTieBreakWinnerTeamIdByPairKey: standingsManualTieBreakWinnerTeamIdByPairKey,
    });

    if (
      standingsDisqualificationSeasonYear == null ||
      standingsSportFilter == ALL_STANDINGS_SPORT_FILTER ||
      standingsNaipeFilter == ALL_STANDINGS_NAIPE_FILTER
    ) {
      return aggregates;
    }

    const disqualifiedTeamKeys = new Set(
      competitionDisqualifications
        .filter((disqualification) => {
          if (disqualification.sport_id != standingsSportFilter) {
            return false;
          }

          if (disqualification.naipe != standingsNaipeFilter) {
            return false;
          }

          if (
            standingsDivisionFilter != ALL_STANDINGS_DIVISION_FILTER &&
            disqualification.division != standingsDivisionFilter
          ) {
            return false;
          }

          return true;
        })
        .map((disqualification) => resolveTeamStandingAggregateKey(disqualification)),
    );

    return moveDisqualifiedStandingsToBottom(aggregates, disqualifiedTeamKeys);
  }, [
    competitionDisqualifications,
    standingsHeadToHeadMatches,
    standingsDisqualificationSeasonYear,
    standingsDivisionFilter,
    standingsManualTieBreakWinnerTeamIdByPairKey,
    standingsNaipeFilter,
    standingsSportFilter,
    standingsTieBreakerRule,
    standingsWithFilters,
  ]);

  const standingsModalidadeConfig = useMemo((): ModalidadeConfig | undefined => {
    if (standingsSportFilter == ALL_STANDINGS_SPORT_FILTER) return undefined;

    const activeNaipe =
      standingsNaipeFilter == ALL_STANDINGS_NAIPE_FILTER ? null : (standingsNaipeFilter as MatchNaipe);

    return resolveModalidadeConfigBySportId(standingsSportFilter, activeNaipe, sports);
  }, [sports, standingsNaipeFilter, standingsSportFilter]);

  const selectedStandingsSeasonView = useMemo(() => {
    if (standingsYearFilter == ALL_YEAR_FILTER) {
      return null;
    }

    const seasonYear = Number(standingsYearFilter);

    if (!Number.isFinite(seasonYear)) {
      return null;
    }

    return (
      championshipBracketSeasonViews.find((seasonBracketView) => seasonBracketView.season_year == seasonYear) ?? null
    );
  }, [championshipBracketSeasonViews, standingsYearFilter]);

  const standingsWithOfficialThirdPlacement = useMemo(() => {
    if (!shouldUseManualTieBreakOnStandings || !selectedStandingsSeasonView) {
      return {
        adjustedStandings: filteredStandings,
        badgeByTeamKey: {},
      };
    }

    const selectedStandingsNaipeFilter = standingsNaipeFilter as MatchNaipe;
    const officialThirdPlacements = resolveChampionshipCompetitionPodiums(selectedStandingsSeasonView.championship_bracket_view)
      .filter((competitionPodium) => {
        return (
          competitionPodium.sport_id == standingsSportFilter &&
          competitionPodium.naipe == selectedStandingsNaipeFilter &&
          competitionPodium.third_place != null
        );
      })
      .map((competitionPodium) => ({
        team_id: competitionPodium.third_place!.team.team_id,
        division: competitionPodium.division ?? null,
        source: competitionPodium.third_place!.source,
      }));

    return applyOfficialThirdPlacementToStandings(filteredStandings, officialThirdPlacements);
  }, [
    filteredStandings,
    selectedStandingsSeasonView,
    shouldUseManualTieBreakOnStandings,
    standingsNaipeFilter,
    standingsSportFilter,
  ]);

  const isIndividualStandingsView = useMemo(() => {
    return standingsSportFilter != ALL_STANDINGS_SPORT_FILTER && isIndividualSportId(standingsSportFilter, sports);
  }, [sports, standingsSportFilter]);

  const standingsIndividualSeasonYearFilter = standingsYearFilter == ALL_YEAR_FILTER ? null : Number(standingsYearFilter);
  const { events: individualEvents, entriesByEventId: individualEntriesByEventId } = useChampionshipIndividualEvents({
    championshipId: selectedChampionshipId,
    seasonYear: standingsIndividualSeasonYearFilter,
    sportIds: individualSportIds,
    sportId: isIndividualStandingsView ? standingsSportFilter : null,
    naipe: standingsNaipeFilter == ALL_STANDINGS_NAIPE_FILTER ? null : (standingsNaipeFilter as MatchNaipe),
    division:
      standingsDivisionFilter == ALL_STANDINGS_DIVISION_FILTER
        ? undefined
        : (standingsDivisionFilter as TeamDivision),
  });

  const individualStandingsRows = useMemo(() => {
    if (!isIndividualStandingsView) {
      return [];
    }

    return standingsWithFilters.filter((standing) => standing.is_individual_sport == true);
  }, [isIndividualStandingsView, standingsWithFilters]);

  const standingsDisqualifiedTeamKeys = useMemo(() => {
    if (
      standingsDisqualificationSeasonYear == null ||
      standingsSportFilter == ALL_STANDINGS_SPORT_FILTER ||
      standingsNaipeFilter == ALL_STANDINGS_NAIPE_FILTER
    ) {
      return undefined;
    }

    const keys = competitionDisqualifications
      .filter((disqualification) => {
        if (disqualification.sport_id != standingsSportFilter) {
          return false;
        }

        if (disqualification.naipe != standingsNaipeFilter) {
          return false;
        }

        if (
          standingsDivisionFilter != ALL_STANDINGS_DIVISION_FILTER &&
          disqualification.division != standingsDivisionFilter
        ) {
          return false;
        }

        return true;
      })
      .map((disqualification) => resolveTeamStandingAggregateKey(disqualification));

    return keys.length > 0 ? new Set(keys) : undefined;
  }, [
    competitionDisqualifications,
    standingsDisqualificationSeasonYear,
    standingsDivisionFilter,
    standingsNaipeFilter,
    standingsSportFilter,
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
        || interlajeOverallStandingsLoading
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
      filteredStandings={standingsWithOfficialThirdPlacement.adjustedStandings}
      isIndividualStandingsView={isIndividualStandingsView}
      individualStandingsRows={individualStandingsRows}
      individualEvents={individualEvents}
      individualEntriesByEventId={individualEntriesByEventId}
      standingsModalidadeConfig={standingsModalidadeConfig}
      isStandingsNaipeFilterLocked={isStandingsNaipeFilterLockedToMixed}
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
      standingsDivisionFilter={standingsDivisionFilter}
      allStandingsDivisionFilter={ALL_STANDINGS_DIVISION_FILTER}
      selectedChampionshipHasDivisions={selectedChampionshipHasDivisions}
          awardsRankings={awardsRankings}
      awardsSeasonYear={selectedChampionshipSeasonYear}
      disqualifiedTeamKeys={standingsDisqualifiedTeamKeys}
      competitionDisqualifications={competitionDisqualifications}
      onStandingsSportFilterChange={setStandingsSportFilter}
      onStandingsNaipeFilterChange={setStandingsNaipeFilter}
      onStandingsDivisionFilterChange={setStandingsDivisionFilter}
      onStandingsYearFilterChange={setStandingsYearFilter}
      onTeamFilterChange={setTeamFilter}
      onYearFilterChange={setYearFilter}
      onGroupFilterChange={setGroupFilter}
    />
  );
}
