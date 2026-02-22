import { useState } from 'react';
import { Header } from '@/components/Header';
import { LiveMatchBanner } from '@/components/LiveMatchBanner';
import { MatchCard } from '@/components/MatchCard';
import { StandingsTable } from '@/components/StandingsTable';
import { SportFilter } from '@/components/SportFilter';
import { useMatches } from '@/hooks/useMatches';
import { useStandings } from '@/hooks/useStandings';
import { useSports } from '@/hooks/useSports';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const { liveMatches, upcomingMatches, loading: matchesLoading } = useMatches();
  const { standings, loading: standingsLoading } = useStandings();
  const { sports } = useSports();
  const [sportFilter, setSportFilter] = useState<string | null>(null);

  const filteredUpcoming = sportFilter
    ? upcomingMatches.filter(m => m.sport_id === sportFilter)
    : upcomingMatches;

  const filteredStandings = sportFilter
    ? standings.filter(s => s.sport_id === sportFilter)
    : standings;

  const filteredLive = sportFilter
    ? liveMatches.filter(m => m.sport_id === sportFilter)
    : liveMatches;

  if (matchesLoading || standingsLoading) {
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
      <main className="container py-8 space-y-10">
        {/* Live Banner */}
        <LiveMatchBanner matches={filteredLive} />

        {/* Filters */}
        <SportFilter sports={sports} selected={sportFilter} onSelect={setSportFilter} />

        {/* Upcoming */}
        <section>
          <h2 className="text-xl font-display font-bold mb-4">Próximos Jogos</h2>
          {filteredUpcoming.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum jogo agendado.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredUpcoming.map(match => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          )}
        </section>

        {/* Standings */}
        <section>
          <h2 className="text-xl font-display font-bold mb-4">Classificação</h2>
          <StandingsTable standings={filteredStandings} />
        </section>
      </main>
    </div>
  );
};

export default Index;
