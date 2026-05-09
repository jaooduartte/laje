import { useEffect, useMemo, useState } from "react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { toast } from "sonner";
import { useLeagueEvents } from "@/hooks/useLeagueEvents";
import { useTeams } from "@/hooks/useTeams";
import { LeagueCalendarPageView } from "@/pages/league-calendar/LeagueCalendarPageView";
import { isLeagueEventType } from "@/domain/league-events/leagueEvent.constants";
import { leagueEventHasOrganizerTeam, resolveLeagueEventOrganizerTeams } from "@/domain/league-events/leagueEvent.helpers";
import { bindLeagueEventReservationRequestPayload, createLeagueEventReservationRequest } from "@/domain/league-events/leagueEventReservation.repository";
import type { LeagueEventReservationRequestFormValues } from "@/domain/league-events/leagueEventReservation.types";
import { fetchLeagueEventsByDateRange } from "@/domain/league-events/leagueEvent.repository";
import { fetchLeagueCalendarHolidaysByDateRange, ensureLeagueCalendarHolidaysYear } from "@/domain/league-events/leagueCalendarHoliday.repository";
import { LeagueCalendarHolidayDayKind } from "@/lib/enums";
import type { LeagueCalendarHoliday, LeagueEvent } from "@/lib/types";

const ALL_ATHLETICS_FILTER = "ALL_ATHLETICS";
const ALL_EVENT_TYPES_FILTER = "ALL_EVENT_TYPES";
const HOLIDAY_FILTER_ALL = "ALL";
const HOLIDAY_FILTER_EVENTS_ONLY = "EVENTS_ONLY";
const HOLIDAY_FILTER_HOLIDAYS_ONLY = "HOLIDAYS_ONLY";
const HOLIDAY_FILTER_OPTIONAL_ONLY = "OPTIONAL_ONLY";
const CALENDAR_VIEW_TAB = "CALENDAR";
const RESERVATION_VIEW_TAB = "RESERVATION";

function resolveInitialReservationFormValues(): LeagueEventReservationRequestFormValues {
  return {
    teamId: "",
    eventName: "",
    eventType: null,
    eventDate: null,
    requesterName: "",
    requesterContact: "",
  };
}

type HolidayFilterMode =
  | typeof HOLIDAY_FILTER_ALL
  | typeof HOLIDAY_FILTER_EVENTS_ONLY
  | typeof HOLIDAY_FILTER_HOLIDAYS_ONLY
  | typeof HOLIDAY_FILTER_OPTIONAL_ONLY;

