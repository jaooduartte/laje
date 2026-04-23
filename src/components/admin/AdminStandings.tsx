import { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStandings } from "@/hooks/useStandings";
import { useMatches } from "@/hooks/useMatches";
import { useChampionshipBracketResolvedTieBreakOrders } from "@/hooks/useChampionshipBracketResolvedTieBreakOrders";
import { useChampionshipCorrectedGroupStandings } from "@/hooks/useChampionshipCorrectedGroupStandings";
import { useChampionshipBracketHistory } from "@/hooks/useChampionshipBracketHistory";
import { resolveChampionshipCompetitionPodiums } from "@/lib/championshipPodium";
import {
  applyOfficialThirdPlacementToStandings,
  aggregateStandingsByTeam,
  applyCorrectedGroupPointsToStanding,
  filterAggregatesByBracketGroupPlacement,
  resolveCorrectedStandingKey,
  resolveManualTieBreakWinnerTeamIdByPairKey,
} from "@/lib/standings";
import { ChampionshipSportTieBreakerRule, MatchNaipe, MatchStatus, TeamDivision } from "@/lib/enums";
import { resolveModalidadeConfigBySportId } from "@/lib/modalidadeConfig";
import {
  resolveChampionshipBracketGroupStageOptions,
  resolveChampionshipGroupLabel,
} from "@/lib/championship";
import { TeamStandingsTable } from "@/components/TeamStandingsTable";
import type {
  Championship,
  ChampionshipBracketView,
  ChampionshipSport,
  Sport,
} from "@/lib/types";
import { SportFilter } from "@/components/SportFilter";

interface Props {
  selectedChampionship: Championship;
  championshipSports: ChampionshipSport[];
  sports: Sport[];
  championshipBracketView: ChampionshipBracketView;
}

const ALL_SPORTS_FILTER = "all";
const ALL_NAIPES_FILTER = "all";
const ALL_GROUPS_FILTER = "all";

