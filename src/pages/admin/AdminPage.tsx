import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMatches } from "@/hooks/useMatches";
import { useSports } from "@/hooks/useSports";
import { useTeams } from "@/hooks/useTeams";
import { useChampionships } from "@/hooks/useChampionships";
import { useChampionshipBracket } from "@/hooks/useChampionshipBracket";
import { useSelectedChampionship } from "@/hooks/useSelectedChampionship";
import { useChampionshipSelection } from "@/hooks/useChampionshipSelection";
import { Header } from "@/components/Header";
import { AdminChampionshipBracketWizardModal } from "@/components/admin/AdminChampionshipBracketWizardModal";
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
import { AdminPanelTab, AppRoutePath, ChampionshipStatus, MatchStatus } from "@/lib/enums";
import { isChampionshipStatus, resolveMatchBracketContextByMatchId } from "@/lib/championship";
import { AdminPageView } from "@/pages/admin/AdminPageView";

enum ChampionshipStatusFlowDialog {
  NONE = "NONE",
  RETURN_TO_PLANNING_WITH_GAMES = "RETURN_TO_PLANNING_WITH_GAMES",
  MOVE_TO_UPCOMING_WITH_GAMES = "MOVE_TO_UPCOMING_WITH_GAMES",
  MOBILE_CONFIGURATION_WARNING = "MOBILE_CONFIGURATION_WARNING",
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
  const { championships, loading: championshipsLoading, refetch: refetchChampionships } = useChampionships();
  const { selectedChampionshipCode, setSelectedChampionshipCode } = useSelectedChampionship();
  const [updatingChampionshipStatus, setUpdatingChampionshipStatus] = useState(false);
  const [processingChampionshipStatusFlowAction, setProcessingChampionshipStatusFlowAction] = useState(false);
  const [showChampionshipBracketWizardModal, setShowChampionshipBracketWizardModal] = useState(false);
  const [championshipStatusFlowDialog, setChampionshipStatusFlowDialog] = useState<ChampionshipStatusFlowDialog>(
    ChampionshipStatusFlowDialog.NONE,
  );

  const { selectedChampionship, selectedChampionshipId, handleChampionshipCodeChange } = useChampionshipSelection({
    championships,
    selectedChampionshipCode,
    setSelectedChampionshipCode,
  });
  const selectedChampionshipSeasonYear = selectedChampionship?.current_season_year ?? null;

  const { matches, refetch: refetchMatches } = useMatches({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
  });
  const {
    championshipBracketView,
    loading: loadingChampionshipBracket,
    refetch: refetchChampionshipBracket,
  } = useChampionshipBracket({
    championshipId: selectedChampionshipId,
    seasonYear: selectedChampionshipSeasonYear,
  });
  const { teams, refetch: refetchTeams } = useTeams();
  const { sports } = useSports();
  const { championshipSports } = useSports({
    championshipId: selectedChampionshipId,
  });
  const liveAndScheduledMatches = matches.filter(
    (match) => match.status == MatchStatus.LIVE || match.status == MatchStatus.SCHEDULED,
  );
  const matchBracketContextByMatchId = useMemo(() => {
    return resolveMatchBracketContextByMatchId(championshipBracketView);
  }, [championshipBracketView]);

  const closeChampionshipStatusFlowDialog = () => {
    if (processingChampionshipStatusFlowAction) {
      return;
    }

    setChampionshipStatusFlowDialog(ChampionshipStatusFlowDialog.NONE);
  };

  const resolveIsMobileViewport = () => {
    if (typeof window == "undefined") {
      return false;
    }

    return window.matchMedia("(max-width: 767px)").matches;
  };

  const handleOpenMobileChampionshipConfigurationWarning = () => {
    setChampionshipStatusFlowDialog(ChampionshipStatusFlowDialog.MOBILE_CONFIGURATION_WARNING);
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

    await refetchMatches();
    toast.success("Jogos atuais removidos.");
    return true;
  };

  const handleKeepCurrentGamesAndReturnToPlanning = async () => {
    setProcessingChampionshipStatusFlowAction(true);

    const hasUpdatedStatus = await updateChampionshipStatus(ChampionshipStatus.PLANNING);

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

    const hasUpdatedStatus = await updateChampionshipStatus(ChampionshipStatus.PLANNING);

    setProcessingChampionshipStatusFlowAction(false);

    if (hasUpdatedStatus) {
      setChampionshipStatusFlowDialog(ChampionshipStatusFlowDialog.NONE);
    }
  };

