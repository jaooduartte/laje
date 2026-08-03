import { useEffect, useMemo, useState } from "react";
import { Award, Loader2, Medal, ShieldAlert, Shuffle, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AppBadge } from "@/components/ui/app-badge";
import { useAuth } from "@/hooks/useAuth";
import { useStandings } from "@/hooks/useStandings";
import { useMatches } from "@/hooks/useMatches";
import { useChampionshipBracketResolvedTieBreakOrders } from "@/hooks/useChampionshipBracketResolvedTieBreakOrders";
import { useChampionshipCorrectedGroupStandings } from "@/hooks/useChampionshipCorrectedGroupStandings";
import { useChampionshipBracketHistory } from "@/hooks/useChampionshipBracketHistory";
import { useCompetitionTeamDisqualifications } from "@/hooks/useCompetitionTeamDisqualifications";
import { useChampionshipSeasonRuntime } from "@/hooks/useChampionshipSeasonRuntime";
import { supabase } from "@/integrations/supabase/client";
import {
  compareAwardsRankingGoalScorers,
  useChampionshipAwardsRankings,
} from "@/hooks/useChampionshipAwardsRankings";
import { replaceChampionshipSeasonDivisionMovements } from "@/domain/championship-seasons/championshipSeason.repository";
import { resolveChampionshipCompetitionPodiums } from "@/lib/championshipPodium";
import {
  applyOfficialThirdPlacementToStandings,
  aggregateStandingsByTeam,
  applyCorrectedGroupPointsToStanding,
  filterAggregatesByBracketGroupPlacement,
  moveDisqualifiedStandingsToBottom,
  resolveCorrectedStandingKey,
  resolveManualTieBreakWinnerTeamIdByPairKey,
  resolveTeamStandingAggregateKey,
} from "@/lib/standings";
import {
  AppBadgeTone,
  ChampionshipAwardType,
  ChampionshipCode,
  ChampionshipSeasonDivisionSettlementMode,
  ChampionshipSportTieBreakerRule,
  MatchNaipe,
  MatchStatus,
  TeamDivision,
} from "@/lib/enums";
import {
  type ChampionshipSeasonDivisionMovementPreview,
  type ChampionshipSeasonSettingsShape,
  resolveChampionshipOverallSeasonStandings,
  resolveSeasonDivisionMovementPreview,
} from "@/lib/championshipSeason";
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
import { IndividualSportStandingsTable } from "@/components/IndividualSportStandingsTable";
import { isIndividualSportId } from "@/lib/individualEvents";
import type {
  Championship,
  ChampionshipBracketView,
  ChampionshipSport,
  CompetitionTeamDisqualification,
  Sport,
} from "@/lib/types";
import { SportFilter } from "@/components/SportFilter";

interface Props {
  selectedChampionship: Championship;
  championshipSports: ChampionshipSport[];
  sports: Sport[];
  championshipBracketView: ChampionshipBracketView;
  availableSeasonYears?: number[];
  onRefetchTeams?: () => void | Promise<void>;
}

const ALL_SPORTS_FILTER = "all";
const ALL_NAIPES_FILTER = "all";
const ALL_GROUPS_FILTER = "all";
const EMPTY_DISQUALIFICATION_FILTER = "";
const DIVISION_MOVEMENT_RULE_LABELS: Record<string, string> = {
  TOP_N_TO_PRINCIPAL: "Top colocadas para a principal",
  PROMOTED_FROM_ACCESS: "Acesso promovida",
  RELEGATED_FROM_PRINCIPAL: "Principal rebaixada",
};

function resolveDivisionMovementSummary(seasonSettings: ChampionshipSeasonSettingsShape): string {
  if (seasonSettings.division_settlement_mode == ChampionshipSeasonDivisionSettlementMode.TOP_N_TO_PRINCIPAL) {
    return `Os ${seasonSettings.principal_slots_count ?? 0} primeiros da geral irão para a divisão principal.`;
  }

  if (seasonSettings.division_settlement_mode == ChampionshipSeasonDivisionSettlementMode.PROMOTION_RELEGATION) {
    return `${seasonSettings.access_promotion_count ?? 0} sobem do acesso e ${seasonSettings.principal_relegation_count ?? 0} caem da principal.`;
  }

  return "Não há movimentação sazonal configurada para este campeonato.";
}

