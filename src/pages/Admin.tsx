import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMatches } from '@/hooks/useMatches';
import { useSports } from '@/hooks/useSports';
import { useTeams } from '@/hooks/useTeams';
import { Header } from '@/components/Header';
import { AdminTeams } from '@/components/admin/AdminTeams';
import { AdminSports } from '@/components/admin/AdminSports';
import { AdminMatches } from '@/components/admin/AdminMatches';
import { AdminMatchControl } from '@/components/admin/AdminMatchControl';
import { Button } from '@/components/ui/button';
import { Loader2, LogOut } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Admin = () => {
  const { user, isAdmin, loading, signOut } = useAuth();
  const { matches, refetch: refetchMatches } = useMatches();
  const { sports, refetch: refetchSports } = useSports();
  const { teams, refetch: refetchTeams } = useTeams();

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) return <Navigate to="/login" replace />;

  const liveAndScheduled = matches.filter(m => m.status === 'LIVE' || m.status === 'SCHEDULED');

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-display font-bold">Painel Admin</h1>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-1" /> Sair
          </Button>
        </div>

        <Tabs defaultValue="matches" className="space-y-6">
          <TabsList className="bg-secondary">
            <TabsTrigger value="matches">Jogos</TabsTrigger>
            <TabsTrigger value="control">Controle ao Vivo</TabsTrigger>
            <TabsTrigger value="teams">Atléticas</TabsTrigger>
            <TabsTrigger value="sports">Modalidades</TabsTrigger>
          </TabsList>

          <TabsContent value="matches">
            <AdminMatches matches={matches} sports={sports} teams={teams} onRefetch={refetchMatches} />
          </TabsContent>

          <TabsContent value="control">
            <AdminMatchControl matches={liveAndScheduled} onRefetch={refetchMatches} />
          </TabsContent>

          <TabsContent value="teams">
            <AdminTeams teams={teams} onRefetch={refetchTeams} />
          </TabsContent>

          <TabsContent value="sports">
            <AdminSports sports={sports} onRefetch={refetchSports} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
