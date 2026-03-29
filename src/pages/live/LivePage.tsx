import { useEffect, useMemo, useState } from "react";
import { useMatches } from "@/hooks/useMatches";
import { useStandings } from "@/hooks/useStandings";
import { useSports } from "@/hooks/useSports";
import { useChampionships } from "@/hooks/useChampionships";
import { useChampionshipBracket } from "@/hooks/useChampionshipBracket";
import {
  EMPTY_CHAMPIONSHIP_BRACKET_VIEW,
  resolveMatchBracketContextByMatchId,
} from "@/lib/championship";
import { ChampionshipSportTieBreakerRule, ChampionshipStatus, MatchNaipe, MatchStatus } from "@/lib/enums";
import { aggregateStandingsByTeam } from "@/lib/standings";
import { LivePageView } from "@/pages/live/LivePageView";
import { DEFAULT_PAGINATION_ITEMS_PER_PAGE } from "@/components/ui/app-pagination-controls";

const ALL_STANDINGS_SPORT_FILTER = "ALL_STANDINGS_SPORTS";
const ALL_STANDINGS_NAIPE_FILTER = "ALL_STANDINGS_NAIPES";

export function LivePage() {
  const { championships, loading: championshipsLoading } = useChampionships();
  const featuredChampionship = useMemo(() => {
    const inProgressChampionship = championships.find(
      (championship) => championship.status == ChampionshipStatus.IN_PROGRESS,
    );

    if (inProgressChampionship) {
      return inProgressChampionship;
    }

    const upcomingChampionship = championships.find((championship) => championship.status == ChampionshipStatus.UPCOMING);

    if (upcomingChampionship) {
      return upcomingChampionship;
    }

    const planningChampionship = championships.find((championship) => championship.status == ChampionshipStatus.PLANNING);

    if (planningChampionship) {
      return planningChampionship;
    }

    return championships[0] ?? null;
  }, [championships]);

  const selectedChampionshipId = featuredChampionship?.id ?? null;
  const selectedChampionshipSeasonYear = featuredChampionship?.current_season_year ?? null;
  const selectedChampionshipHasDivisions = featuredChampionship?.uses_divisions ?? false;

  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [standingsSportFilter, setStandingsSportFilter] = useState<string>(ALL_STANDINGS_SPORT_FILTER);
  const [standingsNaipeFilter, setStandingsNaipeFilter] = useState<string>(ALL_STANDINGS_NAIPE_FILTER);
  const [upcomingMatchesCurrentPage, setUpcomingMatchesCurrentPage] = useState(1);
  const [upcomingMatchesItemsPerPage, setUpcomingMatchesItemsPerPage] = useState(DEFAULT_PAGINATION_ITEMS_PER_PAGE);

  useEffect(() => {
    setSportFilter(null);
    setStandingsSportFilter(ALL_STANDINGS_SPORT_FILTER);
    setStandingsNaipeFilter(ALL_STANDINGS_NAIPE_FILTER);
    setUpcomingMatchesCurrentPage(1);
    setUpcomingMatchesItemsPerPage(DEFAULT_PAGINATION_ITEMS_PER_PAGE);
  }, [selectedChampionshipId]);

  useEffect(() => {
    setUpcomingMatchesCurrentPage(1);
  }, [sportFilter, upcomingMatchesItemsPerPage]);

  const {
    matches: filteredLiveMatches,
    matchRepresentationByMatchId: liveMatchRepresentationByMatchId,
    estimatedStartTimeByMatchId: liveEstimatedStartTimeByMatchId,
    loading: liveMatchesLoading,
    isFetching: liveMatchesFetching,
  } = useMatches({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
    statuses: [MatchStatus.LIVE],
    sportId: sportFilter,
    sortMode: "LIVE",
  });

  const {
    matches: paginatedUpcomingMatches,
    totalCount: upcomingMatchesTotalCount,
    matchRepresentationByMatchId: upcomingMatchRepresentationByMatchId,
    estimatedStartTimeByMatchId: upcomingEstimatedStartTimeByMatchId,
    loading: upcomingMatchesLoading,
    isFetching: upcomingMatchesFetching,
  } = useMatches({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
    statuses: [MatchStatus.SCHEDULED],
    sportId: sportFilter,
    page: upcomingMatchesCurrentPage,
    itemsPerPage: upcomingMatchesItemsPerPage,
    sortMode: "SCHEDULED",
  });

  const standingsHeadToHeadSportFilter = standingsSportFilter == ALL_STANDINGS_SPORT_FILTER ? null : standingsSportFilter;
  const standingsHeadToHeadNaipeFilter =
    standingsNaipeFilter == ALL_STANDINGS_NAIPE_FILTER ? null : (standingsNaipeFilter as MatchNaipe);

  const { matches: standingsHeadToHeadMatches, loading: finishedMatchesLoading } = useMatches({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
    statuses: [MatchStatus.FINISHED],
    sportId: standingsHeadToHeadSportFilter,
    naipe: standingsHeadToHeadNaipeFilter,
    sortMode: "FINISHED",
  });

  const { championshipBracketView, loading: championshipBracketLoading } = useChampionshipBracket({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
  });
  const visibleChampionshipBracketView = useMemo(() => {
    if (championshipBracketView.competitions.length == 0) {
      return EMPTY_CHAMPIONSHIP_BRACKET_VIEW;
    }

    return championshipBracketView;
  }, [championshipBracketView]);
  const matchBracketContextByMatchId = useMemo(() => {
    return resolveMatchBracketContextByMatchId(visibleChampionshipBracketView);
  }, [visibleChampionshipBracketView]);

  const standingsDivisionFilter = selectedChampionshipHasDivisions ? undefined : null;
  const { standings, loading: standingsLoading } = useStandings({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
    division: standingsDivisionFilter,
  });

  const { sports, championshipSports } = useSports({ championshipId: selectedChampionshipId });

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

  const filteredStandings = useMemo(() => {
    return aggregateStandingsByTeam(standingsWithFilters, {
      tieBreakerRule: standingsTieBreakerRule,
      headToHeadMatches: standingsHeadToHeadMatches,
    });
  }, [standingsHeadToHeadMatches, standingsTieBreakerRule, standingsWithFilters]);

  const upcomingMatchesTotalPages = Math.max(1, Math.ceil(upcomingMatchesTotalCount / upcomingMatchesItemsPerPage));

  useEffect(() => {
    if (upcomingMatchesCurrentPage > upcomingMatchesTotalPages) {
      setUpcomingMatchesCurrentPage(upcomingMatchesTotalPages);
    }
  }, [upcomingMatchesCurrentPage, upcomingMatchesTotalPages]);

  const matchRepresentationByMatchId = useMemo(() => {
    return {
      ...liveMatchRepresentationByMatchId,
      ...upcomingMatchRepresentationByMatchId,
    };
  }, [liveMatchRepresentationByMatchId, upcomingMatchRepresentationByMatchId]);

  const estimatedStartTimeByMatchId = useMemo(() => {
    return {
      ...liveEstimatedStartTimeByMatchId,
      ...upcomingEstimatedStartTimeByMatchId,
    };
  }, [liveEstimatedStartTimeByMatchId, upcomingEstimatedStartTimeByMatchId]);

  return (
    <LivePageView
      isLoading={championshipsLoading || liveMatchesLoading || upcomingMatchesLoading || standingsLoading || finishedMatchesLoading}
      featuredChampionship={featuredChampionship}
      filteredLiveMatches={filteredLiveMatches}
      filteredUpcomingMatches={paginatedUpcomingMatches}
      isUpcomingMatchesFetching={upcomingMatchesFetching || liveMatchesFetching}
      upcomingMatchesCurrentPage={upcomingMatchesCurrentPage}
      upcomingMatchesItemsPerPage={upcomingMatchesItemsPerPage}
      upcomingMatchesTotalPages={upcomingMatchesTotalPages}
      sports={sports}
      sportFilter={sportFilter}
      standingsSportFilter={standingsSportFilter}
      standingsNaipeFilter={standingsNaipeFilter}
      allStandingsSportFilter={ALL_STANDINGS_SPORT_FILTER}
      allStandingsNaipeFilter={ALL_STANDINGS_NAIPE_FILTER}
      filteredStandings={filteredStandings}
      standingsShowCardColumns={standingsShowCardColumns}
      championTeamName={filteredStandings[0]?.team_name ?? null}
      championshipBracketView={visibleChampionshipBracketView}
      championshipBracketLoading={championshipBracketLoading}
      matchBracketContextByMatchId={matchBracketContextByMatchId}
      matchRepresentationByMatchId={matchRepresentationByMatchId}
      estimatedStartTimeByMatchId={estimatedStartTimeByMatchId}
      onSportFilterChange={setSportFilter}
      onUpcomingMatchesPageChange={setUpcomingMatchesCurrentPage}
      onUpcomingMatchesItemsPerPageChange={setUpcomingMatchesItemsPerPage}
      onStandingsSportFilterChange={setStandingsSportFilter}
      onStandingsNaipeFilterChange={setStandingsNaipeFilter}
    />
  );
}
