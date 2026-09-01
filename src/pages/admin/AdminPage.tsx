import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { AdminShellSkeleton } from "@/components/skeletons/AdminShellSkeleton";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMatches } from "@/hooks/useMatches";
import { useSports } from "@/hooks/useSports";
import { useTeams } from "@/hooks/useTeams";
import { useChampionships } from "@/hooks/useChampionships";
import { useChampionshipBracket } from "@/hooks/useChampionshipBracket";
import { useChampionshipSeasonYears } from "@/hooks/useChampionshipSeasonYears";
import { useChampionshipControlOperationalQueue } from "@/hooks/useChampionshipControlOperationalQueue";
import { useSelectedChampionship } from "@/hooks/useSelectedChampionship";
import { useChampionshipSelection } from "@/hooks/useChampionshipSelection";
import { usePendingLeagueEventReservationRequests } from "@/hooks/usePendingLeagueEventReservationRequests";
import { usePendingTieBreaks } from "@/hooks/usePendingTieBreaks";
import { usePendingAwardDraws } from "@/hooks/usePendingAwardDraws";
import { usePendingScoreSheetReviewCount } from "@/hooks/usePendingScoreSheetReviewCount";
import { Header } from "@/components/Header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AdminPanelTab,
  AppRoutePath,
  ChampionshipCode,
  ChampionshipStatus,
  MatchStatus,
} from "@/lib/enums";
import {
  EMPTY_CHAMPIONSHIP_BRACKET_VIEW,
  isChampionshipStatus,
  resolveMatchBracketContextByMatchId,
} from "@/lib/championship";
import {
  resolveCanViewBracketSetupTab,
  resolveCanViewOperationalAdminTabs,
  resolveCanViewReviewAdminTabs,
} from "@/pages/admin/adminPageVisibility";
import { resolvePreferredAdminChampionshipCode } from "@/pages/admin/adminPage.helpers";
import { AdminPageView } from "@/pages/admin/AdminPageView";

enum ChampionshipStatusFlowDialog {
  NONE = "NONE",
  RETURN_TO_PLANNING_WITH_GAMES = "RETURN_TO_PLANNING_WITH_GAMES",
  MOVE_TO_UPCOMING_WITH_GAMES = "MOVE_TO_UPCOMING_WITH_GAMES",
  MOBILE_CONFIGURATION_WARNING = "MOBILE_CONFIGURATION_WARNING",
  ADVANCE_SEASON = "ADVANCE_SEASON",
}

