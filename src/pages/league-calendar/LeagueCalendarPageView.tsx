import { useState } from "react";
import { format, isSameDay, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LeagueEvent } from "@/lib/types";
import { LeagueEventOrganizerType } from "@/lib/enums";
import {
  LEAGUE_EVENT_LEGEND_ORDER,
  LEAGUE_EVENT_TYPE_BADGE_CLASS_NAMES,
  LEAGUE_EVENT_TYPE_DOT_CLASS_NAMES,
  LEAGUE_EVENT_TYPE_GLASS_CARD_CLASS_NAMES,
  LEAGUE_EVENT_TYPE_LABELS,
} from "@/domain/league-events/leagueEvent.constants";

interface AthleticFilterOption {
  id: string;
  name: string;
}

interface LeagueCalendarPageViewProps {
  loading: boolean;
  monthDate: Date;
  selectedDate: Date;
  calendarDays: Date[];
  leagueEventsByDate: Record<string, LeagueEvent[]>;
  leagueEvents: LeagueEvent[];
  filteredLeagueEvents: LeagueEvent[];
  athleticsFilterOptions: AthleticFilterOption[];
  athleticFilter: string;
  allAthleticsFilter: string;
  eventTypeFilter: string;
  allEventTypesFilter: string;
  eventSearch: string;
  hasActiveFilters: boolean;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onSelectedDateChange: (date: Date) => void;
  onAthleticFilterChange: (value: string) => void;
  onEventTypeFilterChange: (value: string) => void;
  onEventSearchChange: (value: string) => void;
}

const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function resolveEventOrganizerName(leagueEvent: LeagueEvent): string {
  if (leagueEvent.organizer_type == LeagueEventOrganizerType.LAJE) {
    return "LAJE";
  }

  return leagueEvent.organizer_team?.name ?? "Atlética";
}

function LeagueEventMiniCard({ leagueEvent, onClick }: { leagueEvent: LeagueEvent; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`w-full rounded-xl border px-2 py-1.5 text-left backdrop-blur-md transition-all hover:scale-[1.01] hover:shadow-sm ${LEAGUE_EVENT_TYPE_GLASS_CARD_CLASS_NAMES[leagueEvent.event_type]}`}
    >
      <p className="truncate text-[11px] font-semibold">{leagueEvent.name}</p>
      <p className="truncate text-[10px] text-muted-foreground">{leagueEvent.location}</p>
      <p className="truncate text-[10px] text-muted-foreground">{resolveEventOrganizerName(leagueEvent)}</p>
    </button>
  );
}

