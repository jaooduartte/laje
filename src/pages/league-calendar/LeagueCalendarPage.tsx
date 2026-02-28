import { useMemo, useState } from "react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { useLeagueEvents } from "@/hooks/useLeagueEvents";
import { LeagueCalendarPageView } from "@/pages/league-calendar/LeagueCalendarPageView";
import { isLeagueEventType } from "@/domain/league-events/leagueEvent.constants";

const ALL_ATHLETICS_FILTER = "ALL_ATHLETICS";
const ALL_EVENT_TYPES_FILTER = "ALL_EVENT_TYPES";

export function LeagueCalendarPage() {
  const [monthDate, setMonthDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { leagueEvents, loading } = useLeagueEvents({ monthDate });
  const [athleticFilter, setAthleticFilter] = useState<string>(ALL_ATHLETICS_FILTER);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>(ALL_EVENT_TYPES_FILTER);
  const [eventSearch, setEventSearch] = useState("");

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

    leagueEvents.forEach((leagueEvent) => {
      if (!leagueEvent.organizer_team_id || !leagueEvent.organizer_team?.name) {
        return;
      }

      athleticsById.set(leagueEvent.organizer_team_id, leagueEvent.organizer_team.name);
    });

    return [...athleticsById.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((firstAthletic, secondAthletic) => firstAthletic.name.localeCompare(secondAthletic.name));
  }, [leagueEvents]);

  const filteredLeagueEvents = useMemo(() => {
    const normalizedSearch = eventSearch.trim().toLowerCase();

    return leagueEvents
      .filter((leagueEvent) => {
        if (athleticFilter != ALL_ATHLETICS_FILTER && leagueEvent.organizer_team_id != athleticFilter) {
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
  }, [athleticFilter, eventSearch, eventTypeFilter, leagueEvents]);

  const hasActiveFilters =
    athleticFilter != ALL_ATHLETICS_FILTER ||
    eventTypeFilter != ALL_EVENT_TYPES_FILTER ||
    eventSearch.trim().length > 0;

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
      loading={loading}
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
