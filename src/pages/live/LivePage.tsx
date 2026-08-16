import { useEffect, useMemo, useState } from "react";
import { useMatches } from "@/hooks/useMatches";
import { useSports } from "@/hooks/useSports";
import { useChampionships } from "@/hooks/useChampionships";
import { useChampionshipBracket } from "@/hooks/useChampionshipBracket";
import { useChampionshipIndividualEvents } from "@/hooks/useChampionshipIndividualEvents";
import {
  EMPTY_CHAMPIONSHIP_BRACKET_VIEW,
  resolveMatchBracketContextByMatchId,
} from "@/lib/championship";
import { ChampionshipStatus, MatchStatus } from "@/lib/enums";
import { resolveIndividualSportIds } from "@/lib/individualEvents";
import { LivePageView } from "@/pages/live/LivePageView";
import { DEFAULT_PAGINATION_ITEMS_PER_PAGE } from "@/components/ui/app-pagination-controls";
import { resolvePublicScheduleTimelineItems } from "@/domain/public-schedule/publicScheduleTimeline";

export function LivePage() {
  const { championships, loading: championshipsLoading } = useChampionships();
  const featuredChampionship = useMemo(() => {
    const inProgressChampionship = championships.find(
      (championship) => championship.status == ChampionshipStatus.IN_PROGRESS,
    );

    if (inProgressChampionship) {
      return inProgressChampionship;
    }

    const reviewChampionship = championships.find(
      (championship) => championship.status == ChampionshipStatus.REVIEW,
    );

    if (reviewChampionship) {
      return reviewChampionship;
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

  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [upcomingMatchesCurrentPage, setUpcomingMatchesCurrentPage] = useState(1);
  const [upcomingMatchesItemsPerPage, setUpcomingMatchesItemsPerPage] = useState(DEFAULT_PAGINATION_ITEMS_PER_PAGE);

  useEffect(() => {
    setSportFilter(null);
    setUpcomingMatchesCurrentPage(1);
    setUpcomingMatchesItemsPerPage(DEFAULT_PAGINATION_ITEMS_PER_PAGE);
  }, [selectedChampionshipId]);

  useEffect(() => {
    setUpcomingMatchesCurrentPage(1);
  }, [sportFilter, upcomingMatchesItemsPerPage]);

  const { sports } = useSports({ championshipId: selectedChampionshipId });
  const individualSportIds = useMemo(
    () => resolveIndividualSportIds(sports),
    [sports],
  );
  const {
    events: individualEvents,
    sessions: individualSessions,
    loading: individualSessionsLoading,
  } = useChampionshipIndividualEvents({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
    sportIds: individualSportIds,
    sportId: sportFilter,
  });

  const {
    matches: filteredLiveMatches,
    matchRepresentationByMatchId: liveMatchRepresentationByMatchId,
    visualQueuePositionByMatchId: liveVisualQueuePositionByMatchId,
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
    matches: upcomingMatches,
    matchRepresentationByMatchId: upcomingMatchRepresentationByMatchId,
    visualQueuePositionByMatchId: upcomingVisualQueuePositionByMatchId,
    estimatedStartTimeByMatchId: upcomingEstimatedStartTimeByMatchId,
    loading: upcomingMatchesLoading,
    isFetching: upcomingMatchesFetching,
  } = useMatches({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
    statuses: [MatchStatus.SCHEDULED],
    sportId: sportFilter,
    sortMode: "SCHEDULED",
    scheduledMatchOrdering: "OPERATIONAL",
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

  const filteredChampionshipBracketView = useMemo(() => {
    if (!sportFilter) {
      return visibleChampionshipBracketView;
    }

    return {
      ...visibleChampionshipBracketView,
      competitions: visibleChampionshipBracketView.competitions.filter((competition) => {
        return competition.sport_id == sportFilter;
      }),
    };
  }, [sportFilter, visibleChampionshipBracketView]);

  const matchBracketContextByMatchId = useMemo(() => {
    return resolveMatchBracketContextByMatchId(visibleChampionshipBracketView);
  }, [visibleChampionshipBracketView]);

  const individualEventCountBySessionId = useMemo(() => {
    return individualEvents.reduce<Record<string, number>>((carry, event) => {
      if (event.session_id) {
        carry[event.session_id] = (carry[event.session_id] ?? 0) + 1;
      }

      return carry;
    }, {});
  }, [individualEvents]);
  const upcomingScheduleItems = useMemo(() => {
    return resolvePublicScheduleTimelineItems({
      matches: upcomingMatches,
      individualSessions: individualSessions.filter(
        (session) => session.status == "SCHEDULED",
      ),
      individualEventCountBySessionId,
      estimatedStartTimeByMatchId: upcomingEstimatedStartTimeByMatchId,
    });
  }, [
    individualEventCountBySessionId,
    individualSessions,
    upcomingEstimatedStartTimeByMatchId,
    upcomingMatches,
  ]);
  const paginatedUpcomingScheduleItems = useMemo(() => {
    const rangeStart =
      (upcomingMatchesCurrentPage - 1) * upcomingMatchesItemsPerPage;
    return upcomingScheduleItems.slice(
      rangeStart,
      rangeStart + upcomingMatchesItemsPerPage,
    );
  }, [
    upcomingMatchesCurrentPage,
    upcomingMatchesItemsPerPage,
    upcomingScheduleItems,
  ]);
  const upcomingMatchesTotalPages = Math.max(
    1,
    Math.ceil(upcomingScheduleItems.length / upcomingMatchesItemsPerPage),
  );

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

  const visualQueuePositionByMatchId = useMemo(() => {
    return {
      ...liveVisualQueuePositionByMatchId,
      ...upcomingVisualQueuePositionByMatchId,
    };
  }, [liveVisualQueuePositionByMatchId, upcomingVisualQueuePositionByMatchId]);

  return (
    <LivePageView
      isLoading={championshipsLoading || liveMatchesLoading || upcomingMatchesLoading || championshipBracketLoading || individualSessionsLoading}
      featuredChampionship={featuredChampionship}
      filteredLiveMatches={filteredLiveMatches}
      upcomingScheduleItems={paginatedUpcomingScheduleItems}
      isUpcomingMatchesFetching={upcomingMatchesFetching || liveMatchesFetching}
      upcomingMatchesCurrentPage={upcomingMatchesCurrentPage}
      upcomingMatchesItemsPerPage={upcomingMatchesItemsPerPage}
      upcomingMatchesTotalPages={upcomingMatchesTotalPages}
      sports={sports}
      sportFilter={sportFilter}
      championshipBracketView={filteredChampionshipBracketView}
      championshipBracketLoading={championshipBracketLoading}
      matchBracketContextByMatchId={matchBracketContextByMatchId}
      matchRepresentationByMatchId={matchRepresentationByMatchId}
      visualQueuePositionByMatchId={visualQueuePositionByMatchId}
      estimatedStartTimeByMatchId={estimatedStartTimeByMatchId}
      onSportFilterChange={setSportFilter}
      onUpcomingMatchesPageChange={setUpcomingMatchesCurrentPage}
      onUpcomingMatchesItemsPerPageChange={setUpcomingMatchesItemsPerPage}
    />
  );
}
