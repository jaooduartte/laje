import { PageContentSkeleton } from "@/components/skeletons/PageContentSkeleton";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { AdminLinks } from "@/components/admin/AdminLinks";
import { AdminLogs } from "@/components/admin/AdminLogs";
import { AdminPublicAccessSettings } from "@/components/admin/AdminPublicAccessSettings";
import { AdminAccount } from "@/components/admin/AdminAccount";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { AdminStandings } from "@/components/admin/AdminStandings";
import { AdminDiscipline } from "@/components/admin/AdminDiscipline";
import { AdminChampionshipBracketPage } from "@/components/admin/AdminChampionshipBracketPage";
import { AdminChampionshipSchedule } from "@/components/admin/AdminChampionshipSchedule";
import { AdminOperationalScheduleIntervals } from "@/components/admin/AdminOperationalScheduleIntervals";
import { AdminInterlajeOpeningCeremonyBonus } from "@/components/admin/AdminInterlajeOpeningCeremonyBonus";
import { useChampionshipSeasonRuntime } from "@/hooks/useChampionshipSeasonRuntime";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AdminPanelTab,
  ChampionshipCode,
  ChampionshipStatus,
} from "@/lib/enums";
import type { MatchBracketContext } from "@/lib/championship";
import type { AwardDrawPendingContext } from "@/hooks/usePendingAwardDraws";
import { CHAMPIONSHIP_STATUS_LABELS } from "@/lib/championship";
import type {
  Championship,
  ChampionshipBracketView,
  ChampionshipSport,
  Match,
  Sport,
  Team,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface AdminPageViewProps {
  championships: Championship[];
  selectedChampionship: Championship;
  selectedChampionshipCode: ChampionshipCode;
  matches: Match[];
  matchesTabMatches: Match[];
  initialOperationalLoading?: boolean;
  teams: Team[];
  allTeams: Team[];
  allTeamsLoading?: boolean;
  sports: Sport[];
  championshipSports: ChampionshipSport[];
  sportsLoading?: boolean;
  liveAndScheduledMatches: Match[];
  championshipBracketView: ChampionshipBracketView;
  matchesTabChampionshipBracketView: ChampionshipBracketView;
  loadingChampionshipBracket: boolean;
  loadingMatchesTabChampionshipBracket: boolean;
  matchBracketContextByMatchId: Record<string, MatchBracketContext>;
  matchesTabMatchBracketContextByMatchId: Record<string, MatchBracketContext>;
  matchRepresentationByMatchId: Record<string, string>;
  matchesTabMatchRepresentationByMatchId: Record<string, string>;
  visualQueuePositionByMatchId?: Record<string, number>;
  matchesTabVisualQueuePositionByMatchId?: Record<string, number>;
  estimatedStartTimeByMatchId: Record<string, string>;
  matchesTabEstimatedStartTimeByMatchId: Record<string, string>;
  matchesFetching: boolean;
  isControlFullQueueVisible?: boolean;
  operationalIndividualSessionIds?: string[];
  operationalFullQueueItemsCount?: number | null;
  onControlFullQueueVisibleChange?: (isVisible: boolean) => void;
  matchesTabLoading?: boolean;
  matchesTabFetching: boolean;
  availableMatchSeasonYears: number[];
  selectedMatchesSeasonYear: number | null;
  profileName: string | null;
  canViewMatchesTab: boolean;
  canViewControlTab: boolean;
  canViewTeamsTab: boolean;
  canViewSportsTab: boolean;
  canViewEventsTab: boolean;
  canViewLinksTab: boolean;
  canViewLogsTab: boolean;
  canViewUsersTab: boolean;
  canViewAccountTab: boolean;
  canViewStandingsTab: boolean;
  canViewOpeningCeremonyBonusTab?: boolean;
  canViewSettingsTab: boolean;
  canViewScoreSheetReviewTab: boolean;
  canViewTieBreaksTab: boolean;
  canViewChampionshipStatus: boolean;
  canViewBracketSetupTab: boolean;
  canViewScheduleTab: boolean;
  canManageSchedule: boolean;
  canManageMatches: boolean;
  canManageChampionshipStatus: boolean;
  advancingChampionshipSeason: boolean;
  canManageScoreboard: boolean;
  canManageTeams: boolean;
  canManageSports: boolean;
  canManageLeagueEvents: boolean;
  canManageLinks: boolean;
  canManageUsers: boolean;
  canManageAccount: boolean;
  canManageSettings: boolean;
  canManageStandings?: boolean;
  canManageDisqualifications?: boolean;
  canManageOpeningCeremonyBonus?: boolean;
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
  onBracketGenerated: () => Promise<void>;
  updatingChampionshipStatus: boolean;
  onChampionshipCodeChange: (value: string) => void;
  onChampionshipStatusChange: (value: string) => void;
  onAdvanceChampionshipSeason: () => void;
  onSelectedMatchesSeasonYearChange: (seasonYear: number) => void;
  onSignOut: () => void;
  onRefetchMatches: (options?: {
    showLoading?: boolean;
    showFetching?: boolean;
  }) => void | Promise<void>;
  onRefetchChampionshipBracket: () => void;
  onRefetchSports?: () => void | Promise<void>;
  onRefetchTeams: () => void;
  liveMatchesCount: number;
  pendingLeagueEventReservationsCount: number;
  pendingScoreSheetReviewCount?: number;
  pendingTieBreaksCount: number;
  pendingAwardDrawContexts?: AwardDrawPendingContext[];
  loadingPendingAwardDraws?: boolean;
  refetchPendingAwardDraws?: () => void | Promise<void>;
  onInterlajeOpeningCeremonyBonusSaved?: () => void;
  interlajeOverallStandingsRefreshKey?: number;
}

const SCORE_SHEET_REVIEW_TAB_VALUE = "score_sheet_review";
const DISCIPLINE_TAB_VALUE = "discipline";
const TIE_BREAKS_TAB_VALUE = "tie_breaks";
const OPERATIONAL_INTERVALS_TAB_VALUE = "operational_intervals";
type AdminPageTabValue =
  | AdminPanelTab
  | typeof SCORE_SHEET_REVIEW_TAB_VALUE
  | typeof DISCIPLINE_TAB_VALUE
  | typeof TIE_BREAKS_TAB_VALUE
  | typeof OPERATIONAL_INTERVALS_TAB_VALUE;

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
  initialOperationalLoading = false,
  teams,
  allTeams,
  allTeamsLoading = false,
  sports,
  championshipSports,
  sportsLoading = false,
  liveAndScheduledMatches,
  championshipBracketView,
  matchesTabChampionshipBracketView,
  loadingChampionshipBracket,
  loadingMatchesTabChampionshipBracket,
  matchBracketContextByMatchId,
  matchesTabMatchBracketContextByMatchId,
  matchRepresentationByMatchId,
  matchesTabMatchRepresentationByMatchId,
  visualQueuePositionByMatchId = {},
  matchesTabVisualQueuePositionByMatchId = {},
  estimatedStartTimeByMatchId,
  matchesTabEstimatedStartTimeByMatchId,
  matchesFetching,
  isControlFullQueueVisible = false,
  operationalIndividualSessionIds = [],
  operationalFullQueueItemsCount = null,
  onControlFullQueueVisibleChange,
  matchesTabLoading = false,
  matchesTabFetching,
  availableMatchSeasonYears,
  selectedMatchesSeasonYear,
  profileName,
  canViewMatchesTab,
  canViewControlTab,
  canViewTeamsTab,
  canViewSportsTab,
  canViewEventsTab,
  canViewLinksTab,
  canViewLogsTab,
  canViewUsersTab,
  canViewAccountTab,
  canViewStandingsTab,
  canViewOpeningCeremonyBonusTab = false,
  canViewSettingsTab,
  canViewScoreSheetReviewTab,
  canViewTieBreaksTab,
  canViewChampionshipStatus,
  canViewBracketSetupTab,
  canViewScheduleTab,
  canManageSchedule,
  canManageMatches,
  canManageChampionshipStatus,
  advancingChampionshipSeason,
  canManageScoreboard,
  canManageTeams,
  canManageSports,
  canManageLeagueEvents,
  canManageLinks,
  canManageUsers,
  canManageAccount,
  canManageSettings,
  canManageStandings = false,
  canManageDisqualifications = false,
  canManageOpeningCeremonyBonus = false,
  activeTab,
  onActiveTabChange,
  onBracketGenerated,
  updatingChampionshipStatus,
  onChampionshipCodeChange,
  onChampionshipStatusChange,
  onAdvanceChampionshipSeason,
  onSelectedMatchesSeasonYearChange,
  onSignOut,
  onRefetchMatches,
  onRefetchChampionshipBracket,
  onRefetchSports,
  onRefetchTeams,
  liveMatchesCount,
  pendingLeagueEventReservationsCount,
  pendingScoreSheetReviewCount = 0,
  pendingTieBreaksCount,
  pendingAwardDrawContexts = [],
  loadingPendingAwardDraws = false,
  refetchPendingAwardDraws = () => {},
  onInterlajeOpeningCeremonyBonusSaved = () => {},
  interlajeOverallStandingsRefreshKey = 0,
}: AdminPageViewProps) {
  const { usesDivisions: selectedChampionshipHasSeasonDivisions } =
    useChampionshipSeasonRuntime({
      championship: selectedChampionship,
      seasonYear: selectedChampionship.current_season_year ?? null,
    });
  const canViewScheduleDuringReview =
    canViewScheduleTab &&
    selectedChampionship.status === ChampionshipStatus.REVIEW;
  const canViewOperationalIntervals =
    canViewScheduleTab &&
    [ChampionshipStatus.REVIEW, ChampionshipStatus.IN_PROGRESS].includes(
      selectedChampionship.status,
    );

  const totalSorteiosCount =
    pendingTieBreaksCount + pendingAwardDrawContexts.length;
  const adminTabItems = useMemo(() => {
    const nextAdminTabItems: AdminTabItem[] = [];

    if (canViewControlTab) {
      nextAdminTabItems.push({
        value: AdminPanelTab.CONTROL,
        label:
          selectedChampionship.status === ChampionshipStatus.REVIEW
            ? "Controle de jogos"
            : "Controle ao Vivo",
      });
    }

    if (canViewMatchesTab) {
      nextAdminTabItems.push({ value: AdminPanelTab.MATCHES, label: "Jogos" });
    }

    if (canViewScoreSheetReviewTab) {
      nextAdminTabItems.push({
        value: SCORE_SHEET_REVIEW_TAB_VALUE,
        label: "Conferência de Súmula",
      });
      nextAdminTabItems.push({
        value: DISCIPLINE_TAB_VALUE,
        label: "Disciplina",
      });
    }

    if (canViewTieBreaksTab) {
      nextAdminTabItems.push({
        value: TIE_BREAKS_TAB_VALUE,
        label: "Sorteios",
      });
    }

    if (canViewStandingsTab) {
      nextAdminTabItems.push({
        value: AdminPanelTab.STANDINGS,
        label: "Classificação",
      });
    }

    if (canViewOpeningCeremonyBonusTab) {
      nextAdminTabItems.push({
        value: AdminPanelTab.OPENING_CEREMONY_BONUS,
        label: "Ajustes da classificação geral",
      });
    }

    if (canViewTeamsTab) {
      nextAdminTabItems.push({
        value: AdminPanelTab.TEAMS,
        label: "Atléticas",
      });
    }

    if (canViewSportsTab) {
      nextAdminTabItems.push({
        value: AdminPanelTab.SPORTS,
        label: "Modalidades",
      });
    }

    if (canViewEventsTab) {
      nextAdminTabItems.push({
        value: AdminPanelTab.EVENTS,
        label: "Eventos da Liga",
      });
    }

    if (canViewLinksTab) {
      nextAdminTabItems.push({ value: AdminPanelTab.LINKS, label: "Links" });
    }

    if (canViewLogsTab) {
      nextAdminTabItems.push({ value: AdminPanelTab.LOGS, label: "Logs" });
    }

    if (canViewUsersTab) {
      nextAdminTabItems.push({ value: AdminPanelTab.USERS, label: "Usuários" });
    }

    if (canViewAccountTab) {
      nextAdminTabItems.push({
        value: AdminPanelTab.ACCOUNT,
        label: "Minha conta",
      });
    }

    if (canViewBracketSetupTab) {
      nextAdminTabItems.unshift({
        value: AdminPanelTab.BRACKET_SETUP,
        label: "Configurar Campeonato",
        className: "app-pill-bracket-config-tab",
      });
    }

    if (canViewScheduleDuringReview) {
      nextAdminTabItems.push({
        value: AdminPanelTab.CHAMPIONSHIP_SCHEDULE,
        label: "Reprogramar agenda",
      });
    }

    if (canViewOperationalIntervals) {
      nextAdminTabItems.push({
        value: OPERATIONAL_INTERVALS_TAB_VALUE,
        label: "Locais e intervalos",
      });
    }

    if (canViewSettingsTab) {
      nextAdminTabItems.push({
        value: AdminPanelTab.SETTINGS,
        label: "Configurações",
      });
    }

    return nextAdminTabItems;
  }, [
    canViewBracketSetupTab,
    canViewScheduleDuringReview,
    canViewOperationalIntervals,
    canViewControlTab,
    canViewEventsTab,
    canViewLinksTab,
    canViewLogsTab,
    canViewMatchesTab,
    canViewScoreSheetReviewTab,
    canViewTieBreaksTab,
    canViewAccountTab,
    canViewStandingsTab,
    canViewOpeningCeremonyBonusTab,
    canViewSettingsTab,
    canViewSportsTab,
    canViewTeamsTab,
    canViewUsersTab,
    selectedChampionship.status,
  ]);

  const championshipStatusOptions = useMemo(() => {
    if (selectedChampionship.status == ChampionshipStatus.PLANNING) {
      return [ChampionshipStatus.PLANNING, ChampionshipStatus.UPCOMING];
    }

    return [
      ChampionshipStatus.PLANNING,
      ChampionshipStatus.UPCOMING,
      ChampionshipStatus.REVIEW,
      ChampionshipStatus.IN_PROGRESS,
      ChampionshipStatus.FINISHED,
    ];
  }, [selectedChampionship.status]);

  const tabsListRef = useRef<HTMLDivElement | null>(null);
  const tabTriggerByValueRef = useRef<
    Partial<Record<AdminPageTabValue, HTMLButtonElement | null>>
  >({});
  const refetchMatchesByActiveTabRef = useRef(onRefetchMatches);
  const [activeIndicatorLeft, setActiveIndicatorLeft] = useState(0);
  const [activeIndicatorWidth, setActiveIndicatorWidth] = useState(0);
  const [showActiveIndicator, setShowActiveIndicator] = useState(false);
  const { siteTotalOnlineVisitorsCount } = useOnlineVisitorsProviderContext();

  useEffect(() => {
    const hasActiveTab = adminTabItems.some(
      (adminTabItem) => adminTabItem.value == activeTab,
    );

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

    const activeTabTriggerElement =
      tabTriggerByValueRef.current[activeTab as AdminPageTabValue];

    if (!activeTabTriggerElement) {
      setShowActiveIndicator(false);
      return;
    }

    // Use content coordinates, not viewport coordinates, to keep the indicator aligned on mobile horizontal scroll.
    setActiveIndicatorLeft(activeTabTriggerElement.offsetLeft);
    setActiveIndicatorWidth(activeTabTriggerElement.offsetWidth);
    setShowActiveIndicator(true);
  }, [activeTab]);

  useLayoutEffect(() => {
    const animationFrameId = requestAnimationFrame(updateActiveIndicator);
    return () => cancelAnimationFrame(animationFrameId);
  }, [updateActiveIndicator]);

  useLayoutEffect(() => {
    const activeTabTriggerElement =
      tabTriggerByValueRef.current[activeTab as AdminPageTabValue];

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
    if (
      activeTab != AdminPanelTab.CONTROL &&
      activeTab != SCORE_SHEET_REVIEW_TAB_VALUE &&
      activeTab != TIE_BREAKS_TAB_VALUE
    ) {
      return;
    }

    void refetchMatchesByActiveTabRef.current();
  }, [activeTab]);

  return (
    <div className="app-page">
      <Header />
      <main className="container py-8 space-y-5">
        <div className="glass-panel flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="w-full lg:w-auto">
              <div className="mb-2 flex justify-center sm:hidden">
                <OnlineVisitorsBadge
                  onlineVisitorsCount={siteTotalOnlineVisitorsCount}
                  showLabel
                />
              </div>
              <div className="flex items-center justify-center gap-4 sm:justify-start">
                <h1 className="text-center text-2xl font-display font-bold sm:text-left">
                  Painel Admin
                </h1>
                <OnlineVisitorsBadge
                  onlineVisitorsCount={siteTotalOnlineVisitorsCount}
                  showLabel
                  className="hidden sm:inline-flex"
                />
              </div>
            </div>

            <div className="flex w-full items-center gap-2 lg:w-auto">
              <Select
                value={selectedChampionshipCode}
                onValueChange={onChampionshipCodeChange}
              >
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

              <Button
                variant="outline"
                className="h-10 shrink-0 px-3 sm:px-4"
                onClick={onSignOut}
                aria-label="Sair"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            </div>
          </div>
        </div>

        {canViewChampionshipStatus ? (
          <div className="glass-panel enter-section flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1 sm:flex-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-sm font-medium">
                  Status do campeonato
                </span>
                <p className="text-xs text-muted-foreground">
                  Temporada atual: {selectedChampionship.current_season_year}
                </p>
                {profileName ? (
                  <p className="text-xs text-muted-foreground">
                    Perfil atual: {profileName}
                  </p>
                ) : null}
              </div>

              {selectedChampionship.status == ChampionshipStatus.FINISHED ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onAdvanceChampionshipSeason}
                  disabled={
                    !canManageChampionshipStatus || advancingChampionshipSeason
                  }
                >
                  Abrir temporada {selectedChampionship.current_season_year + 1}
                </Button>
              ) : null}
            </div>

            <Select
              value={selectedChampionship.status}
              onValueChange={onChampionshipStatusChange}
              disabled={
                updatingChampionshipStatus || !canManageChampionshipStatus
              }
            >
              <SelectTrigger className="app-input-field h-10 w-full sm:w-[320px]">
                <SelectValue placeholder="Alterar status" />
              </SelectTrigger>
              <SelectContent>
                {championshipStatusOptions.map((championshipStatusOption) => (
                  <SelectItem
                    key={championshipStatusOption}
                    value={championshipStatusOption}
                  >
                    {CHAMPIONSHIP_STATUS_LABELS[championshipStatusOption]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <Tabs
          value={activeTab}
          onValueChange={onActiveTabChange}
          className="enter-section space-y-6"
        >
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
                  tabTriggerByValueRef.current[adminTabItem.value] =
                    triggerElement;
                }}
                className={cn(
                  "app-pill-option relative z-10 flex items-center gap-1.5 whitespace-nowrap rounded-none px-3 py-2.5 text-sm font-medium first:rounded-l-xl last:rounded-r-xl sm:px-4 data-[state=active]:bg-transparent data-[state=active]:shadow-none",
                  adminTabItem.className,
                )}
              >
                {adminTabItem.label}
                {adminTabItem.value === AdminPanelTab.CONTROL &&
                  liveMatchesCount > 0 && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-sm">
                      {liveMatchesCount}
                    </span>
                  )}
                {adminTabItem.value === SCORE_SHEET_REVIEW_TAB_VALUE &&
                  pendingScoreSheetReviewCount > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm">
                      {pendingScoreSheetReviewCount}
                    </span>
                  )}
                {adminTabItem.value === TIE_BREAKS_TAB_VALUE &&
                  totalSorteiosCount > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm">
                      {totalSorteiosCount}
                    </span>
                  )}
                {adminTabItem.value === AdminPanelTab.EVENTS &&
                  pendingLeagueEventReservationsCount > 0 && (
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

          {canViewScheduleDuringReview ? (
            <TabsContent value={AdminPanelTab.CHAMPIONSHIP_SCHEDULE}>
              {loadingChampionshipBracket ? (
                <PageContentSkeleton filterCount={3} contentCount={3} />
              ) : championshipBracketView.edition != null ? (
                <AdminChampionshipSchedule
                  bracketEditionId={championshipBracketView.edition.id}
                  championshipId={selectedChampionship.id}
                  seasonYear={selectedChampionship.current_season_year}
                  sports={sports}
                  canManageSchedule={canManageSchedule}
                  championshipStatus={selectedChampionship.status}
                  usesDivisions={selectedChampionshipHasSeasonDivisions}
                  competitions={championshipBracketView.competitions}
                  onRefetchMatches={onRefetchMatches}
                  onRefetchChampionshipBracket={onRefetchChampionshipBracket}
                />
              ) : (
                <div className="glass-panel p-5">
                  <p className="text-sm text-muted-foreground">
                    A agenda deste campeonato não está disponível.
                  </p>
                </div>
              )}
            </TabsContent>
          ) : null}

          {canViewOperationalIntervals ? (
            <TabsContent value={OPERATIONAL_INTERVALS_TAB_VALUE}>
              {loadingChampionshipBracket ? (
                <PageContentSkeleton filterCount={2} contentCount={3} />
              ) : championshipBracketView.edition != null ? (
                <AdminOperationalScheduleIntervals
                  bracketEditionId={championshipBracketView.edition.id}
                  championshipStatus={selectedChampionship.status}
                  canManageSchedule={canManageSchedule}
                  onRefetchMatches={onRefetchMatches}
                  onRefetchChampionshipBracket={onRefetchChampionshipBracket}
                />
              ) : (
                <div className="glass-panel p-5">
                  <p className="text-sm text-muted-foreground">
                    Os locais deste campeonato não estão disponíveis.
                  </p>
                </div>
              )}
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
                loadingChampionshipBracket={
                  loadingMatchesTabChampionshipBracket
                }
                matchBracketContextByMatchId={
                  matchesTabMatchBracketContextByMatchId
                }
                matchRepresentationByMatchId={
                  matchesTabMatchRepresentationByMatchId
                }
                visualQueuePositionByMatchId={
                  matchesTabVisualQueuePositionByMatchId
                }
                estimatedStartTimeByMatchId={
                  matchesTabEstimatedStartTimeByMatchId
                }
                isInitialLoading={
                  matchesTabLoading || loadingMatchesTabChampionshipBracket
                }
                isFetchingMatches={matchesTabFetching}
                canManageMatches={canManageMatches}
                hasMatchesEditPermission={canManageMatches}
                availableSeasonYears={availableMatchSeasonYears}
                selectedSeasonYear={selectedMatchesSeasonYear}
                onSeasonYearChange={onSelectedMatchesSeasonYearChange}
                onRefetch={onRefetchMatches}
                onRefetchChampionshipBracket={onRefetchChampionshipBracket}
                onOpenTieBreaksTab={() =>
                  onActiveTabChange(TIE_BREAKS_TAB_VALUE)
                }
              />
            </TabsContent>
          ) : null}

          {canViewScoreSheetReviewTab ? (
            <TabsContent value={SCORE_SHEET_REVIEW_TAB_VALUE}>
              <AdminMatches
                matches={matchesTabMatches}
                teams={teams}
                championshipSports={championshipSports}
                selectedChampionship={selectedChampionship}
                championshipBracketView={matchesTabChampionshipBracketView}
                loadingChampionshipBracket={loadingMatchesTabChampionshipBracket}
                matchBracketContextByMatchId={matchesTabMatchBracketContextByMatchId}
                matchRepresentationByMatchId={matchesTabMatchRepresentationByMatchId}
                visualQueuePositionByMatchId={matchesTabVisualQueuePositionByMatchId}
                estimatedStartTimeByMatchId={matchesTabEstimatedStartTimeByMatchId}
                isInitialLoading={matchesTabLoading}
                isFetchingMatches={matchesTabFetching}
                canManageMatches={
                  canManageMatches && selectedChampionship.status !== ChampionshipStatus.REVIEW
                }
                hasMatchesEditPermission={canManageMatches}
                viewMode={AdminMatchesViewMode.SCORE_SHEET_REVIEW}
                onRefetch={onRefetchMatches}
                onRefetchChampionshipBracket={onRefetchChampionshipBracket}
              />
            </TabsContent>
          ) : null}

          {canViewScoreSheetReviewTab ? (
            <TabsContent value={DISCIPLINE_TAB_VALUE}>
              <AdminDiscipline
                championship={selectedChampionship}
                sports={sports}
                championshipSports={championshipSports}
                availableSeasonYears={availableMatchSeasonYears}
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
                visualQueuePositionByMatchId={visualQueuePositionByMatchId}
                estimatedStartTimeByMatchId={estimatedStartTimeByMatchId}
                isInitialLoading={initialOperationalLoading}
                isFetchingMatches={matchesFetching}
                canManageMatches={
                  canManageMatches && selectedChampionship.status !== ChampionshipStatus.REVIEW
                }
                hasMatchesEditPermission={canManageMatches}
                viewMode={AdminMatchesViewMode.TIE_BREAKS}
                onRefetch={onRefetchMatches}
                onRefetchChampionshipBracket={onRefetchChampionshipBracket}
                externalPendingAwardDrawContexts={pendingAwardDrawContexts}
                externalLoadingPendingAwardDraws={loadingPendingAwardDraws}
                externalRefetchPendingAwardDraws={refetchPendingAwardDraws}
              />
            </TabsContent>
          ) : null}

          {canViewControlTab ? (
            <TabsContent value={AdminPanelTab.CONTROL}>
              <AdminMatchControl
                championshipId={selectedChampionship.id}
                championshipCode={selectedChampionship.code}
                seasonYear={selectedChampionship.current_season_year}
                matches={liveAndScheduledMatches}
                isInitialLoading={initialOperationalLoading}
                championshipStatus={selectedChampionship.status}
                championshipSports={championshipSports}
                usesDivisions={selectedChampionshipHasSeasonDivisions}
                championshipBracketView={championshipBracketView}
                matchBracketContextByMatchId={matchBracketContextByMatchId}
                matchRepresentationByMatchId={matchRepresentationByMatchId}
                visualQueuePositionByMatchId={visualQueuePositionByMatchId}
                estimatedStartTimeByMatchId={estimatedStartTimeByMatchId}
                isFetchingMatches={matchesFetching}
                isFullQueueVisible={isControlFullQueueVisible}
                operationalIndividualSessionIds={operationalIndividualSessionIds}
                fullQueueItemsCount={operationalFullQueueItemsCount}
                onFullQueueVisibleChange={onControlFullQueueVisibleChange}
                onRefetch={onRefetchMatches}
                onRefetchChampionshipBracket={onRefetchChampionshipBracket}
                canManageScoreboard={
                  canManageScoreboard && selectedChampionship.status !== ChampionshipStatus.REVIEW
                }
              />
            </TabsContent>
          ) : null}

          {canViewStandingsTab ? (
            <TabsContent value={AdminPanelTab.STANDINGS}>
              <AdminStandings
                selectedChampionship={selectedChampionship}
                championshipSports={championshipSports}
                sports={sports}
                championshipBracketView={championshipBracketView}
                availableSeasonYears={availableMatchSeasonYears}
                onRefetchTeams={onRefetchTeams}
                canManageStandings={canManageStandings}
                canManageDisqualifications={canManageDisqualifications}
                overallStandingsRefreshKey={interlajeOverallStandingsRefreshKey}
              />
            </TabsContent>
          ) : null}

          {canViewOpeningCeremonyBonusTab ? (
            <TabsContent value={AdminPanelTab.OPENING_CEREMONY_BONUS}>
              <AdminInterlajeOpeningCeremonyBonus
                selectedChampionship={selectedChampionship}
                teams={allTeams}
                loadingTeams={allTeamsLoading}
                canManageOpeningCeremonyBonus={canManageOpeningCeremonyBonus}
                onSaved={onInterlajeOpeningCeremonyBonusSaved}
                availableSeasonYears={availableMatchSeasonYears}
              />
            </TabsContent>
          ) : null}

          {canViewTeamsTab ? (
            <TabsContent value={AdminPanelTab.TEAMS} className="enter-section">
              <AdminTeams
                teams={allTeams}
                isLoading={allTeamsLoading}
                onRefetch={onRefetchTeams}
                canManageTeams={canManageTeams}
              />
            </TabsContent>
          ) : null}

          {canViewSportsTab ? (
            <TabsContent value={AdminPanelTab.SPORTS}>
              <AdminSports
                sports={sports}
                championshipSports={championshipSports}
                isLoading={sportsLoading}
                selectedChampionship={selectedChampionship}
                bracketEditionId={championshipBracketView.edition?.id ?? null}
                canManageSports={canManageSports}
                onRefetchMatches={onRefetchMatches}
                onRefetchSports={onRefetchSports}
              />
            </TabsContent>
          ) : null}

          {canViewEventsTab ? (
            <TabsContent value={AdminPanelTab.EVENTS}>
              <AdminLeagueEvents
                teams={teams}
                canManageLeagueEvents={canManageLeagueEvents}
              />
            </TabsContent>
          ) : null}

          {canViewLinksTab ? (
            <TabsContent value={AdminPanelTab.LINKS}>
              <AdminLinks
                championships={championships}
                canManageLinks={canManageLinks}
              />
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
              <AdminPublicAccessSettings
                canManageSettings={canManageSettings}
              />
            </TabsContent>
          ) : null}
        </Tabs>
      </main>
    </div>
  );
}
