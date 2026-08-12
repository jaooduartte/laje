import { useEffect, useMemo, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { HelpCircle, Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { MatchCard } from "@/components/MatchCard";
import { SportFilter } from "@/components/SportFilter";
import { AppPaginationControls } from "@/components/ui/app-pagination-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  Championship,
  ChampionshipIndividualEvent,
  ChampionshipIndividualSession,
  Match,
  Sport,
  Team,
} from "@/lib/types";
import type {
  BracketGroupFilterOption,
  MatchBracketContext,
} from "@/lib/championship";
import { MatchNaipe, MatchStatus, TeamDivision } from "@/lib/enums";
import { scrollToTopOfPage } from "@/lib/scroll";
import { MATCH_NAIPE_LABELS, TEAM_DIVISION_LABELS } from "@/lib/championship";
import {
  Tabs,
  TabsNavigationList,
  TabsNavigationTrigger,
} from "@/components/ui/tabs";
import {
  resolveMatchDisplaySlotValue,
  resolveMatchScheduledDateValue,
} from "@/lib/championship";

const ALL_SCHEDULE_DIVISIONS_FILTER = "ALL_SCHEDULE_DIVISIONS_FILTER";

interface ScheduledKnockoutPlaceholder {
  id: string;
  competition_id: string;
  sport_id: string;
  sport_name: string;
  naipe: MatchNaipe;
  division: TeamDivision | null;
  round_number: number;
  slot_number: number;
  is_third_place: boolean;
  scheduled_date: string;
  queue_position: number | null;
  scheduled_slot: number | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  court_name: string | null;
  stage_label: string;
}

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
  divisionFilter: string;
  statusFilter: string;
  yearFilter: string;
  availableSeasonYears: number[];
  orderedDates: string[];
  groupedMatches: Record<string, Match[]>;
  groupedKnockoutPlaceholdersByDate?: Record<
    string,
    ScheduledKnockoutPlaceholder[]
  >;
  individualEvents: ChampionshipIndividualEvent[];
  individualSessions?: ChampionshipIndividualSession[];
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
  availableSeasonYears,
  orderedDates,
  groupedMatches,
  groupedKnockoutPlaceholdersByDate = {},
  individualEvents,
  individualSessions = [],
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

  const orderedKnockoutPlaceholders = useMemo(() => {
    return orderedDates.reduce<ScheduledKnockoutPlaceholder[]>(
      (carry, date) => {
        return carry.concat(groupedKnockoutPlaceholdersByDate[date] ?? []);
      },
      [],
    );
  }, [groupedKnockoutPlaceholdersByDate, orderedDates]);

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

      const firstStartedAtTimestamp = firstMatch.start_time
        ? new Date(firstMatch.start_time).getTime()
        : 0;
      const secondStartedAtTimestamp = secondMatch.start_time
        ? new Date(secondMatch.start_time).getTime()
        : 0;

      return secondStartedAtTimestamp - firstStartedAtTimestamp;
    });
  }, [matches, statusFilter]);
  const hasVisibleMatches =
    statusFilter == MatchStatus.FINISHED
      ? orderedFinishedMatches.length > 0
      : orderedMatches.length > 0;
  const hasVisibleKnockoutPlaceholders =
    statusFilter == MatchStatus.SCHEDULED &&
    orderedKnockoutPlaceholders.length > 0;
  const hasVisibleIndividualSessions = individualSessions.length > 0;

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
            <p className="text-muted-foreground">
              Nenhum campeonato encontrado.
            </p>
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
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                A agenda mantém a ordem operacional dos jogos. O número exibido
                segue a configuração de numeração definida no chaveamento,
                enquanto a representação operacional continua vinculada à
                sequência da quadra.
              </TooltipContent>
            </Tooltip>
          </div>
        </section>

        <Tabs
          value={statusFilter}
          onValueChange={(v) => onStatusFilterChange(v as MatchStatus)}
          className="enter-section space-y-4"
        >
          <TabsNavigationList className="grid w-full grid-cols-2">
            <TabsNavigationTrigger value={MatchStatus.SCHEDULED}>
              Próximos jogos
            </TabsNavigationTrigger>
            <TabsNavigationTrigger value={MatchStatus.FINISHED}>
              Jogos anteriores
            </TabsNavigationTrigger>
          </TabsNavigationList>
        </Tabs>

        <div className="glass-panel enter-section grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            value={selectedChampionshipCode}
            onValueChange={onChampionshipCodeChange}
          >
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
          <Select
            value={teamFilter ?? "all"}
            onValueChange={(value) =>
              onTeamFilterChange(value == "all" ? null : value)
            }
          >
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

          <Select
            value={naipeFilter ?? "all"}
            onValueChange={(value) =>
              onNaipeFilterChange(value == "all" ? null : (value as MatchNaipe))
            }
          >
            <SelectTrigger className="app-input-field w-full">
              <SelectValue placeholder="Filtrar por naipe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os naipes</SelectItem>
              <SelectItem value={MatchNaipe.MASCULINO}>
                {MATCH_NAIPE_LABELS[MatchNaipe.MASCULINO]}
              </SelectItem>
              <SelectItem value={MatchNaipe.FEMININO}>
                {MATCH_NAIPE_LABELS[MatchNaipe.FEMININO]}
              </SelectItem>
              <SelectItem value={MatchNaipe.MISTO}>
                {MATCH_NAIPE_LABELS[MatchNaipe.MISTO]}
              </SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={groupFilter ?? "all"}
            onValueChange={(value) =>
              onGroupFilterChange(value == "all" ? null : value)
            }
          >
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

          <Select
            value={locationFilter ?? "all"}
            onValueChange={(value) =>
              onLocationFilterChange(value == "all" ? null : value)
            }
          >
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

          <Select
            value={courtFilter ?? "all"}
            onValueChange={(value) =>
              onCourtFilterChange(value == "all" ? null : value)
            }
          >
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
                <SelectItem value={ALL_SCHEDULE_DIVISIONS_FILTER}>
                  Todas as divisões
                </SelectItem>
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
              {availableSeasonYears.map((seasonYear) => (
                <SelectItem key={seasonYear} value={String(seasonYear)}>
                  {seasonYear}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <SportFilter
            sports={sports}
            selected={sportFilter}
            onSelect={onSportFilterChange}
          />
        </div>

        <div>
          {isMatchesFetching ? (
            <div className="space-y-4">
              <section className="glass-panel enter-section p-4">
                <Skeleton className="mb-3 h-4 w-56 rounded-lg" />
                <div className="grid items-center gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: Math.max(3, matchesItemsPerPage) }).map(
                    (_, index) => (
                      <Skeleton
                        key={`schedule-skeleton-${index}`}
                        className="h-52 w-full rounded-2xl"
                      />
                    ),
                  )}
                </div>
              </section>
            </div>
          ) : !hasVisibleMatches && !hasVisibleKnockoutPlaceholders ? (
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
                      matchRepresentation={
                        matchRepresentationByMatchId[match.id]
                      }
                      visualQueuePosition={
                        visualQueuePositionByMatchId[match.id]
                      }
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
                    {format(
                      new Date(`${date}T12:00:00`),
                      "EEEE, dd 'de' MMMM",
                      { locale: ptBR },
                    )}
                  </h3>
                  <div className="grid items-center gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {groupedMatches[date].map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        showChampionshipBadge={false}
                        bracketContext={matchBracketContextByMatchId[match.id]}
                        matchRepresentation={
                          matchRepresentationByMatchId[match.id]
                        }
                        visualQueuePosition={
                          visualQueuePositionByMatchId[match.id]
                        }
                        estimatedStartTime={
                          estimatedStartTimeByMatchId[match.id]
                        }
                      />
                    ))}
                    {(groupedKnockoutPlaceholdersByDate[date] ?? []).map(
                      (placeholder) => (
                        <div
                          key={placeholder.id}
                          className="list-item-card list-item-card-hover flex h-full w-full flex-col p-4 dark:bg-[hsl(0_0%_12%)] dark:hover:bg-[hsl(0_0%_14%)]"
                        >
                          <div className="mb-3 flex flex-col gap-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                {placeholder.sport_name}
                              </span>
                              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-400">
                                A definir
                              </span>
                            </div>
                            <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                              <span className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] font-medium">
                                {placeholder.naipe == MatchNaipe.MASCULINO
                                  ? "Masculino"
                                  : placeholder.naipe == MatchNaipe.FEMININO
                                    ? "Feminino"
                                    : "Misto"}
                              </span>
                              {placeholder.division ? (
                                <span className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] font-medium">
                                  {placeholder.division ==
                                  TeamDivision.DIVISAO_PRINCIPAL
                                    ? "Divisão Principal"
                                    : "Divisão de Acesso"}
                                </span>
                              ) : null}
                              <span className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] font-medium">
                                {placeholder.stage_label}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-1 flex-col justify-center">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 text-right">
                                <p className="font-display text-sm font-semibold text-muted-foreground">
                                  A definir
                                </p>
                              </div>
                              <div className="mx-4 text-center">
                                <p className="text-xl font-display font-bold text-muted-foreground">
                                  ×
                                </p>
                              </div>
                              <div className="flex-1">
                                <p className="font-display text-sm font-semibold text-muted-foreground">
                                  A definir
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1 pt-3 text-xs text-muted-foreground">
                            <p>Representação: {placeholder.stage_label}</p>
                            {placeholder.start_time ? (
                              <p>
                                Horário planejado:{" "}
                                {placeholder.start_time.slice(0, 5)}
                              </p>
                            ) : null}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span>
                                {placeholder.location ?? "Local a definir"}
                                {placeholder.court_name
                                  ? ` • ${placeholder.court_name}`
                                  : ""}
                              </span>
                              <span>
                                {format(
                                  new Date(
                                    `${placeholder.scheduled_date}T12:00:00`,
                                  ),
                                  "dd/MM",
                                  { locale: ptBR },
                                )}
                                {placeholder.scheduled_slot != null
                                  ? ` • Jogo ${placeholder.scheduled_slot}`
                                  : placeholder.queue_position != null
                                    ? ` • Fila ${placeholder.queue_position}`
                                    : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                      ),
                    )}
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

          {hasVisibleIndividualSessions ? (
            <section className="glass-panel enter-section space-y-4 p-4">
              <div>
                <h3 className="text-sm font-display font-semibold uppercase tracking-wider text-muted-foreground">
                  Sessões Individuais
                </h3>
                <p className="text-xs text-muted-foreground">
                  Atletismo e Natação aparecem como sessões gerais por
                  modalidade e naipe, respeitando o slot oficial configurado no
                  campeonato.
                </p>
              </div>

              <div className="grid items-center gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {individualSessions.map((session) => (
                  <div
                    key={session.id}
                    className="rounded-2xl border border-border/60 bg-background/40 p-4"
                  >
                    <p className="font-display font-semibold">
                      {session.sports?.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {session.naipe}
                    </p>
                    <p className="mt-2 text-sm">
                      {session.scheduled_date
                        ? format(
                            new Date(`${session.scheduled_date}T12:00:00`),
                            "dd/MM/yyyy",
                            { locale: ptBR },
                          )
                        : "Sem data"}
                      {session.period
                        ? ` • ${session.period == "MATUTINO" ? "Matutino" : "Vespertino"}`
                        : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {session.location_name ?? "Local a definir"}
                      {session.court_name ? ` • ${session.court_name}` : ""}
                    </p>
                    {individualEvents.some(
                      (event) => event.session_id == session.id,
                    ) ? (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {
                          individualEvents.filter(
                            (event) => event.session_id == session.id,
                          ).length
                        }{" "}
                        provas oficiais vinculadas
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}
