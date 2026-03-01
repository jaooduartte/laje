import { Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { LiveMatchBanner } from "@/components/LiveMatchBanner";
import { MatchCard } from "@/components/MatchCard";
import { TeamStandingsTable } from "@/components/TeamStandingsTable";
import { SportFilter } from "@/components/SportFilter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TeamStandingAggregate } from "@/lib/standings";
import type { Championship, Match, Sport, Team } from "@/lib/types";
import { ChampionshipCode, MatchNaipe } from "@/lib/enums";
import { MATCH_NAIPE_LABELS } from "@/lib/championship";

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
  allStandingsSportFilter: string;
  allStandingsNaipeFilter: string;
  filteredStandings: TeamStandingAggregate[];
  standingsShowCardColumns: boolean;
  teamFilter: string;
  yearFilter: string;
  allTeamFilter: string;
  allYearFilter: string;
  historyTeams: Team[];
  historyYears: string[];
  filteredHistoryMatches: Match[];
  onSelectChampionshipCode: (value: ChampionshipCode) => void;
  onSportFilterChange: (value: string | null) => void;
  onStandingsSportFilterChange: (value: string) => void;
  onStandingsNaipeFilterChange: (value: string) => void;
  onTeamFilterChange: (value: string) => void;
  onYearFilterChange: (value: string) => void;
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
  allStandingsSportFilter,
  allStandingsNaipeFilter,
  filteredStandings,
  standingsShowCardColumns,
  teamFilter,
  yearFilter,
  allTeamFilter,
  allYearFilter,
  historyTeams,
  historyYears,
  filteredHistoryMatches,
  onSelectChampionshipCode,
  onSportFilterChange,
  onStandingsSportFilterChange,
  onStandingsNaipeFilterChange,
  onTeamFilterChange,
  onYearFilterChange,
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
                      ? "border-live/55 bg-primary/18 live-glow shadow-[0_0_0_1px_hsl(var(--live)/0.45)]"
                      : ""
                  }`}
                >
                  <img
                    src={championshipCardImageByCode[championship.code]}
                    alt={`Arte do campeonato ${championship.name}`}
                    className="h-full w-full bg-background object-contain p-3"
                    loading="lazy"
                  />

                  {isSelected ? <div className="pointer-events-none absolute inset-0 bg-primary/12" /> : null}

                  <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-background/95 via-background/70 to-transparent p-3">
                    <p className="font-display text-base font-bold leading-tight">{championship.name}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <SportFilter sports={sports} selected={sportFilter} onSelect={onSportFilterChange} />

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
              <div className="grid place-items-center gap-3 sm:grid-cols-2 sm:place-items-stretch lg:grid-cols-3">
                <MatchCard match={nextMatch} showChampionshipBadge={false} />
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground sm:text-left">Nenhum jogo agendado.</p>
            )}
          </section>
        ) : null}

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
          </div>

          {filteredHistoryMatches.length == 0 ? (
            <p className="text-center text-sm text-muted-foreground sm:text-left">Nenhum resultado registrado.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredHistoryMatches.map((match) => (
                <MatchCard key={match.id} match={match} showChampionshipBadge={false} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