  const handleKeepCurrentGamesAndMoveToUpcoming = async () => {
    setProcessingChampionshipStatusFlowAction(true);

    const hasUpdatedStatus = await updateChampionshipStatus(ChampionshipStatus.UPCOMING);

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
    setShowChampionshipBracketWizardModal(true);
  };

  const handleChampionshipStatusChange = async (value: string) => {
    if (!selectedChampionship || !isChampionshipStatus(value)) {
      return;
    }

    if (selectedChampionship.status == value) {
      return;
    }

    if (value == ChampionshipStatus.PLANNING && matches.length > 0) {
      setChampionshipStatusFlowDialog(ChampionshipStatusFlowDialog.RETURN_TO_PLANNING_WITH_GAMES);
      return;
    }

    if (
      selectedChampionship.status == ChampionshipStatus.PLANNING &&
      value == ChampionshipStatus.UPCOMING
    ) {
      if (matches.length > 0) {
        setChampionshipStatusFlowDialog(ChampionshipStatusFlowDialog.MOVE_TO_UPCOMING_WITH_GAMES);
        return;
      }

      if (resolveIsMobileViewport()) {
        handleOpenMobileChampionshipConfigurationWarning();
        return;
      }

      setShowChampionshipBracketWizardModal(true);
      return;
    }

    await updateChampionshipStatus(value);
  };

  if (loading || roleLoading) {
    return (
      <div className="app-page">
        <Header />
        <main className="container py-10">
          <div className="glass-panel flex min-h-[420px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
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
          <div className="glass-panel flex items-center gap-2 p-5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Carregando campeonatos...</span>
          </div>
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
            <p className="text-sm text-muted-foreground">Nenhum campeonato disponível para gerenciamento.</p>
          </div>
        </main>
      </div>
    );
  }

  const canViewMatchesTab = canViewAdminTab(AdminPanelTab.MATCHES);
  const canViewControlTab = canViewAdminTab(AdminPanelTab.CONTROL);
  const canViewTeamsTab = canViewAdminTab(AdminPanelTab.TEAMS);
  const canViewSportsTab = canViewAdminTab(AdminPanelTab.SPORTS);
  const canViewEventsTab = canViewAdminTab(AdminPanelTab.EVENTS);
  const canViewLogsTab = canViewAdminTab(AdminPanelTab.LOGS);
  const canViewUsersTab = canViewAdminTab(AdminPanelTab.USERS);
  const canViewAccountTab = canViewAdminTab(AdminPanelTab.ACCOUNT);
  const canViewSettingsTab = canViewAdminTab(AdminPanelTab.SETTINGS);

  const canManageMatches = canEditAdminTab(AdminPanelTab.MATCHES);
  const canManageChampionshipStatus = canEditAdminTab(AdminPanelTab.MATCHES);
  const canManageTeams = canEditAdminTab(AdminPanelTab.TEAMS);
  const canManageLeagueEvents = canEditAdminTab(AdminPanelTab.EVENTS);
  const canManageUsers = canEditAdminTab(AdminPanelTab.USERS);
  const canManageAccount = canEditAdminTab(AdminPanelTab.ACCOUNT);
  const canManageSettings = canEditAdminTab(AdminPanelTab.SETTINGS);

  const tabPriority: AdminPanelTab[] = [
    AdminPanelTab.MATCHES,
    AdminPanelTab.CONTROL,
    AdminPanelTab.TEAMS,
    AdminPanelTab.SPORTS,
    AdminPanelTab.EVENTS,
    AdminPanelTab.LOGS,
    AdminPanelTab.USERS,
    AdminPanelTab.ACCOUNT,
    AdminPanelTab.SETTINGS,
  ];

  const defaultTabValue =
    tabPriority.find((adminPanelTab) => canViewAdminTab(adminPanelTab)) ?? AdminPanelTab.CONTROL;

