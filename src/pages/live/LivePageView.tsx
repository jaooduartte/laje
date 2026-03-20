import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { LiveMatchBanner } from "@/components/LiveMatchBanner";
import { MatchCard } from "@/components/MatchCard";
import { TeamStandingsTable } from "@/components/TeamStandingsTable";
import { SportFilter } from "@/components/SportFilter";
import {
  AppPaginationControls,
  DEFAULT_PAGINATION_ITEMS_PER_PAGE,
} from "@/components/ui/app-pagination-controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsNavigationList, TabsNavigationTrigger } from "@/components/ui/tabs";
import type { Championship, Match, Sport } from "@/lib/types";
import type { ChampionshipBracketView } from "@/lib/types";
import type { MatchBracketContext } from "@/lib/championship";
import { MatchNaipe } from "@/lib/enums";
import { MATCH_NAIPE_LABELS } from "@/lib/championship";
import type { TeamStandingAggregate } from "@/lib/standings";
import { HelpCircle, Loader2 } from "lucide-react";
import { ChampionshipBracketBoard } from "@/components/championship-brackets/ChampionshipBracketBoard";

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
  championTeamName: string | null;
  championshipBracketView: ChampionshipBracketView;
  championshipBracketLoading: boolean;
  matchBracketContextByMatchId: Record<string, MatchBracketContext>;
  matchRepresentationByMatchId: Record<string, string>;
  estimatedStartTimeByMatchId: Record<string, string>;
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
  championTeamName,
  championshipBracketView,
  championshipBracketLoading,
  matchBracketContextByMatchId,
  matchRepresentationByMatchId,
  estimatedStartTimeByMatchId,
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

        <LiveMatchBanner
          matches={filteredLiveMatches}
          matchRepresentationByMatchId={matchRepresentationByMatchId}
          estimatedStartTimeByMatchId={estimatedStartTimeByMatchId}
        />

        <SportFilter sports={sports} selected={sportFilter} onSelect={onSportFilterChange} />

        <Tabs defaultValue="overview" className="enter-section space-y-4">
          <TabsNavigationList className="grid w-full grid-cols-2">
            <TabsNavigationTrigger value="overview">Resumo</TabsNavigationTrigger>
            <TabsNavigationTrigger value="knockout">Mata-mata</TabsNavigationTrigger>
          </TabsNavigationList>

          <TabsContent value="overview" className="space-y-6">
            {championTeamName ? (
              <section className="glass-panel enter-section p-5">
                <h2 className="text-center text-lg font-display font-bold sm:text-left">Destaque do campeonato</h2>
                <p className="mt-2 text-center text-sm text-muted-foreground sm:text-left">
                  Melhor campanha atual: <span className="font-semibold text-foreground">{championTeamName}</span>
                </p>
              </section>
            ) : null}

            <section className="glass-panel enter-section space-y-4 p-5">
              <div className="mb-4 flex items-center justify-center gap-2 sm:justify-start">
                <h2 className="text-center text-xl font-display font-bold sm:text-left">Próximos Jogos</h2>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Ajuda sobre ordenação dos próximos jogos"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    Os próximos jogos são ordenados pela fila operacional de cada modalidade, considerando as quadras
                    disponíveis.
                  </TooltipContent>
                </Tooltip>
              </div>
              {filteredUpcomingMatches.length == 0 ? (
                <p className="text-center text-sm text-muted-foreground sm:text-left">Nenhum jogo agendado.</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {paginatedUpcomingMatches.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        showChampionshipBadge={false}
                        bracketContext={matchBracketContextByMatchId[match.id]}
                        matchRepresentation={matchRepresentationByMatchId[match.id]}
                        estimatedStartTime={estimatedStartTimeByMatchId[match.id]}
                      />
                    ))}
                  </div>

                  <AppPaginationControls
                    currentPage={upcomingMatchesCurrentPage}
                    totalPages={upcomingMatchesTotalPages}
                    onPageChange={setUpcomingMatchesCurrentPage}
                    itemsPerPage={upcomingMatchesItemsPerPage}
                    onItemsPerPageChange={setUpcomingMatchesItemsPerPage}
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
          </TabsContent>

          <TabsContent value="knockout" className="space-y-3 glass-panel p-5">
            <h2 className="text-center text-xl font-display font-bold sm:text-left">Mata-mata do Campeonato</h2>
            <ChampionshipBracketBoard
              championshipBracketView={championshipBracketView}
              loading={championshipBracketLoading}
              emptyMessage="Este campeonato ainda não possui mata-mata gerado."
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
