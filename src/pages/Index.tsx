import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { LiveMatchBanner } from "@/components/LiveMatchBanner";
import { MatchCard } from "@/components/MatchCard";
import { StandingsTable } from "@/components/StandingsTable";
import { SportFilter } from "@/components/SportFilter";
import { Badge } from "@/components/ui/badge";
import { useMatches } from "@/hooks/useMatches";
import { useStandings } from "@/hooks/useStandings";
import { useSports } from "@/hooks/useSports";
import { useChampionships } from "@/hooks/useChampionships";
import { ChampionshipStatus, TeamDivision } from "@/lib/enums";
import { CHAMPIONSHIP_STATUS_BADGE_CLASS_NAMES, CHAMPIONSHIP_STATUS_LABELS, TEAM_DIVISION_LABELS } from "@/lib/championship";

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

  const { liveMatches, upcomingMatches, loading: matchesLoading } = useMatches({
    championshipId: selectedChampionshipId,
  });

  const [sportFilter, setSportFilter] = useState<string | null>(null);

  useEffect(() => {
    setSportFilter(null);
  }, [selectedChampionshipId]);

  const standingsDivisionFilter = selectedChampionshipHasDivisions ? undefined : null;
  const { standings, loading: standingsLoading } = useStandings({
    championshipId: selectedChampionshipId,
    division: standingsDivisionFilter,
  });

  const { sports } = useSports({ championshipId: selectedChampionshipId });

  const filteredUpcoming = sportFilter
    ? upcomingMatches.filter((match) => match.sport_id === sportFilter)
    : upcomingMatches;

  const filteredStandings = sportFilter
    ? standings.filter((standing) => standing.sport_id === sportFilter)
    : standings;

  const filteredLive = sportFilter ? liveMatches.filter((match) => match.sport_id === sportFilter) : liveMatches;

  const principalDivisionStandings = filteredStandings.filter(
    (standing) => standing.division === TeamDivision.DIVISAO_PRINCIPAL,
  );
  const accessDivisionStandings = filteredStandings.filter(
    (standing) => standing.division === TeamDivision.DIVISAO_ACESSO,
  );

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
          <Badge className={CHAMPIONSHIP_STATUS_BADGE_CLASS_NAMES[featuredChampionship.status]}>
            {CHAMPIONSHIP_STATUS_LABELS[featuredChampionship.status]}
          </Badge>
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
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-display font-bold">Classificação</h2>

          {selectedChampionshipHasDivisions ? (
            <div className="space-y-8">
              <div className="space-y-3">
                <h3 className="text-sm font-display font-semibold uppercase tracking-wider text-muted-foreground">
                  {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_PRINCIPAL]}
                </h3>
                <StandingsTable standings={principalDivisionStandings} />
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-display font-semibold uppercase tracking-wider text-muted-foreground">
                  {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_ACESSO]}
                </h3>
                <StandingsTable standings={accessDivisionStandings} />
              </div>
            </div>
          ) : (
            <StandingsTable standings={filteredStandings} />
          )}
        </section>

      </main>
    </div>
  );
};

export default Index;
