import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { MatchCard } from "@/components/MatchCard";
import { SportFilter } from "@/components/SportFilter";
import {
  AppPaginationControls,
  DEFAULT_PAGINATION_ITEMS_PER_PAGE,
} from "@/components/ui/app-pagination-controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Championship, Match, Sport, Team } from "@/lib/types";
import type { BracketGroupFilterOption, MatchBracketContext } from "@/lib/championship";
import { TeamDivision } from "@/lib/enums";
import { TEAM_DIVISION_LABELS } from "@/lib/championship";

interface SchedulePageViewProps {
  isLoading: boolean;
  selectedChampionship: Championship | null;
  championships: Championship[];
  selectedChampionshipCode: string;
  selectedChampionshipHasDivisions: boolean;
  teams: Team[];
  sports: Sport[];
  sportFilter: string | null;
  teamFilter: string | null;
  groupFilter: string | null;
  groupOptions: BracketGroupFilterOption[];
  divisionFilter: TeamDivision;
  orderedDates: string[];
  groupedMatches: Record<string, Match[]>;
  matchBracketContextByMatchId: Record<string, MatchBracketContext>;
  onChampionshipCodeChange: (value: string) => void;
  onSportFilterChange: (value: string | null) => void;
  onTeamFilterChange: (value: string | null) => void;
  onGroupFilterChange: (value: string | null) => void;
  onDivisionChange: (value: string) => void;
}

export function SchedulePageView({
  isLoading,
  selectedChampionship,
  championships,
  selectedChampionshipCode,
  selectedChampionshipHasDivisions,
  teams,
  sports,
  sportFilter,
  teamFilter,
  groupFilter,
  groupOptions,
  divisionFilter,
  orderedDates,
  groupedMatches,
  matchBracketContextByMatchId,
  onChampionshipCodeChange,
  onSportFilterChange,
  onTeamFilterChange,
  onGroupFilterChange,
  onDivisionChange,
}: SchedulePageViewProps) {
  const [matchesCurrentPage, setMatchesCurrentPage] = useState(1);
  const [matchesItemsPerPage, setMatchesItemsPerPage] = useState(DEFAULT_PAGINATION_ITEMS_PER_PAGE);

  const orderedMatches = useMemo(() => {
    return orderedDates.reduce<Match[]>((carry, date) => {
      return carry.concat(groupedMatches[date] ?? []);
    }, []);
  }, [groupedMatches, orderedDates]);

  useEffect(() => {
    setMatchesCurrentPage(1);
  }, [divisionFilter, groupFilter, matchesItemsPerPage, selectedChampionshipCode, sportFilter, teamFilter]);

  const matchesTotalPages = Math.max(1, Math.ceil(orderedMatches.length / matchesItemsPerPage));

  const paginatedMatches = useMemo(() => {
    const rangeStart = (matchesCurrentPage - 1) * matchesItemsPerPage;
    const rangeEnd = rangeStart + matchesItemsPerPage;

    return orderedMatches.slice(rangeStart, rangeEnd);
  }, [matchesCurrentPage, matchesItemsPerPage, orderedMatches]);

  const paginatedMatchesByDate = useMemo(() => {
    return paginatedMatches.reduce<Record<string, Match[]>>((carry, match) => {
      const matchDate = format(new Date(match.start_time), "yyyy-MM-dd");

      if (!carry[matchDate]) {
        carry[matchDate] = [];
      }

      carry[matchDate].push(match);
      return carry;
    }, {});
  }, [paginatedMatches]);

  const paginatedOrderedDates = useMemo(() => {
    return Object.keys(paginatedMatchesByDate).sort((firstDate, secondDate) => firstDate.localeCompare(secondDate));
  }, [paginatedMatchesByDate]);

  useEffect(() => {
    if (matchesCurrentPage > matchesTotalPages) {
      setMatchesCurrentPage(matchesTotalPages);
    }
  }, [matchesCurrentPage, matchesTotalPages]);

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
            <p className="text-muted-foreground">Nenhum campeonato encontrado.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-page">
      <Header />
      <main className="container py-8 space-y-5">
        <section className="glass-panel enter-section p-5">
          <h1 className="text-2xl font-display font-bold">Agenda de Jogos</h1>
        </section>

        <div className="glass-panel enter-section flex flex-wrap items-center gap-4 p-4">
          <Select value={selectedChampionshipCode} onValueChange={onChampionshipCodeChange}>
            <SelectTrigger className="glass-input w-72">
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
          <Select value={teamFilter ?? "all"} onValueChange={(value) => onTeamFilterChange(value == "all" ? null : value)}>
            <SelectTrigger className="glass-input w-48">
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

          <Select value={groupFilter ?? "all"} onValueChange={(value) => onGroupFilterChange(value == "all" ? null : value)}>
            <SelectTrigger className="glass-input w-48">
              <SelectValue placeholder="Filtrar por chave" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as chaves</SelectItem>
              {groupOptions.map((groupOption) => (
                <SelectItem key={groupOption.value} value={groupOption.value}>
                  {groupOption.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedChampionshipHasDivisions ? (
            <Select value={divisionFilter} onValueChange={onDivisionChange}>
              <SelectTrigger className="glass-input w-52">
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

        <div className="space-y-3">
          <SportFilter sports={sports} selected={sportFilter} onSelect={onSportFilterChange} />
        </div>

        {orderedMatches.length == 0 ? (
          <p className="text-muted-foreground">Nenhum jogo encontrado.</p>
        ) : (
          <div className="space-y-4">
            {paginatedOrderedDates.map((date) => (
              <section key={date} className="glass-panel enter-section p-4">
                <h3 className="mb-3 text-sm font-display font-semibold uppercase tracking-wider text-muted-foreground">
                  {format(new Date(`${date}T12:00:00`), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {paginatedMatchesByDate[date].map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      showChampionshipBadge={false}
                      bracketContext={matchBracketContextByMatchId[match.id]}
                    />
                  ))}
                </div>
              </section>
            ))}

            <AppPaginationControls
              currentPage={matchesCurrentPage}
              totalPages={matchesTotalPages}
              onPageChange={setMatchesCurrentPage}
              itemsPerPage={matchesItemsPerPage}
              onItemsPerPageChange={setMatchesItemsPerPage}
            />
          </div>
        )}
      </main>
    </div>
  );
}
