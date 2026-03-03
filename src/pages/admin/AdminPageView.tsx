import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { Header } from "@/components/Header";
import { OnlineVisitorsBadge } from "@/components/OnlineVisitorsBadge";
import { AdminTeams } from "@/components/admin/AdminTeams";
import { AdminSports } from "@/components/admin/AdminSports";
import { AdminMatches } from "@/components/admin/AdminMatches";
import { AdminMatchControl } from "@/components/admin/AdminMatchControl";
import { AdminLeagueEvents } from "@/components/admin/AdminLeagueEvents";
import { AdminLogs } from "@/components/admin/AdminLogs";
import { AdminPublicAccessSettings } from "@/components/admin/AdminPublicAccessSettings";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminPanelTab, ChampionshipCode, ChampionshipStatus, OnlineVisitorsContext } from "@/lib/enums";
import { CHAMPIONSHIP_STATUS_LABELS } from "@/lib/championship";
import type { Championship, ChampionshipSport, Match, Sport, Team } from "@/lib/types";

interface AdminPageViewProps {
  championships: Championship[];
  selectedChampionship: Championship;
  selectedChampionshipCode: ChampionshipCode;
  matches: Match[];
  teams: Team[];
  sports: Sport[];
  championshipSports: ChampionshipSport[];
  liveAndScheduledMatches: Match[];
  profileName: string | null;
  canViewMatchesTab: boolean;
  canViewControlTab: boolean;
  canViewTeamsTab: boolean;
  canViewSportsTab: boolean;
  canViewEventsTab: boolean;
  canViewLogsTab: boolean;
  canViewUsersTab: boolean;
  canViewSettingsTab: boolean;
  canManageMatches: boolean;
  canManageChampionshipStatus: boolean;
  canManageScoreboard: boolean;
  canManageTeams: boolean;
  canManageLeagueEvents: boolean;
  canManageUsers: boolean;
  canManageSettings: boolean;
  defaultTabValue: AdminPanelTab;
  updatingChampionshipStatus: boolean;
  onChampionshipCodeChange: (value: string) => void;
  onChampionshipStatusChange: (value: string) => void;
  onSignOut: () => void;
  onRefetchMatches: () => void;
  onRefetchTeams: () => void;
  onRefetchChampionships: () => void;
}

interface AdminTabItem {
  value: AdminPanelTab;
  label: string;
}

