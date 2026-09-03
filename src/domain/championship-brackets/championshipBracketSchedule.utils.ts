import type {
  BracketDayBreak,
  BracketDayCourtOption,
  BracketDayLocationOption,
  BracketDaySchedule,
} from "@/domain/championship-brackets/championshipBracket.types";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return value != null && typeof value == "object" && !Array.isArray(value);
}

function resolveString(value: unknown): string | null {
  return typeof value == "string" && value.trim() ? value : null;
}

function resolveNumber(value: unknown): number | null {
  return typeof value == "number" && Number.isFinite(value) ? value : null;
}

function resolveArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

interface SnapshotCourt {
  id: string | null;
  name: string | null;
  position: number | null;
}

interface SnapshotLocation {
  id: string | null;
  name: string | null;
  position: number | null;
  courts: SnapshotCourt[];
}

interface SnapshotResourceLock {
  date: string;
  start_time: string;
  end_time: string;
  location_key: string | null;
  court_key: string | null;
  location_name: string | null;
  court_name: string | null;
  lock_mode: string | null;
  sport_id: string | null;
  naipe: string | null;
  division: string | null;
}

interface SnapshotScheduleDay {
  date: string;
  locations: SnapshotLocation[];
}

function resolveSnapshotScheduleDays(payloadSnapshot: unknown): SnapshotScheduleDay[] {
  if (!isRecord(payloadSnapshot)) return [];

  return resolveArray(payloadSnapshot.schedule_days).flatMap((day) => {
    if (!isRecord(day)) return [];
    const date = resolveString(day.date);
    if (!date) return [];

    return [{
      date,
      locations: resolveArray(day.locations).flatMap((location) => {
        if (!isRecord(location)) return [];
        return [{
          id: resolveString(location.id),
          name: resolveString(location.name),
          position: resolveNumber(location.position),
          courts: resolveArray(location.courts).flatMap((court) => {
            if (!isRecord(court)) return [];
            return [{
              id: resolveString(court.id),
              name: resolveString(court.name),
              position: resolveNumber(court.position),
            }];
          }),
        }];
      }),
    }];
  });
}

function resolveSnapshotResourceLocks(payloadSnapshot: unknown): SnapshotResourceLock[] {
  if (!isRecord(payloadSnapshot)) return [];

  return resolveArray(payloadSnapshot.resource_locks).flatMap((resourceLock) => {
    if (!isRecord(resourceLock)) return [];
    const date = resolveString(resourceLock.date);
    const startTime = resolveString(resourceLock.start_time);
    const endTime = resolveString(resourceLock.end_time);

    if (!date || !startTime || !endTime) return [];

    return [{
      date,
      start_time: startTime,
      end_time: endTime,
      location_key: resolveString(resourceLock.location_key),
      court_key: resolveString(resourceLock.court_key),
      location_name: resolveString(resourceLock.location_name),
      court_name: resolveString(resourceLock.court_name),
      lock_mode: resolveString(resourceLock.lock_mode),
      sport_id: resolveString(resourceLock.sport_id),
      naipe: resolveString(resourceLock.naipe),
      division: resolveString(resourceLock.division),
    }];
  });
}

function isGenericManualCourtResourceLock(resourceLock: SnapshotResourceLock): boolean {
  return (
    resourceLock.lock_mode === "HARD" &&
    resourceLock.sport_id == null &&
    resourceLock.naipe == null &&
    resourceLock.division == null
  );
}

function resolveSnapshotCourtId({
  locations,
  snapshotDay,
  resourceLock,
}: {
  locations: BracketDayLocationOption[];
  snapshotDay: SnapshotScheduleDay | null;
  resourceLock: SnapshotResourceLock;
}): string | null {
  const snapshotLocation = snapshotDay?.locations.find(
    (location) => location.id === resourceLock.location_key,
  ) ?? null;
  const location = locations.find(
    (currentLocation) => currentLocation.location_group_id === resourceLock.location_key,
  ) ?? locations.find(
    (currentLocation) =>
      snapshotLocation?.position != null &&
      currentLocation.position === snapshotLocation.position,
  ) ?? locations.find(
    (currentLocation) =>
      normalizeName(currentLocation.name) ===
      normalizeName(snapshotLocation?.name ?? resourceLock.location_name),
  );

  if (!location) return null;

  const snapshotCourt = snapshotLocation?.courts.find(
    (court) => court.id === resourceLock.court_key,
  ) ?? null;
  const court = location.courts.find(
    (currentCourt) => currentCourt.court_group_id === resourceLock.court_key,
  ) ?? location.courts.find(
    (currentCourt) =>
      snapshotCourt?.position != null && currentCourt.position === snapshotCourt.position,
  ) ?? location.courts.find(
    (currentCourt) =>
      normalizeName(currentCourt.name) ===
      normalizeName(snapshotCourt?.name ?? resourceLock.court_name),
  );

  return court?.id ?? null;
}

