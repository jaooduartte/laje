import { useEffect, useRef, useState } from "react";
import { Award, HelpCircle, Loader2, Medal, Trophy } from "lucide-react";
import { Header } from "@/components/Header";
import { MatchCard } from "@/components/MatchCard";
import { TeamStandingsTable } from "@/components/TeamStandingsTable";
import { Tabs, TabsContent, TabsNavigationList, TabsNavigationTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatStandingsPoints, type TeamStandingAggregate } from "@/lib/standings";
import type { Championship, Match, Sport, Team } from "@/lib/types";
import type {
  BracketGroupFilterOption,
  MatchBracketContext,
} from "@/lib/championship";
import type { ChampionshipChampionYearGroup } from "@/lib/championshipHistory";
import type { ChampionshipAwardsRankings } from "@/hooks/useChampionshipAwardsRankings";
import { ChampionshipCode, MatchNaipe, TeamDivision } from "@/lib/enums";
import { MATCH_NAIPE_LABELS, TEAM_DIVISION_LABELS } from "@/lib/championship";
import type { ModalidadeConfig } from "@/lib/modalidadeConfig";

interface ChampionshipsPageViewProps {
  isLoading: boolean;
  isStandingsLoading: boolean;
  championships: Championship[];
  selectedChampionship: Championship | null;
  selectedChampionshipCode: ChampionshipCode;
  selectedChampionshipIsFinished: boolean;
  championshipCardImageByCode: Record<ChampionshipCode, string>;
  sports: Sport[];
  nextMatches: Match[];
  isNextMatchesFetching: boolean;
  standingsSportFilter: string;
  standingsNaipeFilter: string;
  standingsYearFilter: string;
  standingsDivisionFilter: string;
  allStandingsSportFilter: string;
  allStandingsNaipeFilter: string;
  allStandingsDivisionFilter: string;
  selectedChampionshipHasDivisions: boolean;
  filteredStandings: TeamStandingAggregate[];
  isStandingsNaipeFilterLocked: boolean;
  standingsModalidadeConfig?: ModalidadeConfig;
  teamFilter: string;
  yearFilter: string;
  groupFilter: string;
  allTeamFilter: string;
  allYearFilter: string;
  availableStandingsYears: string[];
  historyGroupOptions: BracketGroupFilterOption[];
  historyTeams: Team[];
  historyYears: string[];
  filteredHistoryMatches: Match[];
  isHistoryMatchesFetching: boolean;
  championshipChampionHistory: ChampionshipChampionYearGroup[];
  overallPodiumStandings: TeamStandingAggregate[];
  awardsRankings: ChampionshipAwardsRankings | null;
  awardsSeasonYear: number | null;
  matchBracketContextByMatchId: Record<string, MatchBracketContext>;
  matchRepresentationByMatchId: Record<string, string>;
  estimatedStartTimeByMatchId: Record<string, string>;
  onSelectChampionshipCode: (value: ChampionshipCode) => void;
  onStandingsSportFilterChange: (value: string) => void;
  onStandingsNaipeFilterChange: (value: string) => void;
  onStandingsDivisionFilterChange: (value: string) => void;
  onStandingsYearFilterChange: (value: string) => void;
  onTeamFilterChange: (value: string) => void;
  onYearFilterChange: (value: string) => void;
  onGroupFilterChange: (value: string) => void;
}

