import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { Header } from "@/components/Header";
import { OnlineVisitorsBadge } from "@/components/OnlineVisitorsBadge";
import { useOnlineVisitorsProviderContext } from "@/components/online-visitors/OnlineVisitorsProvider";
import { AdminTeams } from "@/components/admin/AdminTeams";
import { AdminSports } from "@/components/admin/AdminSports";
import { AdminMatches } from "@/components/admin/AdminMatches";
import { AdminMatchesViewMode } from "@/components/admin/adminMatches.types";
import { AdminMatchControl } from "@/components/admin/AdminMatchControl";
import { AdminLeagueEvents } from "@/components/admin/AdminLeagueEvents";
import { AdminLogs } from "@/components/admin/AdminLogs";
import { AdminPublicAccessSettings } from "@/components/admin/AdminPublicAccessSettings";
import { AdminAccount } from "@/components/admin/AdminAccount";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { AdminStandings } from "@/components/admin/AdminStandings";
import { AdminChampionshipBracketPage } from "@/components/admin/AdminChampionshipBracketPage";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminPanelTab, ChampionshipCode, ChampionshipStatus } from "@/lib/enums";
import type { MatchBracketContext } from "@/lib/championship";
import { CHAMPIONSHIP_STATUS_LABELS } from "@/lib/championship";
import type { Championship, ChampionshipBracketView, ChampionshipSport, Match, Sport, Team } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AdminPageViewProps {
  championships: Championship[];
  selectedChampionship: Championship;
  selectedChampionshipCode: ChampionshipCode;
  matches: Match[];
  matchesTabMatches: Match[];
  teams: Team[];
  sports: Sport[];
  championshipSports: ChampionshipSport[];
  liveAndScheduledMatches: Match[];
  championshipBracketView: ChampionshipBracketView;
  matchesTabChampionshipBracketView: ChampionshipBracketView;
  loadingChampionshipBracket: boolean;
  loadingMatchesTabChampionshipBracket: boolean;
  matchBracketContextByMatchId: Record<string, MatchBracketContext>;
  matchesTabMatchBracketContextByMatchId: Record<string, MatchBracketContext>;
  matchRepresentationByMatchId: Record<string, string>;
  matchesTabMatchRepresentationByMatchId: Record<string, string>;
  estimatedStartTimeByMatchId: Record<string, string>;
  matchesTabEstimatedStartTimeByMatchId: Record<string, string>;
  matchesFetching: boolean;
  matchesTabFetching: boolean;
  availableMatchSeasonYears: number[];
  selectedMatchesSeasonYear: number | null;
  profileName: string | null;
  canViewMatchesTab: boolean;
  canViewControlTab: boolean;
  canViewTeamsTab: boolean;
  canViewSportsTab: boolean;
  canViewEventsTab: boolean;
  canViewLogsTab: boolean;
  canViewUsersTab: boolean;
  canViewAccountTab: boolean;
  canViewSettingsTab: boolean;
  canViewScoreSheetReviewTab: boolean;
  canViewTieBreaksTab: boolean;
  canViewChampionshipStatus: boolean;
  canViewBracketSetupTab: boolean;
  canManageMatches: boolean;
  canManageChampionshipStatus: boolean;
  canManageScoreboard: boolean;
  canManageTeams: boolean;
  canManageSports: boolean;
  canManageLeagueEvents: boolean;
  canManageUsers: boolean;
  canManageAccount: boolean;
  canManageSettings: boolean;
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
  onBracketGenerated: () => Promise<void>;
  updatingChampionshipStatus: boolean;
  onChampionshipCodeChange: (value: string) => void;
  onChampionshipStatusChange: (value: string) => void;
  onSelectedMatchesSeasonYearChange: (seasonYear: number) => void;
  onSignOut: () => void;
  onRefetchMatches: (options?: { showLoading?: boolean; showFetching?: boolean }) => void | Promise<void>;
  onRefetchChampionshipBracket: () => void;
  onRefetchTeams: () => void;
  liveMatchesCount: number;
  pendingLeagueEventReservationsCount: number;
  pendingTieBreaksCount: number;
}