export function AdminStandings({
  selectedChampionship,
  championshipSports,
  sports,
  championshipBracketView,
  availableSeasonYears = [],
  onRefetchTeams = () => {},
}: Props) {
  const { user } = useAuth();
  const [sportFilter, setSportFilter] = useState<string>(ALL_SPORTS_FILTER);
  const [naipeFilter, setNaipeFilter] = useState<string>(ALL_NAIPES_FILTER);
  const [groupFilter, setGroupFilter] = useState<string>(ALL_GROUPS_FILTER);
  const [divisionFilter, setDivisionFilter] = useState<TeamDivision>(TeamDivision.DIVISAO_PRINCIPAL);
  const [placementFilter, setPlacementFilter] = useState<string>("all");
  const [isDisqualificationDialogOpen, setIsDisqualificationDialogOpen] = useState(false);
  const [disqualificationYearFilter, setDisqualificationYearFilter] = useState<string>("");
  const [disqualificationSportFilter, setDisqualificationSportFilter] = useState<string>(EMPTY_DISQUALIFICATION_FILTER);
  const [disqualificationNaipeFilter, setDisqualificationNaipeFilter] = useState<string>(EMPTY_DISQUALIFICATION_FILTER);
  const [disqualificationDivisionFilter, setDisqualificationDivisionFilter] = useState<string>(EMPTY_DISQUALIFICATION_FILTER);
  const [selectedDisqualificationTeamId, setSelectedDisqualificationTeamId] = useState<string>("");
  const [isSavingDisqualification, setIsSavingDisqualification] = useState(false);
  const [isDivisionMovementDialogOpen, setIsDivisionMovementDialogOpen] = useState(false);
  const [isPreparingDivisionMovementPreview, setIsPreparingDivisionMovementPreview] = useState(false);
  const [isApplyingDivisionMovements, setIsApplyingDivisionMovements] = useState(false);

  const selectedChampionshipSeasonYear = selectedChampionship?.current_season_year ?? null;
  const [yearFilter, setYearFilter] = useState<string>(
    selectedChampionshipSeasonYear != null ? String(selectedChampionshipSeasonYear) : "all",
  );
  const correctedYearFilter = yearFilter === "all" ? null : Number(yearFilter);
  const displayedSeasonYear = correctedYearFilter ?? selectedChampionshipSeasonYear;
  const selectedDisqualificationSeasonYear = useMemo(() => {
    const parsedYear = Number(disqualificationYearFilter);
    return Number.isFinite(parsedYear) ? parsedYear : null;
  }, [disqualificationYearFilter]);

  const seasonYearsForBracketHistory = useMemo(() => {
    return [...new Set([
      selectedChampionshipSeasonYear,
      correctedYearFilter,
      ...availableSeasonYears,
    ])].filter((seasonYear): seasonYear is number => seasonYear != null && Number.isFinite(seasonYear));
  }, [availableSeasonYears, correctedYearFilter, selectedChampionshipSeasonYear]);

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

  const {
    resolvedSeasonSettings,
    loading: seasonSettingsLoading,
    usesDivisions: championshipUsesDivisions,
  } = useChampionshipSeasonRuntime({
    championship: selectedChampionship,
    seasonYear: displayedSeasonYear,
  });

  const disqualificationSeasonYears = useMemo(() => {
    return [...new Set([selectedChampionshipSeasonYear, ...historyYears])]
      .filter((year): year is number => year != null)
      .sort((firstYear, secondYear) => secondYear - firstYear);
  }, [historyYears, selectedChampionshipSeasonYear]);

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

  const { standings, loading: standingsLoading, refetch: refetchDisplayedStandings } = useStandings({
    championshipId: selectedChampionship.id,
    seasonYear: correctedYearFilter,
    division: championshipUsesDivisions ? divisionFilter : null,
  });

  const {
    standings: seasonClosureStandings,
    loading: seasonClosureStandingsLoading,
    refetch: refetchSeasonClosureStandings,
  } = useStandings({
    championshipId: selectedChampionship.id,
    seasonYear: selectedChampionshipSeasonYear,
  });

  const { correctedGroupStandings, loading: correctedStandingsLoading } = useChampionshipCorrectedGroupStandings({
    championshipId: selectedChampionship.id,
    seasonYear: correctedYearFilter,
  });
  const { correctedGroupStandings: seasonClosureCorrectedGroupStandings } = useChampionshipCorrectedGroupStandings({
    championshipId: selectedChampionship.id,
    seasonYear: selectedChampionshipSeasonYear,
  });
  const {
    disqualifications: competitionDisqualifications,
    refetch: refetchCompetitionDisqualifications,
  } = useCompetitionTeamDisqualifications({
    championshipId: selectedChampionship.id,
    seasonYears: [...new Set([
      correctedYearFilter,
      selectedChampionshipSeasonYear,
      selectedDisqualificationSeasonYear,
    ])].filter((seasonYear): seasonYear is number => seasonYear != null && Number.isFinite(seasonYear)),
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

  const visibleCompetitionDisqualifications = useMemo(() => {
    return competitionDisqualifications.filter((disqualification) => {
      if (sportFilter != ALL_SPORTS_FILTER && disqualification.sport_id != sportFilter) {
        return false;
      }

      if (naipeFilter != ALL_NAIPES_FILTER && disqualification.naipe != naipeFilter) {
        return false;
      }

      if (championshipUsesDivisions && disqualification.division != divisionFilter) {
        return false;
      }

      return true;
    });
  }, [
    competitionDisqualifications,
    divisionFilter,
    naipeFilter,
    championshipUsesDivisions,
    sportFilter,
  ]);

  const visibleCompetitionDisqualifiedTeamKeys = useMemo(() => {
    if (visibleCompetitionDisqualifications.length == 0) {
      return undefined;
    }

    return new Set(
      visibleCompetitionDisqualifications.map((disqualification) => resolveTeamStandingAggregateKey(disqualification)),
    );
  }, [visibleCompetitionDisqualifications]);

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
    const aggregatesWithDisqualificationOrder = moveDisqualifiedStandingsToBottom(
      aggregates,
      visibleCompetitionDisqualifiedTeamKeys,
    );

    return filterAggregatesByBracketGroupPlacement(aggregatesWithDisqualificationOrder, {
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
      pinnedBottomTeamKeys: visibleCompetitionDisqualifiedTeamKeys,
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
    visibleCompetitionDisqualifiedTeamKeys,
  ]);

  const isIndividualStandingsView = useMemo(() => {
    return sportFilter != ALL_SPORTS_FILTER && isIndividualSportId(sportFilter, sports);
  }, [sportFilter, sports]);

  const filteredIndividualStandingsRows = useMemo(() => {
    if (!isIndividualStandingsView) {
      return [];
    }

    return standings.filter((standing) => {
      if (standing.sport_id != sportFilter) {
        return false;
      }

      if (naipeFilter != ALL_NAIPES_FILTER && standing.naipe != naipeFilter) {
        return false;
      }

      if (championshipUsesDivisions && standing.division != divisionFilter) {
        return false;
      }

      return standing.is_individual_sport == true;
    });
  }, [championshipUsesDivisions, divisionFilter, isIndividualStandingsView, naipeFilter, sportFilter, standings]);

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

        if (!championshipUsesDivisions) {
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
    championshipUsesDivisions,
    selectedSeasonBracketView,
    shouldUseManualTieBreakOnStandings,
    sportFilter,
  ]);

  const disqualificationBracketView = useMemo(() => {
    if (selectedDisqualificationSeasonYear == null) {
      return championshipBracketView;
    }

    if (selectedDisqualificationSeasonYear == selectedChampionshipSeasonYear) {
      return championshipBracketView;
    }

    const selectedSeasonView = championshipBracketSeasonViews.find((seasonBracketView) => {
      return seasonBracketView.season_year == selectedDisqualificationSeasonYear;
    });

    return selectedSeasonView?.championship_bracket_view ?? championshipBracketView;
  }, [
    championshipBracketSeasonViews,
    championshipBracketView,
    selectedChampionshipSeasonYear,
    selectedDisqualificationSeasonYear,
  ]);

  const disqualificationCompetitionOptions = useMemo(() => {
    return disqualificationBracketView.competitions;
  }, [disqualificationBracketView.competitions]);

  const disqualificationSportOptions = useMemo(() => {
    const uniqueSports = new Map<string, string>();

    disqualificationCompetitionOptions.forEach((competition) => {
      uniqueSports.set(competition.sport_id, competition.sport_name);
    });

    return [...uniqueSports.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((firstOption, secondOption) => firstOption.label.localeCompare(secondOption.label, "pt-BR", { sensitivity: "base" }));
  }, [disqualificationCompetitionOptions]);

  const disqualificationNaipeOptions = useMemo(() => {
    if (disqualificationSportFilter == EMPTY_DISQUALIFICATION_FILTER) {
      return [];
    }

    return [...new Set(
      disqualificationCompetitionOptions
        .filter((competition) => competition.sport_id == disqualificationSportFilter)
        .map((competition) => competition.naipe),
    )];
  }, [disqualificationCompetitionOptions, disqualificationSportFilter]);

  const disqualificationDivisionOptions = useMemo(() => {
    if (
      disqualificationSportFilter == EMPTY_DISQUALIFICATION_FILTER ||
      disqualificationNaipeFilter == EMPTY_DISQUALIFICATION_FILTER
    ) {
      return [];
    }

    return [...new Set(
      disqualificationCompetitionOptions
        .filter((competition) => {
          return competition.sport_id == disqualificationSportFilter && competition.naipe == disqualificationNaipeFilter;
        })
        .map((competition) => competition.division)
        .filter((division): division is TeamDivision => division != null),
    )];
  }, [disqualificationCompetitionOptions, disqualificationNaipeFilter, disqualificationSportFilter]);

  const selectedDisqualificationCompetition = useMemo(() => {
    if (
      disqualificationSportFilter == EMPTY_DISQUALIFICATION_FILTER ||
      disqualificationNaipeFilter == EMPTY_DISQUALIFICATION_FILTER
    ) {
      return null;
    }

    return disqualificationCompetitionOptions.find((competition) => {
      if (
        competition.sport_id != disqualificationSportFilter ||
        competition.naipe != disqualificationNaipeFilter
      ) {
        return false;
      }

      if (!championshipUsesDivisions) {
        return true;
      }

      return competition.division == (disqualificationDivisionFilter || null);
    }) ?? null;
  }, [
    disqualificationCompetitionOptions,
    disqualificationDivisionFilter,
    disqualificationNaipeFilter,
    disqualificationSportFilter,
    championshipUsesDivisions,
  ]);

  const selectedCompetitionDisqualifications = useMemo(() => {
    if (!selectedDisqualificationCompetition) {
      return [];
    }

    return competitionDisqualifications.filter((disqualification) => {
      return (
        disqualification.sport_id == selectedDisqualificationCompetition.sport_id &&
        disqualification.naipe == selectedDisqualificationCompetition.naipe &&
        disqualification.division == selectedDisqualificationCompetition.division
      );
    });
  }, [competitionDisqualifications, selectedDisqualificationCompetition]);

  const availableDisqualificationTeams = useMemo(() => {
    if (!selectedDisqualificationCompetition) {
      return [];
    }

    const disqualifiedTeamIds = new Set(selectedCompetitionDisqualifications.map((disqualification) => disqualification.team_id));

    return selectedDisqualificationCompetition.groups
      .flatMap((group) => group.teams)
      .filter((team, teamIndex, teams) => {
        if (disqualifiedTeamIds.has(team.team_id)) {
          return false;
        }

        return teams.findIndex((candidateTeam) => candidateTeam.team_id == team.team_id) == teamIndex;
      })
      .sort((firstTeam, secondTeam) => firstTeam.team_name.localeCompare(secondTeam.team_name, "pt-BR", { sensitivity: "base" }));
  }, [selectedCompetitionDisqualifications, selectedDisqualificationCompetition]);

  const seasonClosureCorrectedStandingByKey = useMemo(() => {
    return seasonClosureCorrectedGroupStandings.reduce<
      Record<string, { points_base: number; corrected_points: number }>
    >((carry, correctedGroupStanding) => {
      carry[resolveCorrectedStandingKey(correctedGroupStanding)] = {
        points_base: correctedGroupStanding.points_base,
        corrected_points: correctedGroupStanding.corrected_points,
      };
      return carry;
    }, {});
  }, [seasonClosureCorrectedGroupStandings]);

  const seasonClosureCompetitionDisqualifications = useMemo(() => {
    if (selectedChampionshipSeasonYear == null) {
      return [];
    }

    return competitionDisqualifications.filter((disqualification) => {
      return disqualification.season_year == selectedChampionshipSeasonYear;
    });
  }, [competitionDisqualifications, selectedChampionshipSeasonYear]);

  const seasonClosureDisqualifiedTeamKeys = useMemo(() => {
    if (seasonClosureCompetitionDisqualifications.length == 0) {
      return undefined;
    }

    return new Set(
      seasonClosureCompetitionDisqualifications.map((disqualification) => resolveTeamStandingAggregateKey(disqualification)),
    );
  }, [seasonClosureCompetitionDisqualifications]);

  const overallSeasonStandings = useMemo(() => {
    if (selectedChampionshipSeasonYear == null) {
      return [];
    }

    return resolveChampionshipOverallSeasonStandings({
      standings: seasonClosureStandings,
      correctedStandingsByKey: seasonClosureCorrectedStandingByKey,
      disqualifiedTeamKeys: seasonClosureDisqualifiedTeamKeys,
    });
  }, [
    seasonClosureCorrectedStandingByKey,
    seasonClosureDisqualifiedTeamKeys,
    seasonClosureStandings,
    selectedChampionshipSeasonYear,
  ]);

  const seasonDivisionMovementPreview = useMemo<ChampionshipSeasonDivisionMovementPreview[]>(() => {
    return resolveSeasonDivisionMovementPreview({
      seasonSettings: resolvedSeasonSettings,
      standings: overallSeasonStandings,
    }).filter((movement) => movement.previous_division != movement.next_division);
  }, [overallSeasonStandings, resolvedSeasonSettings]);

  const canPreviewDivisionMovements =
    selectedChampionshipSeasonYear != null &&
    resolvedSeasonSettings.division_settlement_mode != ChampionshipSeasonDivisionSettlementMode.NONE;
  const divisionMovementSummary = useMemo(() => {
    return resolveDivisionMovementSummary(resolvedSeasonSettings);
  }, [resolvedSeasonSettings]);

  useEffect(() => {
    if (disqualificationSeasonYears.length == 0) {
      return;
    }

    if (disqualificationSeasonYears.some((year) => String(year) == disqualificationYearFilter)) {
      return;
    }

    const fallbackYear = correctedYearFilter ?? selectedChampionshipSeasonYear ?? disqualificationSeasonYears[0];
    setDisqualificationYearFilter(String(fallbackYear));
  }, [correctedYearFilter, disqualificationSeasonYears, disqualificationYearFilter, selectedChampionshipSeasonYear]);

  useEffect(() => {
    if (disqualificationSportOptions.length == 0) {
      setDisqualificationSportFilter(EMPTY_DISQUALIFICATION_FILTER);
      return;
    }

    if (disqualificationSportOptions.some((option) => option.value == disqualificationSportFilter)) {
      return;
    }

    setDisqualificationSportFilter(EMPTY_DISQUALIFICATION_FILTER);
  }, [disqualificationSportFilter, disqualificationSportOptions]);

  useEffect(() => {
    if (disqualificationNaipeOptions.length == 0) {
      setDisqualificationNaipeFilter(EMPTY_DISQUALIFICATION_FILTER);
      return;
    }

    if (disqualificationNaipeOptions.includes(disqualificationNaipeFilter as MatchNaipe)) {
      return;
    }

    setDisqualificationNaipeFilter(EMPTY_DISQUALIFICATION_FILTER);
  }, [disqualificationNaipeFilter, disqualificationNaipeOptions]);

  useEffect(() => {
    if (!championshipUsesDivisions) {
      if (disqualificationDivisionFilter != EMPTY_DISQUALIFICATION_FILTER) {
        setDisqualificationDivisionFilter(EMPTY_DISQUALIFICATION_FILTER);
      }
      return;
    }

    if (disqualificationDivisionOptions.length == 0) {
      setDisqualificationDivisionFilter(EMPTY_DISQUALIFICATION_FILTER);
      return;
    }

    if (disqualificationDivisionOptions.includes(disqualificationDivisionFilter as TeamDivision)) {
      return;
    }

    setDisqualificationDivisionFilter(EMPTY_DISQUALIFICATION_FILTER);
  }, [
    disqualificationDivisionFilter,
    disqualificationDivisionOptions,
    championshipUsesDivisions,
  ]);

  useEffect(() => {
    if (availableDisqualificationTeams.length == 0) {
      setSelectedDisqualificationTeamId("");
      return;
    }

    if (availableDisqualificationTeams.some((team) => team.team_id == selectedDisqualificationTeamId)) {
      return;
    }

    setSelectedDisqualificationTeamId("");
  }, [availableDisqualificationTeams, selectedDisqualificationTeamId]);

  const isLoading = standingsLoading || correctedStandingsLoading || tieBreaksLoading || finishedMatchesLoading;

  const awardsSeasonYear = correctedYearFilter ?? selectedChampionshipSeasonYear;
  const shouldLoadAwardsRankings = selectedChampionship.code == ChampionshipCode.SOCIETY;
  const { rankings: awardsRankings } = useChampionshipAwardsRankings({
    championshipId: shouldLoadAwardsRankings ? selectedChampionship.id : null,
    seasonYear: shouldLoadAwardsRankings ? awardsSeasonYear : null,
  });

  const formatDefenseAverage = (value: number) => value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const filteredAwardsGroupKeys = useMemo(() => {
    if (!awardsRankings) return [];

    const allGroupKeys = Array.from(new Set([
      ...awardsRankings.top_scorers.map((s) => `${s.naipe}:${s.division ?? "NULL"}`),
      ...awardsRankings.best_defenses.map((g) => `${g.naipe}:${g.division ?? "NULL"}`),
    ])).sort();

    return allGroupKeys.filter((groupKey) => {
      const [groupNaipe, groupDivisionRaw] = groupKey.split(":");
      const groupDivision = groupDivisionRaw === "NULL" ? null : groupDivisionRaw as TeamDivision;

      if (naipeFilter !== ALL_NAIPES_FILTER && groupNaipe !== naipeFilter) {
        return false;
      }

      if (championshipUsesDivisions && groupDivision !== divisionFilter) {
        return false;
      }

      return true;
    });
  }, [awardsRankings, championshipUsesDivisions, divisionFilter, naipeFilter]);

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

  function handleOpenDisqualificationDialog() {
    const fallbackYear = correctedYearFilter ?? selectedChampionshipSeasonYear ?? disqualificationSeasonYears[0];

    setDisqualificationYearFilter(fallbackYear != null ? String(fallbackYear) : "");
    setDisqualificationSportFilter(EMPTY_DISQUALIFICATION_FILTER);
    setDisqualificationNaipeFilter(EMPTY_DISQUALIFICATION_FILTER);
    setDisqualificationDivisionFilter(EMPTY_DISQUALIFICATION_FILTER);
    setSelectedDisqualificationTeamId("");
    setIsDisqualificationDialogOpen(true);
  }

  async function handleOpenDivisionMovementDialog() {
    if (
      selectedChampionshipSeasonYear == null ||
      isPreparingDivisionMovementPreview ||
      isApplyingDivisionMovements
    ) {
      return;
    }

    if (seasonDivisionMovementPreview.length == 0) {
      toast.info("Nenhuma mudança de divisão foi identificada com a classificação atual.");
      return;
    }

    setIsPreparingDivisionMovementPreview(true);

    try {
      const { error } = await replaceChampionshipSeasonDivisionMovements({
        championshipId: selectedChampionship.id,
        seasonYear: selectedChampionshipSeasonYear,
        payload: seasonDivisionMovementPreview.map((movement) => ({
          championship_id: selectedChampionship.id,
          season_year: selectedChampionshipSeasonYear,
          team_id: movement.team_id,
          previous_division: movement.previous_division,
          next_division: movement.next_division,
          source_division: movement.source_division,
          ranking_position: movement.ranking_position,
          rule_code: movement.rule_code,
          confirmed_by: null,
          confirmed_at: null,
        })),
      });

      if (error) {
        toast.error("Não foi possível preparar a prévia de movimentação.");
        return;
      }

      setIsDivisionMovementDialogOpen(true);
    } finally {
      setIsPreparingDivisionMovementPreview(false);
    }
  }

  async function handleConfirmDisqualification() {
    if (
      !selectedDisqualificationCompetition ||
      selectedDisqualificationSeasonYear == null ||
      !selectedDisqualificationTeamId ||
      isSavingDisqualification
    ) {
      return;
    }

    const selectedTeam = availableDisqualificationTeams.find((team) => team.team_id == selectedDisqualificationTeamId) ?? null;

    if (!selectedTeam) {
      toast.error("Selecione uma atlética participante válida.");
      return;
    }

    setIsSavingDisqualification(true);

    try {
      const { error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
      }).rpc("disqualify_championship_team_competition", {
        _championship_id: selectedChampionship.id,
        _season_year: selectedDisqualificationSeasonYear,
        _sport_id: selectedDisqualificationCompetition.sport_id,
        _naipe: selectedDisqualificationCompetition.naipe,
        _division: selectedDisqualificationCompetition.division,
        _team_id: selectedTeam.team_id,
      });

      if (error) {
        toast.error("Não foi possível desclassificar a atlética.");
        return;
      }

      toast.success(`Atlética ${selectedTeam.team_name} desclassificada com sucesso.`);
      setIsDisqualificationDialogOpen(false);
      await refetchCompetitionDisqualifications();
    } finally {
      setIsSavingDisqualification(false);
    }
  }

  async function handleApplyDivisionMovements() {
    if (
      selectedChampionshipSeasonYear == null ||
      seasonDivisionMovementPreview.length == 0 ||
      isApplyingDivisionMovements
    ) {
      return;
    }

    setIsApplyingDivisionMovements(true);

    try {
      for (const movement of seasonDivisionMovementPreview) {
        const { error } = await supabase
          .from("teams")
          .update({ division: movement.next_division })
          .eq("id", movement.team_id);

        if (error) {
          throw error;
        }
      }

      const confirmedAt = new Date().toISOString();
      const { error } = await replaceChampionshipSeasonDivisionMovements({
        championshipId: selectedChampionship.id,
        seasonYear: selectedChampionshipSeasonYear,
        payload: seasonDivisionMovementPreview.map((movement) => ({
          championship_id: selectedChampionship.id,
          season_year: selectedChampionshipSeasonYear,
          team_id: movement.team_id,
          previous_division: movement.previous_division,
          next_division: movement.next_division,
          source_division: movement.source_division,
          ranking_position: movement.ranking_position,
          rule_code: movement.rule_code,
          confirmed_by: user?.id ?? null,
          confirmed_at: confirmedAt,
        })),
      });

      if (error) {
        throw error;
      }

      await Promise.all([
        refetchDisplayedStandings(),
        refetchSeasonClosureStandings(),
        refetchCompetitionDisqualifications(),
        Promise.resolve(onRefetchTeams()),
      ]);

      setIsDivisionMovementDialogOpen(false);
      toast.success("Movimentação de divisões aplicada com sucesso.");
    } catch (error) {
      console.error("Erro ao aplicar movimentação de divisões:", error);
      toast.error("Não foi possível aplicar a movimentação de divisões.");
    } finally {
      setIsApplyingDivisionMovements(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="glass-card enter-section flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Ações da competição</p>
          <p className="text-xs text-muted-foreground">
            Desclassifique atléticas e confirme a movimentação sazonal usando a classificação oficial final da temporada.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {canPreviewDivisionMovements ? (
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => void handleOpenDivisionMovementDialog()}
              disabled={
                isPreparingDivisionMovementPreview ||
                isApplyingDivisionMovements ||
                seasonSettingsLoading ||
                seasonClosureStandingsLoading
              }
            >
              {isPreparingDivisionMovementPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
              Prévia de divisões
            </Button>
          ) : null}

          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={handleOpenDisqualificationDialog}
          >
            <ShieldAlert className="h-4 w-4" />
            Desclassificar atlética
          </Button>
        </div>
      </div>

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

        {championshipUsesDivisions && (
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

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Classificação por competição</p>
            <p className="text-xs text-muted-foreground">
              A tabela abaixo continua respeitando os filtros aplicados para leitura da classificação.
            </p>
          </div>
        </div>

        {isIndividualStandingsView ? (
          <IndividualSportStandingsTable standings={filteredIndividualStandingsRows} isLoading={isLoading} />
        ) : (
          <TeamStandingsTable
            standings={standingsWithOfficialThirdPlacement.adjustedStandings}
            modalidadeConfig={activeModalidadeConfig}
            isLoading={isLoading}
            variant="full"
            drawWinners={drawWinners}
            groupLabelByTeamId={groupLabelByTeamId}
            disqualifiedTeamKeys={visibleCompetitionDisqualifiedTeamKeys}
          />
        )}
      </div>

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
                const defenseDrawResult = awardsRankings.award_draw_results?.find(
                  (r) => r.award_type === ChampionshipAwardType.BEST_GOALKEEPER && r.naipe === naipe && (r.division ?? "NULL") === (groupDivision ?? "NULL"),
                );

                const groupScorers = [...awardsRankings.top_scorers]
                  .filter((s) => {
                    if (s.naipe !== naipe || (s.division ?? "NULL") !== (groupDivision ?? "NULL")) {
                      return false;
                    }

                    return !visibleCompetitionDisqualifications.some((disqualification: CompetitionTeamDisqualification) => {
                      return disqualification.team_id == s.team_id;
                    });
                  })
                  .sort((a, b) => compareAwardsRankingGoalScorers(a, b, {
                    drawWinnerPlayerId: scorerDrawResult?.winner_player_id ?? null,
                  }))
                  .slice(0, 3);

                const groupBestDefenses = [...awardsRankings.best_defenses]
                  .filter((g) => {
                    if (g.naipe !== naipe || (g.division ?? "NULL") !== (groupDivision ?? "NULL")) {
                      return false;
                    }

                    return !visibleCompetitionDisqualifications.some((disqualification: CompetitionTeamDisqualification) => {
                      return disqualification.team_id == g.team_id;
                    });
                  })
                  .sort((a, b) => {
                    const averageDiff = a.goals_against_average - b.goals_against_average;
                    if (averageDiff !== 0) return averageDiff;
                    const goalsDiff = a.goals_against - b.goals_against;
                    if (goalsDiff !== 0) return goalsDiff;
                    const matchesDiff = b.matches_count - a.matches_count;
                    if (matchesDiff !== 0) return matchesDiff;
                    const aIsWinner = defenseDrawResult?.winner_team_id === a.team_id;
                    const bIsWinner = defenseDrawResult?.winner_team_id === b.team_id;
                    if (aIsWinner && !bIsWinner) return -1;
                    if (!aIsWinner && bIsWinner) return 1;
                    return a.team_name.localeCompare(b.team_name);
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
                              const winnerScorer = groupScorers.find((scorer) => scorer.player_id === scorerDrawResult?.winner_player_id) ?? null;
                              return groupScorers.map((scorer, i) => {
                                const isDrawWinner = scorerDrawResult?.winner_player_id === scorer.player_id;
                                const isInDraw = !!scorerDrawResult &&
                                  winnerScorer != null &&
                                  scorer.goals === winnerScorer.goals &&
                                  scorer.team_advancement_rank === winnerScorer.team_advancement_rank;
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
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Melhores defesas</p>
                        {groupBestDefenses.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sem registros elegíveis.</p>
                        ) : (
                          <ol className="space-y-1.5">
                            {(() => {
                              const winnerBestDefense = groupBestDefenses.find((g) => g.team_id === defenseDrawResult?.winner_team_id) ?? null;
                              return groupBestDefenses.map((bestDefense, i) => {
                                const isDrawWinner = defenseDrawResult?.winner_team_id === bestDefense.team_id;
                                const isInDraw = !!winnerBestDefense
                                  && bestDefense.goals_against_average === winnerBestDefense.goals_against_average
                                  && bestDefense.goals_against === winnerBestDefense.goals_against
                                  && bestDefense.matches_count === winnerBestDefense.matches_count;
                                return (
                                  <li key={`${bestDefense.team_id}:${bestDefense.naipe}:${bestDefense.division ?? "NULL"}`} className="flex items-center gap-2 text-sm">
                                    <span className="flex min-w-0 flex-1 items-center gap-2">
                                      {medalIcon(i)}
                                      <span className="min-w-0 truncate font-medium">{bestDefense.team_name}</span>
                                      {isInDraw && (
                                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${isDrawWinner ? "border-primary/30 bg-primary/10 text-primary" : "border-muted-foreground/20 bg-secondary text-muted-foreground"}`}>
                                          <Shuffle className="h-3 w-3" />
                                          {isDrawWinner ? "Vencedor do sorteio" : "Sorteio"}
                                        </span>
                                      )}
                                    </span>
                                    <span className="flex-1 text-center text-xs text-muted-foreground">
                                      {bestDefense.matches_count} {bestDefense.matches_count === 1 ? "jogo" : "jogos"}
                                    </span>
                                    <span className="flex-1 text-right text-xs font-semibold tabular-nums">
                                      {formatDefenseAverage(bestDefense.goals_against_average)} de média • {bestDefense.goals_against} {bestDefense.goals_against === 1 ? "gol sofrido" : "gols sofridos"}
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

      <Dialog open={isDisqualificationDialogOpen} onOpenChange={setIsDisqualificationDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Desclassificar atlética da competição</DialogTitle>
            <DialogDescription>
              Todos os jogos já agendados, ao vivo ou encerrados dessa competição passam a valer W.O. para o adversário.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-sm text-muted-foreground">
              A atlética continua visível na classificação, sempre em último, com badge de desclassificada. A ação não tem reversão nesta versão.
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="competition-disqualification-year">
                  Ano
                </label>
                <Select value={disqualificationYearFilter} onValueChange={setDisqualificationYearFilter}>
                  <SelectTrigger id="competition-disqualification-year" className="app-input-field">
                    <SelectValue placeholder="Selecione o ano" />
                  </SelectTrigger>
                  <SelectContent>
                    {disqualificationSeasonYears.map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="competition-disqualification-sport">
                  Modalidade
                </label>
                <Select value={disqualificationSportFilter} onValueChange={setDisqualificationSportFilter}>
                  <SelectTrigger id="competition-disqualification-sport" className="app-input-field">
                    <SelectValue placeholder="Selecione a modalidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {disqualificationSportOptions.map((sportOption) => (
                      <SelectItem key={sportOption.value} value={sportOption.value}>
                        {sportOption.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="competition-disqualification-naipe">
                  Naipe
                </label>
                <Select value={disqualificationNaipeFilter} onValueChange={setDisqualificationNaipeFilter}>
                  <SelectTrigger id="competition-disqualification-naipe" className="app-input-field">
                    <SelectValue placeholder="Selecione o naipe" />
                  </SelectTrigger>
                  <SelectContent>
                    {disqualificationNaipeOptions.map((naipeOption) => (
                      <SelectItem key={naipeOption} value={naipeOption}>
                        {MATCH_NAIPE_LABELS[naipeOption]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {championshipUsesDivisions ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="competition-disqualification-division">
                    Divisão
                  </label>
                  <Select value={disqualificationDivisionFilter} onValueChange={setDisqualificationDivisionFilter}>
                    <SelectTrigger id="competition-disqualification-division" className="app-input-field">
                      <SelectValue placeholder="Selecione a divisão" />
                    </SelectTrigger>
                    <SelectContent>
                      {disqualificationDivisionOptions.map((divisionOption) => (
                        <SelectItem key={divisionOption} value={divisionOption}>
                          {TEAM_DIVISION_LABELS[divisionOption]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="competition-disqualification-team">
                Atlética participante
              </label>
              <Select value={selectedDisqualificationTeamId} onValueChange={setSelectedDisqualificationTeamId}>
                <SelectTrigger id="competition-disqualification-team" className="app-input-field">
                  <SelectValue placeholder="Selecione a atlética" />
                </SelectTrigger>
                <SelectContent>
                  {availableDisqualificationTeams.map((team) => (
                    <SelectItem key={team.team_id} value={team.team_id}>
                      {team.team_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDisqualificationCompetition == null ? (
                <p className="text-xs text-muted-foreground">
                  Selecione o recorte da competição para carregar as atléticas participantes.
                </p>
              ) : availableDisqualificationTeams.length == 0 ? (
                <p className="text-xs text-muted-foreground">
                  Todas as atléticas dessa competição já foram desclassificadas ou não há participantes disponíveis.
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDisqualificationDialogOpen(false)} disabled={isSavingDisqualification}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleConfirmDisqualification()}
              disabled={!selectedDisqualificationTeamId || isSavingDisqualification}
            >
              {isSavingDisqualification ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar desclassificação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDivisionMovementDialogOpen} onOpenChange={setIsDivisionMovementDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Prévia de movimentação das divisões</DialogTitle>
            <DialogDescription>
              {divisionMovementSummary} A confirmação abaixo aplica a nova divisão nas atléticas e grava o histórico desta temporada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-secondary/30 p-3 text-sm text-muted-foreground">
              Base de cálculo: classificação geral oficial final da temporada {selectedChampionshipSeasonYear ?? "-"}, já considerando correções e desclassificações.
            </div>

            {seasonDivisionMovementPreview.length == 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma mudança de divisão foi identificada na prévia atual.</p>
            ) : (
              <div className="space-y-2">
                {seasonDivisionMovementPreview.map((movement) => (
                  <div key={movement.team_id} className="rounded-xl border border-border/60 bg-background/80 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{movement.team_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {DIVISION_MOVEMENT_RULE_LABELS[movement.rule_code] ?? movement.rule_code} • posição {movement.ranking_position}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {movement.previous_division ? (
                          <AppBadge tone={TEAM_DIVISION_BADGE_TONES[movement.previous_division]}>
                            {TEAM_DIVISION_LABELS[movement.previous_division]}
                          </AppBadge>
                        ) : (
                          <AppBadge tone={AppBadgeTone.NEUTRAL}>Sem divisão</AppBadge>
                        )}
                        <span className="text-xs text-muted-foreground">→</span>
                        {movement.next_division ? (
                          <AppBadge tone={TEAM_DIVISION_BADGE_TONES[movement.next_division]}>
                            {TEAM_DIVISION_LABELS[movement.next_division]}
                          </AppBadge>
                        ) : (
                          <AppBadge tone={AppBadgeTone.NEUTRAL}>Sem divisão</AppBadge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDivisionMovementDialogOpen(false)} disabled={isApplyingDivisionMovements}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleApplyDivisionMovements()}
              disabled={seasonDivisionMovementPreview.length == 0 || isApplyingDivisionMovements}
            >
              {isApplyingDivisionMovements ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar movimentação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
