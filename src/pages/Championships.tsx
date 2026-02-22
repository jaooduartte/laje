import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { LiveMatchBanner } from "@/components/LiveMatchBanner";
import { MatchCard } from "@/components/MatchCard";
import { TeamStandingsTable } from "@/components/TeamStandingsTable";
import { SportFilter } from "@/components/SportFilter";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMatches } from "@/hooks/useMatches";
import { useStandings } from "@/hooks/useStandings";
import { useSports } from "@/hooks/useSports";
import { useTeams } from "@/hooks/useTeams";
import { useChampionships } from "@/hooks/useChampionships";
import { useSelectedChampionship } from "@/hooks/useSelectedChampionship";
import { ChampionshipCode, ChampionshipStatus, MatchNaipe } from "@/lib/enums";
import { MATCH_NAIPE_LABELS } from "@/lib/championship";
import { aggregateStandingsByTeam } from "@/lib/standings";

const CHAMPIONSHIP_CARD_IMAGE_BY_CODE: Record<ChampionshipCode, string> = {
  [ChampionshipCode.CLV]: "/championships/clv.svg",
  [ChampionshipCode.SOCIETY]: "/championships/society.svg",
  [ChampionshipCode.INTERLAJE]: "/championships/interlaje.svg",
};

const ALL_TEAM_FILTER = "ALL_TEAMS";
const ALL_YEAR_FILTER = "ALL_YEARS";
const ALL_STANDINGS_SPORT_FILTER = "ALL_STANDINGS_SPORTS";
const ALL_STANDINGS_NAIPE_FILTER = "ALL_STANDINGS_NAIPES";