const SCORE_SHEET_REVIEW_TAB_VALUE = "score_sheet_review";
const TIE_BREAKS_TAB_VALUE = "tie_breaks";
type AdminPageTabValue = AdminPanelTab | typeof SCORE_SHEET_REVIEW_TAB_VALUE | typeof TIE_BREAKS_TAB_VALUE;

interface AdminTabItem {
  value: AdminPageTabValue;
  label: string;
  className?: string;
}

export function AdminPageView({
  championships,
  selectedChampionship,
  selectedChampionshipCode,
  matches,
  matchesTabMatches,
  teams,
  sports,
  championshipSports,
  liveAndScheduledMatches,
  championshipBracketView,
  matchesTabChampionshipBracketView,
  loadingChampionshipBracket,
  loadingMatchesTabChampionshipBracket,
  matchBracketContextByMatchId,
  matchesTabMatchBracketContextByMatchId,
  matchRepresentationByMatchId,
  matchesTabMatchRepresentationByMatchId,
  estimatedStartTimeByMatchId,
  matchesTabEstimatedStartTimeByMatchId,
  matchesFetching,
  matchesTabFetching,
  availableMatchSeasonYears,
  selectedMatchesSeasonYear,
  profileName,
  canViewMatchesTab,
  canViewControlTab,
  canViewTeamsTab,
  canViewSportsTab,
  canViewEventsTab,
  canViewLogsTab,
  canViewUsersTab,
  canViewAccountTab,
  canViewSettingsTab,
  canViewScoreSheetReviewTab,
  canViewTieBreaksTab,
  canViewChampionshipStatus,
  canViewBracketSetupTab,
  canManageMatches,
  canManageChampionshipStatus,
  canManageScoreboard,
  canManageTeams,
  canManageSports,
  canManageLeagueEvents,
  canManageUsers,
  canManageAccount,
  canManageSettings,
  activeTab,
  onActiveTabChange,
  onBracketGenerated,
  updatingChampionshipStatus,
  onChampionshipCodeChange,
  onChampionshipStatusChange,
  onSelectedMatchesSeasonYearChange,
  onSignOut,
  onRefetchMatches,
  onRefetchChampionshipBracket,
  onRefetchTeams,
  liveMatchesCount,
  pendingLeagueEventReservationsCount,
  pendingTieBreaksCount,
}: AdminPageViewProps) {
  const adminTabItems = useMemo(() => {
    const nextAdminTabItems: AdminTabItem[] = [];

    if (canViewControlTab) {
      nextAdminTabItems.push({ value: AdminPanelTab.CONTROL, label: "Controle ao Vivo" });
    }

    if (canViewMatchesTab) {
      nextAdminTabItems.push({ value: AdminPanelTab.MATCHES, label: "Jogos" });
    }

    if (canViewScoreSheetReviewTab) {
      nextAdminTabItems.push({ value: SCORE_SHEET_REVIEW_TAB_VALUE, label: "Conferência de Súmula" });
    }

    if (canViewTieBreaksTab) {
      nextAdminTabItems.push({ value: TIE_BREAKS_TAB_VALUE, label: "Sorteios" });
    }

    if (canViewMatchesTab) {
      nextAdminTabItems.push({ value: AdminPanelTab.STANDINGS, label: "Classificação" });
    }

    if (canViewTeamsTab) {
      nextAdminTabItems.push({ value: AdminPanelTab.TEAMS, label: "Atléticas" });
    }

    if (canViewSportsTab) {
      nextAdminTabItems.push({ value: AdminPanelTab.SPORTS, label: "Modalidades" });
    }

    if (canViewEventsTab) {
      nextAdminTabItems.push({ value: AdminPanelTab.EVENTS, label: "Eventos da Liga" });
    }

    if (canViewLogsTab) {
      nextAdminTabItems.push({ value: AdminPanelTab.LOGS, label: "Logs" });
    }

    if (canViewUsersTab) {
      nextAdminTabItems.push({ value: AdminPanelTab.USERS, label: "Usuários" });
    }

    if (canViewAccountTab) {
      nextAdminTabItems.push({ value: AdminPanelTab.ACCOUNT, label: "Minha conta" });
    }

    if (canViewSettingsTab) {
      nextAdminTabItems.push({ value: AdminPanelTab.SETTINGS, label: "Configurações" });
    }

    if (canViewBracketSetupTab) {
      nextAdminTabItems.unshift({
        value: AdminPanelTab.BRACKET_SETUP,
        label: "Configurar Campeonato",
        className: "app-pill-bracket-config-tab",
      });
    }

    return nextAdminTabItems;
  }, [
    canViewBracketSetupTab,
    canViewControlTab,
    canViewEventsTab,
    canViewLogsTab,
    canViewMatchesTab,
    canViewScoreSheetReviewTab,
    canViewTieBreaksTab,
    canViewAccountTab,
    canViewSettingsTab,
    canViewSportsTab,
    canViewTeamsTab,
    canViewUsersTab,
  ]);

  const championshipStatusOptions = useMemo(() => {
    if (selectedChampionship.status == ChampionshipStatus.PLANNING) {
      return [
        ChampionshipStatus.PLANNING,
        ChampionshipStatus.UPCOMING,
      ];
    }

    return [
      ChampionshipStatus.PLANNING,
      ChampionshipStatus.UPCOMING,
      ChampionshipStatus.IN_PROGRESS,
      ChampionshipStatus.FINISHED,
    ];
  }, [selectedChampionship.status]);

  const tabsListRef = useRef<HTMLDivElement | null>(null);
  const tabTriggerByValueRef = useRef<Partial<Record<AdminPageTabValue, HTMLButtonElement | null>>>({});
  const refetchMatchesByActiveTabRef = useRef(onRefetchMatches);
  const [activeIndicatorLeft, setActiveIndicatorLeft] = useState(0);
  const [activeIndicatorWidth, setActiveIndicatorWidth] = useState(0);
  const [showActiveIndicator, setShowActiveIndicator] = useState(false);
  const { siteTotalOnlineVisitorsCount } = useOnlineVisitorsProviderContext();

  useEffect(() => {
    const hasActiveTab = adminTabItems.some((adminTabItem) => adminTabItem.value == activeTab);

    if (!hasActiveTab) {
      onActiveTabChange("");
    }
  }, [activeTab, adminTabItems, onActiveTabChange]);

  const updateActiveIndicator = useCallback(() => {
    const tabsListElement = tabsListRef.current;

    if (!tabsListElement) {
      setShowActiveIndicator(false);
      return;
    }

    const activeTabTriggerElement = tabTriggerByValueRef.current[activeTab as AdminPageTabValue];

    if (!activeTabTriggerElement) {
      setShowActiveIndicator(false);
      return;
    }

    // Use content coordinates, not viewport coordinates, to keep the indicator aligned on mobile horizontal scroll.
    setActiveIndicatorLeft(activeTabTriggerElement.offsetLeft);
    setActiveIndicatorWidth(activeTabTriggerElement.offsetWidth);
    setShowActiveIndicator(true);
  }, [activeTab, adminTabItems]);

  useLayoutEffect(() => {
    const animationFrameId = requestAnimationFrame(updateActiveIndicator);
    return () => cancelAnimationFrame(animationFrameId);
  }, [updateActiveIndicator]);

  useLayoutEffect(() => {
    const activeTabTriggerElement = tabTriggerByValueRef.current[activeTab as AdminPageTabValue];

    if (!activeTabTriggerElement || typeof ResizeObserver == "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      updateActiveIndicator();
    });

    resizeObserver.observe(activeTabTriggerElement);
    return () => resizeObserver.disconnect();
  }, [activeTab, updateActiveIndicator]);

  useEffect(() => {
    updateActiveIndicator();
  }, [adminTabItems, updateActiveIndicator]);

  useEffect(() => {
    window.addEventListener("resize", updateActiveIndicator);
    return () => window.removeEventListener("resize", updateActiveIndicator);
  }, [updateActiveIndicator]);

  useEffect(() => {
    refetchMatchesByActiveTabRef.current = onRefetchMatches;
  }, [onRefetchMatches]);

  useEffect(() => {
    if (activeTab != AdminPanelTab.CONTROL && activeTab != SCORE_SHEET_REVIEW_TAB_VALUE && activeTab != TIE_BREAKS_TAB_VALUE) {
      return;
    }

    void refetchMatchesByActiveTabRef.current();
    const refetchConfirmationTimeout = setTimeout(() => {
      void refetchMatchesByActiveTabRef.current();
    }, 400);

    return () => {
      clearTimeout(refetchConfirmationTimeout);
    };
  }, [activeTab]);

  return (
    <div className="app-page">
      <Header />
      <main className="container py-8 space-y-5">
        <div className="glass-panel enter-section flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="w-full lg:w-auto">
              <div className="mb-2 flex justify-center sm:hidden">
                <OnlineVisitorsBadge
                  onlineVisitorsCount={siteTotalOnlineVisitorsCount}
                  showLabel
                />
              </div>
              <div className="flex items-center justify-center gap-4 sm:justify-start">
                <h1 className="text-center text-2xl font-display font-bold sm:text-left">Painel Admin</h1>
                <OnlineVisitorsBadge
                  onlineVisitorsCount={siteTotalOnlineVisitorsCount}
                  showLabel
                  className="hidden sm:inline-flex"
                />
              </div>
            </div>

            <div className="flex w-full items-center gap-2 lg:w-auto">
              <Select value={selectedChampionshipCode} onValueChange={onChampionshipCodeChange}>
                <SelectTrigger className="app-input-field h-10 min-w-0 flex-1 sm:w-[280px] sm:flex-none">
                  <SelectValue placeholder="Selecione o campeonato" />
                </SelectTrigger>
                <SelectContent>
                  {championships.map((championship) => (
                    <SelectItem key={championship.id} value={championship.code}>
                      {championship.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" className="h-10 shrink-0 px-3 sm:px-4" onClick={onSignOut} aria-label="Sair">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            </div>
          </div>
        </div>

        {canViewChampionshipStatus ? (
          <div className="glass-panel enter-section flex flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
            <span className="text-sm font-medium">Status do campeonato</span>

            <Select
              value={selectedChampionship.status}
              onValueChange={onChampionshipStatusChange}
              disabled={updatingChampionshipStatus || !canManageChampionshipStatus}
            >
              <SelectTrigger className="app-input-field h-10 w-full sm:w-[320px]">
                <SelectValue placeholder="Alterar status" />
              </SelectTrigger>
              <SelectContent>
                {championshipStatusOptions.map((championshipStatusOption) => (
                  <SelectItem key={championshipStatusOption} value={championshipStatusOption}>
                    {CHAMPIONSHIP_STATUS_LABELS[championshipStatusOption]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {profileName ? (
          <p className="text-sm text-muted-foreground">Perfil atual: {profileName}.</p>
        ) : null}

        <Tabs value={activeTab} onValueChange={onActiveTabChange} className="enter-section space-y-6">
          <TabsList
            ref={tabsListRef}
            className="app-pill-container relative flex h-auto w-full items-center justify-start gap-0 overflow-x-auto rounded-xl p-0"
          >
            <span
              className="app-pill-active-indicator pointer-events-none absolute inset-y-0 left-0 rounded-xl transition-[transform,width,opacity] duration-500"
              style={{
                width: `${activeIndicatorWidth}px`,
                transform: `translateX(${activeIndicatorLeft}px)`,
                opacity: showActiveIndicator ? 1 : 0,
                transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            />

            {adminTabItems.map((adminTabItem) => (
              <TabsTrigger
                key={adminTabItem.value}
                value={adminTabItem.value}
                ref={(triggerElement) => {
                  tabTriggerByValueRef.current[adminTabItem.value] = triggerElement;
                }}
                className={cn(
                  "app-pill-option relative z-10 flex items-center gap-1.5 whitespace-nowrap rounded-none px-3 py-2.5 text-sm font-medium first:rounded-l-xl last:rounded-r-xl sm:px-4 data-[state=active]:bg-transparent data-[state=active]:shadow-none",
                  adminTabItem.className,
                )}
              >
                {adminTabItem.label}
                {adminTabItem.value === AdminPanelTab.CONTROL && liveMatchesCount > 0 && (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-sm">
                    {liveMatchesCount}
                  </span>
                )}
                {adminTabItem.value === TIE_BREAKS_TAB_VALUE && pendingTieBreaksCount > 0 && (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-sm">
                    {pendingTieBreaksCount}
                  </span>
                )}
                {adminTabItem.value === AdminPanelTab.EVENTS && pendingLeagueEventReservationsCount > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm">
                    {pendingLeagueEventReservationsCount}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {canViewBracketSetupTab ? (
            <TabsContent value={AdminPanelTab.BRACKET_SETUP}>
              <AdminChampionshipBracketPage
                selectedChampionship={selectedChampionship}
                teams={teams}
                championshipSports={championshipSports}
                onGenerated={onBracketGenerated}
              />
            </TabsContent>
          ) : null}

	          {canViewMatchesTab ? (
	            <TabsContent value={AdminPanelTab.MATCHES}>
              <AdminMatches
                matches={matchesTabMatches}
                teams={teams}
                championshipSports={championshipSports}
                selectedChampionship={selectedChampionship}
                championshipBracketView={matchesTabChampionshipBracketView}
                loadingChampionshipBracket={loadingMatchesTabChampionshipBracket}
                matchBracketContextByMatchId={matchesTabMatchBracketContextByMatchId}
                matchRepresentationByMatchId={matchesTabMatchRepresentationByMatchId}
                estimatedStartTimeByMatchId={matchesTabEstimatedStartTimeByMatchId}
                isFetchingMatches={matchesTabFetching}
                canManageMatches={canManageMatches}
                availableSeasonYears={availableMatchSeasonYears}
                selectedSeasonYear={selectedMatchesSeasonYear}
                onSeasonYearChange={onSelectedMatchesSeasonYearChange}
                onRefetch={onRefetchMatches}
                onRefetchChampionshipBracket={onRefetchChampionshipBracket}
                onOpenTieBreaksTab={() => onActiveTabChange(TIE_BREAKS_TAB_VALUE)}
              />
	            </TabsContent>
	          ) : null}

	          {canViewScoreSheetReviewTab ? (
	            <TabsContent value={SCORE_SHEET_REVIEW_TAB_VALUE}>
	              <AdminMatches
	                matches={matches}
	                teams={teams}
	                championshipSports={championshipSports}
	                selectedChampionship={selectedChampionship}
	                championshipBracketView={championshipBracketView}
	                loadingChampionshipBracket={loadingChampionshipBracket}
	                matchBracketContextByMatchId={matchBracketContextByMatchId}
	                matchRepresentationByMatchId={matchRepresentationByMatchId}
	                estimatedStartTimeByMatchId={estimatedStartTimeByMatchId}
	                isFetchingMatches={matchesFetching}
	                canManageMatches={canManageMatches}
	                viewMode={AdminMatchesViewMode.SCORE_SHEET_REVIEW}
	                onRefetch={onRefetchMatches}
	                onRefetchChampionshipBracket={onRefetchChampionshipBracket}
	              />
	            </TabsContent>
	          ) : null}

          {canViewTieBreaksTab ? (
            <TabsContent value={TIE_BREAKS_TAB_VALUE}>
              <AdminMatches
                matches={matches}
                teams={teams}
                championshipSports={championshipSports}
                selectedChampionship={selectedChampionship}
                championshipBracketView={championshipBracketView}
                loadingChampionshipBracket={loadingChampionshipBracket}
                matchBracketContextByMatchId={matchBracketContextByMatchId}
                matchRepresentationByMatchId={matchRepresentationByMatchId}
                estimatedStartTimeByMatchId={estimatedStartTimeByMatchId}
                isFetchingMatches={matchesFetching}
                canManageMatches={canManageMatches}
                viewMode={AdminMatchesViewMode.TIE_BREAKS}
                onRefetch={onRefetchMatches}
                onRefetchChampionshipBracket={onRefetchChampionshipBracket}
              />
            </TabsContent>
          ) : null}

          {canViewControlTab ? (
            <TabsContent value={AdminPanelTab.CONTROL}>
              <AdminMatchControl
                matches={liveAndScheduledMatches}
                championshipStatus={selectedChampionship.status}
                championshipSports={championshipSports}
                championshipBracketView={championshipBracketView}
                matchBracketContextByMatchId={matchBracketContextByMatchId}
                matchRepresentationByMatchId={matchRepresentationByMatchId}
                estimatedStartTimeByMatchId={estimatedStartTimeByMatchId}
                isFetchingMatches={matchesFetching}
                onRefetch={onRefetchMatches}
                onRefetchChampionshipBracket={onRefetchChampionshipBracket}
                canManageScoreboard={canManageScoreboard}
              />
            </TabsContent>
          ) : null}

          {canViewMatchesTab ? (
            <TabsContent value={AdminPanelTab.STANDINGS}>
              <AdminStandings
                selectedChampionship={selectedChampionship}
                championshipSports={championshipSports}
                sports={sports}
                championshipBracketView={championshipBracketView}
                availableSeasonYears={availableMatchSeasonYears}
              />
            </TabsContent>
          ) : null}

          {canViewTeamsTab ? (
            <TabsContent value={AdminPanelTab.TEAMS}>
              <AdminTeams teams={teams} onRefetch={onRefetchTeams} canManageTeams={canManageTeams} />
            </TabsContent>
          ) : null}

          {canViewSportsTab ? (
            <TabsContent value={AdminPanelTab.SPORTS}>
              <AdminSports
                sports={sports}
                championshipSports={championshipSports}
                selectedChampionship={selectedChampionship}
                canManageSports={canManageSports}
              />
            </TabsContent>
          ) : null}

          {canViewEventsTab ? (
            <TabsContent value={AdminPanelTab.EVENTS}>
              <AdminLeagueEvents teams={teams} canManageLeagueEvents={canManageLeagueEvents} />
            </TabsContent>
          ) : null}

          {canViewLogsTab ? (
            <TabsContent value={AdminPanelTab.LOGS}>
              <AdminLogs />
            </TabsContent>
          ) : null}

          {canViewUsersTab ? (
            <TabsContent value={AdminPanelTab.USERS}>
              <AdminUsers canManageUsers={canManageUsers} />
            </TabsContent>
          ) : null}

          {canViewAccountTab ? (
            <TabsContent value={AdminPanelTab.ACCOUNT}>
              <AdminAccount canManageAccount={canManageAccount} />
            </TabsContent>
          ) : null}

          {canViewSettingsTab ? (
            <TabsContent value={AdminPanelTab.SETTINGS}>
              <AdminPublicAccessSettings canManageSettings={canManageSettings} />
            </TabsContent>
          ) : null}
        </Tabs>
      </main>
    </div>
  );
}
