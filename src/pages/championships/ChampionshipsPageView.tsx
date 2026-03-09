import { Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { LiveMatchBanner } from "@/components/LiveMatchBanner";
import { MatchCard } from "@/components/MatchCard";
import { TeamStandingsTable } from "@/components/TeamStandingsTable";
import { SportFilter } from "@/components/SportFilter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TeamStandingAggregate } from "@/lib/standings";
import type { Championship, Match, Sport, Team } from "@/lib/types";
import type { BracketGroupFilterOption, MatchBracketContext } from "@/lib/championship";
import type { ChampionshipChampionYearGroup } from "@/lib/championshipHistory";
import { ChampionshipCode, MatchNaipe } from "@/lib/enums";
import { MATCH_NAIPE_LABELS, TEAM_DIVISION_LABELS } from "@/lib/championship";

interface ChampionshipsPageViewProps {
  isLoading: boolean;
  championships: Championship[];
  selectedChampionship: Championship | null;
  selectedChampionshipCode: ChampionshipCode;
  selectedChampionshipIsFinished: boolean;
  championshipCardImageByCode: Record<ChampionshipCode, string>;
  sports: Sport[];
  sportFilter: string | null;
  filteredLiveMatches: Match[];
  nextMatch: Match | null;
  standingsSportFilter: string;
  standingsNaipeFilter: string;
  standingsYearFilter: string;
  allStandingsSportFilter: string;
  allStandingsNaipeFilter: string;
  filteredStandings: TeamStandingAggregate[];
  standingsShowCardColumns: boolean;
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
  championshipChampionHistory: ChampionshipChampionYearGroup[];
  matchBracketContextByMatchId: Record<string, MatchBracketContext>;
  onSelectChampionshipCode: (value: ChampionshipCode) => void;
  onSportFilterChange: (value: string | null) => void;
  onStandingsSportFilterChange: (value: string) => void;
  onStandingsNaipeFilterChange: (value: string) => void;
  onStandingsYearFilterChange: (value: string) => void;
  onTeamFilterChange: (value: string) => void;
  onYearFilterChange: (value: string) => void;
  onGroupFilterChange: (value: string) => void;
}

export function ChampionshipsPageView({
  isLoading,
  championships,
  selectedChampionship,
  selectedChampionshipCode,
  selectedChampionshipIsFinished,
  championshipCardImageByCode,
  sports,
  sportFilter,
  filteredLiveMatches,
  nextMatch,
  standingsSportFilter,
  standingsNaipeFilter,
  standingsYearFilter,
  allStandingsSportFilter,
  allStandingsNaipeFilter,
  filteredStandings,
  standingsShowCardColumns,
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
  championshipChampionHistory,
  matchBracketContextByMatchId,
  onSelectChampionshipCode,
  onSportFilterChange,
  onStandingsSportFilterChange,
  onStandingsNaipeFilterChange,
  onStandingsYearFilterChange,
  onTeamFilterChange,
  onYearFilterChange,
  onGroupFilterChange,
}: ChampionshipsPageViewProps) {
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
                  className={`glass-card glass-card-hover enter-item relative h-52 overflow-hidden text-left ${
                    isSelected
                      ? "border-live/50 bg-primary/10 live-glow shadow-[0_0_0_1px_hsl(var(--live)/0.45)] dark:shadow-none"
                      : ""
                  }`}
                >
                  <img
                    src={championshipCardImageByCode[championship.code]}
                    alt={`Arte do campeonato ${championship.name}`}
                    className="h-full w-full bg-background object-contain p-3"
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

        <SportFilter sports={sports} selected={sportFilter} onSelect={onSportFilterChange} />

        <Tabs defaultValue="overview" className="enter-section space-y-4">
          <TabsList className="glass-chip grid w-full grid-cols-2 rounded-xl p-1">
            <TabsTrigger value="overview">Resumo</TabsTrigger>
            <TabsTrigger value="champions">Campeões</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {!selectedChampionshipIsFinished ? (
              filteredLiveMatches.length == 0 ? (
                <p className="enter-section text-center text-sm text-muted-foreground sm:text-left">Nenhum jogo em andamento.</p>
              ) : (
                <LiveMatchBanner matches={filteredLiveMatches} />
              )
            ) : null}

            {!selectedChampionshipIsFinished ? (
              <section className="glass-panel enter-section p-5">
                <h2 className="mb-4 text-center text-xl font-display font-bold sm:text-left">Próximo jogo</h2>
                {nextMatch ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <MatchCard
                      match={nextMatch}
                      showChampionshipBadge={false}
                      bracketContext={matchBracketContextByMatchId[nextMatch.id]}
                    />
                  </div>
                ) : (
                  <p className="text-center text-sm text-muted-foreground sm:text-left">Nenhum jogo agendado.</p>
                )}
              </section>
            ) : null}

            <section className="glass-panel enter-section space-y-4 p-5">
              <h2 className="text-center text-xl font-display font-bold sm:text-left">Classificação</h2>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Select value={standingsYearFilter} onValueChange={onStandingsYearFilterChange}>
                  <SelectTrigger className="glass-input w-full">
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

            <section className="glass-panel enter-section space-y-4 p-5">
              <h2 className="text-center text-xl font-display font-bold sm:text-left">Jogos anteriores</h2>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Select value={teamFilter} onValueChange={onTeamFilterChange}>
                  <SelectTrigger className="glass-input w-full sm:w-56">
                    <SelectValue placeholder="Filtrar por atlética" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={allTeamFilter}>Todas as atléticas</SelectItem>
                    {historyTeams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={yearFilter} onValueChange={onYearFilterChange}>
                  <SelectTrigger className="glass-input w-full sm:w-40">
                    <SelectValue placeholder="Filtrar por ano" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={allYearFilter}>Todos os anos</SelectItem>
                    {historyYears.map((year) => (
                      <SelectItem key={year} value={year}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={groupFilter} onValueChange={onGroupFilterChange}>
                  <SelectTrigger className="glass-input w-full sm:w-72">
                    <SelectValue placeholder="Filtrar por chave" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL_GROUPS">Todas as chaves</SelectItem>
                    {historyGroupOptions.map((groupOption) => (
                      <SelectItem key={groupOption.value} value={groupOption.value}>
                        {groupOption.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {filteredHistoryMatches.length == 0 ? (
                <p className="text-center text-sm text-muted-foreground sm:text-left">Nenhum resultado registrado.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredHistoryMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      showChampionshipBadge={false}
                      bracketContext={matchBracketContextByMatchId[match.id]}
                    />
                  ))}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="champions" className="space-y-4 glass-panel p-5">
            <h2 className="text-center text-xl font-display font-bold sm:text-left">Campeões por modalidade</h2>

            {championshipChampionHistory.length == 0 ? (
              <p className="text-center text-sm text-muted-foreground sm:text-left">
                Nenhum campeão identificado para este campeonato.
              </p>
            ) : (
              <div className="space-y-4">
                {championshipChampionHistory.map((championshipChampionYearGroup) => (
                  <div
                    key={championshipChampionYearGroup.year}
                    className="space-y-4 rounded-2xl border border-border/40 bg-background/30 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-display text-lg font-bold">{championshipChampionYearGroup.year}</h3>
                      <p className="text-xs text-muted-foreground">
                        {championshipChampionYearGroup.champions.length} modalidade(s)
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {championshipChampionYearGroup.champions.map((championshipChampion) => (
                        <div
                          key={championshipChampion.match_id}
                          className="rounded-2xl border border-border/40 bg-background/40 p-4"
                        >
                          <div className="space-y-1">
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

                          <div className="mt-4 space-y-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Equipe campeã
                              </p>
                              <p className="font-display text-lg font-bold">{championshipChampion.champion_team_name}</p>
                            </div>

                            {championshipChampion.runner_up_team_name ? (
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                  Vice
                                </p>
                                <p className="text-sm font-medium text-foreground/90">
                                  {championshipChampion.runner_up_team_name}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
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
