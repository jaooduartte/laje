import { useState } from 'react';
import { Header } from '@/components/Header';
import { MatchCard } from '@/components/MatchCard';
import { SportFilter } from '@/components/SportFilter';
import { useMatches } from '@/hooks/useMatches';
import { useSports } from '@/hooks/useSports';
import { useTeams } from '@/hooks/useTeams';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const Agenda = () => {
  const { matches, loading } = useMatches();
  const { sports } = useSports();
  const { teams } = useTeams();
  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);

  const filtered = matches.filter(m => {
    if (sportFilter && m.sport_id !== sportFilter) return false;
    if (teamFilter && m.home_team_id !== teamFilter && m.away_team_id !== teamFilter) return false;
    return true;
  });

  // Group by date
  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, match) => {
    const dateKey = format(new Date(match.start_time), 'yyyy-MM-dd');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(match);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort();

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

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container py-8 space-y-6">
        <h1 className="text-2xl font-display font-bold">Agenda de Jogos</h1>

        <div className="flex flex-wrap items-center gap-4">
          <SportFilter sports={sports} selected={sportFilter} onSelect={setSportFilter} />
          <Select value={teamFilter ?? 'all'} onValueChange={(v) => setTeamFilter(v === 'all' ? null : v)}>
            <SelectTrigger className="w-48 bg-secondary border-border">
              <SelectValue placeholder="Filtrar por time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os times</SelectItem>
              {teams.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {sortedDates.length === 0 ? (
          <p className="text-muted-foreground">Nenhum jogo encontrado.</p>
        ) : (
          sortedDates.map(date => (
            <section key={date}>
              <h3 className="text-sm font-display font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {format(new Date(date + 'T12:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {grouped[date].map(match => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
};

export default Agenda;
