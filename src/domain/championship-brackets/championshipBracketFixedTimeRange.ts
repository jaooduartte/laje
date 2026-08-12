import { ChampionshipSchedulePeriod } from "@/lib/enums";

export interface ChampionshipBracketScheduleDayTimeContext {
  start_time: string;
  end_time: string;
  break_start_time: string | null;
  break_end_time: string | null;
}

export interface ChampionshipBracketResolvedTimeInterval {
  start: number;
  end: number;
}

export function resolveTimeValueToMinutes(
  timeValue: string | null | undefined,
): number | null {
  if (!timeValue) {
    return null;
  }

  const [hourValue, minuteValue] = timeValue.split(":").map(Number);

  if (Number.isNaN(hourValue) || Number.isNaN(minuteValue)) {
    return null;
  }

  if (hourValue < 0 || hourValue > 23 || minuteValue < 0 || minuteValue > 59) {
    return null;
  }

  return hourValue * 60 + minuteValue;
}

export function resolveMinutesToTimeValue(minutes: number): string {
  const safeMinutes = Math.max(0, Math.trunc(minutes));
  const hourValue = Math.floor(safeMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minuteValue = (safeMinutes % 60).toString().padStart(2, "0");

  return `${hourValue}:${minuteValue}`;
}

export function resolveScheduleDayInterval(
  scheduleDay: ChampionshipBracketScheduleDayTimeContext,
): ChampionshipBracketResolvedTimeInterval | null {
  const startMinutes = resolveTimeValueToMinutes(scheduleDay.start_time);
  const endMinutes = resolveTimeValueToMinutes(scheduleDay.end_time);

  if (
    startMinutes == null ||
    endMinutes == null ||
    endMinutes <= startMinutes
  ) {
    return null;
  }

  return {
    start: startMinutes,
    end: endMinutes,
  };
}

export function resolveScheduleDayBreakInterval(
  scheduleDay: ChampionshipBracketScheduleDayTimeContext,
): ChampionshipBracketResolvedTimeInterval | null {
  const hasBreakStart = (scheduleDay.break_start_time ?? "").trim() != "";
  const hasBreakEnd = (scheduleDay.break_end_time ?? "").trim() != "";

  if (!hasBreakStart && !hasBreakEnd) {
    return null;
  }

  if (hasBreakStart != hasBreakEnd) {
    return null;
  }

  const dayInterval = resolveScheduleDayInterval(scheduleDay);
  const breakStartMinutes = resolveTimeValueToMinutes(
    scheduleDay.break_start_time,
  );
  const breakEndMinutes = resolveTimeValueToMinutes(scheduleDay.break_end_time);

  if (
    !dayInterval ||
    breakStartMinutes == null ||
    breakEndMinutes == null ||
    breakEndMinutes <= breakStartMinutes ||
    breakStartMinutes < dayInterval.start ||
    breakEndMinutes > dayInterval.end
  ) {
    return null;
  }

  return {
    start: breakStartMinutes,
    end: breakEndMinutes,
  };
}

export function resolveLegacySchedulePeriodInterval(
  scheduleDay: ChampionshipBracketScheduleDayTimeContext,
  period: ChampionshipSchedulePeriod,
): ChampionshipBracketResolvedTimeInterval | null {
  const dayInterval = resolveScheduleDayInterval(scheduleDay);

  if (!dayInterval) {
    return null;
  }

  const breakInterval = resolveScheduleDayBreakInterval(scheduleDay);
  const dayMiddleAt =
    dayInterval.start + (dayInterval.end - dayInterval.start) / 2;

  if (period == ChampionshipSchedulePeriod.MATUTINO) {
    const periodEnd = breakInterval?.start ?? dayMiddleAt;

    if (periodEnd <= dayInterval.start) {
      return null;
    }

    return {
      start: dayInterval.start,
      end: periodEnd,
    };
  }

  const periodStart = breakInterval?.end ?? dayMiddleAt;

  if (periodStart >= dayInterval.end) {
    return null;
  }

  return {
    start: periodStart,
    end: dayInterval.end,
  };
}

export function resolveFixedTimeRangeInterval({
  scheduleDay,
  start_time,
  end_time,
}: {
  scheduleDay: ChampionshipBracketScheduleDayTimeContext;
  start_time: string | null | undefined;
  end_time: string | null | undefined;
}): ChampionshipBracketResolvedTimeInterval | null {
  const dayInterval = resolveScheduleDayInterval(scheduleDay);
  const startMinutes = resolveTimeValueToMinutes(start_time);
  const endMinutes = resolveTimeValueToMinutes(end_time);

  if (
    !dayInterval ||
    startMinutes == null ||
    endMinutes == null ||
    endMinutes <= startMinutes ||
    startMinutes < dayInterval.start ||
    endMinutes > dayInterval.end
  ) {
    return null;
  }

  const breakInterval = resolveScheduleDayBreakInterval(scheduleDay);

  if (
    breakInterval &&
    startMinutes < breakInterval.end &&
    endMinutes > breakInterval.start
  ) {
    return null;
  }

  return {
    start: startMinutes,
    end: endMinutes,
  };
}

export function resolveLegacyPeriodTimeRange({
  scheduleDay,
  period,
}: {
  scheduleDay: ChampionshipBracketScheduleDayTimeContext;
  period: ChampionshipSchedulePeriod;
}): { start_time: string; end_time: string } | null {
  const interval = resolveLegacySchedulePeriodInterval(scheduleDay, period);

  if (!interval) {
    return null;
  }

  return {
    start_time: resolveMinutesToTimeValue(interval.start),
    end_time: resolveMinutesToTimeValue(interval.end),
  };
}

export function resolveLegacyPeriodForFixedTimeRange({
  scheduleDay,
  start_time,
  end_time,
}: {
  scheduleDay: ChampionshipBracketScheduleDayTimeContext;
  start_time: string;
  end_time: string;
}): ChampionshipSchedulePeriod | null {
  const interval = resolveFixedTimeRangeInterval({
    scheduleDay,
    start_time,
    end_time,
  });

  if (!interval) {
    return null;
  }

  const matutinoInterval = resolveLegacySchedulePeriodInterval(
    scheduleDay,
    ChampionshipSchedulePeriod.MATUTINO,
  );

  if (
    matutinoInterval &&
    interval.start >= matutinoInterval.start &&
    interval.end <= matutinoInterval.end
  ) {
    return ChampionshipSchedulePeriod.MATUTINO;
  }

  const vespertinoInterval = resolveLegacySchedulePeriodInterval(
    scheduleDay,
    ChampionshipSchedulePeriod.VESPERTINO,
  );

  if (
    vespertinoInterval &&
    interval.start >= vespertinoInterval.start &&
    interval.end <= vespertinoInterval.end
  ) {
    return ChampionshipSchedulePeriod.VESPERTINO;
  }

  return null;
}

export function resolveTimeIntervalsOverlap(
  left: ChampionshipBracketResolvedTimeInterval,
  right: ChampionshipBracketResolvedTimeInterval,
): boolean {
  return left.start < right.end && right.start < left.end;
}