const Championships = () => {
  const { championships, loading: championshipsLoading } = useChampionships();
  const { selectedChampionshipCode, setSelectedChampionshipCode } = useSelectedChampionship();

  const selectedChampionship = useMemo(() => {
    return championships.find((championship) => championship.code === selectedChampionshipCode) ?? null;
  }, [championships, selectedChampionshipCode]);

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
  const selectedChampionshipHasDivisions = selectedChampionship?.uses_divisions ?? false;
  const selectedChampionshipIsFinished = selectedChampionship?.status === ChampionshipStatus.FINISHED;

  const { liveMatches, upcomingMatches, finishedMatches, loading: matchesLoading } = useMatches({
    championshipId: selectedChampionshipId,
  });
  const standingsDivisionFilter = selectedChampionshipHasDivisions ? undefined : null;
  const { standings, loading: standingsLoading } = useStandings({
    championshipId: selectedChampionshipId,
    division: standingsDivisionFilter,
  });
  const { sports } = useSports({ championshipId: selectedChampionshipId });
  const { teams } = useTeams();

  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>(ALL_TEAM_FILTER);
  const [yearFilter, setYearFilter] = useState<string>(ALL_YEAR_FILTER);
  const [standingsSportFilter, setStandingsSportFilter] = useState<string>(ALL_STANDINGS_SPORT_FILTER);
  const [standingsNaipeFilter, setStandingsNaipeFilter] = useState<string>(ALL_STANDINGS_NAIPE_FILTER);

  useEffect(() => {
    setSportFilter(null);
    setTeamFilter(ALL_TEAM_FILTER);
    setYearFilter(ALL_YEAR_FILTER);
    setStandingsSportFilter(ALL_STANDINGS_SPORT_FILTER);
    setStandingsNaipeFilter(ALL_STANDINGS_NAIPE_FILTER);
  }, [selectedChampionshipCode]);

  const filteredLiveMatches = sportFilter
    ? liveMatches.filter((match) => match.sport_id === sportFilter)
    : liveMatches;
  const filteredUpcomingMatches = sportFilter
    ? upcomingMatches.filter((match) => match.sport_id === sportFilter)
    : upcomingMatches;
  const sortedFinishedMatches = useMemo(() => {
    const sportFilteredMatches = sportFilter
      ? finishedMatches.filter((match) => match.sport_id === sportFilter)
      : finishedMatches;

    return [...sportFilteredMatches].sort((firstMatch, secondMatch) => {
      return new Date(secondMatch.start_time).getTime() - new Date(firstMatch.start_time).getTime();
    });
  }, [finishedMatches, sportFilter]);

  const historyTeams = useMemo(() => {
    const historyTeamIds = new Set<string>();

    sortedFinishedMatches.forEach((match) => {
      historyTeamIds.add(match.home_team_id);
      historyTeamIds.add(match.away_team_id);
    });

    return teams
      .filter((team) => historyTeamIds.has(team.id))
      .sort((firstTeam, secondTeam) => firstTeam.name.localeCompare(secondTeam.name));
  }, [sortedFinishedMatches, teams]);

  const historyYears = useMemo(() => {
    const uniqueYears = new Set<string>();

    sortedFinishedMatches.forEach((match) => {
      uniqueYears.add(String(new Date(match.start_time).getFullYear()));
    });

    return [...uniqueYears].sort((firstYear, secondYear) => Number(secondYear) - Number(firstYear));
  }, [sortedFinishedMatches]);

  const filteredHistoryMatches = sortedFinishedMatches.filter((match) => {
    if (teamFilter !== ALL_TEAM_FILTER && match.home_team_id !== teamFilter && match.away_team_id !== teamFilter) {
      return false;
    }

    if (yearFilter !== ALL_YEAR_FILTER) {
      const matchYear = String(new Date(match.start_time).getFullYear());

      if (matchYear !== yearFilter) {
        return false;
      }
    }

    return true;
  });

  const nextMatch = filteredUpcomingMatches.length > 0 ? filteredUpcomingMatches[0] : null;

  const standingsWithFilters = useMemo(() => {
    return standings.filter((standing) => {
      if (standingsSportFilter !== ALL_STANDINGS_SPORT_FILTER && standing.sport_id !== standingsSportFilter) {
        return false;
      }

      if (standingsNaipeFilter !== ALL_STANDINGS_NAIPE_FILTER && standing.naipe !== standingsNaipeFilter) {
        return false;
      }

      return true;
    });
  }, [standings, standingsNaipeFilter, standingsSportFilter]);

  const filteredStandings = useMemo(() => {
    return aggregateStandingsByTeam(standingsWithFilters);
  }, [standingsWithFilters]);

  if (championshipsLoading || matchesLoading || standingsLoading) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!selectedChampionship) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="container py-8">
          <p className="text-sm text-muted-foreground">Nenhum campeonato disponível.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container py-8 space-y-10">
        <section className="space-y-4">
          <h1 className="text-2xl font-display font-bold">Campeonatos LAJE</h1>
          <div className="grid gap-3 md:grid-cols-3">
            {championships.map((championship) => {
              const isSelected = championship.code === selectedChampionshipCode;

              return (
                <button
                  key={championship.id}
                  type="button"
                  onClick={() => setSelectedChampionshipCode(championship.code)}
                  className={`relative h-52 overflow-hidden rounded-lg border text-left transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <img
                    src={CHAMPIONSHIP_CARD_IMAGE_BY_CODE[championship.code]}
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

        <section className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Campeonato selecionado:</span>
          <Badge variant="secondary">{selectedChampionship.name}</Badge>
        </section>

        <SportFilter sports={sports} selected={sportFilter} onSelect={setSportFilter} />

        {!selectedChampionshipIsFinished ? (
          <section className="space-y-4">
            <h2 className="text-xl font-display font-bold">Jogos em andamento</h2>
            {filteredLiveMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum jogo em andamento.</p>
            ) : (
              <LiveMatchBanner matches={filteredLiveMatches} />
            )}
          </section>
        ) : null}

        {!selectedChampionshipIsFinished ? (
          <section>
            <h2 className="mb-4 text-xl font-display font-bold">Próximo jogo</h2>
            {nextMatch ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <MatchCard match={nextMatch} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum jogo agendado.</p>
            )}
          </section>
        ) : null}

        <section className="space-y-4">
          <h2 className="text-xl font-display font-bold">Classificação</h2>

          <div className="grid grid-cols-2 gap-3">
            <Select value={standingsSportFilter} onValueChange={setStandingsSportFilter}>
              <SelectTrigger className="w-full bg-secondary border-border">
                <SelectValue placeholder="Filtrar modalidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STANDINGS_SPORT_FILTER}>Todas as modalidades</SelectItem>
                {sports.map((sport) => (
                  <SelectItem key={sport.id} value={sport.id}>
                    {sport.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={standingsNaipeFilter} onValueChange={setStandingsNaipeFilter}>
              <SelectTrigger className="w-full bg-secondary border-border">
                <SelectValue placeholder="Filtrar naipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STANDINGS_NAIPE_FILTER}>Todos os naipes</SelectItem>
                <SelectItem value={MatchNaipe.MASCULINO}>{MATCH_NAIPE_LABELS[MatchNaipe.MASCULINO]}</SelectItem>
                <SelectItem value={MatchNaipe.FEMININO}>{MATCH_NAIPE_LABELS[MatchNaipe.FEMININO]}</SelectItem>
                <SelectItem value={MatchNaipe.MISTO}>{MATCH_NAIPE_LABELS[MatchNaipe.MISTO]}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <TeamStandingsTable standings={filteredStandings} />
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-display font-bold">Jogos anteriores</h2>

          <div className="flex flex-wrap gap-3">
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-56 bg-secondary border-border">
                <SelectValue placeholder="Filtrar por atlética" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TEAM_FILTER}>Todas as atléticas</SelectItem>
                {historyTeams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-40 bg-secondary border-border">
                <SelectValue placeholder="Filtrar por ano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_YEAR_FILTER}>Todos os anos</SelectItem>
                {historyYears.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredHistoryMatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum resultado registrado.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredHistoryMatches.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default Championships;
