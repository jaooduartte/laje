import { useState } from "react";
import { format, isSameDay, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Flag, Loader2, Search } from "lucide-react";
import { Header } from "@/components/Header";
import { AppBadge } from "@/components/ui/app-badge";
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
import { LeagueCalendarHolidayDayKind, LeagueEventType } from "@/lib/enums";
import type { LeagueCalendarHoliday, LeagueEvent } from "@/lib/types";
import {
  LEAGUE_EVENT_LEGEND_ORDER,
  LEAGUE_EVENT_TYPE_BADGE_TONES,
  LEAGUE_EVENT_TYPE_DOT_CLASS_NAMES,
  LEAGUE_EVENT_TYPE_GLASS_CARD_CLASS_NAMES,
  LEAGUE_EVENT_TYPE_LABELS,
  LEAGUE_EVENT_TYPE_META_TEXT_CLASS_NAMES,
} from "@/domain/league-events/leagueEvent.constants";
import { resolveLeagueEventOrganizerName, resolveUniqueLeagueEventTypes } from "@/domain/league-events/leagueEvent.helpers";
import {
  LEAGUE_CALENDAR_HOLIDAY_DAY_KIND_DOT_CLASS_NAMES,
  LEAGUE_CALENDAR_HOLIDAY_DAY_KIND_LABELS,
  LEAGUE_CALENDAR_HOLIDAY_DAY_KIND_LEGEND_ORDER,
} from "@/domain/league-events/leagueCalendarHoliday.constants";

interface AthleticFilterOption {
  id: string;
  name: string;
}

interface LeagueCalendarPageViewProps {
  loading: boolean;
  monthDate: Date;
  selectedDate: Date | null;
  calendarDays: Date[];
  leagueEventsByDate: Record<string, LeagueEvent[]>;
  leagueHolidaysByDate: Record<string, LeagueCalendarHoliday[]>;
  leagueEvents: LeagueEvent[];
  leagueHolidays: LeagueCalendarHoliday[];
  filteredLeagueEvents: LeagueEvent[];
  filteredLeagueHolidays: LeagueCalendarHoliday[];
  athleticsFilterOptions: AthleticFilterOption[];
  athleticFilter: string;
  allAthleticsFilter: string;
  eventTypeFilter: string;
  allEventTypesFilter: string;
  holidayFilter: string;
  allHolidayFilter: string;
  eventsOnlyHolidayFilter: string;
  holidaysOnlyHolidayFilter: string;
  optionalOnlyHolidayFilter: string;
  eventSearch: string;
  hasActiveFilters: boolean;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onSelectedDateChange: (date: Date) => void;
  onAthleticFilterChange: (value: string) => void;
  onEventTypeFilterChange: (value: string) => void;
  onHolidayFilterChange: (value: string) => void;
  onEventSearchChange: (value: string) => void;
}

const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const LEAGUE_EVENT_TYPE_MOBILE_LIGHT_CARD_CLASS_NAMES = {
  [LeagueEventType.HH]: "!bg-amber-100/80 text-amber-900 dark:!bg-amber-900/40 dark:text-amber-100",
  [LeagueEventType.OPEN_BAR]: "!bg-emerald-100/80 text-emerald-900 dark:!bg-emerald-900/40 dark:text-emerald-100",
  [LeagueEventType.CHAMPIONSHIP]: "!bg-blue-100/80 text-blue-900 dark:!bg-blue-900/40 dark:text-blue-100",
  [LeagueEventType.LAJE_EVENT]: "!bg-red-100/80 text-red-900 dark:!bg-red-900/40 dark:text-red-100",
} as const;

function LeagueEventMiniCard({ leagueEvent, onClick }: { leagueEvent: LeagueEvent; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`w-full rounded-xl border-transparent px-2 py-1.5 text-left backdrop-blur-md transition-all hover:scale-[1.01] hover:shadow-sm dark:shadow-none ${LEAGUE_EVENT_TYPE_GLASS_CARD_CLASS_NAMES[leagueEvent.event_type]}`}
    >
      <p className="truncate text-[11px] font-semibold">{leagueEvent.name}</p>
      <p className={`truncate text-[10px] ${LEAGUE_EVENT_TYPE_META_TEXT_CLASS_NAMES[leagueEvent.event_type]}`}>
        {leagueEvent.location}
      </p>
      <p className={`truncate text-[10px] ${LEAGUE_EVENT_TYPE_META_TEXT_CLASS_NAMES[leagueEvent.event_type]}`}>
        {resolveLeagueEventOrganizerName(leagueEvent)}
      </p>
    </button>
  );
}