export function LeagueCalendarPage() {
  const [activeTab, setActiveTab] = useState<typeof CALENDAR_VIEW_TAB | typeof RESERVATION_VIEW_TAB>(CALENDAR_VIEW_TAB);
  const [monthDate, setMonthDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const { leagueEvents, loading } = useLeagueEvents({ monthDate });
  const { teams } = useTeams();
  const [athleticFilter, setAthleticFilter] = useState<string>(ALL_ATHLETICS_FILTER);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>(ALL_EVENT_TYPES_FILTER);
  const [holidayFilter, setHolidayFilter] = useState<HolidayFilterMode>(HOLIDAY_FILTER_ALL);
  const [eventSearch, setEventSearch] = useState("");
  const [reservationFormValues, setReservationFormValues] = useState<LeagueEventReservationRequestFormValues>(
    resolveInitialReservationFormValues(),
  );
  const [submittingReservationRequest, setSubmittingReservationRequest] = useState(false);
  const [pendingReservationRequestConflicts, setPendingReservationRequestConflicts] = useState<LeagueEvent[] | null>(null);
  const [yearLeagueEvents, setYearLeagueEvents] = useState<LeagueEvent[]>([]);
  const [yearLeagueHolidays, setYearLeagueHolidays] = useState<LeagueCalendarHoliday[]>([]);
  const [loadingYearLeagueEvents, setLoadingYearLeagueEvents] = useState(false);
  const [loadingYearLeagueHolidays, setLoadingYearLeagueHolidays] = useState(false);

  const yearRange = useMemo(() => {
    const selectedYear = Number(format(monthDate, "yyyy"));

    return {
      year: selectedYear,
      startDate: `${selectedYear.toString()}-01-01`,
      endDate: `${selectedYear.toString()}-12-31`,
    };
  }, [monthDate]);

  useEffect(() => {
    const fetchYearLeagueEvents = async () => {
      setLoadingYearLeagueEvents(true);

      const { data, error } = await fetchLeagueEventsByDateRange(yearRange);

      if (error) {
        console.error("Erro ao carregar eventos anuais da liga:", error.message);
        setYearLeagueEvents([]);
        setLoadingYearLeagueEvents(false);
        return;
      }

      setYearLeagueEvents(data);
      setLoadingYearLeagueEvents(false);
    };

    fetchYearLeagueEvents();
  }, [yearRange]);

  useEffect(() => {
    const fetchYearLeagueHolidays = async () => {
      setLoadingYearLeagueHolidays(true);

      const ensureResponse = await ensureLeagueCalendarHolidaysYear(yearRange.year);

      if (ensureResponse.error) {
        console.error("Erro ao garantir feriados anuais da liga:", ensureResponse.error.message);
      }

      const { data, error } = await fetchLeagueCalendarHolidaysByDateRange(yearRange);

      if (error) {
        console.error("Erro ao carregar feriados anuais da liga:", error.message);
        setYearLeagueHolidays([]);
        setLoadingYearLeagueHolidays(false);
        return;
      }

      setYearLeagueHolidays(data);
      setLoadingYearLeagueHolidays(false);
    };

    fetchYearLeagueHolidays();
  }, [yearRange]);

  const calendarDays = useMemo(() => {
    const monthStartDate = startOfMonth(monthDate);
    const monthEndDate = endOfMonth(monthDate);
    const calendarStartDate = startOfWeek(monthStartDate, { weekStartsOn: 0 });
    const calendarEndDate = endOfWeek(monthEndDate, { weekStartsOn: 0 });

    return eachDayOfInterval({
      start: calendarStartDate,
      end: calendarEndDate,
    });
  }, [monthDate]);

  const leagueEventsByDate = useMemo(() => {
    const groupedLeagueEvents: Record<string, typeof leagueEvents> = {};

    leagueEvents.forEach((leagueEvent) => {
      const dateKey = leagueEvent.event_date;

      if (!groupedLeagueEvents[dateKey]) {
        groupedLeagueEvents[dateKey] = [];
      }

      groupedLeagueEvents[dateKey].push(leagueEvent);
    });

    return groupedLeagueEvents;
  }, [leagueEvents]);

  const leagueHolidaysByDate = useMemo(() => {
    const groupedLeagueHolidays: Record<string, LeagueCalendarHoliday[]> = {};

    yearLeagueHolidays.forEach((leagueHoliday) => {
      const dateKey = leagueHoliday.holiday_date;

      if (!groupedLeagueHolidays[dateKey]) {
        groupedLeagueHolidays[dateKey] = [];
      }

      groupedLeagueHolidays[dateKey].push(leagueHoliday);
    });

    return groupedLeagueHolidays;
  }, [yearLeagueHolidays]);

  const athleticsFilterOptions = useMemo(() => {
    const athleticsById = new Map<string, string>();

    yearLeagueEvents.forEach((leagueEvent) => {
      resolveLeagueEventOrganizerTeams(leagueEvent).forEach((organizerTeam) => {
        athleticsById.set(organizerTeam.id, organizerTeam.name);
      });
    });

    return [...athleticsById.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((firstAthletic, secondAthletic) => firstAthletic.name.localeCompare(secondAthletic.name));
  }, [yearLeagueEvents]);

  const filteredLeagueEvents = useMemo(() => {
    if (holidayFilter == HOLIDAY_FILTER_HOLIDAYS_ONLY || holidayFilter == HOLIDAY_FILTER_OPTIONAL_ONLY) {
      return [];
    }

    const normalizedSearch = eventSearch.trim().toLowerCase();

    return yearLeagueEvents
      .filter((leagueEvent) => {
        if (athleticFilter != ALL_ATHLETICS_FILTER && !leagueEventHasOrganizerTeam(leagueEvent, athleticFilter)) {
          return false;
        }

        if (eventTypeFilter != ALL_EVENT_TYPES_FILTER && leagueEvent.event_type != eventTypeFilter) {
          return false;
        }

        if (normalizedSearch && !leagueEvent.name.toLowerCase().includes(normalizedSearch)) {
          return false;
        }

        return true;
      })
      .sort((firstLeagueEvent, secondLeagueEvent) => {
        const dateComparison = firstLeagueEvent.event_date.localeCompare(secondLeagueEvent.event_date);

        if (dateComparison != 0) {
          return dateComparison;
        }

        return firstLeagueEvent.name.localeCompare(secondLeagueEvent.name);
      });
  }, [athleticFilter, eventSearch, eventTypeFilter, holidayFilter, yearLeagueEvents]);

  const filteredLeagueHolidays = useMemo(() => {
    if (holidayFilter == HOLIDAY_FILTER_EVENTS_ONLY) {
      return [];
    }

    const normalizedSearch = eventSearch.trim().toLowerCase();

    return yearLeagueHolidays
      .filter((leagueHoliday) => {
        if (
          holidayFilter == HOLIDAY_FILTER_OPTIONAL_ONLY &&
          leagueHoliday.day_kind != LeagueCalendarHolidayDayKind.OPTIONAL
        ) {
          return false;
        }

        if (normalizedSearch && !leagueHoliday.name.toLowerCase().includes(normalizedSearch)) {
          return false;
        }

        return true;
      })
      .sort((firstLeagueHoliday, secondLeagueHoliday) => {
        const dateComparison = firstLeagueHoliday.holiday_date.localeCompare(secondLeagueHoliday.holiday_date);

        if (dateComparison != 0) {
          return dateComparison;
        }

        return firstLeagueHoliday.name.localeCompare(secondLeagueHoliday.name);
      });
  }, [eventSearch, holidayFilter, yearLeagueHolidays]);

  const hasActiveFilters =
    athleticFilter != ALL_ATHLETICS_FILTER ||
    eventTypeFilter != ALL_EVENT_TYPES_FILTER ||
    holidayFilter != HOLIDAY_FILTER_ALL ||
    eventSearch.trim().length > 0;
  const loadingWithFilters = loading || loadingYearLeagueEvents || loadingYearLeagueHolidays;

  const handlePreviousMonth = () => {
    setMonthDate((currentMonthDate) => subMonths(currentMonthDate, 1));
  };

  const handleNextMonth = () => {
    setMonthDate((currentMonthDate) => addMonths(currentMonthDate, 1));
  };

  const handleSelectedDateChange = (date: Date) => {
    setSelectedDate((currentSelectedDate) => (currentSelectedDate && isSameDay(currentSelectedDate, date) ? null : date));

    const selectedDateMonthKey = format(date, "yyyy-MM");
    const currentMonthKey = format(monthDate, "yyyy-MM");

    if (selectedDateMonthKey != currentMonthKey) {
      setMonthDate(date);
    }
  };

  const handleEventTypeFilterChange = (value: string) => {
    if (value == ALL_EVENT_TYPES_FILTER || isLeagueEventType(value)) {
      setEventTypeFilter(value);
    }
  };

  const handleHolidayFilterChange = (value: string) => {
    if (
      value == HOLIDAY_FILTER_ALL ||
      value == HOLIDAY_FILTER_EVENTS_ONLY ||
      value == HOLIDAY_FILTER_HOLIDAYS_ONLY ||
      value == HOLIDAY_FILTER_OPTIONAL_ONLY
    ) {
      setHolidayFilter(value);
    }
  };

  const orderedTeams = useMemo(() => {
    return [...teams].sort((firstTeam, secondTeam) => firstTeam.name.localeCompare(secondTeam.name));
  }, [teams]);

  const handleReservationFieldChange = <FieldName extends keyof LeagueEventReservationRequestFormValues>(
    fieldName: FieldName,
    value: LeagueEventReservationRequestFormValues[FieldName],
  ) => {
    setReservationFormValues((currentReservationFormValues) => ({
      ...currentReservationFormValues,
      [fieldName]: value,
    }));
  };

  const submitReservationRequest = async (shouldIgnoreDateConflict: boolean) => {
    try {
      const payload = bindLeagueEventReservationRequestPayload(reservationFormValues);

      if (!shouldIgnoreDateConflict) {
        const conflictingEventsResponse = await fetchLeagueEventsByDateRange({
          startDate: payload.event_date,
          endDate: payload.event_date,
        });

        if (conflictingEventsResponse.error) {
          throw new Error("Não foi possível validar conflito de data no calendário.");
        }

        if ((conflictingEventsResponse.data ?? []).length > 0) {
          setPendingReservationRequestConflicts(conflictingEventsResponse.data as LeagueEvent[]);
          return;
        }
      }

      setSubmittingReservationRequest(true);

      const { error } = await createLeagueEventReservationRequest(payload);

      setSubmittingReservationRequest(false);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Solicitação de reserva enviada para aprovação.");
      setPendingReservationRequestConflicts(null);
      setReservationFormValues(resolveInitialReservationFormValues());
      setActiveTab(CALENDAR_VIEW_TAB);
    } catch (error) {
      setSubmittingReservationRequest(false);
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a solicitação.");
    }
  };

  return (
    <LeagueCalendarPageView
      activeTab={activeTab}
      loading={loadingWithFilters}
      monthDate={monthDate}
      selectedDate={selectedDate}
      calendarDays={calendarDays}
      leagueEventsByDate={leagueEventsByDate}
      leagueHolidaysByDate={leagueHolidaysByDate}
      leagueEvents={leagueEvents}
      leagueHolidays={yearLeagueHolidays}
      filteredLeagueEvents={filteredLeagueEvents}
      filteredLeagueHolidays={filteredLeagueHolidays}
      athleticsFilterOptions={athleticsFilterOptions}
      athleticFilter={athleticFilter}
      allAthleticsFilter={ALL_ATHLETICS_FILTER}
      eventTypeFilter={eventTypeFilter}
      allEventTypesFilter={ALL_EVENT_TYPES_FILTER}
      holidayFilter={holidayFilter}
      allHolidayFilter={HOLIDAY_FILTER_ALL}
      eventsOnlyHolidayFilter={HOLIDAY_FILTER_EVENTS_ONLY}
      holidaysOnlyHolidayFilter={HOLIDAY_FILTER_HOLIDAYS_ONLY}
      optionalOnlyHolidayFilter={HOLIDAY_FILTER_OPTIONAL_ONLY}
      eventSearch={eventSearch}
      hasActiveFilters={hasActiveFilters}
      teams={orderedTeams}
      reservationFormValues={reservationFormValues}
      submittingReservationRequest={submittingReservationRequest}
      pendingReservationRequestConflicts={pendingReservationRequestConflicts}
      onActiveTabChange={setActiveTab}
      onPreviousMonth={handlePreviousMonth}
      onNextMonth={handleNextMonth}
      onSelectedDateChange={handleSelectedDateChange}
      onAthleticFilterChange={setAthleticFilter}
      onEventTypeFilterChange={handleEventTypeFilterChange}
      onHolidayFilterChange={handleHolidayFilterChange}
      onEventSearchChange={setEventSearch}
      onReservationFieldChange={handleReservationFieldChange}
      onSubmitReservationRequest={() => void submitReservationRequest(false)}
      onConfirmReservationRequestDespiteConflict={() => void submitReservationRequest(true)}
      onDismissReservationConflict={() => setPendingReservationRequestConflicts(null)}
    />
  );
}
