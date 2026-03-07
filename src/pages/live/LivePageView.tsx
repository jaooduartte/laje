import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { LiveMatchBanner } from "@/components/LiveMatchBanner";
import { MatchCard } from "@/components/MatchCard";
import { TeamStandingsTable } from "@/components/TeamStandingsTable";
import { SportFilter } from "@/components/SportFilter";
import {
  AppItemsPerPageControl,
  AppPaginationControls,
  DEFAULT_PAGINATION_ITEMS_PER_PAGE,
} from "@/components/ui/app-pagination-controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Championship, Match, Sport } from "@/lib/types";
import { MatchNaipe } from "@/lib/enums";
import { MATCH_NAIPE_LABELS } from "@/lib/championship";
import type { TeamStandingAggregate } from "@/lib/standings";
import { Loader2 } from "lucide-react";

interface LivePageViewProps {
  isLoading: boolean;
  featuredChampionship: Championship | null;
  filteredLiveMatches: Match[];
  filteredUpcomingMatches: Match[];
  sports: Sport[];
  sportFilter: string | null;
  standingsSportFilter: string;
  standingsNaipeFilter: string;
  allStandingsSportFilter: string;
  allStandingsNaipeFilter: string;
  filteredStandings: TeamStandingAggregate[];
  standingsShowCardColumns: boolean;
  onSportFilterChange: (value: string | null) => void;
  onStandingsSportFilterChange: (value: string) => void;
  onStandingsNaipeFilterChange: (value: string) => void;
}

export function LivePageView({
  isLoading,
  featuredChampionship,
  filteredLiveMatches,
  filteredUpcomingMatches,
  sports,
  sportFilter,
  standingsSportFilter,
  standingsNaipeFilter,
  allStandingsSportFilter,
  allStandingsNaipeFilter,
  filteredStandings,
  standingsShowCardColumns,
  onSportFilterChange,
  onStandingsSportFilterChange,
  onStandingsNaipeFilterChange,
}: LivePageViewProps) {
  const [upcomingMatchesCurrentPage, setUpcomingMatchesCurrentPage] = useState(1);
  const [upcomingMatchesItemsPerPage, setUpcomingMatchesItemsPerPage] = useState(DEFAULT_PAGINATION_ITEMS_PER_PAGE);

  useEffect(() => {
    setUpcomingMatchesCurrentPage(1);
  }, [featuredChampionship?.id, sportFilter, upcomingMatchesItemsPerPage]);

  const upcomingMatchesTotalPages = Math.max(1, Math.ceil(filteredUpcomingMatches.length / upcomingMatchesItemsPerPage));

  const paginatedUpcomingMatches = useMemo(() => {
    const rangeStart = (upcomingMatchesCurrentPage - 1) * upcomingMatchesItemsPerPage;
    const rangeEnd = rangeStart + upcomingMatchesItemsPerPage;

    return filteredUpcomingMatches.slice(rangeStart, rangeEnd);
  }, [filteredUpcomingMatches, upcomingMatchesCurrentPage, upcomingMatchesItemsPerPage]);

  useEffect(() => {
    if (upcomingMatchesCurrentPage > upcomingMatchesTotalPages) {
      setUpcomingMatchesCurrentPage(upcomingMatchesTotalPages);
    }
  }, [upcomingMatchesCurrentPage, upcomingMatchesTotalPages]);

  if (isLoading) {
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

  if (!featuredChampionship) {
    return (
      <div className="app-page">
        <Header />
        <main className="container py-8">
          <div className="glass-panel p-5">
            <p className="text-sm text-muted-foreground">Nenhum campeonato disponível.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-page">
      <Header />
      <main className="container py-8 space-y-6">
        <section className="glass-panel enter-section flex flex-col items-center justify-center gap-2 p-6">
          <h1 className="text-2xl font-bold">{featuredChampionship.name}</h1>
        </section>

        <LiveMatchBanner matches={filteredLiveMatches} />

        <SportFilter sports={sports} selected={sportFilter} onSelect={onSportFilterChange} />

        <section className="glass-panel enter-section space-y-4 p-5">
          <h2 className="mb-4 text-center text-xl font-display font-bold sm:text-left">Próximos Jogos</h2>
          {filteredUpcomingMatches.length == 0 ? (
            <p className="text-center text-sm text-muted-foreground sm:text-left">Nenhum jogo agendado.</p>
          ) : (
            <div className="space-y-4">
              <AppItemsPerPageControl
                itemsPerPage={upcomingMatchesItemsPerPage}
                onItemsPerPageChange={setUpcomingMatchesItemsPerPage}
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {paginatedUpcomingMatches.map((match) => (
                  <MatchCard key={match.id} match={match} showChampionshipBadge={false} />
                ))}
              </div>

              <AppPaginationControls
                currentPage={upcomingMatchesCurrentPage}
                totalPages={upcomingMatchesTotalPages}
                onPageChange={setUpcomingMatchesCurrentPage}
              />
            </div>
          )}
        </section>

        <section className="glass-panel enter-section space-y-4 p-5">
          <h2 className="text-center text-xl font-display font-bold sm:text-left">Classificação</h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select value={standingsSportFilter} onValueChange={onStandingsSportFilterChange}>
              <SelectTrigger className="glass-input w-full">
                <SelectValue placeholder="Filtrar modalidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={allStandingsSportFilter}>Todas as modalidades</SelectItem>
                {sports.map((sport) => (
                  <SelectItem key={sport.id} value={sport.id}>
                    {sport.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={standingsNaipeFilter} onValueChange={onStandingsNaipeFilterChange}>
              <SelectTrigger className="glass-input w-full">
                <SelectValue placeholder="Filtrar naipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={allStandingsNaipeFilter}>Todos os naipes</SelectItem>
                <SelectItem value={MatchNaipe.MASCULINO}>{MATCH_NAIPE_LABELS[MatchNaipe.MASCULINO]}</SelectItem>
                <SelectItem value={MatchNaipe.FEMININO}>{MATCH_NAIPE_LABELS[MatchNaipe.FEMININO]}</SelectItem>
                <SelectItem value={MatchNaipe.MISTO}>{MATCH_NAIPE_LABELS[MatchNaipe.MISTO]}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <TeamStandingsTable standings={filteredStandings} showCardColumns={standingsShowCardColumns} />
        </section>
      </main>
    </div>
  );
}