export function LeagueCalendarPageView({
  loading,
  monthDate,
  selectedDate,
  calendarDays,
  leagueEventsByDate,
  leagueEvents,
  filteredLeagueEvents,
  athleticsFilterOptions,
  athleticFilter,
  allAthleticsFilter,
  eventTypeFilter,
  allEventTypesFilter,
  eventSearch,
  hasActiveFilters,
  onPreviousMonth,
  onNextMonth,
  onSelectedDateChange,
  onAthleticFilterChange,
  onEventTypeFilterChange,
  onEventSearchChange,
}: LeagueCalendarPageViewProps) {
  const [openedLeagueEvent, setOpenedLeagueEvent] = useState<LeagueEvent | null>(null);
  const monthControlClassName = "h-9 rounded-xl border border-white/40 bg-white/45 text-secondary-foreground backdrop-blur-xl";
  const glassPanelClassName = "rounded-2xl border border-white/45 bg-white/35 p-4 backdrop-blur-xl shadow-[0_8px_30px_rgba(15,23,42,0.08)]";
  const selectedDateKey = format(selectedDate, "yyyy-MM-dd");
  const selectedDateEvents = leagueEventsByDate[selectedDateKey] ?? [];
  const today = new Date();

  return (
    <div className="app-page">
      <Header />

      <main className="container space-y-4 py-8">
        <section className={`${glassPanelClassName} animate-in fade-in-0 slide-in-from-bottom-2 duration-500`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-display font-bold">Calendário da Liga</h1>
              <p className="text-sm text-muted-foreground">Eventos públicos cadastrados pelas atléticas parceiras e pela LAJE.</p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className={monthControlClassName}
                onClick={onPreviousMonth}
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Badge
                variant="outline"
                className={`${monthControlClassName} min-w-40 justify-center px-4 text-sm font-medium capitalize`}
              >
                {format(monthDate, "MMMM 'de' yyyy", { locale: ptBR })}
              </Badge>
              <Button
                variant="outline"
                size="icon"
                className={monthControlClassName}
                onClick={onNextMonth}
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        <section className={`${glassPanelClassName} animate-in fade-in-0 slide-in-from-bottom-2 duration-500`}>
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={eventSearch}
                onChange={(event) => onEventSearchChange(event.target.value)}
                placeholder="Buscar evento por nome"
                className="h-9 rounded-xl border-white/40 bg-white/45 pl-9 backdrop-blur"
              />
            </div>

            <Select value={athleticFilter} onValueChange={onAthleticFilterChange}>
              <SelectTrigger className="h-9 rounded-xl border-white/40 bg-white/45 backdrop-blur">
                <SelectValue placeholder="Filtrar por atlética" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={allAthleticsFilter}>Todas as atléticas</SelectItem>
                {athleticsFilterOptions.map((athleticFilterOption) => (
                  <SelectItem key={athleticFilterOption.id} value={athleticFilterOption.id}>
                    {athleticFilterOption.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={eventTypeFilter} onValueChange={onEventTypeFilterChange}>
              <SelectTrigger className="h-9 rounded-xl border-white/40 bg-white/45 backdrop-blur">
                <SelectValue placeholder="Filtrar por tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={allEventTypesFilter}>Todos os tipos</SelectItem>
                {LEAGUE_EVENT_LEGEND_ORDER.map((leagueEventType) => (
                  <SelectItem key={leagueEventType} value={leagueEventType}>
                    {LEAGUE_EVENT_TYPE_LABELS[leagueEventType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <section className={`${glassPanelClassName} animate-in fade-in-0 slide-in-from-bottom-2 duration-500`}>
          <div className="flex flex-wrap items-center gap-4">
            {LEAGUE_EVENT_LEGEND_ORDER.map((leagueEventType) => (
              <div key={leagueEventType} className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className={`h-2.5 w-2.5 rounded-full ${LEAGUE_EVENT_TYPE_DOT_CLASS_NAMES[leagueEventType]}`} />
                <span>{LEAGUE_EVENT_TYPE_LABELS[leagueEventType]}</span>
              </div>
            ))}
            <span className="text-xs text-muted-foreground">{leagueEvents.length} evento(s) no mês</span>
          </div>
        </section>

        {loading ? (
          <div className={`${glassPanelClassName} flex min-h-[420px] items-center justify-center`}>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : hasActiveFilters ? (
          <section className={`${glassPanelClassName} animate-in fade-in-0 slide-in-from-bottom-2 duration-500`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-display font-semibold">Eventos filtrados</h2>
              <p className="text-xs text-muted-foreground">{filteredLeagueEvents.length} resultado(s)</p>
            </div>

            {filteredLeagueEvents.length == 0 ? (
              <div className="flex min-h-44 items-center justify-center rounded-2xl border border-white/40 bg-white/30">
                <p className="text-sm text-muted-foreground">Nenhum evento encontrado para os filtros aplicados.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredLeagueEvents.map((leagueEvent, leagueEventIndex) => (
                  <button
                    key={leagueEvent.id}
                    type="button"
                    onClick={() => setOpenedLeagueEvent(leagueEvent)}
                    className={`rounded-2xl border p-3 text-left backdrop-blur-md transition-all hover:scale-[1.01] ${LEAGUE_EVENT_TYPE_GLASS_CARD_CLASS_NAMES[leagueEvent.event_type]} animate-in fade-in-0 slide-in-from-bottom-2 duration-300`}
                    style={{ animationDelay: `${leagueEventIndex * 35}ms` }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Badge className={LEAGUE_EVENT_TYPE_BADGE_CLASS_NAMES[leagueEvent.event_type]}>
                        {LEAGUE_EVENT_TYPE_LABELS[leagueEvent.event_type]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(`${leagueEvent.event_date}T12:00:00`), "dd/MM/yyyy")}
                      </span>
                    </div>
                    <p className="truncate text-sm font-semibold">{leagueEvent.name}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{leagueEvent.location}</p>
                    <p className="truncate text-xs text-muted-foreground">{resolveEventOrganizerName(leagueEvent)}</p>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            <section className={`${glassPanelClassName} hidden p-0 md:block animate-in fade-in-0 slide-in-from-bottom-2 duration-500`}>
              <div className="grid grid-cols-7 border-b border-white/30 bg-white/25 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                {WEEK_DAYS.map((weekDay) => (
                  <div key={weekDay} className="px-2 py-1 text-center">
                    {weekDay}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {calendarDays.map((calendarDay) => {
                  const dayKey = format(calendarDay, "yyyy-MM-dd");
                  const dayEvents = leagueEventsByDate[dayKey] ?? [];
                  const isToday = isSameDay(calendarDay, today);

                  return (
                    <div
                      key={dayKey}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectedDateChange(calendarDay)}
                      onKeyDown={(event) => {
                        if (event.key == "Enter" || event.key == " ") {
                          event.preventDefault();
                          onSelectedDateChange(calendarDay);
                        }
                      }}
                      className={`relative min-h-40 border-b border-r border-white/30 px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                        isSameDay(calendarDay, selectedDate) ? "bg-white/35" : "hover:bg-white/25"
                      }`}
                    >
                      <div className="absolute left-2 right-2 top-2 flex items-start justify-between">
                        <span
                          className={`text-sm font-semibold ${
                            isSameMonth(calendarDay, monthDate) ? "text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {format(calendarDay, "d")}
                        </span>
                        {isToday ? (
                          <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Hoje
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-7 space-y-1.5 pr-1">
                        {dayEvents.slice(0, 2).map((leagueEvent) => (
                          <LeagueEventMiniCard
                            key={leagueEvent.id}
                            leagueEvent={leagueEvent}
                            onClick={() => setOpenedLeagueEvent(leagueEvent)}
                          />
                        ))}

                        {dayEvents.length > 2 ? (
                          <p className="pl-1 text-[10px] text-muted-foreground">+{dayEvents.length - 2} eventos</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={`${glassPanelClassName} md:hidden animate-in fade-in-0 slide-in-from-bottom-2 duration-500`}>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((calendarDay) => {
                  const dayKey = format(calendarDay, "yyyy-MM-dd");
                  const dayEvents = leagueEventsByDate[dayKey] ?? [];
                  const isToday = isSameDay(calendarDay, today);

                  return (
                    <button
                      key={dayKey}
                      type="button"
                      onClick={() => onSelectedDateChange(calendarDay)}
                      className={`relative h-16 rounded-xl border border-white/35 px-1 py-1 text-left text-xs backdrop-blur ${
                        isSameDay(calendarDay, selectedDate)
                          ? "bg-white/45 ring-1 ring-primary/25"
                          : isSameMonth(calendarDay, monthDate)
                            ? "bg-white/25"
                            : "bg-white/10"
                      }`}
                    >
                      <div className="absolute left-1.5 right-1.5 top-1 flex items-start justify-between">
                        <span
                          className={`text-xs font-semibold ${
                            isSameMonth(calendarDay, monthDate) ? "text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {format(calendarDay, "d")}
                        </span>
                        {isToday ? (
                          <span className="rounded-full bg-secondary px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Hoje
                          </span>
                        ) : null}
                      </div>

                      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex flex-wrap items-center gap-1">
                        {dayEvents.length > 0 ? <span className="text-[10px] text-muted-foreground">{dayEvents.length} evento(s)</span> : null}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 space-y-2 rounded-xl border border-white/35 bg-white/25 p-3 backdrop-blur-md">
                <p className="text-xs font-semibold text-muted-foreground">
                  {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                </p>
                {selectedDateEvents.length == 0 ? (
                  <div className="flex min-h-20 items-center justify-center">
                    <p className="text-sm text-muted-foreground">Nenhum evento neste dia.</p>
                  </div>
                ) : (
                  selectedDateEvents.map((leagueEvent) => (
                    <LeagueEventMiniCard
                      key={leagueEvent.id}
                      leagueEvent={leagueEvent}
                      onClick={() => setOpenedLeagueEvent(leagueEvent)}
                    />
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </main>

      <Dialog open={openedLeagueEvent != null} onOpenChange={(isOpen) => (!isOpen ? setOpenedLeagueEvent(null) : null)}>
        <DialogContent className="border-white/45 !bg-white/10 backdrop-blur-md shadow-[0_18px_45px_rgba(15,23,42,0.16)] sm:max-w-md">
          {openedLeagueEvent ? (
            <>
              <DialogHeader>
                <DialogTitle>{openedLeagueEvent.name}</DialogTitle>
                <DialogDescription>Detalhes do evento selecionado.</DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <Badge className={LEAGUE_EVENT_TYPE_BADGE_CLASS_NAMES[openedLeagueEvent.event_type]}>
                  {LEAGUE_EVENT_TYPE_LABELS[openedLeagueEvent.event_type]}
                </Badge>

                <div className="space-y-1">
                  <p className="text-muted-foreground">Data</p>
                  <p className="font-medium">{format(new Date(`${openedLeagueEvent.event_date}T12:00:00`), "dd/MM/yyyy")}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-muted-foreground">Organização</p>
                  <p className="font-medium">{resolveEventOrganizerName(openedLeagueEvent)}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-muted-foreground">Local</p>
                  <p className="font-medium">{openedLeagueEvent.location}</p>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