export function resolveBracketDaySchedules(
  rawDays: unknown[],
  payloadSnapshot: unknown,
): BracketDaySchedule[] {
  const snapshotScheduleDays = resolveSnapshotScheduleDays(payloadSnapshot);
  const snapshotResourceLocks = resolveSnapshotResourceLocks(payloadSnapshot);

  return rawDays.flatMap((day) => {
    if (!isRecord(day)) return [];
    const id = resolveString(day.id);
    const eventDate = resolveString(day.event_date);
    const startTime = resolveString(day.start_time);
    const endTime = resolveString(day.end_time);
    if (!id || !eventDate || !startTime || !endTime) return [];

    const locations = resolveArray(day.championship_bracket_locations)
      .flatMap((location) => {
        if (!isRecord(location)) return [];
        const locationId = resolveString(location.id);
        const locationGroupId = resolveString(location.location_group_id);
        const locationName = resolveString(location.name);
        const position = resolveNumber(location.position);
        if (!locationId || !locationGroupId || !locationName || position == null) return [];

        const courts = resolveArray(location.championship_bracket_courts)
          .flatMap((court) => {
            if (!isRecord(court)) return [];
            const courtId = resolveString(court.id);
            const courtGroupId = resolveString(court.court_group_id);
            const courtName = resolveString(court.name);
            const courtPosition = resolveNumber(court.position);
            if (!courtId || !courtGroupId || !courtName || courtPosition == null) return [];

            return [{
              id: courtId,
              court_group_id: courtGroupId,
              name: courtName,
              position: courtPosition,
              location_name: locationName,
              label: `${locationName} • ${courtName}`,
            } satisfies BracketDayCourtOption];
          })
          .sort((leftCourt, rightCourt) => leftCourt.position - rightCourt.position);

        return [{
          id: locationId,
          location_group_id: locationGroupId,
          name: locationName,
          position,
          courts,
        } satisfies BracketDayLocationOption];
      })
      .sort((leftLocation, rightLocation) => leftLocation.position - rightLocation.position);

    const databaseBreaks = resolveArray(day.championship_bracket_day_breaks)
      .flatMap((dayBreak) => {
        if (!isRecord(dayBreak)) return [];
        const breakId = resolveString(dayBreak.id);
        const breakStartTime = resolveString(dayBreak.break_start_time);
        const breakEndTime = resolveString(dayBreak.break_end_time);
        if (!breakId || !breakStartTime || !breakEndTime) return [];

        return [{
          id: breakId,
          bracket_day_id: resolveString(dayBreak.bracket_day_id) ?? id,
          break_start_time: breakStartTime,
          break_end_time: breakEndTime,
          position: resolveNumber(dayBreak.position) ?? 1,
          scope_type: dayBreak.scope_type === "COURT" ? "COURT" : "ALL_COURTS",
          bracket_court_id: resolveString(dayBreak.bracket_court_id),
        } satisfies BracketDayBreak];
      })
      .sort((leftBreak, rightBreak) => leftBreak.position - rightBreak.position);

    const breaks = [...databaseBreaks];
    const hasGeneralBreak = breaks.some((dayBreak) => dayBreak.scope_type === "ALL_COURTS");
    const legacyBreakStartTime = resolveString(day.break_start_time);
    const legacyBreakEndTime = resolveString(day.break_end_time);

    if (!hasGeneralBreak && legacyBreakStartTime && legacyBreakEndTime) {
      breaks.push({
        id: `legacy:${id}`,
        bracket_day_id: id,
        break_start_time: legacyBreakStartTime,
        break_end_time: legacyBreakEndTime,
        position: breaks.length + 1,
        scope_type: "ALL_COURTS",
        bracket_court_id: null,
      });
    }

    const databaseCourtIds = new Set(
      breaks
        .filter((dayBreak) => dayBreak.scope_type === "COURT")
        .map((dayBreak) => dayBreak.bracket_court_id)
        .filter((courtId): courtId is string => courtId != null),
    );
    const snapshotDay = snapshotScheduleDays.find((scheduleDay) => scheduleDay.date === eventDate) ?? null;
    const existingResourceLockKeys = new Set(
      breaks.map((dayBreak) => [
        dayBreak.bracket_court_id ?? "ALL_COURTS",
        dayBreak.break_start_time,
        dayBreak.break_end_time,
      ].join("::")),
    );

    snapshotResourceLocks
      .filter(
        (resourceLock) =>
          resourceLock.date === eventDate &&
          isGenericManualCourtResourceLock(resourceLock),
      )
      .forEach((resourceLock) => {
        const courtId = resolveSnapshotCourtId({
          locations,
          snapshotDay,
          resourceLock,
        });
        if (!courtId || databaseCourtIds.has(courtId)) return;

        const resourceLockKey = [
          courtId,
          resourceLock.start_time,
          resourceLock.end_time,
        ].join("::");
        if (existingResourceLockKeys.has(resourceLockKey)) return;

        existingResourceLockKeys.add(resourceLockKey);
        breaks.push({
          id: `snapshot:${id}:${resourceLockKey}`,
          bracket_day_id: id,
          break_start_time: resourceLock.start_time,
          break_end_time: resourceLock.end_time,
          position: breaks.length + 1,
          scope_type: "COURT",
          bracket_court_id: courtId,
          resource_lock: {
            date: resourceLock.date,
            start_time: resourceLock.start_time,
            end_time: resourceLock.end_time,
            location_group_id: resourceLock.location_key,
            court_group_id: resourceLock.court_key,
          },
        });
      });

    return [{
      id,
      event_date: eventDate,
      start_time: startTime,
      end_time: endTime,
      breaks,
      courts: locations.flatMap((location) => location.courts),
      locations,
    }];
  });
}
