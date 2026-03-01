import { useEffect, useMemo, useState } from "react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { useLeagueEvents } from "@/hooks/useLeagueEvents";
import { LeagueCalendarPageView } from "@/pages/league-calendar/LeagueCalendarPageView";
import { isLeagueEventType } from "@/domain/league-events/leagueEvent.constants";
import { leagueEventHasOrganizerTeam, resolveLeagueEventOrganizerTeams } from "@/domain/league-events/leagueEvent.helpers";
import { fetchLeagueEventsByDateRange } from "@/domain/league-events/leagueEvent.repository";
import type { LeagueEvent } from "@/lib/types";

const ALL_ATHLETICS_FILTER = "ALL_ATHLETICS";
const ALL_EVENT_TYPES_FILTER = "ALL_EVENT_TYPES";

export function LeagueCalendarPage() {
  const [monthDate, setMonthDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { leagueEvents, loading } = useLeagueEvents({ monthDate });
  const [athleticFilter, setAthleticFilter] = useState<string>(ALL_ATHLETICS_FILTER);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>(ALL_EVENT_TYPES_FILTER);
  const [eventSearch, setEventSearch] = useState("");
  const [yearLeagueEvents, setYearLeagueEvents] = useState<LeagueEvent[]>([]);
  const [loadingYearLeagueEvents, setLoadingYearLeagueEvents] = useState(false);

  const yearRange = useMemo(() => {
    const selectedYear = format(monthDate, "yyyy");

    return {
      startDate: `${selectedYear}-01-01`,
      endDate: `${selectedYear}-12-31`,
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
  }, [athleticFilter, eventSearch, eventTypeFilter, yearLeagueEvents]);

  const hasActiveFilters =
    athleticFilter != ALL_ATHLETICS_FILTER ||
    eventTypeFilter != ALL_EVENT_TYPES_FILTER ||
    eventSearch.trim().length > 0;
  const loadingWithFilters = loading || (hasActiveFilters && loadingYearLeagueEvents);

  const handlePreviousMonth = () => {
    setMonthDate((currentMonthDate) => subMonths(currentMonthDate, 1));
  };

  const handleNextMonth = () => {
    setMonthDate((currentMonthDate) => addMonths(currentMonthDate, 1));
  };

  const handleSelectedDateChange = (date: Date) => {
    setSelectedDate(date);

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

  return (
    <LeagueCalendarPageView
      loading={loadingWithFilters}
      monthDate={monthDate}
      selectedDate={selectedDate}
      calendarDays={calendarDays}
      leagueEventsByDate={leagueEventsByDate}
      leagueEvents={leagueEvents}
      filteredLeagueEvents={filteredLeagueEvents}
      athleticsFilterOptions={athleticsFilterOptions}
      athleticFilter={athleticFilter}
      allAthleticsFilter={ALL_ATHLETICS_FILTER}
      eventTypeFilter={eventTypeFilter}
      allEventTypesFilter={ALL_EVENT_TYPES_FILTER}
      eventSearch={eventSearch}
      hasActiveFilters={hasActiveFilters}
      onPreviousMonth={handlePreviousMonth}
      onNextMonth={handleNextMonth}
      onSelectedDateChange={handleSelectedDateChange}
      onAthleticFilterChange={setAthleticFilter}
      onEventTypeFilterChange={handleEventTypeFilterChange}
      onEventSearchChange={setEventSearch}
    />
  );
}
