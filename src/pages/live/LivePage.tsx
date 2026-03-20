import { useEffect, useMemo, useState } from "react";
import { useMatches } from "@/hooks/useMatches";
import { useStandings } from "@/hooks/useStandings";
import { useSports } from "@/hooks/useSports";
import { useChampionships } from "@/hooks/useChampionships";
import { useChampionshipBracket } from "@/hooks/useChampionshipBracket";
import {
  EMPTY_CHAMPIONSHIP_BRACKET_VIEW,
  MATCH_NAIPE_LABELS,
  resolveMatchBracketContextByMatchId,
} from "@/lib/championship";
import { ChampionshipSportTieBreakerRule, ChampionshipStatus } from "@/lib/enums";
import { aggregateStandingsByTeam } from "@/lib/standings";
import { LivePageView } from "@/pages/live/LivePageView";

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

  const {
    matches,
    matchRepresentationByMatchId,
    estimatedStartTimeByMatchId,
    liveMatches,
    upcomingMatches,
    finishedMatches,
    loading: matchesLoading,
  } = useMatches({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
  });
  const { championshipBracketView, loading: championshipBracketLoading } = useChampionshipBracket({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
  });
  const visibleChampionshipBracketView = useMemo(() => {
    if (matches.length == 0) {
      return EMPTY_CHAMPIONSHIP_BRACKET_VIEW;
    }

    return championshipBracketView;
  }, [championshipBracketView, matches.length]);
  const matchBracketContextByMatchId = useMemo(() => {
    return resolveMatchBracketContextByMatchId(visibleChampionshipBracketView);
  }, [visibleChampionshipBracketView]);

  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [standingsSportFilter, setStandingsSportFilter] = useState<string>(ALL_STANDINGS_SPORT_FILTER);
  const [standingsNaipeFilter, setStandingsNaipeFilter] = useState<string>(ALL_STANDINGS_NAIPE_FILTER);

  useEffect(() => {
    setSportFilter(null);
    setStandingsSportFilter(ALL_STANDINGS_SPORT_FILTER);
    setStandingsNaipeFilter(ALL_STANDINGS_NAIPE_FILTER);
  }, [selectedChampionshipId]);

  const standingsDivisionFilter = selectedChampionshipHasDivisions ? undefined : null;
  const { standings, loading: standingsLoading } = useStandings({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
    division: standingsDivisionFilter,
  });

  const { sports, championshipSports } = useSports({ championshipId: selectedChampionshipId });

  const filteredUpcomingMatches = useMemo(() => {
    return sportFilter
      ? upcomingMatches.filter((match) => match.sport_id == sportFilter)
      : upcomingMatches;
  }, [sportFilter, upcomingMatches]);

  const filteredLiveMatches = sportFilter ? liveMatches.filter((match) => match.sport_id == sportFilter) : liveMatches;

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
    <LivePageView
      isLoading={championshipsLoading || matchesLoading || standingsLoading}
      featuredChampionship={featuredChampionship}
      filteredLiveMatches={filteredLiveMatches}
      filteredUpcomingMatches={filteredUpcomingMatches}
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
      onStandingsSportFilterChange={setStandingsSportFilter}
      onStandingsNaipeFilterChange={setStandingsNaipeFilter}
    />
  );
}
