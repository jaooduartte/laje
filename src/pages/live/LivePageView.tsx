import { useEffect, useRef } from "react";
import { Header } from "@/components/Header";
import { ChampionshipIndividualSessionCard } from "@/components/ChampionshipIndividualSessionCard";
import { LiveMatchBanner } from "@/components/LiveMatchBanner";
import { MatchCard } from "@/components/MatchCard";
import { SportFilter } from "@/components/SportFilter";
import { AppPaginationControls } from "@/components/ui/app-pagination-controls";
import { MatchListSkeleton } from "@/components/skeletons/MatchListSkeleton";
import { PageContentSkeleton } from "@/components/skeletons/PageContentSkeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Tabs,
  TabsContent,
  TabsNavigationList,
  TabsNavigationTrigger,
} from "@/components/ui/tabs";
import type {
  Championship,
  ChampionshipBracketView,
  Match,
  Sport,
} from "@/lib/types";
import type { MatchBracketContext } from "@/lib/championship";
import { HelpCircle } from "lucide-react";
import { ChampionshipBracketBoard } from "@/components/championship-brackets/ChampionshipBracketBoard";
import { scrollToTopOfPage } from "@/lib/scroll";
import type { PublicScheduleTimelineItem } from "@/domain/public-schedule/publicScheduleTimeline";

interface LivePageViewProps {
  isLoading: boolean;
  featuredChampionship: Championship | null;
  filteredLiveMatches: Match[];
  upcomingScheduleItems: PublicScheduleTimelineItem[];
  isUpcomingMatchesFetching: boolean;
  upcomingMatchesCurrentPage: number;
  upcomingMatchesItemsPerPage: number;
  upcomingMatchesTotalPages: number;
  sports: Sport[];
  sportFilter: string | null;
  championshipBracketView: ChampionshipBracketView;
  championshipBracketLoading: boolean;
  matchBracketContextByMatchId: Record<string, MatchBracketContext>;
  matchRepresentationByMatchId: Record<string, string>;
  visualQueuePositionByMatchId?: Record<string, number>;
  estimatedStartTimeByMatchId: Record<string, string>;
  onSportFilterChange: (value: string | null) => void;
  onUpcomingMatchesPageChange: (page: number) => void;
  onUpcomingMatchesItemsPerPageChange: (value: number) => void;
}

export function LivePageView({
  isLoading,
  featuredChampionship,
  filteredLiveMatches,
  upcomingScheduleItems,
  isUpcomingMatchesFetching,
  upcomingMatchesCurrentPage,
  upcomingMatchesItemsPerPage,
  upcomingMatchesTotalPages,
  sports,
  sportFilter,
  championshipBracketView,
  championshipBracketLoading,
  matchBracketContextByMatchId,
  matchRepresentationByMatchId,
  visualQueuePositionByMatchId = {},
  estimatedStartTimeByMatchId,
  onSportFilterChange,
  onUpcomingMatchesPageChange,
  onUpcomingMatchesItemsPerPageChange,
}: LivePageViewProps) {
  const hasHandledPaginationScrollRef = useRef(false);

  useEffect(() => {
    if (!hasHandledPaginationScrollRef.current) {
      hasHandledPaginationScrollRef.current = true;
      return;
    }

    scrollToTopOfPage();
  }, [upcomingMatchesCurrentPage]);

  if (isLoading) {
    return (
      <div className="app-page">
        <Header />

        <main className="container py-8">
          <PageContentSkeleton filterCount={3} contentCount={3} />
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
            <p className="text-sm text-muted-foreground">
              Nenhum campeonato disponível.
            </p>
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

        <SportFilter
          sports={sports}
          selected={sportFilter}
          onSelect={onSportFilterChange}
        />

        <Tabs defaultValue="overview" className="enter-section space-y-4">
          <TabsNavigationList className="grid w-full grid-cols-2">
            <TabsNavigationTrigger value="overview">
              Resumo
            </TabsNavigationTrigger>
            <TabsNavigationTrigger value="knockout">
              Mata-mata
            </TabsNavigationTrigger>
          </TabsNavigationList>

          <TabsContent value="overview" className="space-y-6">
            <section className="glass-panel enter-section space-y-4 p-5">
              <div className="mb-4 flex items-center justify-center gap-2">
                <h2 className="text-center text-xl font-display font-bold">
                  Próximos Jogos
                </h2>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="hidden h-5 w-5 items-center justify-center rounded-full app-help-icon-button text-xs sm:inline-flex"
                      aria-label="Ajuda sobre ordenação dos próximos jogos"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    Os próximos jogos seguem a programação operacional do
                    campeonato. O número exibido em cada jogo respeita a
                    configuração de numeração definida no chaveamento.
                  </TooltipContent>
                </Tooltip>
              </div>
              {isUpcomingMatchesFetching ? (
                <MatchListSkeleton
                  count={Math.max(3, upcomingMatchesItemsPerPage)}
                  className="grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                />
              ) : upcomingScheduleItems.length == 0 ? (
                <p className="text-center text-sm text-muted-foreground">
                  Nenhum jogo agendado.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="grid items-center grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {upcomingScheduleItems.map((item) =>
                      item.type == "MATCH" ? (
                        <MatchCard
                          key={item.id}
                          match={item.match}
                          showChampionshipBadge={false}
                          bracketContext={
                            matchBracketContextByMatchId[item.match.id]
                          }
                          matchRepresentation={
                            matchRepresentationByMatchId[item.match.id]
                          }
                          visualQueuePosition={
                            visualQueuePositionByMatchId[item.match.id]
                          }
                          estimatedStartTime={
                            estimatedStartTimeByMatchId[item.match.id]
                          }
                        />
                      ) : item.type == "INDIVIDUAL_SESSION" ? (
                        <ChampionshipIndividualSessionCard
                          key={item.id}
                          session={item.session}
                          eventCount={item.eventCount}
                        />
                      ) : null,
                    )}
                  </div>

                  <AppPaginationControls
                    currentPage={upcomingMatchesCurrentPage}
                    totalPages={upcomingMatchesTotalPages}
                    onPageChange={onUpcomingMatchesPageChange}
                    itemsPerPage={upcomingMatchesItemsPerPage}
                    onItemsPerPageChange={onUpcomingMatchesItemsPerPageChange}
                  />
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="knockout" className="space-y-3 glass-panel p-5">
            <h2 className="text-center text-xl font-display font-bold">
              Mata-mata do Campeonato
            </h2>
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
