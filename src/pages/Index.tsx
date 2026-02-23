import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { LiveMatchBanner } from "@/components/LiveMatchBanner";
import { MatchCard } from "@/components/MatchCard";
import { TeamStandingsTable } from "@/components/TeamStandingsTable";
import { SportFilter } from "@/components/SportFilter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMatches } from "@/hooks/useMatches";
import { useStandings } from "@/hooks/useStandings";
import { useSports } from "@/hooks/useSports";
import { useChampionships } from "@/hooks/useChampionships";
import { MATCH_NAIPE_LABELS } from "@/lib/championship";
import { ChampionshipSportTieBreakerRule, ChampionshipStatus, MatchNaipe } from "@/lib/enums";
import { aggregateStandingsByTeam } from "@/lib/standings";

const ALL_STANDINGS_SPORT_FILTER = "ALL_STANDINGS_SPORTS";
const ALL_STANDINGS_NAIPE_FILTER = "ALL_STANDINGS_NAIPES";

const Index = () => {
  const { championships, loading: championshipsLoading } = useChampionships();
  const featuredChampionship = useMemo(() => {
    const inProgressChampionship = championships.find(
      (championship) => championship.status === ChampionshipStatus.IN_PROGRESS,
    );

    if (inProgressChampionship) {
      return inProgressChampionship;
    }

    const upcomingChampionship = championships.find((championship) => championship.status === ChampionshipStatus.UPCOMING);

    if (upcomingChampionship) {
      return upcomingChampionship;
    }

    const planningChampionship = championships.find((championship) => championship.status === ChampionshipStatus.PLANNING);

    if (planningChampionship) {
      return planningChampionship;
    }

    return championships[0] ?? null;
  }, [championships]);

  const selectedChampionshipId = featuredChampionship?.id ?? null;
  const selectedChampionshipHasDivisions = featuredChampionship?.uses_divisions ?? false;

  const { liveMatches, upcomingMatches, finishedMatches, loading: matchesLoading } = useMatches({
    championshipId: selectedChampionshipId,
  });

  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [standingsSportFilter, setStandingsSportFilter] = useState<string>(ALL_STANDINGS_SPORT_FILTER);
  const [standingsNaipeFilter, setStandingsNaipeFilter] = useState<string>(ALL_STANDINGS_NAIPE_FILTER);

  useEffect(() => {
    setSportFilter(null);
    setStandingsSportFilter(ALL_STANDINGS_SPORT_FILTER);
    setStandingsNaipeFilter(ALL_STANDINGS_NAIPE_FILTER);
  }, [selectedChampionshipId]);

  const standingsDivisionFilter = selectedChampionshipHasDivisions ? undefined : null;
  const { standings, loading: standingsLoading } = useStandings({
    championshipId: selectedChampionshipId,
    division: standingsDivisionFilter,
  });

  const { sports, championshipSports } = useSports({ championshipId: selectedChampionshipId });

  const filteredUpcoming = sportFilter
    ? upcomingMatches.filter((match) => match.sport_id === sportFilter)
    : upcomingMatches;

  const filteredLive = sportFilter ? liveMatches.filter((match) => match.sport_id === sportFilter) : liveMatches;

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

  const standingsTieBreakerRule = useMemo(() => {
    if (standingsSportFilter == ALL_STANDINGS_SPORT_FILTER) {
      return ChampionshipSportTieBreakerRule.STANDARD;
    }

    const selectedChampionshipSport = championshipSports.find(
      (championshipSport) => championshipSport.sport_id == standingsSportFilter,
    );

    return selectedChampionshipSport?.tie_breaker_rule ?? ChampionshipSportTieBreakerRule.STANDARD;
  }, [championshipSports, standingsSportFilter]);

  const standingsShowCardColumns = useMemo(() => {
    if (standingsSportFilter == ALL_STANDINGS_SPORT_FILTER) {
      return false;
    }

    const selectedChampionshipSport = championshipSports.find(
      (championshipSport) => championshipSport.sport_id == standingsSportFilter,
    );

    return selectedChampionshipSport?.supports_cards == true;
  }, [championshipSports, standingsSportFilter]);

  const standingsHeadToHeadMatches = useMemo(() => {
    return finishedMatches.filter((match) => {
      if (standingsSportFilter != ALL_STANDINGS_SPORT_FILTER && match.sport_id != standingsSportFilter) {
        return false;
      }

      if (standingsNaipeFilter != ALL_STANDINGS_NAIPE_FILTER && match.naipe != standingsNaipeFilter) {
        return false;
      }

      return true;
    });
  }, [finishedMatches, standingsNaipeFilter, standingsSportFilter]);

  const filteredStandings = useMemo(() => {
    return aggregateStandingsByTeam(standingsWithFilters, {
      tieBreakerRule: standingsTieBreakerRule,
      headToHeadMatches: standingsHeadToHeadMatches,
    });
  }, [standingsHeadToHeadMatches, standingsTieBreakerRule, standingsWithFilters]);

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

  if (!featuredChampionship) {
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
        <section className="flex flex-col items-center justify-center gap-2">
          <h1 className="text-2xl font-bold">{featuredChampionship.name}</h1>
        </section>

        <LiveMatchBanner matches={filteredLive} />

        <SportFilter sports={sports} selected={sportFilter} onSelect={setSportFilter} />

        <section>
          <h2 className="mb-4 text-xl font-display font-bold">Próximos Jogos</h2>
          {filteredUpcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum jogo agendado.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredUpcoming.map((match) => (
                <MatchCard key={match.id} match={match} showChampionshipBadge={false} />
              ))}
            </div>
          )}
        </section>

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

          <TeamStandingsTable standings={filteredStandings} showCardColumns={standingsShowCardColumns} />
        </section>

      </main>
    </div>
  );
};

export default Index;