export function AdminPageView({
  championships,
  selectedChampionship,
  selectedChampionshipCode,
  matches,
  teams,
  sports,
  championshipSports,
  liveAndScheduledMatches,
  profileName,
  canViewMatchesTab,
  canViewControlTab,
  canViewTeamsTab,
  canViewSportsTab,
  canViewEventsTab,
  canViewLogsTab,
  canViewUsersTab,
  canViewSettingsTab,
  canManageMatches,
  canManageChampionshipStatus,
  canManageScoreboard,
  canManageTeams,
  canManageLeagueEvents,
  canManageUsers,
  canManageSettings,
  defaultTabValue,
  updatingChampionshipStatus,
  onChampionshipCodeChange,
  onChampionshipStatusChange,
  onSignOut,
  onRefetchMatches,
  onRefetchTeams,
  onRefetchChampionships,
}: AdminPageViewProps) {
  const adminTabItems = useMemo(() => {
    const nextAdminTabItems: AdminTabItem[] = [];

    if (canViewMatchesTab) {
      nextAdminTabItems.push({ value: AdminPanelTab.MATCHES, label: "Jogos" });
    }

    if (canViewControlTab) {
      nextAdminTabItems.push({ value: AdminPanelTab.CONTROL, label: "Controle ao Vivo" });
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

    if (canViewSettingsTab) {
      nextAdminTabItems.push({ value: AdminPanelTab.SETTINGS, label: "Configurações" });
    }

    return nextAdminTabItems;
  }, [
    canViewControlTab,
    canViewEventsTab,
    canViewLogsTab,
    canViewMatchesTab,
    canViewSettingsTab,
    canViewSportsTab,
    canViewTeamsTab,
    canViewUsersTab,
  ]);

  const tabsListRef = useRef<HTMLDivElement | null>(null);
  const tabTriggerByValueRef = useRef<Partial<Record<AdminPanelTab, HTMLButtonElement | null>>>({});
  const [activeTab, setActiveTab] = useState<AdminPanelTab>(defaultTabValue);
  const [activeIndicatorLeft, setActiveIndicatorLeft] = useState(0);
  const [activeIndicatorWidth, setActiveIndicatorWidth] = useState(0);
  const [showActiveIndicator, setShowActiveIndicator] = useState(false);

  useEffect(() => {
    const hasActiveTab = adminTabItems.some((adminTabItem) => adminTabItem.value == activeTab);

    if (!hasActiveTab) {
      setActiveTab(defaultTabValue);
    }
  }, [activeTab, adminTabItems, defaultTabValue]);

  const updateActiveIndicator = useCallback(() => {
    if (!tabsListRef.current) {
      setShowActiveIndicator(false);
      return;
    }

    const activeTabTriggerElement = tabTriggerByValueRef.current[activeTab];

    if (!activeTabTriggerElement) {
      setShowActiveIndicator(false);
      return;
    }

    const tabsListRect = tabsListRef.current.getBoundingClientRect();
    const activeTabTriggerRect = activeTabTriggerElement.getBoundingClientRect();

    setActiveIndicatorLeft(activeTabTriggerRect.left - tabsListRect.left);
    setActiveIndicatorWidth(activeTabTriggerRect.width);
    setShowActiveIndicator(true);
  }, [activeTab]);

  useLayoutEffect(() => {
    const animationFrameId = requestAnimationFrame(updateActiveIndicator);
    return () => cancelAnimationFrame(animationFrameId);
  }, [updateActiveIndicator]);

  useEffect(() => {
    window.addEventListener("resize", updateActiveIndicator);
    return () => window.removeEventListener("resize", updateActiveIndicator);
  }, [updateActiveIndicator]);

  return (
    <div className="app-page">
      <Header />
      <main className="container py-8 space-y-5">
        <div className="glass-panel enter-section flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="w-full lg:w-auto">
              <div className="mb-2 flex justify-center sm:hidden">
                <OnlineVisitorsBadge
                  context={OnlineVisitorsContext.SITE_TOTAL}
                  showLabel
                />
              </div>
              <div className="flex items-center justify-center gap-4 sm:justify-start">
                <h1 className="text-center text-2xl font-display font-bold sm:text-left">Painel Admin</h1>
                <OnlineVisitorsBadge
                  context={OnlineVisitorsContext.SITE_TOTAL}
                  showLabel
                  className="hidden sm:inline-flex"
                />
              </div>
            </div>

            <div className="flex w-full items-center gap-2 lg:w-auto">
              <Select value={selectedChampionshipCode} onValueChange={onChampionshipCodeChange}>
                <SelectTrigger className="glass-input h-10 min-w-0 flex-1 sm:w-[280px] sm:flex-none">
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

        {canManageChampionshipStatus ? (
          <div className="glass-panel enter-section flex flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
            <span className="text-sm font-medium">Status do campeonato</span>

            <Select
              value={selectedChampionship.status}
              onValueChange={onChampionshipStatusChange}
              disabled={updatingChampionshipStatus}
            >
              <SelectTrigger className="glass-input h-10 w-full sm:w-52">
                <SelectValue placeholder="Alterar status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ChampionshipStatus.PLANNING}>
                  {CHAMPIONSHIP_STATUS_LABELS[ChampionshipStatus.PLANNING]}
                </SelectItem>
                <SelectItem value={ChampionshipStatus.UPCOMING}>
                  {CHAMPIONSHIP_STATUS_LABELS[ChampionshipStatus.UPCOMING]}
                </SelectItem>
                <SelectItem value={ChampionshipStatus.IN_PROGRESS}>
                  {CHAMPIONSHIP_STATUS_LABELS[ChampionshipStatus.IN_PROGRESS]}
                </SelectItem>
                <SelectItem value={ChampionshipStatus.FINISHED}>
                  {CHAMPIONSHIP_STATUS_LABELS[ChampionshipStatus.FINISHED]}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {profileName ? (
          <p className="text-sm text-muted-foreground">Perfil atual: {profileName}.</p>
        ) : null}

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AdminPanelTab)} className="enter-section space-y-6">
          <TabsList
            ref={tabsListRef}
            className="glass-chip relative flex h-auto w-full items-center justify-start gap-0 overflow-x-auto rounded-xl p-0"
          >
            <span
              className="pointer-events-none absolute inset-y-0 left-0 rounded-xl bg-primary/22 backdrop-blur-2xl transition-[transform,width,opacity] duration-500"
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
                className="relative z-10 whitespace-nowrap rounded-none px-3 py-2.5 text-sm font-medium transition-colors first:rounded-l-xl last:rounded-r-xl sm:px-4 data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
              >
                {adminTabItem.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {canViewMatchesTab ? (
            <TabsContent value={AdminPanelTab.MATCHES}>
              <AdminMatches
                matches={matches}
                teams={teams}
                championshipSports={championshipSports}
                selectedChampionship={selectedChampionship}
                canManageMatches={canManageMatches}
                onRefetch={onRefetchMatches}
                onRefetchChampionships={onRefetchChampionships}
              />
            </TabsContent>
          ) : null}

          {canViewControlTab ? (
            <TabsContent value={AdminPanelTab.CONTROL}>
              <AdminMatchControl
                matches={liveAndScheduledMatches}
                onRefetch={onRefetchMatches}
                canManageScoreboard={canManageScoreboard}
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
