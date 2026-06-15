import { useEffect, useMemo, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { HelpCircle, Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { MatchCard } from "@/components/MatchCard";
import { SportFilter } from "@/components/SportFilter";
import { AppPaginationControls } from "@/components/ui/app-pagination-controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Championship, Match, Sport, Team } from "@/lib/types";
import type { BracketGroupFilterOption, MatchBracketContext } from "@/lib/championship";
import { MatchNaipe, MatchStatus, TeamDivision } from "@/lib/enums";
import { scrollToTopOfPage } from "@/lib/scroll";
import { MATCH_NAIPE_LABELS, TEAM_DIVISION_LABELS } from "@/lib/championship";
import { Tabs, TabsNavigationList, TabsNavigationTrigger } from "@/components/ui/tabs";
import { resolveMatchDisplaySlotValue, resolveMatchScheduledDateValue } from "@/lib/championship";

interface SchedulePageViewProps {
  isLoading: boolean;
  selectedChampionship: Championship | null;
  championships: Championship[];
  selectedChampionshipCode: string;
  selectedChampionshipHasDivisions: boolean;
  teams: Team[];
  sports: Sport[];
  sportFilter: string | null;
  naipeFilter: MatchNaipe | null;
  teamFilter: string | null;
  groupFilter: string | null;
  locationFilter: string | null;
  courtFilter: string | null;
  locationOptions: string[];
  courtOptions: string[];
  groupOptions: BracketGroupFilterOption[];
  divisionFilter: TeamDivision;
  statusFilter: string;
  yearFilter: string;
  orderedDates: string[];
  groupedMatches: Record<string, Match[]>;
  matches: Match[];
  isMatchesFetching: boolean;
  matchesCurrentPage: number;
  matchesItemsPerPage: number;
  matchesTotalPages: number;
  matchBracketContextByMatchId: Record<string, MatchBracketContext>;
  matchRepresentationByMatchId: Record<string, string>;
  visualQueuePositionByMatchId?: Record<string, number>;
  estimatedStartTimeByMatchId: Record<string, string>;
  onChampionshipCodeChange: (value: string) => void;
  onSportFilterChange: (value: string | null) => void;
  onNaipeFilterChange: (value: MatchNaipe | null) => void;
  onTeamFilterChange: (value: string | null) => void;
  onGroupFilterChange: (value: string | null) => void;
  onLocationFilterChange: (value: string | null) => void;
  onCourtFilterChange: (value: string | null) => void;
  onDivisionChange: (value: string) => void;
  onStatusFilterChange: (value: MatchStatus) => void;
  onYearFilterChange: (value: string) => void;
  onMatchesPageChange: (page: number) => void;
  onMatchesItemsPerPageChange: (value: number) => void;
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
  naipeFilter,
  teamFilter,
  groupFilter,
  locationFilter,
  courtFilter,
  locationOptions,
  courtOptions,
  groupOptions,
  divisionFilter,
  statusFilter,
  yearFilter,
  orderedDates,
  groupedMatches,
  matches,
  isMatchesFetching,
  matchesCurrentPage,
  matchesItemsPerPage,
  matchesTotalPages,
  matchBracketContextByMatchId,
  matchRepresentationByMatchId,
  visualQueuePositionByMatchId = {},
  estimatedStartTimeByMatchId,
  onChampionshipCodeChange,
  onSportFilterChange,
  onNaipeFilterChange,
  onTeamFilterChange,
  onGroupFilterChange,
  onLocationFilterChange,
  onCourtFilterChange,
  onDivisionChange,
  onStatusFilterChange,
  onYearFilterChange,
  onMatchesPageChange,
  onMatchesItemsPerPageChange,
}: SchedulePageViewProps) {
  const hasHandledPaginationScrollRef = useRef(false);

  const orderedMatches = useMemo(() => {
    return orderedDates.reduce<Match[]>((carry, date) => {
      return carry.concat(groupedMatches[date] ?? []);
    }, []);
  }, [groupedMatches, orderedDates]);

  const orderedFinishedMatches = useMemo(() => {
    if (statusFilter != MatchStatus.FINISHED) {
      return [];
    }

    return [...matches].sort((firstMatch, secondMatch) => {
      const firstSlot = resolveMatchDisplaySlotValue(firstMatch) ?? 0;
      const secondSlot = resolveMatchDisplaySlotValue(secondMatch) ?? 0;

      if (firstSlot != secondSlot) {
        return secondSlot - firstSlot;
      }

      const firstDate = resolveMatchScheduledDateValue(firstMatch) ?? "";
      const secondDate = resolveMatchScheduledDateValue(secondMatch) ?? "";

      if (firstDate != secondDate) {
        return secondDate.localeCompare(firstDate);
      }

      const firstStartedAtTimestamp = firstMatch.start_time ? new Date(firstMatch.start_time).getTime() : 0;
      const secondStartedAtTimestamp = secondMatch.start_time ? new Date(secondMatch.start_time).getTime() : 0;

      return secondStartedAtTimestamp - firstStartedAtTimestamp;
    });
  }, [matches, statusFilter]);
  const hasVisibleMatches = statusFilter == MatchStatus.FINISHED ? orderedFinishedMatches.length > 0 : orderedMatches.length > 0;

  useEffect(() => {
    if (!hasHandledPaginationScrollRef.current) {
      hasHandledPaginationScrollRef.current = true;
      return;
    }

    scrollToTopOfPage();
  }, [matchesCurrentPage]);

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
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-2xl font-display font-bold">Agenda de Jogos</h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="hidden h-5 w-5 items-center justify-center rounded-full app-help-icon-button text-xs sm:inline-flex"
                  aria-label="Ajuda sobre ordenação da agenda"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                A agenda mantém a ordem operacional atual, mas exibe número do jogo e representação pela fila visual
                de cada quadra.
              </TooltipContent>
            </Tooltip>
          </div>
        </section>

        <Tabs
          value={statusFilter}
          onValueChange={(v) => onStatusFilterChange(v)}
          className="enter-section space-y-4"
        >
          <TabsNavigationList className="grid w-full grid-cols-2">
            <TabsNavigationTrigger value={MatchStatus.SCHEDULED}>Próximos jogos</TabsNavigationTrigger>
            <TabsNavigationTrigger value={MatchStatus.FINISHED}>Jogos anteriores</TabsNavigationTrigger>
          </TabsNavigationList>
        </Tabs>

        <div className="glass-panel enter-section grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
          <Select value={selectedChampionshipCode} onValueChange={onChampionshipCodeChange}>
            <SelectTrigger className="app-input-field w-full">
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
            <SelectTrigger className="app-input-field w-full">
              <SelectValue placeholder="Filtrar por atlética" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as atléticas</SelectItem>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={naipeFilter ?? "all"} onValueChange={(value) => onNaipeFilterChange(value == "all" ? null : (value as MatchNaipe))}>
            <SelectTrigger className="app-input-field w-full">
              <SelectValue placeholder="Filtrar por naipe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os naipes</SelectItem>
              <SelectItem value={MatchNaipe.MASCULINO}>{MATCH_NAIPE_LABELS[MatchNaipe.MASCULINO]}</SelectItem>
              <SelectItem value={MatchNaipe.FEMININO}>{MATCH_NAIPE_LABELS[MatchNaipe.FEMININO]}</SelectItem>
              <SelectItem value={MatchNaipe.MISTO}>{MATCH_NAIPE_LABELS[MatchNaipe.MISTO]}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={groupFilter ?? "all"} onValueChange={(value) => onGroupFilterChange(value == "all" ? null : value)}>
            <SelectTrigger className="app-input-field w-full">
              <SelectValue placeholder="Filtrar por grupo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os grupos</SelectItem>
              {groupOptions.map((groupOption) => (
                <SelectItem key={groupOption.value} value={groupOption.value}>
                  {groupOption.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={locationFilter ?? "all"} onValueChange={(value) => onLocationFilterChange(value == "all" ? null : value)}>
            <SelectTrigger className="app-input-field w-full">
              <SelectValue placeholder="Filtrar por local" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os locais</SelectItem>
              {locationOptions.map((locationOption) => (
                <SelectItem key={locationOption} value={locationOption}>
                  {locationOption}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={courtFilter ?? "all"} onValueChange={(value) => onCourtFilterChange(value == "all" ? null : value)}>
            <SelectTrigger className="app-input-field w-full">
              <SelectValue placeholder="Filtrar por quadra" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as quadras</SelectItem>
              {courtOptions.map((courtOption) => (
                <SelectItem key={courtOption} value={courtOption}>
                  {courtOption}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedChampionshipHasDivisions ? (
            <Select value={divisionFilter} onValueChange={onDivisionChange}>
              <SelectTrigger className="app-input-field w-full">
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

          <Select value={yearFilter} onValueChange={onYearFilterChange}>
            <SelectTrigger className="app-input-field w-full">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL_YEARS">Todos os anos</SelectItem>
              {selectedChampionship.current_season_year && (
                <SelectItem value={String(selectedChampionship.current_season_year)}>
                  {selectedChampionship.current_season_year}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <SportFilter sports={sports} selected={sportFilter} onSelect={onSportFilterChange} />
        </div>

        <div>
          {isMatchesFetching ? (
            <div className="space-y-4">
              <section className="glass-panel enter-section p-4">
                <Skeleton className="mb-3 h-4 w-56 rounded-lg" />
                <div className="grid items-center gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: Math.max(3, matchesItemsPerPage) }).map((_, index) => (
                    <Skeleton key={`schedule-skeleton-${index}`} className="h-52 w-full rounded-2xl" />
                  ))}
                </div>
              </section>
            </div>
          ) : !hasVisibleMatches ? (
            <p className="text-muted-foreground">Nenhum jogo encontrado.</p>
          ) : statusFilter == MatchStatus.FINISHED ? (
            <div className="space-y-4">
              <section className="glass-panel enter-section p-4">
                <div className="grid items-center gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {orderedFinishedMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      showChampionshipBadge={false}
                      bracketContext={matchBracketContextByMatchId[match.id]}
                      matchRepresentation={matchRepresentationByMatchId[match.id]}
                      visualQueuePosition={visualQueuePositionByMatchId[match.id]}
                      estimatedStartTime={estimatedStartTimeByMatchId[match.id]}
                    />
                  ))}
                </div>
              </section>

              <AppPaginationControls
                currentPage={matchesCurrentPage}
                totalPages={matchesTotalPages}
                onPageChange={onMatchesPageChange}
                itemsPerPage={matchesItemsPerPage}
                onItemsPerPageChange={onMatchesItemsPerPageChange}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {orderedDates.map((date) => (
                <section key={date} className="glass-panel enter-section p-4">
                  <h3 className="mb-3 text-sm font-display font-semibold uppercase tracking-wider text-muted-foreground">
                    {format(new Date(`${date}T12:00:00`), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </h3>
                  <div className="grid items-center gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {groupedMatches[date].map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        showChampionshipBadge={false}
                        bracketContext={matchBracketContextByMatchId[match.id]}
                        matchRepresentation={matchRepresentationByMatchId[match.id]}
                        visualQueuePosition={visualQueuePositionByMatchId[match.id]}
                        estimatedStartTime={estimatedStartTimeByMatchId[match.id]}
                      />
                    ))}
                  </div>
                </section>
              ))}

              <AppPaginationControls
                currentPage={matchesCurrentPage}
                totalPages={matchesTotalPages}
                onPageChange={onMatchesPageChange}
                itemsPerPage={matchesItemsPerPage}
                onItemsPerPageChange={onMatchesItemsPerPageChange}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