export function ChampionshipsPageView({
  isLoading,
  isStandingsLoading,
  championships,
  selectedChampionship,
  selectedChampionshipCode,
  selectedChampionshipIsFinished,
  championshipCardImageByCode,
  sports,
  nextMatches,
  isNextMatchesFetching,
  standingsSportFilter,
  standingsNaipeFilter,
  standingsYearFilter,
  standingsDivisionFilter,
  allStandingsSportFilter,
  allStandingsNaipeFilter,
  allStandingsDivisionFilter,
  selectedChampionshipHasDivisions,
  filteredStandings,
  isStandingsNaipeFilterLocked,
  standingsModalidadeConfig,
  teamFilter,
  yearFilter,
  groupFilter,
  allTeamFilter,
  allYearFilter,
  availableStandingsYears,
  historyGroupOptions,
  historyTeams,
  historyYears,
  filteredHistoryMatches,
  isHistoryMatchesFetching,
  championshipChampionHistory,
  overallPodiumStandings,
  awardsRankings,
  awardsSeasonYear,
  matchBracketContextByMatchId,
  matchRepresentationByMatchId,
  estimatedStartTimeByMatchId,
  onSelectChampionshipCode,
  onStandingsSportFilterChange,
  onStandingsNaipeFilterChange,
  onStandingsDivisionFilterChange,
  onStandingsYearFilterChange,
  onTeamFilterChange,
  onYearFilterChange,
  onGroupFilterChange,
}: ChampionshipsPageViewProps) {
  const firstPlaceTeam = overallPodiumStandings[0] ?? null;
  const secondPlaceTeam = overallPodiumStandings[1] ?? null;
  const thirdPlaceTeam = overallPodiumStandings[2] ?? null;
  const [isStandingsHelpTooltipHoverOpen, setIsStandingsHelpTooltipHoverOpen] = useState(false);
  const [isStandingsHelpTooltipClickOpen, setIsStandingsHelpTooltipClickOpen] = useState(false);
  const standingsHelpTooltipTimeoutReference = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStandingsHelpTooltipOpen = isStandingsHelpTooltipHoverOpen || isStandingsHelpTooltipClickOpen;

  useEffect(() => {
    return () => {
      if (standingsHelpTooltipTimeoutReference.current) {
        clearTimeout(standingsHelpTooltipTimeoutReference.current);
      }
    };
  }, []);

  const handleStandingsHelpClick = () => {
    if (standingsHelpTooltipTimeoutReference.current) {
      clearTimeout(standingsHelpTooltipTimeoutReference.current);
    }

    setIsStandingsHelpTooltipClickOpen(true);
    standingsHelpTooltipTimeoutReference.current = setTimeout(() => {
      setIsStandingsHelpTooltipClickOpen(false);
      standingsHelpTooltipTimeoutReference.current = null;
    }, 3000);
  };

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

  if (!selectedChampionship) {
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
        <section className="glass-panel enter-section space-y-4 p-5">
          <h1 className="text-center text-2xl font-display font-bold sm:text-left">Campeonatos LAJE</h1>
          <div className="grid gap-3 md:grid-cols-3">
            {championships.map((championship) => {
              const isSelected = championship.code == selectedChampionshipCode;

              return (
                <button
                  key={championship.id}
                  type="button"
                  onClick={() => onSelectChampionshipCode(championship.code)}
                  className={`list-item-card list-item-card-hover enter-item relative h-52 overflow-hidden text-left transition-colors ${
                    isSelected
                      ? "app-card-live-active live-glow"
                      : ""
                  }`}
                >
                  <img
                    src={championshipCardImageByCode[championship.code]}
                    alt={`Arte do campeonato ${championship.name}`}
                    className="h-full w-full bg-background object-contain p-3 dark:bg-[hsl(0_0%_10%)]"
                    loading="lazy"
                  />

                  {isSelected ? <div className="pointer-events-none absolute inset-0 bg-primary/10" /> : null}

                  <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-background/90 via-background/70 to-transparent p-3">
                    <p className="font-display text-base font-bold leading-tight">{championship.name}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <Tabs defaultValue="standings" className="enter-section space-y-4">
          <TabsNavigationList className="grid w-full grid-cols-2">
            <TabsNavigationTrigger value="standings">Classificação</TabsNavigationTrigger>
            <TabsNavigationTrigger value="champions">Campeões</TabsNavigationTrigger>
          </TabsNavigationList>

          <TabsContent value="standings" className="space-y-6">


            <section className="glass-panel enter-section space-y-4 p-5">
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                <h2 className="text-xl font-display font-bold">Classificação</h2>
                <Tooltip
                  open={isStandingsHelpTooltipOpen}
                  onOpenChange={setIsStandingsHelpTooltipHoverOpen}
                >
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={handleStandingsHelpClick}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Informação sobre pontuação"
                    >
                      <HelpCircle className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    Algumas pontuações podem aparecer em formato decimal. Isso ocorre quando um multiplicador de 1,5× é
                    aplicado para equalização proporcional da classificação entre atléticas que jogaram em chaves de tamanhos diferentes.
                  </TooltipContent>
                </Tooltip>
              </div>

              <div
                className={`grid grid-cols-1 gap-3 ${selectedChampionshipHasDivisions ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}
              >
                <Select value={standingsYearFilter} onValueChange={onStandingsYearFilterChange}>
                  <SelectTrigger className="app-input-field w-full">
                    <SelectValue placeholder="Filtrar ano" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={allYearFilter}>Todos os anos</SelectItem>
                    {availableStandingsYears.map((year) => (
                      <SelectItem key={year} value={year}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={standingsSportFilter} onValueChange={onStandingsSportFilterChange}>
                  <SelectTrigger className="app-input-field w-full">
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
                  <SelectTrigger
                    className={`app-input-field w-full ${
                      isStandingsNaipeFilterLocked ? "cursor-not-allowed opacity-60" : ""
                    }`}
                    disabled={isStandingsNaipeFilterLocked}
                  >
                    <SelectValue placeholder="Filtrar naipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={allStandingsNaipeFilter}>Todos os naipes</SelectItem>
                    <SelectItem value={MatchNaipe.MASCULINO}>{MATCH_NAIPE_LABELS[MatchNaipe.MASCULINO]}</SelectItem>
                    <SelectItem value={MatchNaipe.FEMININO}>{MATCH_NAIPE_LABELS[MatchNaipe.FEMININO]}</SelectItem>
                    <SelectItem value={MatchNaipe.MISTO}>{MATCH_NAIPE_LABELS[MatchNaipe.MISTO]}</SelectItem>
                  </SelectContent>
                </Select>

                {selectedChampionshipHasDivisions ? (
                  <Select value={standingsDivisionFilter} onValueChange={onStandingsDivisionFilterChange}>
                    <SelectTrigger className="app-input-field w-full">
                      <SelectValue placeholder="Filtrar divisão" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={allStandingsDivisionFilter}>Todas as divisões</SelectItem>
                      <SelectItem value={TeamDivision.DIVISAO_PRINCIPAL}>{TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_PRINCIPAL]}</SelectItem>
                      <SelectItem value={TeamDivision.DIVISAO_ACESSO}>{TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_ACESSO]}</SelectItem>
                    </SelectContent>
                  </Select>
                ) : null}
              </div>

              <TeamStandingsTable
                standings={filteredStandings}
                modalidadeConfig={standingsModalidadeConfig}
                isLoading={isStandingsLoading}
                variant="public"
              />
            </section>


          </TabsContent>

          <TabsContent value="champions" className="space-y-4 glass-panel p-5">
            <h2 className="text-center text-xl font-display font-bold">Campeões por modalidade</h2>

            {championshipChampionHistory.length == 0 ? (
              <p className="text-center text-sm text-muted-foreground sm:text-left">
                Nenhum campeão identificado para este campeonato.
              </p>
            ) : (
              <div className="space-y-4">
                {championshipChampionHistory.map((championshipChampionYearGroup, index) => (
                  <div
                    key={championshipChampionYearGroup.year}
                    className="space-y-4 rounded-2xl app-card-muted p-4 text-center"
                  >
                    <div className="flex flex-col items-center justify-center gap-1">
                      <h3 className="font-display text-lg font-bold">{championshipChampionYearGroup.year}</h3>
                      <p className="text-xs text-muted-foreground">
                        {championshipChampionYearGroup.champions.length} modalidade(s)
                      </p>
                    </div>

                    {index === 0 && (firstPlaceTeam || secondPlaceTeam || thirdPlaceTeam) ? (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-muted-foreground">Pódio geral (tempo real)</p>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          {firstPlaceTeam ? (
                            <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-center md:order-2">
                              <div className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:bg-amber-500/25 dark:text-amber-200">
                                <Trophy className="h-3.5 w-3.5" />
                                1º lugar
                              </div>
                              <p className="mt-3 font-display text-lg font-bold">{firstPlaceTeam.team_name}</p>
                              <p className="text-sm text-muted-foreground">{formatStandingsPoints(firstPlaceTeam.points)} pts</p>
                            </div>
                          ) : null}

                          {secondPlaceTeam ? (
                            <div className="rounded-2xl app-card-emphasis p-4 text-center md:order-1">
                              <div className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">
                                <Medal className="h-3.5 w-3.5" />
                                2º lugar
                              </div>
                              <p className="mt-3 font-display text-lg font-bold">{secondPlaceTeam.team_name}</p>
                              <p className="text-sm text-muted-foreground">{formatStandingsPoints(secondPlaceTeam.points)} pts</p>
                            </div>
                          ) : null}

                          {thirdPlaceTeam ? (
                            <div className="rounded-2xl app-card-emphasis p-4 text-center md:order-3">
                              <div className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-600 dark:bg-orange-500/20 dark:text-orange-300">
                                <Award className="h-3.5 w-3.5" />
                                3º lugar
                              </div>
                              <p className="mt-3 font-display text-lg font-bold">{thirdPlaceTeam.team_name}</p>
                              <p className="text-sm text-muted-foreground">{formatStandingsPoints(thirdPlaceTeam.points)} pts</p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {championshipChampionYearGroup.champions.map((championshipChampion) => {
                        const isCurrentYear = String(awardsSeasonYear) === championshipChampionYearGroup.year;
                        const awardsReady = isCurrentYear && awardsRankings != null && awardsRankings.pending_matches_count === 0;
                        const scorerDrawResult = awardsRankings?.award_draw_results?.find(
                          (r) =>
                            r.award_type === "TOP_SCORER" &&
                            r.naipe === championshipChampion.naipe &&
                            r.division === (championshipChampion.division ?? null)
                        ) ?? null;
                        const goalkeeperDrawResult = awardsRankings?.award_draw_results?.find(
                          (r) =>
                            r.award_type === "BEST_GOALKEEPER" &&
                            r.naipe === championshipChampion.naipe &&
                            r.division === (championshipChampion.division ?? null)
                        ) ?? null;

                        const filteredScorers = isCurrentYear
                          ? [...(awardsRankings?.top_scorers ?? [])].filter(
                              (s) => s.naipe === championshipChampion.naipe && s.division === championshipChampion.division
                            )
                          : [];
                        const topScorer = isCurrentYear
                          ? (scorerDrawResult
                              ? filteredScorers.find((s) => s.player_id === scorerDrawResult.winner_player_id) ??
                                filteredScorers.sort((a, b) => b.goals - a.goals)[0]
                              : filteredScorers.sort((a, b) => b.goals - a.goals)[0]) ?? null
                          : null;

                        const filteredGoalkeepers = isCurrentYear
                          ? [...(awardsRankings?.best_goalkeepers ?? [])].filter(
                              (g) => g.naipe === championshipChampion.naipe && g.division === championshipChampion.division
                            )
                          : [];
                        const bestGoalkeeper = isCurrentYear
                          ? (goalkeeperDrawResult
                              ? filteredGoalkeepers.find((g) => g.player_id === goalkeeperDrawResult.winner_player_id) ??
                                filteredGoalkeepers.sort(
                                  (a, b) => a.goals_against - b.goals_against || b.matches_count - a.matches_count
                                )[0]
                              : filteredGoalkeepers.sort(
                                  (a, b) => a.goals_against - b.goals_against || b.matches_count - a.matches_count
                                )[0]) ?? null
                          : null;

                        return (
                        <div
                          key={championshipChampion.match_id}
                          className="rounded-2xl app-card-emphasis p-4 text-center shadow-lg"
                        >
                          <div className="space-y-1 text-center">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              {championshipChampion.sport_name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {MATCH_NAIPE_LABELS[championshipChampion.naipe]}
                              {championshipChampion.division
                                ? ` • ${TEAM_DIVISION_LABELS[championshipChampion.division]}`
                                : ""}
                            </p>
                          </div>

                          <div className="mt-4 flex flex-col items-center gap-3">
                            <div className="flex w-full flex-col items-center justify-center gap-1 text-center">
                              <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-600 dark:bg-amber-500/25 dark:text-amber-200">
                                <Trophy className="h-3.5 w-3.5" />
                                Campeã
                              </span>
                              <p className="font-display text-lg font-bold">{championshipChampion.champion_team_name}</p>
                            </div>

                            {championshipChampion.runner_up_team_name || championshipChampion.third_place_team_name ? (
                              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                                {championshipChampion.runner_up_team_name ? (
                                  <div className="rounded-lg border border-border/40 px-2 py-1.5 text-center">
                                    <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">
                                      <Medal className="h-3 w-3" />
                                      Vice
                                    </span>
                                    <p className="mt-1 text-sm font-medium text-foreground/90">
                                      {championshipChampion.runner_up_team_name}
                                    </p>
                                  </div>
                                ) : null}

                                {championshipChampion.third_place_team_name ? (
                                  <div className="rounded-lg border border-border/40 px-2 py-1.5 text-center">
                                    <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-orange-600 dark:bg-orange-500/20 dark:text-orange-300">
                                      <Award className="h-3 w-3" />
                                      3º lugar
                                    </span>
                                    <p className="mt-1 text-sm font-medium text-foreground/90">
                                      {championshipChampion.third_place_team_name}
                                    </p>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>

                          {isCurrentYear ? (
                            <div className="mt-3 border-t border-border/40 pt-3 space-y-1.5">
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-muted-foreground shrink-0">Artilheiro</span>
                                {awardsReady && topScorer ? (
                                  <span className="truncate text-right font-medium">
                                    {topScorer.player_name}
                                    <span className="ml-1 text-muted-foreground">
                                      • {topScorer.team_name} • {topScorer.goals} {topScorer.goals === 1 ? "gol" : "gols"}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </div>
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-muted-foreground shrink-0">Melhor goleiro</span>
                                {awardsReady && bestGoalkeeper ? (
                                  <span className="truncate text-right font-medium">
                                    {bestGoalkeeper.player_name}
                                    <span className="ml-1 text-muted-foreground">
                                      • {bestGoalkeeper.team_name} • {bestGoalkeeper.goals_against}{" "}
                                      {bestGoalkeeper.goals_against === 1 ? "gol sofrido" : "gols sofridos"}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