export function AdminPage() {
  const {
    user,
    profileName,
    canAccessAdminPanel,
    canManageScoreboard,
    canViewAdminTab,
    canEditAdminTab,
    loading,
    roleLoading,
    signOut,
  } = useAuth();
  const {
    championships,
    loading: championshipsLoading,
    refetch: refetchChampionships,
  } = useChampionships();
  const { selectedChampionshipCode, setSelectedChampionshipCode } =
    useSelectedChampionship();
  const [updatingChampionshipStatus, setUpdatingChampionshipStatus] =
    useState(false);
  const [advancingChampionshipSeason, setAdvancingChampionshipSeason] =
    useState(false);
  const [
    processingChampionshipStatusFlowAction,
    setProcessingChampionshipStatusFlowAction,
  ] = useState(false);
  const [_activeTab, setActiveTab] = useState<string>("");
  const [matchesSeasonYear, setMatchesSeasonYear] = useState<number | null>(
    null,
  );
  const [isControlFullQueueVisible, setIsControlFullQueueVisible] =
    useState(false);
  const [interlajeOverallStandingsRefreshKey, setInterlajeOverallStandingsRefreshKey] =
    useState(0);
  const [championshipStatusFlowDialog, setChampionshipStatusFlowDialog] =
    useState<ChampionshipStatusFlowDialog>(ChampionshipStatusFlowDialog.NONE);
  const hasAppliedInitialAdminChampionshipSelectionRef = useRef(false);
  const lastChampionshipSelectionSignatureRef = useRef<string | null>(null);

  const {
    selectedChampionship,
    selectedChampionshipId,
    handleChampionshipCodeChange,
  } = useChampionshipSelection({
    championships,
    selectedChampionshipCode,
    setSelectedChampionshipCode,
  });
  const selectedChampionshipSeasonYear =
    selectedChampionship?.current_season_year ?? null;
  const { seasonYears: availableMatchSeasonYears } = useChampionshipSeasonYears(
    {
      championshipId: selectedChampionshipId,
      currentSeasonYear: selectedChampionshipSeasonYear,
    },
  );
  const resolvedMatchesSeasonYear =
    matchesSeasonYear ?? selectedChampionshipSeasonYear;
  const {
    matchIds: operationalQueueMatchIds,
    individualSessionIds: operationalIndividualSessionIds,
    fullQueueItemsCount: operationalFullQueueItemsCount,
    loading: operationalQueueLoading,
    isFetching: operationalQueueFetching,
    refetch: refetchOperationalQueue,
  } = useChampionshipControlOperationalQueue({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
    enabled: !isControlFullQueueVisible,
  });

  const {
    matches: operationalMatches,
    matchRepresentationByMatchId: operationalMatchRepresentationByMatchId,
    visualQueuePositionByMatchId: operationalVisualQueuePositionByMatchId,
    estimatedStartTimeByMatchId: operationalEstimatedStartTimeByMatchId,
    loading: operationalMatchesLoading,
    isFetching: operationalMatchesFetching,
    refetch: refetchOperationalMatches,
  } = useMatches({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
    matchIds: isControlFullQueueVisible ? undefined : operationalQueueMatchIds,
    includeOperationalContext: true,
    enabled: isControlFullQueueVisible || !operationalQueueLoading,
  });
  const {
    championshipBracketView: operationalChampionshipBracketView,
    loading: loadingOperationalChampionshipBracket,
    refetch: refetchOperationalChampionshipBracket,
  } = useChampionshipBracket({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
  });
  const hasFinishedLoadingOperationalState =
    !operationalQueueLoading &&
    !operationalMatchesLoading &&
    !loadingOperationalChampionshipBracket;

  const operationalBracketEditionStatus =
    operationalChampionshipBracketView.edition?.status ?? null;

  const canViewBracketSetupTab = resolveCanViewBracketSetupTab({
    championshipStatus:
      selectedChampionship?.status ?? ChampionshipStatus.PLANNING,
    hasFinishedLoadingOperationalState,
    matchesCount: operationalMatches.length,
    bracketEditionStatus: operationalBracketEditionStatus,
  });

  const canViewOperationalAdminTabs = resolveCanViewOperationalAdminTabs({
    championshipStatus:
      selectedChampionship?.status ?? ChampionshipStatus.PLANNING,
    hasFinishedLoadingOperationalState,
    matchesCount: operationalMatches.length,
    bracketEditionStatus: operationalBracketEditionStatus,
  });

  const canViewReviewAdminTabs = resolveCanViewReviewAdminTabs({
    championshipStatus:
      selectedChampionship?.status ?? ChampionshipStatus.PLANNING,
    hasFinishedLoadingOperationalState,
    matchesCount: operationalMatches.length,
    bracketEditionStatus: operationalBracketEditionStatus,
  });

  const canViewMatchesTab =
    (canViewOperationalAdminTabs || canViewReviewAdminTabs) &&
    canViewAdminTab(AdminPanelTab.MATCHES);

  const canViewControlTab =
    (canViewOperationalAdminTabs || canViewReviewAdminTabs) &&
    canViewAdminTab(AdminPanelTab.CONTROL);

  const canViewTeamsTab = canViewAdminTab(AdminPanelTab.TEAMS);
  const canViewSportsTab = canViewAdminTab(AdminPanelTab.SPORTS);
  const canViewEventsTab = canViewAdminTab(AdminPanelTab.EVENTS);

  const canViewLinksTab = canViewAdminTab(AdminPanelTab.LINKS);
  const canViewLogsTab = canViewAdminTab(AdminPanelTab.LOGS);
  const canViewUsersTab = canViewAdminTab(AdminPanelTab.USERS);
  const canViewAccountTab = canViewAdminTab(AdminPanelTab.ACCOUNT);

  const canViewStandingsTab =
    (canViewOperationalAdminTabs || canViewReviewAdminTabs) &&
    canViewAdminTab(AdminPanelTab.STANDINGS);

  const canViewOpeningCeremonyBonusTab =
    selectedChampionship?.code == ChampionshipCode.INTERLAJE &&
    canViewAdminTab(AdminPanelTab.OPENING_CEREMONY_BONUS);

  const canViewSettingsTab = canViewAdminTab(AdminPanelTab.SETTINGS);

  const canViewChampionshipStatus = canViewAdminTab(
    AdminPanelTab.CHAMPIONSHIP_STATUS,
  );

  const canViewScoreSheetReviewTab =
    (canViewOperationalAdminTabs || canViewReviewAdminTabs) &&
    canViewAdminTab(AdminPanelTab.SCORE_SHEET_REVIEW);

  const canViewTieBreaksTab =
    selectedChampionship?.status === ChampionshipStatus.IN_PROGRESS &&
    canViewAdminTab(AdminPanelTab.TIE_BREAKS);

  const canViewScheduleTab =
    (canViewReviewAdminTabs || canViewOperationalAdminTabs) &&
    canViewAdminTab(AdminPanelTab.CHAMPIONSHIP_SCHEDULE);

  const defaultTabValue =
    [
      canViewBracketSetupTab ? AdminPanelTab.BRACKET_SETUP : null,
      canViewControlTab ? AdminPanelTab.CONTROL : null,
      canViewMatchesTab ? AdminPanelTab.MATCHES : null,
      canViewScoreSheetReviewTab ? AdminPanelTab.SCORE_SHEET_REVIEW : null,
      canViewTieBreaksTab ? AdminPanelTab.TIE_BREAKS : null,
      canViewStandingsTab ? AdminPanelTab.STANDINGS : null,
      canViewOpeningCeremonyBonusTab ? AdminPanelTab.OPENING_CEREMONY_BONUS : null,
      canViewTeamsTab ? AdminPanelTab.TEAMS : null,
      canViewSportsTab ? AdminPanelTab.SPORTS : null,
      canViewEventsTab ? AdminPanelTab.EVENTS : null,
      canViewLinksTab ? AdminPanelTab.LINKS : null,
      canViewLogsTab ? AdminPanelTab.LOGS : null,
      canViewUsersTab ? AdminPanelTab.USERS : null,
      canViewAccountTab ? AdminPanelTab.ACCOUNT : null,
      canViewScheduleTab ? AdminPanelTab.CHAMPIONSHIP_SCHEDULE : null,
      canViewSettingsTab ? AdminPanelTab.SETTINGS : null,
    ].find(
      (adminPanelTab): adminPanelTab is AdminPanelTab => adminPanelTab != null,
    ) ?? "";

  const activeTab = _activeTab || defaultTabValue;

  const shouldDeferInitialLazyAdminTab =
    _activeTab == "" &&
    (loading ||
      roleLoading ||
      championshipsLoading ||
      !selectedChampionship ||
      (selectedChampionship.status == ChampionshipStatus.UPCOMING &&
        !hasFinishedLoadingOperationalState));

  const lazyActiveTab = shouldDeferInitialLazyAdminTab ? "" : activeTab;

  const shouldLoadMatchesTab =
    lazyActiveTab == AdminPanelTab.MATCHES ||
    lazyActiveTab == AdminPanelTab.SCORE_SHEET_REVIEW;

  const shouldLoadAllTeams =
    lazyActiveTab == AdminPanelTab.TEAMS ||
    lazyActiveTab == AdminPanelTab.OPENING_CEREMONY_BONUS;

  const shouldLoadGlobalSports =
    lazyActiveTab == AdminPanelTab.SPORTS ||
    lazyActiveTab == AdminPanelTab.STANDINGS ||
    lazyActiveTab == AdminPanelTab.CHAMPIONSHIP_SCHEDULE;
  const {
    matches: matchesTabMatches,
    matchRepresentationByMatchId: matchesTabMatchRepresentationByMatchId,
    visualQueuePositionByMatchId: matchesTabVisualQueuePositionByMatchId,
    estimatedStartTimeByMatchId: matchesTabEstimatedStartTimeByMatchId,
    loading: matchesTabLoading,
    isFetching: matchesTabFetching,
    refetch: refetchMatchesTabMatches,
  } = useMatches({
    championshipId: selectedChampionshipId,
    seasonYear: resolvedMatchesSeasonYear,
    includePendingManualRelocation: true,
    enabled: shouldLoadMatchesTab,
  });
  const {
    championshipBracketView: matchesTabChampionshipBracketView,
    loading: loadingMatchesTabChampionshipBracket,
    refetch: refetchMatchesTabChampionshipBracket,
  } = useChampionshipBracket({
    championshipId: selectedChampionshipId,
    seasonYear: resolvedMatchesSeasonYear,
    enabled: shouldLoadMatchesTab,
  });
  const { teams, refetch: refetchTeams } = useTeams();
  const {
    teams: allTeams,
    loading: allTeamsLoading,
    refetch: refetchAllTeams,
  } = useTeams({
    includeInactive: true,
    enabled: shouldLoadAllTeams,
  });
  const {
    sports,
    loading: sportsLoading,
    refetch: refetchSports,
  } = useSports({
    enabled: shouldLoadGlobalSports,
  });

  const {
    championshipSports,
    loading: championshipSportsLoading,
    refetch: refetchChampionshipSports,
  } = useSports({
    championshipId: selectedChampionshipId,
  });
  const liveMatches = operationalMatches.filter(
    (match) => match.status == MatchStatus.LIVE,
  );
  const liveAndScheduledMatches = operationalMatches.filter(
    (match) =>
      match.status == MatchStatus.LIVE || match.status == MatchStatus.SCHEDULED,
  );
  const { count: pendingLeagueEventReservationRequestsCount } =
    usePendingLeagueEventReservationRequests();
  const { count: pendingScoreSheetReviewCount } =
    usePendingScoreSheetReviewCount({
      championshipId: selectedChampionshipId,
      seasonYear: resolvedMatchesSeasonYear,
    });
  const { count: pendingTieBreaksCount, refetch: refetchPendingTieBreaks } =
    usePendingTieBreaks({
      championshipId: selectedChampionshipId,
    });
  const {
    pendingContexts: pendingAwardDrawContexts,
    loading: loadingPendingAwardDraws,
    refetch: refetchPendingAwardDraws,
  } = usePendingAwardDraws({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
  });
  const visibleOperationalChampionshipBracketView = useMemo(() => {
    if (operationalMatches.length == 0) {
      return EMPTY_CHAMPIONSHIP_BRACKET_VIEW;
    }

    return operationalChampionshipBracketView;
  }, [operationalChampionshipBracketView, operationalMatches.length]);
  const operationalMatchBracketContextByMatchId = useMemo(() => {
    return resolveMatchBracketContextByMatchId(
      visibleOperationalChampionshipBracketView,
    );
  }, [visibleOperationalChampionshipBracketView]);
  const visibleMatchesTabChampionshipBracketView = useMemo(() => {
    if (matchesTabChampionshipBracketView.competitions.length == 0) {
      return EMPTY_CHAMPIONSHIP_BRACKET_VIEW;
    }

    return matchesTabChampionshipBracketView;
  }, [matchesTabChampionshipBracketView]);
  const matchesTabMatchBracketContextByMatchId = useMemo(() => {
    return resolveMatchBracketContextByMatchId(
      visibleMatchesTabChampionshipBracketView,
    );
  }, [visibleMatchesTabChampionshipBracketView]);

  const handleRefetchMatches = useCallback(
    async (options?: { showLoading?: boolean; showFetching?: boolean }) => {
      await Promise.all([
        refetchOperationalMatches(options),
        refetchMatchesTabMatches(options),
        refetchOperationalQueue({ showFetching: options?.showFetching }),
      ]);
      await refetchPendingTieBreaks();
    },
    [
      refetchMatchesTabMatches,
      refetchOperationalMatches,
      refetchOperationalQueue,
      refetchPendingTieBreaks,
    ],
  );

  const handleRefetchChampionshipBracket = useCallback(async () => {
    await Promise.all([
      refetchOperationalChampionshipBracket(),
      refetchMatchesTabChampionshipBracket(),
    ]);
    await refetchPendingTieBreaks();
  }, [
    refetchMatchesTabChampionshipBracket,
    refetchOperationalChampionshipBracket,
    refetchPendingTieBreaks,
  ]);

  const handleRefetchSports = useCallback(async () => {
    await Promise.all([refetchSports(), refetchChampionshipSports()]);
  }, [refetchChampionshipSports, refetchSports]);

  const handleBracketGenerated = useCallback(async () => {
    setActiveTab(AdminPanelTab.CONTROL);
    await Promise.all([
      refetchOperationalMatches(),
      refetchOperationalQueue(),
      refetchMatchesTabMatches(),
      refetchOperationalChampionshipBracket(),
      refetchMatchesTabChampionshipBracket(),
      refetchChampionships(),
      refetchTeams(),
      refetchAllTeams(),
    ]);
  }, [
    refetchChampionships,
    refetchAllTeams,
    refetchMatchesTabChampionshipBracket,
    refetchMatchesTabMatches,
    refetchOperationalChampionshipBracket,
    refetchOperationalMatches,
    refetchOperationalQueue,
    refetchTeams,
  ]);

  const closeChampionshipStatusFlowDialog = () => {
    if (processingChampionshipStatusFlowAction) {
      return;
    }

    setChampionshipStatusFlowDialog(ChampionshipStatusFlowDialog.NONE);
  };

  useEffect(() => {
    if (canViewBracketSetupTab && _activeTab == "") {
      setActiveTab(AdminPanelTab.BRACKET_SETUP);
    }
  }, [_activeTab, canViewBracketSetupTab]);

  useEffect(() => {
    if (!selectedChampionshipId) {
      setMatchesSeasonYear(null);
      return;
    }

    setMatchesSeasonYear(selectedChampionshipSeasonYear);
  }, [selectedChampionshipId, selectedChampionshipSeasonYear]);

  useEffect(() => {
    if (championships.length == 0) {
      return;
    }

    const preferredChampionshipCode =
      resolvePreferredAdminChampionshipCode(championships);
    const championshipSelectionSignature = championships
      .map(
        (championship) =>
          `${championship.code}:${championship.current_season_year}:${championship.status}`,
      )
      .join("|");
    const shouldApplyPreferredChampionshipSelection =
      !hasAppliedInitialAdminChampionshipSelectionRef.current;

    if (
      shouldApplyPreferredChampionshipSelection &&
      selectedChampionshipCode != preferredChampionshipCode
    ) {
      setSelectedChampionshipCode(preferredChampionshipCode);
    }

    hasAppliedInitialAdminChampionshipSelectionRef.current = true;
    lastChampionshipSelectionSignatureRef.current =
      championshipSelectionSignature;
  }, [championships, selectedChampionshipCode, setSelectedChampionshipCode]);

  const resolveIsMobileViewport = () => {
    if (typeof window == "undefined") {
      return false;
    }

    return window.matchMedia("(max-width: 767px)").matches;
  };

  const handleOpenMobileChampionshipConfigurationWarning = () => {
    setChampionshipStatusFlowDialog(
      ChampionshipStatusFlowDialog.MOBILE_CONFIGURATION_WARNING,
    );
  };

  const updateChampionshipStatus = async (nextStatus: ChampionshipStatus) => {
    if (!selectedChampionship) {
      return false;
    }

    setUpdatingChampionshipStatus(true);

    const { error } = await supabase
      .from("championships")
      .update({ status: nextStatus })
      .eq("id", selectedChampionship.id);

    setUpdatingChampionshipStatus(false);

    if (error) {
      toast.error(error.message);
      return false;
    }

    toast.success("Status do campeonato atualizado.");
    await refetchChampionships();
    return true;
  };

  const handleAdvanceChampionshipSeason = async () => {
    if (!selectedChampionship) {
      return;
    }

    setAdvancingChampionshipSeason(true);

    const { error } = await supabase.rpc("advance_championship_season", {
      _championship_id: selectedChampionship.id,
    });

    setAdvancingChampionshipSeason(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(
      `Temporada ${selectedChampionship.current_season_year + 1} aberta para configuração.`,
    );
    setChampionshipStatusFlowDialog(ChampionshipStatusFlowDialog.NONE);
    await refetchChampionships();
  };

  const deleteCurrentChampionshipMatches = async () => {
    if (!selectedChampionship) {
      return false;
    }

    const { error: matchesError } = await supabase
      .from("matches")
      .delete()
      .eq("championship_id", selectedChampionship.id)
      .eq("season_year", selectedChampionship.current_season_year);

    if (matchesError) {
      toast.error(matchesError.message);
      return false;
    }

    const { error: bracketEditionsError } = await supabase
      .from("championship_bracket_editions")
      .delete()
      .eq("championship_id", selectedChampionship.id)
      .eq("season_year", selectedChampionship.current_season_year);

    if (bracketEditionsError) {
      toast.error(bracketEditionsError.message);
      return false;
    }

    await Promise.all([
      refetchOperationalMatches(),
      refetchMatchesTabMatches(),
      refetchOperationalChampionshipBracket(),
      refetchMatchesTabChampionshipBracket(),
    ]);
    toast.success("Jogos e chaveamento atual removidos.");
    return true;
  };

  const handleKeepCurrentGamesAndReturnToPlanning = async () => {
    setProcessingChampionshipStatusFlowAction(true);

    const hasUpdatedStatus = await updateChampionshipStatus(
      ChampionshipStatus.PLANNING,
    );

    setProcessingChampionshipStatusFlowAction(false);

    if (hasUpdatedStatus) {
      setChampionshipStatusFlowDialog(ChampionshipStatusFlowDialog.NONE);
    }
  };

  const handleDeleteCurrentGamesAndReturnToPlanning = async () => {
    setProcessingChampionshipStatusFlowAction(true);

    const hasDeletedGames = await deleteCurrentChampionshipMatches();

    if (!hasDeletedGames) {
      setProcessingChampionshipStatusFlowAction(false);
      return;
    }

    const hasUpdatedStatus = await updateChampionshipStatus(
      ChampionshipStatus.PLANNING,
    );

    setProcessingChampionshipStatusFlowAction(false);

    if (hasUpdatedStatus) {
      setChampionshipStatusFlowDialog(ChampionshipStatusFlowDialog.NONE);
    }
  };

  const handleKeepCurrentGamesAndMoveToUpcoming = async () => {
    setProcessingChampionshipStatusFlowAction(true);

    const hasUpdatedStatus = await updateChampionshipStatus(
      ChampionshipStatus.REVIEW,
    );

    setProcessingChampionshipStatusFlowAction(false);

    if (hasUpdatedStatus) {
      setChampionshipStatusFlowDialog(ChampionshipStatusFlowDialog.NONE);
    }
  };

  const handleConfigureNewGames = async () => {
    if (resolveIsMobileViewport()) {
      handleOpenMobileChampionshipConfigurationWarning();
      return;
    }

    setProcessingChampionshipStatusFlowAction(true);

    const hasDeletedGames = await deleteCurrentChampionshipMatches();

    setProcessingChampionshipStatusFlowAction(false);

    if (!hasDeletedGames) {
      return;
    }

    setChampionshipStatusFlowDialog(ChampionshipStatusFlowDialog.NONE);
    setActiveTab(AdminPanelTab.BRACKET_SETUP);
  };

  const handleChampionshipStatusChange = async (value: string) => {
    if (!selectedChampionship || !isChampionshipStatus(value)) {
      return;
    }

    if (selectedChampionship.status == value) {
      return;
    }

    if (
      selectedChampionship.status == ChampionshipStatus.PLANNING &&
      (value == ChampionshipStatus.REVIEW ||
        value == ChampionshipStatus.IN_PROGRESS ||
        value == ChampionshipStatus.FINISHED)
    ) {
      toast.error(
        "Para chegar em Em revisão, Em andamento ou Encerrado, o campeonato precisa passar antes por Configurando campeonato.",
      );
      return;
    }

    if (value == ChampionshipStatus.PLANNING && operationalMatches.length > 0) {
      setChampionshipStatusFlowDialog(
        ChampionshipStatusFlowDialog.RETURN_TO_PLANNING_WITH_GAMES,
      );
      return;
    }

    if (
      selectedChampionship.status == ChampionshipStatus.PLANNING &&
      value == ChampionshipStatus.UPCOMING
    ) {
      if (operationalMatches.length > 0) {
        setChampionshipStatusFlowDialog(
          ChampionshipStatusFlowDialog.MOVE_TO_UPCOMING_WITH_GAMES,
        );
        return;
      }

      if (resolveIsMobileViewport()) {
        handleOpenMobileChampionshipConfigurationWarning();
        return;
      }
    }

    await updateChampionshipStatus(value);
  };

  if (loading || roleLoading) {
    return (
      <div className="app-page">
        <Header />

        <main className="container py-8">
          <AdminShellSkeleton />
        </main>
      </div>
    );
  }

  if (!user || !canAccessAdminPanel) {
    return <Navigate to={AppRoutePath.LOGIN} replace />;
  }

  if (championshipsLoading && championships.length == 0) {
    return (
      <div className="app-page">
        <Header />

        <main className="container py-8">
          <AdminShellSkeleton />
        </main>
      </div>
    );
  }

  if (!selectedChampionship) {
    return (
      <div className="app-page">
        <Header />
        <main className="container py-8">
          <div className="glass-panel p-5">
            <p className="text-sm text-muted-foreground">
              Nenhum campeonato disponível para gerenciamento.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const isInitialOperationalLoading =
    operationalQueueLoading ||
    operationalMatchesLoading ||
    loadingOperationalChampionshipBracket;
  const canManageMatches = canEditAdminTab(AdminPanelTab.MATCHES);
  const canManageSchedule = canEditAdminTab(
    AdminPanelTab.CHAMPIONSHIP_SCHEDULE,
  );
  const canManageChampionshipStatus = canEditAdminTab(
    AdminPanelTab.CHAMPIONSHIP_STATUS,
  );
  const canManageTeams = canEditAdminTab(AdminPanelTab.TEAMS);
  const canManageSports = canEditAdminTab(AdminPanelTab.SPORTS);
  const canManageLeagueEvents = canEditAdminTab(AdminPanelTab.EVENTS);
  const canManageLinks = canEditAdminTab(AdminPanelTab.LINKS);
  const canManageUsers = canEditAdminTab(AdminPanelTab.USERS);
  const canManageAccount = canEditAdminTab(AdminPanelTab.ACCOUNT);
  const canManageSettings = canEditAdminTab(AdminPanelTab.SETTINGS);
  const canManageStandings =
    canEditAdminTab(AdminPanelTab.STANDINGS) &&
    selectedChampionship.status != ChampionshipStatus.REVIEW;
  const canManageDisqualifications =
    canEditAdminTab(AdminPanelTab.STANDINGS) &&
    [
      ChampionshipStatus.REVIEW,
      ChampionshipStatus.IN_PROGRESS,
      ChampionshipStatus.FINISHED,
    ].includes(selectedChampionship.status);
  const canManageOpeningCeremonyBonus = canEditAdminTab(
    AdminPanelTab.OPENING_CEREMONY_BONUS,
  );

  return (
    <>
      <AdminPageView
        championships={championships}
        selectedChampionship={selectedChampionship}
        selectedChampionshipCode={selectedChampionshipCode}
        matches={operationalMatches}
        matchesTabMatches={matchesTabMatches}
        initialOperationalLoading={isInitialOperationalLoading}
        teams={teams}
        allTeams={allTeams}
        allTeamsLoading={allTeamsLoading}
        sports={sports}
        championshipSports={championshipSports}
        sportsLoading={sportsLoading || championshipSportsLoading}
        liveAndScheduledMatches={liveAndScheduledMatches}
        championshipBracketView={visibleOperationalChampionshipBracketView}
        matchesTabChampionshipBracketView={
          visibleMatchesTabChampionshipBracketView
        }
        loadingChampionshipBracket={loadingOperationalChampionshipBracket}
        loadingMatchesTabChampionshipBracket={
          loadingMatchesTabChampionshipBracket
        }
        matchBracketContextByMatchId={operationalMatchBracketContextByMatchId}
        matchesTabMatchBracketContextByMatchId={
          matchesTabMatchBracketContextByMatchId
        }
        matchRepresentationByMatchId={operationalMatchRepresentationByMatchId}
        matchesTabMatchRepresentationByMatchId={
          matchesTabMatchRepresentationByMatchId
        }
        visualQueuePositionByMatchId={operationalVisualQueuePositionByMatchId}
        matchesTabVisualQueuePositionByMatchId={
          matchesTabVisualQueuePositionByMatchId
        }
        estimatedStartTimeByMatchId={operationalEstimatedStartTimeByMatchId}
        matchesTabEstimatedStartTimeByMatchId={
          matchesTabEstimatedStartTimeByMatchId
        }
        matchesFetching={operationalMatchesFetching || operationalQueueFetching}
        isControlFullQueueVisible={isControlFullQueueVisible}
        operationalIndividualSessionIds={operationalIndividualSessionIds}
        operationalFullQueueItemsCount={operationalFullQueueItemsCount}
        onControlFullQueueVisibleChange={setIsControlFullQueueVisible}
        matchesTabLoading={matchesTabLoading}
        matchesTabFetching={matchesTabFetching}
        availableMatchSeasonYears={availableMatchSeasonYears}
        selectedMatchesSeasonYear={resolvedMatchesSeasonYear}
        profileName={profileName}
        canViewMatchesTab={canViewMatchesTab}
        canViewControlTab={canViewControlTab}
        canViewTeamsTab={canViewTeamsTab}
        canViewSportsTab={canViewSportsTab}
        canViewEventsTab={canViewEventsTab}
        canViewLinksTab={canViewLinksTab}
        canViewLogsTab={canViewLogsTab}
        canViewUsersTab={canViewUsersTab}
        canViewAccountTab={canViewAccountTab}
        canViewStandingsTab={canViewStandingsTab}
        canViewOpeningCeremonyBonusTab={canViewOpeningCeremonyBonusTab}
        canViewSettingsTab={canViewSettingsTab}
        canViewScoreSheetReviewTab={canViewScoreSheetReviewTab}
        canViewTieBreaksTab={canViewTieBreaksTab}
        canViewChampionshipStatus={canViewChampionshipStatus}
        canViewBracketSetupTab={canViewBracketSetupTab}
        canViewScheduleTab={canViewScheduleTab}
        canManageSchedule={canManageSchedule}
        canManageMatches={canManageMatches}
        canManageChampionshipStatus={canManageChampionshipStatus}
        advancingChampionshipSeason={advancingChampionshipSeason}
        canManageScoreboard={canManageScoreboard}
        canManageTeams={canManageTeams}
        canManageSports={canManageSports}
        canManageLeagueEvents={canManageLeagueEvents}
        canManageLinks={canManageLinks}
        canManageUsers={canManageUsers}
        canManageAccount={canManageAccount}
        canManageSettings={canManageSettings}
        canManageStandings={canManageStandings}
        canManageDisqualifications={canManageDisqualifications}
        canManageOpeningCeremonyBonus={canManageOpeningCeremonyBonus}
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
        updatingChampionshipStatus={
          updatingChampionshipStatus || processingChampionshipStatusFlowAction
        }
        onChampionshipCodeChange={handleChampionshipCodeChange}
        onChampionshipStatusChange={handleChampionshipStatusChange}
        onAdvanceChampionshipSeason={() =>
          setChampionshipStatusFlowDialog(
            ChampionshipStatusFlowDialog.ADVANCE_SEASON,
          )
        }
        onSelectedMatchesSeasonYearChange={setMatchesSeasonYear}
        onSignOut={signOut}
        onRefetchMatches={handleRefetchMatches}
        onRefetchChampionshipBracket={handleRefetchChampionshipBracket}
        onRefetchSports={handleRefetchSports}
        onRefetchTeams={async () => {
          await Promise.all([refetchTeams(), refetchAllTeams()]);
        }}
        onInterlajeOpeningCeremonyBonusSaved={() =>
          setInterlajeOverallStandingsRefreshKey((currentKey) => currentKey + 1)
        }
        interlajeOverallStandingsRefreshKey={interlajeOverallStandingsRefreshKey}
        onBracketGenerated={handleBracketGenerated}
        liveMatchesCount={liveMatches.length}
        pendingLeagueEventReservationsCount={
          pendingLeagueEventReservationRequestsCount
        }
        pendingScoreSheetReviewCount={pendingScoreSheetReviewCount}
        pendingTieBreaksCount={pendingTieBreaksCount}
        pendingAwardDrawContexts={pendingAwardDrawContexts}
        loadingPendingAwardDraws={loadingPendingAwardDraws}
        refetchPendingAwardDraws={refetchPendingAwardDraws}
      />

      <Dialog
        open={
          championshipStatusFlowDialog ==
          ChampionshipStatusFlowDialog.RETURN_TO_PLANNING_WITH_GAMES
        }
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeChampionshipStatusFlowDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-center">
              Voltar campeonato para Em breve?
            </DialogTitle>
            <DialogDescription className="text-center">
              Este campeonato já possui jogos cadastrados. Escolha se eles devem
              ser mantidos ao voltar o status para Em breve.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={closeChampionshipStatusFlowDialog}
              disabled={processingChampionshipStatusFlowAction}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleKeepCurrentGamesAndReturnToPlanning}
              disabled={processingChampionshipStatusFlowAction}
            >
              {processingChampionshipStatusFlowAction ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Manter jogos atuais
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteCurrentGamesAndReturnToPlanning}
              disabled={processingChampionshipStatusFlowAction}
            >
              {processingChampionshipStatusFlowAction ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Excluir jogos atuais
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={
          championshipStatusFlowDialog ==
          ChampionshipStatusFlowDialog.MOVE_TO_UPCOMING_WITH_GAMES
        }
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeChampionshipStatusFlowDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-center">
              Jogos atuais já existem
            </DialogTitle>
            <DialogDescription className="text-center">
              O campeonato está em Em breve, mas já possui jogos cadastrados.
              Você pode manter os jogos atuais ou limpar tudo para montar uma
              nova configuração de campeonato.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={closeChampionshipStatusFlowDialog}
              disabled={processingChampionshipStatusFlowAction}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleKeepCurrentGamesAndMoveToUpcoming}
              disabled={processingChampionshipStatusFlowAction}
            >
              {processingChampionshipStatusFlowAction ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Manter jogos atuais
            </Button>
            <Button
              type="button"
              onClick={handleConfigureNewGames}
              disabled={processingChampionshipStatusFlowAction}
            >
              {processingChampionshipStatusFlowAction ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Configurar novos jogos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={
          championshipStatusFlowDialog ==
          ChampionshipStatusFlowDialog.MOBILE_CONFIGURATION_WARNING
        }
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeChampionshipStatusFlowDialog();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Configuração disponível apenas no computador
            </AlertDialogTitle>
            <AlertDialogDescription>
              A configuração do campeonato deve ser feita somente no computador,
              porque na visão de celular os componentes não cabem na tela.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="justify-center sm:justify-center">
            <AlertDialogAction
              className="w-full sm:w-auto"
              onClick={closeChampionshipStatusFlowDialog}
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={
          championshipStatusFlowDialog ==
          ChampionshipStatusFlowDialog.ADVANCE_SEASON
        }
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeChampionshipStatusFlowDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-center">
              Abrir nova temporada?
            </DialogTitle>
            <DialogDescription className="text-center">
              Essa ação muda o campeonato para Em breve e avança a temporada de{" "}
              {selectedChampionship.current_season_year} para{" "}
              {selectedChampionship.current_season_year + 1}. Ela não acontece
              mais automaticamente ao abrir as telas.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={closeChampionshipStatusFlowDialog}
              disabled={advancingChampionshipSeason}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleAdvanceChampionshipSeason}
              disabled={advancingChampionshipSeason}
            >
              {advancingChampionshipSeason ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Abrir temporada {selectedChampionship.current_season_year + 1}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
