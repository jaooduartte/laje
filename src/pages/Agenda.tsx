import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { MatchCard } from "@/components/MatchCard";
import { SportFilter } from "@/components/SportFilter";
import { useMatches } from "@/hooks/useMatches";
import { useSports } from "@/hooks/useSports";
import { useTeams } from "@/hooks/useTeams";
import { useChampionships } from "@/hooks/useChampionships";
import { useSelectedChampionship } from "@/hooks/useSelectedChampionship";
import { ChampionshipCode, TeamDivision } from "@/lib/enums";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TEAM_DIVISION_LABELS, isTeamDivision } from "@/lib/championship";

const Agenda = () => {
  const { championships, loading: championshipsLoading } = useChampionships();
  const { selectedChampionshipCode, setSelectedChampionshipCode } = useSelectedChampionship();

  const selectedChampionship = useMemo(() => {
    return championships.find((championship) => championship.code === selectedChampionshipCode) ?? null;
  }, [championships, selectedChampionshipCode]);

  const handleChampionshipCodeChange = (value: string) => {
    if (
      value === ChampionshipCode.CLV ||
      value === ChampionshipCode.SOCIETY ||
      value === ChampionshipCode.INTERLAJE
    ) {
      setSelectedChampionshipCode(value);
    }
  };

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

  const { matches, loading } = useMatches({ championshipId: selectedChampionshipId });
  const { sports } = useSports({ championshipId: selectedChampionshipId });
  const { teams } = useTeams();

  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [divisionFilter, setDivisionFilter] = useState<TeamDivision>(TeamDivision.DIVISAO_PRINCIPAL);

  useEffect(() => {
    setSportFilter(null);
    setTeamFilter(null);
    setDivisionFilter(TeamDivision.DIVISAO_PRINCIPAL);
  }, [selectedChampionshipCode]);

  const filteredMatches = matches.filter((match) => {
    if (sportFilter && match.sport_id !== sportFilter) {
      return false;
    }

    if (teamFilter && match.home_team_id !== teamFilter && match.away_team_id !== teamFilter) {
      return false;
    }

    if (selectedChampionshipHasDivisions && match.division !== divisionFilter) {
      return false;
    }

    return true;
  });

  const groupedMatches = filteredMatches.reduce<Record<string, typeof filteredMatches>>((groupedResult, match) => {
    const dateKey = format(new Date(match.start_time), "yyyy-MM-dd");

    if (!groupedResult[dateKey]) {
      groupedResult[dateKey] = [];
    }

    groupedResult[dateKey].push(match);
    return groupedResult;
  }, {});

  const sortedDates = Object.keys(groupedMatches).sort();

  const handleDivisionChange = (value: string) => {
    if (isTeamDivision(value)) {
      setDivisionFilter(value);
    }
  };

  if (loading || championshipsLoading) {
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
          <p className="text-muted-foreground">Nenhum campeonato encontrado.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container py-8 space-y-6">
        <h1 className="text-2xl font-display font-bold">Agenda de Jogos</h1>

        <div className="flex flex-wrap items-center gap-4">
          <Select value={selectedChampionshipCode} onValueChange={handleChampionshipCodeChange}>
            <SelectTrigger className="w-72 bg-secondary border-border">
              <SelectValue placeholder="Campeonato" />
            </SelectTrigger>
            <SelectContent>
              {championships.map((championship) => (
                <SelectItem key={championship.id} value={championship.code}>
                  {championship.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedChampionshipHasDivisions ? (
            <Select value={divisionFilter} onValueChange={handleDivisionChange}>
              <SelectTrigger className="w-52 bg-secondary border-border">
                <SelectValue placeholder="Divisão" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TeamDivision.DIVISAO_PRINCIPAL}>
                  {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_PRINCIPAL]}
                </SelectItem>
                <SelectItem value={TeamDivision.DIVISAO_ACESSO}>
                  {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_ACESSO]}
                </SelectItem>
              </SelectContent>
            </Select>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <SportFilter sports={sports} selected={sportFilter} onSelect={setSportFilter} />

          <Select value={teamFilter ?? "all"} onValueChange={(value) => setTeamFilter(value === "all" ? null : value)}>
            <SelectTrigger className="w-48 bg-secondary border-border">
              <SelectValue placeholder="Filtrar por time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os times</SelectItem>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {sortedDates.length === 0 ? (
          <p className="text-muted-foreground">Nenhum jogo encontrado.</p>
        ) : (
          sortedDates.map((date) => (
            <section key={date}>
              <h3 className="mb-3 text-sm font-display font-semibold uppercase tracking-wider text-muted-foreground">
                {format(new Date(`${date}T12:00:00`), "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {groupedMatches[date].map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
};

export default Agenda;