export function AdminStandings({ selectedChampionship, championshipSports, sports, championshipBracketView }: Props) {
  const [sportFilter, setSportFilter] = useState<string>(ALL_SPORTS_FILTER);
  const [naipeFilter, setNaipeFilter] = useState<string>(ALL_NAIPES_FILTER);
  const [groupFilter, setGroupFilter] = useState<string>(ALL_GROUPS_FILTER);
  const [divisionFilter, setDivisionFilter] = useState<TeamDivision>(TeamDivision.DIVISAO_PRINCIPAL);
  const [placementFilter, setPlacementFilter] = useState<string>("all");

  const selectedChampionshipSeasonYear = selectedChampionship?.current_season_year ?? null;
  const [yearFilter, setYearFilter] = useState<string>(
    selectedChampionshipSeasonYear != null ? String(selectedChampionshipSeasonYear) : "all",
  );
  const correctedYearFilter = yearFilter === "all" ? null : Number(yearFilter);

  const seasonYearsForBracketHistory = useMemo(() => {
    const seasonYears: number[] = [];

    if (selectedChampionshipSeasonYear != null) {
      seasonYears.push(selectedChampionshipSeasonYear);
    }

    if (correctedYearFilter != null && Number.isFinite(correctedYearFilter)) {
      seasonYears.push(correctedYearFilter);
    }

    return [...new Set(seasonYears)];
  }, [correctedYearFilter, selectedChampionshipSeasonYear]);

  const { championshipBracketSeasonViews } = useChampionshipBracketHistory({
    championshipId: selectedChampionship.id,
    seasonYears: seasonYearsForBracketHistory,
  });

  const selectedSeasonBracketView = useMemo(() => {
    if (correctedYearFilter == null) {
      return championshipBracketView;
    }

    const selectedSeasonView = championshipBracketSeasonViews.find(
      (seasonBracketView) => seasonBracketView.season_year == correctedYearFilter,
    );

    return selectedSeasonView?.championship_bracket_view ?? championshipBracketView;
  }, [championshipBracketSeasonViews, championshipBracketView, correctedYearFilter]);

  const selectedSeasonGroupOptions = useMemo(() => {
    return resolveChampionshipBracketGroupStageOptions(selectedSeasonBracketView);
  }, [selectedSeasonBracketView]);

  const historyYears = useMemo(() => {
    return [...new Set(championshipBracketSeasonViews.map((championshipBracketSeasonView) => championshipBracketSeasonView.season_year))]
      .sort((firstYear, secondYear) => secondYear - firstYear);
  }, [championshipBracketSeasonViews]);

  const { standings, loading: standingsLoading } = useStandings({
    championshipId: selectedChampionship.id,
    seasonYear: correctedYearFilter,
    division: selectedChampionship.uses_divisions ? divisionFilter : null,
  });

  const { correctedGroupStandings, loading: correctedStandingsLoading } = useChampionshipCorrectedGroupStandings({
    championshipId: selectedChampionship.id,
    seasonYear: correctedYearFilter,
  });

  const standingsHeadToHeadSportFilter = sportFilter == ALL_SPORTS_FILTER ? null : sportFilter;
  const standingsHeadToHeadNaipeFilter =
    naipeFilter == ALL_NAIPES_FILTER ? null : (naipeFilter as MatchNaipe);

  const { matches: standingsHeadToHeadMatches, loading: finishedMatchesLoading } = useMatches({
    championshipId: selectedChampionship.id,
    seasonYear: correctedYearFilter,
    statuses: [MatchStatus.FINISHED],
    sportId: standingsHeadToHeadSportFilter,
    naipe: standingsHeadToHeadNaipeFilter,
    sortMode: "FINISHED",
  });

  const activeSports = useMemo(() => {
    const selectedChampionshipSportIds = new Set(championshipSports.map((championshipSport) => championshipSport.sport_id));
    return sports.filter((sport) => selectedChampionshipSportIds.has(sport.id));
  }, [sports, championshipSports]);

  const standingsTieBreakerRule = useMemo(() => {
    if (sportFilter == ALL_SPORTS_FILTER) {
      return ChampionshipSportTieBreakerRule.STANDARD;
    }

    const selectedChampionshipSport = championshipSports.find(
      (championshipSport) => championshipSport.sport_id == sportFilter,
    );

    return selectedChampionshipSport?.tie_breaker_rule ?? ChampionshipSportTieBreakerRule.STANDARD;
  }, [championshipSports, sportFilter]);

  const shouldUseManualTieBreakOnStandings =
    correctedYearFilter != null &&
    sportFilter != ALL_SPORTS_FILTER &&
    naipeFilter != ALL_NAIPES_FILTER;
  const isPlacementFilterDisabled =
    sportFilter == ALL_SPORTS_FILTER || naipeFilter == ALL_NAIPES_FILTER;
  const resolvedPlacementFilter = isPlacementFilterDisabled ? "all" : placementFilter;

  const { resolvedTieBreakOrders, loading: tieBreaksLoading } = useChampionshipBracketResolvedTieBreakOrders({
    championshipId: selectedChampionship.id,
    seasonYear: correctedYearFilter,
    enabled: shouldUseManualTieBreakOnStandings,
  });

  const manualTieBreakWinnerTeamIdByPairKey = useMemo(() => {
    if (!shouldUseManualTieBreakOnStandings) {
      return undefined;
    }

    const filteredResolvedTieBreakOrders = resolvedTieBreakOrders.filter((resolvedTieBreakOrder) => {
      return (
        resolvedTieBreakOrder.sport_id == sportFilter &&
        resolvedTieBreakOrder.naipe == naipeFilter &&
        resolvedTieBreakOrder.team_ids.length >= 2
      );
    });

    if (filteredResolvedTieBreakOrders.length == 0) {
      return undefined;
    }

    const tieBreakWinnerByPairKey = resolveManualTieBreakWinnerTeamIdByPairKey(filteredResolvedTieBreakOrders);

    if (Object.keys(tieBreakWinnerByPairKey).length == 0) {
      return undefined;
    }

    return tieBreakWinnerByPairKey;
  }, [naipeFilter, resolvedTieBreakOrders, shouldUseManualTieBreakOnStandings, sportFilter]);

  const drawWinners = useMemo(() => {
    if (!manualTieBreakWinnerTeamIdByPairKey) {
      return new Set<string>();
    }

    return new Set(Object.values(manualTieBreakWinnerTeamIdByPairKey));
  }, [manualTieBreakWinnerTeamIdByPairKey]);

  const groupOptions = useMemo(() => {
    const filteredOptions = selectedSeasonGroupOptions.filter((groupOption) => {
      const sportMatch = sportFilter == ALL_SPORTS_FILTER || groupOption.sport_id == sportFilter;
      const naipeMatch = naipeFilter == ALL_NAIPES_FILTER || groupOption.naipe == naipeFilter;

      return sportMatch && naipeMatch;
    });

    const uniqueGroups = new Map<string, string>();
    filteredOptions.forEach((groupOption) => {
      const groupLabel = resolveChampionshipGroupLabel(groupOption.group_number);
      uniqueGroups.set(groupLabel, groupLabel);
    });

    return [...uniqueGroups.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((firstGroupOption, secondGroupOption) => firstGroupOption.label.localeCompare(secondGroupOption.label));
  }, [naipeFilter, selectedSeasonGroupOptions, sportFilter]);

  useEffect(() => {
    if (groupFilter == ALL_GROUPS_FILTER) {
      return;
    }

    const selectedGroupExists = groupOptions.some((groupOption) => groupOption.value == groupFilter);
    if (!selectedGroupExists) {
      setGroupFilter(ALL_GROUPS_FILTER);
    }
  }, [groupFilter, groupOptions]);

  useEffect(() => {
    if (!isPlacementFilterDisabled) {
      return;
    }

    if (placementFilter != "all") {
      setPlacementFilter("all");
    }
  }, [isPlacementFilterDisabled, placementFilter]);

  const filteredStandings = useMemo(() => {
    const correctedStandingByKey = correctedGroupStandings.reduce<
      Record<string, { points_base: number; corrected_points: number }>
    >(
      (carry, correctedGroupStanding) => {
        carry[resolveCorrectedStandingKey(correctedGroupStanding)] = {
          points_base: correctedGroupStanding.points_base,
          corrected_points: correctedGroupStanding.corrected_points,
        };
        return carry;
      },
      {},
    );

    const standingsWithCorrectedPoints = standings.map((standing) => {
      return applyCorrectedGroupPointsToStanding(standing, correctedStandingByKey);
    });

    let activeStandings = standingsWithCorrectedPoints;

    if (sportFilter != ALL_SPORTS_FILTER) {
      activeStandings = activeStandings.filter((standing) => standing.sport_id == sportFilter);
    }

    if (naipeFilter != ALL_NAIPES_FILTER) {
      activeStandings = activeStandings.filter((standing) => standing.naipe == naipeFilter);
    }

    const aggregates = aggregateStandingsByTeam(activeStandings, {
      tieBreakerRule: standingsTieBreakerRule,
      headToHeadMatches: standingsHeadToHeadMatches,
      manualTieBreakWinnerTeamIdByPairKey: manualTieBreakWinnerTeamIdByPairKey,
    });

    return filterAggregatesByBracketGroupPlacement(aggregates, {
      groupOptions: selectedSeasonGroupOptions,
      placement:
        resolvedPlacementFilter == "first_per_group"
          ? "first_per_group"
          : resolvedPlacementFilter == "second_per_group"
            ? "second_per_group"
            : "all",
      groupSelectValue: groupFilter,
      allGroupSelectValue: ALL_GROUPS_FILTER,
      sportSelectValue: sportFilter,
      allSportSelectValue: ALL_SPORTS_FILTER,
      naipeSelectValue: naipeFilter,
      allNaipeSelectValue: ALL_NAIPES_FILTER,
      sortOptions: {
        tieBreakerRule: standingsTieBreakerRule,
        headToHeadMatches: standingsHeadToHeadMatches,
        manualTieBreakWinnerTeamIdByPairKey: manualTieBreakWinnerTeamIdByPairKey,
      },
      resolveTieBreakerRuleForSport: (selectedSportId) => {
        const championshipSport = championshipSports.find((sport) => sport.sport_id == selectedSportId);
        return championshipSport?.tie_breaker_rule ?? ChampionshipSportTieBreakerRule.STANDARD;
      },
      finalTieBreakerRule: standingsTieBreakerRule,
    });
  }, [
    championshipSports,
    correctedGroupStandings,
    groupFilter,
    manualTieBreakWinnerTeamIdByPairKey,
    naipeFilter,
    resolvedPlacementFilter,
    selectedSeasonGroupOptions,
    sportFilter,
    standings,
    standingsHeadToHeadMatches,
    standingsTieBreakerRule,
  ]);

  const standingsWithOfficialThirdPlacement = useMemo(() => {
    if (!shouldUseManualTieBreakOnStandings) {
      return {
        adjustedStandings: filteredStandings,
        badgeByTeamKey: {},
      };
    }

    const selectedNaipeFilter = naipeFilter as MatchNaipe;
    const officialThirdPlacements = resolveChampionshipCompetitionPodiums(selectedSeasonBracketView)
      .filter((competitionPodium) => {
        if (
          competitionPodium.sport_id != sportFilter ||
          competitionPodium.naipe != selectedNaipeFilter ||
          competitionPodium.third_place == null
        ) {
          return false;
        }

        if (!selectedChampionship.uses_divisions) {
          return true;
        }

        return competitionPodium.division == divisionFilter;
      })
      .map((competitionPodium) => ({
        team_id: competitionPodium.third_place!.team.team_id,
        division: competitionPodium.division ?? null,
        source: competitionPodium.third_place!.source,
      }));

    return applyOfficialThirdPlacementToStandings(filteredStandings, officialThirdPlacements);
  }, [
    divisionFilter,
    filteredStandings,
    naipeFilter,
    selectedChampionship.uses_divisions,
    selectedSeasonBracketView,
    shouldUseManualTieBreakOnStandings,
    sportFilter,
  ]);

  const isLoading = standingsLoading || correctedStandingsLoading || tieBreaksLoading || finishedMatchesLoading;

  const activeModalidadeConfig = useMemo(() => {
    if (sportFilter == ALL_SPORTS_FILTER) return undefined;

    const activeNaipe = naipeFilter == ALL_NAIPES_FILTER ? null : (naipeFilter as MatchNaipe);
    return resolveModalidadeConfigBySportId(sportFilter, activeNaipe, sports);
  }, [naipeFilter, sportFilter, sports]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SportFilter
          sports={activeSports}
          selected={sportFilter === ALL_SPORTS_FILTER ? null : sportFilter}
          onSelect={(selectedSport) => setSportFilter(selectedSport ?? ALL_SPORTS_FILTER)}
        />
      </div>

      <div className="glass-panel enter-section grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="app-input-field">
              <SelectValue placeholder="Todos os anos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os anos</SelectItem>
              {[...new Set([selectedChampionshipSeasonYear, ...historyYears])]
                .filter((year): year is number => year != null)
                .sort((firstYear, secondYear) => secondYear - firstYear)
                .map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Select value={naipeFilter} onValueChange={setNaipeFilter}>
            <SelectTrigger className="app-input-field">
              <SelectValue placeholder="Todos os naipes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_NAIPES_FILTER}>Todos os naipes</SelectItem>
              <SelectItem value={MatchNaipe.MASCULINO}>Masculino</SelectItem>
              <SelectItem value={MatchNaipe.FEMININO}>Feminino</SelectItem>
              <SelectItem value={MatchNaipe.MISTO}>Misto</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="app-input-field">
              <SelectValue placeholder="Todos os grupos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_GROUPS_FILTER}>Todos os grupos</SelectItem>
              {groupOptions.map((groupOption) => (
                <SelectItem key={groupOption.value} value={groupOption.value}>
                  {groupOption.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedChampionship.uses_divisions && (
          <div>
            <Select value={divisionFilter} onValueChange={(value) => setDivisionFilter(value as TeamDivision)}>
              <SelectTrigger className="app-input-field">
                <SelectValue placeholder="Selecione a divisão" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TeamDivision.DIVISAO_PRINCIPAL}>Série A</SelectItem>
                <SelectItem value={TeamDivision.DIVISAO_ACESSO}>Série B</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {groupOptions.length > 0 && (
          <div>
            <Select value={placementFilter} onValueChange={setPlacementFilter} disabled={isPlacementFilterDisabled}>
              <SelectTrigger
                className={`app-input-field w-full ${
                  isPlacementFilterDisabled ? "cursor-not-allowed opacity-60" : ""
                }`}
              >
                <SelectValue placeholder="Posição na chave" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as equipes</SelectItem>
                <SelectItem value="first_per_group">1º de cada chave (grupo)</SelectItem>
                <SelectItem value="second_per_group">2º de cada chave (grupo)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <TeamStandingsTable
        standings={standingsWithOfficialThirdPlacement.adjustedStandings}
        modalidadeConfig={activeModalidadeConfig}
        isLoading={isLoading}
        variant="full"
        drawWinners={drawWinners}
      />
    </div>
  );
}
