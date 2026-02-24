import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMatches } from "@/hooks/useMatches";
import { useSports } from "@/hooks/useSports";
import { useTeams } from "@/hooks/useTeams";
import { useChampionships } from "@/hooks/useChampionships";
import { useSelectedChampionship } from "@/hooks/useSelectedChampionship";
import { Header } from "@/components/Header";
import { AdminTeams } from "@/components/admin/AdminTeams";
import { AdminSports } from "@/components/admin/AdminSports";
import { AdminMatches } from "@/components/admin/AdminMatches";
import { AdminMatchControl } from "@/components/admin/AdminMatchControl";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChampionshipCode, ChampionshipStatus, MatchStatus } from "@/lib/enums";
import { CHAMPIONSHIP_STATUS_LABELS, isChampionshipStatus } from "@/lib/championship";

const Admin = () => {
  const { user, isAdmin, isMesa, canAccessAdminPanel, canManageScoreboard, loading, roleLoading, signOut } = useAuth();
  const { championships, loading: championshipsLoading, refetch: refetchChampionships } = useChampionships();
  const { selectedChampionshipCode, setSelectedChampionshipCode } = useSelectedChampionship();
  const [updatingChampionshipStatus, setUpdatingChampionshipStatus] = useState(false);

  const selectedChampionship = useMemo(() => {
    return championships.find((championship) => championship.code === selectedChampionshipCode) ?? null;
  }, [championships, selectedChampionshipCode]);

  const handleChampionshipCodeChange = (value: string) => {
    if (
      value === ChampionshipCode.CLV ||
      value === ChampionshipCode.SOCIETY ||
      value === ChampionshipCode.INTERLAJE
    ) {
      setSelectedChampionshipCode(value);
    }
  };

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

  useEffect(() => {
    if (championships.length === 0) {
      return;
    }

    const selectedChampionshipExists = championships.some(
      (championship) => championship.code === selectedChampionshipCode,
    );

    if (!selectedChampionshipExists) {
      setSelectedChampionshipCode(championships[0].code);
    }
  }, [championships, selectedChampionshipCode, setSelectedChampionshipCode]);

  const selectedChampionshipId = selectedChampionship?.id ?? null;

  const { matches, refetch: refetchMatches } = useMatches({ championshipId: selectedChampionshipId });
  const { teams, refetch: refetchTeams } = useTeams();
  const { sports } = useSports();
  const { championshipSports } = useSports({
    championshipId: selectedChampionshipId,
  });

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!user || !canAccessAdminPanel) {
    return <Navigate to="/login" replace />;
  }

  if (championshipsLoading && championships.length == 0) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="container py-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Carregando campeonatos...</span>
          </div>
        </main>
      </div>
    );
  }

  if (!selectedChampionship) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="container py-8">
          <p className="text-sm text-muted-foreground">Nenhum campeonato disponível para gerenciamento.</p>
        </main>
      </div>
    );
  }

  const liveAndScheduledMatches = matches.filter(
    (match) => match.status === MatchStatus.LIVE || match.status === MatchStatus.SCHEDULED,
  );
  const defaultTabValue = isAdmin ? "matches" : "control";

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container py-8 space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-2xl font-display font-bold">Painel Admin</h1>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedChampionshipCode} onValueChange={handleChampionshipCodeChange}>
              <SelectTrigger className="w-[280px] bg-secondary border-border">
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

            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-1" /> Sair
            </Button>
          </div>
        </div>

        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <span className="text-sm font-medium">Status do campeonato</span>

            <Select
              value={selectedChampionship.status}
              onValueChange={handleChampionshipStatusChange}
              disabled={updatingChampionshipStatus}
            >
              <SelectTrigger className="w-52 bg-secondary border-border">
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

        {isMesa ? <p className="text-sm text-muted-foreground">Perfil mesa: acesso apenas ao controle de placar.</p> : null}

        <Tabs defaultValue={defaultTabValue} className="space-y-6">
          <TabsList className="bg-secondary">
            {isAdmin ? <TabsTrigger value="matches">Jogos</TabsTrigger> : null}
            <TabsTrigger value="control">Controle ao Vivo</TabsTrigger>
            {isAdmin ? <TabsTrigger value="teams">Atléticas</TabsTrigger> : null}
            {isAdmin ? <TabsTrigger value="sports">Modalidades</TabsTrigger> : null}
          </TabsList>

          {isAdmin ? (
            <TabsContent value="matches">
              <AdminMatches
                matches={matches}
                teams={teams}
                championshipSports={championshipSports}
                selectedChampionship={selectedChampionship}
                onRefetch={refetchMatches}
                onRefetchChampionships={refetchChampionships}
              />
            </TabsContent>
          ) : null}

          <TabsContent value="control">
            <AdminMatchControl
              matches={liveAndScheduledMatches}
              onRefetch={refetchMatches}
              canManageScoreboard={canManageScoreboard}
            />
          </TabsContent>

          {isAdmin ? (
            <TabsContent value="teams">
              <AdminTeams teams={teams} onRefetch={refetchTeams} />
            </TabsContent>
          ) : null}

          {isAdmin ? (
            <TabsContent value="sports">
              <AdminSports
                sports={sports}
                championshipSports={championshipSports}
                selectedChampionship={selectedChampionship}
              />
            </TabsContent>
          ) : null}
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