  return (
    <>
      <AdminPageView
        championships={championships}
        selectedChampionship={selectedChampionship}
        selectedChampionshipCode={selectedChampionshipCode}
        matches={matches}
        teams={teams}
        sports={sports}
        championshipSports={championshipSports}
        liveAndScheduledMatches={liveAndScheduledMatches}
        championshipBracketView={championshipBracketView}
        loadingChampionshipBracket={loadingChampionshipBracket}
        matchBracketContextByMatchId={matchBracketContextByMatchId}
        profileName={profileName}
        canViewMatchesTab={canViewMatchesTab}
        canViewControlTab={canViewControlTab}
        canViewTeamsTab={canViewTeamsTab}
        canViewSportsTab={canViewSportsTab}
        canViewEventsTab={canViewEventsTab}
        canViewLogsTab={canViewLogsTab}
        canViewUsersTab={canViewUsersTab}
        canViewAccountTab={canViewAccountTab}
        canViewSettingsTab={canViewSettingsTab}
        canManageMatches={canManageMatches}
        canManageChampionshipStatus={canManageChampionshipStatus}
        canManageScoreboard={canManageScoreboard}
        canManageTeams={canManageTeams}
        canManageLeagueEvents={canManageLeagueEvents}
        canManageUsers={canManageUsers}
        canManageAccount={canManageAccount}
        canManageSettings={canManageSettings}
        defaultTabValue={defaultTabValue}
        updatingChampionshipStatus={updatingChampionshipStatus || processingChampionshipStatusFlowAction}
        onChampionshipCodeChange={handleChampionshipCodeChange}
        onChampionshipStatusChange={handleChampionshipStatusChange}
        onSignOut={signOut}
        onRefetchMatches={refetchMatches}
        onRefetchChampionshipBracket={refetchChampionshipBracket}
        onRefetchTeams={refetchTeams}
        onRefetchChampionships={refetchChampionships}
      />

      <AdminChampionshipBracketWizardModal
        open={showChampionshipBracketWizardModal}
        onOpenChange={setShowChampionshipBracketWizardModal}
        selectedChampionship={selectedChampionship}
        teams={teams}
        championshipSports={championshipSports}
        onGenerated={async () => {
          setShowChampionshipBracketWizardModal(false);
          await Promise.all([refetchMatches(), refetchChampionshipBracket(), refetchChampionships()]);
        }}
      />

      <Dialog
        open={championshipStatusFlowDialog == ChampionshipStatusFlowDialog.RETURN_TO_PLANNING_WITH_GAMES}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeChampionshipStatusFlowDialog();
          }
        }}
      >
        <DialogContent className="border-border/60 !bg-background/80 backdrop-blur-md shadow-[0_18px_45px_rgba(15,23,42,0.16)] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Voltar campeonato para Em breve?</DialogTitle>
            <DialogDescription>
              Este campeonato já possui jogos cadastrados. Escolha se eles devem ser mantidos ao voltar o status para
              Em breve.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:justify-end">
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
              variant="secondary"
              onClick={handleKeepCurrentGamesAndReturnToPlanning}
              disabled={processingChampionshipStatusFlowAction}
            >
              {processingChampionshipStatusFlowAction ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Manter jogos atuais
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteCurrentGamesAndReturnToPlanning}
              disabled={processingChampionshipStatusFlowAction}
            >
              {processingChampionshipStatusFlowAction ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Excluir jogos atuais
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={championshipStatusFlowDialog == ChampionshipStatusFlowDialog.MOVE_TO_UPCOMING_WITH_GAMES}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeChampionshipStatusFlowDialog();
          }
        }}
      >
        <DialogContent className="border-border/60 !bg-background/80 backdrop-blur-md shadow-[0_18px_45px_rgba(15,23,42,0.16)] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Jogos atuais já existem</DialogTitle>
            <DialogDescription>
              O campeonato está em Em breve, mas já possui jogos cadastrados. Você pode manter os jogos atuais ou
              limpar tudo para montar uma nova configuração de campeonato.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:justify-end">
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
              variant="secondary"
              onClick={handleKeepCurrentGamesAndMoveToUpcoming}
              disabled={processingChampionshipStatusFlowAction}
            >
              {processingChampionshipStatusFlowAction ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Manter jogos atuais
            </Button>
            <Button
              type="button"
              onClick={handleConfigureNewGames}
              disabled={processingChampionshipStatusFlowAction}
            >
              {processingChampionshipStatusFlowAction ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Configurar novos jogos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={championshipStatusFlowDialog == ChampionshipStatusFlowDialog.MOBILE_CONFIGURATION_WARNING}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeChampionshipStatusFlowDialog();
          }
        }}
      >
        <AlertDialogContent
          overlayClassName="bg-transparent"
          className="border-border/60 !bg-background/80 shadow-[0_18px_45px_rgba(15,23,42,0.16)] backdrop-blur-md"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Configuração disponível apenas no computador</AlertDialogTitle>
            <AlertDialogDescription>
              A configuração do campeonato deve ser feita somente no computador, porque na visão de celular os
              componentes não cabem na tela.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="justify-center sm:justify-center">
            <AlertDialogAction className="w-full sm:w-auto" onClick={closeChampionshipStatusFlowDialog}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
