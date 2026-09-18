import { useEffect, useMemo, useState } from "react";
import { useMatches } from "@/hooks/useMatches";
import { useSports } from "@/hooks/useSports";
import { useChampionships } from "@/hooks/useChampionships";
import { useChampionshipBracket } from "@/hooks/useChampionshipBracket";
import { useChampionshipSeasonSportRemovals } from "@/hooks/useChampionshipSeasonSportRemovals";
import { useChampionshipIndividualEvents } from "@/hooks/useChampionshipIndividualEvents";
import { useLiveChampionshipRealtime } from "@/hooks/useLiveChampionshipRealtime";
import {
  EMPTY_CHAMPIONSHIP_BRACKET_VIEW,
  resolveKnockoutRoundLabel,
  resolveMatchBracketContextByMatchId,
} from "@/lib/championship";
import { ChampionshipStatus, MatchStatus } from "@/lib/enums";
import { resolveIndividualSportIds } from "@/lib/individualEvents";
import { LivePageView } from "@/pages/live/LivePageView";
import { DEFAULT_PAGINATION_ITEMS_PER_PAGE } from "@/components/ui/app-pagination-controls";
import {
  type ScheduledKnockoutPlaceholder,
  resolvePublicScheduleTimelineItems,
} from "@/domain/public-schedule/publicScheduleTimeline";
import {
  resolveChampionshipBracketMatchNumberingMode,
  resolveKnockoutDisplayMatchNumberById,
} from "@/domain/championship-brackets/championshipBracketDisplayMatchNumbers";

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
  const [activeTab, setActiveTab] = useState<"overview" | "knockout">(
    "overview",
  );
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

  const { sports, championshipSports } = useSports({
    championshipId: selectedChampionshipId,
    realtimeEnabled: false,
  });
  const {
    removedSportIds,
    loading: removedSportRemovalsLoading,
  } = useChampionshipSeasonSportRemovals({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
  });
  const visibleSports = useMemo(() => {
    if (removedSportRemovalsLoading) {
      return [];
    }

    const removedSportIdsSet = new Set(removedSportIds);
    const activeSportIds = new Set(
      championshipSports
        .filter(
          (championshipSport) =>
            !removedSportIdsSet.has(championshipSport.sport_id),
        )
        .map((championshipSport) => championshipSport.sport_id),
    );

    return sports.filter((sport) => activeSportIds.has(sport.id));
  }, [
    championshipSports,
    removedSportIds,
    removedSportRemovalsLoading,
    sports,
  ]);
  const individualSportIds = useMemo(
    () => resolveIndividualSportIds(visibleSports),
    [visibleSports],
  );

  useEffect(() => {
    if (sportFilter && !visibleSports.some((sport) => sport.id == sportFilter)) {
      setSportFilter(null);
    }
  }, [sportFilter, visibleSports]);

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
    refetch: refetchLiveMatches,
  } = useMatches({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
    statuses: [MatchStatus.LIVE],
    sportId: sportFilter,
    sortMode: "LIVE",
    includeRealtime: false,
  });

  const {
    matches: upcomingMatches,
    matchRepresentationByMatchId: upcomingMatchRepresentationByMatchId,
    visualQueuePositionByMatchId: upcomingVisualQueuePositionByMatchId,
    estimatedStartTimeByMatchId: upcomingEstimatedStartTimeByMatchId,
    loading: upcomingMatchesLoading,
    isFetching: upcomingMatchesFetching,
    refetch: refetchUpcomingMatches,
  } = useMatches({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
    statuses: [MatchStatus.SCHEDULED],
    sportId: sportFilter,
    sortMode: "SCHEDULED",
    scheduledMatchOrdering: "OPERATIONAL",
    includeRealtime: false,
  });

  const { matches: storedScheduledMatchesForMatchNumbering } = useMatches({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
    statuses: [MatchStatus.SCHEDULED],
    includePendingManualRelocation: true,
    sortMode: "SCHEDULED",
    includeRealtime: false,
  });

  const {
    championshipBracketView,
    loading: championshipBracketLoading,
    refetch: refetchChampionshipBracket,
  } = useChampionshipBracket({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
    realtimeEnabled: false,
  });

  useLiveChampionshipRealtime({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
    onLiveMatchesChange: () => {
      void refetchLiveMatches({ refreshOperationalContext: false });
    },
    onUpcomingMatchesChange: () => {
      void refetchUpcomingMatches({ refreshOperationalContext: false });
    },
    onBracketChange: () => {
      void refetchChampionshipBracket();
    },
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

  const knockoutPlaceholders = useMemo(() => {
    const knockoutDisplayMatchNumberById =
      resolveKnockoutDisplayMatchNumberById(
        visibleChampionshipBracketView,
        storedScheduledMatchesForMatchNumbering,
        resolveChampionshipBracketMatchNumberingMode(
          visibleChampionshipBracketView.edition?.payload_snapshot,
        ),
      );

    return visibleChampionshipBracketView.competitions.flatMap(
      (competition) => {
        if (sportFilter && competition.sport_id != sportFilter) {
          return [] as ScheduledKnockoutPlaceholder[];
        }

        const totalRounds = competition.knockout_matches.reduce(
          (currentMaxRound, knockoutMatch) => {
            if (knockoutMatch.is_third_place) {
              return currentMaxRound;
            }

            return Math.max(currentMaxRound, knockoutMatch.round_number);
          },
          0,
        );

        return competition.knockout_matches
          .filter(
            (knockoutMatch) =>
              !knockoutMatch.match_id && Boolean(knockoutMatch.scheduled_date),
          )
          .map((knockoutMatch) => ({
            id: knockoutMatch.id,
            competition_id: competition.id,
            sport_id: competition.sport_id,
            sport_name: competition.sport_name,
            naipe: competition.naipe,
            division: competition.division,
            round_number: knockoutMatch.round_number,
            slot_number: knockoutMatch.slot_number,
            is_third_place: knockoutMatch.is_third_place,
            display_match_number:
              knockoutDisplayMatchNumberById[knockoutMatch.id] ?? null,
            scheduled_date: knockoutMatch.scheduled_date!,
            queue_position: knockoutMatch.queue_position,
            scheduled_slot: knockoutMatch.scheduled_slot ?? null,
            start_time: knockoutMatch.start_time,
            end_time: knockoutMatch.end_time,
            location: knockoutMatch.location,
            court_name: knockoutMatch.court_name,
            home_team_name: knockoutMatch.home_team_name,
            away_team_name: knockoutMatch.away_team_name,
            stage_label: resolveKnockoutRoundLabel(
              knockoutMatch.round_number,
              Math.max(totalRounds, knockoutMatch.round_number),
              knockoutMatch.is_third_place,
            ),
          }));
      },
    );
  }, [
    sportFilter,
    storedScheduledMatchesForMatchNumbering,
    visibleChampionshipBracketView,
  ]);

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
      placeholders: knockoutPlaceholders,
      individualSessions: individualSessions.filter(
        (session) => session.status == "SCHEDULED",
      ),
      individualEventCountBySessionId,
      estimatedStartTimeByMatchId: upcomingEstimatedStartTimeByMatchId,
    });
  }, [
    individualEventCountBySessionId,
    individualSessions,
    knockoutPlaceholders,
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
      isLoading={
        championshipsLoading ||
        liveMatchesLoading ||
        upcomingMatchesLoading ||
        championshipBracketLoading
      }
      featuredChampionship={featuredChampionship}
      filteredLiveMatches={filteredLiveMatches}
      upcomingScheduleItems={paginatedUpcomingScheduleItems}
      isUpcomingMatchesFetching={
        upcomingMatchesFetching ||
        liveMatchesFetching ||
        individualSessionsLoading ||
        championshipBracketLoading
      }
      upcomingMatchesCurrentPage={upcomingMatchesCurrentPage}
      upcomingMatchesItemsPerPage={upcomingMatchesItemsPerPage}
      upcomingMatchesTotalPages={upcomingMatchesTotalPages}
      sports={visibleSports}
      sportFilter={sportFilter}
      activeTab={activeTab}
      championshipBracketView={filteredChampionshipBracketView}
      championshipBracketLoading={championshipBracketLoading}
      matchBracketContextByMatchId={matchBracketContextByMatchId}
      matchRepresentationByMatchId={matchRepresentationByMatchId}
      visualQueuePositionByMatchId={visualQueuePositionByMatchId}
      estimatedStartTimeByMatchId={estimatedStartTimeByMatchId}
      onSportFilterChange={setSportFilter}
      onActiveTabChange={setActiveTab}
      onUpcomingMatchesPageChange={setUpcomingMatchesCurrentPage}
      onUpcomingMatchesItemsPerPageChange={setUpcomingMatchesItemsPerPage}
    />
  );
}