function LeagueHolidayMiniBadge({ leagueHoliday }: { leagueHoliday: LeagueCalendarHoliday }) {
  return (
    <Badge
      variant="outline"
      className="h-5 max-w-full gap-1 rounded-md border-transparent bg-slate-200/90 px-1.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-700/55 dark:text-slate-100"
    >
      <Flag className="h-3 w-3 shrink-0" />
      <span className="truncate">{leagueHoliday.name}</span>
    </Badge>
  );
}

function LeagueHolidayListBadge({ leagueHoliday }: { leagueHoliday: LeagueCalendarHoliday }) {
  return (
    <Badge
      variant="outline"
      className="h-auto max-w-full gap-1.5 whitespace-normal rounded-md border-transparent bg-slate-200/90 px-2 py-1 text-left text-[11px] font-medium text-slate-700 dark:bg-slate-700/55 dark:text-slate-100"
    >
      <Flag className="h-3 w-3 shrink-0" />
      <span className="truncate">
        {format(new Date(`${leagueHoliday.holiday_date}T12:00:00`), "dd/MM")} • {leagueHoliday.name}
      </span>
    </Badge>
  );
}

export function LeagueCalendarPageView({
  loading,
  monthDate,
  selectedDate,
  calendarDays,
  leagueEventsByDate,
  leagueHolidaysByDate,
  leagueEvents,
  leagueHolidays,
  filteredLeagueEvents,
  filteredLeagueHolidays,
  athleticsFilterOptions,
  athleticFilter,
  allAthleticsFilter,
  eventTypeFilter,
  allEventTypesFilter,
  holidayFilter,
  allHolidayFilter,
  eventsOnlyHolidayFilter,
  holidaysOnlyHolidayFilter,
  optionalOnlyHolidayFilter,
  eventSearch,
  hasActiveFilters,
  onPreviousMonth,
  onNextMonth,
  onSelectedDateChange,
  onAthleticFilterChange,
  onEventTypeFilterChange,
  onHolidayFilterChange,
  onEventSearchChange,
}: LeagueCalendarPageViewProps) {
  const [openedLeagueEvent, setOpenedLeagueEvent] = useState<LeagueEvent | null>(null);
  const [openedDayDetails, setOpenedDayDetails] = useState<{
    selectedDateLabel: string;
    leagueEvents: LeagueEvent[];
  } | null>(null);
  const monthControlClassName =
    "h-9 rounded-xl border border-transparent app-input-field text-secondary-foreground";
  const glassPanelClassName = "glass-panel p-4";
  const filtersFieldClassName = "app-input-field h-9 rounded-xl";
  const selectedDateKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const selectedDateEvents = selectedDateKey ? leagueEventsByDate[selectedDateKey] ?? [] : [];
  const selectedDateHolidays = selectedDateKey ? leagueHolidaysByDate[selectedDateKey] ?? [] : [];
  const selectedDateHasItems = selectedDateKey != null && (selectedDateEvents.length > 0 || selectedDateHolidays.length > 0);
  const monthDatePrefix = format(monthDate, "yyyy-MM");
  const monthLeagueEvents = leagueEvents.filter((leagueEvent) => leagueEvent.event_date.startsWith(monthDatePrefix));
  const monthLeagueHolidays = leagueHolidays.filter((leagueHoliday) => leagueHoliday.holiday_date.startsWith(monthDatePrefix));
  const mobileVisibleEvents = selectedDateHasItems ? selectedDateEvents : monthLeagueEvents;
  const mobileVisibleHolidays = selectedDateHasItems ? selectedDateHolidays : monthLeagueHolidays;
  const totalFilteredItems = filteredLeagueEvents.length + filteredLeagueHolidays.length;
  const eventsSummaryLabel = hasActiveFilters
    ? `${totalFilteredItems} evento(s) no ano`
    : `${leagueEvents.length + leagueHolidays.length} evento(s) no ano`;
  const today = new Date();
  const handleOpenLeagueEvent = (leagueEvent: LeagueEvent) => {
    if (typeof window != "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      return;
    }

    setOpenedLeagueEvent(leagueEvent);
    setOpenedDayDetails(null);
  };

  const handleOpenDayDetails = (calendarDay: Date, dayLeagueEvents: LeagueEvent[]) => {
    if (dayLeagueEvents.length == 0) {
      return;
    }

    setOpenedDayDetails({
      selectedDateLabel: format(calendarDay, "dd/MM/yyyy"),
      leagueEvents: dayLeagueEvents,
    });
    setOpenedLeagueEvent(null);
  };

  return (
    <div className="app-page">
      <Header />

      <main className="container space-y-4 py-8">
        <section className={`${glassPanelClassName} animate-in fade-in-0 slide-in-from-bottom-2 duration-500`}>
          <div className="flex flex-col items-center justify-center gap-2">
            <h1 className="text-center text-2xl font-display font-bold">Calendário da Liga</h1>
            <p className="text-center text-sm text-muted-foreground">Eventos públicos cadastrados pelas atléticas parceiras e pela LAJE.</p>
          </div>
        </section>

        <section className={`${glassPanelClassName} animate-in fade-in-0 slide-in-from-bottom-2 duration-500`}>
          <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_220px_220px_240px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={eventSearch}
                onChange={(event) => onEventSearchChange(event.target.value)}
                placeholder="Buscar evento por nome"
                className={`${filtersFieldClassName} pl-9`}
              />
            </div>

            <Select value={athleticFilter} onValueChange={onAthleticFilterChange}>
              <SelectTrigger className={filtersFieldClassName}>
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
              <SelectTrigger className={filtersFieldClassName}>
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

            <Select value={holidayFilter} onValueChange={onHolidayFilterChange}>
              <SelectTrigger className={filtersFieldClassName}>
                <SelectValue placeholder="Filtrar por feriados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={allHolidayFilter}>Todos</SelectItem>
                <SelectItem value={eventsOnlyHolidayFilter}>Somente eventos</SelectItem>
                <SelectItem value={holidaysOnlyHolidayFilter}>Somente feriados</SelectItem>
                <SelectItem value={optionalOnlyHolidayFilter}>Somente ponto facultativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        <section className={`${glassPanelClassName} animate-in fade-in-0 slide-in-from-bottom-2 duration-500`}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              {LEAGUE_EVENT_LEGEND_ORDER.map((leagueEventType) => (
                <div key={leagueEventType} className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <span className={`h-2.5 w-2.5 rounded-full ${LEAGUE_EVENT_TYPE_DOT_CLASS_NAMES[leagueEventType]}`} />
                  <span>{LEAGUE_EVENT_TYPE_LABELS[leagueEventType]}</span>
                </div>
              ))}
              {LEAGUE_CALENDAR_HOLIDAY_DAY_KIND_LEGEND_ORDER.map((holidayDayKind) => (
                <div key={holidayDayKind} className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <span className={`h-2.5 w-2.5 rounded-full ${LEAGUE_CALENDAR_HOLIDAY_DAY_KIND_DOT_CLASS_NAMES[holidayDayKind]}`} />
                  <span>{LEAGUE_CALENDAR_HOLIDAY_DAY_KIND_LABELS[holidayDayKind]}</span>
                </div>
              ))}
              <span className="text-xs text-muted-foreground">{eventsSummaryLabel}</span>
            </div>

            <div className="flex items-center justify-center gap-2 sm:justify-end">
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

        {loading ? (
          <div className={`${glassPanelClassName} flex min-h-[420px] items-center justify-center`}>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : hasActiveFilters ? (
          <section className={`${glassPanelClassName} animate-in fade-in-0 slide-in-from-bottom-2 duration-500`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-display font-semibold">Itens filtrados</h2>
              <p className="text-xs text-muted-foreground">{totalFilteredItems} resultado(s)</p>
            </div>

            {totalFilteredItems == 0 ? (
              <div className="app-card-muted flex min-h-44 items-center justify-center rounded-2xl">
                <p className="text-sm text-muted-foreground">Nenhum item encontrado para os filtros aplicados.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredLeagueHolidays.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Feriados</p>
                    <div className="flex flex-wrap gap-2">
                      {filteredLeagueHolidays.map((leagueHoliday) => (
                        <LeagueHolidayListBadge key={leagueHoliday.id} leagueHoliday={leagueHoliday} />
                      ))}
                    </div>
                  </div>
                ) : null}

                {filteredLeagueEvents.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Eventos</p>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {filteredLeagueEvents.map((leagueEvent, leagueEventIndex) => (
                        <button
                          key={leagueEvent.id}
                          type="button"
                          onClick={() => handleOpenLeagueEvent(leagueEvent)}
                          className={`app-card-muted rounded-2xl border-transparent p-3 text-left transition-all hover:scale-[1.01] ${LEAGUE_EVENT_TYPE_GLASS_CARD_CLASS_NAMES[leagueEvent.event_type]} animate-in fade-in-0 slide-in-from-bottom-2 duration-300`}
                          style={{ animationDelay: `${leagueEventIndex * 35}ms` }}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <AppBadge tone={LEAGUE_EVENT_TYPE_BADGE_TONES[leagueEvent.event_type]}>
                              {LEAGUE_EVENT_TYPE_LABELS[leagueEvent.event_type]}
                            </AppBadge>
                            <span className={`text-xs ${LEAGUE_EVENT_TYPE_META_TEXT_CLASS_NAMES[leagueEvent.event_type]}`}>
                              {format(new Date(`${leagueEvent.event_date}T12:00:00`), "dd/MM/yyyy")}
                            </span>
                          </div>
                          <p className="truncate text-sm font-semibold">{leagueEvent.name}</p>
                          <p className={`mt-1 truncate text-xs ${LEAGUE_EVENT_TYPE_META_TEXT_CLASS_NAMES[leagueEvent.event_type]}`}>
                            {leagueEvent.location}
                          </p>
                          <p className={`truncate text-xs ${LEAGUE_EVENT_TYPE_META_TEXT_CLASS_NAMES[leagueEvent.event_type]}`}>
                            {resolveLeagueEventOrganizerName(leagueEvent)}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        ) : (
          <>
            <section className={`${glassPanelClassName} hidden p-0 md:block animate-in fade-in-0 slide-in-from-bottom-2 duration-500`}>
              <div className="app-calendar-weekdays-bar grid grid-cols-7 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                {WEEK_DAYS.map((weekDay) => (
                  <div key={weekDay} className="px-2 py-1 text-center">
                    {weekDay}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 p-1">
                {calendarDays.map((calendarDay) => {
                  const dayKey = format(calendarDay, "yyyy-MM-dd");
                  const dayEvents = leagueEventsByDate[dayKey] ?? [];
                  const dayHolidays = leagueHolidaysByDate[dayKey] ?? [];
                  const isToday = isSameDay(calendarDay, today);
                  const isSelectedDay = selectedDate != null && isSameDay(calendarDay, selectedDate);

                  const dayBaseClassName =
                    "app-card-muted relative min-h-40 rounded-xl px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
                  const dayStateClassName = isToday
                    ? "!bg-primary/20 ring-1 !ring-primary/30 hover:!bg-primary/25 dark:!bg-primary/20 dark:!ring-primary/40 dark:hover:!bg-primary/25"
                    : isSelectedDay
                      ? "!bg-slate-200/70 ring-1 !ring-slate-300/80 hover:!bg-slate-200/90 dark:!bg-[hsl(0_0%_100%/0.10)] dark:!ring-white/10 dark:hover:!bg-[hsl(0_0%_100%/0.15)]"
                      : "hover:!bg-background/70 dark:hover:!bg-[hsl(0_0%_10%)]";

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
                      className={`${dayBaseClassName} ${dayStateClassName}`}
                    >
                      <div className="absolute left-2 right-2 top-2 flex items-start justify-between">
                        <span
                            className={`text-sm font-semibold ${
                            isSameMonth(calendarDay, monthDate) ? "text-foreground" : "text-muted-foreground/40"
                          }`}
                        >
                          {format(calendarDay, "d")}
                        </span>
                      </div>

                      <div className="mt-7 space-y-1.5 pr-1">
                        {dayHolidays.slice(0, 1).map((leagueHoliday) => (
                          <LeagueHolidayMiniBadge key={leagueHoliday.id} leagueHoliday={leagueHoliday} />
                        ))}

                        {dayHolidays.length > 1 ? (
                          <span className="pl-1 text-[10px] text-muted-foreground">
                            +{dayHolidays.length - 1} feriado(s)
                          </span>
                        ) : null}

                        {dayEvents.slice(0, 1).map((leagueEvent) => (
                          <LeagueEventMiniCard
                            key={leagueEvent.id}
                            leagueEvent={leagueEvent}
                            onClick={() => handleOpenLeagueEvent(leagueEvent)}
                          />
                        ))}

                        {dayEvents.length > 1 ? (
                          <button
                            type="button"
                            className="pl-1 text-[10px] text-muted-foreground hover:underline"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenDayDetails(calendarDay, dayEvents);
                            }}
                          >
                            +{dayEvents.length - 1} evento(s)
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={`${glassPanelClassName} md:hidden animate-in fade-in-0 slide-in-from-bottom-2 duration-500`}>
              <div className="app-calendar-weekdays-bar mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-muted-foreground">
                {WEEK_DAYS.map((weekDay) => (
                  <div key={weekDay} className="py-1">
                    {weekDay}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((calendarDay) => {
                  const dayKey = format(calendarDay, "yyyy-MM-dd");
                  const dayEvents = leagueEventsByDate[dayKey] ?? [];
                  const dayHolidays = leagueHolidaysByDate[dayKey] ?? [];
                  const isToday = isSameDay(calendarDay, today);
                  const isSelectedDay = selectedDate != null && isSameDay(calendarDay, selectedDate);
                  const dayEventTypes = resolveUniqueLeagueEventTypes(dayEvents);
                  const dayHasHoliday = dayHolidays.length > 0;

                  const dayBaseClassName =
                    "app-card-muted relative h-16 rounded-xl px-1 py-1 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
                  const dayStateClassName = isToday
                    ? "!bg-primary/10 ring-1 !ring-primary/20 hover:!bg-primary/15 dark:!bg-primary/20 dark:!ring-primary/40 dark:hover:!bg-primary/25"
                    : isSelectedDay
                      ? "!bg-slate-200/70 ring-1 !ring-slate-300/80 hover:!bg-slate-200/90 dark:!bg-[hsl(0_0%_100%/0.10)] dark:!ring-white/10 dark:hover:!bg-[hsl(0_0%_100%/0.15)]"
                      : "hover:!bg-background/70 dark:hover:!bg-[hsl(0_0%_10%)]";

                  return (
                    <button
                      key={dayKey}
                      type="button"
                      onClick={() => onSelectedDateChange(calendarDay)}
                      className={`${dayBaseClassName} ${dayStateClassName}`}
                    >
                      <div className="absolute left-1.5 right-1.5 top-1 flex items-start justify-between">
                        <div className="flex flex-col items-start gap-0.5">
                          <span
                            className={`text-xs font-semibold ${
                              isSameMonth(calendarDay, monthDate) ? "text-foreground" : "text-muted-foreground/40"
                            }`}
                          >
                            {format(calendarDay, "d")}
                          </span>
                        </div>
                        {dayEventTypes.length > 0 || dayHasHoliday ? (
                          <div className="mt-0.5 flex flex-col items-end gap-1">
                            {dayHasHoliday ? (
                              <span className={`block h-2 w-2 rounded-full ${LEAGUE_CALENDAR_HOLIDAY_DAY_KIND_DOT_CLASS_NAMES[LeagueCalendarHolidayDayKind.HOLIDAY]}`} />
                            ) : null}
                            {dayEventTypes.map((leagueEventType) => (
                              <span
                                key={`${dayKey}-${leagueEventType}`}
                                className={`block h-2 w-2 rounded-full ${LEAGUE_EVENT_TYPE_DOT_CLASS_NAMES[leagueEventType]}`}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="app-card-muted mt-3 space-y-2 rounded-xl p-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  {selectedDateHasItems && selectedDate
                    ? format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })
                    : `Eventos de ${format(monthDate, "MMMM 'de' yyyy", { locale: ptBR })}`}
                </p>
                {mobileVisibleEvents.length == 0 && mobileVisibleHolidays.length == 0 ? (
                  <div className="flex min-h-20 items-center justify-center">
                    <p className="text-sm text-muted-foreground">Nenhum item neste período.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {mobileVisibleHolidays.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {mobileVisibleHolidays.map((leagueHoliday) => (
                          <LeagueHolidayListBadge key={leagueHoliday.id} leagueHoliday={leagueHoliday} />
                        ))}
                      </div>
                    ) : null}

                    {mobileVisibleEvents.map((leagueEvent) => (
                      <div
                        key={leagueEvent.id}
                        className={`app-card-muted rounded-xl border-transparent px-2 py-1.5 text-left ${LEAGUE_EVENT_TYPE_MOBILE_LIGHT_CARD_CLASS_NAMES[leagueEvent.event_type]}`}
                      >
                        {!selectedDateHasItems ? (
                          <p className={`text-[10px] font-medium ${LEAGUE_EVENT_TYPE_META_TEXT_CLASS_NAMES[leagueEvent.event_type]}`}>
                            {format(new Date(`${leagueEvent.event_date}T12:00:00`), "dd/MM/yyyy")}
                          </p>
                        ) : null}
                        <p className="truncate text-[11px] font-semibold">{leagueEvent.name}</p>
                        <p className={`truncate text-[10px] ${LEAGUE_EVENT_TYPE_META_TEXT_CLASS_NAMES[leagueEvent.event_type]}`}>
                          {leagueEvent.location}
                        </p>
                        <p className={`truncate text-[10px] ${LEAGUE_EVENT_TYPE_META_TEXT_CLASS_NAMES[leagueEvent.event_type]}`}>
                          {resolveLeagueEventOrganizerName(leagueEvent)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      <Dialog
        open={openedLeagueEvent != null || openedDayDetails != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setOpenedLeagueEvent(null);
            setOpenedDayDetails(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {openedLeagueEvent ? (
            <>
              <DialogHeader>
                <DialogTitle>{openedLeagueEvent.name}</DialogTitle>
                <DialogDescription>Detalhes do evento selecionado.</DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <AppBadge tone={LEAGUE_EVENT_TYPE_BADGE_TONES[openedLeagueEvent.event_type]}>
                  {LEAGUE_EVENT_TYPE_LABELS[openedLeagueEvent.event_type]}
                </AppBadge>

                <div className="space-y-1">
                  <p className="text-muted-foreground">Data</p>
                  <p className="font-medium">{format(new Date(`${openedLeagueEvent.event_date}T12:00:00`), "dd/MM/yyyy")}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-muted-foreground">Organização</p>
                  <p className="font-medium">{resolveLeagueEventOrganizerName(openedLeagueEvent)}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-muted-foreground">Local</p>
                  <p className="font-medium">{openedLeagueEvent.location}</p>
                </div>
              </div>
            </>
          ) : openedDayDetails ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  Eventos do dia {openedDayDetails.selectedDateLabel}
                </DialogTitle>
                <DialogDescription>Lista de eventos deste dia.</DialogDescription>
              </DialogHeader>

              <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                {openedDayDetails.leagueEvents.map((leagueEvent) => (
                  <div
                    key={leagueEvent.id}
                    className={`app-card-muted rounded-xl border-transparent p-3 ${LEAGUE_EVENT_TYPE_GLASS_CARD_CLASS_NAMES[leagueEvent.event_type]}`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{leagueEvent.name}</p>
                      <AppBadge tone={LEAGUE_EVENT_TYPE_BADGE_TONES[leagueEvent.event_type]}>
                        {LEAGUE_EVENT_TYPE_LABELS[leagueEvent.event_type]}
                      </AppBadge>
                    </div>
                    <p className={`truncate text-xs ${LEAGUE_EVENT_TYPE_META_TEXT_CLASS_NAMES[leagueEvent.event_type]}`}>
                      Organização: {resolveLeagueEventOrganizerName(leagueEvent)}
                    </p>
                    <p className={`truncate text-xs ${LEAGUE_EVENT_TYPE_META_TEXT_CLASS_NAMES[leagueEvent.event_type]}`}>
                      Local: {leagueEvent.location}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
