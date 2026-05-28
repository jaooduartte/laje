import { useEffect, useMemo, useState } from "react";
import { Award, Medal, Shuffle, Trophy } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppBadge } from "@/components/ui/app-badge";
import { useStandings } from "@/hooks/useStandings";
import { useMatches } from "@/hooks/useMatches";
import { useChampionshipBracketResolvedTieBreakOrders } from "@/hooks/useChampionshipBracketResolvedTieBreakOrders";
import { useChampionshipCorrectedGroupStandings } from "@/hooks/useChampionshipCorrectedGroupStandings";
import { useChampionshipBracketHistory } from "@/hooks/useChampionshipBracketHistory";
import { useChampionshipAwardsRankings } from "@/hooks/useChampionshipAwardsRankings";
import { resolveChampionshipCompetitionPodiums } from "@/lib/championshipPodium";
import {
  applyOfficialThirdPlacementToStandings,
  aggregateStandingsByTeam,
  applyCorrectedGroupPointsToStanding,
  filterAggregatesByBracketGroupPlacement,
  resolveCorrectedStandingKey,
  resolveManualTieBreakWinnerTeamIdByPairKey,
} from "@/lib/standings";
import { ChampionshipAwardType, ChampionshipCode, ChampionshipSportTieBreakerRule, MatchNaipe, MatchStatus, TeamDivision } from "@/lib/enums";
import { resolveModalidadeConfigBySportId } from "@/lib/modalidadeConfig";
import {
  MATCH_NAIPE_LABELS,
  TEAM_DIVISION_BADGE_TONES,
  TEAM_DIVISION_LABELS,
  resolveChampionshipBracketGroupStageOptions,
  resolveChampionshipGroupLabel,
  resolveMatchNaipeBadgeTone,
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
  availableSeasonYears?: number[];
}

const ALL_SPORTS_FILTER = "all";
const ALL_NAIPES_FILTER = "all";
const ALL_GROUPS_FILTER = "all";

