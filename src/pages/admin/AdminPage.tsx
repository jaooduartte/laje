import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMatches } from "@/hooks/useMatches";
import { useSports } from "@/hooks/useSports";
import { useTeams } from "@/hooks/useTeams";
import { useChampionships } from "@/hooks/useChampionships";
import { useSelectedChampionship } from "@/hooks/useSelectedChampionship";
import { useChampionshipSelection } from "@/hooks/useChampionshipSelection";
import { Header } from "@/components/Header";
import { AdminPanelTab, AppRoutePath, MatchStatus } from "@/lib/enums";
import { isChampionshipStatus } from "@/lib/championship";
import { AdminPageView } from "@/pages/admin/AdminPageView";

export function AdminPage() {
  const { user, isAdmin, isMesa, canAccessAdminPanel, canManageScoreboard, loading, roleLoading, signOut } = useAuth();
  const { championships, loading: championshipsLoading, refetch: refetchChampionships } = useChampionships();
  const { selectedChampionshipCode, setSelectedChampionshipCode } = useSelectedChampionship();
  const [updatingChampionshipStatus, setUpdatingChampionshipStatus] = useState(false);

  const { selectedChampionship, selectedChampionshipId, handleChampionshipCodeChange } = useChampionshipSelection({
    championships,
    selectedChampionshipCode,
    setSelectedChampionshipCode,
  });

  const { matches, refetch: refetchMatches } = useMatches({ championshipId: selectedChampionshipId });
  const { teams, refetch: refetchTeams } = useTeams();
  const { sports } = useSports();
  const { championshipSports } = useSports({
    championshipId: selectedChampionshipId,
  });

  const handleChampionshipStatusChange = async (value: string) => {
    if (!selectedChampionship || !isChampionshipStatus(value)) {
      return;
    }

    setUpdatingChampionshipStatus(true);

    const { error } = await supabase
      .from("championships")
      .update({ status: value })
      .eq("id", selectedChampionship.id);

    setUpdatingChampionshipStatus(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Status do campeonato atualizado.");
    refetchChampionships();
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

  const liveAndScheduledMatches = matches.filter(
    (match) => match.status == MatchStatus.LIVE || match.status == MatchStatus.SCHEDULED,
  );
  const defaultTabValue = isAdmin ? AdminPanelTab.MATCHES : AdminPanelTab.CONTROL;

  return (
    <AdminPageView
      championships={championships}
      selectedChampionship={selectedChampionship}
      selectedChampionshipCode={selectedChampionshipCode}
      matches={matches}
      teams={teams}
      sports={sports}
      championshipSports={championshipSports}
      liveAndScheduledMatches={liveAndScheduledMatches}
      isAdmin={isAdmin}
      isMesa={isMesa}
      canManageScoreboard={canManageScoreboard}
      defaultTabValue={defaultTabValue}
      updatingChampionshipStatus={updatingChampionshipStatus}
      onChampionshipCodeChange={handleChampionshipCodeChange}
      onChampionshipStatusChange={handleChampionshipStatusChange}
      onSignOut={signOut}
      onRefetchMatches={refetchMatches}
      onRefetchTeams={refetchTeams}
      onRefetchChampionships={refetchChampionships}
    />
  );
}