export function AdminStandings({
  selectedChampionship,
  championshipSports,
  sports,
  championshipBracketView,
  availableSeasonYears = [],
}: Props) {
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
    return [...new Set([
      ...availableSeasonYears,
      ...championshipBracketSeasonViews.map((championshipBracketSeasonView) => championshipBracketSeasonView.season_year),
    ])].sort((firstYear, secondYear) => secondYear - firstYear);
  }, [availableSeasonYears, championshipBracketSeasonViews]);

  useEffect(() => {
    if (selectedChampionshipSeasonYear == null) {
      return;
    }

    if (yearFilter == "all") {
      return;
    }

    const parsedYearFilter = Number(yearFilter);
    if (!Number.isFinite(parsedYearFilter)) {
      setYearFilter(String(selectedChampionshipSeasonYear));
      return;
    }

    if (
      parsedYearFilter != selectedChampionshipSeasonYear &&
      !historyYears.includes(parsedYearFilter)
    ) {
      setYearFilter(String(selectedChampionshipSeasonYear));
    }
  }, [historyYears, selectedChampionshipSeasonYear, yearFilter]);

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

  const awardsSeasonYear = correctedYearFilter ?? selectedChampionshipSeasonYear;
  const { rankings: awardsRankings } = useChampionshipAwardsRankings({
    championshipId: selectedChampionship.id,
    seasonYear: awardsSeasonYear,
  });

  const filteredAwardsGroupKeys = useMemo(() => {
    if (!awardsRankings) return [];

    const allGroupKeys = Array.from(new Set([
      ...awardsRankings.top_scorers.map((s) => `${s.naipe}:${s.division ?? "NULL"}`),
      ...awardsRankings.best_goalkeepers.map((g) => `${g.naipe}:${g.division ?? "NULL"}`),
    ])).sort();

    return allGroupKeys.filter((groupKey) => {
      const [groupNaipe, groupDivisionRaw] = groupKey.split(":");
      const groupDivision = groupDivisionRaw === "NULL" ? null : groupDivisionRaw as TeamDivision;

      if (naipeFilter !== ALL_NAIPES_FILTER && groupNaipe !== naipeFilter) {
        return false;
      }

      if (selectedChampionship.uses_divisions && groupDivision !== divisionFilter) {
        return false;
      }

      return true;
    });
  }, [awardsRankings, divisionFilter, naipeFilter, selectedChampionship.uses_divisions]);

  const groupLabelByTeamId = useMemo(() => {
    if (sportFilter == ALL_SPORTS_FILTER || naipeFilter == ALL_NAIPES_FILTER) {
      return undefined;
    }

    const map = new Map<string, string>();
    selectedSeasonGroupOptions
      .filter((group) => group.sport_id == sportFilter && group.naipe == naipeFilter)
      .forEach((group) => {
        group.team_ids.forEach((teamId) => {
          map.set(teamId, resolveChampionshipGroupLabel(group.group_number));
        });
      });

    return map.size > 0 ? map : undefined;
  }, [naipeFilter, selectedSeasonGroupOptions, sportFilter]);

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
                <SelectItem value={TeamDivision.DIVISAO_PRINCIPAL}>Divisão Principal</SelectItem>
                <SelectItem value={TeamDivision.DIVISAO_ACESSO}>Divisão de Acesso</SelectItem>
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
        groupLabelByTeamId={groupLabelByTeamId}
      />

      {awardsRankings && selectedChampionship.code === ChampionshipCode.SOCIETY ? (
        <div className="glass-card enter-section space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Premiações individuais</p>
            <p className="text-xs text-muted-foreground">
              Pendências: <span className="font-semibold text-foreground">{awardsRankings.pending_matches_count}</span>
            </p>
          </div>

          {filteredAwardsGroupKeys.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem dados de premiações registrados até o momento.</p>
          ) : (
            <div className="space-y-3">
              {filteredAwardsGroupKeys.map((groupKey) => {
                const [groupNaipe, groupDivisionRaw] = groupKey.split(":");
                const groupDivision = groupDivisionRaw === "NULL" ? null : groupDivisionRaw as TeamDivision;
                const naipe = groupNaipe as MatchNaipe;

                const scorerDrawResult = awardsRankings.award_draw_results?.find(
                  (r) => r.award_type === ChampionshipAwardType.TOP_SCORER && r.naipe === naipe && (r.division ?? "NULL") === (groupDivision ?? "NULL"),
                );
                const goalkeeperDrawResult = awardsRankings.award_draw_results?.find(
                  (r) => r.award_type === ChampionshipAwardType.BEST_GOALKEEPER && r.naipe === naipe && (r.division ?? "NULL") === (groupDivision ?? "NULL"),
                );

                const groupScorers = [...awardsRankings.top_scorers]
                  .filter((s) => s.naipe === naipe && (s.division ?? "NULL") === (groupDivision ?? "NULL"))
                  .sort((a, b) => {
                    const goalsDiff = b.goals - a.goals;
                    if (goalsDiff !== 0) return goalsDiff;
                    // Empate nos gols: vencedor do sorteio aparece primeiro
                    const aIsWinner = scorerDrawResult?.winner_player_id === a.player_id;
                    const bIsWinner = scorerDrawResult?.winner_player_id === b.player_id;
                    if (aIsWinner && !bIsWinner) return -1;
                    if (!aIsWinner && bIsWinner) return 1;
                    return a.player_name.localeCompare(b.player_name);
                  })
                  .slice(0, 3);

                const groupGoalkeepers = [...awardsRankings.best_goalkeepers]
                  .filter((g) => g.naipe === naipe && (g.division ?? "NULL") === (groupDivision ?? "NULL"))
                  .sort((a, b) => {
                    const goalsDiff = a.goals_against - b.goals_against;
                    if (goalsDiff !== 0) return goalsDiff;
                    // Mesmo número de gols sofridos: vencedor do sorteio tem prioridade máxima
                    const aIsWinner = goalkeeperDrawResult?.winner_player_id === a.player_id;
                    const bIsWinner = goalkeeperDrawResult?.winner_player_id === b.player_id;
                    if (aIsWinner && !bIsWinner) return -1;
                    if (!aIsWinner && bIsWinner) return 1;
                    const matchesDiff = b.matches_count - a.matches_count;
                    if (matchesDiff !== 0) return matchesDiff;
                    return a.player_name.localeCompare(b.player_name);
                  })
                  .slice(0, 3);

                const medalIcon = (index: number) => index === 0
                  ? <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  : index === 1
                  ? <Medal className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  : <Award className="h-3.5 w-3.5 shrink-0 text-orange-400" />;

                return (
                  <div key={groupKey} className="app-card-muted space-y-3 p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <AppBadge tone={resolveMatchNaipeBadgeTone(naipe)}>
                        {MATCH_NAIPE_LABELS[naipe]}
                      </AppBadge>
                      {groupDivision ? (
                        <AppBadge tone={TEAM_DIVISION_BADGE_TONES[groupDivision]}>
                          {TEAM_DIVISION_LABELS[groupDivision]}
                        </AppBadge>
                      ) : null}
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Artilheiros</p>
                        {groupScorers.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sem gols registrados.</p>
                        ) : (
                          <ol className="space-y-1.5">
                            {(() => {
                              const winnerScorerGoals = groupScorers.find((s) => s.player_id === scorerDrawResult?.winner_player_id)?.goals;
                              return groupScorers.map((scorer, i) => {
                                const isDrawWinner = scorerDrawResult?.winner_player_id === scorer.player_id;
                                const isInDraw = !!scorerDrawResult && winnerScorerGoals !== undefined && scorer.goals === winnerScorerGoals;
                                return (
                                  <li key={`${scorer.player_id}:${scorer.naipe}:${scorer.division ?? "NULL"}`} className="flex items-center gap-2 text-sm">
                                    <span className="flex min-w-0 flex-1 items-center gap-2">
                                      {medalIcon(i)}
                                      <span className="min-w-0 truncate font-medium">{scorer.player_name}</span>
                                      {isInDraw && (
                                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${isDrawWinner ? "border-primary/30 bg-primary/10 text-primary" : "border-muted-foreground/20 bg-secondary text-muted-foreground"}`}>
                                          <Shuffle className="h-3 w-3" />
                                          {isDrawWinner ? "Vencedor do sorteio" : "Sorteio"}
                                        </span>
                                      )}
                                    </span>
                                    <span className="flex-1 text-center text-xs text-muted-foreground">{scorer.team_name}</span>
                                    <span className="flex-1 text-right text-xs font-semibold tabular-nums">
                                      {scorer.goals} {scorer.goals === 1 ? "gol" : "gols"}
                                    </span>
                                  </li>
                                );
                              });
                            })()}
                          </ol>
                        )}
                      </div>

                      <hr className="border-border" />

                      <div className="space-y-1.5">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Melhores goleiros</p>
                        {groupGoalkeepers.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sem registros elegíveis.</p>
                        ) : (
                          <ol className="space-y-1.5">
                            {(() => {
                              const winnerGoalkeeperGoalsAgainst = groupGoalkeepers.find((g) => g.player_id === goalkeeperDrawResult?.winner_player_id)?.goals_against;
                              return groupGoalkeepers.map((goalkeeper, i) => {
                                const isDrawWinner = goalkeeperDrawResult?.winner_player_id === goalkeeper.player_id;
                                const isInDraw = !!goalkeeperDrawResult && winnerGoalkeeperGoalsAgainst !== undefined && goalkeeper.goals_against === winnerGoalkeeperGoalsAgainst;
                                return (
                                  <li key={`${goalkeeper.player_id}:${goalkeeper.naipe}:${goalkeeper.division ?? "NULL"}`} className="flex items-center gap-2 text-sm">
                                    <span className="flex min-w-0 flex-1 items-center gap-2">
                                      {medalIcon(i)}
                                      <span className="min-w-0 truncate font-medium">{goalkeeper.player_name}</span>
                                      {isInDraw && (
                                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${isDrawWinner ? "border-primary/30 bg-primary/10 text-primary" : "border-muted-foreground/20 bg-secondary text-muted-foreground"}`}>
                                          <Shuffle className="h-3 w-3" />
                                          {isDrawWinner ? "Vencedor do sorteio" : "Sorteio"}
                                        </span>
                                      )}
                                    </span>
                                    <span className="flex-1 text-center text-xs text-muted-foreground">{goalkeeper.team_name}</span>
                                    <span className="flex-1 text-right text-xs font-semibold tabular-nums">
                                      {goalkeeper.goals_against} {goalkeeper.goals_against === 1 ? "gol sofrido" : "gols sofridos"}
                                    </span>
                                  </li>
                                );
                              });
                            })()}
                          </ol>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
